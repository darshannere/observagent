---
phase: 10-agent-panel-redesign
plan: "03"
subsystem: ui
tags: [react, typescript, zustand, agent-tree, localStorage, collapse]
---

# Dependency graph
requires:
  - phase: 10-02
    provides: collapsedSessions, toggleSessionCollapse, setSelectedAgent, updateAgentCurrentTool in store; currentTool on Agent type

provides:
  - AgentTree with localStorage-backed per-session collapse state (key: observagent:collapsed-sessions)
  - Human-readable agent labels in format `{type} [last4]`
  - Blue ToolBadge showing agent.currentTool inline in each row (live via SSE)
  - Agent row click wired to setSelectedAgent for detail panel

affects:
  - phase 10-04 (AgentDetailPanel mounts when selectedAgent is set)

# Tech tracking
tech-stack:
  added: []
  changed:
    - frontend/src/components/agents/AgentTree.tsx

# What was built
All 4 tasks implemented directly (subagent blocked by permission mode):

1. **localStorage collapse** — `useEffect` loads collapsed session IDs on mount; second `useEffect` persists `collapsedSessions` Set on change. Summary `onClick` calls `toggleSessionCollapse` + filter logic. `<details open={!isCollapsed}>` wired to store state.

2. **Human-readable names** — `agentLabel()` now returns `` `${type} [${last4}]` `` (e.g. `gsd-executor [a1b2]`).

3. **ToolBadge** — New `ToolBadge` component renders `agent.currentTool` as `bg-blue-900/60` badge. Updates live on every PreToolUse SSE event (wired in 10-02).

4. **Detail panel wiring** — Agent row `onClick` now calls both `setAgentFilter` and `setSelectedAgent(agentId)` (null on deselect).

# Commits
- feat(10-03): add localStorage-backed collapse state to AgentTree
- feat(10-03): display human-readable agent names as `type [last4]`
- feat(10-03): show current tool as blue badge in agent rows
- feat(10-03): wire agent row click to setSelectedAgent for detail panel

# Verification
- TypeScript: 0 errors (npx tsc --noEmit clean)
- Collapse state persists in localStorage under `observagent:collapsed-sessions`
- Agent rows show `{type} [xxxx]` format
- ToolBadge renders blue badge with current tool name
- Clicking row sets selectedAgent in Zustand store

# Self-Check: PASSED
All must_haves satisfied:
- [x] AGNT-01: Tree branches collapsible with localStorage persistence
- [x] AGNT-03: Names formatted as `{type} [xxxx]`
- [x] AGNT-04: Current tool visible in row via ToolBadge
