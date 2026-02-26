---
phase: 02-live-event-dashboard
plan: 04
subsystem: api
tags: [python, hooks, sse, sqlite, exit_status, error-detection]

# Dependency graph
requires:
  - phase: 02-live-event-dashboard
    provides: "relay.py hook relay, ingest.js PreToolUse/PostToolUse pairing, dashboard error CSS and toast logic"
provides:
  - "exit_status forwarding from Claude Code PostToolUse payload through relay.py to /ingest to SSE broadcast"
  - "Bash tool error detection via stderr presence (non-empty stderr = exit_status 1, empty = 0)"
  - "ingest.js reads exit_status from request body with nullish coalescing (raw.exit_status ?? null)"
affects: [03-cost-token-tracking, 04-agent-hierarchy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Payload inspection before implementation: always run live debug capture to confirm actual hook payload schema before writing field extraction code"
    - "Derived error signals: when no explicit exit_status exists, derive from tool_response boolean signals (stderr presence for Bash) without forwarding content"
    - "Nullish coalescing for optional numeric fields: use ?? null (not || null) to preserve 0 as a valid non-error value"

key-files:
  created: []
  modified:
    - hooks/relay.py
    - routes/ingest.js

key-decisions:
  - "Claude Code 2.1.59 PostToolUse payload does NOT include exit_status, exit_code, or exitCode — confirmed via live debug capture of real hook payload"
  - "Bash tool error detection via stderr: tool_response.stderr non-empty = exit_status 1 (error), empty = exit_status 0 (success) — derives boolean signal without forwarding content"
  - "Non-Bash tools (Read, Write, Edit, etc.) return exit_status=None — no reliable failure signal in current payload schema"
  - "Nullish coalescing (raw.exit_status ?? null) used in ingest.js to preserve exit_status=0 as valid success value (|| would coerce to null)"
  - "_derive_exit_status() helper function in relay.py — isolates error derivation logic, documents payload schema findings, handles PreToolUse/PostToolUse split cleanly"

patterns-established:
  - "Debug-first for unconfirmed payload fields: add temporary debug block to write raw payload to /tmp/observagent_debug.json, trigger a tool call, read file, remove block"
  - "Metadata-only security boundary maintained: only boolean derived signal (0/1/None) forwarded, stderr content never included in relay POST body"

requirements-completed: [INGEST-02, INGEST-03, DASH-01, DASH-02]

# Metrics
duration: 15min
completed: 2026-02-26
---

# Phase 2 Plan 04: Exit Status Forwarding Gap Closure Summary

**exit_status forwarding pipeline wired: relay.py derives Bash errors from stderr presence and forwards 0/1/None to ingest.js which reads raw.exit_status ?? null — dashboard error rows and toast now fire for real Bash tool failures**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-26T08:43:00Z
- **Completed:** 2026-02-26T09:00:00Z
- **Tasks:** 3 (2 auto, 1 human-verify — all complete)
- **Files modified:** 2

## Accomplishments

- Confirmed via live payload inspection that Claude Code 2.1.59 PostToolUse hook payload has no exit_status field at the top level — resolves the RESEARCH.md open question definitively
- Implemented `_derive_exit_status()` in relay.py that derives error signal from Bash tool `tool_response.stderr` (non-empty = error), forwarding only the boolean result (0/1/None), never the content
- Fixed ingest.js to read `raw.exit_status ?? null` instead of hardcoded null — nullish coalescing preserves `exit_status=0` (success) correctly, which `||` would coerce to null

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm exit_status field name and fix relay.py** - `0faf77e` (feat)
2. **Task 2: Fix ingest.js to read exit_status from request body** - `e63d291` (feat)
3. **Task 3: Human verification — error highlighting works in live session** - human-approved (no code changes; checkpoint passed)

**Plan metadata:** (final commit — this SUMMARY.md update)

## Files Created/Modified

- `/Users/darshannere/claude/observagent/hooks/relay.py` - Added `_derive_exit_status()` helper; forwards exit_status in event dict (Bash: stderr-derived 0/1; others: None)
- `/Users/darshannere/claude/observagent/routes/ingest.js` - Changed line 30 from `exit_status: null` to `exit_status: raw.exit_status ?? null`

## Decisions Made

- **Field name investigation:** Used live debug capture approach (temporary debug block in relay.py writing PostToolUse payload to /tmp/observagent_debug.json). Confirmed that Claude Code 2.1.59 PostToolUse payload top-level keys are: session_id, transcript_path, cwd, permission_mode, hook_event_name, tool_name, tool_input, tool_response, tool_use_id. No exit_status, exit_code, or exitCode exists.

- **Bash-specific derivation:** Bash tool's tool_response contains stdout, stderr, interrupted, isImage, noOutputExpected. Non-empty stderr reliably indicates command errors. This is used as the exit_status proxy for Bash tool calls only.

- **Non-Bash tools:** Read, Write, Edit, and other tools have tool-specific tool_response schemas (e.g., Edit has filePath, oldString, newString, structuredPatch, userModified, replaceAll). No boolean error indicator exists, so exit_status=None for non-Bash tools.

- **Security boundary maintained:** _derive_exit_status() forwards only the boolean result (0 or 1), never the stderr content. The metadata-only security principle is preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exit_status field not present in PostToolUse payload — derived from stderr instead**
- **Found during:** Task 1 (payload inspection step)
- **Issue:** Claude Code 2.1.59 PostToolUse payload does not include exit_status, exit_code, or exitCode. The plan's assumption that one of these fields would exist was incorrect.
- **Fix:** Implemented _derive_exit_status() that uses Bash tool_response.stderr as a proxy for exit status (non-empty = 1, empty = 0). Non-Bash tools return None. This satisfies the dashboard's `isError = exit_status !== null && exit_status !== 0` check for Bash failures.
- **Files modified:** hooks/relay.py
- **Verification:** Live end-to-end test: POST to /ingest with exit_status=1 stored and returned by /api/events correctly. Dashboard isError logic triggers correctly for non-null non-zero values.
- **Committed in:** 0faf77e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: derived exit_status from stderr instead of missing payload field)
**Impact on plan:** Required approach change for exit_status derivation — Bash stderr used as error proxy. Non-Bash tool failures (Read on non-existent file, etc.) will not show error styling since no error signal exists in their hook payload. Only Bash errors that produce stderr output trigger red styling and toast.

## Issues Encountered

- Claude Code 2.1.59 does not expose exit status through the PostToolUse hook payload. This was flagged as an open question in RESEARCH.md and confirmed during this plan. Future Claude Code versions may add an explicit exit_status field to the payload, at which point `_derive_exit_status()` can be updated to use `payload.get("exit_status")` directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- exit_status forwarding is wired and working for Bash tool calls
- Server running at http://localhost:4999 with updated routes
- Phase 3 (Cost and Token Tracking) ready to begin
- Known limitation: non-Bash tool failures (Read on non-existent file) do not trigger error highlighting — only Bash commands with stderr output do

## Self-Check: PASSED

- `hooks/relay.py`: confirmed exists and contains _derive_exit_status() and exit_status in event dict
- `routes/ingest.js`: confirmed contains raw.exit_status ?? null (no hardcoded null)
- `02-04-SUMMARY.md`: confirmed exists at .planning/phases/02-live-event-dashboard/
- Commits 0faf77e (relay.py) and e63d291 (ingest.js) confirmed in git log
- Task 3 human-verify: approved by user (error highlighting confirmed working in live session)

---
*Phase: 02-live-event-dashboard*
*Completed: 2026-02-26*
