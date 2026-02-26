# Architecture Patterns: ObservAgent

**Domain:** Real-time AI agent observability (Claude Code specific)
**Researched:** 2026-02-26
**Overall confidence:** HIGH

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code Process                          │
│   (top-level + Task-spawned sub-agents, separate processes)        │
│                                                                     │
│   Hook: PreToolUse / PostToolUse / Stop / SubagentStop             │
│      │ (shell command, stdin receives JSON event)                   │
└──────┼──────────────────────────────────────────────────────────────┘
       │ stdin JSON payload
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Hook Relay (hook-relay.js)                        │
│  Thin Node CLI: reads stdin, POSTs to server, exits fast            │
│  Must complete in <500ms — Claude Code waits for hook exit          │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ HTTP POST /api/events
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│              ObservAgent Server (Node.js / Fastify)                  │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐ │
│  │  Event Ingestion │  │  JSONL Watcher  │  │   SSE Event Bus      │ │
│  │  (POST /events) │  │  (fs.watch +    │  │   (in-memory Map     │ │
│  │  202 immediate  │  │   byte-offset)  │  │    of clients)       │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬───────────┘ │
│           │                   │                        │             │
│           └──────────┬────────┘                        │             │
│                      │ normalized AgentEvent           │             │
│                      ▼                                 │             │
│           ┌──────────────────────┐                     │             │
│           │   SQLite (WAL mode)  │ ──── query ────────►│             │
│           │   (better-sqlite3)   │◄─── write ──────────┤             │
│           └──────────────────────┘                                   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │               REST API (GET /agents, /sessions, /events)        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                       │ SSE stream (GET /stream)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Browser Dashboard (Vanilla JS)                   │
│   EventSource → live agent tree, token meters, cost counter,        │
│   health indicators                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Hook Relay** | Read hook stdin JSON, HTTP POST to server, exit fast | Server (HTTP POST /api/events) |
| **Event Ingestion** | Validate, normalize, persist hook events | SQLite, SSE Event Bus |
| **JSONL Watcher** | Tail `~/.claude/projects/**/*.jsonl` for new lines, parse token/cost fields | SQLite, SSE Event Bus |
| **SQLite Store** | Persist events, agents, sessions, token totals | Event Ingestion, JSONL Watcher, REST API |
| **SSE Event Bus** | Fan out events to all connected dashboard clients | Browser Dashboard |
| **REST API** | Serve historical data on page load / manual query | Browser Dashboard |
| **Browser Dashboard** | Render agent tree, live metrics, health indicators | SSE stream (live), REST API (history) |

---

## Data Flow

### Path 1: Real-time hook events

```
Claude Code fires hook
  → Hook Relay reads stdin JSON
  → HTTP POST /api/events → 202 Accepted immediately
  → Event Ingestion normalizes to AgentEvent (async via setImmediate)
  → Write to SQLite (events table, upsert sessions table)
  → Publish to SSE Event Bus
  → All connected EventSource clients receive JSON message
  → Dashboard updates agent tree / health indicators
```

### Path 2: Token and cost data (JSONL)

```
Claude Code writes to ~/.claude/projects/<project-hash>/<session-id>.jsonl
  → JSONL Watcher detects new bytes (fs.watch FSEvents on macOS)
  → readline streams new lines from last known byte offset
  → Parse entries with type "assistant" and usage fields
  → Extract: input_tokens, output_tokens, cache_read, cache_write
  → Compute cost using Anthropic pricing constants
  → Write to SQLite (token_snapshots, update sessions.total_cost)
  → Publish cost_update SSE event → Dashboard updates cost counters
```

### Path 3: Dashboard initial load

```
Browser loads dashboard
  → GET /api/agents (agent tree snapshot)
  → GET /api/sessions (active sessions with costs)
  → Open EventSource GET /stream
  → All future updates arrive via SSE
```

---

## Key Implementation Details

### Hook Relay (hook-relay.js)

```javascript
// Minimal, no deps, fast
const http = require('http');
let body = '';
process.stdin.on('data', d => body += d);
process.stdin.on('end', () => {
  const req = http.request({
    hostname: 'localhost', port: 3131,
    path: '/api/events', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, () => process.exit(0));
  req.on('error', () => process.exit(0)); // NEVER block Claude Code
  req.write(body); req.end();
});
```

### JSONL Watcher — byte-offset tail

```javascript
// Track last read position per file
const offsets = new Map(); // filePath -> byteOffset

function readNewLines(filePath, sessionId) {
  const stat = fs.statSync(filePath);
  const offset = offsets.get(filePath) ?? 0;
  if (stat.size <= offset) return;

  const stream = fs.createReadStream(filePath, { start: offset, end: stat.size - 1 });
  const rl = readline.createInterface({ input: stream });
  rl.on('line', line => {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant' && entry.message?.usage) {
        processTokenEntry(sessionId, entry);
      }
    } catch {} // partial line — will retry on next change event
  });
  rl.on('close', () => offsets.set(filePath, stat.size));
}
```

### Agent Hierarchy Tracking

JSONL and hooks don't contain explicit parent-child links. Best available approach:

```javascript
// When parent fires PreToolUse with tool_name === "Task":
pendingTasks.set(taskKey, {
  parentSessionId,
  prompt: toolInput.prompt?.slice(0, 200),
  cwd,
  startedAt: Date.now()
});

// When a new session_id appears:
// Match to pending task by cwd + started within 5s window
// Set sessions.parent_session_id = match.parentSessionId
```

**Important:** Check whether `SubagentStop` hook includes child `session_id` in payload — if it does, this eliminates the inference problem entirely.

### SSE Event Bus

```javascript
const clients = new Map(); // clientId -> Response

function broadcast(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of clients) {
    try { res.write(payload); }
    catch { clients.delete(id); }
  }
}

// Heartbeat keeps proxies alive and detects stale connections
setInterval(() => {
  for (const [id, res] of clients) {
    try { res.write(': heartbeat\n\n'); }
    catch { clients.delete(id); }
  }
}, 30_000);
```

---

## SQLite Schema

```sql
CREATE TABLE sessions (
  session_id          TEXT PRIMARY KEY,
  parent_session_id   TEXT REFERENCES sessions(session_id),
  project_path        TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  started_at          INTEGER NOT NULL,
  last_event_at       INTEGER NOT NULL,
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd      REAL NOT NULL DEFAULT 0.0,
  context_tokens_used INTEGER,
  context_tokens_max  INTEGER
);

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES sessions(session_id),
  hook_type           TEXT NOT NULL,
  tool_name           TEXT,
  tool_input_summary  TEXT,  -- truncated to 500 chars
  timestamp           INTEGER NOT NULL,
  raw_json            TEXT NOT NULL
);

CREATE TABLE token_snapshots (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(session_id),
  message_id            TEXT NOT NULL,
  model                 TEXT NOT NULL,
  input_tokens          INTEGER NOT NULL DEFAULT 0,
  output_tokens         INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd              REAL NOT NULL DEFAULT 0.0,
  timestamp             INTEGER NOT NULL,
  UNIQUE(session_id, message_id)  -- prevent double-counting on re-read
);

-- Indexes
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_token_snapshots_session ON token_snapshots(session_id);
CREATE INDEX idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
```

**Agent tree query (recursive CTE):**

```sql
WITH RECURSIVE tree AS (
  SELECT *, 0 AS depth FROM sessions WHERE parent_session_id IS NULL
  UNION ALL
  SELECT s.*, t.depth + 1 FROM sessions s
  JOIN tree t ON s.parent_session_id = t.session_id
)
SELECT * FROM tree ORDER BY depth, started_at;
```

---

## Suggested Build Order

```
1. SQLite schema + db module
       ↓
2. Event Ingestion (POST /api/events) + Hook Relay script
       ↓  validates ingestion pipeline end-to-end
3. SSE Event Bus + broadcast()
       ↓  events flow: hook → server → browser
4. Basic dashboard (EventSource, log events to table)
       ↓  proves full pipeline before adding complexity
5. JSONL Watcher (token/cost parsing)
6. Agent hierarchy tracking (session correlation)
7. Dashboard agent tree + health indicators
8. REST API for historical queries
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|---|---|---|
| Synchronous DB work before 202 | Blocks Hook Relay → blocks Claude | 202 immediately, process in setImmediate |
| Re-parsing full JSONL on every change | O(n) grows with session length | Byte-offset tail |
| Storing full tool input in events table | Read tool input can be 50KB+ | Truncate to 500 chars |
| Polling SQLite for SSE updates | CPU waste at scale | SSE push eliminates polling |
| Multiple concurrent async SQLite writes | SQLITE_BUSY under parallel agents | WAL mode + single write queue |

---

## Open Questions (verify before build)

1. Exact JSONL entry schema for usage fields — verify by inspecting `~/.claude/projects/` directly
2. Whether `SubagentStop` hook includes child `session_id` — if yes, eliminates correlation inference
3. Whether `fs.watch` recursive (Node 20+) is reliable on macOS or chokidar is needed
4. Maximum hook timeout enforced by Claude Code (assumed <500ms)

---
*Research completed: 2026-02-26*
