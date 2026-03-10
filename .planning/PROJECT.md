# ObservAgent

## What This Is

ObservAgent is a real-time observability platform for Claude Code that surfaces what every agent is doing, how much it costs, and whether it's healthy — all on a single live React dashboard. It targets both top-level Claude Code sessions and sub-agents spawned via the Task tool, giving developers a clear view into the otherwise opaque hierarchy of agentic workflows like GSD.

## Core Value

See exactly which agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

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

### Active (v3.0)

*(Define in /gsd:new-milestone)*

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

---

*Last updated: 2026-03-10 after v2.0 milestone completion*
