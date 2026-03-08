# Requirements: ObservAgent

**Defined:** 2026-02-26
**Core Value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

---

## v1 Requirements (Shipped ✅)

### Setup & Installation

- [x] **SETUP-01**: User can install ObservAgent hooks with a single command (`npx observagent init`) that automatically configures `~/.claude/settings.json`
- [x] **SETUP-02**: ObservAgent auto-detects session files in `~/.claude/projects/` without manual path configuration
- [x] **SETUP-03**: User can run `observagent doctor` to diagnose installation issues (is server running? are hooks installed? are JSONL files found?)
- [x] **SETUP-04**: User can start the server and open the dashboard with a single command (`observagent start`)

### Event Ingestion

- [x] **INGEST-01**: System captures Claude Code tool call events in real-time via PreToolUse/PostToolUse hooks
- [x] **INGEST-02**: User can see a live tool call log per agent showing what tools ran and in what order
- [x] **INGEST-03**: User can see when an agent errors or a tool call fails, highlighted in the dashboard

### Cost & Token Tracking

- [x] **COST-01**: User can see token usage (input, output, cache read, cache write) per agent and per session
- [x] **COST-02**: User can see context window fill percentage per agent with a visual warning at 80%+
- [x] **COST-03**: User can see a live running dollar cost total updating in real-time as agents work
- [x] **COST-04**: User can set a session cost budget threshold and receive an in-dashboard alert when exceeded

### Multi-Agent Observability

- [x] **AGENT-01**: User can see the agent tree showing parent → child relationships created by Task tool spawns
- [x] **AGENT-02**: User can see cost (tokens + dollars) broken down per individual agent in a multi-agent run
- [x] **AGENT-03**: User can see a stuck-agent warning when an agent has had no tool activity for 60+ seconds

### Session History

- [x] **HIST-01**: User can browse a list of past and active sessions organized by project
- [x] **HIST-02**: User can filter sessions by date, cost range, project, model, and error presence
- [x] **HIST-03**: User can export session data as JSONL or CSV for offline analysis

### Dashboard

- [x] **DASH-01**: Dashboard shows agent tree, cost meters, and health indicators on a single unified screen
- [x] **DASH-02**: Dashboard shows latency per tool call (time between PreToolUse and PostToolUse)
- [x] **DASH-03**: Dashboard shows an agent timeline view (Gantt-style swimlanes) of tool calls across agents
- [x] **DASH-04**: Health panel shows hook connection status, session error rate, and server uptime

---

## v2.0 Requirements — Agent Intelligence

### Agent Panel (AGNT)

- [ ] **AGNT-01**: User can see the agent hierarchy as a collapsible tree (parent session → subagents indented beneath, expandable/collapsible per branch)
- [ ] **AGNT-02**: User can see a live active agent count badge showing how many agents are currently running (e.g., "3 running")
- [ ] **AGNT-03**: Each agent row displays a human-readable name in the format `description [short-id]` (e.g., `gsd-executor [a1b2]`) instead of raw hex IDs
- [x] **AGNT-04**: Each agent row shows the current tool being executed in real time (live update on every PreToolUse event)
- [x] **AGNT-05**: User can click an agent row to open a per-agent detail panel
- [ ] **AGNT-06**: Agent detail panel shows the initial task description / prompt the agent was given when spawned
- [ ] **AGNT-07**: Agent detail panel shows context fill % bar (cumulative input tokens for that agent / model context window max)
- [ ] **AGNT-08**: Agent detail panel shows per-agent tool call history with timestamps
- [ ] **AGNT-09**: Agent detail panel shows input + output token counts per API call for that agent
- [ ] **AGNT-10**: Agent detail panel shows the agent's full conversation history — the messages it received and sent (context window contents)

The agent detail panel is a tabbed side panel with four tabs: **Prompt** (initial task), **Context** (conversation history), **Calls** (tool call history with timestamps), **Tokens** (input/output/cache breakdown per call).

### Architecture (ARCH)

- [x] **ARCH-01**: Dashboard migrates from vanilla JS to React (Vite + React) while preserving all existing v1.0 and Phase 8 functionality — feature parity required before new Phase 10 UI is built on top

### Tool Log Enrichment (TOOL)

- [x] **TOOL-01**: Bash tool calls show the actual command string in the log row (truncated at 200 chars)
- [x] **TOOL-02**: Read, Write, and Edit tool calls show the file path in the log row
- [x] **TOOL-03**: Grep and Glob tool calls show the search pattern in the log row
- [x] **TOOL-04**: Task tool calls show the task description and subagent_type in the log row
- [x] **TOOL-05**: Each tool call log row shows input + output token counts from the corresponding API call

### Calculation Accuracy (CALC)

- [x] **CALC-01**: Context window fill % calculation matches Claude Code's displayed values (fix ~10% discrepancy caused by double-counting cache-write tokens in `getContextFillPercent()`)

### Dashboard & UX (DASH2)

- [x] **DASH2-01**: Dashboard reorganizes the agent hierarchy as the primary view — agent tree is the dominant panel with full-height prominence
- [x] **DASH2-02**: Active/running agents are visually prominent (full color); idle/completed agents are de-emphasized (muted)
- [x] **DASH2-03**: Dashboard has time filter quick-select controls (Last 5min / Last 15min / Last 1hr / All) that filter the tool log and agent view
- [ ] **DASH2-04**: Context fill % bar in the cost/token panel is fixed and functional (tied to CALC-01 fix)

### Session History Filters (FILT)

- [x] **FILT-01**: Session history page has a date/time range picker (from → to)
- [x] **FILT-02**: Session history page has quick filter buttons: Last 15min / Last 1hr / Last 24hr / All

---

## v3.0 Requirements (Deferred)

### GSD Workflow Awareness
- **GSD-01**: Agents are labeled by role (researcher, planner, executor, verifier) based on GSD prompt patterns
- **GSD-02**: Dashboard shows GSD phase context alongside agent data

### Extended Health Monitoring
- **HEALTH-01**: Alert when an agent's error rate exceeds a configurable threshold
- **HEALTH-02**: Alert when total session cost exceeds a user-defined daily budget

### Integrations
- **INT-01**: Webhook support for cost/health alerts (Slack, Discord)
- **INT-02**: OpenTelemetry-compatible event export

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full tool_input / tool_response capture | Security boundary — would leak file contents, secrets into event stream and DB |
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

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 6 | Complete |
| SETUP-02 | Phase 3 | Complete |
| SETUP-03 | Phase 6 | Complete |
| SETUP-04 | Phase 6 | Complete |
| INGEST-01 | Phase 1 | Complete |
| INGEST-02 | Phase 2 | Complete |
| INGEST-03 | Phase 2 | Complete |
| COST-01 | Phase 3 | Complete |
| COST-02 | Phase 3 | Complete |
| COST-03 | Phase 3 | Complete |
| COST-04 | Phase 3 | Complete |
| AGENT-01 | Phase 4 | Complete |
| AGENT-02 | Phase 4 | Complete |
| AGENT-03 | Phase 4 | Complete |
| HIST-01 | Phase 5 | Complete |
| HIST-02 | Phase 5 | Complete |
| HIST-03 | Phase 5 | Complete |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 2 | Complete |
| DASH-03 | Phase 7 | Complete |
| DASH-04 | Phase 7 | Complete |
| CALC-01 | Phase 8 | Complete |
| TOOL-01 | Phase 8 | Complete |
| TOOL-02 | Phase 8 | Complete |
| TOOL-03 | Phase 8 | Complete |
| TOOL-04 | Phase 8 | Complete |
| TOOL-05 | Phase 8 | Complete |
| ARCH-01 | Phase 9 | Complete |
| AGNT-01 | Phase 10 | Pending |
| AGNT-02 | Phase 10 | Pending |
| AGNT-03 | Phase 10 | Pending |
| AGNT-04 | Phase 10 | Complete |
| AGNT-05 | Phase 10 | Complete |
| AGNT-06 | Phase 10 | Pending |
| AGNT-07 | Phase 10 | Pending |
| AGNT-08 | Phase 10 | Pending |
| AGNT-09 | Phase 10 | Pending |
| AGNT-10 | Phase 10 | Pending |
| DASH2-01 | Phase 11 | Complete |
| DASH2-02 | Phase 11 | Complete |
| DASH2-03 | Phase 11 | Complete |
| DASH2-04 | Phase 11 | Pending |
| FILT-01 | Phase 11 | Complete |
| FILT-02 | Phase 11 | Complete |

**Coverage:**
- v1.0 requirements: 21 total — all Complete ✓
- v2.0 requirements: 23 total
- v2.0 mapped to phases: 23
- v2.0 unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-03-02 after Phase 8 Plan 05 completion (TOOL-05 marked complete)*
