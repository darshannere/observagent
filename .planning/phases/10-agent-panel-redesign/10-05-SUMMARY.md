---
phase: 10-agent-panel-redesign
plan: "05"
subsystem: ui
tags: [react, typescript, live-dashboard, agent-count-badge, agent-detail-panel]
---

# Dependency graph
requires:
  - phase: 10-02
    provides: selectActiveAgentCount selector, selectedAgent state, setSelectedAgent action
  - phase: 10-03
    provides: AgentTree wired to setSelectedAgent on click
  - phase: 10-04
    provides: AgentDetailPanel component

provides:
  - Active agent count badge in Agents panel header (green pill, hidden when 0)
  - AgentDetailPanel mounted in LiveDashboard as fixed overlay
  - Backdrop div (z-40) for click-outside-to-close
  - Real-time badge updates via existing SSE → updateAgentState pipeline

affects:
  - End-to-end: clicking an agent row opens detail panel (AGNT-05 fully wired)

# Tech tracking
tech-stack:
  changed:
    - frontend/src/pages/LiveDashboard.tsx

# What was built
2 commits:

1. **Active count badge** — `selectActiveAgentCount` selector added to LiveDashboard; green rounded-full badge next to "Agents" heading; hidden when count = 0; updates live via SSE (agent state changes already wired in store).

2. **AgentDetailPanel + backdrop** — `AgentDetailPanel` rendered as fixed overlay inside the layout div; transparent `z-40` backdrop rendered when `selectedAgent !== null`; clicking backdrop calls `setSelectedAgent(null)` to close.

# Commits
- feat(10-05): add live active agent count badge to Agents panel header
- feat(10-05): mount AgentDetailPanel with backdrop click-to-close in LiveDashboard

# Verification
- TypeScript: 0 errors
- Badge visible with correct count when agents active
- AgentDetailPanel overlay opens/closes on agent click / backdrop click / ✕ button

# Self-Check: PASSED
- [x] AGNT-02: Active count badge displays and updates in real-time
- [x] AGNT-05: Clicking agent row opens detail panel; backdrop / ✕ closes it
