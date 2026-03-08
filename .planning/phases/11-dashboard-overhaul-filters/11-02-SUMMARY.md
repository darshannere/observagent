---
phase: 11-dashboard-overhaul-filters
plan: "02"
subsystem: frontend
tags: [agent-tree, layout, time-filter, ui, zustand]
dependency_graph:
  requires: [11-01]
  provides: [DASH2-01, DASH2-02, DASH2-03]
  affects: [LiveDashboard.tsx, AgentTree.tsx]
tech_stack:
  added: []
  patterns:
    - localStorage persistence for UI collapse state
    - IIFE pattern for per-session conditional rendering logic in JSX
    - flexBasis inline style for percentage-based flex column widths
key_files:
  modified:
    - frontend/src/pages/LiveDashboard.tsx
    - frontend/src/components/agents/AgentTree.tsx
    - frontend/src/components/insights/InsightsPanel.tsx
decisions:
  - "flexBasis 35% with min/max constraints chosen over Tailwind w-[35%] — inline style is explicit and avoids JIT purge risk"
  - "IIFE inside JSX map used for active/inactive split — keeps rendering logic colocated with session context without extracting a sub-component"
  - "inactiveCollapsed is global (single toggle for all sessions) — aligns with PLAN.md spec: viewport preference, not per-session detail"
  - "If all agents inactive, render all normally — prevents confusing empty active section per spec requirement"
metrics:
  duration: ~5 min
  completed: "2026-03-07"
  tasks_completed: 2
  files_modified: 3
---

# Phase 11 Plan 02: Agent Tree Wider Column + Active/Inactive Split Summary

**One-liner:** Agent tree widened to 35% flex basis with time filter buttons and active-first/collapsible-inactive split per session group using localStorage persistence.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Widen agent tree column and add time filter buttons in LiveDashboard | 2ad7658 | frontend/src/pages/LiveDashboard.tsx |
| 2 | Split active/inactive agents in AgentTree with collapsible inactive section | 05a3b13 | frontend/src/components/agents/AgentTree.tsx, frontend/src/components/insights/InsightsPanel.tsx |

## What Was Built

**Task 1 — LiveDashboard.tsx:**
- Replaced `w-56` fixed-width left column with `flexBasis: '35%'`, `minWidth: '200px'`, `maxWidth: '400px'` inline style
- Added time filter quick-select strip above AgentTree with buttons: Last 5m / Last 15m / Last 1h / All
- Wired buttons to `useObservStore.setTimeFilter` with active-state `bg-primary` styling
- Imported `TimeFilter` type from `@/store/useObservStore` for compile-time safety

**Task 2 — AgentTree.tsx:**
- Added `LS_INACTIVE_KEY = 'observagent:inactive-collapsed'` constant
- Added `inactiveCollapsed` state initialized from localStorage (lazy initializer)
- Added `useEffect` to persist `inactiveCollapsed` to localStorage on change
- Per-session: split `sessionAgents` into `activeAgents` (state === 'active') and `inactiveAgents` (all others)
- Active agents render first at full opacity with existing color coding (green-400)
- Inactive agents render in collapsible "Inactive (N)" section with `opacity-50 hover:opacity-75`
- Edge case: if all agents inactive, renders all normally without the active/inactive split

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed InsightsPanel.tsx Tooltip formatter TypeScript error**
- **Found during:** Task 2 verification (full `tsc -b && vite build`)
- **Issue:** `Tooltip formatter` prop typed `(value: ValueType | undefined, ...)` but formatter was `(v: number) => [...]` — TypeScript rejected the narrower param type; two instances at lines 63 and 83
- **Fix:** Changed `(v: number)` to `(v)` with `Number(v).toFixed(4)` — lets TypeScript infer the broader type, `Number()` handles undefined gracefully
- **Files modified:** `frontend/src/components/insights/InsightsPanel.tsx`
- **Commit:** 05a3b13
- **Note:** These changes were pre-existing uncommitted work in the working tree (part of Phase 11 Plan 03 in progress); the errors were blocking the TypeScript compiler before my AgentTree changes

## Verification

- `npm run build` exits 0 with no TypeScript errors
- `flexBasis: '35%'` confirmed in LiveDashboard.tsx
- `LS_INACTIVE_KEY` confirmed in AgentTree.tsx (3 occurrences: declaration, read, write)
- `setTimeFilter` confirmed in LiveDashboard.tsx (import + onClick handler)

## Self-Check: PASSED

Files confirmed present:
- FOUND: frontend/src/pages/LiveDashboard.tsx
- FOUND: frontend/src/components/agents/AgentTree.tsx
- FOUND: frontend/src/components/insights/InsightsPanel.tsx

Commits confirmed:
- FOUND: 2ad7658 (feat(11-02): widen agent tree column to 35% + add time filter button strip)
- FOUND: 05a3b13 (feat(11-02): split active/inactive agents in AgentTree with collapsible inactive section)
