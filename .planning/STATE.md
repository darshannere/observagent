---
gsd_state_version: 1.0
milestone: v2.5
milestone_name: Developer Experience
status: defining_requirements
stopped_at: Defining requirements for v2.5
last_updated: "2026-03-11T00:00:00.000Z"
last_activity: 2026-03-11 — Milestone v2.5 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.5 Developer Experience — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-11 — Milestone v2.5 started

## Accumulated Context

### Decisions

- [v2.0] React/Vite/Zustand stack — TanStack Virtual for ToolLog, Recharts for Insights panel
- [v2.0] relay.py allowlist: only extract command, file_path, pattern, description/subagent_type from tool_input
- [v2.0] SPA serving: @fastify/static wildcard:false + explicit /assets/* + setNotFoundHandler catch-all
- [v2.0] Solo sessions auto-create agent_nodes root on first PreToolUse (agent_id = session_id)
- [v2.0 debug] GET /api/events ORDER ASC via inner-DESC subquery — fixes ToolLog live event ordering
- [v2.1] NTILE(100) for p50/p95 in SQLite — no external stats lib needed
- [v2.1] Always-on stalled-agents poll (empty deps) keeps badge live across tab switches
- [v2.1] Tab-gated polling with [activeTab, latestSessionId] deps — stops API calls when tab not visible

### Blockers

(none)

## Session Continuity

Last session: 2026-03-11
Stopped at: Defining requirements for v2.5
Resume file: None
