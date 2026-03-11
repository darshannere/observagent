# Requirements: ObservAgent

**Defined:** 2026-03-11
**Core Value:** See exactly which agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

## v2.5 Requirements

Requirements for v2.5 Developer Experience milestone. Each maps to roadmap phases.

### CLI Setup & Diagnostics

- [ ] **CLI-01**: User sees numbered next-step guidance immediately after `npx observagent init` completes
- [ ] **CLI-02**: User runs `npx observagent doctor` and sees a checklist of pass/fail checks, each failure showing the exact command or config block to fix it
- [ ] **CLI-03**: User running `doctor` with hooks not configured sees the exact JSON config block to add to Claude Code settings

### Version & Updates

- [ ] **VER-01**: User sees a "New version available" banner in the terminal when running `npx observagent start` and a newer version exists on npm
- [ ] **VER-02**: User runs `npx observagent update` and sees the changelog for the new version plus the exact install command to run
- [ ] **VER-03**: User can navigate to a "What's New" page in the dashboard showing release notes for the current and recent versions; page auto-shows once after upgrade

### Dashboard Guidance

- [ ] **DASH-01**: User with no sessions yet sees a contextual empty state in the dashboard — hooks-not-configured shows init instructions; hooks-configured shows "waiting for first session"
- [ ] **DASH-02**: User can hover over domain-specific metrics (p50/p95 latency, context fill %, stalled agent count, cache hit rate) and see a tooltip explaining what the metric means
- [ ] **DASH-03**: First-time user sees a step-by-step onboarding walkthrough of the dashboard; walkthrough is skippable, persisted to localStorage, and shows a "Replay tour" option after completion

## Future Requirements

### CLI Setup

- **CLI-04**: User can run `npx observagent init --force` to re-run setup and overwrite existing config (deferred — not critical for v2.5)
- **CLI-05**: User sees a progress spinner during `init` when network calls are made (deferred — minor polish)

### Dashboard Guidance

- **DASH-04**: Dashboard shows a persistent version badge in the header (deferred — What's New page covers this need without the badge)
- **DASH-05**: User can view a per-feature changelog diff (deferred — full release notes sufficient for v2.5)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Telemetry / onboarding analytics | Conflicts with local-first, privacy-preserving architecture |
| Fake/demo data mode | Violates core product value — observability of real agent activity |
| Blocking modal product tour | Anti-pattern for dev tools; users dismiss immediately |
| OAuth or account-gated What's New | Local-first; no accounts |
| Auto-update (silent, no prompt) | User must control when they update; no silent installs |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01 | Phase 16 | Pending |
| CLI-02 | Phase 16 | Pending |
| CLI-03 | Phase 16 | Pending |
| VER-01 | Phase 16 | Pending |
| VER-02 | Phase 16 | Pending |
| VER-03 | Phase 17 | Pending |
| DASH-01 | Phase 18 | Pending |
| DASH-02 | Phase 19 | Pending |
| DASH-03 | Phase 20 | Pending |

**Coverage:**
- v2.5 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 — traceability populated after roadmap creation*
