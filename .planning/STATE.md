---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Insights Expansion
status: completed
stopped_at: Completed 14-02-PLAN.md (Health tab error rate + latency charts)
last_updated: "2026-03-10T18:45:39.611Z"
last_activity: 2026-03-10 — Completed 14-02-PLAN.md (Health tab error rate + latency charts)
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.1 Insights Expansion — COMPLETE

## Current Position

Phase: 14 of 14 (Health and Latency Charts) — COMPLETE
Plan: 2 of 2 complete (14-01, 14-02 done)
Status: Plan 14-02 complete — Phase 14 fully done, v2.1 milestone complete
Last activity: 2026-03-10 — Completed 14-02-PLAN.md (Health tab error rate + latency charts)

Progress: [██████████] 100% (54/54 plans complete, all phases complete)

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
| Phase 13 P03 | 2min | 1 tasks | 1 files |
| Phase 13-cost-and-activity-charts P02 | 5 | 1 tasks | 1 files |
| Phase 14-health-and-latency-charts P01 | 2 | 2 tasks | 1 files |
| Phase 14-health-and-latency-charts P02 | ~15min | 2 tasks | 1 files |

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
- [Phase 13]: AreaChart/Area/Legend imported directly; parallel plan 13-02 imports not yet landed when 13-03 executed
- [Phase 13-02]: hasFetchedCost ref triggers fetch once on Cost tab first open — no polling needed for historical data
- [Phase 13-02]: Skeleton shown for both idle and loading states to prevent flash of empty content on initial render
- [Phase 14-health-and-latency-charts]: stalledCount derived from array length only when stalledStatus === 'ok' to prevent badge flicker during loading
- [Phase 14-health-and-latency-charts]: Always-on poll (empty-deps useEffect) for stalled-agents keeps badge accurate across tab switches
- [Phase 14-02]: Spike dots use inline dot prop returning explicit null (not undefined) for non-spike points — recharts 3.x requirement
- [Phase 14-02]: Both error-rate and latency-by-tool fetches share one useEffect + one 30s interval to keep polling synchronized
- [Phase 14-02]: Latency BarChart margin bottom=28 (vs standard 20) for angled tool name labels

### Blockers

(none)

## Session Continuity

Last session: 2026-03-10
Stopped at: Completed 14-02-PLAN.md (Health tab error rate + latency charts)
Resume file: None
