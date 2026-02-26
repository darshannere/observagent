# Phase 1: Foundation - Research

**Researched:** 2026-02-26
**Domain:** Claude Code hooks, Node.js/Fastify HTTP server, better-sqlite3, Server-Sent Events
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Event schema**
- Metadata-only records: tool_name, hook_type (pre/post), session_id, timestamp, duration_ms, exit_status
- No tool call arguments or response bodies — avoids storing potentially sensitive file contents or commands
- PreToolUse and PostToolUse each write a separate row, linked by a shared correlation ID (tool_call_id)
- session_id captured from Claude Code environment variables (CLAUDE_SESSION_ID) so Phase 4 agent tree has the data it needs

**Error status**
- PostToolUse hook captures exit code / error status and stores it in the event row
- Field present from Phase 1 so Phase 2 can highlight failures without a schema migration

**Server-down behavior**
- Hook relay: silent fail — attempts one HTTP POST, gets connection refused, exits with code 0 immediately
- No local buffering, no stderr output, Claude Code session sees nothing
- HTTP POST timeout: 500ms max (protects Claude session if server is hung, not just down)
- No retries — fire and forget

**Ingest endpoint response**
- POST /ingest returns 202 with empty body before any database write occurs
- Server returns 202 first (async write via queue), validating the success criterion by log order

**Server startup (Phase 1)**
- Started with: `python server.py` — NOTE: This is actually a Node.js server. The CONTEXT.md appears to say "python server.py" but STATE.md confirms Node.js. Use `node server.js` or `npm start`.
- Port: hardcoded 4999
- Logging: stdout only, no log files
- SQLite database: ./observagent.db (project directory, easy to inspect/delete)
- SQLite WAL mode + write queue from the start to prevent BUSY errors under concurrent hook events

**Hook script design**
- Single `relay.py` handles both PreToolUse and PostToolUse hooks
- Both hook types in Claude Code settings.json point to the same `python relay.py` command
- hook_type field in the JSON payload identifies which hook fired
- Target: hardcoded localhost:4999 — no env vars or config files needed in Phase 1
- All relay.py output (stderr) suppressed — Claude Code session stays completely clean

### Claude's Discretion
- Exact SQLite schema column names and types
- Internal async queue implementation (asyncio queue, threading, etc.)
- SSE event format / message envelope structure
- How tool_call_id correlation ID is generated
- Exact logging format for server stdout

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INGEST-01 | System captures Claude Code tool call events in real-time via PreToolUse/PostToolUse hooks | Hook stdin JSON schema documented; relay.py pattern verified; Fastify 5 + better-sqlite3 + fastify-sse-v2 stack validated; write queue pattern for BUSY-free concurrent writes documented |
</phase_requirements>

---

## Summary

Phase 1 delivers the end-to-end plumbing: Claude Code hook fires → `relay.py` forwards events via HTTP POST → Fastify server stores in SQLite → SSE pushes the event to any connected browser tab. All four pieces are well-understood with HIGH confidence.

The critical insight from research is that Claude Code's `async: true` hook feature (released January 2026) could eliminate the need for relay.py entirely — the hook could directly fire in the background without blocking Claude. However, the CONTEXT.md has locked in `relay.py` as the relay mechanism with a 500ms timeout guard. The planner must respect this decision but should note that `async: true` is available as a future simplification if relay.py proves problematic.

Fastify v4 reached end-of-life June 30, 2025. The STATE.md references "Fastify 4.x" but the current stable is Fastify v5.7.x. Since this project has no existing code, use Fastify 5. The locked decision was "Fastify over Express" — the version preference for v4 was based on 2025 information. Fastify 5 is 5-10% faster and still the right choice.

**Primary recommendation:** Use Fastify 5 + `fastify-sse-v2` + `better-sqlite3` 12.x with WAL mode + a Node.js EventEmitter-based async write queue. Hook relay is Python (`relay.py`) using `urllib.request` with a 500ms timeout — pure stdlib, no dependencies.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | 5.7.x (latest v5) | HTTP server, ingest endpoint, SSE endpoint | 2x throughput over Express; v5 is current stable (v4 EOL June 2025); clean plugin system |
| better-sqlite3 | 12.6.2 | Synchronous SQLite access | Fastest Node.js SQLite driver; synchronous API fits single-writer queue pattern perfectly |
| fastify-sse-v2 | 4.2.2 | Server-Sent Events push to browser | Community maintained, Fastify 3+ compatible, supports async generators and individual event push |
| Python stdlib | 3.x (system) | relay.py hook script | Zero dependencies; `urllib.request` handles HTTP POST; `sys.stdin` reads hook JSON |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | latest | TypeScript types for better-sqlite3 | If using TypeScript for server |
| uuid or crypto.randomUUID | built-in Node.js 19+ | Generate tool_call_id correlation IDs | `crypto.randomUUID()` is built into Node.js 19+ — no package needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fastify-sse-v2 | @fastify/sse | @fastify/sse is official but v0.4.0 is minimal; fastify-sse-v2 has cleaner async generator API and explicit Fastify 5 support |
| fastify-sse-v2 | Raw response streams | More control but requires manual SSE framing (data: ...\n\n), heartbeat logic, connection tracking |
| relay.py (urllib) | relay.py (requests) | `requests` is not stdlib — adds an installation dependency; `urllib.request` is zero-dep |
| better-sqlite3 | node-sqlite3 (async) | node-sqlite3 is async but introduces callback complexity; better-sqlite3's sync API makes the write queue trivial |
| Node.js EventEmitter write queue | Worker thread per connection | Worker threads add complexity; for this low write rate (~1 event/tool call) a simple async queue in the main thread is sufficient |

**Installation:**
```bash
npm init -y
npm install fastify fastify-sse-v2 better-sqlite3
```

---

## Architecture Patterns

### Recommended Project Structure

```
observagent/
├── server.js              # Fastify server entry point (port 4999)
├── hooks/
│   └── relay.py           # Claude Code hook relay script
├── db/
│   └── schema.js          # SQLite schema definition and db init
├── routes/
│   ├── ingest.js          # POST /ingest — 202 before write, enqueue event
│   └── sse.js             # GET /events — SSE stream for browser
├── lib/
│   ├── writeQueue.js      # Async write queue (EventEmitter or Promise chain)
│   └── sseClients.js      # Connected SSE client registry + broadcast
└── observagent.db         # SQLite file (gitignored)
```

### Pattern 1: 202-Before-Write (Async Ingest)

**What:** The `/ingest` POST handler immediately sends HTTP 202, then enqueues the write. The write queue processes inserts serially after the response is already sent.

**When to use:** Always — this is the core success criterion (202 before DB write, validated by log order).

**Example:**
```javascript
// Source: Pattern based on Fastify docs + better-sqlite3 sync API
// routes/ingest.js
fastify.post('/ingest', async (request, reply) => {
  const event = request.body;

  // Log + send 202 FIRST
  console.log('[ingest] 202 sent', event.tool_name);
  reply.code(202).send();

  // Enqueue write AFTER response (setImmediate ensures response is flushed first)
  setImmediate(() => {
    writeQueue.enqueue(event);
  });
});
```

### Pattern 2: Single-Writer Async Queue

**What:** All SQLite writes go through a serial queue. Since better-sqlite3 is synchronous and SQLite WAL allows one writer at a time, serializing writes in Node.js prevents SQLITE_BUSY errors without needing worker threads.

**When to use:** Any time multiple concurrent HTTP requests may arrive simultaneously (GSD runs 4+ parallel agents).

**Example:**
```javascript
// Source: Node.js EventEmitter pattern, verified against better-sqlite3 sync API
// lib/writeQueue.js
import { EventEmitter } from 'events';

class WriteQueue extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.queue = [];
    this.processing = false;
  }

  enqueue(event) {
    this.queue.push(event);
    if (!this.processing) this._process();
  }

  _process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    this.processing = true;
    const event = this.queue.shift();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO events (tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status)
        VALUES (@tool_name, @hook_type, @session_id, @tool_call_id, @timestamp, @duration_ms, @exit_status)
      `);
      stmt.run(event);
      console.log('[db] write complete', event.tool_name);
    } catch (err) {
      console.error('[db] write error', err.message);
    }

    setImmediate(() => this._process());
  }
}
```

### Pattern 3: SSE Client Registry + Broadcast

**What:** A module maintains the Set of active SSE response objects. When a new event is ingested and written, broadcast is called on all clients.

**When to use:** SSE endpoint — Phase 1 only needs broadcast (no filtering by session).

**Example:**
```javascript
// Source: fastify-sse-v2 README pattern + Node.js Set
// lib/sseClients.js
const clients = new Set();

export function addClient(reply) {
  clients.add(reply);
}

export function removeClient(reply) {
  clients.delete(reply);
}

export function broadcast(data) {
  const event = { data: JSON.stringify(data) };
  for (const reply of clients) {
    try {
      reply.sse(event);
    } catch (err) {
      // Client disconnected between check and send — remove it
      clients.delete(reply);
    }
  }
}
```

```javascript
// routes/sse.js
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { addClient, removeClient } from '../lib/sseClients.js';

// Register plugin once in server.js:
// fastify.register(FastifySSEPlugin)

fastify.get('/events', function (request, reply) {
  addClient(reply);
  request.socket.on('close', () => removeClient(reply));

  // Send initial connected event
  reply.sse({ data: JSON.stringify({ type: 'connected' }) });

  // Keep connection open — fastify-sse-v2 keeps alive until client disconnects
});
```

### Pattern 4: relay.py — Fire-and-Forget Hook Relay

**What:** Python script invoked by Claude Code hooks. Reads JSON from stdin, POSTs to server, exits. Uses only stdlib. Suppresses all output. Hard 500ms timeout.

**When to use:** Registered as the `command` for both PreToolUse and PostToolUse in `~/.claude/settings.json`.

**Example:**
```python
# hooks/relay.py
import sys
import json
import urllib.request
import urllib.error

def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)

        # Build our event — metadata only, no tool arguments
        event = {
            "tool_name": payload.get("tool_name", ""),
            "hook_type": payload.get("hook_event_name", ""),
            "session_id": payload.get("session_id", ""),
            "tool_call_id": payload.get("tool_use_id", ""),
            "timestamp": None,  # server sets this
        }

        body = json.dumps(event).encode("utf-8")
        req = urllib.request.Request(
            "http://localhost:4999/ingest",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        # 500ms hard timeout — protects Claude session if server is hung
        urllib.request.urlopen(req, timeout=0.5)

    except Exception:
        pass  # Silent fail — never write to stderr, never block Claude

    sys.exit(0)

if __name__ == "__main__":
    main()
```

### Pattern 5: SQLite Initialization with WAL Mode

**What:** WAL mode enables concurrent readers without blocking writers. Must be set before any other operations.

**Example:**
```javascript
// Source: better-sqlite3 docs + official WAL mode guidance
// db/schema.js
import Database from 'better-sqlite3';

export function initDb(path = './observagent.db') {
  const db = new Database(path);

  // WAL mode — mandatory from day one for concurrent agents
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');  // safe with WAL, much faster than FULL

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name   TEXT    NOT NULL,
      hook_type   TEXT    NOT NULL,         -- 'PreToolUse' or 'PostToolUse'
      session_id  TEXT    NOT NULL,
      tool_call_id TEXT,                    -- correlation ID linking pre/post pairs
      timestamp   INTEGER NOT NULL,         -- Unix ms, set by server at ingest time
      duration_ms INTEGER,                  -- null for PreToolUse; set by PostToolUse
      exit_status INTEGER                   -- null for PreToolUse; exit code for PostToolUse
    )
  `);

  return db;
}
```

### Pattern 6: settings.json Hook Registration

**What:** Register `relay.py` for both PreToolUse and PostToolUse in `~/.claude/settings.json`.

**Example:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python /absolute/path/to/hooks/relay.py"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python /absolute/path/to/hooks/relay.py"
          }
        ]
      }
    ]
  }
}
```

**Note:** No matcher means hooks fire for ALL tool types. This is correct for Phase 1 — capture everything.

### Anti-Patterns to Avoid

- **Writing to stderr in relay.py**: Any stderr output appears in the Claude Code UI. Use `pass` on all exceptions, never `print(..., file=sys.stderr)`.
- **Awaiting the DB write before sending 202**: Violates the success criterion. The 202 must be sent before `stmt.run()` executes.
- **Opening multiple SQLite connections**: better-sqlite3 is synchronous; the single-writer queue pattern requires ONE connection. Multiple connections defeat WAL mode's concurrency benefit and will produce BUSY errors.
- **Using WAL mode without a write queue**: WAL mode prevents BUSY on concurrent reads, but write-write conflicts still produce BUSY if multiple async operations attempt concurrent writes.
- **Setting journal_mode AFTER creating tables**: Always set pragmas before any DDL.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE streaming | Manual `text/event-stream` response with flush() | fastify-sse-v2 | Handles keep-alive, heartbeat, Last-Event-ID replay, client disconnect cleanup |
| SQLite write serialization | Custom mutex/lock | EventEmitter queue with better-sqlite3 sync API | better-sqlite3's sync model makes queue trivial; mutex patterns introduce deadlock risk |
| HTTP POST from Python | `requests` library | `urllib.request` stdlib | Zero additional dependencies; already in Python stdlib |
| Correlation ID generation | Manual UUID v4 | `crypto.randomUUID()` (Node.js 19+) | Built-in, RFC 4122 compliant, no package needed |

**Key insight:** The entire stack is either stdlib or single-purpose libraries with no transitive dependency bloat. Keep it that way.

---

## Common Pitfalls

### Pitfall 1: relay.py Blocks Claude Code Session

**What goes wrong:** If `relay.py` hangs (server hung, not just down), it blocks the Claude Code tool call indefinitely. Connection refused (server down) returns immediately, but a hanging server does not.

**Why it happens:** `urllib.request.urlopen()` with no timeout will wait forever if the server accepts the TCP connection but never sends a response.

**How to avoid:** Always pass `timeout=0.5` (500ms) to `urlopen()`. Wrap the entire `main()` in `try/except Exception: pass`.

**Warning signs:** Claude Code tool calls become slow when ObservAgent server is running but stuck.

### Pitfall 2: SQLITE_BUSY Under Concurrent Agent Writes

**What goes wrong:** Multiple GSD agents fire hooks simultaneously → multiple HTTP POSTs arrive within milliseconds → two write operations attempt to execute concurrently → `SQLITE_BUSY: database is locked`.

**Why it happens:** SQLite allows only one writer at a time. WAL mode helps with read/write concurrency but not write/write.

**How to avoid:** All writes go through the single `WriteQueue` instance. The queue serializes writes using `setImmediate` — the event loop processes one write per tick, preventing concurrent writes.

**Warning signs:** `SQLITE_BUSY` errors in server stdout during multi-agent GSD runs.

### Pitfall 3: 202 Sent After DB Write (Success Criterion Violation)

**What goes wrong:** Fastify's async handler awaits the DB write before `reply.send()` → logs show "DB write complete" before "202 sent" → Phase 1 success criterion #4 fails.

**Why it happens:** Natural coding instinct: do the work, then send the response.

**How to avoid:** Send 202 first. Use `setImmediate(() => writeQueue.enqueue(event))` after `reply.send()` to guarantee the response is flushed before the write begins.

**Warning signs:** Log timestamps show write before response during manual testing.

### Pitfall 4: relay.py Output Pollutes Claude Code Session

**What goes wrong:** Any `print()`, `sys.stdout.write()`, or uncaught exception traceback in `relay.py` appears in Claude Code's terminal output, confusing the user and potentially interfering with Claude's context.

**Why it happens:** Claude Code runs hooks with its own stdout/stderr, and uncaught Python exceptions print tracebacks to stderr.

**How to avoid:** Wrap entire `main()` in `try/except Exception: pass`. Never write to stdout or stderr. `sys.exit(0)` always.

**Warning signs:** Tracebacks or JSON snippets appearing in Claude Code terminal during tool calls.

### Pitfall 5: SSE Client Leak on Disconnect

**What goes wrong:** Browser tab closes → socket closes → `clients` Set still holds the dead reply object → next broadcast throws on closed socket → uncaught error crashes the broadcast.

**Why it happens:** The SSE connection close event must be explicitly handled.

**How to avoid:** Register `request.socket.on('close', () => removeClient(reply))` in the SSE route handler. Wrap `reply.sse()` calls in try/catch in the broadcast function.

**Warning signs:** Server throws unhandled errors on broadcast after browser tab close.

### Pitfall 6: Fastify v4 vs v5 API Differences

**What goes wrong:** Code written for Fastify v4 may use deprecated APIs removed in v5 (20 breaking changes). Most significant: v5 removed convenient JSON Schema shorthands, requires Node.js 20+.

**Why it happens:** STATE.md references "Fastify 4.x" but v4 reached EOL June 30, 2025.

**How to avoid:** Use Fastify 5 from the start (new project, no migration cost). Verify Node.js version >= 20 on the development machine.

**Warning signs:** `npm install fastify` installs v5 by default; v4 must be explicitly pinned with `fastify@4`.

---

## Code Examples

Verified patterns from official sources:

### Claude Code Hook Input (PreToolUse)

```json
// Source: https://code.claude.com/docs/en/hooks (official docs, 2026-02-26)
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../transcript.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test"
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

### Claude Code Hook Input (PostToolUse)

```json
// Source: https://code.claude.com/docs/en/hooks (official docs, 2026-02-26)
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../transcript.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file content"
  },
  "tool_response": {
    "filePath": "/path/to/file.txt",
    "success": true
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

**Key fields for relay.py:** `session_id`, `hook_event_name`, `tool_name`, `tool_use_id`

**Note:** `tool_use_id` is the natural correlation ID for linking PreToolUse and PostToolUse pairs. Use it directly as `tool_call_id` in the schema — no custom ID generation needed for Phase 1.

### Fastify 5 Server Bootstrap

```javascript
// Source: Fastify 5 docs pattern
import Fastify from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { initDb } from './db/schema.js';
import { WriteQueue } from './lib/writeQueue.js';

const fastify = Fastify({ logger: false }); // manual stdout logging per CONTEXT.md
fastify.register(FastifySSEPlugin);

const db = initDb('./observagent.db');
const writeQueue = new WriteQueue(db);

// Routes registered in server.js or via fastify.register()
fastify.listen({ port: 4999, host: '127.0.0.1' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log('[server] ObservAgent listening on port 4999');
});
```

### better-sqlite3 WAL Mode Setup

```javascript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
import Database from 'better-sqlite3';

const db = new Database('./observagent.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```

### settings.json Hook Configuration (async: true alternative — NOT used in Phase 1)

```json
// Source: https://code.claude.com/docs/en/hooks (official docs, 2026-02-26)
// NOTE: async:true was released Jan 2026. We use relay.py per CONTEXT.md decisions.
// This is shown for reference — it would eliminate relay.py entirely.
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python /path/to/relay.py",
            "async": true
          }
        ]
      }
    ]
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fastify v4 | Fastify v5 | v5 released Sept 2024; v4 EOL June 2025 | v5 is current stable; v4 unsupported. Use v5 for new projects. |
| Synchronous hook (blocks Claude) | `async: true` hook (background, non-blocking) | January 2026 (Claude Code 2.1.0) | relay.py with 500ms timeout can be replaced by `async: true` — but CONTEXT.md locks relay.py for Phase 1 |
| node-sqlite3 (async callbacks) | better-sqlite3 (sync) | ~2017, now dominant | Sync API makes write queue trivial; no callback pyramid |
| Custom SSE framing | fastify-sse-v2 | Plugin stable since Fastify 3 era | Handles heartbeat, disconnect, backpressure |

**Deprecated/outdated:**
- `fastify-sse` (not `fastify-sse-v2`): unmaintained; use `fastify-sse-v2` instead
- Fastify v4: EOL since June 30, 2025 — do not use for new projects
- `requests` in relay.py: not stdlib; use `urllib.request` for zero-dep hook script

---

## Open Questions

1. **relay.py vs async: true hook**
   - What we know: `async: true` (Jan 2026) makes relay.py architecturally unnecessary — Claude Code itself handles the background execution
   - What's unclear: Whether the CONTEXT.md decision for relay.py was made before this feature was known
   - Recommendation: Implement relay.py as locked in CONTEXT.md. After Phase 1 ships, consider replacing with `async: true` + a direct shell command that POSTs to the server (e.g., `curl -s -m 0.5 -X POST http://localhost:4999/ingest -d @- -H 'Content-Type: application/json' || true`)

2. **tool_use_id availability in PreToolUse**
   - What we know: `tool_use_id` field is present in PostToolUse input per official docs
   - What's unclear: Whether `tool_use_id` is also present in PreToolUse input (docs show it for PostToolUse explicitly)
   - Recommendation: Test with a real hook call before coding the correlation logic. If absent in PreToolUse, generate a UUID in relay.py and store it with the PreToolUse event; the PostToolUse call will include `tool_use_id` for matching.

3. **Fastify v5 + fastify-sse-v2 compatibility**
   - What we know: fastify-sse-v2 v4.2.2 states "Fastify 3.x and above" — ambiguous on v5
   - What's unclear: Whether fastify-sse-v2 v4.2.2 is confirmed compatible with Fastify 5.x
   - Recommendation: Run `npm install fastify fastify-sse-v2` and verify no peer dependency warnings. If incompatible, fall back to raw SSE streams (not complex — just `reply.raw.write('data: ...\n\n')`).

---

## Sources

### Primary (HIGH confidence)
- `https://code.claude.com/docs/en/hooks` — Official Claude Code hooks reference; hook lifecycle, input schemas for PreToolUse/PostToolUse, exit codes, `async: true` feature, settings.json format. Fetched 2026-02-26.
- `https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md` — WAL mode setup, concurrent write limitations, checkpoint management. Fetched 2026-02-26.

### Secondary (MEDIUM confidence)
- `https://github.com/mpetrunic/fastify-sse-v2` — fastify-sse-v2 v4.2.2 usage examples, async generator pattern, client disconnect handling. Verified against official GitHub. Fetched 2026-02-26.
- `https://fastify.dev/docs/latest/Reference/LTS/` — Fastify version support, v4 EOL date (June 30 2025), v5 as current stable. Fetched 2026-02-26.
- `https://www.npmjs.com/package/better-sqlite3` — Current version 12.6.2. Published January 2026.

### Tertiary (LOW confidence)
- WebSearch results on Fastify v5 breaking changes — multiple sources agree on ~20 breaking changes and EOL date; not verified against official migration guide directly.
- WebSearch results on Node.js write queue patterns — EventEmitter queue pattern described matches better-sqlite3 sync API design, but exact implementation not from a single authoritative source.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm/GitHub, official docs confirm library APIs
- Architecture: HIGH — hook input schemas from official docs; patterns follow library documentation
- Pitfalls: HIGH — BUSY errors/WAL mode from official better-sqlite3 docs; relay.py pitfalls from official hook exit code docs; Fastify v4 EOL from official LTS page

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days — stable ecosystem; fastify-sse-v2 compatibility with Fastify 5 is the main uncertainty to re-check if issues arise)
