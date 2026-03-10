---
phase: 12-insights-api-layer
plan: "01"
subsystem: api
tags: [fastify, sqlite, better-sqlite3, insights, cost-analytics]

requires:
  - phase: 11-sessions-panel
    provides: session_cost and agent_nodes tables with cost data populated

provides:
  - GET /api/insights/cost-daily — 7-day rolling daily cost totals (session-level)
  - GET /api/insights/cost-by-agent — per-agent_type cost totals across all sub-agent sessions
  - routes/insights.js module exporting insightsRoutes

affects:
  - 12-02 (latency endpoints will add to this file)
  - 12-03 (error-rate endpoints will add to this file)
  - 13-insights-charts (frontend consumes both endpoints)

tech-stack:
  added: []
  patterns:
    - "insightsRoutes follows same prepared-statement-at-top pattern as apiRoutes"
    - "Insights routes registered with only { db } — no serverStartMs needed"

key-files:
  created:
    - routes/insights.js
  modified:
    - server.js

key-decisions:
  - "cost-daily uses agent_id='' filter to count session-level cost only (not sub-agent rows)"
  - "cost-by-agent excludes solo sessions (agent_id='') — they have no agent_type; cost-daily already covers them"
  - "session_id query param on cost-by-agent accepted but not used — reserved for Phase 13 filtering"

patterns-established:
  - "Insights route module: export async function insightsRoutes(fastify, options) with db from options"
  - "Prepared statements defined once at registration top, reused per request"

requirements-completed:
  - INSG-01
  - INSG-02

duration: 10min
completed: 2026-03-10
---

# Phase 12 Plan 01: Insights API Layer — Cost Endpoints Summary

**Two cost analytics endpoints (cost-daily 7-day rolling, cost-by-agent breakdown) delivered via routes/insights.js registered in server.js**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-10T00:00:00Z
- **Completed:** 2026-03-10T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `routes/insights.js` exporting `insightsRoutes` with two prepared-statement-backed GET endpoints
- `GET /api/insights/cost-daily` returns up to 7 rows `{ day, cost_usd }` for the past 6 days + today
- `GET /api/insights/cost-by-agent` returns per-agent_type cost totals `{ agent_type, cost_usd }` ordered by spend DESC
- Registered `insightsRoutes` in `server.js` with `{ db }` options after `apiRoutes`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create routes/insights.js** - `ca24edc` (feat)
2. **Task 2: Register insightsRoutes in server.js** - `f1fbab7` (feat)

## Files Created/Modified

- `routes/insights.js` - New insights route module; exports `insightsRoutes` with cost-daily and cost-by-agent endpoints
- `server.js` - Added import and `fastify.register(insightsRoutes, { db })` call

## Decisions Made

- cost-daily filters `agent_id = ''` to capture session-level cost rows only (sub-agent rows have a non-empty agent_id and would double-count)
- cost-by-agent excludes solo sessions (`agent_id != ''`) because they have no agent_type; their spend appears in cost-daily instead
- `session_id` query param accepted on cost-by-agent but unused; reserved for Phase 13 session-level drill-down filtering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both endpoints verified live against real data showing 6 days of session cost and 12 distinct agent types.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `routes/insights.js` is ready to receive additional endpoints in Plans 12-02 (latency) and 12-03 (error rates)
- Both cost endpoints return correctly shaped data that Phase 13 Recharts components can consume directly

---
*Phase: 12-insights-api-layer*
*Completed: 2026-03-10*
