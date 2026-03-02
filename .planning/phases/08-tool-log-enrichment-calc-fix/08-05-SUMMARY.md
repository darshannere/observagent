---
phase: 08-tool-log-enrichment-calc-fix
plan: "05"
subsystem: database, api, ui
tags: [sqlite, better-sqlite3, token-tracking, api_calls, jsonl, sse, fastify]

# Dependency graph
requires:
  - phase: 08-tool-log-enrichment-calc-fix
    plan: "02"
    provides: tool_summary pipeline — events table with tool_summary column, api.js stmtAll baseline
provides:
  - api_calls table with session_id, timestamp_ms, input_tokens, output_tokens (UNIQUE on session+ts)
  - jsonlWatcher inserts one api_calls row per usage record on each JSONL reparse
  - GET /api/events includes nearest_input_tokens + nearest_output_tokens via correlated subqueries
  - Tool log rows show compact token badge (X.XK in / YYY out) for historical rows with nearby api_call
affects: [09-agent-intelligence, 10-live-token-streaming]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Correlated subqueries (not LATERAL JOIN) for nearest-neighbor lookup in SQLite"
    - "INSERT OR IGNORE with UNIQUE constraint for idempotent JSONL re-processing"
    - "Lazily initialized module-scope prepared statement for api_calls INSERT"

key-files:
  created: []
  modified:
    - db/schema.js
    - lib/jsonlWatcher.js
    - routes/api.js
    - public/index.html

key-decisions:
  - "UNIQUE (session_id, timestamp_ms) constraint on api_calls — enables INSERT OR IGNORE idempotency on re-scan without a separate dedup column"
  - "SQLite correlated subqueries used (not LATERAL JOIN — unsupported in SQLite) to find nearest api_call within 30s per event row"
  - "Token badge shown only for historical rows (hydrate path) — live SSE events will have null nearest tokens; live token display deferred to Phase 10"
  - "fmtK helper uses toFixed(1) for K suffix (1.2K) matching K-suffix display spec in plan"

patterns-established:
  - "Proximity join pattern: ABS(timestamp_ms - e.timestamp) < 30000 ORDER BY ABS LIMIT 1 — reusable for future nearest-neighbor lookups"
  - "Conditional token badge: if (event.nearest_input_tokens != null) guard before rendering — safe for null rows"

requirements-completed: [TOOL-05]

# Metrics
duration: 12min
completed: 2026-03-02
---

# Phase 8 Plan 05: Token Count Badge Summary

**api_calls table + JSONL watcher writes + correlated subquery join surface per-tool-call token counts (X.XK in / YYY out) on historical dashboard rows**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-02T22:50:00Z
- **Completed:** 2026-03-02T23:02:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- New `api_calls` SQLite table with UNIQUE constraint on `(session_id, timestamp_ms)` for idempotent re-scan behavior
- `jsonlWatcher.processFile()` now inserts one row per usage record into `api_calls` using `INSERT OR IGNORE`, lazily prepared at first call
- `GET /api/events` (both stmtAll and stmtBySession) returns `nearest_input_tokens` and `nearest_output_tokens` via two correlated subqueries per row — SQLite-compatible alternative to LATERAL JOIN
- `createRow()` in dashboard renders `.token-counts` span (`X.XK in / YYY out`) when `nearest_input_tokens` is non-null; live SSE rows receive null (as designed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add api_calls table and wire jsonlWatcher to insert per-API-call records** - pending commit
2. **Task 2: Add nearest token counts to /api/events response and render in log rows** - pending commit

**Plan metadata:** pending commit (docs: complete plan)

## Files Created/Modified

- `/Users/darshannere/claude/observagent/db/schema.js` - Added `api_calls` table and index inside main `db.exec()` block; added log line
- `/Users/darshannere/claude/observagent/lib/jsonlWatcher.js` - Added `insertApiCallStmt` module-scope variable; INSERT OR IGNORE per usage record in `processFile()`
- `/Users/darshannere/claude/observagent/routes/api.js` - Updated `stmtAll` and `stmtBySession` with correlated subqueries for `nearest_input_tokens` / `nearest_output_tokens`
- `/Users/darshannere/claude/observagent/public/index.html` - Added `.token-counts` CSS rule; added token badge rendering in `createRow()` after `durEl`

## Decisions Made

- UNIQUE constraint on `(session_id, timestamp_ms)` — enables `INSERT OR IGNORE` idempotency without extra dedup logic; acceptable because two API calls with identical session + ms timestamp is practically impossible
- SQLite correlated subqueries chosen over LATERAL JOIN (unsupported in SQLite) as explicitly specified in plan interfaces section
- Token badge placed inside `mainLine` div after `durEl` — leverages existing flex layout; `margin-left: auto` on `.token-counts` pushes it right alongside duration; no layout changes needed
- Live SSE events do not show token counts (null) — JSONL lags behind live events; Phase 10 will add live token streaming via JSONL watcher SSE broadcast

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

**Files exist:**
- `/Users/darshannere/claude/observagent/db/schema.js` — FOUND (modified in place)
- `/Users/darshannere/claude/observagent/lib/jsonlWatcher.js` — FOUND (modified in place)
- `/Users/darshannere/claude/observagent/routes/api.js` — FOUND (modified in place)
- `/Users/darshannere/claude/observagent/public/index.html` — FOUND (modified in place)

**Content verified:**
- `api_calls` appears in db/schema.js (CREATE TABLE + index + log)
- `INSERT OR IGNORE INTO api_calls` appears in lib/jsonlWatcher.js
- `nearest_input_tokens` appears in routes/api.js (stmtAll + stmtBySession, 2 occurrences each)
- `token-counts` CSS class appears in public/index.html
- `nearest_input_tokens` check appears in public/index.html createRow()

## Self-Check: PASSED

## Next Phase Readiness

- Phase 9 (agent intelligence, AGNT-07) can proceed — api_calls table provides per-call token data
- Phase 10 (live token streaming) can add live badge updates by broadcasting api_calls inserts via SSE from jsonlWatcher
- No regressions introduced — existing cost panel, session health, and export paths are unaffected

---
*Phase: 08-tool-log-enrichment-calc-fix*
*Completed: 2026-03-02*
