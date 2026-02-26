---
phase: 02-live-event-dashboard
plan: 01
subsystem: api
tags: [fastify, sqlite, sse, better-sqlite3, server-sent-events]

requires:
  - phase: 01-foundation
    provides: "Fastify server with /ingest POST, /events SSE, WriteQueue, sseClients, SQLite DB"

provides:
  - "GET / — serves public/index.html as text/html (read once at startup)"
  - "GET /api/events — queries SQLite for up to 200 recent events; optional ?session_id= for filtered ordered results"
  - "pendingCalls Map in ingest.js — PreToolUse/PostToolUse pairing with server-side duration_ms computation"
  - "5-minute TTL cleanup interval on pendingCalls to prevent unbounded growth"
  - "public/index.html placeholder (real dashboard built in Plan 02-02)"

affects: [02-02-dashboard-ui, 03-cost-tracking, 04-hierarchy]

tech-stack:
  added: []
  patterns:
    - "Module-scope Map for stateful in-flight tracking across requests — pendingCalls keyed by tool_call_id"
    - "Prepared statements declared at route registration time, not per-request — single parse cost amortized"
    - "Static file read once at module load (readFileSync) — zero per-request I/O overhead"
    - "TTL cleanup via setInterval at module scope — prevents memory leak from unresolved tool calls"

key-files:
  created:
    - routes/dashboard.js
    - routes/api.js
    - public/index.html
  modified:
    - routes/ingest.js
    - server.js

key-decisions:
  - "pendingCalls Map at module scope (not request scope) — survives across requests, required for pairing"
  - "Pairing logic runs BEFORE reply.code(202).send() — ensures duration_ms is correct when broadcast fires inside setImmediate"
  - "5-minute TTL with 60-second scan interval — balances memory safety vs scan overhead"
  - "api.js prepared statements at registration time — matches existing WriteQueue pattern from Phase 1"
  - "dashboard.js reads index.html once at startup — consistent with zero-overhead philosophy"
  - "public/index.html placeholder created — prevents server crash on startup before Plan 02-02 builds real UI"

patterns-established:
  - "Route files use module-scope state for cross-request tracking (pendingCalls Map pattern)"
  - "db passed via fastify.register options — consistent with writeQueue injection pattern from Phase 1"

requirements-completed: [INGEST-02, DASH-02]

duration: 5min
completed: 2026-02-26
---

# Phase 2 Plan 1: PreToolUse/PostToolUse Pairing + Dashboard Route + API Route Summary

**Server-side duration_ms computation via pendingCalls Map, GET / serving dashboard HTML, and GET /api/events hydration endpoint for SQLite historical events**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26T08:06:48Z
- **Completed:** 2026-02-26T08:11:37Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added pendingCalls Map at module scope in ingest.js — PreToolUse stores start timestamp, PostToolUse computes duration_ms before broadcast fires
- Created routes/dashboard.js — GET / serves public/index.html once, read at startup with zero per-request I/O
- Created routes/api.js — GET /api/events with prepared statements at registration time; supports optional ?session_id= filter
- Created public/index.html placeholder so server starts without crashing before Plan 02-02 builds real UI
- Updated server.js to register dashboardRoutes and apiRoutes after existing routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pendingCalls pairing Map to ingest.js** - `866520b` (feat)
2. **Task 2: Create dashboard and API routes, wire into server.js** - `6221f47` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `routes/ingest.js` - Added pendingCalls Map, pairing logic, 5-minute TTL cleanup; 202 reply placement unchanged
- `routes/dashboard.js` - New file; GET / serves public/index.html as text/html
- `routes/api.js` - New file; GET /api/events with two prepared statements (all events + by session_id)
- `server.js` - Added two imports and two fastify.register calls for dashboardRoutes and apiRoutes
- `public/index.html` - Placeholder HTML (replaced by Plan 02-02)

## Decisions Made

- pendingCalls Map lives at module scope, not inside the route handler — required for cross-request state persistence
- Pairing logic runs before reply.code(202).send() — critical ordering: duration_ms must be set before setImmediate fires broadcast
- 5-minute TTL with 60-second scan interval chosen — tool calls older than 5 minutes are orphaned; 60s scan adds negligible overhead
- Prepared statements at route registration time in api.js — follows the same pattern as WriteQueue constructor (single parse cost amortized)
- dashboardRoutes reads index.html once at startup via readFileSync — avoids fs.readFile overhead per request for a static asset
- public/index.html placeholder prevents startup crash when dashboard.js tries to readFileSync before Plan 02-02 delivers real HTML

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

A stale node process (PID 37273) was still listening on port 4999 from Phase 1 testing. Killed it before running verification. No code changes required.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Server now serves GET / (dashboard HTML) and GET /api/events (SQLite hydration) — ready for Plan 02-02 to deliver the real dashboard HTML with JS
- duration_ms is now correctly computed server-side and included in every SSE broadcast for PostToolUse events
- All Phase 1 routes preserved and functioning

---
*Phase: 02-live-event-dashboard*
*Completed: 2026-02-26*

## Self-Check: PASSED

All files confirmed present on disk. All task commits verified in git log.
- routes/ingest.js: FOUND
- routes/dashboard.js: FOUND
- routes/api.js: FOUND
- server.js: FOUND
- public/index.html: FOUND
- 02-01-SUMMARY.md: FOUND
- Commit 866520b (Task 1): FOUND
- Commit 6221f47 (Task 2): FOUND
