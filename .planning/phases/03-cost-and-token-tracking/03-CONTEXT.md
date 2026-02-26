# Phase 3: Cost and Token Tracking - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Parse Claude Code JSONL session files (`~/.claude/projects/`) to extract token usage, compute dollar costs per model, and surface live cost + token data in the dashboard. Includes a dedicated cost panel, context window fill indicator, and budget alerting with user-configurable thresholds. No changes to the hook pipeline — this is a new JSONL data path only.

</domain>

<decisions>
## Implementation Decisions

### Cost display format
- Dedicated cost panel — separate panel alongside the Tool Call Log, always visible
- Full precision: `$0.0042` format (not `$0.00`) — exact cost matters for comparing runs
- Session total + model breakdown: split by model (sonnet vs opus vs haiku)
- `$` symbol only, no label text — compact and scannable

### Token breakdown detail
- Show all four token types: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- Cumulative token count shown per tool call row (running total at that point in session)
- Context window fill displayed as a progress bar (e.g. `████████░░ 68%`) — not just a number
- Scope: both current session total AND today's total across all sessions

### Budget alert behavior
- Two independent alert thresholds: dollar cost threshold + context fill % threshold
- Alert appears as a persistent banner at the top of the cost panel (stays visible, doesn't interrupt)
- Threshold configurable in the dashboard UI, persisted to config file (survives restarts)
- No default threshold — alerts are disabled until the user explicitly sets a value (no false alarms)

### Update cadence
- Cost/token data updates after each tool call completes (triggered by PostToolUse → JSONL watcher)
- Full JSONL file re-parsed on each file change (not byte-offset tailing) — simpler implementation
- Full JSONL hydrated on dashboard load — session cost shows from the beginning, not just from when the dashboard was opened
- Cost data stored in SQLite — persists across server restarts

### Claude's Discretion
- Exact cost panel layout and spacing within the panel
- Animation/transition when cost numbers update
- Exact format of the model breakdown (table vs list vs inline)
- Context window size per model (configurable map, not hardcoded)
- Pricing rate table structure (configurable, not hardcoded constants)

</decisions>

<specifics>
## Specific Ideas

- Context fill progress bar should visually warn when approaching limit (color change at 80%+)
- Budget alert banner should show what triggered it ("Session cost exceeded $X" or "Context 85% full") not just a generic warning
- Today's total gives daily spend awareness — useful for noticing when a run is unusually expensive

</specifics>

<deferred>
## Deferred Ideas

- Per-agent cost breakdown (cost per spawned subagent) — Phase 4 (Multi-Agent Observability)
- Cost data in tool call rows beyond cumulative token count — Claude's discretion
- Scheduled daily/weekly cost reports — out of scope for v1.1

</deferred>

---

*Phase: 03-cost-and-token-tracking*
*Context gathered: 2026-02-26*
