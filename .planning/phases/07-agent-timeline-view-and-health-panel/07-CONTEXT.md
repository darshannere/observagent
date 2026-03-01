# Phase 7: Agent Timeline View and Health Panel - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Two visual dashboard additions that complete the original four-panel layout:
1. A Gantt-style swimlane timeline showing all tool calls across all agents over time
2. A live health panel replacing the "Coming soon" placeholder with real metrics

Alerting, thresholds configuration, and export are out of scope for this phase.

</domain>

<decisions>
## Implementation Decisions

### Timeline: Time Scale
- Auto-fit to session: x-axis spans from first event to now, always showing the full session
- No zoom or pan — auto-fit handles all cases for v1
- Time axis labels use relative time: +0s, +30s, +1m, +2m (session start is the anchor)
- Agent rows ordered by most-active on top (most tool calls = highest row); rows re-sort as new calls arrive

### Timeline: Bar Visual Design
- Color coded by tool type: Read=blue, Write=orange, Bash=purple, WebFetch/WebSearch=teal, Task=indigo, other=gray (exact shades Claude's discretion)
- Label on each bar: tool name only ("Read", "Bash", "Task") — no target text on the bar itself
- Errored tool calls: bar turns red regardless of tool type (error signal overrides type color)
- Hover tooltip shows four fields: tool name, target/input (truncated), duration, status (success/error)

### Timeline: Live-Update Behavior
- New tool call arrives → re-fit the entire x-axis to include all events; scale adjusts automatically
- In-progress calls (PreToolUse received, PostToolUse not yet): show as a pulsing/animated bar extending to "now"; bar freezes and becomes static when PostToolUse arrives
- New agent appears mid-session: insert row based on activity rank (re-sort all rows immediately)
- Empty state (no session): show message "No active session. Start using Claude Code to see activity."

### Health Panel: Visual Style
- Metric cards layout: each of the three metrics (Hook Status, Error Rate, Server Uptime) gets its own mini-card with a large primary value and a label beneath
- Three cards in a row within the Health panel body

### Health Panel: Hook Connection Status
- Determined by recency: "Active" if any event arrived in the last 60 seconds, "Inactive" otherwise
- Active → green card; Inactive → red card

### Health Panel: Error Rate
- Thresholds: green if <5%, yellow (warning) if ≥5%, red (critical) if ≥20%
- Calculated per current session (errors / total tool calls, PostToolUse events with error status)
- Shows as a percentage with one decimal: "2.4%"

### Health Panel: Server Uptime
- Always green — uptime is informational, not a health signal (user is on the page, server is clearly up)
- Shows as a human-readable duration: "14m 32s", "1h 03m"
- Calculated from server start time (already available from server process)

### Claude's Discretion
- Exact color hex values for tool-type bars
- Pulse animation style for in-progress bars (CSS animation details)
- Card border radius, shadow, padding within health panel
- Tooltip positioning and delay
- How to handle very short tool calls (bars narrower than their label)

</decisions>

<specifics>
## Specific Ideas

- The health panel metric cards should feel like mini dashboard widgets — large readable number, small label beneath, colored background or colored top border to signal status
- The pulsing in-progress bar is the key "live" signal on the timeline — it should be visually distinctive enough to notice without being distracting
- Tool type colors should be consistent with any existing color usage in the dashboard (e.g., error colors already in use)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-agent-timeline-view-and-health-panel*
*Context gathered: 2026-03-01*
