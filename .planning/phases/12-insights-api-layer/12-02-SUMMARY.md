---
phase: 12-insights-api-layer
plan: "02"
subsystem: api
tags: [fastify, sqlite, better-sqlite3, insights, time-series, activity, tokens]

requires:
  - phase: 12-insights-api-layer
    plan: "01"
    provides: routes/insights.js with insightsRoutes function established

provides:
  - GET /api/insights/activity — tool call counts bucketed per minute for a session
  - GET /api/insights/tokens-over-time — input + output tokens per minute for a session

affects:
  - 12-03 (error-rate endpoints will add to the same file)
  - 13-insights-charts (frontend consumes both endpoints for time-series charts)

tech-stack:
  added: []
  patterns:
    - "Same prepared-statement-at-top pattern as 12-01; both stmts added alongside existing ones"
    - "SQLite integer division: (timestamp_ms / 60000) * 60000 snaps ms epoch to minute bucket"
    - "Both endpoints require session_id; return 400 { error } if missing; [] for no-data sessions"

key-files:
  created: []
  modified:
    - routes/insights.js

key-decisions:
  - "cache_read_tokens and cache_write_tokens excluded from tokens-over-time — charts show billed input/output only"
  - "activity endpoint filters hook_type = PostToolUse (not PreToolUse) to count completed tool invocations"
  - "bucket_ms uses (x / 60000) * 60000 pattern (integer division) consistent with plan spec; no rounding needed as SQLite truncates toward zero"

requirements-completed:
  - INSG-03
  - INSG-04

duration: 5min
completed: 2026-03-10
---

# Phase 12 Plan 02: Activity and Tokens-Over-Time Endpoints Summary

**Two per-minute time-series endpoints appended to routes/insights.js: activity (PostToolUse counts) and tokens-over-time (input/output token sums) bucketed by minute via SQLite integer division**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T04:27:32Z
- **Completed:** 2026-03-10T04:32:00Z
- **Tasks:** 2 (executed as one atomic commit — same file, additive changes)
- **Files modified:** 1

## Accomplishments

- Added `stmtActivity` prepared statement: filters `events` by `session_id` and `hook_type = 'PostToolUse'`, groups by `(timestamp / 60000) * 60000` bucket
- Added `stmtTokensOverTime` prepared statement: aggregates `input_tokens` and `output_tokens` from `api_calls` by minute bucket
- `GET /api/insights/activity?session_id=X` returns `[{ bucket_ms, tool_calls }, ...]`
- `GET /api/insights/tokens-over-time?session_id=X` returns `[{ bucket_ms, input_tokens, output_tokens }, ...]`
- Both endpoints return 400 `{ error: 'session_id required' }` when session_id is absent
- Both return `[]` (not an error) when session has no matching data

## Task Commits

Both tasks modified the same file additively and were committed as one atomic unit:

1. **Tasks 1+2: Add activity and tokens-over-time endpoints** - `a8b4f96` (feat)

## Files Created/Modified

- `routes/insights.js` — Added two prepared statements and two GET route handlers for activity and tokens-over-time endpoints

## Decisions Made

- `cache_read_tokens` and `cache_write_tokens` excluded from tokens-over-time — Phase 13 charts track billed input/output only
- Activity endpoint counts only `PostToolUse` events — counts completed invocations, not start events
- Bucket key formula `(x / 60000) * 60000` is consistent with plan spec and SQLite integer division behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - static validation confirmed all route strings, prepared statement references, and 400 guards are present.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `routes/insights.js` is ready for Plan 12-03 (error-rate endpoints)
- Both new endpoints return correctly shaped time-series arrays that Phase 13 Recharts components can consume directly
- `bucket_ms` is the x-axis key; `tool_calls` / `input_tokens` / `output_tokens` are the y-axis values

---
*Phase: 12-insights-api-layer*
*Completed: 2026-03-10*
