# Requirements: ObservAgent

**Defined:** 2026-03-10
**Milestone:** v2.1 Insights Expansion
**Core Value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

## v2.1 Requirements

### Insights

- [x] **INSG-01**: User can see daily cost trend over the past 7 days as an area chart in the Insights panel
- [x] **INSG-02**: User can see cost breakdown by agent type (gsd-executor, gsd-planner, etc.) as a bar chart
- [x] **INSG-03**: User can see tool call activity timeline for the current session (tool calls per minute as area chart)
- [x] **INSG-04**: User can see token consumption rate over time (input + output tokens per minute chart)
- [ ] **INSG-05**: User can see error rate timeline showing errors over time with visual spike highlighting
- [ ] **INSG-06**: User can see per-tool-type latency chart (p50/p95 bars for Bash, Read, Write, Grep, etc.)
- [ ] **INSG-07**: User can identify stalled agents directly from the Insights panel (agents active beyond 10-min threshold)

## Future Requirements (v2.2+)

### Insights — Extended

- **INSG-08**: User can view a full-page dedicated Insights view with expanded chart layouts
- **INSG-09**: User can export charts as PNG or data as CSV
- **INSG-10**: User can set custom time range per chart (independent of session filter)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Moving charts to separate page | Keep in panel for v2.1; avoids nav changes |
| Custom per-chart time range picker | Existing session filter is sufficient for now |
| Chart annotations / comments | Orthogonal to observability goals |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INSG-01 | Phase 12, Phase 13 | Complete |
| INSG-02 | Phase 12, Phase 13 | Complete |
| INSG-03 | Phase 12, Phase 13 | Complete |
| INSG-04 | Phase 12, Phase 13 | Complete |
| INSG-05 | Phase 12, Phase 14 | Pending |
| INSG-06 | Phase 12, Phase 14 | Pending |
| INSG-07 | Phase 12, Phase 14 | Pending |

**Coverage:**
- v2.1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 — traceability filled after roadmap creation*
