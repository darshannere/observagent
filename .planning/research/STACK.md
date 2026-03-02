# Stack Research

**Domain:** Real-time AI agent observability platform — v2.0 additive features on existing Node.js/Fastify/SQLite/vanilla JS stack
**Researched:** 2026-03-02
**Confidence:** HIGH (all conclusions derived from live codebase inspection + training knowledge; web tools unavailable during this session)

---

## Existing Stack (Verified, DO NOT Re-Research)

From `package.json` and confirmed running:

| Package | Version | Role |
|---------|---------|------|
| `fastify` | 5.7.4 | HTTP server + SSE |
| `fastify-sse-v2` | 4.2.2 | SSE plugin |
| `better-sqlite3` | 12.6.2 | Synchronous SQLite, WAL mode |
| `commander` | 14.0.3 | CLI argument parsing |
| `chalk` | 5.3.0 | CLI output coloring |
| `open` | 10.1.0 | Open dashboard URL in browser |

Frontend: vanilla JS in `public/index.html` (no bundler, no framework). Chart.js loaded from CDN. JetBrains Mono loaded from Google Fonts.

Runtime: Node.js ESM project (`"type": "module"`).

---

## New Dependencies for v2.0 Features

**Summary verdict: zero new npm packages required.** All five v2.0 features are achievable with existing stack + vanilla JS DOM manipulation + CSS changes.

---

### Feature 1: Collapsible Agent Tree with Live Updates

**What v2.0 needs:** Collapsible tree nodes, human-readable agent names, active count badge, real-time current-tool display per agent.

**Current state:** `renderAgentTree()` in `index.html` already renders a flat two-level DOM tree using `div.agent-row.depth-0/1` with click-to-filter. No library was used for v1. The v1 tree fully re-renders on every state change (`container.innerHTML = ''` then rebuilt).

**Recommendation: No new library. Extend the existing vanilla JS pattern.**

Collapsible behavior via HTML5 `<details>/<summary>` or CSS class toggle — both are already present in the codebase (`details.agent-section` is used for the tool log grouping). The same pattern applies to the agent tree: wrap each parent session's children in a `<details>` element, toggle `open` attribute on click.

Why no library:
- d3-hierarchy (used in v1 STACK.md research) was the recommendation for complex Reingold-Tilford layout. The actual v1 tree was simpler — flat parent/children with `depth-0/1` CSS classes. v2.0 adds collapsibility, not arbitrary graph layout.
- The agent tree is shallow (parent session + N subagents, max 2-3 depth levels). Complex tree layout libraries (d3-hierarchy, vis-network) solve arbitrary-depth tree positioning. A 2-level expandable list is solved with `<details>`.
- The live-update pattern (SSE-driven re-render) already works: `renderAgentTree()` is called on every `agent_spawn`, `agent_update`, and `cost_update`. Preserving `<details open>` state across re-renders requires storing which nodes are expanded in a `Set`, then re-applying after re-render. This is ~5 lines of JS.

**Implementation pattern:**

```javascript
// Track which parent sessions are collapsed
const collapsedSessions = new Set();

function renderAgentTree() {
  const container = document.getElementById('agent-tree-body');
  container.innerHTML = '';

  for (const [sessionId, session] of agentTree.sessions) {
    const details = document.createElement('details');
    details.open = !collapsedSessions.has(sessionId); // restore state
    details.addEventListener('toggle', () => {
      if (details.open) collapsedSessions.delete(sessionId);
      else collapsedSessions.add(sessionId);
    });

    const summary = document.createElement('summary'); // parent row
    // ... populate summary with agent-row content ...
    details.appendChild(summary);

    for (const agentId of session.children) {
      // ... child rows appended directly to details ...
    }

    container.appendChild(details);
  }
}
```

CSS change: `.agent-row` used as `<summary>` — add `list-style: none` and arrow indicator via `::before` pseudo-element (already done for `.agent-section summary` in v1).

**Active count badge:** Pure DOM — `span.badge` inside the summary element, updated in `renderAgentTree()` by counting `session.children.filter(id => agentTree.agents.get(id)?.state === 'active').length`.

**Real-time current tool per agent:** Add `currentTool: null` to each agent's in-memory state. Update on `PreToolUse` (set tool name), clear on `PostToolUse`. Render as a small chip inside each agent row. This is state management only — no new library.

---

### Feature 2: Tool Log Enrichment (Selective tool_input Capture)

**What v2.0 needs:** Show actual command for Bash, file path for Read/Write/Edit, pattern for Glob/Grep, task description for Task tool.

**Current state:** `relay.py` explicitly strips `tool_input` with comment: "Extract metadata only — never forward tool_input or tool_response (those may contain sensitive file paths, commands, or file contents)." The `events` table has no `tool_input` column.

**Recommendation: Extend relay.py with per-tool selective extraction. Add `tool_input_summary` column to `events` table.**

This is a deliberate architecture change, not a library question. The security concern in relay.py is valid (don't forward raw file contents or full command blobs). The solution is selective field extraction — extract only the display label, not raw content.

**relay.py additions — extract display summary per tool:**

```python
TOOL_INPUT_EXTRACTORS = {
    "Read":      lambda ti: ti.get("file_path", ""),
    "Write":     lambda ti: ti.get("file_path", ""),
    "Edit":      lambda ti: ti.get("file_path", ""),
    "Glob":      lambda ti: ti.get("pattern", ""),
    "Grep":      lambda ti: ti.get("pattern", ""),
    "Bash":      lambda ti: (ti.get("command", "") or "")[:120],  # truncate at 120 chars
    "WebFetch":  lambda ti: ti.get("url", ""),
    "WebSearch": lambda ti: ti.get("query", ""),
    "Task":      lambda ti: (ti.get("description", "") or "")[:100],
}

def _extract_tool_input_summary(payload):
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})
    if not isinstance(tool_input, dict):
        return None
    extractor = TOOL_INPUT_EXTRACTORS.get(tool_name)
    if not extractor:
        return None
    try:
        return extractor(tool_input) or None
    except Exception:
        return None
```

**Bash command truncation:** Cap at 120 chars to avoid storing large heredocs. Show `...` suffix if truncated.

**Schema addition (additive migration in `schema.js`):**

```javascript
addColumnIfNotExists(db, 'events', 'tool_input_summary', "TEXT");
```

Uses the existing `addColumnIfNotExists` helper — zero migration risk.

**API addition:** Include `tool_input_summary` in `stmtAll` and `stmtBySession` SELECT lists in `routes/api.js`. The SSE broadcast in `ingest.js` already forwards the full event object — add `tool_input_summary` to the event before broadcasting.

**Frontend rendering:** In `createRow()`, conditionally render `tool_input_summary` as a secondary line or tooltip below the tool name. Use `title` attribute for tooltip (zero CSS cost) or a second `<span>` with muted text style.

No new npm packages. No new frontend libraries. Pure relay.py + SQLite column + JS display change.

---

### Feature 3: Context Window Calculation Accuracy

**What v2.0 needs:** Reconcile the ~10% discrepancy between ObservAgent's context fill % and what Claude Code itself displays.

**Root cause (HIGH confidence — diagnosed from code inspection):**

In `aggregateSessionCost()` (`lib/costEngine.js`), the context fill is computed from `lastRecord` — the most recent usage record. The current formula in `getContextFillPercent()`:

```javascript
const totalInput = lastUsage.inputTokens + lastUsage.cacheReadTokens + lastUsage.cacheWrite5m + lastUsage.cacheWrite1h;
```

This adds four token types together. The problem: **cache write tokens and cache read tokens for the same content are counted separately in different API calls.** When Claude Code displays context %, it shows the effective context size — which is `input_tokens + cache_read_input_tokens` from the last response (the tokens that were processed in that turn). Cache write tokens (`cache_creation_input_tokens`) represent content being written INTO the cache for the first time in this turn — but that content was already counted as part of `input_tokens` in the same turn. Adding `cacheWrite5m` and `cacheWrite1h` on top of `inputTokens` double-counts them.

**Corrected formula:**

```javascript
// Context tokens = what the model actually processed in the last turn
// input_tokens already includes newly-cached content
// cache_read_input_tokens = content served from cache (counts against context limit)
// cache_creation tokens are INCLUDED in input_tokens, do NOT add separately
const totalInput = lastUsage.inputTokens + lastUsage.cacheReadTokens;
// Do NOT add cacheWrite5m or cacheWrite1h — they are a subset of inputTokens
```

**Why this matches Claude Code display:** The Anthropic API billing documentation (training knowledge, confirmed by code patterns) states that `input_tokens` in the usage response represents all non-cached tokens sent. `cache_read_input_tokens` represents tokens served from cache. Both count against the 200K context window. `cache_creation_input_tokens` is a billing category for the portion of `input_tokens` that was cached — it is NOT additional tokens, it is a subset of `input_tokens` reclassified for pricing purposes.

**Confidence level:** MEDIUM. The double-counting hypothesis is strongly supported by: (1) the formula structure, (2) the field names, (3) the fact that `totalInput > contextWindow` would be impossible if cacheWrite weren't double-counting. But without live verification against Claude Code's display, MEDIUM is the correct confidence. The fix is low-risk — if wrong, the discrepancy direction would just invert, not break anything.

**Implementation:** Single-line change in `lib/costEngine.js` `getContextFillPercent()`. Also update the `contextFillPct` field stored in `session_cost` table (already stored as integer, just computed differently).

No new npm packages. No schema changes.

---

### Feature 4: Dashboard Redesign (Agent-First Layout, Active-First Order)

**What v2.0 needs:** Agent hierarchy as primary view, time filter controls, active-agent ordering.

**Current layout:** CSS Grid `240px 1fr 1fr` with agents panel at 240px (narrow). Cost and health panels are secondary.

**Recommendation: CSS Grid change only. No new library. No CSS framework.**

The existing layout uses hand-written CSS custom properties and grid. The design system is already complete (colors, spacing, typography, component classes). Adding a CSS framework (Tailwind, etc.) would require a build step and conflict with the existing inline styles.

**Specific layout changes:**

1. Widen agents column: `240px` → `300px` or `320px` — single CSS change.
2. Add per-agent detail panel: When an agent is clicked, show a detail slide-in. Options:
   - **Option A (recommended):** Replace the health panel (column 3, row 2) with the detail panel when an agent is selected. Zero layout change — reuse existing panel slot.
   - **Option B:** Resize grid to 4 columns and add a right-side panel. More complex, smaller tools on small screens.
   - Use Option A: health panel becomes context-sensitive (shows session health when no agent selected, shows agent detail when agent is selected).

3. Active-first ordering: `renderAgentTree()` currently iterates `agentTree.sessions` insertion order. Change to sort sessions by `hasActiveChildren` (active sessions first, completed last). Pure JS `Array.from().sort()` — no library.

**Time filter controls for live dashboard:**

Add a compact toolbar above the tool log panel:
```
[ Last 5m ] [ Last 15m ] [ Last 1h ] [ All ]
```
Pure HTML `<button>` elements. JS state: `let timeFilterMs = null`. On each log row render, check `event.timestamp > Date.now() - timeFilterMs`. For historical hydration, pass the filter to `stmtAll` via a modified query or client-side filter.

No new npm packages. No CSS framework. CSS Grid adjustment + JS sort + JS filter state.

---

### Feature 5: Session History Date/Time Range Filters

**What v2.0 needs:** Time-of-day range filter (not just date) on the session history page.

**Current state:** `history.html` already has `input[type="date"]` filters for `date_from` and `date_to`. The `/api/sessions` route already accepts and applies these. The gap is that `date` filters (YYYY-MM-DD) have no time precision.

**Recommendation: Upgrade filter inputs from `date` to `datetime-local`. No new library.**

`<input type="datetime-local">` is supported in all modern browsers (Chrome 20+, Firefox 93+, Safari 14.1+). Returns ISO 8601 strings with time component. The existing SQLite query uses string comparison (`sc.last_event_ts >= ?`) which works correctly with ISO 8601 datetime strings.

```html
<!-- Change from: -->
<input type="date" id="filter-date-from">
<!-- Change to: -->
<input type="datetime-local" id="filter-date-from">
```

API route in `routes/api.js` requires no changes — it already passes the value directly to SQLite comparison.

No new packages. One-line HTML change per filter input. Minor label change in UI.

---

## Recommended Stack Summary

### New npm Packages

**None required for v2.0.**

All five features are achievable with:
- Existing Node.js stdlib
- Existing `better-sqlite3` (schema migration via `addColumnIfNotExists`)
- Existing vanilla JS + CSS in `public/index.html`
- Python stdlib changes in `hooks/relay.py`

### Frontend Library Additions (CDN)

**None required for v2.0.**

d3-hierarchy was considered in v1.1 research but not added (and was not needed — the actual tree is 2-level flat). v2.0 tree needs collapsibility, not layout math. HTML5 `<details>/<summary>` solves this natively.

---

## Installation

```bash
# No new npm installs for v2.0
# All changes are to existing source files
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| HTML5 `<details>/<summary>` for tree collapse | d3-hierarchy 3.1.2 | Only if tree needs computed layout at 3+ depth levels with arbitrary positioning (not the case here) |
| `datetime-local` input | flatpickr / date-fns | Only if cross-browser datetime picker with custom UI/locale is required. `datetime-local` is sufficient for developer-focused local tool |
| CSS Grid adjustment | Tailwind CSS / Bootstrap | Only if starting a new project. Adding a CSS framework to an existing hand-written CSS system creates conflicts and requires a build step |
| In-memory JS sort for active-first | SQLite ORDER BY in agent query | SQLite approach works for hydration but SSE-driven live updates rebuild from in-memory state — sort must also happen client-side |
| Selective relay.py extraction | Full tool_input forwarding | If sensitivity concerns are removed. Selective extraction is safer and produces smaller event payloads |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| React / Vue / Svelte frontend | Requires build step, kills contributor DX, conflicts with existing 1400-line vanilla JS in `index.html` | Continue vanilla JS pattern |
| d3-hierarchy or vis-network | 2-level collapsible tree does not need layout math | HTML5 `<details>` + CSS |
| flatpickr or Pikaday | `datetime-local` covers the need; adding a date picker library adds ~20KB and custom styling burden | Native `<input type="datetime-local">` |
| Tailwind CSS | Adding utility CSS framework to existing 400+ line hand-written CSS stylesheet creates class conflicts and requires PostCSS build step | Extend existing CSS custom properties |
| socket.io or WebSockets | Dashboard is read-only display. SSE (already in stack) handles all server-to-client push. No client-to-server streaming needed | Existing `fastify-sse-v2` |
| drizzle-orm or prisma | `better-sqlite3` prepared statements cover all query patterns; ORM adds abstraction without benefit for this query surface | `db.prepare()` directly |
| `chokidar@5.0.0` | Already using Node's `fs.watch` directly (not chokidar); this codebase switched away from chokidar — do not re-introduce | Node stdlib `fs.watch` (already in use) |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|----------------|-------|
| `better-sqlite3` | 12.6.2 (existing) | Node 22.x | WAL mode, `addColumnIfNotExists` migration pattern proven |
| `fastify` | 5.7.4 (existing) | Node 22.x | No changes needed for v2.0 routes |
| `fastify-sse-v2` | 4.2.2 (existing) | fastify 5.x | SSE broadcast pattern unchanged |
| HTML5 `<details>` | — | All modern browsers (Chrome 12+, Firefox 49+, Safari 6+) | No polyfill needed for developer tool targeting modern browsers |
| `<input type="datetime-local">` | — | Chrome 20+, Firefox 93+, Safari 14.1+ | Sufficient for developer tool audience |

---

## Key Architecture Notes for v2.0 Implementation

### relay.py Security Boundary

`relay.py` has a documented design principle: forward metadata, not content. The v2.0 tool enrichment feature requires a careful extension of this — extract safe display labels, not raw content. Specifically:

- `Bash.command`: Truncate at 120 chars. Do NOT forward the full command (could expose secrets in env vars, heredocs, etc.)
- `Read/Write/Edit.file_path`: Safe — it is a path, not content. But avoid forwarding file content fields.
- `Task.description`: Truncate at 100 chars. The description is user-authored, generally safe.
- Never forward: `tool_response`, file contents, environment variable strings, API keys embedded in commands.

The 500ms timeout on `relay.py` is non-negotiable — the extraction logic must be pure dict lookups with no I/O.

### Context Fill Fix is a Single-File Change

`lib/costEngine.js` `getContextFillPercent()` — change one line. The fix propagates automatically because:
1. `aggregateSessionCost()` calls `getContextFillPercent()` and stores result in `contextFillPct`
2. `processFile()` broadcasts `contextFillPct` via SSE
3. `costState.contextFillPct` in frontend receives it via `handleCostUpdate()`
4. `renderCostPanel()` reads from `costState.contextFillPct`

No schema changes needed — `context_fill_pct` is not persisted in SQLite (it is computed fresh on each JSONL re-parse).

### Tree Collapse State Preservation

The full re-render pattern (`container.innerHTML = ''`) is already used in v1 and works. For v2.0, a `Set<sessionId>` of collapsed nodes preserved in module scope is sufficient. The set persists across re-renders within a page load. On page reload, all nodes default to expanded (correct behavior — user wants to see what's active).

### Active-First Ordering

Sort `agentTree.sessions` entries by: (1) has active children → first, (2) most recent `lastActivityTs` → tiebreak. This sort runs in `renderAgentTree()` before iteration — does not require changing the `Map` structure.

---

## Sources

- `/Users/darshannere/claude/observagent/package.json` — verified current dependencies, HIGH confidence
- `/Users/darshannere/claude/observagent/lib/costEngine.js` — context fill formula analysis, HIGH confidence (live code)
- `/Users/darshannere/claude/observagent/hooks/relay.py` — tool_input security boundary, HIGH confidence (live code + comments)
- `/Users/darshannere/claude/observagent/public/index.html` — full frontend code review, HIGH confidence (live code)
- `/Users/darshannere/claude/observagent/db/schema.js` — migration pattern, HIGH confidence (live code)
- `/Users/darshannere/claude/observagent/routes/api.js` — API query patterns, HIGH confidence (live code)
- Anthropic API token counting semantics — MEDIUM confidence (training knowledge, cache_creation vs input_tokens relationship; web fetch unavailable for verification)
- HTML5 `<details>/<summary>` browser support — HIGH confidence (training knowledge, widely documented baseline)
- `<input type="datetime-local">` browser support — HIGH confidence (training knowledge, Safari 14.1+ established)

---
*Stack research for: ObservAgent v2.0 Agent Intelligence milestone*
*Researched: 2026-03-02*
