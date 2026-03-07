---
phase: "10"
plan: "01"
subsystem: backend
tags: [schema, api, relay, agent-detail, cache-tokens, initial-prompt]
dependency_graph:
  requires: []
  provides: [initial_prompt-column, cache-token-columns, agent-detail-endpoint]
  affects: [frontend-agent-panel, jsonlWatcher, ingest-route]
tech_stack:
  added: []
  patterns: [pendingInitialPrompts-map, addColumnIfNotExists-migration, inline-prepared-statements]
key_files:
  created: []
  modified:
    - db/schema.js
    - hooks/relay.py
    - routes/ingest.js
    - lib/jsonlWatcher.js
    - routes/api.js
decisions:
  - relay.py sends initial_prompt on Task PreToolUse; ingest.js stashes per-session and claims on SubagentStart — avoids needing tool_call_id correlation
  - api_calls.cache_write_tokens = cacheWrite5m + cacheWrite1h combined — detail panel needs one number not two ephemeral tiers
  - GET /api/agents/:id/detail queries api_calls by parent_session_id — api_calls table uses session_id not agent_id; parent session is the correct lookup key
  - Inline prepared statements for detail endpoint — low-frequency route, no need to hoist to registration time
metrics:
  duration: "2 min"
  completed: "2026-03-07"
  tasks_completed: 4
  files_modified: 5
---

# Phase 10 Plan 01: Backend & Database Changes Summary

**One-liner:** DB schema migration adds initial_prompt to agent_nodes and cache token columns to api_calls, with relay + ingest updates to populate them, plus a new /api/agents/:id/detail endpoint.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add database schema columns | e5f262c | db/schema.js |
| 2 | Update relay.py to capture initial prompt | aa3e65c | hooks/relay.py, routes/ingest.js |
| 3 | Update relay.py to capture cache tokens | a9b92e1 | lib/jsonlWatcher.js |
| 4 | Create GET /api/agents/:id/detail endpoint | 4dfa9c5 | routes/api.js |

## What Was Built

### Task 1: Schema Columns
Added three columns via `addColumnIfNotExists` (safe migration, idempotent on restart):
- `initial_prompt TEXT` on `agent_nodes` — stores the Task tool description that spawned an agent
- `cache_read_tokens INTEGER NOT NULL DEFAULT 0` on `api_calls`
- `cache_write_tokens INTEGER NOT NULL DEFAULT 0` on `api_calls`

### Task 2: Initial Prompt Capture
Two-stage capture because relay.py fires on Task PreToolUse but the agent_id isn't known until SubagentStart:
1. relay.py: extracts `tool_input.description` for Task tool events, sends as `initial_prompt` field (truncated at 2000 chars)
2. ingest.js: `pendingInitialPrompts` Map (keyed by session_id) stashes it; SubagentStart handler claims it and calls `updateAgentInitialPrompt`
3. 5-minute TTL cleanup prevents map growth if SubagentStart never arrives

### Task 3: Cache Token Population
The plan mentioned relay.py but cache token data comes from JSONL transcripts, not hook events. Updated `jsonlWatcher.js` `insertApiCallStmt` to include `cache_read_tokens` and `cache_write_tokens` using the already-extracted `cacheReadTokens` and `cacheWrite5m + cacheWrite1h` values from `extractUsageRecords`.

### Task 4: Agent Detail Endpoint
`GET /api/agents/:id/detail` returns:
```json
{
  "agent": { "agent_id", "parent_session_id", "agent_type", "state", "spawned_at", "last_activity_ts", "initial_prompt" },
  "toolCalls": [{ "timestamp", "tool_name", "duration_ms", "exit_status", "tool_summary" }, ...],
  "tokenBreakdown": [{ "timestamp_ms", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens" }, ...]
}
```
404 when agent not found. Tool calls are PostToolUse events filtered by agent_id. Token breakdown queries api_calls by parent_session_id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Implementation Correction] Task 3 target is jsonlWatcher.js, not relay.py**
- **Found during:** Task 3
- **Issue:** Plan says "modify API call event handling in relay.py to extract cache tokens from API response." relay.py is a hook relay that fires on tool use events — it never sees API responses. Cache token data comes from Claude Code's JSONL transcript files, which jsonlWatcher.js already parses and has full cacheReadTokens/cacheWrite5m/1h data from extractUsageRecords().
- **Fix:** Updated `insertApiCallStmt` in jsonlWatcher.js to include cache_read_tokens and cache_write_tokens. No relay.py change needed for Task 3.
- **Files modified:** lib/jsonlWatcher.js
- **Commit:** a9b92e1

## Verification

- Schema migration runs without errors: confirmed via `node --input-type=module` test
- `agent_nodes` columns include `initial_prompt`: confirmed via PRAGMA table_info
- `api_calls` columns include `cache_read_tokens`, `cache_write_tokens`: confirmed via PRAGMA table_info
- relay.py syntax: confirmed via `python3 -m py_compile`
- `/api/agents/:id/detail` endpoint added to routes/api.js

## Self-Check: PASSED

All files confirmed present. All commits confirmed in git log:
- e5f262c: feat(10-01): add initial_prompt and cache token columns to schema
- aa3e65c: feat(10-01): capture initial prompt when Task tool spawns a subagent
- a9b92e1: feat(10-01): populate cache_read_tokens and cache_write_tokens in api_calls
- 4dfa9c5: feat(10-01): add GET /api/agents/:id/detail endpoint
