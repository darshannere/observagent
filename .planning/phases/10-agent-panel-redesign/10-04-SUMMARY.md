---
phase: 10-agent-panel-redesign
plan: "04"
subsystem: ui
tags: [react, typescript, agent-detail-panel, tabs, api-fetch]
---

# Dependency graph
requires:
  - phase: 10-01
    provides: GET /api/agents/:id/detail endpoint, initial_prompt column, cache token columns
  - phase: 10-02
    provides: selectedAgent in store, setSelectedAgent action, Agent.currentTool type

provides:
  - AgentDetailPanel: fixed right-side slide-in panel (w-80, z-50, CSS translate transition)
  - AgentDetailTabs: PromptTab, ContextTab, CallsTab, TokensTab components
  - Fetches /api/agents/:id/detail on selectedAgent change
  - PromptTab: shows initial_prompt + context fill % bar (green/yellow/red thresholds)
  - ContextTab: placeholder for AGNT-10 (deferred to Phase 11)
  - CallsTab: tool call history table with timestamp, duration, exit status
  - TokensTab: per-call input/output/cache token breakdown with totals row

affects:
  - phase 10-05 (LiveDashboard mounts AgentDetailPanel)

# Tech tracking
tech-stack:
  added:
    - frontend/src/components/agents/AgentDetailPanel.tsx (NEW)
    - frontend/src/components/agents/AgentDetailTabs.tsx (NEW)

# What was built
Executed directly (subagent blocked by permission mode). 5 tasks, 5 commits:

1. **AgentDetailPanel shell** — slide-in panel with header (agent label + close ✕), 4-tab bar (Prompt/Context/Calls/Tokens), loading/empty states. CSS `translate-x-full` → `translate-x-0` transition.

2. **PromptTab** — displays `initial_prompt` in scrollable pre block; context fill % bar computed from sum of `input_tokens` / 200,000; color-coded green/yellow/red at 60%/80% thresholds.

3. **ContextTab** — informative placeholder explaining AGNT-10 deferral and what Phase 11 will require.

4. **CallsTab** — table with Tool, Time (formatted HH:MM:SS), Duration (ms/<1s or Xs/>1s), exit status (✓ green / ✗ red / — null).

5. **TokensTab** — per-API-call In/Out/Cache columns + totals row with `toLocaleString()` formatting.

# Commits
- feat(10-04): create AgentDetailPanel slide-in shell with 4-tab layout
- feat(10-04): implement PromptTab with initial prompt and context fill % bar
- feat(10-04): add ContextTab placeholder (AGNT-10 deferred to Phase 11)
- feat(10-04): implement CallsTab with tool history, timestamps, duration, status
- feat(10-04): implement TokensTab with per-call input/output/cache breakdown and totals

# Verification
- TypeScript: 0 errors
- AgentDetailPanel slides in when selectedAgent set
- All 4 tabs renderable

# Self-Check: PASSED
- [x] AGNT-05: Panel opens when selectedAgent set
- [x] AGNT-06: PromptTab displays initial_prompt
- [x] AGNT-07: Context fill % bar in PromptTab
- [x] AGNT-08: CallsTab shows tool history
- [x] AGNT-09: TokensTab shows per-call token breakdown
- [x] AGNT-10: DEFERRED to Phase 11 (ContextTab has informative placeholder)
