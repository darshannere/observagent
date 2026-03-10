# Roadmap: ObservAgent

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-01)
- ✅ **v2.0 Agent Intelligence** — Phases 8-11 (shipped 2026-03-09)
- 🚧 **v2.1 Insights Expansion** — Phases 12-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7) — SHIPPED 2026-03-01</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for complete phase details.

28 plans completed across 7 phases:
- Phase 1: Schema Foundation
- Phase 2: Live Event Dashboard
- Phase 3: Cost and Token Tracking
- Phase 4: Multi-Agent Observability
- Phase 5: Session History and Export
- Phase 6: CLI and Zero-Config Setup
- Phase 7: Agent Timeline View and Health Panel

</details>

<details>
<summary>✅ v2.0 Agent Intelligence (Phases 8-11) — SHIPPED 2026-03-09</summary>

See `.planning/milestones/v2.0-ROADMAP.md` for complete phase details.

20 plans completed across 4 phases:
- Phase 8: Tool Log Enrichment + Calc Fix
- Phase 9: React Migration
- Phase 10: Agent Panel Redesign
- Phase 11: Dashboard Overhaul + Filters

</details>

---

### 🚧 v2.1 Insights Expansion (In Progress)

**Milestone Goal:** Transform the Insights panel into a comprehensive at-a-glance analytics dashboard with cost trends, activity timelines, and health charts.

- [x] **Phase 12: Insights API Layer** - Backend time-series endpoints that serve chart data for all seven new Insights charts (completed 2026-03-10)
- [x] **Phase 13: Cost and Activity Charts** - Daily cost trend, cost-by-agent, tool call timeline, and token burn rate charts in the Insights panel (completed 2026-03-10)
- [ ] **Phase 14: Health and Latency Charts** - Error rate timeline, per-tool latency (p50/p95), and stalled agent indicator in the Insights panel

## Phase Details

### Phase 12: Insights API Layer
**Goal**: The backend exposes all time-series data endpoints that the frontend Insights charts will consume
**Depends on**: Phase 11 (existing Fastify + SQLite stack)
**Requirements**: INSG-01, INSG-02, INSG-03, INSG-04, INSG-05, INSG-06, INSG-07
**Success Criteria** (what must be TRUE):
  1. GET /api/insights/cost-daily returns 7 days of aggregated cost data grouped by date
  2. GET /api/insights/cost-by-agent returns cost totals bucketed by agent type for the selected session/time range
  3. GET /api/insights/activity returns tool call counts bucketed per minute for the current session
  4. GET /api/insights/tokens-over-time returns input + output token counts per minute for the current session
  5. GET /api/insights/error-rate returns error counts per time bucket with timestamps for the selected range
  6. GET /api/insights/latency-by-tool returns p50 and p95 latency per tool type (Bash, Read, Write, Grep, etc.)
  7. GET /api/insights/stalled-agents returns currently active agents whose last activity exceeds 10 minutes
**Plans**: 3 plans

Plans:
- [ ] 12-01-PLAN.md — Create routes/insights.js with cost-daily and cost-by-agent endpoints
- [ ] 12-02-PLAN.md — Add activity and tokens-over-time endpoints (per-minute bucketing)
- [ ] 12-03-PLAN.md — Add error-rate, latency-by-tool (p50/p95), and stalled-agents endpoints

### Phase 13: Cost and Activity Charts
**Goal**: Users can see how expensive and busy their agents are over time via four new charts in the Insights panel
**Depends on**: Phase 12
**Requirements**: INSG-01, INSG-02, INSG-03, INSG-04
**Success Criteria** (what must be TRUE):
  1. User can see a 7-day daily cost trend as a filled area chart in the Insights panel
  2. User can see cost broken down by agent type (gsd-executor, gsd-planner, etc.) as a bar chart
  3. User can see tool call activity for the current session as a per-minute area chart showing busy vs idle periods
  4. User can see input and output token consumption rate over time as a per-minute chart
**Plans**: 3 plans

Plans:
- [ ] 13-01-PLAN.md — Refactor InsightsPanel into tabbed layout (Cost/Activity/Health); move existing charts to Cost tab
- [ ] 13-02-PLAN.md — Add 7-day cost trend area chart and cost-by-agent bar chart to Cost tab
- [ ] 13-03-PLAN.md — Add tool call activity and token burn rate charts to Activity tab with 30s polling

### Phase 14: Health and Latency Charts
**Goal**: Users can assess agent health, identify error spikes, understand tool latency profiles, and spot stalled agents — all from the Insights panel
**Depends on**: Phase 12
**Requirements**: INSG-05, INSG-06, INSG-07
**Success Criteria** (what must be TRUE):
  1. User can see an error rate timeline chart with visual spike highlighting for anomalous error bursts
  2. User can see a per-tool-type latency chart displaying p50 and p95 bars for Bash, Read, Write, Grep, and other tool types
  3. User can identify stalled agents from the Insights panel — agents active beyond 10 minutes are surfaced with their name and idle duration
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | — | Complete | 2026-03-01 |
| 2. Live Event Dashboard | v1.0 | — | Complete | 2026-03-01 |
| 3. Cost and Token Tracking | v1.0 | — | Complete | 2026-03-01 |
| 4. Multi-Agent Observability | v1.0 | — | Complete | 2026-03-01 |
| 5. Session History and Export | v1.0 | — | Complete | 2026-03-01 |
| 6. CLI and Zero-Config Setup | v1.0 | — | Complete | 2026-03-01 |
| 7. Agent Timeline View and Health Panel | v1.0 | — | Complete | 2026-03-01 |
| 8. Tool Log Enrichment + Calc Fix | v2.0 | — | Complete | 2026-03-09 |
| 9. React Migration | v2.0 | — | Complete | 2026-03-09 |
| 10. Agent Panel Redesign | v2.0 | — | Complete | 2026-03-09 |
| 11. Dashboard Overhaul + Filters | v2.0 | — | Complete | 2026-03-09 |
| 12. Insights API Layer | 3/3 | Complete    | 2026-03-10 | - |
| 13. Cost and Activity Charts | 3/3 | Complete   | 2026-03-10 | - |
| 14. Health and Latency Charts | v2.1 | 0/TBD | Not started | - |
