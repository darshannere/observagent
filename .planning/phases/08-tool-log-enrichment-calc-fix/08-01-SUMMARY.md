---
phase: 08-tool-log-enrichment-calc-fix
plan: "01"
subsystem: database
tags: [relay, hook, tool-summary, sqlite, schema-migration, python, javascript]

# Dependency graph
requires: []
provides:
  - "_build_tool_summary() function in relay.py — safe per-tool-type summary strings"
  - "tool_summary TEXT column in events table via addColumnIfNotExists migration"
  - "event['tool_summary'] wired into relay.py main() POST body for every event"
affects:
  - 08-02 (reads tool_summary from events table for enrichment display)
  - 08-04 (depends on tool_summary being present in DB rows)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "allowlist extraction: only non-sensitive fields extracted from tool_input (command, file_path, pattern, query, url)"
    - "addColumnIfNotExists migration pattern for backward-compatible schema additions"
    - "None/null for tools with no meaningful summary field — no forced empty strings"

key-files:
  created: []
  modified:
    - hooks/relay.py
    - db/schema.js

key-decisions:
  - "Truncate command/description/url/query at 200 chars in tool_summary — prevents oversized strings"
  - "Allowlist approach: extract only command, file_path, pattern, description, subagent_type, url, query, notebook_path, path — never content/new_str/old_str/new_content"
  - "mcp__ catch-all iterates (query, path, url, command, name, description) in order, returns first non-empty"
  - "tool_summary is None (JSON null) for unknown tools (exit_plan_mode, TodoRead, etc.) — no fabricated summaries"

patterns-established:
  - "Tool summary: per-tool-type key: value format strings (e.g., 'command: git status')"
  - "Security boundary: relay.py never extracts file content, diff hunks, or search results"

requirements-completed:
  - TOOL-01
  - TOOL-02
  - TOOL-03
  - TOOL-04

# Metrics
duration: 8min
completed: 2026-03-02
---

# Phase 8 Plan 01: Tool Summary Data Layer Summary

**_build_tool_summary() added to relay.py covering 9 tool types plus mcp__ catch-all, with tool_summary TEXT column migrated into the events table via addColumnIfNotExists**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-02T22:10:32Z
- **Completed:** 2026-03-02T22:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `_build_tool_summary()` function handles Bash, Read/Write/Edit/MultiEdit, Grep/Glob, Task, WebFetch, WebSearch, TodoWrite, NotebookRead/NotebookEdit, LS, and mcp__ catch-all
- `event["tool_summary"]` wired into `main()` after exit_status and before SubagentStart/SubagentStop blocks — emitted in every POST body to /ingest
- `tool_summary TEXT` column added to events table using existing `addColumnIfNotExists()` utility — NULL for old rows, safe migration, no data loss
- Security constraints preserved: relay still exits 0 with no stdout/stderr; no forbidden field extraction

## Task Commits

Each task was committed atomically:

1. **Task 1: Add _build_tool_summary() to relay.py** - `74c7de3` (feat)
2. **Task 2: Add tool_summary column to events table in schema.js** - `7bbe7f6` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `hooks/relay.py` — Added `_build_tool_summary()` function (50 lines) before `main()`, plus 3 lines to extract and attach `tool_summary` to the event dict
- `db/schema.js` — Added `addColumnIfNotExists(db, 'events', 'tool_summary', 'TEXT')` call and log line after project_name migration block

## Decisions Made
- Truncate at 200 chars for command, description, url, query — prevents relay POST body bloat
- `mcp__*` catch-all iterates (query, path, url, command, name, description) in priority order — first non-empty string wins
- Return `None` (not empty string) for unknown/unsupported tools — JSON serializes as `null`, clearly distinguishable from empty summary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Data layer complete: relay.py emits `tool_summary` in every ingest POST, events table has the column to store it
- Plan 02 can now read `tool_summary` from events rows and surface it in the UI
- Plan 04 cost/calc fix is unblocked (depends on events table stability, not tool_summary specifically)

---
*Phase: 08-tool-log-enrichment-calc-fix*
*Completed: 2026-03-02*

## Self-Check: PASSED

- hooks/relay.py: FOUND
- db/schema.js: FOUND
- 08-01-SUMMARY.md: FOUND
- Commit 74c7de3 (Task 1): FOUND
- Commit 7bbe7f6 (Task 2): FOUND
