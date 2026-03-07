# Phase 11: Dashboard Overhaul + Filters - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganize the LiveDashboard to make the agent hierarchy the primary visual focus, emphasize active agents as front-and-center, add time-based filtering to the tool log with quick-filter buttons, implement session history filtering with time-based quick buttons, and expand the dashboard with an Insights tab showing cost breakdown and performance charts.

The HistoryPage will gain quick-filter time buttons for session discovery.

</domain>

<decisions>
## Implementation Decisions

### Agent Tree Prominence
- Agent tree should occupy ~35% of the dashboard width (wider than current ~30%, but balanced with log area)
- Agent tree is the primary focal point but log area still has good breathing room
- Existing w-56 layout will be adjusted — recommend flex-basis or specific percentage width

### Agent Sorting and Grouping
- Maintain session-based hierarchy (sessions contain agents)
- Within each session, agents are interleaved (not separated into active/inactive sections)
- Active agents are visually distinguished through color (existing green/yellow/red color coding)
- Idle agents receive reduced visual emphasis to show they're not currently running

### Active Agent Visual Emphasis
- Idle and completed agents are grouped in a separate collapsible "Inactive" section at the bottom of the agent tree
- This keeps active agents always visible and prominent without scrolling
- Active agents remain in full color (green) and are visually primary
- Collapsible section can be toggled, with state persisted to localStorage (following existing pattern)

### Time Filters for Tool Log
- Quick-filter buttons placed inline with existing session/agent filters in the agent tree sidebar (not in the log tab bar)
- Buttons: "Last 5min" / "Last 15min" / "Last 1hr" / "All"
- Filtering logic filters events by timestamp, live SSE events continue uninterrupted
- Filters stack with existing session/agent filters (time AND session/agent)

### Session History Filtering
- HistoryPage gains quick-filter buttons for date-based filtering: "Last 15min" / "Last 1hr" / "Last 24hr" / "All"
- Buttons calculate time range relative to current time and filter displayed sessions
- Consistent pattern with tool log time filters
- No date range picker — quick buttons only for simplicity and UX consistency

### Cost and Health Panel Strategy
- **Right sidebar:** Keep existing right sidebar (Cost above, Health below) as-is for quick reference during live sessions
- **New Insights tab:** Create a 4th tab alongside Log/Timeline: "Log" / "Timeline" / "Insights" / (existing tabs)
- Insights tab contains:
  - Cost breakdown (by model, session, agent)
  - Health statistics and status indicators
  - Charts/graphs showing cost trends and latency metrics (p50/p95) over time
  - More detailed analytics than the compact right sidebar
- The Insights tab expands dashboard observability beyond current static panels

### Claude's Discretion
- Exact pixel widths and Tailwind breakpoints for responsive behavior
- Specific chart library choice (Chart.js, Recharts, Plotly, etc.) and styling
- Inactive section collapse animation and transition timing
- Exact spacing and padding in the Insights tab layout
- Filter button styling and hover states

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **AgentTree component** (AgentTree.tsx): Already displays agents with state colors and collapse state in localStorage. Will be modified to add Inactive section and inline time filters.
- **ToolLog component** (ToolLog.tsx): Has session/agent filtering logic. Will add time-based filtering on top of existing filters.
- **useSessionFilter hook** (useSessionFilter.ts): Manages filter state. Will be extended for time filtering.
- **Badge and Card components** (ui/): Existing UI primitives can be reused for filter buttons and Insights layout.
- **useSSE hook** (useSSE.ts): Manages real-time updates. Will continue working with time filters (new events still arrive live).

### Established Patterns
- **State management via Zustand** (useObservStore): All state centralized. Filters will be added as store properties.
- **Tailwind CSS theming**: Color scheme established (green-400 for active, red-400 for errors, yellow-400 for idle). Insights charts will follow same palette.
- **localStorage for persistence**: Collapse state pattern already in use. Inactive section collapse state will use same approach.
- **Virtualization for performance** (@tanstack/react-virtual): ToolLog already uses this. Will scale to handle filtered results.
- **Filter composition**: Session + Agent filters already stack. Time filters will compose the same way.

### Integration Points
- **LiveDashboard.tsx**: Main entry point. Will be modified to use new tab system (Log/Timeline/Insights) and wider agent tree layout.
- **HistoryPage.tsx**: Will add time filter buttons above the session list, reusing filter logic pattern.
- **useObservStore**: Central store will gain new properties for time filter state (e.g., `timeFilterWindow`, `timeFilterValue`).
- **SSE updates**: Live events will respect time filters (won't show old events from beyond filter window).

</code_context>

<specifics>
## Specific Ideas

- The Inactive section at the bottom of the agent tree follows an "active-first" UX pattern, similar to how email clients prioritize unread messages.
- Time filter buttons should use consistent styling (maybe small rounded buttons, similar to existing session/agent filter UI patterns).
- The Insights tab should feel like an "observability dashboard" — visual, at-a-glance metrics. Think Grafana / DataDog aesthetic but simpler.
- Quick filter buttons should update results instantly (no "Apply" button) for snappy UX.

</specifics>

<deferred>
## Deferred Ideas

- Interactive alerts/anomaly detection based on cost spikes or error rates — future phase
- Custom time range picker (more flexible than quick buttons) — could enhance Phase 11 but not required
- Export Insights charts as PDF/image — future phase
- Agent performance comparison (comparing agents side-by-side in Insights) — future phase

</deferred>

---

*Phase: 11-dashboard-overhaul-filters*
*Context gathered: 2026-03-07*
