# Phase 13: Cost and Activity Charts - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Add four new time-series charts to the Insights panel, all backed by Phase 12 API endpoints:
1. Daily cost trend (7-day area chart) → `/api/insights/cost-daily`
2. Cost by agent type (bar chart) → `/api/insights/cost-by-agent`
3. Tool call activity per minute (area chart) → `/api/insights/activity`
4. Token burn rate per minute (area chart) → `/api/insights/tokens-over-time`

Organizing/restructuring the InsightsPanel with tabs is in-scope. Adding new API endpoints, new data models, or new SSE events is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Panel Layout
- Replace the flat scrollable InsightsPanel with a tabbed layout: **Cost | Activity | Health**
- Cost tab: daily cost trend + cost by agent + existing "Cost by Model" + existing "Cost by Session" charts
- Activity tab: tool call activity timeline + token burn rate charts
- Health tab: reserved as empty placeholder for Phase 14 (renders nothing or a "Coming soon" note)
- All charts use compact height: ~140px (matches existing 160px charts, keeps panel scannable)

### Existing Charts
- "Cost by Model" and "Cost by Session" bar charts move into the Cost tab — do not remove them
- They show live session data; the new API-backed charts show historical aggregates — both are useful together

### Session Selection (Activity Tab)
- Auto-select the latest active session from the SSE store — no dropdown needed
- Label shown in Activity tab header: "Session: {first 8 chars of session_id}"
- If no session is active yet: show empty state message — "No active session yet. Run an agent to see activity."

### Data Refresh Strategy
- **Cost tab charts**: fetch once on tab mount (lazy load), no auto-refresh — historical data doesn't change mid-session
- **Activity tab charts**: poll every 30 seconds while tab is visible — keeps near-live without firing on every SSE event
- Both tabs lazy-load: Cost data fetched when Cost tab first opened, Activity data fetched when Activity tab first opened

### Loading & Error States
- **Loading**: animated skeleton placeholder at chart height — prevents layout shift, matches modern dashboard feel
- **Error**: inline error message per chart with a retry link — "Failed to load — retry?" Each chart fails independently

### Claude's Discretion
- Exact skeleton animation style (CSS or library-provided)
- Tab component implementation (shadcn Tabs or custom)
- Specific color choices for area chart fills (should use existing green/blue palette from InsightsPanel)
- Gridline visibility and tick formatting details
- Health tab placeholder content ("Coming soon" or just empty)

</decisions>

<specifics>
## Specific Ideas

- Tab structure planned for Phase 14 handoff: Cost | Activity | Health — Health tab is stubbed but not implemented in Phase 13
- "Cost by Model" and "Cost by Session" are kept alongside the new charts, not replaced — they serve different purposes (live vs historical)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/insights/InsightsPanel.tsx`: The container to refactor — currently flat/scrollable, will become tabbed
- `recharts` (BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Bar): Already installed and used — AreaChart from recharts can be added without new dependencies
- `useObservStore`: SSE store — provides `costModels`, `sessionCosts`, `events` for existing charts; also the source for current `session_id`
- `TOOLTIP_STYLE` constant in InsightsPanel: Established tooltip style pattern — reuse for new charts

### Established Patterns
- Chart height: `style={{ height: 160 }}` with `<ResponsiveContainer width="100%" height="100%">` — use same pattern
- Tick style: `tick={{ fontSize: 9, fill: '#6b7280' }}` — consistent across all axes
- Cost formatter: `tickFormatter={(v: number) => \`$${v.toFixed(3)}\`}` — reuse for cost axes
- Empty state: `<p className="text-xs text-muted-foreground">No data yet</p>` — use same pattern for empty chart states
- Data fetching: HealthPanel uses `useEffect` + `fetch('/api/health')` directly — same approach for insights API calls

### Integration Points
- `routes/insights.js`: Phase 12 endpoints already built — `/api/insights/cost-daily`, `/api/insights/cost-by-agent`, `/api/insights/activity?session_id=X`, `/api/insights/tokens-over-time?session_id=X`
- Activity + tokens endpoints take `session_id` query param — get this from `useObservStore`
- `frontend/src/pages/LiveDashboard.tsx`: Renders InsightsPanel — no changes needed there, just the component itself refactors

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-cost-and-activity-charts*
*Context gathered: 2026-03-10*
