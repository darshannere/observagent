---
gsd_state_version: 1.0
milestone: v2.5
milestone_name: Developer Experience
status: roadmap_ready
stopped_at: Roadmap created — ready to plan Phase 15
last_updated: "2026-03-11T00:00:00.000Z"
last_activity: 2026-03-11 — Roadmap created for v2.5 (phases 15-20)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.
**Current focus:** v2.5 Developer Experience — roadmap ready, beginning Phase 15

## Current Position

Phase: 15 — Foundation + Static Data Layer (not started)
Plan: —
Status: Roadmap ready
Last activity: 2026-03-11 — Roadmap created for v2.5 (phases 15-20)

```
v2.5 Progress: [                    ] 0% (0/6 phases)
```

## Phase Summary

| Phase | Goal | Requirements | Status |
|-------|------|--------------|--------|
| 15. Foundation + Static Data Layer | State + changelog infrastructure available | (foundation) | Not started |
| 16. CLI Improvements | Users can diagnose failures and check for updates in terminal | VER-01, VER-02, CLI-01, CLI-02, CLI-03 | Not started |
| 17. Dashboard Version + What's New | Version badge and navigable release notes with auto-show | VER-03 | Not started |
| 18. Empty States | Contextual no-data guidance distinguishes misconfigured vs. waiting | DASH-01 | Not started |
| 19. Feature Tooltips | Hover explanations for domain-specific metrics | DASH-02 | Not started |
| 20. Onboarding Walkthrough | First-run guided tour with skip/replay/persistence | DASH-03 | Not started |

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
- [v2.5 research] Use `update-notifier@^7.3.1` (unref'd child process) — never blocks CLI startup
- [v2.5 research] Use `driver.js@^1.4.0` for onboarding tour (MIT, React 19 safe, ~15KB) — NOT react-joyride (React 18/19 incompatibility confirmed)
- [v2.5 research] Changelog data bundled as `lib/changelog.json` — served locally, works offline, no remote fetch dependency
- [v2.5 research] First-run state in `~/.local/share/observagent/state.json` via `lib/state.js` — same directory as DB
- [v2.5 research] Tooltip triggers placed outside `<ResponsiveContainer>` to avoid Recharts z-index conflict
- [v2.5 research] Onboarding localStorage key includes version string — allows re-show on major upgrades

### Blockers

(none)

## Session Continuity

Last session: 2026-03-11
Stopped at: Roadmap created — ready to plan Phase 15
Resume file: None
