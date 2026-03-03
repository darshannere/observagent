# Roadmap: ObservAgent

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 (shipped 2026-03-01)
- 🚧 **v2.0 Agent Intelligence** — Phases 8-10 (in progress)

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

---

### v2.0 Agent Intelligence

**Milestone Goal:** Make the agent hierarchy visible, understandable, and actionable. Enrich tool logs with real detail, fix context calculation accuracy, migrate to React for maintainable UI, and redesign the dashboard so active agents are front and center with a rich per-agent detail panel.

- [ ] **Phase 8: Tool Log Enrichment + Calc Fix** - Relay.py allowlist, DB schema column, frontend tool log display, and context window calculation fix
- [ ] **Phase 9: React Migration** - Migrate dashboard from vanilla JS to React/Vite, feature parity with v1.0 + Phase 8
- [ ] **Phase 10: Agent Panel Redesign** - Collapsible tree, active count badge, readable names, live current tool, tabbed detail panel (Prompt / Context / Calls / Tokens)
- [ ] **Phase 11: Dashboard Overhaul + Filters** - Agent hierarchy as primary view, active-first layout, time filters, session history date filters

## Phase Details

### Phase 8: Tool Log Enrichment + Calc Fix
**Goal**: Tool call log rows show meaningful context (actual command, file path, pattern, task description) instead of blank tool names — and the context window fill % discrepancy vs Claude Code is resolved or clearly documented
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, CALC-01
**Success Criteria** (what must be TRUE):
  1. A Bash tool call row shows the actual command string (truncated at 200 chars) — not just "Bash"
  2. Read, Write, and Edit tool call rows show the file path in the log entry
  3. Grep and Glob tool call rows show the search pattern in the log entry
  4. Task tool call rows show the task description and subagent_type in the log entry
  5. Context window fill % discrepancy vs Claude Code is resolved (or a tooltip documents the known difference if Claude Code applies its own scaling)
**Plans**: 5 plans

Plans:
- [x] 08-01-PLAN.md — relay.py _build_tool_summary() + DB schema column
- [x] 08-02-PLAN.md — ingest/writeQueue/api wiring + CSV export
- [x] 08-03-PLAN.md — frontend tool log second-line + timeline tooltip
- [x] 08-04-PLAN.md — CALC-01 getContextFillPercent() fix + info tooltip
- [x] 08-05-PLAN.md — TOOL-05 api_calls table + per-row token counts

### Phase 9: React Migration
**Goal**: Dashboard is rebuilt in React (Vite + React 18) with full feature parity — every v1.0 feature and Phase 8 enrichment works identically; vanilla JS index.html is retired
**Depends on**: Phase 8
**Requirements**: ARCH-01
**Success Criteria** (what must be TRUE):
  1. `observagent start` serves the React build; all v1.0 features work (live tool log, agent tree, cost panel, health panel, timeline)
  2. Phase 8 tool log enrichment (command/file/pattern display) works in the React build
  3. SSE connection to `/events` is preserved; real-time updates work without polling
  4. No vanilla JS / inline `<script>` code remains in the served HTML
  5. Build step (`npm run build`) completes without errors and produces a production bundle
**Plans**: 5 plans

Plans:
- [ ] 09-01-PLAN.md — Vite project scaffold, Tailwind v4 dark theme, shadcn setup, format utils, TypeScript types, React Router entry point, SSE header patch
- [ ] 09-02-PLAN.md — Zustand store (full state + actions) and useSSE hook (EventSource lifecycle + all message dispatch)
- [ ] 09-03-PLAN.md — Live Dashboard components: AgentTree, ToolLog (TanStack Virtual), CostPanel, HealthPanel, TimelineWaterfall, LiveDashboard page
- [ ] 09-04-PLAN.md — HistoryPage: session list, project grouping, JSONL/CSV export, replay navigation
- [ ] 09-05-PLAN.md — Fastify cutover: routes/dashboard.js serves public/dist/ SPA with /legacy fallback; human verification

### Phase 10: Agent Panel Redesign
**Goal**: Users can navigate the full agent hierarchy, instantly see which agents are active, and drill into any agent via a tabbed detail panel showing Prompt, Context window contents, Calls history, and Token breakdown
**Depends on**: Phase 9
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-06, AGNT-07, AGNT-08, AGNT-09, AGNT-10
**Success Criteria** (what must be TRUE):
  1. User can expand and collapse individual branches of the agent tree; collapsed state persists across live SSE updates
  2. A badge shows how many agents are currently running and updates in real time
  3. Every agent row shows a human-readable name (e.g., `gsd-executor [a1b2]`) instead of a raw hex session ID
  4. Every agent row shows the tool currently being executed and updates on every PreToolUse event
  5. Clicking an agent row opens a tabbed side panel: **Prompt** (initial task), **Context** (conversation history / messages), **Calls** (tool call history with timestamps), **Tokens** (input/output/cache per API call)
**Plans**: TBD

### Phase 11: Dashboard Overhaul + Filters
**Goal**: The dashboard is organized around the agent hierarchy as the primary view, active agents are visually front and center, time filters narrow the live tool log, and session history supports date/time range filtering
**Depends on**: Phase 10
**Requirements**: DASH2-01, DASH2-02, DASH2-03, DASH2-04, FILT-01, FILT-02
**Success Criteria** (what must be TRUE):
  1. The agent tree panel occupies the dominant area of the dashboard at full height — it is the first thing a user sees
  2. Active/running agents appear in full color; idle and completed agents are visually de-emphasized
  3. Clicking a time filter button (Last 5min / Last 15min / Last 1hr / All) updates the tool log to show only events in that window — live SSE events continue uninterrupted
  4. The context fill % bar in the cost/token panel is accurate and functional
  5. Session history page has a date/time range picker and quick filter buttons (Last 15min / Last 1hr / Last 24hr / All) that filter the displayed sessions
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 3/3 | Complete | 2026-02-28 |
| 2. Live Event Dashboard | v1.0 | 4/4 | Complete | 2026-02-28 |
| 3. Cost and Token Tracking | v1.0 | 4/4 | Complete | 2026-02-28 |
| 4. Multi-Agent Observability | v1.0 | 4/4 | Complete | 2026-03-01 |
| 5. Session History and Export | v1.0 | 5/5 | Complete | 2026-03-01 |
| 6. CLI and Zero-Config Setup | v1.0 | 4/4 | Complete | 2026-03-01 |
| 7. Agent Timeline View and Health Panel | v1.0 | 4/4 | Complete | 2026-03-01 |
| 8. Tool Log Enrichment + Calc Fix | v2.0 | 5/5 | Complete | 2026-03-02 |
| 9. React Migration | 1/5 | In Progress|  | - |
| 10. Agent Panel Redesign | v2.0 | 0/TBD | Not started | - |
| 11. Dashboard Overhaul + Filters | v2.0 | 0/TBD | Not started | - |
