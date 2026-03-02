# Phase 8: Tool Log Enrichment + Calc Fix - Research

**Researched:** 2026-03-02
**Domain:** Python hook enrichment, SQLite schema migration, vanilla JS DOM rendering, Anthropic token accounting
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Data extraction — relay.py allowlist**
- Default mode: Extract named fields per tool type — relay.py builds a pre-formatted `tool_summary` string per tool
- Per-tool extraction rules:
  - Bash → `command: <value>` (truncated at 200 chars)
  - Read / Write / Edit → `file_path: <value>`
  - Grep → `pattern: <value>`
  - Glob → `pattern: <value>`
  - Task → `description: <value> | subagent_type: <value>`
  - WebFetch → `url: <value>`
  - WebSearch → `query: <value>`
  - TodoWrite → `subject: <first todo subject>`
  - All other Claude Code tools → extract whatever their most meaningful single field is
- Format: `param_name: value` (e.g., `file_path: /foo/bar.ts`) — not just the bare value
- Opt-in full mode: A toggle in the `observagent_config` table enables forwarding the full raw `tool_input` JSON instead of specific fields. Default is off.

**DB schema**
- Add a single `tool_summary TEXT` column to the `events` table
- Use the existing `addColumnIfNotExists()` pattern — no data loss, NULL for old rows
- Include `tool_summary` in the `/api/events` endpoint response and CSV export on the history page

**Enrichment display — frontend**
- Main tool log: Second line below the tool name — monospace font, muted/gray, smaller font size
- Overflow: Truncate with CSS ellipsis at row width; hovering the row reveals the full string via tooltip (title attribute or CSS tooltip)
- Timeline view chips: Enrichment shown as tooltip on hover (chip label stays tool name only — space is tight)

**Context window calc fix**
- Strategy: Investigate the discrepancy by running ObservAgent alongside Claude Code and comparing the displayed % side-by-side during a live session
- Source of truth: Claude Code status bar display (visual comparison)
- If fixable: Update `getContextFillPercent()` in costEngine.js to match Claude Code's formula
- If not fixable (e.g., Claude Code applies internal scaling not exposed by the API): Add an info icon next to the % with tooltip: "ObservAgent calculates context fill from API token usage. Claude Code may apply internal scaling not exposed via the API."
- Real-time updates: Keep existing SSE behavior — `contextFillPct` updates on every `cost` event (already works)

### Claude's Discretion

- Which "most meaningful field" to extract for tools not explicitly listed above (AskUserQuestion, ExitPlanMode, NotebookEdit, MCP tools, etc.)
- Exact CSS implementation for the monospace muted second line (can reuse existing CSS variables)
- Whether the `observagent_config` toggle for full tool_input needs a UI control in Phase 8 or can be set via DB/API only

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TOOL-01 | Bash tool calls show the actual command string in the log row (truncated at 200 chars) | relay.py extracts `tool_input.command`, builds `tool_summary = "command: <val>"`, passes to ingest, stored in events.tool_summary, rendered as second line in index.html |
| TOOL-02 | Read, Write, and Edit tool calls show the file path in the log row | relay.py extracts `tool_input.file_path` for all three tools |
| TOOL-03 | Grep and Glob tool calls show the search pattern in the log row | relay.py extracts `tool_input.pattern` for both tools |
| TOOL-04 | Task tool calls show the task description and subagent_type in the log row | relay.py extracts `tool_input.description` and `tool_input.subagent_type`, concatenates with pipe separator |
| TOOL-05 | Each tool call log row shows input + output token counts from the corresponding API call | Requires per-API-call token storage — NOT covered by relay.py tool_summary; needs separate DB column or table; see Open Questions |
| CALC-01 | Context window fill % matches Claude Code's displayed values | `getContextFillPercent()` formula is mathematically correct per Anthropic docs; discrepancy likely from Claude Code's autocompact buffer reservation; fix is investigation + either formula update or tooltip |
</phase_requirements>

---

## Summary

Phase 8 has two independent work streams: Tool Log Enrichment (TOOL-01 through TOOL-05) and Context Window Calc Fix (CALC-01). The enrichment stream requires coordinated changes across five files in a specific order: relay.py builds the summary, ingest.js maps it into the event, schema.js adds the column, api.js exposes it, and frontend files render it. The calc fix requires live investigation first, then either a one-line formula change or a tooltip addition.

The core enrichment mechanic is well-understood. The `tool_input` dict is already available in relay.py's `main()` — the existing comment "explicitly not forwarded" was a security decision about full content, not about metadata fields. CONTEXT.md locks the allowlist approach: extract only `command`, `file_path`, `pattern`, `description`, `subagent_type`, `url`, `query`, and the first todo subject. This stays well within the project's security boundary.

TOOL-05 (per-row token counts) is the hardest requirement in the phase. Token data currently lives in `session_cost` as session aggregates, not per-tool-call. There is no mechanism to link a specific API call's token usage to a specific tool call. CONTEXT.md does not address how TOOL-05 should be implemented — this is a planning gap. The most pragmatic approach is a separate `api_calls` table keyed by timestamp window, matched to tool calls by proximity. See Open Questions.

**Primary recommendation:** Implement TOOL-01 through TOOL-04 as a single coordinated change (relay.py → ingest → schema → api → frontend). Scope TOOL-05 separately as it requires a new data pipeline. Implement CALC-01 with the investigation + tooltip approach since ObservAgent's formula is already mathematically correct per Anthropic docs.

---

## Standard Stack

### Core (no new dependencies)

This phase uses only existing project dependencies — no npm installs required.

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Python stdlib (json, sys) | Python 3.x | relay.py tool_summary extraction | Already in use; no pip required |
| better-sqlite3 | existing | `addColumnIfNotExists()` migration | WAL mode, synchronous API, already in schema.js |
| vanilla JS DOM API | existing | Second-line rendering in index.html | No framework; project is vanilla JS throughout |
| CSS `overflow: hidden; text-overflow: ellipsis` | N/A | Truncation of long tool_summary strings | Standard CSS; no library needed |
| HTML `title` attribute | N/A | Tooltip on hover for full string | Zero-dependency native browser tooltip |

### No New Dependencies

This phase requires zero new npm packages. All required capabilities exist in the current stack.

---

## Architecture Patterns

### Recommended Change Sequence

Changes must be applied in dependency order. The planner must create tasks in this wave structure:

```
Wave 1: DB schema migration
  └── schema.js: addColumnIfNotExists('events', 'tool_summary', 'TEXT')

Wave 2: relay.py enrichment extraction
  └── hooks/relay.py: build tool_summary per tool type in main()

Wave 3: Ingest route + API route
  ├── routes/ingest.js: map raw.tool_summary to event object
  └── routes/api.js: add tool_summary to SELECT + response

Wave 4: Frontend rendering
  ├── public/index.html: second line in createRow() + timeline chip tooltip
  └── public/history.html: CSV export column

Wave 5: CALC-01 investigation + fix
  └── lib/costEngine.js: getContextFillPercent() — fix or tooltip
```

### Pattern 1: relay.py Tool Summary Extraction

**What:** Switch statement in `main()` that reads `tool_input` dict and builds a `tool_summary` string based on `tool_name`.
**When to use:** On every PreToolUse event that has `tool_input`.
**Constraint:** NEVER extract `content`, `new_str`, `old_str`, `new_content` — these may contain secrets or file contents.

```python
# In relay.py main(), after parsing payload
tool_name = payload.get("tool_name", "")
tool_input = payload.get("tool_input", {})

def _build_tool_summary(tool_name, tool_input):
    """
    Builds a safe, pre-formatted summary string for a tool call.
    Only extracts metadata fields — never content, new_str, old_str, new_content.
    Returns None if no meaningful field is extractable.
    """
    if not isinstance(tool_input, dict):
        return None

    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if cmd:
            return "command: " + cmd[:200]

    elif tool_name in ("Read", "Write", "Edit", "MultiEdit"):
        path = tool_input.get("file_path", "")
        if path:
            return "file_path: " + path

    elif tool_name in ("Grep", "Glob"):
        pattern = tool_input.get("pattern", "")
        if pattern:
            return "pattern: " + pattern

    elif tool_name == "Task":
        desc = tool_input.get("description", "")
        sub = tool_input.get("subagent_type", "")
        parts = []
        if desc:
            parts.append("description: " + desc[:200])
        if sub:
            parts.append("subagent_type: " + sub)
        return " | ".join(parts) if parts else None

    elif tool_name == "WebFetch":
        url = tool_input.get("url", "")
        if url:
            return "url: " + url[:200]

    elif tool_name == "WebSearch":
        query = tool_input.get("query", "")
        if query:
            return "query: " + query[:200]

    elif tool_name == "TodoWrite":
        todos = tool_input.get("todos", [])
        if todos and isinstance(todos, list) and isinstance(todos[0], dict):
            subject = todos[0].get("content", todos[0].get("subject", ""))
            if subject:
                return "subject: " + subject[:200]

    elif tool_name in ("NotebookRead", "NotebookEdit"):
        path = tool_input.get("notebook_path", "")
        if path:
            return "notebook_path: " + path

    elif tool_name == "LS":
        path = tool_input.get("path", "")
        if path:
            return "path: " + path

    # MCP tools: mcp__server__tool pattern — try common fields
    elif tool_name.startswith("mcp__"):
        for key in ("query", "path", "url", "command", "name", "description"):
            val = tool_input.get(key, "")
            if val and isinstance(val, str):
                return key + ": " + str(val)[:200]

    return None
```

The `event` dict in `main()` receives a new field:
```python
event["tool_summary"] = _build_tool_summary(tool_name, tool_input)
# None is JSON-serialized as null — server handles null gracefully
```

### Pattern 2: DB Schema Migration

**What:** Add `tool_summary TEXT` column to events table using existing `addColumnIfNotExists()`.
**Constraint:** Must run before ingest route tries to write the column.

```javascript
// In db/schema.js initDb(), after existing addColumnIfNotExists calls:
addColumnIfNotExists(db, 'events', 'tool_summary', 'TEXT');
console.log('[db] tool_summary column ready');
```

### Pattern 3: Ingest Route Mapping

**What:** Map `raw.tool_summary` from relay POST body to the event object stored in DB.

```javascript
// In routes/ingest.js, extend the event object construction:
const event = {
  tool_name:    raw.tool_name    || '',
  hook_type:    raw.hook_type    || '',
  session_id:   raw.session_id   || '',
  tool_call_id: raw.tool_call_id || null,
  timestamp:    Date.now(),
  duration_ms:  null,
  exit_status:  raw.exit_status ?? null,
  tool_summary: raw.tool_summary || null,  // NEW
};
```

The writeQueue must also pass `tool_summary` to the INSERT statement. Check `lib/writeQueue.js` to verify the INSERT statement includes this new field.

### Pattern 4: WriteQueue INSERT Extension

The `WriteQueue` has its own prepared INSERT statement that must be updated:

```javascript
// In lib/writeQueue.js — the INSERT statement must add tool_summary:
// INSERT INTO events (tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status, tool_summary)
// VALUES (...)
```

This is a critical integration point — the planner must verify writeQueue.js is part of the change set.

### Pattern 5: API Route Extension

**What:** Add `tool_summary` to SELECT statements in api.js so frontend receives it.

```javascript
// Both stmtAll and stmtBySession prepared statements:
const stmtAll = db.prepare(
  `SELECT id, tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status, tool_summary
   FROM events
   ORDER BY timestamp DESC
   LIMIT 200`
);
const stmtBySession = db.prepare(
  `SELECT id, tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status, tool_summary
   FROM events
   WHERE session_id = ?
   ORDER BY timestamp ASC
   LIMIT 500`
);
```

Also update the export endpoint `stmtExportEvents` to include `tool_summary`.

### Pattern 6: Frontend Second-Line Rendering

**What:** In `createRow()` in index.html, add a second DOM element below `.tool-name` that shows `tool_summary`.
**Design:** `font-family: var(--mono)`, `color: var(--text-muted)`, `font-size: 10px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`, `width: 100%`.
**Tooltip:** Set `title` attribute on the summary element with the full untruncated string.

The `.log-row` currently uses `display: flex; gap: 8px; white-space: nowrap`. Adding a second line requires changing the row layout — the row must switch to a flex-column wrapper with a flex-row for the main content:

```javascript
// In createRow():
function createRow(event) {
  const row = document.createElement('div');
  row.className = 'log-row';
  // ...existing error/in-progress class logic...

  // Main content line (tool name, timestamp, duration)
  const mainLine = document.createElement('div');
  mainLine.className = 'log-row-main';
  // ...append toolEl, tsEl, durEl to mainLine...

  row.appendChild(mainLine);

  // Second line: tool_summary (only if present)
  if (event.tool_summary) {
    const summaryEl = document.createElement('div');
    summaryEl.className = 'tool-summary';
    summaryEl.textContent = event.tool_summary;
    summaryEl.title = event.tool_summary; // native tooltip
    row.appendChild(summaryEl);
  }

  return { row, durEl };
}
```

**CSS additions needed:**

```css
.log-row {
  /* Change from: display: flex; gap: 8px; white-space: nowrap; */
  display: flex;
  flex-direction: column;  /* CHANGED */
  gap: 2px;                /* CHANGED */
  /* Keep: border-radius, overflow: hidden, border-left */
}

.log-row-main {
  display: flex;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
}

.tool-summary {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 4px;
}
```

### Pattern 7: Timeline Chip Tooltip

**What:** In `_tlRowHtml()`, add `title` attribute to the chip element.

```javascript
// In _tlRowHtml():
const chipTitle = call.toolSummary ? ` title="${call.toolSummary.replace(/"/g, '&quot;')}"` : '';
const chip = `<span class="tl-tool-chip" ${chipTitle} style="background:${color}20;color:${color};border-color:${color}50">${call.toolName}</span>`;
```

The `timelineState.calls` array must store `toolSummary` from the event. Update `timelineAddPreToolUse()` to capture it:

```javascript
timelineState.calls.push({
  id:           ev.tool_call_id || (ev.session_id + ':' + startMs),
  toolName:     ev.tool_name,
  toolSummary:  ev.tool_summary || null,  // NEW
  agentLabel:   row.label,
  startMs,
  endMs:        null,
  isInProgress: true,
  isError:      false,
});
```

### Pattern 8: CSV Export Extension (history.html)

**What:** Add `tool_summary` column to CSV export headers and rows.

```javascript
// In history.html exportSession():
const headers = ['session_id', 'project_name', 'tool_name', 'timestamp', 'duration_ms', 'exit_status', 'tool_summary'];
const rows = events.map(e => [sessionId, project, e.tool_name, e.timestamp, e.duration_ms, e.exit_status, e.tool_summary || '']);
```

Note: `stmtExportEvents` in api.js also needs to include `tool_summary` in its SELECT.

### Pattern 9: CALC-01 Investigation Approach

**What:** Compare ObservAgent's context fill % with Claude Code's status bar % in a live session.
**Methodology:**

1. Start a Claude Code session with ObservAgent running
2. Note ObservAgent's displayed context % after several turns
3. Note Claude Code's status bar %
4. Calculate the delta

**Known hypothesis:** Claude Code reserves ~40-45K tokens as an autocompact buffer. When showing context fill, Claude Code may subtract this buffer from the effective window (200K - 45K = 155K effective), which would make ObservAgent's denominator too large (showing a LOWER %).

**Fix formula (if hypothesis confirmed):**

```javascript
// Current (mathematically correct vs Anthropic docs):
export function getContextFillPercent(model, lastUsage) {
  const totalInput = lastUsage.inputTokens + lastUsage.cacheReadTokens + lastUsage.cacheWrite5m + lastUsage.cacheWrite1h;
  const contextWindow = CONTEXT_WINDOWS[model] ?? CONTEXT_WINDOWS['_default'];
  return Math.min(100, Math.round((totalInput / contextWindow) * 100));
}

// If Claude Code uses effective window (200K minus autocompact buffer):
const AUTOCOMPACT_BUFFER = 40_000; // ~40K tokens reserved
export function getContextFillPercent(model, lastUsage) {
  const totalInput = lastUsage.inputTokens + lastUsage.cacheReadTokens + lastUsage.cacheWrite5m + lastUsage.cacheWrite1h;
  const contextWindow = CONTEXT_WINDOWS[model] ?? CONTEXT_WINDOWS['_default'];
  const effectiveWindow = contextWindow - AUTOCOMPACT_BUFFER;
  return Math.min(100, Math.round((totalInput / effectiveWindow) * 100));
}
```

**Tooltip approach (if not fixable):**

In index.html, add an info icon `ⓘ` next to the context fill % display with `title` attribute:
```html
<span id="ctx-pct">0%</span>
<span class="info-icon" title="ObservAgent calculates context fill from API token usage. Claude Code may apply internal scaling not exposed via the API.">ⓘ</span>
```

### Anti-Patterns to Avoid

- **Extracting `new_str`, `old_str`, `new_content`, `content` from tool_input:** These contain file contents and secrets — explicitly banned by the security boundary.
- **Changing relay.py to use stdout:** NEVER write to stdout or stderr — any output appears in Claude Code UI and violates the relay's constraint.
- **Non-zero exit from relay.py:** ALWAYS exit 0 — relay.py must be silent and non-blocking.
- **Modifying ingest.js without updating writeQueue.js:** The `event` object is passed to `writeQueue.enqueue(event)` which has its own prepared INSERT statement. Both must be updated together.
- **Changing `.log-row` from `flex` to `flex-direction: column` without wrapping the main line:** The existing `.tool-name`, `.ts`, `.duration` elements expect to be in a horizontal flex row — wrap them in `.log-row-main`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Safe tooltip on long strings | Custom JS tooltip library | HTML `title` attribute | Zero deps, native browser support, matches project philosophy |
| String truncation in CSS | JS substring logic | `text-overflow: ellipsis` | CSS handles it without JS; already used on `.tool-name` |
| DB migration safety | `ALTER TABLE IF NOT EXISTS` | `addColumnIfNotExists()` | Already exists in schema.js; handles the "column exists" case |
| JSON null handling in relay.py | Custom serialization | `json.dumps()` native null serialization | Python's `None` → JSON `null` natively; no special handling needed |

**Key insight:** This phase is entirely internal plumbing — no external service calls, no new algorithms. Every primitive needed already exists in the codebase. Follow existing patterns exactly.

---

## Common Pitfalls

### Pitfall 1: writeQueue.js Not Updated

**What goes wrong:** `tool_summary` is added to the `event` object in ingest.js but the INSERT statement in writeQueue.js doesn't include the new column — SQLite silently ignores the extra field and the column stays NULL for all rows.
**Why it happens:** writeQueue.js has its own prepared INSERT that's separate from the event object shape.
**How to avoid:** Update the INSERT statement in writeQueue.js in the same task as the ingest.js change.
**Warning signs:** tool_summary is always NULL in the DB even though relay.py sends it.

### Pitfall 2: relay.py Writes Null for PostToolUse Events

**What goes wrong:** `tool_input` is only available on PreToolUse events. PostToolUse events have `tool_response` instead. Building tool_summary from PostToolUse `tool_input` returns empty/null.
**Why it happens:** relay.py fires on both event types; `tool_input` may be absent on PostToolUse.
**How to avoid:** Only extract tool_summary when `hook_event_name == "PreToolUse"` OR always attempt extraction but gracefully handle empty/None dicts.
**Warning signs:** tool_summary shows on PreToolUse rows but is null on PostToolUse rows — this is actually EXPECTED and correct behavior; the PreToolUse row should carry the summary.

### Pitfall 3: CSS Layout Break on .log-row

**What goes wrong:** Changing `.log-row` to `flex-direction: column` without adding `.log-row-main` wrapper breaks the horizontal alignment of tool name, timestamp, and duration.
**Why it happens:** The children elements assume horizontal flex flow.
**How to avoid:** Introduce a `.log-row-main` wrapper div that inherits the horizontal flex layout. Keep `.tool-summary` as a sibling to `.log-row-main`.
**Warning signs:** Timestamp and duration appear on separate lines, broken layout.

### Pitfall 4: Tool Summary Appears on In-Progress Rows Incorrectly

**What goes wrong:** When a PostToolUse event updates an existing in-progress row, the tool_summary from PreToolUse should persist — not be overwritten to null by the PostToolUse update.
**Why it happens:** The `appendRow()` PostToolUse branch modifies `pending.row` in-place but doesn't touch the summary element, so it's fine — but if the code adds a `tool_summary` element in the PostToolUse branch, it would create a duplicate.
**How to avoid:** Only add the summary element in the PreToolUse branch of `appendRow()`. The PostToolUse branch only updates `durEl` and error state — never touches the summary element.

### Pitfall 5: TOOL-05 Requires a New Data Pipeline

**What goes wrong:** Attempting to link tool call rows to token counts without a per-call or per-message token storage mechanism. The current events table has tool call records; the session_cost table has aggregated session totals. There is no per-API-call token record.
**Why it happens:** Token data comes from JSONL files via `jsonlWatcher.js`, aggregated by `aggregateSessionCost()`. Individual API call token data is not stored.
**How to avoid:** See Open Questions — TOOL-05 needs explicit scoping decision before implementation.

### Pitfall 6: Bash Command Truncation at Wrong Point

**What goes wrong:** Truncating after `"command: "` prefix is added, resulting in the stored string being > 200 chars.
**Why it happens:** Truncating the raw command value to 200 chars and then prepending the label gives `"command: " + cmd[:200]` = up to 209 chars total.
**How to avoid:** Truncate the raw value to 200 chars. The stored `tool_summary` string may be up to ~215 chars including the longest label prefix — this is fine since CONTEXT.md specifies "command string truncated at 200 chars," referring to the command itself, not the full summary.

---

## Code Examples

### Complete Tool Field Map (Claude Code Tools)

Verified from official Claude Code hooks documentation (code.claude.com/docs/en/hooks) and Claude Code built-in tools reference:

| tool_name | Key tool_input Field(s) | Summary Format |
|-----------|------------------------|----------------|
| `Bash` | `command` (string) | `command: <value[:200]>` |
| `Read` | `file_path` (string) | `file_path: <value>` |
| `Write` | `file_path` (string) | `file_path: <value>` |
| `Edit` | `file_path` (string) | `file_path: <value>` |
| `MultiEdit` | `file_path` (string) | `file_path: <value>` |
| `Grep` | `pattern` (string) | `pattern: <value>` |
| `Glob` | `pattern` (string) | `pattern: <value>` |
| `Task` | `description` (string), `subagent_type` (string) | `description: <val[:200]> \| subagent_type: <val>` |
| `WebFetch` | `url` (string) | `url: <value[:200]>` |
| `WebSearch` | `query` (string) | `query: <value[:200]>` |
| `TodoWrite` | `todos[0].content` or `todos[0].subject` | `subject: <val[:200]>` |
| `NotebookRead` | `notebook_path` (string) | `notebook_path: <value>` |
| `NotebookEdit` | `notebook_path` (string) | `notebook_path: <value>` |
| `LS` | `path` (string, optional) | `path: <value>` |
| `exit_plan_mode` / `ExitPlanMode` | none useful | `null` (skip) |
| `TodoRead` | none useful (no input) | `null` (skip) |
| MCP tools (`mcp__*`) | Try: `query`, `path`, `url`, `command`, `name` in order | `<first_found_key>: <value[:200]>` |

### Anthropic Token Accounting (CALC-01 Context)

Verified from official Anthropic prompt caching docs (platform.claude.com/docs/en/docs/build-with-claude/prompt-caching):

```
# From Anthropic docs — these three fields are MUTUALLY EXCLUSIVE:
input_tokens         = tokens NOT in any cache (after last breakpoint)
cache_creation_input_tokens = tokens written to cache this request
cache_read_input_tokens     = tokens read from existing cache

# Total context window usage formula (per Anthropic docs):
total_input = input_tokens + cache_creation_input_tokens + cache_read_input_tokens

# ObservAgent's current formula (costEngine.js line 107) is EQUIVALENT:
totalInput = inputTokens + cacheReadTokens + cacheWrite5m + cacheWrite1h
# where: cacheWrite5m + cacheWrite1h = cache_creation_input_tokens (broken into 5m/1h TTL buckets)
```

**Conclusion:** ObservAgent's formula is mathematically correct. The ~10% discrepancy vs Claude Code is NOT a formula bug — it is likely Claude Code using a smaller effective denominator (full context window minus autocompact buffer ~40-45K tokens).

### relay.py Security Constraints (From Existing Code Comments)

```python
# From relay.py header — these are NON-NEGOTIABLE:
# NEVER write to stdout or stderr — any output appears in Claude Code UI
# ALWAYS exit with code 0 — non-zero exit can block or modify tool behavior
# 500ms timeout on HTTP POST — protects Claude session if server is hung
# No retries, no buffering — pure fire-and-forget
# Pure Python stdlib only — no pip install required
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| relay.py forwards ONLY metadata (tool_name, hook_type, session_id, tool_call_id, exit_status) | relay.py will also extract allowlisted tool_input fields to build tool_summary | Phase 8 (this phase) | Tool log rows show meaningful context |
| Events table has 7 columns | Events table will have 8 columns (+ tool_summary TEXT) | Phase 8 (this phase) | Backward compatible via addColumnIfNotExists |
| Context fill % shows raw API token / 200K | Context fill % either fixed to match Claude Code or documents the known difference | Phase 8 (this phase) | Accurate visual indicator for users |
| Tool log rows show only tool name | Tool log rows show tool name + one-line summary | Phase 8 (this phase) | Dramatically more actionable at a glance |

---

## Open Questions

1. **TOOL-05: How to implement per-tool-call token counts?**
   - What we know: Token data comes from JSONL files parsed by `jsonlWatcher.js`. Each assistant JSONL record has `usage.input_tokens`, `usage.output_tokens`, etc. Individual tool calls are linked by `tool_use_id` in the JSONL `content` blocks. Tool calls and API responses are interleaved in JSONL.
   - What's unclear: CONTEXT.md has no implementation decision for TOOL-05. The requirement says "input + output token counts from the corresponding API call" — this implies per-API-call data, not per-tool-call data. An API call may contain multiple tool use blocks.
   - Recommendation: **Scope TOOL-05 as a separate sub-task that requires a planning decision.** Options: (a) Add per-API-call storage to a new `api_calls` table with session_id, timestamp, input_tokens, output_tokens — then match to tool calls by timestamp proximity. (b) Show session-cumulative tokens on each row (simpler but less accurate). (c) Defer TOOL-05 to Phase 9 and flag it explicitly in the plan.

2. **ObservAgent's `observagent_config` toggle for full tool_input**
   - What we know: CONTEXT.md says to add a toggle in observagent_config. Claude's Discretion covers whether a UI control is needed in Phase 8.
   - What's unclear: If relay.py must read this toggle, it would require an HTTP call on every hook event — adding 500ms+ to the critical path. If the toggle controls only the server-side behavior (logging/exposing raw tool_input), then relay.py doesn't need to know about it and could always send tool_summary (the opt-in just changes what the server stores in DB).
   - Recommendation: **Implement the toggle as server-side only** — relay.py always sends `tool_summary` (safe metadata). A config key `full_tool_input_enabled` in observagent_config controls whether the server also logs the full raw body for debugging. No relay.py change needed for this toggle. No UI control in Phase 8 — set via API only.

3. **CALC-01: Confirming the autocompact buffer hypothesis**
   - What we know: Anthropic docs confirm `total_input = input_tokens + cache_read + cache_creation`. ObservAgent's formula IS this total divided by 200K. Claude Code shows ~10% higher.
   - What's unclear: Whether Claude Code uses `(200K - 40K) = 160K` as denominator, or whether it includes output tokens for the current turn, or some other calculation.
   - Recommendation: The CONTEXT.md "investigate live" strategy is correct. If the buffer hypothesis holds, the fix is `const effectiveWindow = contextWindow - 40_000` in `getContextFillPercent()`. If not reproducible or not fixable, add the tooltip. Either path is a small, safe change.

---

## Validation Architecture

> `workflow.nyquist_validation` is not present in `.planning/config.json` — no Validation Architecture section included.

---

## Sources

### Primary (HIGH confidence)
- Anthropic prompt caching docs (platform.claude.com/docs/en/docs/build-with-claude/prompt-caching) — confirmed `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` are mutually exclusive and additive; exact formula `total = input + cache_read + cache_creation`
- Claude Code hooks reference (code.claude.com/docs/en/hooks) — confirmed hook event schema, tool_input field names for each tool type
- ObservAgent source code (direct read): relay.py, schema.js, ingest.js, api.js, costEngine.js, jsonlWatcher.js, index.html, history.html — established patterns, integration points, CSS variables, existing security constraints

### Secondary (MEDIUM confidence)
- codelynx.dev/posts/calculate-claude-code-context — Claude Code context % formula: uses `input_tokens + cache_read + cache_creation` (matches Anthropic docs), does NOT include output tokens; confirmed autocompact buffer exists (~40-45K tokens)
- WebSearch (Claude Code tool list, 2025) — confirmed full tool list: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, Task, WebFetch, WebSearch, TodoRead, TodoWrite, NotebookRead, NotebookEdit, LS, exit_plan_mode

### Tertiary (LOW confidence)
- WebSearch summary on Claude Code context window internals — Claude Code reserves ~40-45K autocompact buffer affecting effective denominator; not verified against Claude Code source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; existing project patterns verified from source code
- Architecture patterns: HIGH — direct code inspection of all integration points; extract/store/display pipeline well-understood
- Pitfalls: HIGH — writeQueue.js integration point verified from source; CSS layout change is mechanical
- CALC-01 formula analysis: HIGH — Anthropic official docs confirm formula; discrepancy source MEDIUM (autocompact buffer hypothesis)
- TOOL-05 implementation: LOW — no implementation path in CONTEXT.md; requires planning decision

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable domain — Python stdlib, SQLite, vanilla JS patterns do not change rapidly)
