---
phase: 05-session-history-and-discovery
plan: 01
subsystem: database
tags: [sqlite, migration, jsonl, project-name, backfill]

# Dependency graph
requires:
  - phase: 04-multi-agent-observability
    provides: session_cost table with composite PRIMARY KEY (session_id, agent_id), JSONL watcher with subagent discovery
provides:
  - project_name column in session_cost (TEXT NOT NULL DEFAULT '') with safe PRAGMA-based migration
  - idx_session_cost_project index for project-grouped queries
  - extractProjectName() function extracting cwd basename from JSONL records
  - Startup backfill: re-derives project_name for pre-existing session rows with empty project_name
affects: [05-02, 05-03, session-history-page, project-filter-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PRAGMA table_info() check before ALTER TABLE — idempotent column migration without IF NOT EXISTS syntax (not supported in SQLite 3.51.2)"
    - "Lazy upsertStmt init preserved — statement created on first processFile call since db only available post-startJsonlWatcher"
    - "Startup backfill in try/catch — backfill errors must never crash server; written after discovery loop completes"

key-files:
  created: []
  modified:
    - db/schema.js
    - lib/jsonlWatcher.js

key-decisions:
  - "PRAGMA table_info() check pattern for idempotent column addition — ALTER TABLE ... IF NOT EXISTS does not exist in SQLite"
  - "extractProjectName uses basename(cwd) — cwd is the authoritative human-readable project name in JSONL records"
  - "Backfill uses 'unknown' sentinel for sessions whose JSONL file cannot be located — never leaves project_name empty"
  - "backfillProjectDirs uses separate variable name to avoid shadowing outer projectDirs in startJsonlWatcher scope"

patterns-established:
  - "Column migration pattern: addColumnIfNotExists(db, table, col, typeDef) using PRAGMA table_info — reusable for future schema evolution"
  - "Startup backfill pattern: query empty sentinel rows, re-derive from source files, update atomically — safely handles pre-existing data"

requirements-completed: [HIST-01, HIST-02]

# Metrics
duration: ~10min
completed: 2026-02-28
---

# Phase 5 Plan 01: Project Name Column Migration and Backfill Summary

**project_name TEXT column added to session_cost via PRAGMA-safe migration, populated from JSONL cwd field on processFile, with startup backfill for pre-existing empty rows**

## Performance

- **Duration:** ~10 min (continuation agent, resumed after rate-limit interrupt)
- **Started:** 2026-02-28T03:40:00Z
- **Completed:** 2026-02-28T03:45:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `addColumnIfNotExists` helper to db/schema.js and used it to safely add `project_name TEXT NOT NULL DEFAULT ''` to session_cost on every server start
- Created `idx_session_cost_project ON session_cost(project_name, last_event_ts DESC)` for fast project-grouped queries
- Added `extractProjectName(rawRecords)` to jsonlWatcher.js — extracts basename of cwd from the first JSONL record that has a cwd string
- Updated upsertStmt to persist project_name in INSERT and ON CONFLICT DO UPDATE SET
- Added startup backfill block that queries rows with `project_name = ''` and re-derives project_name from their JSONL files; writes 'unknown' for sessions whose file cannot be found

## Task Commits

Each task was committed atomically:

1. **Task 1: Add project_name column migration and index to db/schema.js** - `40a9561` (feat)
2. **Task 2: Extract project_name in jsonlWatcher.js — processFile, upsertStmt, and startup backfill** - `fdafc07` (feat)

## Files Created/Modified
- `db/schema.js` - Added `addColumnIfNotExists` helper; calls it to add project_name column and create idx_session_cost_project after table creation
- `lib/jsonlWatcher.js` - Added `extractProjectName()`, updated upsertStmt with project_name, added startup backfill block in startJsonlWatcher after JSONL discovery

## Decisions Made
- Used `PRAGMA table_info()` pattern instead of `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — that syntax does not exist in SQLite 3.51.2 and throws a syntax error
- `extractProjectName` returns `'unknown'` (not empty string) when no cwd found — preserves invariant that project_name is always a meaningful non-empty value
- Backfill uses a separate `backfillProjectDirs` variable to avoid variable shadowing the outer `projectDirs` in startJsonlWatcher
- Backfill wrapped in try/catch — errors in backfill must never prevent server startup

## Deviations from Plan

None - plan executed exactly as written. The continuation agent added only the startup backfill block (which the interrupted previous agent had not yet added). Task 1 was already committed before the interrupt.

## Issues Encountered
- Previous agent was interrupted mid-task by rate limit. Task 1 was fully committed. Task 2 had `extractProjectName` and the updated upsertStmt already written to disk but not committed, and the startup backfill block was not yet added. Continuation agent completed the backfill addition and committed the full Task 2.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- session_cost.project_name is now populated for all new sessions via processFile
- Startup backfill ensures pre-existing sessions get project_name on next server restart
- idx_session_cost_project enables efficient `GROUP BY project_name` and `WHERE project_name = ?` queries
- Ready for Phase 5.02: session history page UI and API endpoints that group/filter by project_name

## Self-Check: PASSED

- FOUND: db/schema.js
- FOUND: lib/jsonlWatcher.js
- FOUND: 05-01-SUMMARY.md
- FOUND commit 40a9561 (Task 1: db/schema.js migration)
- FOUND commit fdafc07 (Task 2: jsonlWatcher.js backfill)

---
*Phase: 05-session-history-and-discovery*
*Completed: 2026-02-28*
