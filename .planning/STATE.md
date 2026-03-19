---
gsd_state_version: 1.0
milestone: v2.5
milestone_name: Developer Experience
status: Milestone shipped
stopped_at: v2.5 complete (Phase 14.1 only; phases 15-20 removed from roadmap)
last_updated: "2026-03-19T05:35:00.000Z"
last_activity: 2026-03-19 — v2.5 milestone shipped (Phase 14.1 only)
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.5 shipped, ready for new milestone

## Current Position

Milestone: v2.5 — Complete
Status: Shipped (Phase 14.1 only; phases 15-20 removed by user)
Last activity: 2026-03-19 — v2.5 milestone shipped

```
v2.5 Progress: [████████████████████] 100% (1/1 phases)
```

## Phase Summary

v2.5 shipped with Phase 14.1 only. Phases 15-20 removed from roadmap.

## Accumulated Context

### Roadmap Evolution

- Phase 14.1 inserted after Phase 14: Create Landing Page (URGENT)

### Decisions

- [v2.0] React/Vite/Zustand stack — TanStack Virtual for ToolLog, Recharts for Insights panel
- [v2.0] relay.py allowlist: only extract command, file_path, pattern, description/subagent_type from tool_input
- [v2.0] SPA serving: @fastify/static wildcard:false + explicit /assets/* + setNotFoundHandler catch-all
- [v2.0] Solo sessions auto-create agent_nodes root on first PreToolUse (agent_id = session_id)
- [v2.0 debug] GET /api/events ORDER ASC via inner-DESC subquery — fixes ToolLog live event ordering
- [v2.1] NTILE(100) for p50/p95 in SQLite — no external stats lib needed
- [v2.1] Always-on stalled-agents poll (empty deps) keeps badge live across tab switches
- [v2.1] Tab-gated polling with [activeTab, latestSessionId] deps — stops API calls when tab not visible
- [v2.5] Phase 14.1 (Landing Page) shipped 2026-03-19

### Blockers

(none)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Implement CLI version banner and dashboard version badge | 2026-03-15 | b79a292 | [1-implement-cli-version-banner-and-dashboa](./quick/1-implement-cli-version-banner-and-dashboa/) |

## Session Continuity

Last session: 2026-03-19
Stopped at: v2.5 milestone shipped
Resume file: none
