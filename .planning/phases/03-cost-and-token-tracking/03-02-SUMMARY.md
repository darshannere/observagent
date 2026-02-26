---
phase: 03-cost-and-token-tracking
plan: "02"
subsystem: api
tags: [fastify, sqlite, cost-tracking, config, jsonl-watcher]

# Dependency graph
requires:
  - phase: 03-01
    provides: session_cost table, observagent_config table, startJsonlWatcher(db) function
provides:
  - GET /api/cost — returns sessions (last 50) and todayTotal from SQLite session_cost
  - GET /api/config — returns budget_threshold_usd and ctx_fill_threshold_pct (null if unset)
  - POST /api/config — persists thresholds to observagent_config; null clears key
  - JSONL watcher wired into server startup via startJsonlWatcher(db) in fastify.listen callback
affects:
  - 03-03 (dashboard reads /api/cost and /api/config for hydration)
  - 03-04 (alert logic reads thresholds via /api/config)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Prepared statements at registration time in apiRoutes (stmtSessionCost, stmtTodayCost, stmtGetConfig, stmtSetConfig)
    - Inline db.prepare().run() for rare one-off DELETE operations (clearing thresholds)
    - startJsonlWatcher called AFTER fastify.listen callback fires — server accepts requests before JSONL parsing begins

key-files:
  created: []
  modified:
    - routes/api.js
    - server.js

key-decisions:
  - "startJsonlWatcher called after fastify.listen fires (not before): server must be accepting requests before potentially slow JSONL initial parse begins"
  - "Inline db.prepare().run() for DELETE threshold: one-off operation on rare user-clear action; not worth a module-level prepared statement"
  - "No default values for thresholds: unset keys return null — no false alarms per locked project decision"

patterns-established:
  - "Config route pattern: GET reads all keys with null fallback; POST uses INSERT OR REPLACE for set, DELETE for null/clear"
  - "Cost endpoint pattern: two queries (sessions list + today aggregate) returned as single JSON object"

requirements-completed: [COST-01, COST-03, COST-04]

# Metrics
duration: 4min
completed: 2026-02-26
---

# Phase 3 Plan 02: API Routes and JSONL Watcher Startup Summary

**GET /api/cost (session breakdown + today total), GET+POST /api/config (persistent thresholds), and startJsonlWatcher wired into server.js startup — cost data now accessible to dashboard on every boot**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-26T17:57:33Z
- **Completed:** 2026-02-26T18:03:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended `routes/api.js` with four new prepared statements and three new routes covering cost retrieval and config persistence
- `GET /api/cost` returns the last 50 sessions from `session_cost` plus today's USD total in a single response
- `GET /api/config` and `POST /api/config` provide full read/write access to thresholds stored in `observagent_config`; null value clears a threshold
- Wired `startJsonlWatcher(db)` into `server.js` so JSONL discovery begins automatically on every server boot without delaying server readiness

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend routes/api.js with /api/cost and /api/config endpoints** - `edd49af` (feat)
2. **Task 2: Wire startJsonlWatcher into server.js startup** - `c5990d4` (feat)

## Files Created/Modified
- `routes/api.js` — Added stmtSessionCost, stmtTodayCost, stmtGetConfig, stmtSetConfig prepared statements; GET /api/cost, GET /api/config, POST /api/config routes
- `server.js` — Added import for startJsonlWatcher; called inside fastify.listen callback after server is ready

## Decisions Made
- `startJsonlWatcher(db)` is called inside the `fastify.listen` callback (after the server is confirmed listening), not before — ensures server is fully ready before potentially slow initial JSONL scan begins
- Inline `db.prepare(...).run()` for DELETE threshold operations — these only fire on explicit user clear actions (rare), so a module-level prepared statement would be premature optimization
- No default threshold values: `budget_threshold_usd` and `ctx_fill_threshold_pct` return null when unset — matches the "no false alarms" locked decision from planning

## Deviations from Plan

None - plan executed exactly as written. Both files were already implemented per plan spec with all required code. Verification confirmed all endpoints return correct shapes and persisted values survive re-reads.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/api/cost` and `/api/config` are live and tested — dashboard plan (03-03) can hydrate cost panels immediately
- JSONL watcher starts on every server boot — no manual intervention needed
- Thresholds persist across restarts — alert logic (03-04) can read config without in-memory state

---
*Phase: 03-cost-and-token-tracking*
*Completed: 2026-02-26*

## Self-Check: PASSED

Files verified:
- FOUND: /Users/darshannere/claude/observagent/routes/api.js (modified)
- FOUND: /Users/darshannere/claude/observagent/server.js (modified)
- FOUND: /Users/darshannere/claude/observagent/.planning/phases/03-cost-and-token-tracking/03-02-SUMMARY.md (this file)

Commits verified:
- FOUND: edd49af — feat(03-02): extend routes/api.js with /api/cost and /api/config endpoints
- FOUND: c5990d4 — feat(03-02): wire startJsonlWatcher into server.js startup
