# Feature Research

**Domain:** AI agent observability platform — developer tooling, Claude Code-native, local-first
**Researched:** 2026-02-26
**Confidence:** MEDIUM — Based on competitor analysis of LangSmith, Helicone, Braintrust, AgentOps, Langfuse, Arize Phoenix, and domain knowledge of developer CLI tooling patterns. Web search unavailable; training knowledge applied with explicit confidence flags.

---

## Milestone Scope

This document focuses exclusively on the **five v1.1 features** being added to an existing working system. The existing system already provides:
- Live tool call log with PreToolUse/PostToolUse pairing and duration
- SSE real-time streaming dashboard
- SQLite event storage with TTL cleanup
- Hook relay pipeline (Claude Code → backend → dashboard)

The v1.1 features to evaluate:
1. Cost and token tracking (JSONL-based)
2. Multi-agent tree visualization
3. Session history and discovery
4. Zero-config CLI setup
5. Gantt-style agent timeline view

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any observability tool. Missing these makes the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Token usage display (input/output/cache) | Every LLM observability tool (Helicone, LangSmith, Langfuse) prominently shows token counts. Developers immediately ask "how many tokens did that use?" | MEDIUM | Requires JSONL watcher reading `~/.claude/projects/`. Four token fields: input_tokens, output_tokens, cache_read_tokens, cache_write_tokens. Must deduplicate on re-reads via UNIQUE(session_id, message_id). |
| Running dollar cost total | Developers think in dollars, not tokens. Any tool that shows tokens but not dollars frustrates users who must convert manually. | LOW | Multiply token counts by per-model rates. Rates must be configurable, not hardcoded — Anthropic changes pricing. Show live-updating counter in dashboard header. |
| Cost budget alert | "Tell me when I'm spending too much" is an immediate follow-on once cost is visible. Users working with multi-agent runs fear runaway spend. | LOW | Threshold comparison vs running total. In-dashboard toast or badge is sufficient for local tool — no external notification required. |
| Session list (browse past runs) | A dashboard that only shows the current session provides no learning surface. Users want to compare runs: "how much did Monday's GSD run cost vs today's?" | MEDIUM | List past sessions from SQLite, show project, date, cost, duration. Paginate at 50 per page. Active sessions marked distinctly. |
| Filter and search sessions | Once there are more than ~10 sessions, unfiltered lists are unusable. Filter by date/project/cost range/model is expected from any history UI. | MEDIUM | SQLite WHERE clauses. No full-text search needed — structured filters only. Date range + cost range + project path substring covers 90% of use. |
| Export session data | Power users expect to pull raw data for offline analysis, custom scripts, or cost accounting. "I want to see everything ObservAgent captured." | LOW | Serialize `events` + `token_snapshots` for a session to JSONL (natural format, matches input) or CSV. No streaming needed — sessions are bounded in size. |
| CLI install command | A developer tool that requires manual config file editing loses most potential users before they see any value. `npx [tool] init` is the established pattern for zero-friction setup. | MEDIUM | Must write `~/.claude/settings.json` hooks config automatically. Must handle existing config gracefully (merge, not overwrite). Must validate the write succeeded. |
| Health-check / doctor command | When something isn't working, users need a single command that diagnoses the issue rather than manual investigation across multiple files and processes. | LOW | Check: is server running? are hooks installed in settings.json? are JSONL files found in ~/.claude/projects/? Print status per check with clear pass/fail output. |

### Differentiators (Competitive Advantage)

Features that set ObservAgent apart. These are not universally expected but are highly valued for Claude Code multi-agent use cases.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Agent tree visualization (parent-child hierarchy) | No competitor visualizes the Task tool spawn tree. GSD users run 3-6 sub-agents simultaneously — they have no way to see which agent is which or how they relate. This is the primary differentiator. | HIGH | Requires parent_session_id linkage from PreToolUse on Task tool events. Render as indented tree or D3-style collapsible tree. Each node shows: agent label, status, cost, last activity. Recursive CTE query from SQLite. |
| Per-agent cost breakdown | In a multi-agent run, "total cost $2.40" is useless if you can't see that sub-agent 3 spent $1.80. Per-agent attribution enables optimization. | MEDIUM | Sum token_snapshots.cost_usd grouped by session_id. Roll up to parent via tree traversal. Display as cost badge per node in agent tree. |
| Context window fill percentage | "How close is this agent to hitting its context limit?" — per-agent progress bar from 0% to 100%. Warning at 80%+. This surfaces an impending failure mode before it happens. | MEDIUM | context_tokens_used / context_tokens_max from JSONL usage fields. Must know model context window size (varies by model: Claude 3.5 Sonnet = 200K, etc.). Make limits configurable in case Anthropic changes them. |
| Stuck agent detection | An agent with no tool activity for 60+ seconds might be stuck waiting, looping, or crashed. No competitor surfaces this for Claude Code. Surface as visual warning badge on the agent node. | MEDIUM | Compare last_event_at to wall clock per session. Run check on an interval (every 10s). Configurable threshold (default 60s). Clear warning when activity resumes. |
| Gantt-style agent timeline | Horizontal swimlane view of tool calls across agents on a shared time axis. Shows parallelism visually: which agents ran concurrently, where gaps are, where bottlenecks occurred. | HIGH | Map events to horizontal bars (tool_name, start timestamp, duration_ms) per session lane. Requires a charting library or hand-coded SVG/canvas. Chart.js doesn't have Gantt support — use plain SVG rectangles on a calculated time axis. Only meaningful when there are multiple agents; degrade gracefully for single-agent sessions. |
| `observagent start` (server + browser in one command) | Reduces the "how do I open this?" friction. Standard pattern: `npm start` opens browser, `npm dev` opens browser. Users should not need to copy-paste a localhost URL. | LOW | Node: `open` package or `child_process.exec('open http://localhost:4999')` after server confirms listening. Cross-platform: use `open` on macOS, `xdg-open` on Linux, `start` on Windows (macOS is the primary target). |
| Cost fill rate indicator (tokens/min or $/min) | "How fast is this agent spending?" — rate-of-spend during an active run helps users decide whether to let it continue. | LOW | Calculate cost delta over the last 60s window from token_snapshots. Display as `$0.03/min` in the session header. Only show during active sessions. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that appear reasonable but create problems for this product at this stage.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time Gantt updates (live swimlane during session) | Users want to see the timeline growing as the session runs | Continuously re-rendering a time-axis chart with new events causes layout thrash and is visually disorienting. The value of a Gantt view is retrospective pattern recognition, not live watching. | Render Gantt on-demand per session (click to view) or auto-refresh at 5s intervals rather than on every event. |
| GSD role labeling (researcher/builder/verifier) | Appealing for GSD users; shows semantic role of each agent | Requires parsing agent prompts for GSD-specific patterns. Fragile: GSD prompt format changes break it. Creates a GSD-specific coupling in a general tool. | Label agents by task prompt prefix (first 50 chars) instead — works for all users, not just GSD users. |
| Slack/webhook alerts for budget threshold | "Notify me externally when cost exceeds $X" | Adds network dependency, secret management (webhook URLs), and operational complexity to a local-first tool. Over-engineering for v1. | In-dashboard toast notification + visual badge. Users are watching the dashboard anyway when running agents. |
| Session diffing / comparing runs | "Show me what changed between run A and run B" | Requires a diff model, meaningful equality definition, and a complex UI. Low usage frequency vs implementation cost. | Side-by-side session view in history (open two sessions) is sufficient — don't build a dedicated diff mode. |
| AI-powered anomaly detection | "Flag unusual token usage patterns automatically" | Adds a model dependency (ironic for an observability tool), increases complexity, and 90% of the signal comes from simple thresholds. | Rule-based health checks: stuck agent threshold, context fill %, budget exceeded. Cover 90% of value at 5% of the complexity. |
| Full JSONL replay (re-run session through LLM) | "Let me replay this session to reproduce an issue" | This is evaluation tooling, not observability. LangSmith and Braintrust own this space. Adds substantial complexity with no unique edge. | Export session data (JSONL/CSV) and let users import into eval tools of their choice. |
| Custom dashboard layout / widget builder | "I want to rearrange panels" | Grafana-scale scope. Ship an opinionated fixed layout first; validate that users actually use it before building customization. | Fixed layout, well-considered information hierarchy. Users can provide feedback to inform v2 layout decisions. |

---

## Feature Dependencies

```
[EXISTING] Hook relay pipeline + SQLite events table
    └──required by──> Token/cost tracking (JSONL data path must be added)
    └──required by──> Agent tree (session tracking + parent_session_id linkage)
    └──required by──> Session history (events table must be populated)
    └──required by──> Gantt timeline (events with timestamps must exist)

[COST-01] Token usage per session (JSONL watcher)
    └──required by──> [COST-02] Context window fill percentage
    └──required by──> [COST-03] Running dollar cost total
    └──required by──> [COST-04] Cost budget alert
    └──required by──> [AGENT-02] Per-agent cost breakdown
    └──required by──> Cost fill rate indicator ($/min)

[AGENT-01] Agent tree visualization
    └──required by──> [AGENT-02] Per-agent cost breakdown (must exist as tree nodes)
    └──required by──> [AGENT-03] Stuck agent detection (needs per-agent last_event_at)
    └──required by──> [DASH-03] Gantt timeline (agent lanes must be defined)

[HIST-01] Session list
    └──required by──> [HIST-02] Filter and search
    └──required by──> [HIST-03] Export

[SETUP-01] npx observagent init (CLI, hooks auto-install)
    └──enhances──> Everything (nothing is discoverable without this)

[DASH-03] Gantt timeline
    └──requires──> [AGENT-01] Agent tree (for multi-agent lanes)
    └──requires──> [COST-01] Token/cost (for cost annotations on timeline)
    └──standalone for single-agent sessions──> [EXISTING] events table (timestamps + duration_ms)
```

### Dependency Notes

- **Cost tracking requires the JSONL watcher:** The existing system captures tool call events via hooks, but token/cost data only lives in `~/.claude/projects/**/*.jsonl` files. The JSONL watcher is a new data path, not a modification to the existing hook pipeline.
- **Agent tree requires parent_session_id linkage:** The existing `events` table tracks session_id per event but has no parent_session_id concept. The sessions table and parent_session_id column must be added before the tree can be built.
- **Gantt timeline is the last-mile feature:** It depends on all other data being stable (agent lanes from tree, timestamps from events, duration_ms from hook pairing). Build it last.
- **CLI setup is orthogonal but accelerates adoption:** `npx observagent init` doesn't depend on any feature being complete, but it should be polished enough to install a working system. Build it after the features it installs are stable.
- **Session history is a read-only view:** It depends on `events` and `sessions` being populated but adds no new writes. It can be built incrementally — start with a list, add filters, add export.

---

## MVP Definition

This is milestone v1.1 — the system already exists. These are prioritized within the milestone, not from scratch.

### Launch With (v1.1 core)

- [x] **Token/cost tracking** — Highest user pain point. JSONL watcher + cost computation. Required for all cost-adjacent features.
- [x] **Agent tree visualization** — The primary differentiator. Requires parent_session_id linkage from Task tool PreToolUse events.
- [x] **Per-agent cost breakdown** — Builds directly on top of token tracking + agent tree. Low marginal effort, high value.
- [x] **Context window fill indicator** — Context limit is a real operational concern for long GSD runs. Medium complexity, high user value.
- [x] **Stuck agent detection** — Simple threshold check. Prevents users from waiting on a dead agent for minutes.
- [x] **Session history list** — Table stakes for any observability tool. Users need historical browsing from day one.
- [x] **Session filter and search** — Required to make history usable beyond the first 10 sessions.
- [x] **Session export (JSONL/CSV)** — Low complexity, high user trust signal. Power users want raw data access.
- [x] **npx observagent init** — CLI auto-install. Table stakes for adoption. Without it, most users never complete setup.
- [x] **observagent doctor** — Diagnostic command. Reduces support burden. Low complexity.
- [x] **observagent start** — Single-command start + browser open. Low complexity. Removes friction.
- [x] **Cost budget alert** — In-dashboard only. Low complexity, prevents runaway spend.

### Add After Validation (v1.x)

- [ ] **Gantt timeline view** — High complexity, high value. Defer until agent tree + cost data are proven stable. Ship as a separate "Timeline" tab rather than embedded in the main dashboard.
- [ ] **Cost fill rate ($/min)** — Low complexity. Add when users explicitly request it or when cost tracking is proven stable.
- [ ] **GSD agent role labeling** — Prompt prefix display (first 50 chars) can ship earlier; semantic GSD role parsing defers to after v1.1.

### Future Consideration (v2+)

- [ ] **Webhook/Slack cost alerts** — External notification system. Local-first tool's in-dashboard alert is sufficient for v1.
- [ ] **OpenTelemetry export** — Standard compliance. High value for enterprise users. Out of scope until multi-user is considered.
- [ ] **Session comparison / diffing** — Useful but low frequency. Defer until history features are validated.
- [ ] **Custom dashboard layout** — Build opinions first, customize later.
- [ ] **GSD workflow awareness (full semantic labeling)** — Requires GSD prompt format stability. Ship after GSD v2 is stable.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Token/cost tracking (JSONL watcher) | HIGH | MEDIUM | P1 |
| Running dollar cost total | HIGH | LOW | P1 |
| Agent tree visualization | HIGH | HIGH | P1 |
| Per-agent cost breakdown | HIGH | MEDIUM | P1 |
| npx observagent init (CLI) | HIGH | MEDIUM | P1 |
| Session history list | HIGH | MEDIUM | P1 |
| Stuck agent detection | MEDIUM | MEDIUM | P1 |
| Context window fill indicator | MEDIUM | MEDIUM | P1 |
| Session filter/search | MEDIUM | MEDIUM | P1 |
| Session export (JSONL/CSV) | MEDIUM | LOW | P2 |
| Cost budget alert | MEDIUM | LOW | P2 |
| observagent doctor | MEDIUM | LOW | P2 |
| observagent start | LOW | LOW | P2 |
| Gantt timeline view | HIGH | HIGH | P2 |
| Cost fill rate ($/min) | LOW | LOW | P3 |
| GSD role labeling (semantic) | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.1 launch
- P2: Should have, add in v1.1 if time allows
- P3: Defer to v1.2 or v2

---

## Feature Deep Dives

### Feature 1: Cost and Token Tracking

**Expected behavior (table stakes):**
- Show per-session totals: input tokens, output tokens, cache read tokens, cache write tokens
- Show per-session dollar cost with 2-4 decimal precision (e.g., `$0.0142`)
- Update the cost display in near-real-time as the agent works (within 1-2s of a JSONL write)
- Display context window fill as a percentage bar per agent (0–100%, warn at 80%)
- Alert in-dashboard when session cost exceeds a configurable threshold

**Data source:** `~/.claude/projects/<project-hash>/<session-id>.jsonl` — assistant turn entries contain `message.usage` with token counts and model identifier

**Implementation constraints:**
- JSONL watcher must tail files by byte offset, not re-read from start — sessions grow to 100s of KB
- Every `JSON.parse()` must be wrapped in try/catch — Claude Code may write lines mid-flush
- Token counts must be deduplicated via `UNIQUE(session_id, message_id)` — watcher may see the same line twice on restart
- Model pricing must not be hardcoded — store as a config file or env var, provide sensible defaults that are easy to update
- Cache token pricing differs from regular pricing (cache reads are cheaper, cache writes are slightly more expensive) — must handle all four token types separately

**Confidence:** MEDIUM — JSONL schema is assumed from the AgentWatch prior art in the profile; must verify actual field names by inspecting a real `~/.claude/projects/` file before writing the parser.

---

### Feature 2: Multi-Agent Tree Visualization

**Expected behavior (differentiator):**
- Show a visual hierarchy of parent agent → child agents spawned via Task tool
- Each node shows: session ID (truncated), last tool used, current status (active/idle/stuck/done), token count, dollar cost
- Clicking a node filters the event log to that agent's events
- Stuck agents (no event for 60s) show a visual warning on their node
- Tree updates live as new agents spawn and events arrive

**Implementation constraints:**
- Parent-child linkage source: `PreToolUse` hook event fires in parent session context when Task tool is called. The parent session_id must be captured at that moment and stored as the parent ID. When a new session_id subsequently appears in JSONL, link it to the pending parent.
- **Critical unknown:** Whether `SubagentStop` hook payload includes the child session_id — if yes, the linkage is explicit and reliable; if no, inference via cwd + time window is required. This must be verified by triggering a real Task tool spawn and inspecting the hook payload.
- The existing DB schema does not have a `sessions` table or `parent_session_id` column — both must be added
- Use a recursive CTE to query the full tree from SQLite: `WITH RECURSIVE tree AS (SELECT ... UNION ALL SELECT ... JOIN ...)`
- For rendering: an indented HTML list is sufficient for v1. D3 tree layout is a differentiator but adds a library dependency and significant implementation time. Start with indented list, ship D3 tree as a v1.2 enhancement.

**Confidence:** MEDIUM — architecture pattern is clear; the single unknown (SubagentStop payload) is the most consequential open question in the entire v1.1 milestone.

---

### Feature 3: Session History and Discovery

**Expected behavior (table stakes):**
- List all sessions (past and active) sorted by recency, grouped by project path
- Show per-session: project, date/time, duration, total cost, total tokens, status (active/ended), error count
- Filter by: date range, project path (substring), cost range (min/max), model, has-errors boolean
- Search by session ID prefix
- Export session as JSONL (raw conversation data) or CSV (tabular event summary)
- Active sessions displayed at top with a live indicator; historical sessions below

**Implementation constraints:**
- Export format: JSONL should output the raw parsed JSONL lines for the session (this is what the user's tooling already understands); CSV should output one row per event with columns: timestamp, tool_name, hook_type, duration_ms, exit_status, cost_usd
- Filter logic is pure SQL WHERE clauses — no need for client-side filtering
- Pagination: 50 sessions per page is sufficient; full-text search is not needed
- Session end detection: a session is "ended" when a `Stop` or `SubagentStop` hook event is received, or when no events have arrived for 5+ minutes (configurable)
- The export endpoint must stream the response rather than buffering the full export in memory — sessions could have thousands of events

**Confidence:** HIGH — this is standard CRUD + SQL filtering with straightforward export patterns.

---

### Feature 4: Zero-Config CLI Setup

**Expected behavior (table stakes):**

`npx observagent init`:
- Reads `~/.claude/settings.json` (or creates it if absent)
- Merges ObservAgent hooks into the existing hooks config — must not overwrite other hooks
- Writes PreToolUse, PostToolUse, Stop, and SubagentStop hook entries pointing to the relay script
- Confirms the relay script is in place and executable
- Prints clear success output: "Hooks installed. Run `observagent start` to begin."

`observagent start`:
- Starts the Fastify server on port 4999 (or a port from config)
- Opens the dashboard in the default browser (`open http://localhost:4999` on macOS, `xdg-open` on Linux)
- Prints the dashboard URL to stdout in case auto-open fails

`observagent doctor`:
- Checks: is the server reachable at localhost:4999?
- Checks: are ObservAgent hooks present in `~/.claude/settings.json`?
- Checks: does the relay script exist and is it executable?
- Checks: are JSONL session files present in `~/.claude/projects/`?
- Prints a status line per check: `[PASS]` or `[FAIL]` with a specific diagnosis and fix instruction

**Implementation constraints:**
- Use `commander` or `yargs` for CLI argument parsing — do not hand-roll argument parsing
- Must handle `~/.claude/settings.json` not existing (create it), containing other hooks (merge carefully), and having unexpected structure (warn and bail rather than corrupting)
- The hook entry format in `~/.claude/settings.json` must be verified by reading real Claude Code documentation or inspecting an existing installation — this schema is the most fragile assumption in the CLI feature
- `npx observagent init` must be idempotent — running it twice must not install duplicate hooks
- The package `bin` field must be configured in `package.json` for `npx` to work correctly
- Cross-platform: macOS is the primary target; Linux support is expected; Windows is out of scope for v1

**Confidence:** MEDIUM — the Node CLI packaging pattern is well-understood; the Claude Code `settings.json` hook schema is a key unknown that must be verified before implementation. An incorrect schema would silently install broken hooks.

---

### Feature 5: Gantt-Style Agent Timeline View

**Expected behavior (differentiator):**
- Horizontal swimlane chart with one row per agent (session)
- Each tool call rendered as a horizontal bar: left edge = start timestamp, width = duration_ms
- Bars are colored by tool type (e.g., Read = blue, Bash = orange, Write = green, Task = purple)
- Time axis is relative to session start (T+0s, T+30s, T+1m, etc.) or absolute wall clock — provide toggle
- Concurrent tool calls across agents show parallelism visually
- Gaps between bars show idle/thinking time
- Bars are clickable to show event details (tool name, duration, exit status)
- For single-agent sessions: still useful — shows sequential tool call pacing
- For multi-agent sessions: shows inter-agent parallelism and bottlenecks

**Rendering approach:**
- Chart.js has no Gantt support (confirmed) — use plain SVG with `<rect>` elements on a calculated time axis
- Calculate: `x = (event.timestamp - sessionStart) / totalDuration * canvasWidth`, `width = event.duration_ms / totalDuration * canvasWidth`
- Minimum bar width: 4px (so instant calls are still visible)
- Tooltip on hover: use plain HTML `title` attribute or a custom div overlay
- Auto-scale time axis to session duration; default to full session view; allow scroll/zoom as v1.2 enhancement

**Why defer from core MVP:**
- Depends on: agent tree (for per-agent lanes), token/cost data (for annotations), stable event timestamps
- High implementation effort for the SVG layout and scale calculations
- The value is retrospective (post-session analysis) while the rest of the dashboard is live — it belongs in a separate "Timeline" tab that loads on demand

**Implementation constraints:**
- Sessions with very long durations (>1 hour) need sensible time-axis tick spacing
- Sessions with very short tool calls (<10ms) need minimum bar width enforcement so bars are visible
- Must gracefully degrade for single-agent sessions (show single swimlane rather than erroring)
- Must handle missing `duration_ms` for events that have no PostToolUse pair (show as 0-width bar or dotted outline)

**Confidence:** MEDIUM — SVG-based Gantt is a well-understood UI pattern; the implementation complexity is real but not novel.

---

## Competitor Feature Analysis

| Feature | LangSmith | Helicone | AgentOps | Langfuse | ObservAgent v1.1 |
|---------|-----------|----------|----------|----------|-----------------|
| Token usage display | Yes (per-trace) | Yes (prominent) | Yes | Yes (per-trace) | Yes — JSONL-based |
| Cost in dollars | Yes | Yes (primary feature) | Yes | Yes | Yes — model-rate conversion |
| Cost budget alert | Yes (project-level) | Yes (rate limit) | No | Yes | Yes — session threshold |
| Agent hierarchy tree | LangGraph only | No | Partial (agent chain) | No | Yes — Task tool native |
| Context window fill | No | No | No | No | Yes — unique |
| Stuck agent detection | No | No | No | No | Yes — unique |
| Session history/filter | Yes | Yes | Yes | Yes | Yes |
| Data export | Yes (CSV/JSON) | Yes (CSV) | No | Yes | Yes (JSONL/CSV) |
| Zero-config install | No (requires wrapper) | No (requires proxy) | No (requires SDK) | No (requires SDK) | Yes — hooks-based moat |
| CLI setup tool | No | No | No | No | Yes — `npx observagent` |
| Gantt/timeline view | Partial (trace timeline) | No | No | Partial (trace view) | Yes — swimlane per agent |
| Works with Claude Code | No | No | No | No | Yes — the moat |

---

## Sources

- **LangSmith** — trace/span model, cost tracking patterns, session history UX (training knowledge, MEDIUM confidence)
- **Helicone** — cost-as-primary-feature pattern, budget alerts, dashboard layout (training knowledge, MEDIUM confidence)
- **AgentOps** — agent-native session tracking, hierarchy concepts (training knowledge, MEDIUM confidence)
- **Langfuse** — open-source LangSmith alternative, self-host patterns (training knowledge, MEDIUM confidence)
- **Arize Phoenix** — local-first OSS, OTEL-native patterns (training knowledge, LOW confidence — least familiar)
- **Claude Code documentation** — hook payload schemas assumed from AgentWatch prior art; must verify against real sessions
- **ObservAgent PROJECT.md, REQUIREMENTS.md** — authoritative scope boundaries for this milestone
- **ObservAgent ARCHITECTURE.md** — SQLite schema, component boundaries, data flow paths
- **ObservAgent source code** — existing events table schema, Fastify server structure, hook relay pattern

---

*Feature research for: ObservAgent v1.1 — Full Observability Stack*
*Researched: 2026-02-26*
