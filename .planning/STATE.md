---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Insights Expansion
status: unknown
last_updated: "2026-03-10T04:29:00.580Z"
progress:
  total_phases: 12
  completed_phases: 11
  total_plans: 51
  completed_plans: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.1 Insights Expansion — Phase 12: Insights API Layer

## Current Position

Phase: 12 of 14 (Insights API Layer)
Plan: 2 of 3 complete (12-01, 12-02 done)
Status: In progress
Last activity: 2026-03-10 — Completed 12-02-PLAN.md (activity + tokens-over-time endpoints)

Progress: [████████░░░░░░] 57% (11/14 phases complete, 2/3 plans in phase 12)

## Performance Metrics

**Velocity:**
- Total plans completed: 48 (v1.0 + v2.0)
- Average duration: unknown
- Total execution time: unknown

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 1-7 (v1.0) | 28 | Complete |
| 8-11 (v2.0) | 20 | Complete |
| 12-14 (v2.1) | TBD | Not started |

## Accumulated Context

### Decisions

- [v2.0] React/Vite/Zustand stack — TanStack Virtual for ToolLog, Recharts for Insights panel
- [v2.0] relay.py allowlist: only extract command, file_path, pattern, description/subagent_type from tool_input
- [v2.0] SPA serving: @fastify/static wildcard:false + explicit /assets/* + setNotFoundHandler catch-all
- [v2.0] Solo sessions auto-create agent_nodes root on first PreToolUse (agent_id = session_id)
- [v2.0 debug] GET /api/events ORDER ASC via inner-DESC subquery — fixes ToolLog live event ordering
- [Phase 12-insights-api-layer]: cost-daily uses agent_id='' filter; cost-by-agent excludes solo sessions (no agent_type); session_id param on cost-by-agent reserved for Phase 13
- [Phase 12-02]: cache_read_tokens/cache_write_tokens excluded from tokens-over-time; activity counts PostToolUse only; bucket_ms via SQLite integer division

### Blockers

(none)

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 12-02-PLAN.md
Resume file: None
