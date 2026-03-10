---
phase: 14-health-and-latency-charts
plan: 01
subsystem: ui
tags: [react, typescript, polling, recharts, insights-panel]

# Dependency graph
requires:
  - phase: 12-insights-api-layer
    provides: /api/insights/stalled-agents endpoint returning stalled agent list
  - phase: 13-cost-and-activity-charts
    provides: InsightsPanel with Cost and Activity tabs already wired
provides:
  - Health tab body with stalled agents widget (green card or agent cards)
  - Always-on 30s background poll for stalled agents (not gated on activeTab)
  - Dynamic "Health (N)" tab badge reflecting live stalled agent count
affects: [14-02-plan (adds error rate + latency charts to same Health tab body)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Always-on mount-time useEffect with empty deps for cross-tab live badge
    - stalledCount derived from stalledStatus === 'ok' guard to avoid premature badge display

key-files:
  created: []
  modified:
    - frontend/src/components/insights/InsightsPanel.tsx

key-decisions:
  - "stalledCount derived from array length only when stalledStatus === 'ok' to prevent badge flicker during loading"
  - "Always-on poll uses empty deps useEffect so badge stays accurate when user is on Cost or Activity tab"
  - "Health tab widget shows skeleton at 48px height (smaller than chart skeletons) since it's a list not a chart"

patterns-established:
  - "Always-on poll pattern: empty-deps useEffect + setInterval 30s + clearInterval cleanup — used for cross-tab live badges"
  - "Stalled agent card: flex justify-between, truncate name left, mono idle-time right in yellow-400"

requirements-completed: [INSG-07]

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 14 Plan 01: Health Tab Stalled Agents Widget Summary

**Health tab stub replaced with stalled agents widget — always-on 30s background poll drives a live "Health (N)" badge visible from any tab**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-10T09:37:00Z
- **Completed:** 2026-03-10T09:39:01Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `StalledAgent` interface and state (stalledAgents, stalledStatus, stalledCount) to InsightsPanel
- Wired always-on mount-time useEffect (empty deps) polling `/api/insights/stalled-agents` every 30 seconds — badge stays accurate regardless of which tab is active
- Replaced "coming in next release" stub with full stalled agents widget: skeleton while loading, inline retry on error, green "All agents healthy" card when empty, compact agent cards (name + idle duration as Xm Ys + last active time) when stalled agents exist
- Tab bar now renders "Health (N)" when stalledCount > 0, plain "Health" when zero

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Health tab state, always-on stalled-agents poll, and dynamic badge** - `17367af` (feat)
2. **Task 2: Implement stalled agents widget in Health tab body** - `9bcd959` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `frontend/src/components/insights/InsightsPanel.tsx` - Added StalledAgent interface, three state vars, always-on useEffect poll, dynamic tab badge, and full Health tab body with stalled agents widget

## Decisions Made
- `stalledCount` is derived from `stalledAgents.length` only when `stalledStatus === 'ok'` — prevents the badge showing a stale non-zero count during a reload
- Empty-deps useEffect ensures the background poll and badge function even when the user is on the Cost or Activity tab (not just when Health tab is active)
- Skeleton shown for both `idle` and `loading` states (consistent with Cost tab pattern from phase 13-02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Health tab has the stalled agents widget and placeholder comment for plan-02 additions
- Plan 14-02 can insert error rate and latency charts directly after the `{/* Placeholder for error rate + latency charts (added in plan 02) */}` comment in the Health tab body
- TypeScript and Vite build both pass clean

## Self-Check: PASSED

- InsightsPanel.tsx: FOUND
- 14-01-SUMMARY.md: FOUND
- Commit 17367af (Task 1): FOUND
- Commit 9bcd959 (Task 2): FOUND

---
*Phase: 14-health-and-latency-charts*
*Completed: 2026-03-10*
