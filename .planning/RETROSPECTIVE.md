# ObservAgent Retrospective

---

## Milestone: v2.0 — Agent Intelligence

**Shipped:** 2026-03-09
**Phases:** 4 (8–11) | **Plans:** 20 | **Commits:** 148

### What Was Built

- Tool log enrichment: Bash commands, file paths, search patterns, task descriptions shown inline
- Context window fill % fixed — removed double-counted cache-write tokens (CALC-01)
- Full dashboard migration from vanilla JS to React 18 + Vite + Zustand + TypeScript
- Collapsible agent tree with human-readable names, active count badge, real-time current tool
- Per-agent tabbed detail panel: Prompt, Context (JSONL conversation history), Calls, Tokens
- Dashboard reorganized: agent hierarchy primary view, active-first layout, time filters, Insights charts
- Session history date range picker + quick filter buttons
- Post-milestone debug fixes: ToolLog live ordering, solo sessions in agent tree, stale agent cleanup

### What Worked

- **GSD plan-execute cadence**: Each plan stayed focused (1-3 tasks, ~5-15 min). Fast feedback loops.
- **React migration before redesign**: Phase 9 (migration) → Phase 10 (redesign) ordering paid off — no rework from building on a clean foundation.
- **Debug sessions for post-ship bugs**: Structured debug file + hypothesis elimination caught non-obvious root causes (ToolLog ordering, event array direction).
- **TanStack Virtual for ToolLog**: Virtualized list handled 200+ events without performance issues.
- **Zustand store design**: Single store with clear slices (events, agents, sessions, costData) made the React migration straightforward.

### What Was Inefficient

- Phase 9 React migration was heavy (5 plans, full rebuild) — some rework from v1 patterns that didn't map to React idioms.
- ROADMAP.md progress table had stale entries (Phase 9 showed "In Progress" after completion) — minor tracking debt.
- AGNT-10 (Context tab with JSONL conversation history) required 3 separate commits to get right — the JSONL path discovery was underspecified in the plan.
- ToolLog live-ordering bug was architectural (DESC hydration + append order mismatch) — would have been caught by a more thorough integration check pre-ship.

### Patterns Established

- **Session root nodes**: Solo Claude sessions now auto-create agent_nodes rows on first PreToolUse — pattern reusable for any future agent type.
- **Stale agent two-pass cleanup**: Startup sweep (interrupted) + interval timeout (stale) — clean pattern for any stateful agent tracking.
- **SPA serving pattern**: `@fastify/static` with `wildcard: false` + explicit `/assets/*` + `setNotFoundHandler` catch-all — reusable for any Fastify + React SPA.
- **Correlated subquery for nearest-neighbor**: `ABS(timestamp_ms - e.timestamp) < 30000 ORDER BY ABS LIMIT 1` — SQLite pattern for proximity joins.

### Key Lessons

- **Test live event flow end-to-end before shipping**: The ToolLog ordering bug was invisible until a real agent ran — add a live SSE integration check to pre-ship verification.
- **Plan Context tab data source early**: JSONL conversation history required understanding Claude Code's file layout — should be in research phase, not discovered mid-implementation.
- **Keep debug sessions open until human verifies**: `awaiting_human_verify` status prevented premature closure; good practice to maintain.

### Cost Observations

- Model mix: ~100% sonnet (balanced profile)
- All GSD agents (planner, executor, verifier, debugger) ran on sonnet
- No opus usage this milestone — complex phases handled well by sonnet with good plans

---

## Milestone: v2.1 — Insights Expansion

**Shipped:** 2026-03-10
**Phases:** 3 (12–14) | **Plans:** 8 | **Commits:** 33

### What Was Built

- 7 new `/api/insights/*` backend endpoints using SQLite prepared statements + NTILE window functions
- InsightsPanel refactored from flat scroll to 3-tab layout (Cost / Activity / Health)
- Cost tab: 7-day cost trend AreaChart (lazy one-time fetch) + cost-by-agent-type BarChart
- Activity tab: tool call timeline + token burn rate charts with 30s tab-gated polling
- Health tab: stalled agents widget + error rate AreaChart with spike-dot overlay + per-tool latency grouped BarChart
- Always-on background poll for stalled agents drives live "Health (N)" tab badge regardless of active tab

### What Worked

- **Pure frontend phase**: All 3 charts phases were UI-only — no backend changes after Phase 12. Planning correctly identified the API layer as a separate phase, making frontend work clean and predictable.
- **Research phase quality**: Researcher correctly identified that all recharts primitives were already imported, no new packages needed, and the exact dot prop API for spike rendering. Zero import-related surprises during execution.
- **Phase 13 as foundation for 14**: Introducing the tab layout in Phase 13 meant Phase 14 had a clear insertion point (Health tab placeholder comment). No structural rework.
- **Always-on / tab-gated poll split**: Planning caught the architectural requirement that stalled-agents badge must poll even when Health tab is not active. Two separate useEffects, clearly specified, executed cleanly.

### What Was Inefficient

- **Activity tab idle-skeleton gap**: Phase 13 executor used `activityStatus === 'loading'` for skeleton guard instead of `'loading' || 'idle'` (Cost tab pattern). Integration checker caught this post-execution. Minor UX debt, easy one-line fix — but shows the value of running integration check before ship.
- **Phase 12 research included INSG-05/06/07 but Phase 14 plans had to re-read API contracts**: Some context duplication. A lighter "context handoff" in the Phase 12 summary would have saved Phase 14 research time.

### Patterns Established

- **Tab-gated polling**: `useEffect` with `[activeTab, latestSessionId]` deps + `if (activeTab !== 'Target' || !latestSessionId) return` guard — clean pattern for any tabbed chart component.
- **Always-on vs tab-gated split**: Separate `useEffect(fn, [])` for badge-driving data vs `useEffect(fn, [activeTab, sessionId])` for tab-visible charts.
- **Fetch callback transform**: Raw API `{errors, total}` → derived `error_rate` computed at fetch site, not render. Chart binds to the derived field directly.
- **Recharts spike dots**: `dot={props => props.payload.value > 0 ? <circle ...> : null}` — explicit `null` (not `undefined`) prevents React warnings.
- **NTILE p50/p95**: `NTILE(100) OVER (PARTITION BY tool_name ORDER BY duration_ms)` — no external library, works in SQLite 3.25+.

### Key Lessons

- **Idle state is a real UI state**: Always cover `'idle'` alongside `'loading'` in skeleton conditions. The flash of empty content is visible on fast connections.
- **Integration check before committing to complete**: Running the integration checker found the idle-skeleton gap before the release tag. Worth making it a mandatory pre-ship step.
- **Recharts v3 dot prop typings are loose**: Use `props: any` to avoid TypeScript errors on the dot function argument — this is a recharts v3 known issue.

### Cost Observations

- Model mix: ~100% sonnet (balanced profile)
- Phase 14 was the most complex (3 widgets, 2 polling strategies, checkpoint) — handled cleanly by sonnet
- No opus usage needed; plans were specific enough that execution was mechanical

---

## Cross-Milestone Trends

| Metric | v1.0 | v2.0 | v2.1 |
|--------|------|------|------|
| Phases | 7 | 4 | 3 |
| Plans | 28 | 20 | 8 |
| Avg plans/phase | 4.0 | 5.0 | 2.7 |
| Timeline | ~3 days | ~8 days | ~13 days |
| Commits | ~80 | ~148 | 33 |
| Post-ship bugs / gaps | 1 | 3 | 0 (1 minor UX debt) |
| Integration gaps caught | — | 1 (post-ship) | 1 (pre-ship via integration checker) |

**Trend:** v2.1 was the smallest milestone by plan count — focused scope (UI charts only after API phase). Integration checker caught the idle-skeleton UX gap before the release tag for the first time. Minor tech debt remains; no broken flows shipped. Milestone cadence is stabilizing: backend API → frontend charts is a repeatable pattern.

