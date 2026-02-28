---
phase: 05-session-history-and-discovery
plan: 02
subsystem: ui
tags: [vanilla-js, sse, dashboard, export, replay, csv, jsonl]

# Dependency graph
requires:
  - phase: 05-session-history-and-discovery
    provides: "Plan 05-01 — project_name column, sessions table, GET /api/sessions endpoint"
  - phase: 04-multi-agent-observability
    provides: "Plan 04-03 — 3-column dashboard with subscribeSSE() and second EventSource for agent tree"
provides:
  - "Replay mode in public/index.html: IS_REPLAY detection from ?session_id= URL param"
  - "Amber sticky replay banner with Export JSONL, Export CSV buttons, and Back to History link"
  - "hydrate() branching: uses /api/events?session_id= in replay mode, /api/events in live mode"
  - "SSE suppression: subscribeSSE() and agentEs EventSource both gated on !IS_REPLAY"
  - "Export helpers: toCsvRow(), triggerDownload(), exportSession() fetching /api/sessions/:id/export"
affects:
  - 05-03  # Export endpoint plan uses /api/sessions/:id/export that exportSession() calls

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IS_REPLAY flag pattern: single URL param drives entire branch — no side effects in normal mode"
    - "display:none in HTML with JS setting display:flex — replay banner hidden by default, activated by JS"
    - "SSE guard pattern: wrap EventSource instantiation in if (!IS_REPLAY) — zero SSE connections in replay"

key-files:
  created: []
  modified:
    - public/index.html

key-decisions:
  - "Use --accent-amber,#d29922 CSS variable fallback for amber banner so it works even if variable not defined"
  - "Both subscribeSSE() and agentEs EventSource wrapped in !IS_REPLAY — ensures zero live SSE in replay mode"
  - "Export buttons wire to /api/sessions/:id/export (Plan 03 endpoint) — will 404 until Plan 03 ships (acceptable)"
  - "Export helpers placed between subscribeSSE definition and DOMContentLoaded — no hoisting needed, accessible from click handlers"

patterns-established:
  - "Replay-first export pattern: fetch full session data then derive filename from session metadata"
  - "IS_REPLAY as top-level const in script — single source of truth for all conditional behavior"

requirements-completed:
  - HIST-01
  - HIST-03

# Metrics
duration: ~5min
completed: 2026-02-27
---

# Phase 5 Plan 02: Session Replay Mode Summary

**Replay mode for the live dashboard: IS_REPLAY detection, amber sticky banner with export/nav buttons, SSE suppression, and CSV/JSONL export helpers — all client-side, zero regressions in normal mode.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-27T00:00:00Z
- **Completed:** 2026-02-27
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `REPLAY_SESSION_ID` and `IS_REPLAY` constants from URL search params at top of script block
- Inserted amber sticky replay banner (`#replay-banner`) with Export JSONL, Export CSV, and Back to History controls; hidden by default, activated by JS when `IS_REPLAY`
- Patched `hydrate()` to fetch `/api/events?session_id=REPLAY_SESSION_ID` in replay mode instead of bare `/api/events`
- Suppressed both `subscribeSSE()` and the Phase-4 agent `agentEs` EventSource inside `!IS_REPLAY` guards — zero live SSE connections when viewing a replay
- Added `toCsvRow()`, `triggerDownload()`, and `exportSession()` helpers that call `/api/sessions/:id/export` (Plan 03 endpoint) and trigger a browser file download

## Task Commits

Each task was committed atomically:

1. **Task 1: Add replay mode detection, banner, export, and SSE suppression** - `e39b341` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `public/index.html` — replay mode detection, replay banner HTML, hydrate() branch, SSE suppression guards, export helpers

## Decisions Made

- Used `var(--accent-amber, #d29922)` with fallback because the CSS variable `--accent-amber` is not defined in Phase-4's CSS; the fallback `#d29922` matches the existing `--yellow` value ensuring correct color without adding a CSS variable.
- Both SSE connections (`subscribeSSE` for events, `agentEs` for agent tree) are individually guarded — suppressing only one would leave the other alive and consume server resources.
- Export buttons call the not-yet-implemented `/api/sessions/:id/export` endpoint; a 404 response is acceptable until Plan 03 ships the endpoint.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The previous agent's work was complete and correct; this execution verified and committed it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Replay mode is fully functional for display and navigation
- Export buttons are wired and ready; they will become functional when Plan 03 adds `GET /api/sessions/:id/export`
- Normal live dashboard behavior is completely unaffected

## Self-Check: PASSED

- FOUND: `public/index.html` — file exists on disk
- FOUND: commit `e39b341` — confirmed in git log output during execution

---
*Phase: 05-session-history-and-discovery*
*Completed: 2026-02-27*
