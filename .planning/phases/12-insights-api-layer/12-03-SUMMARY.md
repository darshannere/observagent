---
phase: 12-insights-api-layer
plan: "03"
subsystem: api
tags: [fastify, sqlite, better-sqlite3, insights, error-rate, latency, stalled-agents, ntile, window-functions]

requires:
  - phase: 12-insights-api-layer
    plan: "02"
    provides: routes/insights.js with 4 endpoints established (cost-daily, cost-by-agent, activity, tokens-over-time)

provides:
  - GET /api/insights/error-rate — 5-minute bucket error counts (errors + total) across PostToolUse events
  - GET /api/insights/stalled-agents — active agents idle > 10 min with idle_seconds computed in SQL
  - GET /api/insights/latency-by-tool — p50/p95 latency per tool_name via NTILE(100) window function

affects:
  - 13-insights-charts (frontend consumes all 7 endpoints for charts and indicators)

tech-stack:
  added: []
  patterns:
    - "NTILE(100) OVER (PARTITION BY tool_name ORDER BY duration_ms) approximates p50/p95 in SQLite 3.25+ without external dependencies"
    - "Optional session_id filter via (? = '' OR session_id = ?) pattern — empty string means global view"
    - "stalled-agents: threshold computed in JS (Date.now() - 10min), passed as SQL parameter for testability"

key-files:
  created: []
  modified:
    - routes/insights.js

key-decisions:
  - "stmtErrorRate uses 5-minute buckets (300000ms) consistent with the health panel time horizon from prior phases"
  - "stalled-agents threshold (10 min) computed in JS and passed as SQL param — keeps SQL stateless and testable"
  - "HAVING sample_count >= 2 on latency-by-tool excludes tools with 1 sample where NTILE percentile math is meaningless"
  - "Optional session_id on error-rate and latency-by-tool uses '' empty-string sentinel to allow global view without a separate code path"

patterns-established:
  - "All 7 insights endpoints follow the prepared-statement-at-top pattern — stmts defined once at registration, closures capture them"

requirements-completed:
  - INSG-05
  - INSG-06
  - INSG-07

duration: 8min
completed: 2026-03-10
---

# Phase 12 Plan 03: Insights API Layer — Health Endpoints Summary

**Three health endpoints (error-rate bucketed by 5 min, stalled-agents with idle_seconds, latency-by-tool with NTILE p50/p95) completing all 7 Insights API endpoints in routes/insights.js**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-10T04:30:12Z
- **Completed:** 2026-03-10T04:38:00Z
- **Tasks:** 2 (committed as one atomic unit — same file, additive changes)
- **Files modified:** 1

## Accomplishments

- `stmtErrorRate`: 5-minute bucket aggregation of `PostToolUse` errors (`exit_status != 0 AND IS NOT NULL`), optional `session_id` filter
- `stmtStalledAgents`: queries `agent_nodes` where `state = 'active'` and `last_activity_ts < (now - 10min)`; `idle_seconds` computed via `CAST((nowMs - last_activity_ts) / 1000 AS INTEGER)` in SQL
- `stmtLatencyByTool`: CTE with `NTILE(100) OVER (PARTITION BY tool_name ORDER BY duration_ms)` for p50/p95 approximation; `HAVING sample_count >= 2` excludes single-sample tools
- All 3 prepared statements placed at the top of `insightsRoutes` alongside the existing 4, consistent with established pattern
- `GET /api/insights/error-rate` returns `[{ bucket_ms, errors, total }, ...]`
- `GET /api/insights/stalled-agents` returns `[{ agent_id, agent_type, last_activity_ts, idle_seconds }, ...]`
- `GET /api/insights/latency-by-tool` returns `[{ tool_name, p50_ms, p95_ms, sample_count }, ...]`

## Task Commits

Both tasks modified the same file additively and were committed as one atomic unit:

1. **Tasks 1+2: Add error-rate, stalled-agents, and latency-by-tool endpoints** - `a2e5fe2` (feat)

## Files Created/Modified

- `routes/insights.js` — Added 3 prepared statements and 3 GET route handlers; now exports all 7 Insights API endpoints

## Decisions Made

- 5-minute bucket size (300000ms) for error-rate matches the health panel time horizon already used in the product
- Stalled-agent threshold computed in JS (`Date.now() - 10 * 60 * 1000`) and passed as SQL parameter — keeps the query stateless
- `HAVING sample_count >= 2` guard ensures NTILE percentile math is not applied to tools with only 1 data point
- Empty-string sentinel `(? = '' OR session_id = ?)` provides a single code path for both global view and per-session filter

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - module imported cleanly via `node -e "import('./routes/insights.js')"` and all 7 route strings confirmed present.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 7 `GET /api/insights/*` endpoints are live in `routes/insights.js` and registered in `server.js`
- Phase 13 (Insights Charts) can now consume all 7 endpoints:
  1. `cost-daily` → 7-day bar chart
  2. `cost-by-agent` → pie/donut chart
  3. `activity` → per-session time-series line
  4. `tokens-over-time` → per-session dual-line (input/output)
  5. `error-rate` → timeline bar chart
  6. `latency-by-tool` → horizontal bar chart sorted by p95
  7. `stalled-agents` → alert indicator / table

## Self-Check: PASSED

- FOUND: routes/insights.js (7 endpoints present)
- FOUND: .planning/phases/12-insights-api-layer/12-03-SUMMARY.md
- FOUND: commit a2e5fe2

---
*Phase: 12-insights-api-layer*
*Completed: 2026-03-10*
