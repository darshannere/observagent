---
phase: 04-multi-agent-observability
plan: 01
subsystem: database, api
tags: [sqlite, better-sqlite3, fastify, sse, python, hooks]

# Dependency graph
requires:
  - phase: 03-cost-and-token-tracking
    provides: db/schema.js initDb() pattern, WAL mode setup, prepared statement patterns in api.js and ingest.js
  - phase: 01-foundation
    provides: WriteQueue, broadcast(), sseClients, ingestRoutes/apiRoutes plugin pattern
provides:
  - agent_nodes SQLite table with 6-column schema and parent_session_id index
  - relay.py SubagentStart/SubagentStop field extraction (agent_id, agent_type, agent_transcript_path)
  - ingest.js SubagentStart handler: upsert agent_nodes row + broadcast agent_spawn SSE event
  - ingest.js SubagentStop handler: update state to completed + broadcast agent_update SSE event
  - GET /api/agents endpoint returning full agent hierarchy ordered by spawned_at ASC
  - ~/.claude/settings.json SubagentStart/SubagentStop hook entries
affects: [04-02-agent-tree-rendering, 04-03-per-agent-cost, 04-04-stuck-detection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agent lifecycle tracked via separate agent_nodes table (not events table) — prevents pollution of tool event stream"
    - "Early return in setImmediate for SubagentStart/SubagentStop — agent events don't enter writeQueue"
    - "upsertAgentNode uses ON CONFLICT DO UPDATE — idempotent for duplicate SubagentStart events"
    - "Prepared statements for agent_nodes at registration time in ingest.js — consistent with api.js pattern"

key-files:
  created: []
  modified:
    - db/schema.js
    - hooks/relay.py
    - routes/ingest.js
    - routes/api.js
    - server.js
    - ~/.claude/settings.json

key-decisions:
  - "agent_nodes is separate from events table — SubagentStart/SubagentStop are lifecycle events, not tool calls; mixing them would pollute event stream and break existing queries"
  - "Early return after SubagentStart/SubagentStop handlers — explicit guard ensures agent events never reach writeQueue.enqueue()"
  - "upsertAgentNode uses ON CONFLICT DO UPDATE — handles re-spawn of same agent_id gracefully without crashing"
  - "relay.py extracts agent_transcript_path for SubagentStop — stored for future per-agent cost correlation in Phase 4.3"

patterns-established:
  - "Agent lifecycle pattern: SubagentStart creates active row, SubagentStop marks completed — state machine via two SQL operations"
  - "SSE broadcast pattern for agent events: agent_spawn on start, agent_update on stop — mirrors tool event broadcast pattern"

requirements-completed: [AGENT-01, AGENT-02, AGENT-03]

# Metrics
duration: ~8min
completed: 2026-02-26
---

# Phase 4 Plan 01: Agent Nodes Backend Summary

**SQLite agent_nodes table, relay.py SubagentStart/SubagentStop extraction, ingest handlers broadcasting SSE events, and GET /api/agents hydration endpoint — complete agent hierarchy backend**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-26T18:51:00Z
- **Completed:** 2026-02-26T18:59:36Z
- **Tasks:** 2
- **Files modified:** 5 (+ ~/.claude/settings.json)

## Accomplishments
- agent_nodes SQLite table with 6-column schema (agent_id PK, parent_session_id, agent_type, state, spawned_at, last_activity_ts) and parent index
- relay.py extended to forward agent_id/agent_type for SubagentStart, plus agent_transcript_path for SubagentStop
- ingest.js handles SubagentStart (upsert active row + agent_spawn SSE) and SubagentStop (update completed + agent_update SSE) without polluting events table
- GET /api/agents returns full agent hierarchy ordered by spawned_at, ready for frontend hydration
- ~/.claude/settings.json updated with SubagentStart and SubagentStop hook entries pointing to relay.py

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend SQLite schema and relay.py** - `63dd2fb` (feat)
2. **Task 2: Handle SubagentStart/SubagentStop in ingest.js and add /api/agents** - `178b7dd` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `db/schema.js` - Added agent_nodes table and idx_agent_nodes_parent index
- `hooks/relay.py` - Added SubagentStart/SubagentStop field extraction block
- `routes/ingest.js` - Added db option, prepared statements, SubagentStart/SubagentStop handlers with early returns
- `routes/api.js` - Added stmtAgents prepared statement and GET /api/agents route handler
- `server.js` - Updated ingestRoutes registration to pass db alongside writeQueue
- `~/.claude/settings.json` - Added SubagentStart and SubagentStop hook entries

## Decisions Made
- agent_nodes is a separate table from events — SubagentStart/SubagentStop are lifecycle events, not tool calls; mixing them into the events table would pollute the event stream and break existing queries that assume events = tool calls
- Early return after SubagentStart/SubagentStop handlers in setImmediate — explicit guard ensures agent events never reach writeQueue.enqueue() even if future code rearranges the block
- upsertAgentNode uses ON CONFLICT DO UPDATE — handles re-spawn of same agent_id gracefully without crashing (idempotent)
- relay.py extracts agent_transcript_path for SubagentStop — stored for future per-agent cost correlation in Phase 4.3 even though it's not used yet

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Integration test initially hit the old running server (port 4999 already in use). Killed old process and restarted with new code — all 6 integration checks passed.

## User Setup Required
None - ~/.claude/settings.json has been updated automatically. SubagentStart and SubagentStop hooks will take effect in the next Claude Code session.

## Next Phase Readiness
- agent_nodes table populated on every subagent spawn/stop — ready for tree rendering in 04-02
- agent_spawn and agent_update SSE events broadcast on lifecycle changes — frontend can subscribe to real-time updates
- GET /api/agents provides page-load hydration data for agent tree UI
- agent_transcript_path captured in SubagentStop — ready for per-agent cost correlation in 04-03

---
*Phase: 04-multi-agent-observability*
*Completed: 2026-02-26*

## Self-Check: PASSED

All files verified present:
- db/schema.js: FOUND
- hooks/relay.py: FOUND
- routes/ingest.js: FOUND
- routes/api.js: FOUND
- server.js: FOUND
- .planning/phases/04-multi-agent-observability/04-01-SUMMARY.md: FOUND

All commits verified:
- 63dd2fb (Task 1: schema + relay): FOUND
- 178b7dd (Task 2: ingest + api/agents): FOUND
