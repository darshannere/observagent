# API Reference

All endpoints are served by the local server at `http://localhost:4999`. All `GET` endpoints return `application/json`. The `POST /ingest` endpoint is internal — it is called by `relay.py` only.

---

## Ingest

### `POST /ingest`

**File:** `routes/ingest.js`

Receives a hook event from `relay.py`. Always responds `202 Accepted` before the DB write, to keep hook latency minimal.

#### Request body

```json
{
  "tool_name": "Bash",
  "hook_type": "PreToolUse",
  "session_id": "abc123",
  "agent_id": "",
  "tool_call_id": "toolu_01XYZ",
  "exit_status": null,
  "tool_summary": "command: npm test",
  "initial_prompt": "Run the test suite",
  "agent_type": "",
  "agent_transcript_path": ""
}
```

| Field | Type | Present on |
|---|---|---|
| `tool_name` | string | All events |
| `hook_type` | string | All events — `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop` |
| `session_id` | string | All events |
| `agent_id` | string | All events — empty string for top-level session |
| `tool_call_id` | string\|null | `PreToolUse`, `PostToolUse` |
| `exit_status` | int\|null | `PostToolUse` for `Bash` tool; `0` = clean, `1` = stderr present |
| `tool_summary` | string\|null | `PreToolUse`, `PostToolUse` |
| `initial_prompt` | string | `PreToolUse` for `Task` tool only |
| `agent_type` | string | `SubagentStart`, `SubagentStop` |
| `agent_transcript_path` | string | `SubagentStart`, `SubagentStop` |

#### Response

`202 Accepted` — empty body.

---

## SSE

### `GET /events`

**File:** `routes/sse.js`

Opens a persistent Server-Sent Events stream. Use `EventSource` in the browser or `curl -N`.

#### Headers set

```
Content-Type: text/event-stream
X-Accel-Buffering: no
```

(`X-Accel-Buffering: no` prevents nginx from buffering the SSE stream.)

#### Event types

Each SSE message is `data: <JSON string>\n\n`.

| `type` | Emitted by | Payload fields |
|---|---|---|
| `connected` | On connect | `{ type, ts }` |
| `agent_spawn` | `SubagentStart` | `{ type, agentId, parentSessionId, agentType, spawnedAt, transcriptPath, initialPrompt }` |
| `agent_update` | `SubagentStop` | `{ type, agentId, state }` |
| `cost_update` | JSONL watcher | `{ type, sessionId, agentId, cost, projectName, tokens: {input, output, cacheRead, cacheWrite}, contextFillPct, model, ts }` |
| `health_update` | *(future)* | `{ type, ... }` |
| *(hook event)* | `PreToolUse`, `PostToolUse` | Full event row including `hook_type`, `tool_name`, `session_id`, `agent_id`, `tool_call_id`, `timestamp`, `duration_ms`, `exit_status`, `tool_summary` |

---

## Metadata & health

### `GET /api/meta`

Returns the running server version.

```json
{ "version": "2.4.3" }
```

---

### `GET /api/health`

Returns aggregate health metrics computed over all events.

```json
{
  "lastEventTs": 1741234567890,
  "errorRate": 0.03,
  "errorCount": 12,
  "totalCalls": 400,
  "serverUptimeS": 3601
}
```

---

## Events

### `GET /api/events`

Returns recent `PostToolUse` events. Includes nearest token counts from `api_calls` via correlated subquery.

#### Query params

| Param | Description |
|---|---|
| `session_id` | If provided, returns up to **500** events for that session. Otherwise returns the **200** most recent global events. |

#### Response

```json
[
  {
    "id": 1,
    "tool_name": "Bash",
    "hook_type": "PostToolUse",
    "session_id": "abc123",
    "agent_id": "",
    "tool_call_id": "toolu_01XYZ",
    "timestamp": 1741234567890,
    "duration_ms": 342,
    "exit_status": 0,
    "tool_summary": "command: npm test",
    "nearest_input_tokens": 45000,
    "nearest_output_tokens": 1200
  }
]
```

---

## Cost & sessions

### `GET /api/cost`

Returns per-session cost data for the last 50 sessions, sorted by most recently updated. Only returns `agent_id = ''` rows (session-level aggregates, not per-subagent rows).

```json
{
  "sessions": [
    {
      "session_id": "abc123",
      "model": "claude-sonnet-4-6",
      "input_tokens": 120000,
      "output_tokens": 8000,
      "cache_read_tokens": 50000,
      "cache_write_5m": 2000,
      "cache_write_1h": 1000,
      "total_cost_usd": 0.042,
      "last_event_ts": "2026-03-16T03:00:00.000Z",
      "updated_at": 1741234567890,
      "project_name": "observagent"
    }
  ],
  "todayTotal": 0.21
}
```

---

### `GET /api/sessions`

Filtered session list with live/error flags. Used by the History page.

#### Query params

| Param | Type | Description |
|---|---|---|
| `project` | string | Filter by `project_name` (exact match) |
| `date_from` | string | ISO date — sessions with `last_event_ts >=` this |
| `date_to` | string | ISO date — sessions with `last_event_ts <=` this |
| `model` | string | Filter by model name (partial match via `LIKE`) |
| `cost_min` | number | Minimum `total_cost_usd` |
| `cost_max` | number | Maximum `total_cost_usd` |
| `has_errors` | `'true'` | Only return sessions with at least one error event |

#### Response

Array of session objects, each augmented with:

```json
{
  "session_id": "abc123",
  "model": "claude-sonnet-4-6",
  "total_cost_usd": 0.042,
  "last_event_ts": "2026-03-16T03:00:00.000Z",
  "project_name": "observagent",
  "is_live": true,
  "has_errors": false
}
```

`is_live` is `true` if `last_event_ts` is within the last 10 minutes.

---

### `GET /api/sessions/:id/export`

Exports a single session for download.

```json
{
  "session": { /* session_cost row */ },
  "events": [
    {
      "tool_name": "Bash",
      "timestamp": 1741234567890,
      "duration_ms": 342,
      "exit_status": 0,
      "tool_summary": "command: npm test"
    }
  ]
}
```

`events` contains only `PostToolUse` rows, ordered by `timestamp ASC`. Used by the History page's JSONL/CSV export buttons.

---

## Agents

### `GET /api/agents`

Returns all agent_nodes rows with aggregated cost and token totals.

```json
[
  {
    "agent_id": "abc123",
    "parent_session_id": "abc123",
    "agent_type": "session",
    "state": "active",
    "spawned_at": 1741234000000,
    "last_activity_ts": 1741234567890,
    "initial_prompt": null,
    "transcript_path": null,
    "total_cost_usd": 0.042,
    "total_tokens": 128000
  }
]
```

---

### `GET /api/agents/:id/detail`

Returns detailed breakdown for a single agent.

```json
{
  "agent": { /* agent_nodes row */ },
  "toolCalls": [
    { "tool_name": "Bash", "timestamp": 1741234567890, "duration_ms": 342, "exit_status": 0 }
  ],
  "tokenBreakdown": [
    { "timestamp_ms": 1741234567000, "input_tokens": 45000, "output_tokens": 1200, "cache_read_tokens": 20000, "cache_write_tokens": 500 }
  ]
}
```

`toolCalls` — `PostToolUse` events for this agent, ordered by timestamp DESC.
`tokenBreakdown` — all `api_calls` rows for the parent session, ordered by timestamp ASC.

---

### `GET /api/agents/:id/context`

Reads the agent's JSONL transcript file and returns the last 50 conversation turns.

```json
{
  "turns": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "total_lines": 312
}
```

Returns `404` if `transcript_path` is null or the file does not exist.

---

## Config

### `GET /api/config`

Returns current budget alert thresholds.

```json
{
  "budget_threshold_usd": 1.00,
  "ctx_fill_threshold_pct": 80
}
```

Values are `null` if not set.

---

### `POST /api/config`

Updates budget alert thresholds. Send `null` to clear a value.

#### Request body

```json
{
  "budget_threshold_usd": 1.00,
  "ctx_fill_threshold_pct": 80
}
```

#### Response

```json
{ "ok": true }
```

---

## Insights

All insights endpoints return pre-aggregated data from SQLite for chart rendering. All are `GET`.

### `GET /api/insights/activity?session_id=`

Tool calls per 1-minute bucket for a session.

```json
[{ "bucket_ms": 1741234500000, "tool_calls": 12 }]
```

`session_id` is required.

---

### `GET /api/insights/tokens-over-time?session_id=`

Input + output tokens per 1-minute bucket, from `api_calls`.

```json
[{ "bucket_ms": 1741234500000, "input_tokens": 45000, "output_tokens": 1200 }]
```

`session_id` is required.

---

### `GET /api/insights/error-rate?session_id=`

Errors per 5-minute bucket. `session_id` is optional — omit for global view.

```json
[{ "bucket_ms": 1741234500000, "errors": 2, "total": 45 }]
```

---

### `GET /api/insights/stalled-agents`

Agents that have been `active` for more than 10 minutes without activity.

```json
[
  {
    "agent_id": "deadbeef",
    "agent_type": "general-purpose",
    "last_activity_ts": 1741234000000,
    "idle_seconds": 720
  }
]
```

---

### `GET /api/insights/latency-by-tool?session_id=`

p50 and p95 latency per tool. Requires at least 2 samples per tool.

```json
[
  { "tool_name": "Bash", "p50_ms": 280, "p95_ms": 2100, "sample_count": 42 }
]
```

Uses SQLite's `NTILE(100)` window function to approximate percentiles.

---

### `GET /api/insights/cost-daily`

Daily cost totals for the last 6 days + today (7 rows).

```json
[{ "day": "2026-03-16", "cost_usd": 0.21 }]
```

---

### `GET /api/insights/cost-by-agent`

Aggregate cost grouped by `agent_type`.

```json
[{ "agent_type": "general-purpose", "cost_usd": 1.42 }]
```
