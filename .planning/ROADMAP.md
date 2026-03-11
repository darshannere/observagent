# Roadmap: ObservAgent

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-01)
- ✅ **v2.0 Agent Intelligence** — Phases 8-11 (shipped 2026-03-09)
- ✅ **v2.1 Insights Expansion** — Phases 12-14 (shipped 2026-03-10)
- 🔄 **v2.5 Developer Experience** — Phases 15-20 (in progress)

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

<details>
<summary>✅ v2.1 Insights Expansion (Phases 12-14) — SHIPPED 2026-03-10</summary>

See `.planning/milestones/v2.1-ROADMAP.md` for complete phase details.

8 plans completed across 3 phases:
- Phase 12: Insights API Layer
- Phase 13: Cost and Activity Charts
- Phase 14: Health and Latency Charts

</details>

### v2.5 Developer Experience (Phases 15-20)

- [ ] **Phase 15: Foundation + Static Data Layer** - State persistence utility and changelog data layer that all DX features depend on
- [ ] **Phase 16: CLI Improvements** - Version check banner, `update` command, improved init output, overhauled doctor diagnostics
- [ ] **Phase 17: Dashboard Version + What's New** - Version badge in TopBar and navigable What's New page with auto-show on upgrade
- [ ] **Phase 18: Empty States** - Contextual no-data guidance that distinguishes hooks-not-configured from waiting-for-sessions
- [ ] **Phase 19: Feature Tooltips** - Hover explanations for domain-specific metrics across InsightsPanel, HealthPanel, and AgentTree
- [ ] **Phase 20: Onboarding Walkthrough** - First-run step-by-step dashboard tour with localStorage persistence and replay option

## Phase Details

### Phase 15: Foundation + Static Data Layer
**Goal**: The state persistence utility and changelog data layer are available so every downstream DX feature can read/write first-run state and display version history
**Depends on**: Nothing (foundation phase)
**Requirements**: (none — this phase is pure infrastructure that unblocks phases 16-20)
**Success Criteria** (what must be TRUE):
  1. `lib/state.js` can read and write a JSON state file at a platform-aware path without throwing when the file does not yet exist
  2. `lib/changelog.json` is bundled with the package and contains at least the current release notes for v2.5
  3. `GET /api/changelog` returns the full changelog JSON; `GET /api/meta` returns current version and first-run flag; `POST /api/meta` accepts a patch and persists it via `lib/state.js`
  4. All three endpoints respond correctly in both fresh-install (no state file) and returning-user (existing state file) conditions
**Plans**: TBD

### Phase 16: CLI Improvements
**Goal**: Users can diagnose setup failures immediately and stay informed about updates without leaving the terminal
**Depends on**: Phase 15 (update command needs `lib/changelog.json`)
**Requirements**: VER-01, VER-02, CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. Running `npx observagent start` with a newer version available on npm shows a "New version available" banner in the terminal before the server output begins — and startup is never delayed when npm registry is unreachable
  2. Running `npx observagent update` prints the changelog entries for the new version plus the exact install command to run (both global and npx paths shown)
  3. Running `npx observagent init` prints numbered next-step instructions after completion — not just a success message
  4. Running `npx observagent doctor` shows a pass/fail checklist where every failed check includes the exact command or config block to fix it
  5. Running `npx observagent doctor` when hooks are not configured shows the exact JSON block to add to Claude Code settings
**Plans**: TBD

### Phase 17: Dashboard Version + What's New
**Goal**: Users can see what version of ObservAgent they are running from the dashboard and navigate to full release notes, with the page auto-appearing once after an upgrade
**Depends on**: Phase 15 (`/api/changelog` and `/api/meta` endpoints)
**Requirements**: VER-03
**Success Criteria** (what must be TRUE):
  1. The dashboard header shows the current ObservAgent version at all times
  2. Clicking the version badge navigates to a What's New page showing release notes for the current and recent versions
  3. After upgrading to a new version, the What's New page opens automatically on the first dashboard load and does not auto-open on subsequent loads
  4. A user who manually dismissed the auto-show can return to What's New at any time via the version badge
**Plans**: TBD

### Phase 18: Empty States
**Goal**: A user who opens the dashboard with no data sees actionable guidance rather than blank panels — with different instructions depending on whether hooks are configured or not
**Depends on**: Phase 15 (existing `/api/config` already present; no new deps needed)
**Requirements**: DASH-01
**Success Criteria** (what must be TRUE):
  1. A user who has not configured hooks sees an empty state in the dashboard that shows the exact `npx observagent init` command to run
  2. A user who has hooks configured but no sessions yet sees an empty state that explains the tool is ready and waiting for the first Claude Code session to start
  3. Every major panel (AgentTree, ToolLog, Session History, Insights charts) shows a contextual empty state rather than blank space when there is no data
**Plans**: TBD

### Phase 19: Feature Tooltips
**Goal**: Users can hover over domain-specific metrics and immediately understand what they mean without leaving the dashboard
**Depends on**: Phase 17 (TooltipProvider must be registered in App.tsx, which happens in Phase 17)
**Requirements**: DASH-02
**Success Criteria** (what must be TRUE):
  1. Hovering over p50/p95 latency labels shows a tooltip explaining what percentile latency means in the context of tool calls
  2. Hovering over context fill % shows a tooltip explaining what the metric measures and what a healthy range looks like
  3. Hovering over stalled agent count shows a tooltip explaining when an agent is classified as stalled
  4. Hovering over cache hit rate shows a tooltip explaining what cache hits are and why they reduce cost
  5. All tooltip triggers are keyboard-focusable so the feature is accessible without a mouse
**Plans**: TBD

### Phase 20: Onboarding Walkthrough
**Goal**: A first-time user can take a guided tour of the dashboard that orients them to all major panels — and can skip, replay, or dismiss it at any time
**Depends on**: Phase 15 (`/api/meta` for first-run flag), Phase 17 (TooltipProvider confirmed, version infrastructure in place), Phase 18 (empty states in panels so tour content is correct for users with no data)
**Requirements**: DASH-03
**Success Criteria** (what must be TRUE):
  1. A first-time user sees the onboarding walkthrough start automatically on their first dashboard visit
  2. The user can skip the walkthrough at any step and the skip is remembered — the tour does not re-appear on the next page load
  3. A user who completes or skips the tour can replay it at any time from a "Replay tour" link in the dashboard
  4. The walkthrough correctly highlights the intended panels even when those panels are showing empty states (no data required for tour to work)
  5. Completing the tour marks it as done in localStorage so it never auto-fires again for that user (unless they upgrade to a major new version)
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
| 12. Insights API Layer | v2.1 | 3/3 | Complete | 2026-03-10 |
| 13. Cost and Activity Charts | v2.1 | 3/3 | Complete | 2026-03-10 |
| 14. Health and Latency Charts | v2.1 | 2/2 | Complete | 2026-03-10 |
| 15. Foundation + Static Data Layer | v2.5 | 0/? | Not started | — |
| 16. CLI Improvements | v2.5 | 0/? | Not started | — |
| 17. Dashboard Version + What's New | v2.5 | 0/? | Not started | — |
| 18. Empty States | v2.5 | 0/? | Not started | — |
| 19. Feature Tooltips | v2.5 | 0/? | Not started | — |
| 20. Onboarding Walkthrough | v2.5 | 0/? | Not started | — |
