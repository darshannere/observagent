---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Insights Expansion
status: defining_requirements
last_updated: "2026-03-10T00:00:00Z"
progress:
  total_phases: 11
  completed_phases: 11
  total_plans: 48
  completed_plans: 48
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.1 Insights Expansion — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-10 — Milestone v2.1 started

## Accumulated Context

### Decisions

- [v2.0] relay.py allowlist: only extract command, file_path, pattern, description/subagent_type from tool_input
- [v2.0] React/Vite/Zustand stack — TanStack Virtual for ToolLog, Recharts for Insights
- [v2.0] SPA serving: @fastify/static wildcard:false + explicit /assets/* + setNotFoundHandler catch-all
- [v2.0] Solo sessions auto-create agent_nodes root on first PreToolUse (agent_id = session_id)
- [v2.0 debug] GET /api/events ORDER ASC via inner-DESC subquery — fixes ToolLog live event ordering

### Blockers

(none)
