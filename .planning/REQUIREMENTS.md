# Requirements: ObservAgent

**Defined:** 2026-02-26
**Core Value:** See exactly which Claude Code agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

---

## v1 Requirements

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
- [ ] **DASH-03**: Dashboard shows an agent timeline view (Gantt-style swimlanes) of tool calls across agents
- [x] **DASH-04**: Health panel shows hook connection status, session error rate, and server uptime — replacing the placeholder added in Phase 2

---

## v2 Requirements

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
| LLM evaluation / grading | Different product category; LangSmith/Braintrust own this |
| Prompt management / versioning | Out of scope; orthogonal to observability |
| Multi-user SaaS / auth | Local-first for v1; validate core value first |
| Support for non-Claude-Code frameworks | Claude Code hooks are the moat; don't dilute focus |
| Session replay / re-run through LLM | Belongs with eval tools |
| Custom dashboard / widget builder | Ship opinionated fixed layout first |
| Alerting integrations (Slack, PagerDuty) | Over-engineering for local dev tool; in-dashboard alerts for v1 |
| Mobile dashboard | Web-first only |
| AI-powered anomaly detection | Adds model dependency; rule-based health checks cover 90% of value |

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
| DASH-03 | Phase 7 | Pending |
| DASH-04 | Phase 7 | Complete |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 — traceability filled after roadmap creation*
