# Pitfalls Research

**Domain:** AI Agent Observability — Adding v2.0 Agent Intelligence features to existing ObservAgent platform
**Researched:** 2026-03-02
**Confidence:** HIGH — All pitfalls derived from direct codebase inspection (relay.py, costEngine.js, ingest.js, sseClients.js, index.html) and verified against the actual running system.

---

## Critical Pitfalls

### Pitfall 1: relay.py Selective tool_input Capture Leaks Sensitive Data into the Event Stream

**What goes wrong:**
The v2.0 tool log enrichment feature requires relay.py to forward selective fields from `tool_input` — specifically `command` for Bash, `file_path` for Read/Write/Edit, `pattern` for Glob/Grep, and `description` for Task. The current design correctly strips all of `tool_input` as a security boundary (documented in `[01-02]` decisions). If the v2.0 relay change naively forwards `payload.get("tool_input", {})` without allowlisting specific fields per tool type, the full `tool_input` object will flow through — which for Write/Edit tools contains the complete file content being written, and for Bash contains the full command string (which may include API keys, passwords, or other secrets passed as arguments).

**Why it happens:**
The simplest implementation of "forward the command field" is `event["command"] = payload.get("tool_input", {}).get("command", "")`. This is safe for Bash since `command` is just the shell string. But a developer adding file enrichment might write `event["content"] = payload.get("tool_input", {}).get("content", "")` — and `content` is the full file body being written, potentially megabytes of source code or config files containing secrets.

**How to avoid:**
- Define an explicit per-tool allowlist in relay.py: a dict mapping `tool_name` to a list of safe `tool_input` key names to forward
- The allowlist must be reviewed and approved for each tool type before adding new entries
- Fields allowed: `Bash → ["command"]`, `Read → ["file_path"]`, `Write → ["file_path"]` (NOT `content`), `Edit → ["file_path"]` (NOT `old_str`, `new_str`), `Glob → ["pattern"]`, `Grep → ["pattern"]`, `Task → ["description"]`
- Never add `content`, `old_str`, `new_str`, `new_content`, or any field that carries file body content
- Add a comment in relay.py explicitly listing forbidden fields and why

**Warning signs:**
- relay.py event payload size increases dramatically (safe fields are short strings; file content fields are kilobytes)
- Server logs show events with multi-kilobyte JSON bodies
- Any field name in the forwarded event that matches known Anthropic API write fields: `content`, `new_str`, `new_content`

**Phase to address:** Phase that adds tool log enrichment (relay.py changes)

---

### Pitfall 2: relay.py JSON Parsing Failure on Malformed tool_input Crashes the Relay

**What goes wrong:**
The current relay.py never touches `tool_input` so it cannot fail on malformed tool_input JSON. Once v2.0 adds selective `tool_input` field extraction, any tool_input value that is not a dict (e.g., a string, None, or a nested structure where the expected key holds a non-string type) will either raise a `TypeError` on `.get()` or produce a wrong type that breaks JSON serialization downstream.

The existing `except Exception: pass` catch handles this correctly — but only if the error is raised inside the `try` block. If selective extraction is added after the `try` block (e.g., as a post-processing step), the silent fail guarantee is broken and relay.py will crash with output to stderr, violating the "NEVER write to stdout or stderr" constraint.

**Why it happens:**
Developers see the `except Exception: pass` at the bottom and assume the entire relay is protected. In practice, code placed after the try/except is not protected. The relay's structure requires all logic to be inside the single try block.

**How to avoid:**
- All `tool_input` field extraction must be inside the existing `try` block, not after it
- Use defensive extraction: `tool_input = payload.get("tool_input") or {}` (not `payload.get("tool_input", {})` alone — the payload field could be `None` explicitly, which would make `.get()` on `None` raise `AttributeError`)
- Add isinstance guard: `if not isinstance(tool_input, dict): tool_input = {}`
- Test with edge cases: tool_input=None, tool_input="string", tool_input=[], tool_input={"command": None}

**Warning signs:**
- Relay crashes visible as Python tracebacks appearing in Claude Code terminal output (violates the silent-fail contract)
- Tool calls in Claude Code appear to pause or behave unexpectedly (non-zero exit from relay)
- Missing events in ObservAgent dashboard despite active Claude Code session

**Phase to address:** Phase that modifies relay.py for tool log enrichment

---

### Pitfall 3: relay.py Performance Degrades Below 500ms Budget with Selective Extraction

**What goes wrong:**
The relay.py has a hard 500ms timeout budget for the entire HTTP POST. Currently it does: read stdin, parse JSON (small payload), build small event dict, POST. Adding selective `tool_input` extraction adds JSON key lookups — negligible. But if the implementation adds any logic that involves string operations on large values (e.g., truncating a long command with `[:200]` using Python string slicing on a 50KB tool_input), or any conditional branching on tool names with isinstance checks, the overhead accumulates per hook invocation.

The danger is not the logic itself but the tool_input payload size. Claude Code's Write tool passes complete file content in `tool_input.content`. Even if the relay only reads `tool_input.file_path`, Python's `json.loads()` still parses the entire payload including the file content. A 500KB file write generates a ~500KB JSON payload that `json.loads()` must process on every PostToolUse hook.

**Why it happens:**
`json.loads()` is called unconditionally on all of stdin. The existing relay already parses the full payload — it just discards everything except 4 fields. This is safe today because the extracted fields are short. The risk is unchanged for the new feature, but developers may not realize that `json.loads()` cost scales with payload size.

**How to avoid:**
- The existing `json.loads(raw)` approach is acceptable — no change needed to parsing
- Do NOT add any string operations that iterate over large field values (e.g., regex search on `tool_input.command` for secret detection — this belongs server-side, not in the relay)
- Truncate at extraction time: cap forwarded string values at 500 characters maximum to keep the POST body small
- The 500ms budget is for the full round-trip including network; keep relay processing to under 5ms

**Warning signs:**
- Claude Code sessions feel slower after relay.py is updated (tool calls take noticeably longer)
- Server logs show relay POST timing approaching 400ms+ (server receives request very late in the budget)
- `observagent doctor` timeout check fires

**Phase to address:** Phase that modifies relay.py

---

### Pitfall 4: Context Window % Calculation Uses Only input_tokens — Misses System Prompt and Cache Contributions

**What goes wrong:**
The current `getContextFillPercent()` in costEngine.js computes:
```js
const totalInput = lastUsage.inputTokens + lastUsage.cacheReadTokens + lastUsage.cacheWrite5m + lastUsage.cacheWrite1h;
```
This uses the *last* usage record's token counts — NOT cumulative totals across the session. This is actually the correct approach for context fill (context window fills based on the current request's total input, not historical totals). However, the ~10% discrepancy noted in STATE.md suggests the calculation is missing a component.

The Anthropic API returns `input_tokens` as the non-cached portion of input. The total context consumed by a request is `input_tokens + cache_read_input_tokens`. Cache write tokens (`cache_creation_input_tokens`) represent newly cached content that is also in the context. Correctly, total context = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` (all cache write tiers). The current code includes `cacheWrite5m + cacheWrite1h` — which is correct per the Anthropic token field mapping. The 10% gap is more likely from Claude Code's display including output tokens as "context used" (since output tokens from prior turns become input in the next turn via conversation history).

**Why it happens:**
The Anthropic usage fields (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) represent the *current request's* usage. Claude Code's context fill percentage shown in the statusline includes the accumulated conversation context — which means each turn's output tokens roll forward into the next turn's input tokens. Calculating context fill from a single `lastRecord` misses this accumulation.

**How to avoid:**
- The correct model: context fill = last request's `input_tokens + cache_read + cache_creation` (all cache tiers), which is what the code already does
- The ~10% gap is most likely because Claude Code counts system prompt tokens separately and shows them as context used; ObservAgent only sees API-reported tokens
- Do NOT switch to cumulative sum across messages — that would severely overcount (each message's input already includes all prior context)
- To fix the discrepancy: add output tokens from the last record to the denominator check, since the model's response tokens also occupy context window during the response generation phase — but this is speculative without confirming the source of the gap
- Flag the gap with a tooltip on the UI: "ObservAgent context % may differ slightly from Claude Code display — see known limitation"
- Log the raw `lastRecord` values vs Claude Code display value during a controlled test session to isolate the source

**Warning signs:**
- Context fill bar consistently shows 10-15% less than Claude Code's own statusline percentage
- Context fill jumps above 100% (indicates the formula counts tokens that shouldn't be counted together)
- Context fill shows 0% during active session (indicates `lastRecord` is not being passed correctly or is undefined)

**Phase to address:** Phase that implements per-agent detail panel with context fill %

---

### Pitfall 5: getContextFillPercent Uses lastRecord Directly — Passes the Per-Record Values Not the Aggregated Cumulative

**What goes wrong:**
In `aggregateSessionCost()`, the final `contextFillPct` is computed from `lastRecord` (the last usage record in the array). `lastRecord` contains per-message token counts for that single API call — not the cumulative session totals. This is correct for context fill (context window is about the current request, not total session tokens). However, when v2.0 builds a per-agent detail panel showing *current* context fill, the code must fetch the last record for *that agent's* JSONL, not for the parent session. Mixing agent records will produce wrong context fill percentages for subagents.

**Why it happens:**
`aggregateSessionCost()` operates on all records for a session (parent + subagent combined if not filtered). When per-agent context fill is needed, the call site must pass only that agent's usage records, not the full session's records. The API currently does not distinguish this.

**How to avoid:**
- Ensure the per-agent detail panel fetches context fill from `session_cost WHERE session_id = X AND agent_id = Y` — which already has the correct per-agent aggregation from `processFile()`
- The `cost_update` SSE event already includes `agentId` and `contextFillPct` per-agent — use this path for live updates
- Never compute context fill by mixing parent session records with subagent records

**Warning signs:**
- Subagent detail panel shows identical context fill % to parent session
- Context fill for a fresh subagent shows 60%+ immediately (inheriting parent's tokens)

**Phase to address:** Phase that builds per-agent detail panel

---

### Pitfall 6: DOM Thrash from renderAgentTree() Called on Every SSE Event

**What goes wrong:**
The current `renderAgentTree()` function completely rebuilds the `#agent-tree-body` container innerHTML on every call. It is called 12 times across SSE event handlers and UI interaction paths (grep confirmed 12 call sites). During an active multi-agent GSD run with 4+ parallel agents, tool call events arrive at several per second. Each event triggers `renderAgentTree()`, which clears and rebuilds the entire DOM subtree for the agent panel. This causes:
1. Visual flicker on every tool call event
2. Loss of scroll position in the agent tree panel
3. Collapsed/expanded state of any accordion nodes gets reset
4. CSS transition animations restart on every render

**Why it happens:**
Full-replace innerHTML rendering is the simplest pattern and works fine at low event rates. At high event rates (GSD multi-agent runs), it becomes a source of flicker and UX regression. This is especially acute for v2.0 which adds collapsible tree nodes — a re-render on every SSE event will collapse any node the user just expanded.

**How to avoid:**
- Decouple data updates from rendering: update the in-memory `agentTree` state on every SSE event, but debounce `renderAgentTree()` calls at 150-200ms
- OR: switch from full-replace to targeted DOM updates — only update the specific agent row that changed (by `agentId` key), leaving all other rows untouched
- Preserve expanded/collapsed state in a separate `Set<agentId>` that is not reset on re-render; restore state after each render
- For v2.0 collapsible tree nodes specifically: the collapsed state MUST survive re-renders — if it doesn't, the feature is broken in practice for any active session

**Warning signs:**
- Collapsible tree nodes snap closed every few seconds during active agent runs
- Scroll position in the agent panel jumps to top during active runs
- Browser Performance profiler shows DOM recalculation spikes on each SSE message

**Phase to address:** Phase that adds collapsible agent tree / live updates

---

### Pitfall 7: Two EventSource Connections to /events Create Double-Processing Risk

**What goes wrong:**
The current index.html opens two separate `EventSource('/events')` connections: one in `subscribeSSE()` (handles tool log events) and one as `agentEs` (handles agent_spawn, agent_update, cost_update events). Both connections receive every SSE broadcast. The existing code carefully routes by event type — `agentEs.onmessage` only acts on `agent_spawn`, `agent_update`, and cost_update for agents; the other EventSource handles tool log events.

When v2.0 adds new event types (e.g., `tool_detail` for enriched tool data), both EventSource handlers will receive the new events. If the new event type is handled in `subscribeSSE()` but `agentEs.onmessage` also fires and does not guard against the new type, it may cause silent double-processing or incorrect state mutations.

**Why it happens:**
The two-EventSource pattern was an expedient solution in Phase 4 to avoid refactoring the existing subscribeSSE handler. It is now technical debt that creates a growing surface for event routing bugs as new event types are added.

**How to avoid:**
- Before adding any new SSE event types, audit which EventSource handler will process them
- Add an explicit `if (msg.type === 'X') return;` guard in `agentEs.onmessage` for any event type already handled by the primary EventSource
- The correct long-term fix is to consolidate into a single EventSource with a dispatch table, but this is a refactor — evaluate whether v2.0 timing allows it
- If consolidating, do it as a dedicated refactor step before adding new event types — not mid-feature

**Warning signs:**
- New SSE event types trigger both EventSource handlers (check by adding `console.log` temporarily)
- Agent tree state is updated twice per event (flicker appears even with debouncing)
- Tool log rows appear duplicated when new event types fire

**Phase to address:** Dashboard refactor / SSE consolidation phase

---

### Pitfall 8: Time Filters on Live Dashboard Filter Out Active Events Before They Appear

**What goes wrong:**
Adding time filters (e.g., "last 15 minutes", "last hour") to the live dashboard event log creates a correctness trap: if the filter applies to the in-memory event array used for display, and the filter boundary is evaluated at render time rather than at event-append time, very recent events may transiently fall outside the filter window due to clock skew between client and server.

More critically: if a time filter is applied to the SSE event stream itself (by filtering received events before appending to the DOM), events that arrive slightly after their `timestamp` field (due to processing delay) may be dropped if the filter uses `event.timestamp < Date.now() - windowMs`.

**Why it happens:**
"Show last 15 minutes" seems simple: filter `events where event.timestamp >= now - 15*60*1000`. But `event.timestamp` is the server's time of ingest, and the SSE delivery adds a few milliseconds. Events at the exact boundary of the window get dropped intermittently. This creates a "sometimes shows, sometimes doesn't" bug that is difficult to reproduce.

**How to avoid:**
- Apply time filters only to the initial hydration REST call (`GET /api/events?since=...`), not to live SSE events
- Live SSE events should always be appended to the DOM regardless of time filter — they are by definition current
- "Last N minutes" filter should control how much history to load on connect, not whether to display events as they arrive
- Add a clear visual indicator when a time filter is active so users know they are seeing a limited history window

**Warning signs:**
- Events appear in the log briefly then disappear (filter evaluation timing issue)
- "Last 15 minutes" filter shows no events even during active session (off-by-one on time boundary)
- Event count in filtered view is inconsistent between page loads

**Phase to address:** Phase that adds time filters to live dashboard

---

### Pitfall 9: Dashboard Layout Overhaul Breaks the SSE Connection on Panel Re-initialization

**What goes wrong:**
The v2.0 dashboard reorganization (agent hierarchy as primary view, new panel layout) requires changing the grid structure in CSS and moving/replacing panel DOM elements. If the JavaScript init sequence is modified during this refactor, the SSE subscription may be re-initialized after `DOMContentLoaded` has already fired, causing events to be dropped during the initialization window. More dangerously: if the layout overhaul removes or renames the element IDs that SSE event handlers write to (e.g., renames `#agent-tree-body` or removes `#panel-log`), those handlers will silently fail — `document.getElementById()` returns null, and `.appendChild()` on null throws, which is caught by the SSE error handler but drops all subsequent events.

**Why it happens:**
HTML/CSS changes and JavaScript changes are edited in the same file (index.html). A developer working on the layout can rename an element ID without noticing the JavaScript event handler references it. The error is silent because SSE `onerror` reconnects rather than crashing.

**How to avoid:**
- Before touching any element ID in the HTML, grep the JavaScript section for all usages of that ID
- The high-risk IDs in index.html: `#agent-tree-body`, `#panel-log`, `#panel-cost`, `#panel-health`, `#cost-bar`, `#ctx-bar`
- Make layout changes in a dedicated CSS-only step first; verify all JavaScript still works; then add new JS for new features
- Add element existence assertions in the init function: `const el = document.getElementById('X'); if (!el) throw new Error('Missing #X');` — this causes a visible init failure instead of silent event dropping
- Run a "regression smoke test" after layout changes: trigger a tool call in Claude Code and verify it appears in the dashboard

**Warning signs:**
- After layout changes, tool calls in Claude Code do not appear in the dashboard log
- Console errors: `Cannot read properties of null (reading 'appendChild')`
- SSE connection shows as open in Network tab but no new rows appear in the log panel

**Phase to address:** Dashboard reorganization phase

---

### Pitfall 10: Stale Agent State When Agents Complete During Layout Re-render

**What goes wrong:**
v2.0 adds real-time "current tool" display per agent in the tree. This requires tracking which tool call is in-flight per agent and updating the display on each PreToolUse/PostToolUse event. The risk is a race condition: if an agent completes (SubagentStop fires) between a PreToolUse and its corresponding PostToolUse, the in-progress tool display shows a tool that will never complete. The current stuck-agent detection (60s timeout) partially mitigates this, but a completed agent showing an in-progress tool is immediately confusing to users, not just after 60 seconds.

**Why it happens:**
The `pendingCalls` Map in ingest.js only tracks at the server level for duration calculation. The frontend's agent tree state tracks tool activity via `agent.lastTool` and `agent.lastActivityTs` but has no concept of "this agent has completed, so any in-progress tool display should be cleared." When `agent_update` with `state: 'completed'` arrives, the frontend updates the agent state but does not clear the current-tool display if a PreToolUse was already rendered.

**How to avoid:**
- When processing `agent_update` with `state: 'completed'`, also clear the in-progress tool state for that agent
- The `agent_update` handler must: `agent.state = 'completed'; agent.currentTool = null; agent.inProgress = false;`
- The real-time current-tool display should check `agent.state === 'active'` before showing a current tool — if state is 'completed', show nothing or "done"
- Test specifically: run a subagent task, complete it, verify the agent shows "completed" and no lingering tool name

**Warning signs:**
- Completed agents show a tool name in the current-tool display indefinitely
- Agent tree shows a spinner/in-progress indicator on a completed agent row
- 60-second stuck-agent warning fires immediately after agent completion (spurious alarm)

**Phase to address:** Phase that adds live current-tool display to agent tree

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Full innerHTML replace in renderAgentTree() | Simple to implement | DOM thrash + lost collapsed state at SSE event rates during active runs | Never for v2.0 collapsible tree — collapsed state must survive re-renders |
| Two EventSource connections to /events | Avoided Phase 4 refactor | Growing event routing complexity with each new SSE type; risk of double-processing | Acceptable if no new event types added; must consolidate before adding event types |
| Forwarding full tool_input object from relay.py | Trivially simple extraction | File content, secrets, multi-KB payloads in every event; security violation of established boundary | Never — per-field allowlist is mandatory |
| Context fill from lastRecord without investigating the 10% gap | Simpler than root-cause analysis | Users compare ObservAgent % to Claude Code % and conclude the tool is broken | Acceptable with a UI tooltip explaining the known discrepancy; not acceptable without the tooltip |
| Applying time filters to SSE stream (not just initial load) | "Obvious" implementation | Drops boundary events that arrive slightly late | Never — filters apply to history load only, not live stream |
| Global full-page re-render on layout overhaul | Faster to ship new layout | Breaks SSE wiring on element ID changes; silent failure | Never — make layout changes in CSS-only first pass, verify JS before adding new elements |

---

## Integration Gotchas

Common mistakes when connecting v2.0 features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| relay.py tool_input extraction + existing security boundary | Adding `event["content"] = payload["tool_input"]["content"]` for Write enrichment | Allowlist only: `["command"]` for Bash, `["file_path"]` for Read/Write/Edit, `["pattern"]` for Glob/Grep, `["description"]` for Task — never content fields |
| relay.py new fields + ingest.js validation | ingest.js naively passes new relay fields directly to SQLite insert | ingest.js must explicitly extract and validate new relay fields; never pass raw relay body to DB without field-level gating |
| renderAgentTree() + new collapsible state | Calling renderAgentTree() directly from SSE handler | Always debounce at 150ms; read collapsed state from a separate Set before render; restore after render |
| Two EventSource + new SSE event types | New event type fires in both EventSource handlers | Audit both handlers; add explicit guard in agentEs for any event type owned by subscribeSSE(), and vice versa |
| Time filter + SSE live stream | Filter received SSE events by timestamp | Filter only the initial history load via REST query params; live SSE events are always displayed |
| Layout overhaul + existing JS event handlers | Renaming element IDs in HTML | Grep all JS for old ID before renaming; add existence assertions in init |
| contextFillPct per-agent + aggregateSessionCost | Passing combined parent+subagent records to aggregateSessionCost for per-agent display | Per-agent context fill comes from `session_cost WHERE agent_id = Y` — already computed correctly by processFile() per agent |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| renderAgentTree() on every SSE event | Tree flickers, collapsed nodes snap open, scroll resets | Debounce at 150ms; track collapsed state externally | GSD runs with 4+ parallel agents (~5 events/sec) |
| relay.py parsing 500KB+ JSON on file Write events | Tool calls slow during large file writes | Already unavoidable with json.loads() — cap forwarded field values at 500 chars | Write tool calls with files >100KB |
| Full DOM rebuild of agent tree for "current tool" updates | Flickering current-tool label during rapid Bash/Read sequences | Targeted DOM update: only change the tool label cell for the affected agentId | Any agent running more than 1 tool call per second |
| un-debounced context fill re-calculation on every cost_update SSE | CPU spike on every JSONL file change during active session | costEngine already debounces at 300ms at JSONL layer; ensure frontend renders contextFillPct only on state change | Sessions where JSONL updates faster than 5 changes/sec |
| Loading all events for time filter calculation client-side | Large history loads for "last 15 min" filter on sessions with 1000+ events | Push time filtering to SQL query: `WHERE timestamp >= ?`; never load full history then filter in JS | Sessions > 200 tool calls |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Forwarding file content fields from tool_input (content, new_str, old_str) | Complete source code and config file contents stored in ObservAgent DB and served via /api/events | Per-tool allowlist in relay.py: only field names that are metadata (file_path, command summary, task description), never body content |
| Truncating command strings without sanitizing | Truncated command may still contain partial API keys or passwords | Cap at 500 chars AND apply a simple redaction pattern for common secret patterns (AWS_ACCESS_KEY, ANTHROPIC_API_KEY env var assignments) — or simply omit command entirely from the forwarded payload if security is uncertain |
| Expanding SSE broadcast to include tool detail | tool_detail events now contain command strings; if server is accidentally bound to 0.0.0.0, commands are broadcast externally | Server already binds to 127.0.0.1 only; verify this is not changed during v2.0 work; add `observagent doctor` check |
| Time filter query with user-controlled date parameters | SQL injection via date_from/date_to parameters in /api/sessions or /api/events | Use parameterized queries (already the pattern in api.js); never interpolate date strings into SQL; validate format is ISO date before passing to query |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Context fill bar changes value visibly while filter is active | User sees context at 45%, applies "last hour" filter, bar jumps to different % — confusing | Context fill should always show current session's live value regardless of time filter state; filter controls history log, not the health indicators |
| Collapsible agent tree collapses all nodes on page reconnect (SSE reconnect after disconnect) | User had tree expanded to see a specific subagent; network hiccup collapses everything | Store expanded-node state in localStorage keyed by agentId; restore on SSE reconnect |
| "Active agents only" filter hides agents that just completed but whose cost data user needs | User runs GSD, all agents complete, switches to "active only" view — cost panel goes blank | "Active only" filter applies to agent tree display only; cost and context metrics always show the most recent session totals |
| Time filter label "last 15 min" is ambiguous on a live dashboard | Is it "last 15 minutes of history" or "hide events older than 15 min"? | Label clearly: "Show history: last 15m | 1h | today | all" — makes clear this is a history window, not a live filter |
| Agent hierarchy shows only tool events — no indication of what each agent was asked to do | "Task agent abc123" tells the user nothing about what the agent is working on | Show the Task `description` field (forwarded from relay.py per the allowlist) as the agent's subtitle in the tree |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **relay.py tool_input extraction:** Verify the event POST body does NOT contain `content`, `new_str`, `new_content`, `old_str` fields — check with a Write tool call and inspect the server-received body in logs
- [ ] **Collapsible agent tree:** Verify that triggering 5 rapid tool call events does NOT collapse a manually-expanded node — test during an active GSD run
- [ ] **Context fill % per-agent:** Verify that a fresh subagent shows a context fill based on its own JSONL (not the parent's) — create a subagent, compare its reported % to what the parent session shows
- [ ] **Time filter on live dashboard:** Verify that events arriving during an active session are displayed regardless of the selected time filter — apply "last 5 min" filter, then trigger tool calls and confirm they appear
- [ ] **Layout overhaul:** Verify all working v1.0 features still function after grid/panel changes — run checklist: cost updates visible, tool log populates, agent tree updates, health panel refreshes
- [ ] **SSE event routing with new event types:** Verify new event types are processed exactly once — add `console.log` temporarily and confirm each new event type logs exactly one line per SSE message received
- [ ] **Stale agent current-tool display:** Verify that a completed agent shows no in-progress tool indicator — run a subagent to completion and confirm the tree row shows "completed" state with no tool label

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| relay.py forwards file content accidentally | HIGH — data in DB and SSE history | Immediately: revert relay.py to exclude the field; the DB events table has no GDPR delete path today — add a `DELETE FROM events WHERE ...` admin endpoint if this occurs |
| DOM thrash breaks collapsed state | LOW | Add debounce + external state tracking in a single JS change; no data loss |
| Context fill calculation incorrect | LOW | Fix formula in costEngine.js + clear and re-process JSONL files; no data loss |
| Time filter drops live events | LOW-MEDIUM | Move filter application from SSE handler to history load query; live events never filtered again |
| Layout overhaul breaks SSE wiring | MEDIUM | Revert HTML ID rename; re-grep all JS usages before retrying; 30-60min debug time |
| Double EventSource processing new event type | LOW | Add guard clause in the non-owning handler; test with console.log; 15min fix |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| relay.py sensitive field leakage | Tool log enrichment phase (relay.py changes) | Inspect POST body for Write tool call — confirm no `content` field present |
| relay.py crash on malformed tool_input | Tool log enrichment phase (relay.py changes) | Test relay.py directly with `echo '{"tool_input": null}' \| python3 relay.py` — confirm exits 0 silently |
| relay.py 500ms budget impact | Tool log enrichment phase | Time relay execution with large payload: `time echo '<500KB JSON>' \| python3 relay.py` |
| Context fill % discrepancy | Per-agent detail panel phase | Side-by-side comparison: ObservAgent % vs Claude Code statusline during same session |
| getContextFillPercent uses per-agent records | Per-agent detail panel phase | Subagent shows different context fill than parent session |
| DOM thrash on renderAgentTree | Agent tree redesign phase | Stress test: 5 events/sec for 30 seconds; confirm collapsed nodes stay collapsed |
| Two EventSource double-processing | SSE consolidation / new event type addition | console.log each event type; confirm each type fires exactly once per SSE message |
| Time filter drops live events | Time filter implementation phase | Apply filter; trigger tool call; confirm it appears in live log |
| Layout overhaul breaks SSE wiring | Dashboard reorganization phase | After CSS changes: trigger tool call, verify log row appears without page reload |
| Stale current-tool on agent completion | Agent tree live-update phase | Complete a subagent; verify tree row shows 'completed' state, no tool label |

---

## Sources

- **Direct codebase inspection — relay.py** (HIGH confidence): Confirmed current security boundary (no tool_input forwarded), all logic inside try block, 500ms timeout constant, silent fail guarantee
- **Direct codebase inspection — costEngine.js** (HIGH confidence): Confirmed getContextFillPercent uses lastRecord (per-call, not cumulative), formula includes inputTokens + cacheReadTokens + cacheWrite5m + cacheWrite1h but NOT outputTokens; output_tokens tracked separately for cost but not context fill
- **Direct codebase inspection — index.html** (HIGH confidence): Confirmed 12 renderAgentTree() call sites (grep count), two EventSource connections, IS_REPLAY guard pattern, no current time filter implementation
- **Direct codebase inspection — ingest.js** (HIGH confidence): Confirmed pendingCalls Map at module scope, SubagentStop handler clears agent state, setImmediate 202-before-write guarantee
- **Direct codebase inspection — sseClients.js** (HIGH confidence): Confirmed broadcast() iterates all clients synchronously, no per-event filtering
- **STATE.md accumulated decisions** (HIGH confidence): [01-02] confirms metadata-only relay security boundary; [v2.0] decision confirms selective tool_input fields planned; note confirms ~10% context discrepancy is an open issue

---
*Pitfalls research for: ObservAgent v2.0 Agent Intelligence — adding enriched tool logs, context calculation, agent tree redesign, dashboard reorganization, time filters to existing system*
*Researched: 2026-03-02*
