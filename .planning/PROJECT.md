# ObservAgent

## What This Is

ObservAgent is a real-time observability platform for Claude Code that surfaces what every agent is doing, how much it costs, and whether it's healthy — all on a single live React dashboard. It targets both top-level Claude Code sessions and sub-agents spawned via the Task tool, giving developers a clear view into the otherwise opaque hierarchy of agentic workflows like GSD.

## Core Value

See exactly which agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

---

## Current Milestone: v2.5 Developer Experience

**Goal:** Make ObservAgent dramatically easier to install, understand, and stay up-to-date with — reducing friction from first install to first insight.

**Target features:**
- Improved `npx observagent init` output with clear post-install guidance
- `doctor` command overhaul — diagnose and explain hook failures
- Hook activation detection with actionable fix instructions
- README / docs full first-run walkthrough
- Empty state guidance in the dashboard (no data yet screens)
- Feature tooltips on charts and panels
- First-time onboarding walkthrough in the dashboard
- CLI startup version-check banner
- Dashboard version badge with changelog link
- `npx observagent update` command with inline changelog
- Dashboard "What's New" page

---

## v2.1 Shipped ✅

**Shipped:** 2026-03-10
**Phases:** 12-14 (3 phases, 8 plans)
**Status:** Production-ready with full Insights panel analytics

### Key Deliverables

- 7 new `/api/insights/*` backend endpoints (SQLite time-series queries)
- Insights panel refactored into 3-tab layout: Cost, Activity, Health
- Cost tab: 7-day cost trend AreaChart + cost-by-agent-type BarChart
- Activity tab: tool call timeline + token burn rate charts (30s polling, tab-gated)
- Health tab: stalled agents widget + error rate AreaChart (spike dots) + per-tool latency BarChart (p50/p95)
- Always-on stalled-agent poll drives live "Health (N)" badge across all tabs

### Technical Notes

- recharts `dot` prop pattern for conditional spike rendering (returns `null` for zero-rate points)
- NTILE(100) window function in SQLite for p50/p95 approximation
- Tab-gated polling: `[activeTab, latestSessionId]` deps; empty-deps always-on for badge

---

## v2.0 Shipped ✅

**Shipped:** 2026-03-09
**Phases:** 8-11 (4 phases, 20 plans, 148 commits)
**Status:** Production-ready with full React UI

### Key Deliverables

- Tool log enrichment: Bash commands, file paths, patterns, task descriptions inline per row
- Context fill % fix: resolved ~10% discrepancy vs Claude Code (cache-write double-count removed)
- Full React migration: Vite + React 18 + Zustand + TanStack Virtual; vanilla JS retired
- Collapsible agent tree: human-readable names, active count badge, real-time current tool
- Per-agent tabbed detail panel: Prompt, Context (JSONL conversation), Calls, Tokens
- Dashboard reorganized: agent hierarchy as primary view, active-first, time filter strip, Insights charts
- Session history filters: date/time range picker + quick filter buttons

### Technical Notes

- Stack: Node.js (Fastify), SQLite (WAL), React 18 + Vite + TypeScript + Zustand
- Frontend: TanStack Virtual for ToolLog, Recharts for Insights panel, shadcn/ui components
- Agent tree: SubagentStart/SubagentStop hooks feed agent_nodes table; solo sessions now auto-create root nodes
- Stale agent cleanup: interrupted on restart + 10-min inactivity timeout

---

## v1.0 Shipped ✅

**Shipped:** 2026-03-01
**Phases:** 1-7 (7 phases, 28 plans)

### Key Deliverables

- SQLite + SSE event pipeline with Claude Code hooks
- Live dashboard with error highlighting and latency display
- JSONL-based cost/token tracking with auto-discovery
- Multi-agent tree visualization with stuck-agent detection
- Session history with filtering, replay, and export
- CLI with `npx observagent init/start/doctor`
- Gantt timeline view and health panel

---

## Requirements

### Validated

- ✓ SETUP-01 through SETUP-04 — CLI zero-config setup — v1.0
- ✓ INGEST-01 through INGEST-03 — real-time tool capture and error highlighting — v1.0
- ✓ COST-01 through COST-04 — token/cost tracking with budget alerts — v1.0
- ✓ AGENT-01 through AGENT-03 — multi-agent tree, per-agent cost, stuck-agent warning — v1.0
- ✓ HIST-01 through HIST-03 — session history, filtering, export — v1.0
- ✓ DASH-01 through DASH-04 — unified dashboard, latency, timeline, health panel — v1.0
- ✓ TOOL-01 through TOOL-05 — tool log enrichment (command/file/pattern/task/tokens) — v2.0
- ✓ CALC-01 — context fill % accuracy fix — v2.0
- ✓ ARCH-01 — React migration — v2.0
- ✓ AGNT-01 through AGNT-10 — full agent panel redesign with tabbed detail — v2.0
- ✓ DASH2-01 through DASH2-04 — dashboard overhaul, active-first layout, time filters — v2.0
- ✓ FILT-01, FILT-02 — session history date range picker + quick filters — v2.0
- ✓ INSG-01 — daily cost trend area chart (7 days) — v2.1
- ✓ INSG-02 — cost breakdown by agent type bar chart — v2.1
- ✓ INSG-03 — tool call activity timeline per minute — v2.1
- ✓ INSG-04 — token consumption rate over time — v2.1
- ✓ INSG-05 — error rate timeline with spike highlighting — v2.1
- ✓ INSG-06 — per-tool latency chart (p50/p95 bars) — v2.1
- ✓ INSG-07 — stalled agents indicator with live badge — v2.1

### Active (v2.5)

- [ ] Improved `npx observagent init` output with clear post-install guidance
- [ ] `doctor` command overhaul — diagnose and explain hook failures with actionable fixes
- [ ] Hook activation detection and guidance
- [ ] README / docs full first-run walkthrough
- [ ] Empty state guidance in the dashboard
- [ ] Feature tooltips on charts and panels
- [ ] First-time onboarding walkthrough in the dashboard
- [ ] CLI startup version-check banner
- [ ] Dashboard version badge with changelog link
- [ ] `npx observagent update` command with inline changelog
- [ ] Dashboard "What's New" page

### Out of Scope

| Feature | Reason |
|---------|--------|
| Full tool_input / tool_response capture | Security boundary — would leak file contents, secrets |
| LLM evaluation / grading | Different product category |
| Prompt management / versioning | Orthogonal to observability |
| Multi-user SaaS / auth | Local-first; validate core value first |
| Support for non-Claude-Code frameworks | Claude Code hooks are the moat |
| Custom dashboard / widget builder | Ship opinionated layout first |
| Alerting integrations (Slack, PagerDuty) | Over-engineering for local dev tool |
| Mobile dashboard | Web-first only |
| AI-powered anomaly detection | Rule-based health checks cover 90% of value |
| OpenTelemetry export | Enterprise-scale; out of scope for local tool |

---

## Context

- Claude Code exposes two instrumentation surfaces:
  1. **Hooks** (PreToolUse/PostToolUse/SubagentStart/SubagentStop) — shell commands that fire on every tool event
  2. **Session JSONL files** (`~/.claude/projects/`) — full conversation transcripts with API response metadata
- Agent hierarchy: Task tool spawns create SubagentStart/SubagentStop events; solo sessions now auto-create root nodes on first PreToolUse
- Known gaps: stale agent display on server kill (mitigated by startup cleanup + 10-min timeout)
- Target users: Claude Code power users, GSD users, anyone running multi-agent workflows

## Constraints

- **Stack**: Node.js backend (Fastify) — ✅ complete
- **Deployment**: Local-first, must work out of the box on macOS/Linux — ✅ complete
- **Integration**: Zero-code setup using Claude Code hooks — ✅ complete

## Key Decisions

| Decision | Milestone | Outcome |
|----------|-----------|---------|
| relay.py allowlist for tool_summary (command/file/pattern only) | v2.0 | ✓ Good — security boundary preserved |
| Correlated subqueries for nearest api_call (not LATERAL JOIN) | v2.0 | ✓ Good — SQLite doesn't support LATERAL |
| React/Vite/Zustand migration | v2.0 | ✓ Good — maintainable; TanStack Virtual solved ToolLog performance |
| Tailwind v4 dark theme | v2.0 | ✓ Good — no config file needed |
| Session root nodes auto-created on first PreToolUse | v2.0 | ✓ Good — solo sessions now visible in tree |
| Stale agent timeout at 10 min + startup interrupted sweep | v2.0 | ✓ Good — handles crash/kill scenarios cleanly |
| GET /api/events ORDER ASC (inner DESC subquery for newest 200) | v2.0 (debug) | ✓ Good — fixed live event ordering in ToolLog |
| NTILE(100) for p50/p95 in SQLite (no external stats lib) | v2.1 | ✓ Good — SQLite 3.25+ window functions sufficient |
| Always-on stalled-agents poll (empty deps, separate from tab-gated poll) | v2.1 | ✓ Good — badge stays live across all tabs |
| Tab-gated polling with `[activeTab, latestSessionId]` deps | v2.1 | ✓ Good — stops API calls when tab not visible |
| Inline `error_rate` transform at fetch callback, not render | v2.1 | ✓ Good — chart binds directly to derived value |

---

*Last updated: 2026-03-11 after v2.5 milestone start*
