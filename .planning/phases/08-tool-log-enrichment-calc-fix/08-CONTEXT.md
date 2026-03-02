# Phase 8: Tool Log Enrichment + Calc Fix - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Tool call log rows display meaningful per-tool context — Bash shows the actual command, Read/Write/Edit show file path, Grep/Glob show the search pattern, Task shows description + subagent_type — instead of just the tool name. All Claude Code tools receive enrichment. The context window fill % discrepancy vs Claude Code is investigated and either fixed or documented with a tooltip.

</domain>

<decisions>
## Implementation Decisions

### Data extraction — relay.py allowlist

- **Default mode:** Extract named fields per tool type — relay.py builds a pre-formatted `tool_summary` string per tool
- **Per-tool extraction rules:**
  - Bash → `command: <value>` (truncated at 200 chars)
  - Read / Write / Edit → `file_path: <value>`
  - Grep → `pattern: <value>`
  - Glob → `pattern: <value>`
  - Task → `description: <value> | subagent_type: <value>`
  - WebFetch → `url: <value>`
  - WebSearch → `query: <value>`
  - TodoWrite → `subject: <first todo subject>`
  - All other Claude Code tools → extract whatever their most meaningful single field is
- **Format:** `param_name: value` (e.g., `file_path: /foo/bar.ts`) — not just the bare value
- **Opt-in full mode:** A toggle in the `observagent_config` table enables forwarding the full raw `tool_input` JSON instead of specific fields. Default is off.

### DB schema

- Add a single `tool_summary TEXT` column to the `events` table
- Use the existing `addColumnIfNotExists()` pattern — no data loss, NULL for old rows
- Include `tool_summary` in the `/api/events` endpoint response and CSV export on the history page

### Enrichment display — frontend

- **Main tool log:** Second line below the tool name — monospace font, muted/gray, smaller font size
- **Overflow:** Truncate with CSS ellipsis at row width; hovering the row reveals the full string via tooltip (title attribute or CSS tooltip)
- **Timeline view chips:** Enrichment shown as tooltip on hover (chip label stays tool name only — space is tight)

### Context window calc fix

- **Strategy:** Investigate the discrepancy by running ObservAgent alongside Claude Code and comparing the displayed % side-by-side during a live session
- **Source of truth:** Claude Code status bar display (visual comparison)
- **If fixable:** Update `getContextFillPercent()` in costEngine.js to match Claude Code's formula
- **If not fixable** (e.g., Claude Code applies internal scaling not exposed by the API): Add an info icon next to the % with tooltip: "ObservAgent calculates context fill from API token usage. Claude Code may apply internal scaling not exposed via the API."
- **Real-time updates:** Keep existing SSE behavior — `contextFillPct` updates on every `cost` event (already works)

### Claude's Discretion

- Which "most meaningful field" to extract for tools not explicitly listed above (AskUserQuestion, ExitPlanMode, NotebookEdit, MCP tools, etc.)
- Exact CSS implementation for the monospace muted second line (can reuse existing CSS variables)
- Whether the `observagent_config` toggle for full tool_input needs a UI control in Phase 8 or can be set via DB/API only

</decisions>

<specifics>
## Specific Ideas

- User wants enrichment for ALL Claude Code tools — not just the 7 originally scoped. Researcher should enumerate the full Claude Code tool schema.
- The full tool_input opt-in is primarily a debugging/inspection use case — not the default workflow

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `relay.py`: `main()` already parses `payload.get("tool_input", {})` is available but explicitly not forwarded — extend here to build `tool_summary` per tool type
- `db/schema.js`: `addColumnIfNotExists()` utility already exists — use it to add `tool_summary TEXT` column
- `routes/ingest.js`: `event` object construction (line ~37) is where `tool_summary` from relay should be mapped to the DB write
- `lib/costEngine.js`: `getContextFillPercent()` (line ~106) is the function to fix; `CONTEXT_WINDOWS` map (line ~17) defines model context sizes
- `public/index.html` line ~683: Tool name render logic — this is where the second-line enrichment display goes

### Established Patterns

- `observagent_config` table already used for budget thresholds and project name — toggle for full tool_input opt-in fits naturally here
- Relay sends a flat JSON object to `/ingest` — adding `tool_summary` as a new top-level field is consistent with existing relay-to-server shape
- CSS variables (`--muted`, `--fg`, monospace classes) already exist in index.html — use them for the enrichment line styling
- `addColumnIfNotExists()` is the established migration pattern — no ALTER TABLE IF NOT EXISTS needed

### Integration Points

- relay.py → `/ingest` route: new `tool_summary` field in the POST body
- `routes/ingest.js`: map `raw.tool_summary` to the event object and pass through to DB write
- `routes/api.js` `/api/events` query: add `tool_summary` to SELECT and response
- `public/history.html` CSV export: add `tool_summary` header and column
- `public/index.html` tool log row render + timeline chip tooltip: display `tool_summary`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-tool-log-enrichment-calc-fix*
*Context gathered: 2026-03-02*
