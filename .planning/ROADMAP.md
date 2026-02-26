# Roadmap: ObservAgent

## Overview

ObservAgent is built in seven phases that follow the only sensible order: prove the data pipeline works before building features on top of it. Phase 1 establishes the hook relay and SQLite ingestion core — the plumbing every later feature depends on. Phase 2 surfaces that data in a live dashboard with latency metrics and error visibility. Phase 3 adds JSONL-based cost and token tracking, the highest-value user pain point. Phase 4 builds the multi-agent tree visualization — ObservAgent's primary differentiator. Phase 5 adds session history and discovery. Phase 6 polishes the CLI into the zero-config install experience that enables adoption. Phase 7 delivers the agent timeline (Gantt) view as the final high-complexity dashboard feature.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Hook relay + event ingestion pipeline + SQLite store + SSE bus proven end-to-end
- [ ] **Phase 2: Live Event Dashboard** - Real-time tool call log, error highlights, latency per call, unified live screen
- [ ] **Phase 3: Cost and Token Tracking** - JSONL watcher, token usage display, live cost meter, budget alerts
- [ ] **Phase 4: Multi-Agent Observability** - Agent tree visualization, per-agent cost breakdown, stuck-agent detection
- [ ] **Phase 5: Session History and Discovery** - Session list, filter by date/cost/model/error, JSONL/CSV export
- [ ] **Phase 6: CLI and Zero-Config Setup** - npx observagent init, observagent start, observagent doctor
- [ ] **Phase 7: Agent Timeline View** - Gantt-style swimlane view of tool calls across agents

## Phase Details

### Phase 1: Foundation
**Goal**: A working end-to-end data pipeline — Claude Code hook fires, event is stored in SQLite, SSE pushes the event to a connected browser tab
**Depends on**: Nothing (first phase)
**Requirements**: INGEST-01
**Success Criteria** (what must be TRUE):
  1. Running a Claude Code tool call causes a record to appear in the SQLite events table within 1 second
  2. The hook relay exits in under 5ms and never blocks the Claude Code session (Claude continues running while the event is processed)
  3. A browser tab connected to the SSE endpoint receives the event without page refresh
  4. Server returns 202 before any database write occurs (validated by log order)
  5. SQLite runs in WAL mode with a write queue — concurrent events from parallel agents do not produce BUSY errors
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md — Node.js scaffold + SQLite schema (WAL mode) + write queue + SSE client registry
- [x] 01-02-PLAN.md — Hook relay script (relay.py): fire-and-forget, silent fail, 500ms timeout
- [x] 01-03-PLAN.md — Fastify server + /ingest route (202-before-write) + /events SSE route + E2E verification
- [x] 01-04-PLAN.md — Gap closure: register relay.py in ~/.claude/settings.json (PreToolUse + PostToolUse)

### Phase 2: Live Event Dashboard
**Goal**: Developers can watch their Claude Code session live — every tool call logged in order, failures highlighted, and per-call latency visible on a single screen
**Depends on**: Phase 1
**Requirements**: INGEST-02, INGEST-03, DASH-01, DASH-02
**Success Criteria** (what must be TRUE):
  1. User can see a live-updating log of tool calls per agent showing tool name, timestamp, and order — without refreshing the page
  2. User can see failed tool calls visually distinguished (highlighted/colored) in the live log immediately when they occur
  3. User can see the latency (elapsed time) for each tool call displayed next to the call in the log
  4. Agent tree, cost meters, and health indicator areas are present on the screen (may show empty/placeholder state until later phases populate them)
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Backend: pendingCalls pairing Map in ingest.js + dashboard route (GET /) + hydration API (GET /api/events)
- [ ] 02-02-PLAN.md — Frontend: complete public/index.html dashboard (4-panel dark layout, SSE log, timers, toasts, hydration)
- [ ] 02-03-PLAN.md — Human verification: end-to-end visual confirmation of Phase 2 dashboard

### Phase 3: Cost and Token Tracking
**Goal**: Developers can see exactly what a session costs in dollars and tokens, with real-time updates and a warning before they burn through their budget
**Depends on**: Phase 2
**Requirements**: SETUP-02, COST-01, COST-02, COST-03, COST-04
**Success Criteria** (what must be TRUE):
  1. User can see token usage broken down into input, output, cache read, and cache write counts per agent and per session — updated live as the session runs
  2. User can see a context window fill percentage bar per agent that turns visually distinct (warning color) when fill reaches 80% or higher
  3. User can see a running dollar cost total that updates in real-time as agents make API calls, using model-specific pricing rates
  4. User can set a cost budget threshold and see a visible in-dashboard alert when the session cost exceeds that threshold
  5. ObservAgent automatically discovers JSONL session files in ~/.claude/projects/ with no manual path configuration required
**Plans**: TBD

### Phase 4: Multi-Agent Observability
**Goal**: Developers running multi-agent workflows can see the full agent hierarchy, know which agent is costing the most, and be alerted when an agent appears stuck
**Depends on**: Phase 3
**Requirements**: AGENT-01, AGENT-02, AGENT-03
**Success Criteria** (what must be TRUE):
  1. User can see a visual agent tree showing parent session at the top with child sessions (spawned via Task tool) nested beneath it — hierarchy updates live as new sub-agents are spawned
  2. User can see cost (token counts and dollar amount) broken down per individual agent in a multi-agent run, making it clear which sub-agent is consuming the most resources
  3. User can see a stuck-agent warning indicator on any agent that has had no tool activity for 60 or more seconds
**Plans**: TBD

### Phase 5: Session History and Discovery
**Goal**: Developers can browse and search all past sessions, not just the live one — and extract raw data for offline analysis
**Depends on**: Phase 4
**Requirements**: HIST-01, HIST-02, HIST-03
**Success Criteria** (what must be TRUE):
  1. User can see a list of past and active sessions organized by project, showing session start time, total cost, and model used
  2. User can filter the session list by date range, cost range, project name, model, and whether the session contained any errors — results update without full page reload
  3. User can export any session's data as JSONL or CSV and open the downloaded file in a spreadsheet or text editor
**Plans**: TBD

### Phase 6: CLI and Zero-Config Setup
**Goal**: A developer on a clean machine can go from zero to live dashboard in under two minutes using only two terminal commands, and can diagnose any setup problem without reading documentation
**Depends on**: Phase 5
**Requirements**: SETUP-01, SETUP-03, SETUP-04
**Success Criteria** (what must be TRUE):
  1. User can run `npx observagent init` on a clean machine and have Claude Code hooks automatically configured in ~/.claude/settings.json — no manual file editing required
  2. User can run `observagent start` and have the server start and the dashboard open in their default browser with a single command
  3. User can run `observagent doctor` and receive a clear status report for each of: server running, hooks installed, JSONL files found — with actionable fix guidance for any failing check
**Plans**: TBD

### Phase 7: Agent Timeline View
**Goal**: Developers can see a Gantt-style swimlane view of all tool calls across all agents, making it easy to spot parallelism, bottlenecks, and idle gaps in a multi-agent run
**Depends on**: Phase 6
**Requirements**: DASH-03
**Success Criteria** (what must be TRUE):
  1. User can see a timeline view with one horizontal swimlane per agent, where each tool call appears as a bar spanning its start-to-end time
  2. Tool calls from parallel agents are visually overlapping on the timeline, making concurrency patterns immediately visible
  3. The timeline updates live during an active session as new tool calls complete
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete | 2026-02-26 |
| 2. Live Event Dashboard | 0/3 | Not started | - |
| 3. Cost and Token Tracking | 0/TBD | Not started | - |
| 4. Multi-Agent Observability | 0/TBD | Not started | - |
| 5. Session History and Discovery | 0/TBD | Not started | - |
| 6. CLI and Zero-Config Setup | 0/TBD | Not started | - |
| 7. Agent Timeline View | 0/TBD | Not started | - |
