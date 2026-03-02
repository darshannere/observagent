---
phase: 08-tool-log-enrichment-calc-fix
plan: "04"
subsystem: ui
tags: [costEngine, context-window, dashboard, javascript, html]

# Dependency graph
requires:
  - phase: 07-timeline-health-alerts
    provides: dashboard infrastructure and cost panel UI

provides:
  - getContextFillPercent() with AUTOCOMPACT_BUFFER (40K) subtraction — effective denominator 160K on 200K model
  - Info icon with native tooltip next to context fill % in dashboard

affects:
  - 09-agent-detail-panel (AGNT-07 context fill bar reads from getContextFillPercent())
  - 10-dash-polish (DASH2-04 depends on accurate context fill values)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AUTOCOMPACT_BUFFER constant defined once above the function that uses it (not inline)"
    - "Native browser tooltip via title attribute — no JS required for simple tooltips"

key-files:
  created: []
  modified:
    - lib/costEngine.js
    - public/index.html

key-decisions:
  - "Apply AUTOCOMPACT_BUFFER = 40_000 as best-available estimate (consistent with codelynx.dev research confirming Claude Code uses autocompact buffer) rather than waiting for live session comparison"
  - "Use native title attribute for info tooltip — no additional JS overhead needed"

patterns-established:
  - "Effective window pattern: subtract a buffer constant from raw context window before dividing"

requirements-completed: [CALC-01]

# Metrics
duration: 8min
completed: 2026-03-02
---

# Phase 8 Plan 04: Context Fill Calc Fix Summary

**getContextFillPercent() updated to subtract 40K autocompact buffer (effectiveWindow=160K on 200K model), plus info tooltip added next to context fill % display — closes CALC-01**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T22:10:41Z
- **Completed:** 2026-03-02T22:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed CALC-01: context fill % was ~10% lower than Claude Code because ObservAgent used raw 200K denominator while Claude Code uses ~160K (200K minus ~40K autocompact buffer)
- Added AUTOCOMPACT_BUFFER = 40_000 constant to costEngine.js with explanatory comment citing source
- Updated getContextFillPercent() to use effectiveWindow = contextWindow - AUTOCOMPACT_BUFFER as denominator
- Added .info-icon CSS and info icon span (U+24D8 ⓘ) next to #ctx-pct with native browser tooltip explaining the potential residual discrepancy

## Task Commits

Each task was committed atomically:

1. **Task 1: Investigate discrepancy and update getContextFillPercent()** - `f0629b9` (feat)
2. **Task 2: Add info tooltip next to context fill % in dashboard** - `3344f86` (feat)

**Plan metadata:** (created in this session — see final commit)

## Files Created/Modified

- `lib/costEngine.js` - Added AUTOCOMPACT_BUFFER = 40_000 constant and updated getContextFillPercent() to use effectiveWindow = contextWindow - AUTOCOMPACT_BUFFER as denominator
- `public/index.html` - Added .info-icon CSS class and info icon span next to #ctx-pct display element

## Decisions Made

- Applied AUTOCOMPACT_BUFFER = 40_000 (not 0, not inline) as a named constant so the intent is clear and the value can be updated if Anthropic changes the buffer size
- Used native title attribute for tooltip rather than a custom JS tooltip — simpler and zero runtime overhead
- Placed the info icon immediately after #ctx-pct (inline in the ctx-label flex row) — it sits naturally between the "Context" label and the percentage

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Git index staleness: git initially reported public/index.html as unmodified even though the file on disk had changed. Running `git update-index --really-refresh` revealed the file needed to be restaged. Committed successfully after explicit re-staging. Root cause: git index metadata (mtime/inode) was cached from before the Edit tool write.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CALC-01 complete — Phase 9 (AGNT-07 agent detail context fill bar) will get accurate values from getContextFillPercent()
- DASH2-04 in Phase 10 also depends on accurate context fill — now unblocked
- No regressions: cost panel displays correctly, contextFillPct SSE events still trigger display updates

---
*Phase: 08-tool-log-enrichment-calc-fix*
*Completed: 2026-03-02*
