# Feature Research

**Domain:** AI agent observability UX — v2.0 Agent Intelligence milestone
**Researched:** 2026-03-02
**Confidence:** MEDIUM-HIGH — Based on direct codebase inspection of v1.0 (all source files, schema, hook relay), milestone context, and training knowledge of observability UX patterns from Datadog, Grafana, LangSmith, Helicone, W&B Weave (web search and WebFetch unavailable; training knowledge applied with explicit confidence flags per domain).

---

## Milestone Scope

This document covers **v2.0 Agent Intelligence** features added to an existing working system. The existing system (v1.0) already provides:

- Agent tree panel with hierarchical display, inline cost, stuck detection
- Tool call log panel (session-grouped, live + history, latency, error highlight)
- Timeline waterfall view (tabbed with tool log — same panel, shared column)
- Cost panel (session cost, today cost, 4 token types, context fill bar)
- Health panel (hook signal, tool calls, error rate)
- Session history page (filter by project/date/cost/model/errors, export)

**Known v1.0 deficiencies the milestone addresses:**
- Agent panel shows hex IDs (e.g., `abc12345`) instead of human-readable names
- Agent panel has no active count badge in the panel header
- Agent panel has no expandable per-agent detail (prompt, context %, token breakdown, call history)
- Agent panel does not show the current tool an agent is running in real-time
- Tool log shows only tool name (`Bash`, `Read`) without the actual command, file path, or task description
- Context fill % bar is broken or showing ~10% discrepancy vs Claude Code's own display
- Timeline and Tool Log share one column with tab switching — structurally redundant; both are call-oriented views
- Session history lacks time-range filters (date_from / date_to) on the history page

**Critical architectural constraint discovered in codebase inspection:**
`hooks/relay.py` intentionally strips `tool_input` and `tool_response` from every event before forwarding (see relay.py line 70-71 comment: "never forward tool_input or tool_response — those may contain sensitive file paths, commands, or file contents"). Tool log enrichment therefore requires **modifying relay.py to selectively forward safe metadata fields** (not raw content) per tool type. This is a v2.0 prerequisite that was not needed in v1.0.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any developer-grade observability tool provides for agent hierarchies. Missing these makes the product feel amateur compared to LangSmith, Datadog APM, or W&B Weave.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Human-readable agent names | LangSmith, Datadog, W&B all show meaningful names in trace trees. "abc12345" tells the user nothing. Users immediately ask "which agent is this?" | LOW | Use `agent_type` from SubagentStart payload (already in `agent_nodes` table). For top-level sessions, derive from project path or session index ("Main Session", "Session 2"). No schema changes needed. |
| Active agent count badge in panel header | Grafana, Datadog show live count in panel title. "AGENT TREE (3 active)" tells the user state without reading the tree. Standard pattern for monitoring dashboards. | LOW | Count agents where `state='active'` from the in-memory `agentTree.agents` map. Update on every `agent_spawn`, `agent_update`, `renderAgentTree()`. Pure frontend change — no backend needed. |
| Per-agent detail view (expandable or side panel) | Helicone, LangSmith show per-trace details on click. The current design does click-to-filter-log but shows no details. Users need context fill %, prompt, token breakdown per agent. | MEDIUM | Clicking an agent row opens a detail drawer below it (accordion expand) or replaces the bottom-right panel content. Show: initial prompt (from JSONL `system` or first `user` entry), context %, input/output/cache tokens, last N tool calls. Requires JSONL parsing for prompt; token data already in `session_cost` table. |
| Real-time current tool indicator per agent | Datadog APM shows the current span per service in the service map. During active runs, "what is this agent doing right now?" is the primary question. | LOW | Use the in-progress tool call state already tracked in `inProgressTimers`. Cross-reference `session_id` to the agent row. Show tool name as a small chip on the agent row that appears/disappears with PreToolUse/PostToolUse. Frontend-only, no backend change. |
| Correct context window fill % | Context fill is the single most time-sensitive health metric. Wrong values (currently ~10% off) destroy trust. Users rely on this for "should I let this run?" decisions. | MEDIUM | Root cause: `remaining_percentage` from `StatusLine` hook feeds the bar, but the `statusLine` hook fires at different cadence than PostToolUse. Fix: compare raw token sum from `session_cost` against known model context window sizes directly. `session_cost` already has `input_tokens` + `cache_read_tokens` + `cache_write_5m`. Use that sum / model_context_max. Source: `lib/pricingConfig.js` already has model map — add context window sizes there. |
| Date/time range filters in session history | The history page already has date_from/date_to SQL filters wired in the backend (`/api/sessions` route). The frontend history.html is missing UI for them. Users notice the absent filter immediately when browsing large session lists. | LOW | Add date pickers (HTML `<input type="date">`) to history.html filter bar. The backend `/api/sessions` already accepts `date_from` and `date_to` params. Pure frontend change. |

### Differentiators (Competitive Advantage)

Features that set ObservAgent apart from LangSmith/Helicone/Weave for Claude Code multi-agent workflows. These are where v2.0 competes.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enriched tool log entries (command/path/task visible) | No competitor shows actual shell command, file path, or task description inline in the log without clicking into a full detail view. "Bash — npm install" is 10x more useful than "Bash". GSD users need to see which file is being read, which command ran, which task was spawned. | HIGH | Requires relay.py modification to extract per-tool metadata from `tool_input` before discarding it. Safe fields per tool type: Bash → `command` (first 120 chars), Read/Write/Edit → `file_path` (filename only, not full path for privacy), Task → `description` (first 80 chars), Glob/Grep → `pattern`. Must add `tool_input_summary` column to `events` table. See dependency note below. |
| Agent-first dashboard layout (agents prominent, not a narrow sidebar) | Current layout: agent tree is a 240px fixed sidebar. For GSD runs with 4-6 parallel agents, this is the most important panel, not a sidebar. Professional tools (Datadog service map, W&B run comparison) give agent-level views prominence. | MEDIUM | Restructure grid: make agent panel the dominant left region (wider, perhaps 320px or resizable), move cost panel to integrate within agent rows (inline cost already there — extend it), promote timeline to first-class tab. Does not require backend changes; CSS grid + layout refactor only. |
| Collapsible agent tree with subtree fold | When running 6+ sub-agents, seeing all detail simultaneously is noise. Datadog's service dependency map and LangSmith's trace tree both support collapse/expand. Folding completed agents reduces visual clutter. | MEDIUM | Add `<details>` element per agent group (similar to how tool log already uses `<details>` for session sections). Track collapsed state in JS. Show "N tools" summary when collapsed. Completed agents auto-collapse after a configurable delay. No backend changes. |
| Per-agent context fill % inline in tree | No competitor shows context window fill at the agent level in the hierarchy tree — only as a session-level bar. For multi-agent GSD runs, knowing that sub-agent 3 is at 87% context while others are at 20% is actionable for intervention. | MEDIUM | Show a mini progress bar or % label per agent row in the tree. Data source: `session_cost` table already has per-agent context data if context tracking is fixed (see table stakes above). Requires correctly attributing context fill per agent_id, not just session_id. |
| Tool log time filters (show last 5 min / 15 min / all) | LangSmith, Grafana, and Datadog all have time window selectors on their log views. In a long GSD run with hundreds of tool calls, users want "show me what happened in the last 5 minutes" without scrolling. | LOW | Add time filter buttons above the tool log panel. Filter in-memory from the existing `agentSections` Map — no API call needed. Options: last 5m, last 15m, last 1h, all. |
| Session history with time range picker | The most frequent session filter need — "show me what I ran this morning" or "show me last Tuesday's runs". Backend already supports it; surfacing it makes ObservAgent feel professional. | LOW | HTML date-time range inputs on history.html. Already described in table stakes as a table-stakes gap (classified here as differentiator in the competitive context: no local-first competitor has polished history filtering). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full tool_input forwarding in relay.py | "I want to see the complete Bash command / file contents in the log" | relay.py security constraint is load-bearing: forwarding tool_response could include file contents, passwords in environment, LLM outputs. Full forwarding violates the security model established in v1.0. Even safe-looking fields like `file_path` can reveal sensitive project structure. | Forward only pre-specified safe metadata per tool type (command prefix, filename without directory, task description). Never forward tool_response. Document the policy. |
| D3.js / vis.js agent tree visualization | "Make the tree look like a real graph with curved edges" | Adds a library dependency (D3 = 500KB), requires a build step or CDN, and the indented tree already works well for the linear parent→child relationship ObservAgent tracks (Claude Code tasks are 2-level deep max in practice). | The current indented HTML tree is the right structure. Add expand/collapse and richer row content. A full graph visualization adds complexity for a case (multi-level nested tasks) that doesn't occur in Claude Code. |
| Moving tool log to a separate page | "The tool log is getting crowded — it should be its own page" | The live tool log is the primary evidence pane. Separating it from the agent tree removes the click-to-filter interaction. LangSmith, Datadog, and W&B all keep trace detail inline or in a side panel, not on a separate page. | Keep log in the main panel. Improve it with time filters, enriched entries, and better session grouping. A separate "full log" page is a v3 consideration if power users request it. |
| Storing full tool inputs in SQLite | "Store the complete Bash command so I can search it later" | SQL full-text search on shell commands is not the right data model. Storage grows unbounded with large file contents. Raises security surface significantly. | Store a 120-char summary of safe metadata per tool type. Full commands are already in the JSONL conversation transcript if the user wants raw access. ObservAgent's role is operational visibility, not log archival. |
| Removing the Tool Log / Timeline tab structure | "Just show both all the time" | The 3-column layout is width-constrained. The tool log and timeline share a column by design — they are both temporal call views but serve different purposes. Adding a fourth full-height column would require a wider viewport assumption (breakpoint concerns for common laptop widths). | Rename tabs to be clearer ("Live Log" / "Waterfall") and ensure both are immediately accessible with keyboard shortcut or auto-switch when timeline tab has relevant data. Consider splitting into two columns only if layout is redesigned to be wider overall. |
| Alerting webhooks (Slack/Discord for stuck agents) | "Notify me on Slack when an agent is stuck for 60s" | Adds external network dependency, secret management (webhook URLs), and v2.0 is still local-first. The user is watching the dashboard during active runs — in-dashboard notification is sufficient. | In-dashboard toast (already works for errors) plus more prominent stuck indicator (yellow pulse on agent row). Webhook support is a v3 feature when multi-user/server deployment is considered. |
| Agent playback / re-run | "Replay this agent's tool sequence to reproduce a bug" | This is evaluation tooling, not observability. Adding replay requires LLM re-execution, significant state reconstruction, and introduces a fundamentally different product surface. LangSmith and Braintrust own this space. | Session export (already in v1.0) gives the user raw JSONL to import into any eval tool. |

---

## Feature Dependencies

```
[v1.0 EXISTING] relay.py (strips tool_input)
    └──blocks──> [Tool log enrichment] (relay.py must be modified first)
                     └──requires──> [events.tool_input_summary column] (schema change)
                         └──enables──> [Enriched log entries in dashboard]
                         └──enables──> [Task description in agent tree node label]

[v1.0 EXISTING] agent_nodes table (has agent_type, state)
    └──already enables──> [Human-readable agent names] (use agent_type field)
    └──already enables──> [Current tool indicator] (link events to agent_nodes via session_id)
    └──requires extension──> [Per-agent detail panel] (need to join session_cost + events)

[v1.0 EXISTING] session_cost table (has tokens per session_id+agent_id)
    └──already enables──> [Per-agent context fill %] (need model context_max added to pricingConfig)
    └──already enables──> [Per-agent detail token breakdown]

[v1.0 EXISTING] pricingConfig.js (has model rate map)
    └──requires extension──> [Context fill fix] (add context_window_tokens per model)

[v1.0 EXISTING] /api/sessions backend route (has date_from/date_to params)
    └──already enables──> [Session history date filters] (pure frontend work in history.html)

[Active count badge]
    └──requires──> [renderAgentTree() call on agent state change] (already happens)
    └──no new backend needed

[Collapsible agent tree]
    └──enhances──> [Per-agent detail panel] (detail is naturally the expanded state)
    └──no backend dependency

[Dashboard layout reorganization]
    └──depends on──> [Per-agent detail panel being designed] (layout must accommodate it)
    └──no backend dependency

[Tool log time filters]
    └──requires──> [in-memory event timestamping already in timelineState/agentSections]
    └──no backend dependency
```

### Dependency Notes

- **Tool log enrichment blocks on relay.py changes:** The current relay.py explicitly strips `tool_input`. Adding `tool_input_summary` to the events table is pointless until relay.py forwards the safe metadata fields. These two changes (relay.py + schema) must land in the same plan to avoid a broken intermediate state.
- **Context fill fix is independent:** The context bar bug is a computation error in the frontend's use of `StatusLine` hook data vs token sum. Fixing it requires adding `context_max` values to `pricingConfig.js` and recomputing the bar from `session_cost` token sums instead of relying on the unreliable `StatusLine` hook cadence.
- **Per-agent detail panel depends on data that already exists:** `session_cost` has per-agent tokens. `events` has call history by session_id. Initial prompt requires a JSONL read, which is the only new data path. Since `jsonlWatcher.js` already processes JSONL files, extracting the first system/user message is an incremental addition.
- **Layout reorganization is the last thing to do:** Do not redesign the grid until the content of each panel is finalized. Grid changes that happen before panel content is designed will be redone.
- **Session history date filters are pure frontend:** `api.js` already accepts `date_from` and `date_to` params in `stmtSessions`. History.html is missing the input elements. No backend work at all.

---

## MVP Definition

This is milestone v2.0 — the system is production-ready. These are prioritized by user-facing impact vs implementation cost within the milestone.

### Launch With (v2.0 core)

- [ ] **Human-readable agent names** — Use `agent_type` from `agent_nodes`. Rename "Agent abc12345" to the `agent_type` value or a numbered fallback ("Task 1", "Task 2"). Highest visibility fix, lowest complexity. Pure frontend.
- [ ] **Active count badge in panel header** — "AGENTS (3 active)" gives instant session state. One line of JS. Ship with human-readable names in the same plan.
- [ ] **Current tool indicator on active agent rows** — Show the in-progress tool name as a small chip next to the agent label while `PreToolUse` is pending. Cross-reference existing `inProgressTimers` state to the agent's `session_id`. No new data needed.
- [ ] **Context fill fix (correct % calculation)** — Add `context_window_tokens` to `pricingConfig.js` model map. Recompute bar from `session_cost` token sum / `context_max` rather than `StatusLine` hook. This is broken in v1.0 and users notice.
- [ ] **Tool log enrichment (relay.py + schema + display)** — The most impactful UX improvement. Relay.py must selectively forward per-tool safe metadata: Bash→command prefix, Read/Write/Edit→filename, Task→description, Glob/Grep→pattern. Add `tool_input_summary` TEXT column to events table. Display below tool name in log row. HIGH complexity but HIGH user value.
- [ ] **Session history date/time range filters** — Add `date_from` / `date_to` datetime inputs to history.html filter bar. Backend already supports it. LOW complexity, table-stakes completion.

### Add After Core is Stable (v2.0 stretch)

- [ ] **Per-agent detail panel** — Click agent row to expand accordion showing: initial prompt (first 80 chars from JSONL), context fill %, token breakdown (input/output/cache), last 5 tool calls. Requires JSONL first-entry extraction in jsonlWatcher.js. MEDIUM complexity.
- [ ] **Collapsible agent tree** — Wrap each agent group in `<details>`. Auto-collapse completed agents after 30s. Track state across re-renders (completed agents stay folded). MEDIUM complexity.
- [ ] **Per-agent context fill % in tree row** — Show mini context bar per agent row. Requires context fix to be working first. LOW complexity once context fix is done.
- [ ] **Tool log time filters (5m / 15m / 1h / all)** — Segment button bar above tool log. Filter in-memory without API call. LOW complexity.

### Future Consideration (v2.1+)

- [ ] **Dashboard layout reorganization (agent-first)** — Widen agent panel to dominant position. Restructure grid. Defer until per-agent detail panel is designed — grid must accommodate it. MEDIUM complexity, no backend change.
- [ ] **GSD agent role labeling** — Parse agent_type for GSD-specific roles (researcher, planner, executor, verifier). LOW complexity once human-readable names are working, but fragile to GSD prompt format changes.
- [ ] **Webhook alerts for stuck agents** — Slack/Discord integration. Out of scope for local-first v2.0.
- [ ] **OpenTelemetry export** — Standard compliance. Out of scope until multi-user deployment is considered.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Human-readable agent names | HIGH | LOW | P1 |
| Active count badge | HIGH | LOW | P1 |
| Current tool indicator per agent | HIGH | LOW | P1 |
| Context fill fix | HIGH | MEDIUM | P1 |
| Tool log enrichment (relay.py + schema + UI) | HIGH | HIGH | P1 |
| Session history date filters | MEDIUM | LOW | P1 |
| Per-agent detail panel | HIGH | MEDIUM | P2 |
| Collapsible agent tree | MEDIUM | MEDIUM | P2 |
| Per-agent context fill % in tree | MEDIUM | LOW | P2 (after context fix) |
| Tool log time filters | MEDIUM | LOW | P2 |
| Dashboard layout reorganization | MEDIUM | MEDIUM | P3 |
| GSD role labeling | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for v2.0 release — fixes known v1.0 deficiencies
- P2: Should have — meaningful UX improvements, add when P1 is stable
- P3: Defer to v2.1 or future milestone

---

## Competitor Feature Analysis

How professional observability tools handle the specific UX challenges this milestone addresses:

| UX Challenge | LangSmith | Datadog APM | W&B Weave | Grafana | ObservAgent v2.0 |
|---|---|---|---|---|---|
| Agent/span naming | Human-readable run names (user-set or auto-generated from function name) | Service name + operation name + span type | Run name + step name from code | Metric/service name | `agent_type` from SubagentStart payload + numbered fallback |
| Active count indicator | Project-level run count badge | Service health count in service map | Active run count in project header | Panel title with live count | Panel header badge: "AGENTS (N active)" |
| Current operation per agent | Span status icon + latest span type | Active span visible in service map node | Step in progress shown in run detail | Last metric timestamp | Tool chip on active agent row (in-progress from PreToolUse) |
| Log enrichment | Full span input/output shown (user opted-in, their data) | Full trace with tags/attributes per span | Full artifact content per step | Metric values + labels | Safe metadata only: command prefix, filename, task description |
| Log entry actionability | Click span to see full input/output | Click span to see trace waterfall | Click step to see full artifact | Click datapoint for detail | Inline summary (no click needed for 90% of context); click for full |
| Context fill / resource usage | Token count per run (no % fill) | Memory/CPU % per service | GPU/CPU utilization per run | Gauge panel per metric | Per-agent % fill bar + inline in tree row |
| Hierarchy expand/collapse | Full trace tree with collapse | Service dependency map (not collapsible) | Nested steps with collapse | Panel collapse | `<details>` expand per agent group |
| History time filters | Date range + tag filters | Time range in trace list | Date range + project filters | Time range in dashboard | date_from/date_to on history.html (backend already supports) |

**Key insight from competitor analysis:** Professional tools either (a) have full access to span data because the user instrumentated their code (LangSmith, W&B), or (b) show only metadata (Datadog, Grafana). ObservAgent is in category (b) — hook-based, zero instrumentation. The enrichment pattern should match Datadog's: show safe, structured metadata per event type without exposing content. "Bash — npm install —save-dev" follows Datadog's convention of "service — operation — resource".

**What makes a log entry actionable vs noisy:**
- Actionable: includes what (tool type) + context (safe summary of what it operated on) + outcome (duration + status)
- Noisy: shows raw full content, duplicates information already visible elsewhere, or requires a click to understand basic context
- The current v1.0 log is noisy by omission — tool name alone tells the user nothing about what the agent is actually doing

---

## Feature Deep Dives

### Feature 1: Tool Log Enrichment

**The core UX problem:**
The tool log currently shows: `Bash | 14:23:01 | 1.2s`. The user sees 50 "Bash" entries and has no idea what any of them did. Compare to what the same entry should show: `Bash: npm run build | 14:23:01 | 1.2s` — this is actionable without any additional clicks.

**Per-tool safe metadata fields (relay.py must forward these):**

| Tool | Current | v2.0 Enriched | Safe Field in tool_input |
|------|---------|----------------|--------------------------|
| Bash | `Bash` | `Bash: npm run build` | `command` — first 120 chars |
| Read | `Read` | `Read: schema.js` | `file_path` — basename only (no directory) |
| Write | `Write` | `Write: schema.js` | `file_path` — basename only |
| Edit | `Edit` | `Edit: index.html` | `file_path` — basename only |
| Task | `Task` | `Task: research payment APIs` | `description` — first 80 chars |
| Glob | `Glob` | `Glob: *.ts` | `pattern` |
| Grep | `Grep` | `Grep: "TODO"` | `pattern` — first 40 chars |
| WebFetch | `WebFetch` | `WebFetch: docs.stripe.com` | `url` — hostname only |
| WebSearch | `WebSearch` | `WebSearch: stripe API docs` | `query` — first 60 chars |
| mcp__*__ | `mcp__ctx7__query` | `ctx7: query-docs` | Extract meaningful part of compound tool name |

**relay.py change required:**
Add a `_derive_tool_summary(payload)` function that patterns on `tool_name` and extracts only safe structural fields (not content). For `Bash`, the `command` field may contain environment variables or secrets — truncate to 120 chars and strip anything after a pipe (`|`) or redirect (`>`) as a conservative safety measure. For file operations, extract `os.path.basename(file_path)` only. Never forward tool_response fields.

**Schema change:**
Add `tool_input_summary TEXT` column to `events` table via `addColumnIfNotExists()`. Store the 120-char formatted summary. Populate in ingest.js from the new relay.py field.

**Display:**
In the tool log row, show the summary as a muted secondary line below the tool name, or inline after a colon: `Bash: npm run build`. Keep the existing duration/status layout — summary replaces or supplements the tool name column.

**Confidence:** MEDIUM — safe field extraction pattern is well-understood. The truncation/sanitization logic for Bash commands is the only uncertain part (what counts as "safe" in a command string). Conservative approach: first 80 chars of `command`, stop at first `|`, `>`, `&`, or `$`.

---

### Feature 2: Per-Agent Detail Panel

**The core UX problem:**
Clicking an agent row currently filters the tool log but shows no information about the agent itself. The user cannot see the agent's initial task, how much context it has consumed, or its token breakdown without building mental models from scattered data.

**What to show in the detail panel:**

| Field | Source | Notes |
|-------|--------|-------|
| Initial prompt / task description | JSONL first `user` message content (first 200 chars) | Requires JSONL read in jsonlWatcher. Already parsed — extract first user entry during initial JSONL scan. |
| Context fill % | `session_cost` token sum / model context_max | After context fix is applied |
| Token breakdown | `session_cost.input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_5m` | Already in DB |
| Call count | COUNT from `events` WHERE session_id = agent_id | Already in DB |
| Last 3-5 tool calls | SELECT from `events` WHERE session_id = agent_id ORDER BY timestamp DESC LIMIT 5 | Already in DB |
| Status | `agent_nodes.state` | Already in DB |
| Spawned at | `agent_nodes.spawned_at` | Already in DB |

**Implementation:**
Two options:
1. **Accordion expand:** Clicking the agent row expands it in-place to show detail content below the agent row, within the same tree panel. Clean for a narrow sidebar.
2. **Replace Cost panel:** Clicking an agent row replaces the top-right panel (currently Cost & Tokens) with per-agent detail. Click away (or click the session row) to restore the cost panel. This allows more space for detail content.

Recommendation: **accordion expand** because it is simpler, doesn't disrupt the cost panel, and the tree panel is being widened in v2.0 anyway. The detail section can be a 120px block that appears below the agent row on click. Uses the existing `<details>` pattern already in the codebase for agent sections in the log.

**New API endpoint needed:** `GET /api/agents/:id/detail` — returns token data, call history (last 5), and initial_prompt from a new `agent_initial_prompt` column added to `agent_nodes` (populated by jsonlWatcher on first JSONL entry parse).

**Confidence:** MEDIUM — data is available; the integration between JSONL watcher's initial prompt extraction and the API endpoint is new plumbing but follows established patterns.

---

### Feature 3: Context Fill Fix

**The root cause:**
The `StatusLine` hook in Claude Code fires asynchronously and at a different cadence than tool call hooks. The `remaining_percentage` field it provides can lag behind actual token consumption. Additionally, the current `costState.contextFillPct` is populated from `cost_update` SSE events that include `contextFillPct` — but this value comes from wherever jsonlWatcher.js sourced it, which may not be synchronized with real-time tool call state.

**The fix:**
1. Add `context_window_max` values to `lib/pricingConfig.js` for all known models:
   - `claude-sonnet-4-6`: 200,000 tokens
   - `claude-opus-4-6`: 200,000 tokens
   - `claude-haiku-*`: 200,000 tokens (all current Claude 3+ models share this)
   - Default fallback: 200,000

2. In the cost panel rendering (`renderCostPanel()`), compute fill % as:
   `fill = (input_tokens + cache_read_tokens + cache_write_5m + cache_write_1h) / context_max`
   This uses the same token data already in the cost panel, computed client-side, with no hook dependency.

3. The `StatusLine`-derived `contextFillPct` can remain as a supplementary signal but should not be the primary source.

**Why this works:** The `session_cost` table accumulates token counts from JSONL entries. These are the actual billed tokens for the session. Summing them and dividing by model context window gives the accurate fill %. This matches what Claude Code's own UI shows because Claude Code's context display is derived from the same cumulative token count.

**Confidence:** HIGH for the fix approach. The 10% discrepancy is almost certainly because `StatusLine` provides a snapshot at a specific moment while token sums are cumulative.

---

### Feature 4: Dashboard Layout Reorganization

**The core problem:**
The current 3-column layout allocates 240px to the agent tree (most important for multi-agent workflows), then two equal-width columns for the tool log/timeline and cost/health panels. This is a "feature parity" layout — not an opinionated "what does the user actually need?" layout.

**Recommended v2.0 layout:**
This feature is P3 — defer until per-agent detail panel design is finalized. The layout must accommodate the per-agent detail panel within the agent column. Pre-designing the grid without knowing the content risks a second layout refactor.

**When to implement (v2.1 or end of v2.0 if stretch goals are met):**
- Widen agent panel to 320px (from 240px)
- Collapse cost panel metrics into the agent tree row (inline cost is already there; context fill bar can be per-agent)
- Give the tool log/timeline full vertical height in its column
- Move health panel metrics into a top bar strip rather than a dedicated bottom-right panel

**Confidence:** MEDIUM for the intent; LOW for specific measurements without live testing on real screen sizes.

---

## Phase Ordering Implications

Based on dependency analysis, the v2.0 features cluster into four natural phases:

**Phase 1: Agent Tree UX (pure frontend, no data changes)**
- Human-readable names (use existing `agent_type`)
- Active count badge
- Current tool indicator
- Context fill fix (add context_max to pricingConfig, recompute client-side)
- Collapsible tree (nice-to-have addition)
All four have zero backend dependencies. Ship together.

**Phase 2: Tool Log Enrichment (relay.py + schema + frontend)**
- relay.py: add `_derive_tool_summary()` per tool type
- Schema: `addColumnIfNotExists('events', 'tool_input_summary', 'TEXT')`
- ingest.js: populate from relay payload
- Dashboard: display in log rows
One coordinated change across three files. Cannot be split.

**Phase 3: Per-Agent Detail Panel (new API + JSONL extraction + frontend)**
- pricingConfig.js: add `context_window_max`
- schema.js: `agent_initial_prompt` column on agent_nodes
- jsonlWatcher.js: extract first user message, store in agent_nodes
- api.js: `GET /api/agents/:id/detail`
- Dashboard: accordion expand on agent row click
Depends on Phase 1 (agent tree must be clean before adding detail to it) and Phase 2 (tool call history in detail panel needs enriched entries).

**Phase 4: History & Layout Cleanup**
- history.html: date/time range filter inputs (backend already supports)
- Tool log time filters (in-memory, no backend)
- Dashboard layout reorganization (if time allows)
Independent of Phases 1-3 except that layout should be last.

---

## Sources

- **Direct codebase inspection (HIGH confidence):** `public/index.html`, `routes/ingest.js`, `routes/api.js`, `db/schema.js`, `lib/pricingConfig.js` (inferred), `hooks/relay.py`, `.planning/v1.0-MILESTONE-AUDIT.md`, `.planning/research/ARCHITECTURE.md`
- **LangSmith trace UX patterns** (MEDIUM confidence — training knowledge, Claude Code 2.1 era): span tree display, run detail panels, filter patterns
- **Datadog APM patterns** (MEDIUM confidence — training knowledge): service map naming, active span indicators, log enrichment conventions ("service — operation — resource" pattern)
- **W&B Weave patterns** (LOW confidence — training knowledge, product was still maturing as of knowledge cutoff): run hierarchy, step detail view
- **Grafana dashboard conventions** (HIGH confidence — training knowledge, stable patterns): panel title live counts, time range selectors, collapsible panel groups
- **Helicone UX** (MEDIUM confidence — training knowledge): cost-first layout, per-request metadata display

---

*Feature research for: ObservAgent v2.0 — Agent Intelligence milestone*
*Researched: 2026-03-02*
