# Phase 2: Live Event Dashboard - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time tool call log — every Claude Code tool call appears live in the browser with call order, failure highlights, and per-call latency. The dashboard also shows placeholder panels for agent tree, cost meters, and health indicators (populated in later phases). Creating/replaying sessions, filtering history, and agent cost breakdown are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Tool call log display
- Each row shows: tool name + timestamp + duration (e.g. "Read — 12:04:01 — 342ms")
- Compact single-line rows — maximize events visible at once
- Auto-scroll to bottom as new events arrive; pause auto-scroll if user manually scrolls up
- Events grouped by agent with collapsible sections (not a flat stream)

### Error and failure visibility
- Failed tool call rows: red background or red left border — instantly scannable
- Toast notification fires when an error occurs (useful if user isn't watching the log)
- In-progress calls (PreToolUse fired, PostToolUse not yet received): subtle spinner or pulsing indicator on the row
- Error rows include a truncated error message inline, e.g. "Read — file not found — 0ms"

### Latency presentation
- Duration displayed at end of row in human-readable form: "342ms" or "1.2s"
- Color-coded by threshold:
  - Green: < 500ms
  - Yellow: 500ms – 2s
  - Red: > 2s
- In-progress calls show a live elapsed timer counting up (e.g. "1.2s…") that turns into the final duration on completion

### Dashboard layout and panels
- Grid layout with equal-weight panels — dashboard looks complete from day one
- All four panels present: Tool Call Log, Agent Tree, Cost Meters, Health Indicators
- Empty panels show: section title + "Available in Phase X" label (honest, sets expectations)
- Visual theme: dark, terminal-inspired — monospace font for tool names, dark background
  - Fits developer/CLI audience; consistent with the Claude Code environment

### Claude's Discretion
- Exact grid proportions and responsive breakpoints
- Specific monospace font choice
- Toast notification position and dismiss timing
- Spacing and padding within rows

</decisions>

<specifics>
## Specific Ideas

- The live elapsed timer on in-progress calls makes slow tools (Bash, WebFetch) immediately obvious without waiting for them to complete
- Collapsible agent sections should default open — collapsed state is for when the user wants to focus on one agent

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-live-event-dashboard*
*Context gathered: 2026-02-26*
