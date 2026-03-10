# Phase 14: Health and Latency Charts - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Populate the stubbed Health tab in InsightsPanel with three widgets:
1. Stalled agents list → `/api/insights/stalled-agents`
2. Error rate timeline chart → `/api/insights/error-rate?session_id=X`
3. Per-tool latency chart (p50/p95 grouped bars) → `/api/insights/latency-by-tool?session_id=X`

All three backend endpoints exist from Phase 12. No new API work needed. Tab scaffold (Cost | Activity | Health) already built in Phase 13 — this phase fills in the Health tab body only.

</domain>

<decisions>
## Implementation Decisions

### Spike Highlighting
- Anomalous spike = any bucket where error_count > 0 (any non-zero error count is a spike)
- Spike visualization: red dot rendered on the AreaChart line at spike buckets (custom dot via recharts dot prop)
- Y-axis shows error rate % (error_count / sample_count * 100), not raw count — normalises for busy vs quiet periods
- Session scope: auto-select latest active session (same pattern as Activity tab); if no session, show empty state

### Stalled Agents Display
- Format: compact card list — one card per stalled agent showing agent name, idle duration, and start time
- Tab label badge: dynamic — "Health (N)" when N > 0 stalled agents, plain "Health" when none
  - Badge updates in background even when not on Health tab (always-on poll for stalled-agents)
- Read-only: no dismiss/kill actions — users act in terminal or Claude Code, not here
- Empty state: "All agents healthy" with green tint — positive confirmation, not just blank

### Health Tab Layout
- All three widgets stacked vertically (consistent with Cost and Activity tabs)
- Widget order (top to bottom): Stalled Agents → Error Rate → Latency by Tool
  - Most urgent/actionable at top; latency is exploratory so it goes last
- Latency chart: grouped bars per tool type — p50 (green) and p95 (yellow) side-by-side per tool
- Existing Tool Call Latency stat boxes (p50/p95 aggregate) stay in Cost tab — they serve a different purpose (live session aggregate vs per-tool breakdown)

### Data Refresh Strategy
- All Health tab data polls every 30 seconds while Health tab is visible — one shared interval, consistent with Activity tab cadence
- **Exception:** stalled-agents also polls in the background (always-on, not just when Health tab visible) to keep the badge count accurate
- Session filter: auto-select `sessionCosts[0]?.session_id` as the active session — same as Activity tab
- If no session active: empty state per widget, no API calls made

### Loading & Error States
- Carried forward from Phase 13: `animate-pulse bg-muted` skeleton at chart height while loading
- Per-chart inline retry: "Failed to load — retry?" on error
- Each widget fails independently

### Claude's Discretion
- Exact badge styling (count badge component or parenthetical in tab label text)
- Green tint implementation for "All agents healthy" empty state
- Exact card layout for stalled agents (padding, divider, icon choices)
- Whether to show agent_type label on stalled agent cards if available

</decisions>

<specifics>
## Specific Ideas

- Background polling for stalled-agents (always-on) is specifically to support the tab badge — the badge is only useful if it reflects reality without requiring the user to open the Health tab
- Widget order rationale: stalled agents are "act now", error rate is "investigate trend", latency is "profile tools" — ordered by urgency

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/insights/InsightsPanel.tsx`: Health tab stub currently renders `<p className="text-xs text-muted-foreground">Health charts coming in next release.</p>` — this is the insertion point
- `useObservStore`: `sessionCosts[0]?.session_id` for auto-session selection (same as Activity tab pattern)
- `TOOLTIP_STYLE` constant: reuse for all new chart tooltips
- `recharts` (BarChart, Bar, AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend): all installed and imported

### Established Patterns
- 30s polling with `setInterval` + `clearInterval` in `useEffect` return — Activity tab pattern, replicate exactly
- `hasFetchedCost` ref pattern: for always-on stalled-agents polling, use a `setInterval` on mount (not tab-gated) and clear on unmount
- Tab badge: `TABS` array currently `['Cost', 'Activity', 'Health']` — needs to become dynamic for the stalled count badge; render tab label as `Health{stalledCount > 0 ? \` (${stalledCount})\` : ''}`
- Grouped BarChart: `<Bar dataKey="p50" fill="#4ade80" />` + `<Bar dataKey="p95" fill="#facc15" />` side-by-side — recharts groups automatically when multiple Bar children present
- Chart height: `style={{ height: 160 }}` with `<ResponsiveContainer width="100%" height="100%">` — use same for latency and error rate charts
- Tick style: `tick={{ fontSize: 9, fill: '#6b7280' }}` — consistent with all existing axes

### Integration Points
- `/api/insights/error-rate?session_id=X`: returns `[{ bucket_ts, error_count, sample_count }]` — compute rate % in frontend
- `/api/insights/stalled-agents`: returns list of stalled agents (no session filter — global) — poll always-on
- `/api/insights/latency-by-tool?session_id=X`: returns `[{ tool_name, p50_ms, p95_ms, sample_count }]` — map to grouped bar format

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-health-and-latency-charts*
*Context gathered: 2026-03-10*
