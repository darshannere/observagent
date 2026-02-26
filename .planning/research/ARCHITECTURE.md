# Architecture Research

**Domain:** Real-time AI agent observability (Claude Code-specific, v1.1 features)
**Researched:** 2026-02-26
**Confidence:** HIGH — Based on direct inspection of existing codebase, live JSONL files, and hook payload schemas confirmed by relay.py comments.

---

## Existing Architecture (v1.0 Baseline)

This document focuses on how v1.1 features integrate with what already exists. Understanding the baseline is required before mapping integrations.

### What Currently Exists

```
Claude Code Process
  PreToolUse / PostToolUse hook
      |
      | stdin JSON payload
      v
hooks/relay.py                         (Python stdlib only, fire-and-forget)
  reads stdin, POSTs to /ingest, exits 0
      |
      | HTTP POST
      v
server.js (Fastify 5.7.4)
  |
  ├── routes/ingest.js                 (POST /ingest)
  |     202 immediately → setImmediate → writeQueue.enqueue() + broadcast()
  |
  ├── routes/sse.js                    (GET /events)
  |     SSE stream, fastify-sse-v2 plugin
  |
  ├── routes/api.js                    (GET /api/events)
  |     Historical events, DESC limit 200
  |
  └── routes/dashboard.js             (GET /)
        Serves public/index.html (inline vanilla JS)
      |
      |
lib/writeQueue.js                      (single writer pattern, setImmediate drain)
lib/sseClients.js                      (Set<reply>, broadcast())
      |
      v
db/schema.js                           (better-sqlite3 12.x, WAL mode)
  TABLE: events
    id           INTEGER PRIMARY KEY AUTOINCREMENT
    tool_name    TEXT
    hook_type    TEXT
    session_id   TEXT
    tool_call_id TEXT
    timestamp    INTEGER
    duration_ms  INTEGER
    exit_status  INTEGER

public/index.html                      (inline vanilla JS + CSS, no build step)
  - 2x2 grid layout (Tool Call Log | Agent Tree placeholder | Cost Meters placeholder | Health placeholder)
  - EventSource /events for live SSE
  - fetch /api/events for history hydration
  - Per-session grouping via <details> accordion
  - In-progress row animation with 60s stuck detection
```

### What the Current Schema is Missing

The v1.1 features require schema additions. The existing `events` table is minimal and flat:
- No `sessions` table — session data lives only as distinct `session_id` values in events
- No `token_snapshots` table — no JSONL parsing exists yet
- No `agent_id` or `parent_session_id` — no hierarchy linkage
- No `raw_json` column — tool input summary not stored
- No indexes beyond the implicit primary key

---

## Verified Data Sources (Live Inspection)

### JSONL Entry Schema (confirmed — Claude Code 2.1.59)

The JSONL files at `~/.claude/projects/<project-hash>/<session-id>.jsonl` contain mixed entry types. Cost/token data lives exclusively in `assistant` entries:

```javascript
// assistant entry — the only type with token data
{
  "type": "assistant",
  "sessionId": "353e93eb-bbc7-4641-bb31-ebc47eb1111b",   // session UUID
  "uuid": "15358d26-5b15-43d6-ab34-7e8db165ee69",        // message UUID
  "parentUuid": "f7fa156c-194d-486d-821b-c00a494de3cf",  // parent MSG uuid (not session)
  "timestamp": "2026-02-26T07:38:33.000Z",               // ISO 8601
  "cwd": "/Users/darshannere/claude/observagent",
  "version": "2.1.59",
  "gitBranch": "HEAD",
  "requestId": "req_011CYW8bXdCWiMQGkdQTs5GZ",
  "message": {
    "id": "msg_01UyCwt1o3tkFpzCDqcEEFkE",               // Anthropic message ID
    "model": "claude-sonnet-4-6",                        // model string
    "role": "assistant",
    "type": "message",
    "stop_reason": "end_turn",
    "usage": {
      "input_tokens": 3,
      "output_tokens": 8,
      "cache_creation_input_tokens": 6191,               // billed at higher rate
      "cache_read_input_tokens": 25354,                  // billed at lower rate
      "cache_creation": {
        "ephemeral_5m_input_tokens": 6191,
        "ephemeral_1h_input_tokens": 0
      },
      "service_tier": "standard",
      "inference_geo": "not_available"
    }
  }
}
```

Other JSONL entry types (relevant to know, not for cost parsing): `user`, `system`, `progress`, `file-history-snapshot`, `queue-operation`.

System entries contain `subtype: "turn_duration"` and `durationMs` — useful metadata but not token data.

### Hook Payload Schema (confirmed — relay.py live inspection)

```
PreToolUse / PostToolUse payload fields:
  session_id, transcript_path, cwd, permission_mode,
  hook_event_name, tool_name, tool_use_id, tool_input, tool_response

StatusLine hook payload (different hook type):
  model, workspace, session_id,
  context_window.remaining_percentage   ← context fill data lives here

SubagentStop hook payload — NOT yet verified (requires live test)
  Likely contains: session_id (of the parent that spawned it)
  May or may not contain: child session_id
  Action: add SubagentStop to settings.json → relay.py → log raw payload first before building hierarchy logic
```

### Models Observed in Real Sessions

From live JSONL inspection: `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929`, `claude-opus-4-6`, `claude-opus-4-5-20251101`, `claude-haiku-4-5-20251001`. The cost computation must handle all of these plus unknown future models — rates must be configurable, not hardcoded constants.

### Agent Hierarchy Linking (verified gap)

The JSONL `parentUuid` field links message nodes within a single session transcript — it is not a cross-session parent reference. It cannot be used to establish Task tool spawn hierarchy.

The only reliable cross-session linkage mechanism confirmed through inspection:
1. The `PreToolUse` hook fires in the parent session context with the parent's `session_id`
2. When the Task tool fires, the `tool_input.prompt` and `tool_input.description` are available in the hook payload
3. Child sessions start with the same `cwd` as the parent
4. Child session start timestamps align with the parent's Task tool invocation timestamp

This means hierarchy correlation requires: capture `PreToolUse` on Task tool → store `{parentSessionId, cwd, startedAt, toolUseId}` → when a new session JSONL appears with matching `cwd` within a 10s window → link it as a child.

**SubagentStop** may provide cleaner linkage if its payload includes child session_id — but this is unverified. The fallback (cwd + time window) is the safe implementation path.

---

## System Overview: v1.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Claude Code Process(es)                             │
│  Top-level + Task-spawned sub-agents (separate OS processes)           │
│                                                                         │
│  Hooks: PreToolUse / PostToolUse / SubagentStop (new)                  │
│    sessionId, cwd, tool_name, tool_use_id in every payload             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ stdin JSON
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    hooks/relay.py  [MODIFIED]                           │
│  Existing: PreToolUse, PostToolUse forwarding                           │
│  New:      SubagentStop hook type → forward with hook_type='SubagentStop'│
│            context_window fields forwarded from statusLine bridge file   │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTP POST /ingest
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│               ObservAgent Server (Fastify 5.7.4)                        │
│                                                                          │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌────────────────┐  │
│  │  routes/ingest.js   │  │  lib/jsonlWatcher.js  │  │ lib/sseClients │  │
│  │  [MODIFIED]         │  │  [NEW]                │  │  [UNCHANGED]   │  │
│  │                     │  │                       │  │                │  │
│  │ + sessions upsert   │  │ chokidar 4.x watches  │  │ Set<reply>     │  │
│  │ + parent detection  │  │ ~/.claude/projects/   │  │ broadcast()    │  │
│  │   (Task PreToolUse) │  │ byte-offset tail       │  │                │  │
│  │ + SubagentStop      │  │ parses assistant{}    │  │                │  │
│  │   hierarchy link    │  │ computes cost_usd     │  │                │  │
│  └──────────┬──────────┘  └──────────┬────────────┘  └───────┬────────┘  │
│             │                        │                        │           │
│             └────────────────────────┤                        │           │
│                                      │ normalized events      │           │
│                                      ▼                        │           │
│                        ┌─────────────────────────┐            │           │
│                        │  db/schema.js [MODIFIED] │◄──────────┘           │
│                        │  better-sqlite3, WAL     │  SSE push after write  │
│                        │                          │                        │
│  NEW tables:           │  events (existing)       │                        │
│  sessions              │  sessions (new)          │                        │
│  token_snapshots       │  token_snapshots (new)   │                        │
│                        └──────────────────────────┘                        │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                  routes/api.js  [MODIFIED]                           │  │
│  │  Existing: GET /api/events                                           │  │
│  │  New: GET /api/sessions   (session list with cost rollup)            │  │
│  │       GET /api/agents     (agent tree — recursive CTE)               │  │
│  │       GET /api/export     (session JSONL/CSV download)               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                  bin/cli.js  [NEW]                                   │  │
│  │  npx observagent init   — writes hooks to ~/.claude/settings.json   │  │
│  │  npx observagent start  — starts server, opens browser              │  │
│  │  npx observagent doctor — validates setup                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                               │ SSE stream (GET /events — unchanged URL)
                               │ REST (GET /api/*)
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│               public/index.html  [MODIFIED — major expansion]           │
│                                                                          │
│  Existing: Tool Call Log panel (session-grouped, live + history)        │
│                                                                          │
│  New panels:                                                             │
│  ├── Agent Tree panel (recursive HTML tree, live cost per node)         │
│  ├── Cost Meters panel (per-session bars, live token counter)           │
│  ├── Gantt Timeline panel (horizontal swimlanes per session)            │
│  └── Session History panel (filterable table, export button)           │
│                                                                          │
│  New SSE event types handled:                                            │
│  ├── cost_update    (token_snapshots written)                            │
│  ├── session_new    (new session detected)                              │
│  ├── session_end    (SubagentStop / Stop fired)                         │
│  └── agent_stuck    (no events for >60s, surfaced as warning)           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### What Gets Modified

| Component | Current State | v1.1 Changes |
|-----------|--------------|--------------|
| `hooks/relay.py` | Handles PreToolUse, PostToolUse | Add SubagentStop to hook config; relay passes `hook_type='SubagentStop'`. Also consider forwarding `context_window` data read from the `/tmp/claude-ctx-{session}.json` bridge file. |
| `db/schema.js` | Single `events` table | Add `sessions` and `token_snapshots` tables. Add `agent_id` and `tool_input_summary` columns to `events`. Add all indexes. |
| `lib/writeQueue.js` | One prepared statement for events | Needs multiple prepared statements: events insert, sessions upsert, token_snapshots insert. Simplest approach: pass the specific statement to `enqueue()` rather than assuming a single stmt. |
| `routes/ingest.js` | Normalizes event, writes to queue | Add sessions upsert on every event. Detect Task tool `PreToolUse` → store pending parent-child link. Detect SubagentStop → resolve hierarchy link. |
| `routes/api.js` | GET /api/events only | Add GET /api/sessions, GET /api/agents (tree query), GET /api/export. |
| `public/index.html` | 2x2 grid, one live panel | Major JS expansion: 3 new panels (Agent Tree, Cost Meters, Gantt/Timeline), Session History. Handle new SSE event types. |
| `server.js` | Registers 4 routes | Register `jsonlWatcher` module on startup. Pass pricing config. |
| `package.json` | 3 dependencies | Add `chokidar`, add `bin` field for CLI. |

### What Gets Added (New Files)

| File | Purpose |
|------|---------|
| `lib/jsonlWatcher.js` | chokidar watcher, byte-offset tailing, token/cost parsing, SSE push |
| `lib/pricingConfig.js` | Model pricing map, cost computation function, config loading |
| `lib/hierarchy.js` | In-memory pending Task map, parent-child resolution logic |
| `bin/cli.js` | CLI entry point for `init`, `start`, `doctor` |

---

## Data Flow Changes

### New Path: Cost and Token Data (JSONL → SQLite → SSE)

```
Claude Code writes to ~/.claude/projects/<hash>/<session>.jsonl
  ↓
lib/jsonlWatcher.js (chokidar 4.x watcher, registered at server startup)
  detects new bytes via 'change' event on *.jsonl glob
  reads from last known byte offset (Map<filePath, offset>)
  splits on \n, JSON.parse() each complete line in try/catch
  filters for: entry.type === 'assistant' && entry.message?.usage
  extracts: sessionId, message.id, message.model, usage fields
  ↓
lib/pricingConfig.js
  looks up rate for model (fallback to default if unknown)
  computes: cost_usd = (input * rate.input + output * rate.output + cache_create * rate.cache_create + cache_read * rate.cache_read) / 1_000_000
  ↓
writeQueue.enqueue({ type: 'token_snapshot', ...fields })
writeQueue.enqueue({ type: 'session_cost_update', sessionId, deltaCost })
  ↓
SQLite writes to token_snapshots, updates sessions.total_cost_usd
  ↓
broadcast({ type: 'cost_update', sessionId, input_tokens, output_tokens, cost_usd, total_cost_usd })
  ↓
Dashboard: Cost Meters panel updates live counter for the session
```

### New Path: Agent Hierarchy (Task PreToolUse → Sessions Table)

```
Claude Code fires PreToolUse hook with tool_name='Task'
  ↓
relay.py → POST /ingest with hook_type='PreToolUse', tool_name='Task', session_id=<parent>
  ↓
routes/ingest.js
  detects tool_name === 'Task' && hook_type === 'PreToolUse'
  lib/hierarchy.js: pendingTasks.set(tool_use_id, { parentSessionId, cwd, startedAt })
  ↓
[Child session starts in separate OS process — Claude Code creates new JSONL file]
  ↓
lib/jsonlWatcher.js
  detects new *.jsonl file
  reads first entry to get child sessionId and cwd + timestamp
  lib/hierarchy.js: resolveParent(childSessionId, cwd, timestamp)
    → finds pending task with matching cwd within 10s window
    → returns parentSessionId (or null if no match)
  writeQueue.enqueue({ type: 'session_upsert', sessionId: childSessionId, parentSessionId })
  ↓
sessions table: parent_session_id set on child session row
  ↓
broadcast({ type: 'session_new', sessionId, parentSessionId, cwd })
  ↓
Dashboard: Agent Tree panel adds child node under parent
```

**If SubagentStop payload contains child session_id (verify before building):**

```
SubagentStop hook fires in parent process
  ↓
relay.py forwards: hook_type='SubagentStop', session_id=<parent>, child_session_id=<child> (if present)
  ↓
routes/ingest.js: skip the cwd+time inference entirely
  directly updates sessions SET parent_session_id = parent WHERE session_id = child
```

This SubagentStop path eliminates the inference problem if the field is available. Verify this first in implementation.

### New Path: Session History (REST API)

```
Browser loads Session History panel
  ↓
GET /api/sessions?project=<hash>&status=all&since=<timestamp>
  ↓
routes/api.js: query sessions JOIN token_snapshots aggregation
  returns: session_id, parent_session_id, cwd, status, started_at, last_event_at,
           total_cost_usd, total_input_tokens, total_output_tokens, event_count
  ↓
Dashboard: renders filterable table
  filter controls: date range, cwd/project, min cost, status (active/completed)
  export button: GET /api/export?session_id=<sid>&format=csv|json
```

### Modified Path: Dashboard Initial Load

```
Browser loads dashboard
  ↓
Promise.all([
  fetch('/api/events'),         // existing — last 200 events for tool log
  fetch('/api/sessions'),       // new — session list with cost rollup
  fetch('/api/agents')          // new — agent tree (recursive CTE result)
])
  ↓
Render Tool Call Log (existing)
Render Agent Tree (new — hierarchical from /api/agents)
Render Cost Meters (new — from /api/sessions)
Render Gantt Timeline (new — from /api/events, grouped by session, sorted by timestamp)
  ↓
subscribeSSE() — same /events endpoint, new event types handled
```

---

## Updated SQLite Schema

The existing `events` table needs two new columns and the schema needs two new tables. Use `ALTER TABLE` for the events columns to avoid losing existing data.

```sql
-- MODIFY existing events table (ALTER TABLE, not recreate)
ALTER TABLE events ADD COLUMN agent_id TEXT;           -- same as session_id initially; reserved for future named agents
ALTER TABLE events ADD COLUMN tool_input_summary TEXT;  -- truncated to 500 chars, never full content

-- NEW: sessions table
CREATE TABLE IF NOT EXISTS sessions (
  session_id          TEXT PRIMARY KEY,
  parent_session_id   TEXT REFERENCES sessions(session_id),
  project_path        TEXT,                             -- cwd from first event
  status              TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'completed'
  started_at          INTEGER NOT NULL,                 -- epoch ms
  last_event_at       INTEGER NOT NULL,                 -- epoch ms, updated on every event
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd      REAL NOT NULL DEFAULT 0.0,
  context_tokens_used INTEGER,                          -- from statusLine bridge if available
  context_tokens_max  INTEGER
);

-- NEW: token_snapshots table
CREATE TABLE IF NOT EXISTS token_snapshots (
  id                        TEXT PRIMARY KEY,            -- message.id from JSONL
  session_id                TEXT NOT NULL REFERENCES sessions(session_id),
  model                     TEXT NOT NULL,
  input_tokens              INTEGER NOT NULL DEFAULT 0,
  output_tokens             INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens         INTEGER NOT NULL DEFAULT 0,
  cost_usd                  REAL NOT NULL DEFAULT 0.0,
  timestamp                 INTEGER NOT NULL,
  UNIQUE(session_id, id)    -- deduplication: re-reads of JSONL don't double-count
);

-- Indexes (add after CREATE TABLE statements)
CREATE INDEX IF NOT EXISTS idx_events_session    ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_parent   ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status   ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON token_snapshots(session_id);
```

**Migration strategy:** The `initDb()` function already uses `CREATE TABLE IF NOT EXISTS`. Add `ALTER TABLE events ADD COLUMN IF NOT EXISTS agent_id TEXT` (SQLite 3.37+ supports this). For the new tables, `CREATE TABLE IF NOT EXISTS` handles first run and upgrades cleanly.

---

## Recommended Project Structure (v1.1)

```
observagent/
├── server.js                    # MODIFIED: register jsonlWatcher on startup
├── package.json                 # MODIFIED: add chokidar, bin field
├── db/
│   └── schema.js                # MODIFIED: sessions + token_snapshots tables, ALTER events
├── hooks/
│   └── relay.py                 # MODIFIED: SubagentStop hook type support
├── lib/
│   ├── writeQueue.js            # MODIFIED: multi-statement support
│   ├── sseClients.js            # UNCHANGED
│   ├── jsonlWatcher.js          # NEW: chokidar watcher + byte-offset tailing
│   ├── pricingConfig.js         # NEW: model rate map, cost computation
│   └── hierarchy.js             # NEW: pending task map, parent resolution
├── routes/
│   ├── ingest.js                # MODIFIED: sessions upsert, Task detection, SubagentStop
│   ├── sse.js                   # UNCHANGED
│   ├── api.js                   # MODIFIED: add /api/sessions, /api/agents, /api/export
│   └── dashboard.js             # UNCHANGED (just serves static HTML)
├── bin/
│   └── cli.js                   # NEW: init / start / doctor CLI
├── public/
│   └── index.html               # MODIFIED: 3 new panels, new SSE event handlers
└── .planning/
```

---

## Architectural Patterns

### Pattern 1: Typed Write Queue

**What:** The existing `WriteQueue` has one hardcoded prepared statement. v1.1 requires writes to three tables. Extend with a type discriminator rather than creating multiple queues (multiple queues would lose the single-writer guarantee).

**When to use:** Any time a new table needs write access from ingest or jsonlWatcher.

**Implementation:**

```javascript
// lib/writeQueue.js — extended for v1.1
export class WriteQueue {
  constructor(db) {
    this.db = db;
    this.queue = [];
    this.processing = false;

    this.stmts = {
      event: db.prepare(`INSERT INTO events ...`),
      session_upsert: db.prepare(`INSERT INTO sessions ... ON CONFLICT(session_id) DO UPDATE SET ...`),
      token_snapshot: db.prepare(`INSERT OR IGNORE INTO token_snapshots ...`),
      session_cost: db.prepare(`UPDATE sessions SET total_cost_usd = total_cost_usd + @delta, total_input_tokens = total_input_tokens + @input, total_output_tokens = total_output_tokens + @output WHERE session_id = @session_id`),
    };
  }

  enqueue(type, data) {
    this.queue.push({ type, data });
    if (!this.processing) this._process();
  }

  _process() {
    if (this.queue.length === 0) { this.processing = false; return; }
    this.processing = true;
    const { type, data } = this.queue.shift();
    try { this.stmts[type].run(data); }
    catch (err) { console.error('[db] write error:', type, err.message); }
    setImmediate(() => this._process());
  }
}
```

**Trade-off:** Slightly more complex initialization but preserves the critical single-writer invariant.

### Pattern 2: Byte-Offset JSONL Tailing

**What:** Track the last read position per JSONL file to avoid re-parsing from the start on every chokidar change event. This is O(new bytes) not O(file size).

**When to use:** Always for JSONL file watching. Never use a streaming JSON parser — JSONL is already newline-delimited.

**Implementation:**

```javascript
// lib/jsonlWatcher.js
const offsets = new Map(); // filePath -> byteOffset
const partialLines = new Map(); // filePath -> incomplete line buffer

function readNewLines(filePath, sessionId) {
  const stat = fs.statSync(filePath);
  const offset = offsets.get(filePath) ?? 0;
  if (stat.size <= offset) return;

  const buf = Buffer.alloc(stat.size - offset);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);

  let text = (partialLines.get(filePath) ?? '') + buf.toString('utf8');
  const lines = text.split('\n');

  // Last element may be incomplete — buffer it
  const incomplete = lines.pop();
  partialLines.set(filePath, incomplete);

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant' && entry.message?.usage) {
        processTokenEntry(sessionId, entry);
      }
    } catch {} // malformed line — skip, will not retry
  }

  offsets.set(filePath, stat.size);
}
```

**Trade-off:** Requires storing offsets in memory — if server restarts, all JSONL files are re-read from offset 0. Deduplication via `UNIQUE(session_id, id)` in `token_snapshots` prevents double-counting.

### Pattern 3: SSE Event Typing

**What:** The current SSE broadcast sends raw event objects without a typed envelope. v1.1 needs the dashboard to distinguish cost updates from hierarchy updates from stuck alerts.

**When to use:** All new SSE event types must include an explicit `type` field.

**Current (unchanged):**
```javascript
broadcast(event); // dashboard checks hook_type field
```

**Extended for new event types:**
```javascript
// New events use typed wrapper — old events still raw for backwards compat
broadcast({ type: 'cost_update', sessionId, cost_usd, total_cost_usd, input_tokens, output_tokens });
broadcast({ type: 'session_new', sessionId, parentSessionId, cwd, startedAt });
broadcast({ type: 'session_end', sessionId, status: 'completed' });
broadcast({ type: 'agent_stuck', sessionId, lastEventAt, staleSecs });
```

Dashboard EventSource handler distinguishes by `event.type` field:
```javascript
es.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'connected') return;
  if (msg.type === 'cost_update') return handleCostUpdate(msg);
  if (msg.type === 'session_new') return handleSessionNew(msg);
  if (msg.type === 'agent_stuck') return handleAgentStuck(msg);
  // default: tool event (hook_type field present)
  appendRow(msg);
};
```

### Pattern 4: Gantt Timeline Rendering (Canvas or SVG)

**What:** Gantt timelines require computing horizontal bars from `(start_ts, end_ts)` pairs per session. The existing tool log already has `PreToolUse/PostToolUse` pairs with `tool_call_id` correlation.

**When to use:** Gantt panel uses events from `/api/events`, grouped by `session_id`, sorted by `timestamp ASC`.

**Implementation approach (vanilla JS + Canvas):**

```javascript
// Simpler than SVG for dynamic data; no library needed
// Each session = one horizontal lane
// Each tool call = one bar: x = (start_ts - minTs) / scale, width = duration_ms / scale
function renderGantt(sessions, events) {
  const canvas = document.getElementById('gantt-canvas');
  const ctx = canvas.getContext('2d');
  const minTs = Math.min(...events.map(e => e.timestamp));
  const maxTs = Math.max(...events.map(e => e.timestamp + (e.duration_ms ?? 0)));
  const scale = (canvas.width - 120) / (maxTs - minTs); // 120px for labels

  sessions.forEach((session, i) => {
    const y = i * 28 + 14;
    const sessionEvents = events.filter(e => e.session_id === session.session_id && e.hook_type === 'PostToolUse');
    sessionEvents.forEach(event => {
      const x = 120 + (event.timestamp - minTs) * scale;
      const w = Math.max(2, (event.duration_ms ?? 0) * scale);
      ctx.fillStyle = event.exit_status ? '#f85149' : '#3fb950';
      ctx.fillRect(x, y - 8, w, 16);
    });

    // Session label
    ctx.fillStyle = '#8b949e';
    ctx.fillText(session.session_id.slice(0, 8), 0, y + 4);
  });
}
```

**Trade-off:** Canvas gives precise control and no dependency; SVG is easier to add tooltips. Start with Canvas — add tooltip layer with a single mousemove handler if needed.

---

## Integration Points: New vs Modified Components

### Ingest Route Modifications (routes/ingest.js)

**Currently:** Normalizes 5 fields, pairs PreToolUse/PostToolUse, writes event, broadcasts.

**v1.1 adds:**
1. **Sessions upsert on every event** — every event carries a `session_id`; insert/update the sessions row with `last_event_at` and `project_path` (from `cwd` if available, otherwise NULL).
2. **Task tool detection** — if `tool_name === 'Task'` and `hook_type === 'PreToolUse'`: call `hierarchy.registerTask(tool_call_id, session_id, cwd)`.
3. **SubagentStop handling** — if `hook_type === 'SubagentStop'`: mark the child session as `status='completed'`; if child session_id is in payload, link hierarchy directly; otherwise, leave `parent_session_id` to be set by jsonlWatcher.
4. **Tool input summary** — for Task tool events, store truncated `tool_input.description` (100 chars max) in `tool_input_summary` for display in session history.

The 202-before-write pattern is unchanged. All of the above happens inside `setImmediate()`.

### JSONL Watcher (lib/jsonlWatcher.js) — New Component

**Registered in server.js** after `initDb()` and `writeQueue` creation:
```javascript
import { startWatcher } from './lib/jsonlWatcher.js';
startWatcher({ writeQueue, broadcast, db });
```

**Responsibilities:**
1. `chokidar.watch('~/.claude/projects/**/*.jsonl', { awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 } })`
2. On `add` event (new file): extract session_id from filename, create sessions row, attempt parent resolution via `hierarchy.resolveParent(sessionId, cwd, timestamp)`
3. On `change` event: byte-offset read → parse assistant entries → compute cost → `writeQueue.enqueue('token_snapshot', ...)` → `writeQueue.enqueue('session_cost', ...)` → `broadcast({ type: 'cost_update', ... })`
4. On server startup: optionally scan existing JSONL files from offset 0 to hydrate token_snapshots for historical sessions (controlled by `--hydrate` flag or auto-detect if token_snapshots is empty)

### Stuck Agent Detection

No new component required. Add a single `setInterval` in `server.js` that runs every 30 seconds:

```javascript
setInterval(() => {
  const staleMs = 60_000;
  const cutoff = Date.now() - staleMs;
  const stale = db.prepare(
    `SELECT session_id, last_event_at FROM sessions WHERE status='active' AND last_event_at < ?`
  ).all(cutoff);
  for (const s of stale) {
    broadcast({ type: 'agent_stuck', sessionId: s.session_id, lastEventAt: s.last_event_at, staleSecs: Math.round((Date.now() - s.last_event_at) / 1000) });
  }
}, 30_000);
```

This uses the existing `db` instance and existing `broadcast`. No new table needed.

---

## Suggested Build Order (v1.1)

Dependencies flow strictly top-to-bottom. Do not start a step until the previous step works end-to-end.

```
Step 1: Schema migration
  - ALTER TABLE events ADD COLUMN agent_id, tool_input_summary
  - CREATE TABLE sessions
  - CREATE TABLE token_snapshots
  - Add all indexes
  - Verify with better-sqlite3 shell: .schema
  ↓
Step 2: WriteQueue extension (multi-statement)
  - Add stmts map with session_upsert, token_snapshot, session_cost
  - Update enqueue() signature to accept (type, data)
  - Update all existing enqueue() call sites in ingest.js
  ↓
Step 3: Ingest route — sessions upsert
  - Every POST /ingest now upserts sessions row (session_id, project_path, last_event_at)
  - Verify: after hook fires, SELECT * FROM sessions shows the row
  ↓
Step 4: lib/hierarchy.js
  - registerTask(toolCallId, parentSessionId, cwd, startedAt) — Map entry
  - resolveParent(childSessionId, cwd, timestamp) — finds matching pending task, updates sessions row
  - Verify: Task tool PreToolUse → entry in pending map; new session detected → parent_session_id set
  ↓
Step 5: lib/pricingConfig.js
  - Model rate table (sonnet-4-6, sonnet-4-5, opus-4-6, opus-4-5, haiku-4-5, default fallback)
  - computeCost(model, usage) → cost_usd
  ↓
Step 6: lib/jsonlWatcher.js
  - chokidar setup on ~/.claude/projects/**/*.jsonl
  - byte-offset tailing on 'change' events
  - parse assistant entries → computeCost → writeQueue.enqueue
  - 'add' events → register new session, attempt hierarchy resolution
  - Verify: run a session, watch token_snapshots fill up
  ↓
Step 7: /api/sessions and /api/agents endpoints
  - GET /api/sessions: sessions list with token aggregation
  - GET /api/agents: recursive CTE for tree
  - GET /api/export: CSV or JSON download
  ↓
Step 8: Dashboard — Cost Meters panel
  - REST hydration from /api/sessions on load
  - SSE cost_update handler updates live meters
  - Context fill bar (if context_tokens_used / context_tokens_max available)
  ↓
Step 9: Dashboard — Agent Tree panel
  - REST hydration from /api/agents on load
  - SSE session_new / session_end handlers update tree
  - Stuck agent badge from SSE agent_stuck events
  ↓
Step 10: Dashboard — Gantt Timeline panel
  - REST hydration from /api/events (full history for active sessions)
  - Canvas rendering of tool call bars
  - Horizontal scroll if timeline exceeds panel width
  ↓
Step 11: Dashboard — Session History panel
  - REST hydration from /api/sessions
  - Filter controls (date, project, min cost, status)
  - Export button → GET /api/export
  ↓
Step 12: bin/cli.js
  - npx observagent init: read ~/.claude/settings.json, merge hooks, write back
  - npx observagent start: spawn server, open browser
  - npx observagent doctor: check server alive, hooks present, JSONL found
```

This order ensures each step has working infrastructure beneath it. Steps 8-11 (dashboard panels) can be built in any order relative to each other once Step 7 is complete.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Multiple Write Queues

**What people do:** Create one WriteQueue for events and a separate one for token_snapshots.
**Why it's wrong:** Two queues = two concurrent writers = SQLite BUSY errors under load. The single-writer invariant is the core of the write queue pattern.
**Do this instead:** Extend the single WriteQueue with a type discriminator (see Pattern 1 above).

### Anti-Pattern 2: Polling for New JSONL Lines

**What people do:** `setInterval(() => readNewLines(), 1000)` on every watched file.
**Why it's wrong:** CPU waste (polling all files even when idle), latency (up to 1s delay for cost updates), doesn't handle new file creation.
**Do this instead:** chokidar 4.x with `awaitWriteFinish` — fires only on actual changes, handles new file creation via `add` event.

### Anti-Pattern 3: Timing-Based Hierarchy Inference

**What people do:** Assume the sub-agent session that started closest in time to a Task spawn is the child.
**Why it's wrong:** Under GSD parallel spawns (4+ agents at once), multiple sessions start within milliseconds of each other. Time alone cannot disambiguate.
**Do this instead:** Match on `cwd` (project path) + time window. If SubagentStop payload includes child session_id, use that and skip inference entirely.

### Anti-Pattern 4: Hardcoding Model Pricing

**What people do:** `const RATE_PER_TOKEN = 0.000003` at the top of a file.
**Why it's wrong:** Anthropic changes pricing. New models are released (already 6+ models seen in real sessions). Hardcoded values go stale silently and produce wrong cost data.
**Do this instead:** `lib/pricingConfig.js` with a model map + default fallback. Load overrides from env var or `~/.observagent.json`. Log a warning when an unknown model is encountered.

### Anti-Pattern 5: Full JSONL Re-parse on Every Change Event

**What people do:** `JSON.parse(fs.readFileSync(filePath, 'utf8').split('\n'))` on every chokidar change.
**Why it's wrong:** Session files grow to hundreds of KB. Re-parsing 5,000+ lines on every new assistant message is O(n) per write.
**Do this instead:** Byte-offset tailing (Pattern 2). Process only the delta since the last read.

### Anti-Pattern 6: Blocking SQLite in the Ingest Critical Path

**What people do:** Call `db.run()` before `reply.code(202).send()`.
**Why it's wrong:** Blocks the hook relay. If the DB write takes 10ms, the hook blocks Claude for 10ms. Under write contention, this can cascade.
**Do this instead:** 202 immediately, all DB writes inside `setImmediate()` callback. This is already the existing pattern — do not regress it during v1.1 additions.

---

## Scaling Considerations (Local Tool Context)

This is a local developer tool running on a single machine. Scale concerns are different from production services.

| Concern | At 1 Session | At 5 Parallel Agents | At 100 Sessions/Day |
|---------|-------------|---------------------|---------------------|
| SQLite writes | Trivial | WAL mode + write queue handles it | Events table grows; add cleanup job to archive >7d old events |
| JSONL tailing | One file | One chokidar watcher, N files — fine | JSONL files are never deleted by Claude Code; add offset persistence to survive restarts |
| SSE connections | 1 tab | 1 tab (typically) | N/A — local tool |
| Memory | ~10MB | ~15MB (N pending task maps) | Offset map grows linearly; reset on restart |

**First bottleneck:** JSONL offset map is lost on server restart, causing full re-parse of all JSONL files. The `UNIQUE(session_id, id)` constraint in `token_snapshots` prevents double-counting, but re-parsing 50+ sessions with thousands of entries adds 1-3 seconds to startup.

**Mitigation:** Persist offsets to a `offsets.json` file at graceful shutdown, load on startup. This is a nice-to-have, not a v1.1 requirement — the deduplication constraint is the safety net.

---

## Integration Boundaries

### Relay.py Minimal Modifications

The relay.py hook is the most sensitive file — any regression here blocks Claude Code. Minimize changes:

1. Add `SubagentStop` to `hook_type` whitelist — the file already handles multiple hook types via `hook_event_name` field
2. Optionally: read `/tmp/claude-ctx-{session_id}.json` bridge file if it exists and forward `context_remaining_pct` — but only if it adds <1ms latency (simple file read, no stat if file doesn't exist)
3. Never add network calls, retries, or stdout/stderr output

### Dashboard Backward Compatibility

The existing `/events` SSE endpoint URL and the existing SSE message format for tool events are unchanged. New SSE event types are additive. Existing JavaScript code for the Tool Call Log panel continues to work unmodified.

### Claude Code settings.json Merge Strategy

The CLI `init` command must **merge** into the existing hooks config, never overwrite. The existing settings.json has GSD hooks (`gsd-check-update.js`, `gsd-context-monitor.js`, `gsd-statusline.js`) that must not be removed.

```javascript
// bin/cli.js — settings merge pseudocode
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
settings.hooks = settings.hooks ?? {};
settings.hooks.PreToolUse = settings.hooks.PreToolUse ?? [];
settings.hooks.PostToolUse = settings.hooks.PostToolUse ?? [];
settings.hooks.SubagentStop = settings.hooks.SubagentStop ?? [];

// Add only if not already present
const relayCommand = `python3 ${relayPath}`;
const alreadyInstalled = (hookArray) => hookArray.some(h => h.hooks?.some(hh => hh.command?.includes('relay.py')));

if (!alreadyInstalled(settings.hooks.PreToolUse)) {
  settings.hooks.PreToolUse.push({ hooks: [{ type: 'command', command: relayCommand }] });
}
// ... same for PostToolUse, SubagentStop

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
```

---

## Open Questions (Resolve in Early Implementation)

| Question | Impact | How to Resolve |
|----------|--------|---------------|
| Does SubagentStop payload include child session_id? | HIGH — if yes, skip hierarchy inference entirely | Add SubagentStop to settings.json, trigger a Task tool, log the raw payload before writing any code |
| Does PostToolUse payload include context_window data? | MEDIUM — if yes, can track fill% via relay.py without statusLine bridge | Add raw payload logging to relay.py in dev mode; trigger a tool use and inspect |
| What is the correct agent_id concept? | LOW — currently same as session_id; GSD has subagent_type in Task input | Defer — use session_id as agent_id for v1.1; consider named agents in v2 |
| How should startup JSONL hydration work? | MEDIUM — restart loses offsets; re-parse is slow for large history | Ship with deduplication (UNIQUE constraint) as safety net; optimize in v1.2 if startup time becomes a complaint |

---

## Sources

- Direct codebase inspection: `server.js`, `db/schema.js`, `lib/writeQueue.js`, `lib/sseClients.js`, `routes/ingest.js`, `routes/sse.js`, `routes/api.js`, `routes/dashboard.js`, `hooks/relay.py`, `public/index.html`
- Live JSONL inspection: `~/.claude/projects/-Users-darshannere-claude-observagent/*.jsonl` (Claude Code 2.1.59, session entries with confirmed usage field schema)
- Hook payload confirmation: relay.py docstring comments (live payload inspection at Claude Code 2.1.59)
- GSD hook ecosystem: `~/.claude/hooks/gsd-statusline.js`, `~/.claude/hooks/gsd-context-monitor.js` (statusLine payload schema, context_window.remaining_percentage location confirmed)
- Installed package versions: Fastify 5.7.4 (not 4.x), better-sqlite3 12.6.2 (confirmed by package.json + node_modules)
- Real session data: 7 project sessions inspected, models confirmed, cost calculation validated against real token counts

---
*Architecture research for: ObservAgent v1.1 feature integration*
*Researched: 2026-02-26*
