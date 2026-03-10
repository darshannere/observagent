---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Insights Expansion
status: in-progress
last_updated: "2026-03-10T09:05:00.000Z"
progress:
  total_phases: 14
  completed_phases: 12
  total_plans: 54
  completed_plans: 52
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.1 Insights Expansion — Phase 13: Cost and Activity Charts

## Current Position

Phase: 13 of 14 (Cost and Activity Charts) — IN PROGRESS
Plan: 1 of 3 complete (13-01 done)
Status: Plan 13-01 complete — ready for Plan 13-02
Last activity: 2026-03-10 — Completed 13-01-PLAN.md (InsightsPanel tabbed layout)

Progress: [█████████░░░░░] 66% (12/14 phases complete, Phase 13 plan 1/3 done)

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
| Phase 12-insights-api-layer P03 | 8 | 2 tasks | 1 files |

## Accumulated Context

### Decisions

- [v2.0] React/Vite/Zustand stack — TanStack Virtual for ToolLog, Recharts for Insights panel
- [v2.0] relay.py allowlist: only extract command, file_path, pattern, description/subagent_type from tool_input
- [v2.0] SPA serving: @fastify/static wildcard:false + explicit /assets/* + setNotFoundHandler catch-all
- [v2.0] Solo sessions auto-create agent_nodes root on first PreToolUse (agent_id = session_id)
- [v2.0 debug] GET /api/events ORDER ASC via inner-DESC subquery — fixes ToolLog live event ordering
- [Phase 12-insights-api-layer]: cost-daily uses agent_id='' filter; cost-by-agent excludes solo sessions (no agent_type); session_id param on cost-by-agent reserved for Phase 13
- [Phase 12-02]: cache_read_tokens/cache_write_tokens excluded from tokens-over-time; activity counts PostToolUse only; bucket_ms via SQLite integer division
- [Phase 12-03]: stmtErrorRate uses 5-minute buckets (300000ms) consistent with health panel time horizon
- [Phase 12-03]: HAVING sample_count >= 2 on latency-by-tool excludes single-sample tools where NTILE percentile math is meaningless
- [Phase 13-01]: InsightsPanel tab state managed with local useState<Tab> — no external tab library; active tab styled with border-b-2 border-green-400

### Blockers

(none)

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 13-01-PLAN.md (InsightsPanel tabbed layout)
Resume file: None
