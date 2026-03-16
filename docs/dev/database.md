# Database Schema

**Driver:** `better-sqlite3` (synchronous API)
**File:** `db/schema.js` — exported function `initDb(path)`
**Mode:** WAL (Write-Ahead Log) with `synchronous = NORMAL`

WAL mode and `synchronous = NORMAL` are set before any DDL. This combination allows concurrent readers while a write is in progress, and is safe against process crashes (though not OS crashes).

---

## Initialization

```js
import { initDb } from './db/schema.js';

const db = initDb('/path/to/observagent.db');
```

`initDb`:
1. Creates the parent directory if it does not exist (`mkdirSync({ recursive: true })`).
2. Opens the SQLite file (creates it if absent).
3. Sets `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL`.
4. Runs all `CREATE TABLE IF NOT EXISTS` statements.
5. Runs `addColumnIfNotExists()` migrations for columns added after initial release.
6. Seeds default config values (`INSERT OR IGNORE`).

---

## Migration strategy

Migrations use `addColumnIfNotExists(db, table, column, typeDef)` which inspects `PRAGMA table_info(table)` and runs `ALTER TABLE ... ADD COLUMN` only if the column is absent. This is additive-only — columns are never dropped or renamed.

---

## Tables

### `events`

Every `PreToolUse` and `PostToolUse` hook event. One row per hook invocation.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER | NO | Primary key, autoincrement |
| `tool_name` | TEXT | NO | e.g. `Bash`, `Read`, `Task` |
| `hook_type` | TEXT | NO | `PreToolUse` or `PostToolUse` |
| `session_id` | TEXT | NO | Claude Code session UUID |
| `agent_id` | TEXT | YES | Subagent hex ID; empty string for top-level; added via migration |
| `tool_call_id` | TEXT | YES | Matches Pre to Post for duration calculation |
| `timestamp` | INTEGER | NO | Unix ms (server-side, at time of ingest) |
| `duration_ms` | INTEGER | YES | Computed on `PostToolUse`; `NULL` on `PreToolUse` |
| `exit_status` | INTEGER | YES | `0` or `1` for Bash; `NULL` for all other tools |
| `tool_summary` | TEXT | YES | Safe summary string from relay; added via migration |

**Indexes:**
- `idx_events_agent_id` on `(agent_id, timestamp DESC)`

---

### `session_cost`

Aggregated token usage and cost per `(session_id, agent_id)` pair. `agent_id = ''` is the session-level total. Populated and updated by `lib/jsonlWatcher.js` via upsert.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `session_id` | TEXT | NO | |
| `agent_id` | TEXT | NO | Default `''` (session level) |
| `model` | TEXT | NO | Last model seen in the JSONL file |
| `input_tokens` | INTEGER | NO | Default 0 |
| `output_tokens` | INTEGER | NO | Default 0 |
| `cache_read_tokens` | INTEGER | NO | Default 0 |
| `cache_write_5m` | INTEGER | NO | Ephemeral 5-minute cache writes |
| `cache_write_1h` | INTEGER | NO | Ephemeral 1-hour cache writes |
| `total_cost_usd` | REAL | NO | Default 0.0 |
| `last_event_ts` | TEXT | YES | ISO 8601 timestamp from the JSONL record |
| `updated_at` | INTEGER | NO | Unix ms of last upsert |
| `project_name` | TEXT | NO | Default `''`; git root name or cwd basename; added via migration |

**Primary key:** `(session_id, agent_id)`

**Indexes:**
- `idx_session_cost_ts` on `(last_event_ts)`
- `idx_session_cost_project` on `(project_name, last_event_ts DESC)`

---

### `observagent_config`

Key-value store for runtime user configuration.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT | Primary key |
| `value` | TEXT | Serialized value (always a string) |

**Pre-seeded keys** (inserted `OR IGNORE` on every startup):

| Key | Default | Description |
|---|---|---|
| `full_tool_input_enabled` | `'0'` | Debug mode — logs raw tool input to stdout when `'1'` |

**User-set keys** (via `POST /api/config`):

| Key | Description |
|---|---|
| `budget_threshold_usd` | Triggers budget alert in dashboard when `total_cost_usd` exceeds this |
| `ctx_fill_threshold_pct` | Triggers context alert when context fill % exceeds this |

---

### `agent_nodes`

One row per known agent or session-root node. Updated by `routes/ingest.js` on `SubagentStart` and `SubagentStop` events.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `agent_id` | TEXT | NO | Primary key. Hex string for subagents; `session_id` for session-root nodes |
| `parent_session_id` | TEXT | NO | Links to the top-level session |
| `agent_type` | TEXT | NO | Default `''`; from `SubagentStart` hook; `'session'` for root nodes |
| `state` | TEXT | NO | Default `'active'`; see states below |
| `spawned_at` | INTEGER | NO | Unix ms of first seen |
| `last_activity_ts` | INTEGER | NO | Updated on `PreToolUse`, `SubagentStart`, `SubagentStop` |
| `initial_prompt` | TEXT | YES | The `Task` description that spawned this subagent; added via migration |
| `transcript_path` | TEXT | YES | Path to the subagent's `.jsonl` file; added via migration |

**Agent states:**

| State | Set when |
|---|---|
| `active` | Default on upsert |
| `completed` | `SubagentStop` received |
| `stale` | `last_activity_ts` > 10 minutes ago (cleanup timer in ingest.js) |
| `interrupted` | Server startup — any `active` row from previous run |

**Index:** `idx_agent_nodes_parent` on `(parent_session_id)`

---

### `api_calls`

One row per Claude API call with token counts. Populated from JSONL files by `lib/jsonlWatcher.js`. The unique constraint on `(session_id, timestamp_ms)` prevents duplicate ingestion on server restart (since JSONL files are re-processed from the beginning on each startup).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER | NO | Primary key, autoincrement |
| `session_id` | TEXT | NO | |
| `timestamp_ms` | INTEGER | NO | From JSONL record; milliseconds |
| `input_tokens` | INTEGER | NO | Default 0 |
| `output_tokens` | INTEGER | NO | Default 0 |
| `cache_read_tokens` | INTEGER | NO | Default 0; added via migration |
| `cache_write_tokens` | INTEGER | NO | Default 0; sum of 5m + 1h writes; added via migration |

**Unique constraint:** `(session_id, timestamp_ms)` — `INSERT OR IGNORE`

**Index:** `idx_api_calls_session_ts` on `(session_id, timestamp_ms)`

---

## Write path

All inserts into `events` go through `lib/writeQueue.js` (serialized FIFO). All other writes (`session_cost`, `agent_nodes`, `api_calls`, `observagent_config`) are done directly with prepared statements. Only the high-frequency `events` table requires the queue — other tables have lower write rates.

## Read path

All `GET /api/*` routes read directly from `db` using prepared statements. Reads are not queued. WAL mode ensures reads never block behind a write.
