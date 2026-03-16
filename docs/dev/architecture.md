# Architecture

## Overview

ObservAgent is a single-process Node.js server that runs locally alongside Claude Code. It receives events through Claude Code's hooks system, stores them in SQLite, and streams them to a React dashboard over SSE.

**Design principles:**
- **Local-first** — binds to `127.0.0.1` only; no external network at runtime.
- **Zero code changes** — uses Claude Code hooks; no SDK wrapping required.
- **Single writer** — all SQLite writes go through one serialized queue to prevent `SQLITE_BUSY`.
- **Fire-and-forget hooks** — `relay.py` always exits 0 within 500ms to never block Claude Code.

---

## End-to-end data flow

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Code process                                         │
│                                                              │
│  PreToolUse ──► relay.py ──► POST /ingest ──► WriteQueue ──►│
│  PostToolUse ──► relay.py ──► POST /ingest ──► WriteQueue ──►│──► events table
│  SubagentStart ──► relay.py ──► POST /ingest ──────────────►│
│  SubagentStop  ──► relay.py ──► POST /ingest ──────────────►│──► agent_nodes table
└─────────────────────────────────────────────────────────────┘

~/.claude/projects/**/*.jsonl ──► jsonlWatcher ──► api_calls table
                                                ──► session_cost table

SSE /events ◄──── sseClients.broadcast() ◄──── ingest + jsonlWatcher

Browser ◄──── GET /api/* (REST) ◄──── SQLite reads (not queued)
Browser ◄──── EventSource /events ◄──── SSE broadcast
```

---

## Component map

| File | Role |
|---|---|
| `bin/cli.js` | CLI entry point (`commander`). Dispatches to `lib/cmd-*.js`. |
| `lib/cmd-init.js` | Installs `relay.py` + patches `~/.claude/settings.json`. |
| `lib/cmd-start.js` | Spawns server, polls port, opens browser, shows update banner. |
| `lib/cmd-doctor.js` | Health checks with optional auto-repair. |
| `server.js` | Fastify server bootstrap. Wires routes, DB, WriteQueue, SSE, JSONL watcher. |
| `routes/ingest.js` | `POST /ingest` handler. Pre/Post pairing, agent_nodes CRUD, SSE emit. |
| `routes/sse.js` | `GET /events` — opens and keeps SSE connections alive. |
| `routes/api.js` | REST read API for events, cost, sessions, agents, config, export. |
| `routes/insights.js` | Analytics: activity, tokens, latency, error rate, cost charts. |
| `routes/dashboard.js` | Serves React SPA (`public/dist/`) and legacy vanilla dashboard. |
| `lib/writeQueue.js` | FIFO queue that serializes all `INSERT INTO events` calls. |
| `lib/costEngine.js` | Pure pricing math — deduplication, cost, context fill %. |
| `lib/jsonlWatcher.js` | Watches JSONL files; upserts `session_cost` + `api_calls`; broadcasts `cost_update`. |
| `lib/sseClients.js` | In-memory `Set<reply>` of active SSE connections; `broadcast()` helper. |
| `db/schema.js` | `initDb()` — creates/migrates all 5 tables; WAL mode. |
| `hooks/relay.py` | Python hook relay. Reads stdin → POST `/ingest`. Never blocks. |
| `frontend/src/` | React 18 + TypeScript SPA. Built to `public/dist/` by Vite. |

---

## Key design decisions

### WAL mode SQLite

SQLite is opened in WAL (Write-Ahead Log) mode with `synchronous = NORMAL`. This enables concurrent reads while a write is in progress — critical because the SSE route reads the DB constantly while the ingest route writes.

### Single WriteQueue

All event inserts go through `lib/writeQueue.js`, a simple FIFO that calls `setImmediate` between writes. This prevents `SQLITE_BUSY` errors that would occur if multiple concurrent `/ingest` requests tried to write simultaneously. Reads (all `GET /api/*` routes) bypass the queue and hit SQLite directly.

### 202 before write

`POST /ingest` sends `202 Accepted` before the DB write is enqueued. This is intentional: `relay.py` has a 500ms timeout and blocks Claude Code until it gets a response. The response is decoupled from the write so hook latency stays < 1ms even under load.

### Pre/Post event pairing

`PreToolUse` events are stored in an in-memory `Map<tool_call_id, {startTs, session_id}>`. When the matching `PostToolUse` arrives, `duration_ms = now - startTs` is computed and stored on the event row. This Map is cleaned up every 60 seconds (5-minute TTL) to prevent memory leaks from unmatched events.

### JSONL watcher for cost data

Claude Code writes token usage to `~/.claude/projects/**/*.jsonl` asynchronously. ObservAgent watches these files with `fs.watch` + a 300ms debounce. `costEngine.js` deduplicates by message ID (streaming chunks emit multiple records per `messageId`; only the last/highest-count record is kept) before upserting into `session_cost` and `api_calls`.

### Context fill calculation

`getContextFillPercent()` in `costEngine.js` subtracts 40,000 tokens from the model's context window before computing the fill percentage. This matches Claude Code's own display — Claude Code reserves a ~40K autocompact buffer that is not usable for actual content.

### Agent tree construction

`SubagentStart` upserts a row in `agent_nodes` with `parent_session_id` linking subagents to their top-level session. A synthetic `'session'` node is also created for the first `PreToolUse` of any session, so solo (non-subagent) sessions still appear in the tree. On server restart, all `active` nodes are marked `interrupted` to clear stale green dots from the previous run.

---

## Port and DB path

| Variable | CLI default | `observagent start` default |
|---|---|---|
| `PORT` | `4999` | `4999` |
| `OBSERVAGENT_DB_PATH` | `./observagent.db` | `~/.local/share/observagent/observagent.db` (macOS/Linux) or `%APPDATA%/observagent/observagent.db` (Windows) |

When running the server directly with `node server.js`, the DB is written to `./observagent.db` in the CWD. When using the CLI (`observagent start`), the DB is placed in the platform data directory and the parent directory is created automatically.
