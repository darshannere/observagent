---
phase: 01-foundation
plan: 02
subsystem: infra
tags: [python, hooks, claude-code, relay, fire-and-forget, stdlib]

# Dependency graph
requires: []
provides:
  - "hooks/relay.py — Claude Code hook relay, reads PreToolUse/PostToolUse stdin JSON, POSTs metadata-only payload to localhost:4999/ingest, exits 0 always"
affects: [01-foundation-03, settings-auto-install, claude-code-hook-config]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget hook relay: entire main() wrapped in try/except Exception: pass — no exception propagates"
    - "Metadata-only extraction: tool_name, hook_type, session_id, tool_call_id — never tool_input or tool_response"
    - "Hard timeout via urlopen(req, timeout=0.5) — 500ms protects Claude session even when server is hung"
    - "Always sys.exit(0) — non-zero exit blocked Claude tool invocation in earlier versions"

key-files:
  created:
    - hooks/relay.py
  modified: []

key-decisions:
  - "TIMEOUT_SECONDS = 0.5: 500ms hard limit passed as named constant (not magic number) — documents why this value matters"
  - "Pure stdlib only (sys, json, urllib.request, urllib.error): zero pip install required, works in any Python 3.x environment"
  - "Metadata-only payload (4 fields): tool_input and tool_response explicitly excluded — security boundary, not a size optimization"
  - "Silent pass on all exceptions including json.parse errors and timeouts: Claude Code session cleanliness is non-negotiable"

patterns-established:
  - "Hook relay is fire-and-forget: no logging, no retries, no output of any kind"
  - "Exit 0 always: hook relay must never signal failure to Claude Code"

requirements-completed: [INGEST-01]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 1 Plan 02: Hook Relay Summary

**Python stdlib-only hook relay that reads Claude Code PreToolUse/PostToolUse events from stdin, extracts 4 metadata fields, and POSTs to localhost:4999/ingest with 500ms hard timeout — zero stdout, zero stderr, exit 0 always**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T06:47:17Z
- **Completed:** 2026-02-26T06:49:17Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created hooks/relay.py as the sole entry point for all ObservAgent observability data
- Enforced all critical constraints: 500ms timeout, exit 0 always, zero output to stdout/stderr
- Metadata-only extraction (tool_name, hook_type, session_id, tool_call_id) — tool_input and tool_response never forwarded
- Verified all three failure modes: connection refused, malformed JSON, empty stdin — all handled silently

## Task Commits

Each task was committed atomically:

1. **Task 1: Write relay.py hook relay script** - `940ce3e` (feat)

**Plan metadata:** (included in docs commit below)

## Files Created/Modified

- `hooks/relay.py` - Claude Code hook relay: reads stdin JSON, extracts metadata-only fields, POSTs to /ingest endpoint, silent fail on all errors

## Decisions Made

- Used `TIMEOUT_SECONDS = 0.5` named constant instead of magic number — documents the 500ms constraint's purpose clearly
- Pure Python stdlib (sys, json, urllib.request, urllib.error) — zero external dependencies, works out of the box
- Metadata-only extraction enforced explicitly: 4 fields forwarded, tool_input and tool_response never touched
- Entire main() body under a single `try/except Exception: pass` — cleanest possible guarantee of silent behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial automated test used 2s subprocess timeout — too tight for Python startup + network attempt (~0.65s total). Used 5s subprocess timeout for the test harness. The relay.py 500ms HTTP timeout constraint is met correctly — connection refused returns in ~78ms.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- hooks/relay.py is complete and executable (chmod +x applied)
- Claude Code settings.json must be configured to point PreToolUse and PostToolUse hooks to this relay (Phase 6 auto-install, or manual setup)
- Plan 01 (Node.js project bootstrap) and Plan 03 (Fastify server with /ingest route) are independent of relay.py and can proceed in any order
- The /ingest endpoint at localhost:4999 is the receiving end — relay.py is ready to fire as soon as that server runs

---
*Phase: 01-foundation*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: hooks/relay.py (exists, executable)
- FOUND: commit 940ce3e (feat(01-02): add Python hook relay script)
- FOUND: .planning/phases/01-foundation/01-02-SUMMARY.md
