---
phase: 13-cost-and-activity-charts
plan: "03"
subsystem: ui
tags: [react, recharts, area-chart, polling, zustand, insights]

# Dependency graph
requires:
  - phase: 13-01
    provides: InsightsPanel tabbed layout with Activity tab placeholder and activeTab state
  - phase: 12-02
    provides: /api/insights/activity and /api/insights/tokens-over-time endpoints

provides:
  - ActivityChart (tool_calls/min area chart) in Activity tab
  - TokensOverTimeChart (input_tokens + output_tokens/min dual-area chart) in Activity tab
  - 30s polling while Activity tab is visible; cleared on tab switch
  - Session auto-selection from sessionCosts[0].session_id (freshest-first)
  - Empty state when no session active

affects: [13-CONTEXT, phase-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useEffect polling with setInterval + cleanup via tab-gated guard (activeTab check before polling)"
    - "status: idle | loading | ok | error pattern for async chart data"
    - "Inline retry button pattern for chart error states"

key-files:
  created: []
  modified:
    - frontend/src/components/insights/InsightsPanel.tsx

key-decisions:
  - "AreaChart and Area imported from recharts alongside existing BarChart (no new dependencies)"
  - "Tooltip formatter uses any type for recharts ValueType/NameType compatibility"
  - "useSSE.ts pre-existing TS error (string|null vs string|undefined) is out-of-scope; does not affect Activity tab"

patterns-established:
  - "Activity polling: useEffect fires on activeTab='Activity' and latestSessionId change, returns clearInterval cleanup"
  - "Session ID: always derived from sessionCosts[0].session_id — no dropdown, no user input"

requirements-completed: [INSG-03, INSG-04]

# Metrics
duration: 12min
completed: 2026-03-10
---

# Phase 13 Plan 03: Activity Charts Summary

**Two per-minute area charts (tool call activity and token burn rate) added to Activity tab with 30s auto-polling, session auto-selection, and loading/error/empty states.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-10T08:59:43Z
- **Completed:** 2026-03-10T09:11:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added "Tool Call Activity" AreaChart (calls/min, green fill) to Activity tab
- Added "Token Burn Rate" AreaChart with two Areas: Input (blue) and Output (purple) with Legend
- 30s polling via setInterval fires only when activeTab === 'Activity' and a session exists
- Session header shows "Session: {first 8 chars}" auto-selected from freshest sessionCosts entry
- No active session shows "No active session yet. Run an agent to see activity." with zero API calls

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ActivityChart and TokensOverTimeChart to Activity tab with 30s polling** - `4163495` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `frontend/src/components/insights/InsightsPanel.tsx` - Added AreaChart/Area/Legend/useEffect imports, activity state (activityData, activityStatus, tokensData, tokensStatus), polling useEffect, and full Activity tab JSX replacing placeholder

## Decisions Made
- Used `any` type annotation for recharts Token tooltip formatter to satisfy `Formatter<ValueType, NameType>` — recharts ValueType is `string | number | (string | number)[]` and strict typing causes TS2322
- Added `AreaChart`, `Area`, `Legend` imports directly in this plan since Plan 13-02 (parallel wave) may not yet be merged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added AreaChart/Area/Legend imports not yet present from Plan 13-02**
- **Found during:** Task 1 (implementation start)
- **Issue:** Plan notes "AreaChart and Area are already imported after Plan 13-02" but Plan 13-02 runs in parallel wave 2 — imports were not present
- **Fix:** Added `AreaChart, Area, Legend` to recharts import line and `useEffect` to React imports
- **Files modified:** frontend/src/components/insights/InsightsPanel.tsx
- **Verification:** TypeScript compiles clean; build check isolates only pre-existing useSSE.ts error
- **Committed in:** 4163495 (Task 1 commit)

---

**Total deviations:** 1 auto-added (missing imports from parallel plan not yet landed)
**Impact on plan:** Required for the feature to work at all. Zero scope creep.

## Issues Encountered
- Recharts `Tooltip formatter` strict TypeScript typing: `(v: number, name: string)` fails because recharts expects `(v: ValueType | undefined, name: NameType)`. Fixed with `any` annotation and eslint-disable comment.

## Next Phase Readiness
- Activity tab fully functional with real-time area charts
- Phase 13 plan 3/3 complete — Phase 13 is now fully done
- Phase 14 can proceed

---
*Phase: 13-cost-and-activity-charts*
*Completed: 2026-03-10*
