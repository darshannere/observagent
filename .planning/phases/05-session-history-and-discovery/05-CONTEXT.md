# Phase 5: Session History and Discovery - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Browse and search all past sessions — not just the live one. Session list organized by project, filterable by date/cost/model/error, with JSONL/CSV export per session. Creating posts, editing sessions, and bulk export are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Session List Layout
- Card-based layout (not table rows)
- Each card shows: project name, date/time, total cost, error indicator (compact)
- Default sort: most recent session first within each group
- Sessions grouped by project, sorted by date within each group
- Project groups are collapsible, collapsed by default
- Live (active) sessions appear at the top of their project group with a "LIVE" badge
- Clicking a LIVE badge navigates to the main real-time dashboard
- Page navigation: Claude decides (own route vs tab on existing dashboard)

### Filter UX
- Filters live in a top bar above the session list
- Filters apply live — results update instantly as filters change (no submit button)
- Prominently shown in top bar: date range picker + project name search
- Secondary filters (cost range, model, error presence) accessible via "More filters" or secondary row
- "Has errors" filter design: Claude decides simplest approach

### Session Detail / Drill-down
- Clicking a session card opens the existing live dashboard replaying that session's data
- Replay mode shows a banner at the top: "Viewing: [project] — [date]" + back-to-history button
- Export buttons are available in both the history list (on each card) and in the replay banner

### Export Behavior
- Export scope: single session only (the session you're viewing or selected)
- Format selection: two side-by-side buttons — "Export JSONL" and "Export CSV"
- Export content: summarized data — tool calls with cost, latency, errors (no raw event payloads)
- Filename format: `observagent_[project]_[YYYY-MM-DD].jsonl` (or `.csv`)

### Claude's Discretion
- Whether history lives on its own route (/history) or as a tab on the existing dashboard
- "Has errors" filter UI (toggle checkbox vs dropdown — pick simplest)
- Exact spacing, typography, card shadow/border styling
- How "More filters" secondary area is revealed (dropdown, chevron expand, etc.)
- Error handling and empty states for history and export

</decisions>

<specifics>
## Specific Ideas

- No specific UI references given — open to standard approaches
- The live dashboard should be reused for session replay (don't build a separate detail view)
- Filenames should be human-readable and sortable: `observagent_[project]_[YYYY-MM-DD]`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-session-history-and-discovery*
*Context gathered: 2026-02-26*
