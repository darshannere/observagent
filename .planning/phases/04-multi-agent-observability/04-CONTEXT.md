# Phase 4: Multi-Agent Observability - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Visualize the live agent hierarchy for multi-agent workflows — showing a tree of parent/child agents, per-agent cost breakdown, and stuck-agent detection. Creating posts, search, and export are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Agent tree layout
- Indented list style (file-tree), not node-link graph or nested cards
- Lives in a left sidebar / dedicated panel — always visible alongside the live event log
- Agent label = subagent type when available (e.g. `gsd-executor`), fallback to session ID prefix (first 8 chars)
- New agent spawn: instant render with a subtle brief highlight to draw the eye — no slide animation

### Per-agent cost display
- Cost shown inline on each tree row (not tooltip, not separate panel)
- Show both tokens + dollars per agent row (e.g. `12.4k / $0.04`)
- Parent session row shows rolled-up total cost (sum of all child agents)
- Highest-cost agent gets a subtle visual accent (color tint or bold cost) to make the biggest spender obvious at a glance

### Stuck-agent UX
- Stuck = no tool activity for 60+ seconds
- Visual indicator: amber/yellow warning color on the row + warning icon (⚠️ or clock)
- Show elapsed idle time inline (e.g. `idle 1m 23s`) — not a countdown
- Auto-clears immediately when a new event arrives from that agent — no manual dismissal
- Stuck threshold (60s default) is configurable via URL param or .env only — not exposed in the dashboard UI

### Agent lifecycle states
- Three states: Active / Completed / Errored
- Active: normal appearance (green accent or default)
- Completed: stays in tree, visually dimmed — preserves full session history
- Errored: red accent + error icon (❌ or X) on the row
- Clicking an agent row filters the live event log to show only that agent's tool calls (cross-panel filter)

### Claude's Discretion
- Exact color values and icon choices for each state
- How the live log filter is cleared (click again to deselect, or a clear button)
- Token display format (e.g. `12.4k` vs `12,400`)

</decisions>

<specifics>
## Specific Ideas

- The sidebar should feel like VS Code's file explorer or Linear's project tree — persistent, readable, not distracting
- The stuck warning should feel like a CI check warning — amber, not alarming red (red is reserved for errors)

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-multi-agent-observability*
*Context gathered: 2026-02-26*
