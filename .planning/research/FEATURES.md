# Feature Landscape: AI Agent Observability (Claude Code Specific)

**Domain:** AI agent observability platform — local-first, Claude Code-native, multi-agent workflow visibility
**Researched:** 2026-02-26
**Confidence:** MEDIUM — Based on knowledge of LangSmith, Helicone, Braintrust, AgentOps, OpenTelemetry Semantic Conventions for GenAI.

---

## Research Basis

| Platform | Focus | Notes |
|----------|-------|-------|
| LangSmith | Full-lifecycle: tracing + evals + datasets | Most mature, framework-coupled to LangChain |
| Helicone | Proxy-based cost/latency logging | Extremely low friction; SaaS-first |
| Braintrust | Eval-heavy; human + LLM graders | Experiment tracking orientation |
| AgentOps | Agent-native; session replay, tool tracing | Closest competitor to ObservAgent's scope |
| OpenTelemetry GenAI | Semantic conventions for LLM spans | Emerging standard; not agent-native yet |
| Langfuse | Open-source LangSmith alternative | Self-hostable; growing community |
| Arize Phoenix | Local-first OSS; OTEL-native | Most relevant OSS comp |

---

## Table Stakes

Features users expect. Missing = product feels incomplete or users leave within the first session.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real-time event stream | Every platform shows live activity; no live view = flying blind | Medium | SSE from hook events |
| Token usage per request/session | Cost is the primary pain point; Helicone and LangSmith show this prominently | Low-Medium | JSONL session files contain usage fields |
| Cost estimate in dollars | Developers think in dollars, not tokens; must convert at model-specific rates | Low | Rates configurable, not hardcoded |
| Latency per call | "Why is this taking so long?" is always question one | Low | Timestamps from hook events (PreToolUse/PostToolUse delta) |
| Error/failure visibility | Users must see when an agent crashes or a tool fails | Low | Hook events include tool failure signals |
| Session list / history | Users need to browse past runs, not just the live view | Medium | Parse ~/.claude/projects/ JSONL files |
| Tool call log | What tools did the agent call, in what order? Fundamental trace data | Low | Available from PostToolUse hook events |
| Search/filter runs | Once history exists, search is an immediate need | Medium | Filter by project, date, model, cost, error |
| Zero instrumentation setup | If setup requires agent code changes, most power users won't bother | Medium | Claude Code hooks + JSONL are zero-code surfaces |
| Dashboard that auto-refreshes | Static pages feel broken; users expect live updates | Low | SSE push from backend to browser |

---

## Differentiators

Features that set ObservAgent apart from generic LLM monitoring tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Agent tree visualization | Sub-agents spawned via Task tool create a hierarchy; no existing tool visualizes this natively for Claude Code | High | Correlate parent → child session IDs via Task tool spawn events |
| Context window fill indicator | "How close is this agent to hitting the context limit?" — per-agent fill percentage | Medium | Token counts from JSONL + model context windows; show as progress bar |
| Stuck agent detection | Agent appears running but no tool events for N seconds — surface as warning | Medium | Last event timestamp vs wall clock; configurable threshold |
| Per-agent cost breakdown in multi-agent run | In a GSD run with 5 sub-agents, which one is burning money? | Medium | Attribute token cost per session ID; aggregate by parent |
| GSD workflow awareness | Label agents as "researcher", "builder", "reviewer" based on prompt patterns | High | Parse first user message; match GSD agent persona patterns |
| Context window pressure alerts | Proactive: warn before agent hits limit, not after it fails | Low | Threshold-based badge or toast in dashboard |
| Zero-config local setup | npx observagent or single command; dashboard opens in browser | Medium | CLI binary, auto-detects ~/.claude/projects/ |
| Session cost budget alert | "Alert me if any session exceeds $X" — prevent runaway costs | Low | Threshold check on running cost total |
| Agent timeline view | Horizontal timeline of tool calls per agent — see parallelism and gaps | High | Event timestamps mapped to Gantt/swimlane view |
| JSONL export / CSV download | Power users want raw data for offline analysis | Low | Serialize session records to CSV or JSON on demand |

---

## Anti-Features

Features to explicitly NOT build for v1.

| Anti-Feature | Why Avoid |
|--------------|-----------|
| LLM evaluation / grading | LangSmith and Braintrust own this space; orthogonal to observability |
| Prompt management / versioning | Different product category |
| Multi-user SaaS / auth | User explicitly scoped out; adds infra complexity |
| Support for non-Claude-Code frameworks | Different instrumentation; dilutes focus; Claude Code hooks are the moat |
| Session replay / re-run through LLM | Expensive and complex; belongs with eval tools |
| Custom dashboards / widget builder | Grafana-scale scope; ship opinionated fixed layout first |
| Alerting integrations (Slack, PagerDuty) | Over-engineering for a local dev tool; in-dashboard alerts sufficient |
| Mobile dashboard | User explicitly scoped out |
| AI-powered anomaly detection | Adds model dependency; rule-based health checks cover 90% of value |

---

## Feature Dependencies

```
Token usage per request
  → Cost estimate in dollars
  → Context window fill indicator
    → Context window pressure alerts

Real-time event stream (hooks)
  → Tool call log
  → Latency per call
  → Error/failure visibility
  → Stuck agent detection
  → Agent tree visualization

Session list / history (JSONL parsing)
  → Search/filter runs
  → Per-agent cost breakdown
  → JSONL export

Agent tree visualization
  → Per-agent cost breakdown in multi-agent run
  → GSD workflow awareness
  → Agent timeline view

Zero-config local setup
  → Everything (nothing works without this)
```

---

## MVP Recommendation

**Phase 1 — Core:** Zero-config setup + live stream + session history + cost.
**Phase 2 — Differentiators:** Agent tree + context fill + stuck detection + per-agent cost.
**Phase 3 — Polish:** Search/filter + GSD labeling + timeline + budget alerts.

## Competitive Gap

Every competitor (LangSmith, Helicone, AgentOps) requires wrapping the LLM client. Claude Code is a black box. Hooks + JSONL are the only zero-code surfaces — making ObservAgent the **only tool that can observe Claude Code agents without modifying them**.

| Capability | LangSmith | Helicone | AgentOps | Langfuse | ObservAgent |
|-----------|-----------|----------|----------|----------|-------------|
| Works with Claude Code zero-config | No | No | No | No | Yes (moat) |
| Agent hierarchy (sub-agent tree) | Via LangGraph only | No | Partial | No | Yes (target) |
| Context window fill tracking | No | No | No | No | Yes (target) |
| Stuck agent detection | No | No | No | No | Yes (target) |
| Local-first, no cloud dependency | Self-host option | No | No | Yes | Yes |
| Cost tracking | Yes | Yes | Yes | Yes | Yes |

---

## Open Questions (validate before build)

- Exact Claude Code hook event payload schema (PreToolUse/PostToolUse fields)
- How parent/child session IDs are linked across Task tool spawns in JSONL
- Whether Task tool spawns are detectable at hook time vs JSONL parse time
- Current Anthropic model pricing (fetch at runtime, do not hardcode)

---
*Research completed: 2026-02-26*
