# Phase 7: Agent Timeline View and Health Panel - Research

**Researched:** 2026-03-01
**Domain:** Vanilla JS canvas-based Gantt timeline, CSS animation, SSE-driven live UI, Node.js server uptime
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Timeline: Time Scale**
- Auto-fit to session: x-axis spans from first event to now, always showing the full session
- No zoom or pan — auto-fit handles all cases for v1
- Time axis labels use relative time: +0s, +30s, +1m, +2m (session start is the anchor)
- Agent rows ordered by most-active on top (most tool calls = highest row); rows re-sort as new calls arrive

**Timeline: Bar Visual Design**
- Color coded by tool type: Read=blue, Write=orange, Bash=purple, WebFetch/WebSearch=teal, Task=indigo, other=gray (exact shades Claude's discretion)
- Label on each bar: tool name only ("Read", "Bash", "Task") — no target text on the bar itself
- Errored tool calls: bar turns red regardless of tool type (error signal overrides type color)
- Hover tooltip shows four fields: tool name, target/input (truncated), duration, status (success/error)

**Timeline: Live-Update Behavior**
- New tool call arrives → re-fit the entire x-axis to include all events; scale adjusts automatically
- In-progress calls (PreToolUse received, PostToolUse not yet): show as a pulsing/animated bar extending to "now"; bar freezes and becomes static when PostToolUse arrives
- New agent appears mid-session: insert row based on activity rank (re-sort all rows immediately)
- Empty state (no session): show message "No active session. Start using Claude Code to see activity."

**Health Panel: Visual Style**
- Metric cards layout: each of the three metrics (Hook Status, Error Rate, Server Uptime) gets its own mini-card with a large primary value and a label beneath
- Three cards in a row within the Health panel body

**Health Panel: Hook Connection Status**
- Determined by recency: "Active" if any event arrived in the last 60 seconds, "Inactive" otherwise
- Active → green card; Inactive → red card

**Health Panel: Error Rate**
- Thresholds: green if <5%, yellow (warning) if ≥5%, red (critical) if ≥20%
- Calculated per current session (errors / total tool calls, PostToolUse events with error status)
- Shows as a percentage with one decimal: "2.4%"

**Health Panel: Server Uptime**
- Always green — uptime is informational, not a health signal
- Shows as a human-readable duration: "14m 32s", "1h 03m"
- Calculated from server start time (already available from server process)

### Claude's Discretion
- Exact color hex values for tool-type bars
- Pulse animation style for in-progress bars (CSS animation details)
- Card border radius, shadow, padding within health panel
- Tooltip positioning and delay
- How to handle very short tool calls (bars narrower than their label)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-03 | Dashboard shows an agent timeline view (Gantt-style swimlanes) of tool calls across agents | Canvas 2D API swimlane pattern; tool-color map; in-progress pulsing animation; SSE-driven re-render loop |
| DASH-04 | Health panel shows hook connection status, session error rate, and server uptime — replacing the placeholder added in Phase 2 | process.uptime() for server uptime; last-event-timestamp for hook status; PostToolUse error ratio for error rate; /api/health endpoint pattern; setInterval polling |
</phase_requirements>

---

## Summary

Phase 7 completes the original four-panel dashboard design by adding two panels that were left as placeholders. Both panels are pure frontend additions — no new database tables are required. The timeline (DASH-03) is the dominant engineering challenge; the health panel (DASH-04) is straightforward.

The timeline is a custom Gantt-style swimlane chart built with the **HTML5 Canvas 2D API** directly in `public/index.html`. This project already uses zero external JS libraries in the frontend (all existing panels are hand-rolled vanilla JS) and the Canvas API is the right tool: it gives pixel-precise control over bar placement, text clipping, and redraws, with no dependency risk. The entire canvas must be redrawn on every new event because the x-axis scale auto-fits to the session span — partial updates are not possible when the coordinate system shifts.

The health panel (DASH-04) needs one new API endpoint (`/api/health`) that returns hook recency timestamp, error rate for the current session, and server start time. The frontend polls this endpoint every 5 seconds and renders three metric cards. Server uptime is derived from `process.uptime()` (built into Node.js, no library needed). Hook status and error rate are computed from data already in the `events` table. The health panel replaces the "Coming soon" placeholder div added in Phase 2.

**Primary recommendation:** Implement the timeline as a `<canvas>` element with a full-redraw render function triggered by SSE events and a `requestAnimationFrame` loop for in-progress bar animation. Implement the health panel as three CSS metric cards backed by a `/api/health` polling endpoint.

---

## Standard Stack

### Core (no new dependencies)
| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| HTML5 Canvas 2D API | Browser built-in | Draw swimlane bars, labels, axis | Zero dependency; pixel-precise control; full-redraw on scale change is trivial |
| CSS `@keyframes` | Browser built-in | Pulsing animation for in-progress bars | Already used in this codebase (`.in-progress .duration` pulse at line 130–132 of index.html) |
| `process.uptime()` | Node.js built-in | Server uptime seconds | Zero dependency; returns float seconds since process start |
| `setInterval` | Browser built-in | Health panel 5s polling | Already used in this codebase for stuck-agent detection |
| `requestAnimationFrame` | Browser built-in | In-progress bar animation loop | Correct API for smooth animation; avoids setInterval drift on canvas redraws |

### No New npm Dependencies
This phase adds zero npm packages. The entire implementation is:
- One new API route (`/api/health`) added to `routes/api.js`
- One new server start time constant in `server.js`
- New HTML/CSS/JS blocks in `public/index.html`

---

## Architecture Patterns

### Recommended File Changes
```
routes/
└── api.js          # Add stmtHealth prepared stmt + GET /api/health route

server.js           # Export SERVER_START_MS = Date.now() before fastify.listen()
                    # Pass SERVER_START_MS to apiRoutes via options

public/
└── index.html      # Replace health placeholder div
                    # Add <canvas id="timeline-canvas"> in a new panel
                    # Add CSS for health cards, timeline panel, tooltip, pulse animation
                    # Add JS: timelineState, renderTimeline(), health polling
```

The dashboard grid is currently:
```
col 1 (240px)    col 2 (1fr)      col 3 (1fr)
[agents          [tool log         [cost panel     row 1]
 spans 1/-1]      spans 1/-1]      ]
                                  [health panel   row 2]
```

Phase 7 replaces the health placeholder panel (col 3 row 2) with a live health panel. The timeline panel is a NEW panel. Because both columns 1 and 2 already span full height, the only available space for the timeline is:
- Option A: **Replace the tool log panel** with a tabbed view (Tool Log | Timeline) — single panel, two tabs
- Option B: **Change the grid** to add a row 3 below the health panel spanning columns 2+3

Option A (tabbed) is strongly preferred: it requires no grid changes, keeps the layout stable, and matches how developer tools (Chrome DevTools, etc.) handle this — a tab strip above the panel body. The CONTEXT.md does not lock the layout approach, making this Claude's discretion.

### Pattern 1: Canvas Swimlane Full-Redraw

**What:** On every state change, clear the entire canvas and redraw all bars from scratch.

**When to use:** Required because the x-axis scale auto-fits to the full session span. When a new event arrives that extends the session, all previously drawn bars shift left. Incremental drawing is impossible when the coordinate system changes.

**Example:**
```javascript
// Source: HTML5 Canvas 2D API (MDN Web Docs)
function renderTimeline() {
  const canvas = document.getElementById('timeline-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (timelineState.events.length === 0) {
    ctx.fillStyle = '#8b949e'; // var(--text-muted)
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No active session. Start using Claude Code to see activity.', W / 2, H / 2);
    return;
  }

  const sessionStart = timelineState.sessionStart; // ms timestamp of first event
  const sessionEnd   = Math.max(Date.now(), timelineState.latestTs); // auto-fit to now
  const totalMs      = sessionEnd - sessionStart || 1;

  const HEADER_H    = 24;  // time axis labels row height
  const ROW_H       = 28;  // height per agent swimlane
  const BAR_H       = 18;  // bar height within each row
  const BAR_MARGIN  = (ROW_H - BAR_H) / 2;
  const LABEL_W     = 100; // left column for agent name labels

  // Map agent_id -> row index (sorted by tool call count, descending)
  const rowOrder = [...timelineState.agentRows.entries()]
    .sort((a, b) => b[1].toolCount - a[1].toolCount)
    .map(([agentId]) => agentId);

  // Draw time axis
  ctx.fillStyle = '#8b949e';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  const tickCount = 6;
  for (let i = 0; i <= tickCount; i++) {
    const frac = i / tickCount;
    const xPx = LABEL_W + frac * (W - LABEL_W);
    const tMs  = frac * totalMs;
    const label = formatRelativeTime(tMs);
    ctx.fillText(label, xPx, HEADER_H - 4);
  }

  // Draw swimlane rows
  rowOrder.forEach((agentId, rowIdx) => {
    const y = HEADER_H + rowIdx * ROW_H;
    const agentData = timelineState.agentRows.get(agentId);

    // Row background (alternating subtle stripe)
    ctx.fillStyle = rowIdx % 2 === 0 ? '#161b22' : '#0d1117';
    ctx.fillRect(0, y, W, ROW_H);

    // Agent label
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(agentData.label, 4, y + ROW_H / 2 + 4);

    // Tool call bars
    for (const bar of agentData.bars) {
      const x0 = LABEL_W + ((bar.startMs - sessionStart) / totalMs) * (W - LABEL_W);
      const endMs = bar.endMs ?? Date.now(); // in-progress: extend to now
      const x1 = LABEL_W + ((endMs - sessionStart) / totalMs) * (W - LABEL_W);
      const barW = Math.max(x1 - x0, 2); // minimum 2px so very fast calls are visible

      ctx.fillStyle = bar.isInProgress ? getToolColor(bar.toolName) : (bar.isError ? '#f85149' : getToolColor(bar.toolName));
      ctx.fillRect(x0, y + BAR_MARGIN, barW, BAR_H);

      // Label: only if bar is wide enough (>30px)
      if (barW > 30) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        // Clip text to bar bounds
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 2, y + BAR_MARGIN, barW - 4, BAR_H);
        ctx.clip();
        ctx.fillText(bar.toolName, x0 + 4, y + BAR_MARGIN + BAR_H - 5);
        ctx.restore();
      }
    }
  });

  canvas.dataset.needsRedraw = 'false';
}
```

### Pattern 2: In-Progress Bar Animation Loop

**What:** Use `requestAnimationFrame` for a render loop that continuously redraws the canvas while in-progress calls exist, making their bars visually grow to the right in real time.

**When to use:** Required for the "pulsing bar extending to now" behavior for PreToolUse events awaiting PostToolUse.

**Example:**
```javascript
// Source: MDN Web Docs - requestAnimationFrame
let animFrameId = null;

function startAnimationLoop() {
  if (animFrameId !== null) return; // already running
  function loop() {
    if (timelineState.inProgressCount > 0) {
      renderTimeline();
      animFrameId = requestAnimationFrame(loop);
    } else {
      // No in-progress calls — stop the loop, do one final render
      renderTimeline();
      animFrameId = null;
    }
  }
  animFrameId = requestAnimationFrame(loop);
}

function stopAnimationLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}
```

### Pattern 3: CSS Pulse for In-Progress Bar Overlay

**What:** CSS `@keyframes` opacity pulse applied to an overlay `<div>` on top of the canvas, showing when any in-progress call is active. The canvas bars themselves extend in real-time via `requestAnimationFrame`. The CSS pulse adds a visual "alive" signal without requiring canvas knowledge.

**When to use:** Optional supplement to the rAF loop. Can also be used directly on canvas via alpha oscillation.

**Example (canvas alpha approach — no extra DOM element):**
```javascript
// Inside renderTimeline() for in-progress bars
if (bar.isInProgress) {
  // Oscillate alpha: sin wave between 0.55 and 1.0 for a breathing effect
  const phase = (Date.now() % 1200) / 1200; // 0..1 over 1.2s cycle
  const alpha = 0.55 + 0.45 * Math.abs(Math.sin(phase * Math.PI));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = getToolColor(bar.toolName);
  ctx.fillRect(x0, y + BAR_MARGIN, barW, BAR_H);
  ctx.globalAlpha = 1.0;
} else {
  ctx.fillStyle = bar.isError ? '#f85149' : getToolColor(bar.toolName);
  ctx.fillRect(x0, y + BAR_MARGIN, barW, BAR_H);
}
```

### Pattern 4: Canvas Tooltip via `mousemove`

**What:** Track mouse position on `mousemove`, detect which bar is under cursor, show a floating `<div>` tooltip positioned to mouse coordinates.

**When to use:** Required for the four-field hover tooltip (tool name, target, duration, status).

**Example:**
```javascript
// Source: MDN Web Docs - Canvas API mouse events
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hit = hitTest(mx, my); // returns bar data or null
  if (hit) {
    showTimelineTooltip(e.clientX, e.clientY, hit);
  } else {
    hideTimelineTooltip();
  }
});

canvas.addEventListener('mouseleave', hideTimelineTooltip);

function showTimelineTooltip(x, y, bar) {
  const tip = document.getElementById('timeline-tooltip');
  tip.style.display = 'block';
  tip.style.left = (x + 12) + 'px';
  tip.style.top  = (y + 8) + 'px';
  const status = bar.isError ? 'error' : bar.isInProgress ? 'in progress' : 'success';
  const dur = bar.endMs ? formatDuration(bar.endMs - bar.startMs) : '…';
  tip.innerHTML = `
    <div class="tip-tool">${bar.toolName}</div>
    <div class="tip-target">${(bar.target || '').slice(0, 60) || '—'}</div>
    <div class="tip-dur">${dur}</div>
    <div class="tip-status tip-${status}">${status}</div>
  `;
}
```

### Pattern 5: Health Panel Polling

**What:** `setInterval` at 5000ms calls `/api/health`, updates three metric card DOM elements.

**When to use:** Required — health panel metrics are not emitted via SSE, they are computed server-side on demand. Polling is simpler and correct for three low-frequency metrics.

**Example:**
```javascript
// Server: routes/api.js
const stmtLastEventTs = db.prepare(`SELECT MAX(timestamp) AS ts FROM events`);
const stmtErrorRate = db.prepare(`
  SELECT
    SUM(CASE WHEN exit_status IS NOT NULL AND exit_status != 0 THEN 1 ELSE 0 END) AS errors,
    COUNT(*) AS total
  FROM events
  WHERE session_id = (SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1)
    AND hook_type = 'PostToolUse'
`);

fastify.get('/api/health', (request, reply) => {
  const lastTs  = stmtLastEventTs.get()?.ts || null;
  const errRow  = stmtErrorRate.get();
  const errors  = errRow?.errors || 0;
  const total   = errRow?.total  || 0;
  reply.send({
    lastEventTs:  lastTs,
    errorRate:    total > 0 ? (errors / total) * 100 : 0,
    serverUptimeS: process.uptime(),         // float seconds
    serverStartMs: options.serverStartMs,    // epoch ms passed via options
  });
});

// Client: poll every 5 seconds
setInterval(async () => {
  try {
    const h = await fetch('/api/health').then(r => r.json());
    updateHealthPanel(h);
  } catch (e) { /* silent — server may be restarting */ }
}, 5000);
```

### Pattern 6: Server Start Time Propagation

**What:** Record `SERVER_START_MS = Date.now()` in `server.js` before `fastify.listen()`, pass it to `apiRoutes` via options, use `process.uptime()` in the health endpoint.

**Why `process.uptime()` not `Date.now() - SERVER_START_MS`:** `process.uptime()` is the authoritative Node.js process uptime counter, monotonic and not affected by system clock changes. Both approaches work; `process.uptime()` is idiomatic.

**Example:**
```javascript
// server.js — before fastify.listen()
const SERVER_START_MS = Date.now();

fastify.register(apiRoutes, { db, serverStartMs: SERVER_START_MS });

// In /api/health handler:
const uptimeSec = process.uptime(); // float, e.g. 847.3
// Format: "14m 32s", "1h 03m"
function formatUptime(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}
```

### Pattern 7: Canvas ResizeObserver for Responsive Width

**What:** Observe the canvas container's width, resize the canvas when the panel changes size, and trigger a re-render.

**Why needed:** The dashboard uses CSS grid with `1fr` columns. Canvas `width` attribute must be set in pixels (not CSS percentages) or bars will be stretched/blurry. ResizeObserver is the correct, performant API.

**Example:**
```javascript
// Source: MDN Web Docs - ResizeObserver
const timelineContainer = document.getElementById('timeline-panel-body');
const canvas = document.getElementById('timeline-canvas');
const ro = new ResizeObserver(entries => {
  for (const entry of entries) {
    canvas.width  = entry.contentRect.width;
    canvas.height = entry.contentRect.height;
    renderTimeline();
  }
});
ro.observe(timelineContainer);
```

### Anti-Patterns to Avoid

- **Partial canvas updates:** Do not attempt to redraw only the new bar. When the x-axis scale auto-fits, all bars must shift. Always `clearRect` the full canvas then redraw.
- **Using CSS width/height on canvas:** Sets display size but not drawing buffer size. Always set `canvas.width` and `canvas.height` as pixel integers. CSS scaling causes blurry text and bars.
- **Third-party chart library for the timeline:** The project has zero npm frontend dependencies. Adding Chart.js, D3, or similar would bring bundle size, API churn risk, and customization friction for a feature that is 150 lines of canvas code.
- **Deriving hook status from agent_nodes table:** The `agent_nodes` table tracks agent lifecycle, not hook connectivity. Hook connectivity is evidenced by recent events in the `events` table.
- **Polling health metrics via a new SSE event type:** Unnecessary — these three metrics change at most every few seconds and polling at 5s is responsive enough. Adding SSE events for health would complicate the broadcast path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip positioning near viewport edge | Custom edge-clamping tooltip library | 12px offset from cursor + CSS `max-width` + `white-space: nowrap` | Simple cursor offset is sufficient; edge detection is 3 lines of max() math |
| Human-readable duration format | moment.js or date-fns | Inline `formatUptime()` function (5 lines) | Zero dependency; the format is fixed ("14m 32s") — no locale or i18n needed |
| Canvas scaling for HiDPI (Retina) | Custom pixel ratio logic | `devicePixelRatio` scaling (4 lines) | Built into browser, prevents blurry canvas on Retina displays |

**Key insight:** The entire timeline and health panel implementation uses only browser-native APIs. No new npm packages. The value is in the product logic, not the library selection.

---

## Common Pitfalls

### Pitfall 1: Canvas Blurry on Retina Displays

**What goes wrong:** Canvas looks blurry/pixelated on MacBook/HiDPI screens.
**Why it happens:** Canvas `width`/`height` attributes set the drawing buffer in CSS pixels. On 2x displays, CSS pixels are 2 physical pixels, so the buffer is half the physical resolution.
**How to avoid:** Multiply canvas dimensions by `devicePixelRatio` and scale the context:
```javascript
const dpr = window.devicePixelRatio || 1;
canvas.width  = containerWidth  * dpr;
canvas.height = containerHeight * dpr;
canvas.style.width  = containerWidth  + 'px';
canvas.style.height = containerHeight + 'px';
ctx.scale(dpr, dpr);
```
**Warning signs:** Text on canvas looks fuzzy in Chrome DevTools screenshot.

### Pitfall 2: In-Progress rAF Loop Runs Forever

**What goes wrong:** `requestAnimationFrame` loop starts when first PreToolUse arrives but never stops, running at 60fps forever even when no in-progress calls exist.
**Why it happens:** Forgetting to check `inProgressCount === 0` as the loop exit condition.
**How to avoid:** Maintain a counter `timelineState.inProgressCount`. Increment on PreToolUse, decrement on PostToolUse. The rAF loop checks this counter and cancels itself when it reaches zero.
**Warning signs:** CPU fan spins up after 10 minutes of idle dashboard viewing.

### Pitfall 3: Canvas Width Set to Zero Before Container Renders

**What goes wrong:** ResizeObserver fires before CSS grid assigns the panel its width, resulting in `canvas.width = 0` and a blank panel.
**Why it happens:** ResizeObserver can fire during the first layout pass when `contentRect.width` is still 0.
**How to avoid:** Guard the resize handler: `if (entry.contentRect.width === 0) return;`
**Warning signs:** Timeline panel is blank after page load; appears on first paint only.

### Pitfall 4: Timeline State Not Cleared on Session Change

**What goes wrong:** When user navigates from one session replay to another, old timeline bars persist under the new session's bars.
**Why it happens:** `timelineState.agentRows` and `timelineState.events` are module-scope state that is never reset.
**How to avoid:** On `hydrate()` (which runs on page load), call `resetTimelineState()` before populating from `/api/events`. For live mode, state accumulates correctly from page load.
**Warning signs:** Timeline shows bars from a previous session when loading a replay URL.

### Pitfall 5: Health Panel Error Rate Uses Wrong Session

**What goes wrong:** Error rate shows 0% even when there are errors, because the SQL query targets the wrong session.
**Why it happens:** The `/api/health` endpoint must target the most recently active session (same session the cost panel is showing). Using a naive `GROUP BY session_id` without a recency filter returns the wrong session.
**How to avoid:** The SQL subquery for error rate must first identify the most recently active session_id using `ORDER BY timestamp DESC LIMIT 1`, then count errors within that session.
**Warning signs:** Error rate is always 0 even after running a bash command that fails.

### Pitfall 6: `process.uptime()` Not Available in API Route Options

**What goes wrong:** `process.uptime()` is called inside route handler but `process` is not imported.
**Why it happens:** In ESM modules, `process` is available as a global in Node.js without import, but some developers assume it needs `import process from 'process'`.
**How to avoid:** `process.uptime()` works without import in Node.js ESM. No import needed.
**Warning signs:** `ReferenceError: process is not defined` at runtime.

### Pitfall 7: Hit-Testing Stale Bar Coordinates

**What goes wrong:** Tooltip appears for the wrong bar, or misses bars entirely.
**Why it happens:** The bar coordinates used for hit-testing are computed during `renderTimeline()` but the `hitTest()` function recalculates them independently with potentially different `sessionStart`/`totalMs` values.
**How to avoid:** Store bar pixel coordinates in `timelineState` alongside bar data during the render pass (one source of truth). `hitTest()` reads the stored pixel coords, not recalculated values.
**Warning signs:** Hovering over a bar shows tooltip for adjacent bar; tooltip appears at wrong position.

---

## Code Examples

### Tool Color Map (Discretionary — verified consistent with existing CSS vars)
```javascript
// Source: existing CSS vars in index.html: --green #3fb950, --red #f85149, --yellow #d29922
const TOOL_COLORS = {
  Read:       '#388bfd',  // blue (GitHub Actions blue — readable on dark bg)
  Write:      '#e3672a',  // orange (distinct from --yellow)
  Edit:       '#e3672a',  // same as Write (file mutation)
  Bash:       '#a371f7',  // purple (GitHub Actions purple)
  WebFetch:   '#2aa198',  // teal
  WebSearch:  '#2aa198',  // teal (same family as WebFetch)
  Task:       '#6e7fd2',  // indigo (subdued blue-purple)
};
const TOOL_COLOR_DEFAULT = '#484f58'; // gray for unknown tools

function getToolColor(toolName) {
  // Normalize: "Read" matches "Read", "MultiRead", etc.
  for (const [key, color] of Object.entries(TOOL_COLORS)) {
    if (toolName.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return TOOL_COLOR_DEFAULT;
}
```

### Relative Time Axis Label Formatter
```javascript
// Formats elapsed milliseconds as "+0s", "+30s", "+1m", "+2m 30s"
function formatRelativeTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return '+' + s + 's';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `+${m}m ${r}s` : `+${m}m`;
}
```

### Health Panel HTML Structure
```html
<!-- Replaces the Coming Soon placeholder -->
<div class="panel" id="health-panel">
  <div class="panel-header">Health</div>
  <div class="panel-body" id="health-panel-body">
    <div class="health-cards">
      <div class="health-card" id="hcard-hook">
        <div class="hcard-value" id="hcard-hook-value">--</div>
        <div class="hcard-label">Hooks</div>
      </div>
      <div class="health-card" id="hcard-error">
        <div class="hcard-value" id="hcard-error-value">--%</div>
        <div class="hcard-label">Error Rate</div>
      </div>
      <div class="health-card" id="hcard-uptime">
        <div class="hcard-value" id="hcard-uptime-value">--</div>
        <div class="hcard-label">Uptime</div>
      </div>
    </div>
  </div>
</div>
```

### Health Card CSS
```css
/* Health panel cards — three in a row, colored top border signals status */
.health-cards {
  display: flex;
  gap: 8px;
  padding: 8px;
  height: 100%;
  align-items: flex-start;
}
.health-card {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-top: 3px solid var(--border); /* overridden per status */
  border-radius: 4px;
  padding: 10px 8px 8px;
  text-align: center;
  min-width: 0;
}
.health-card.status-green  { border-top-color: var(--green); }
.health-card.status-yellow { border-top-color: var(--yellow); }
.health-card.status-red    { border-top-color: var(--red); }
.hcard-value {
  font-family: var(--mono);
  font-size: 20px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
}
.hcard-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}
```

### Timeline Panel Layout Decision (Tabbed Panel in col 2)

The current grid has no open slot for a new panel. The correct approach is to convert `#panel-log` into a tabbed panel:

```html
<!-- Column 2, rows 1+2: Tool Log / Timeline (tabbed) -->
<div class="panel" id="panel-log">
  <div class="panel-header" style="display:flex; align-items:center; gap:0; padding:0;">
    <button class="tab-btn active" id="tab-log"
      style="padding:8px 14px; background:none; border:none; cursor:pointer;
             font-size:11px; text-transform:uppercase; letter-spacing:0.08em;
             color:var(--text-muted); border-bottom: 2px solid var(--green);">
      Tool Log
    </button>
    <button class="tab-btn" id="tab-timeline"
      style="padding:8px 14px; background:none; border:none; cursor:pointer;
             font-size:11px; text-transform:uppercase; letter-spacing:0.08em;
             color:var(--text-muted); border-bottom: 2px solid transparent;">
      Timeline
    </button>
    <span id="log-filter-badge" ...></span>
  </div>
  <div id="tab-body-log" class="panel-body" id="tool-log"></div>
  <div id="tab-body-timeline" class="panel-body" style="display:none; padding:0; overflow:hidden;">
    <canvas id="timeline-canvas" style="display:block;"></canvas>
  </div>
</div>
```

```javascript
// Tab switching
document.getElementById('tab-log').addEventListener('click', () => switchTab('log'));
document.getElementById('tab-timeline').addEventListener('click', () => {
  switchTab('timeline');
  // Canvas needs dimensions set after becoming visible
  resizeCanvas();
  renderTimeline();
});

function switchTab(which) {
  document.getElementById('tab-body-log').style.display      = which === 'log'      ? '' : 'none';
  document.getElementById('tab-body-timeline').style.display = which === 'timeline' ? '' : 'none';
  document.getElementById('tab-log').style.borderBottomColor      = which === 'log'      ? 'var(--green)' : 'transparent';
  document.getElementById('tab-timeline').style.borderBottomColor = which === 'timeline' ? 'var(--green)' : 'transparent';
}
```

### `/api/health` Endpoint
```javascript
// routes/api.js — add alongside existing prepared statements

const stmtLastEventTs = db.prepare(`
  SELECT MAX(timestamp) AS ts FROM events
`);

const stmtCurrentSessionErrors = db.prepare(`
  SELECT
    SUM(CASE WHEN exit_status IS NOT NULL AND exit_status != 0 THEN 1 ELSE 0 END) AS errors,
    COUNT(*) AS total
  FROM events
  WHERE session_id = (
    SELECT session_id FROM events ORDER BY timestamp DESC LIMIT 1
  )
  AND hook_type = 'PostToolUse'
`);

fastify.get('/api/health', (request, reply) => {
  const lastTs = stmtLastEventTs.get()?.ts ?? null;
  const errRow = stmtCurrentSessionErrors.get();
  const errors = errRow?.errors ?? 0;
  const total  = errRow?.total  ?? 0;
  reply.send({
    lastEventTs:   lastTs,                          // epoch ms or null
    errorRate:     total > 0 ? (errors / total) * 100 : 0,
    serverUptimeS: process.uptime(),                // float seconds
  });
});
```

### Timeline State Structure
```javascript
const timelineState = {
  // Map: session_id -> { label, bars: [...], toolCount }
  // bars: [{ toolName, toolCallId, startMs, endMs, isInProgress, isError, target }]
  agentRows:      new Map(),
  sessionStart:   null,   // ms timestamp of first event
  latestTs:       0,      // ms timestamp of last completed event
  inProgressCount: 0,     // count of PreToolUse without matching PostToolUse
  // Hit-test store: populated during render, used by mousemove
  hitBoxes: [],           // [{ x0, y0, x1, y1, bar }]
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Third-party chart libraries (Chart.js, D3) for timelines | Raw Canvas 2D API for bespoke visualizations | ~2020 onwards as Canvas API matured | Zero dependencies, full control, no version churn |
| `setInterval` for animation loops | `requestAnimationFrame` | ~2012 (widespread by 2015) | 60fps sync with display refresh; pauses when tab is hidden |
| `process.hrtime()` for uptime | `process.uptime()` | Node.js 0.5+ | Simpler: returns float seconds directly |
| Polling for all live data | SSE for high-frequency events, polling for low-frequency metrics | This codebase (Phases 1-6) | Health metrics at 5s intervals are low-frequency — polling is correct; SSE is for tool call events |

---

## Open Questions

1. **Canvas tab vs. always-visible timeline panel**
   - What we know: Grid has no free slot; tabbed approach keeps layout intact
   - What's unclear: Whether the user would prefer timeline to be always visible (requiring a layout change) or on-demand via tab
   - Recommendation: Implement as a tab in the tool log panel (col 2). The CONTEXT.md has no opinion on this — it is Claude's discretion. Tabbed is significantly less risky to implement correctly.

2. **Timeline hydration data source**
   - What we know: `/api/events` returns up to 200 recent events; the timeline needs `session_id` to assign rows
   - What's unclear: The events table doesn't have a direct agent_id column — agent is identified via `session_id`
   - Recommendation: Use `session_id` as the row key for the timeline swimlanes. Each unique `session_id` in events is its own swimlane. This matches how `agentSections` in the tool log works.

3. **Timeline behavior in replay mode (IS_REPLAY)**
   - What we know: The dashboard supports replay mode (viewing a past session). In replay, SSE is suppressed.
   - What's unclear: CONTEXT.md does not address replay mode for timeline
   - Recommendation: In replay mode, render the timeline statically from hydrated events (no animation loop, no in-progress bars). The static render is a natural fallback.

---

## Sources

### Primary (HIGH confidence)
- MDN Web Docs - Canvas API (`fillRect`, `fillText`, `clearRect`, `getContext`, `ResizeObserver`, `requestAnimationFrame`, `mousemove` hit testing) — verified against well-established browser API
- Node.js official docs - `process.uptime()` — returns float seconds since process start; no import needed in ESM
- Existing `public/index.html` codebase — existing `@keyframes pulse` animation at lines 125-132, existing CSS variables, existing SSE patterns, existing hydrate pattern

### Secondary (MEDIUM confidence)
- WebSearch: Node.js `process.uptime()` human-readable formatting — confirmed `Math.floor(sec / 3600)` pattern used in multiple community examples; simple enough to inline
- WebSearch: Canvas 2D Gantt bar chart approach — confirmed full-redraw pattern is standard for auto-scaling timelines

### Tertiary (LOW confidence)
- Tool color hex values (#388bfd blue, #a371f7 purple, etc.) — drawn from GitHub's dark theme palette which is consistent with this dashboard's aesthetic but not formally locked in; Claude's discretion per CONTEXT.md

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; Canvas 2D API and process.uptime() are stable browser/Node.js built-ins
- Architecture: HIGH — tabbed panel approach verified against existing grid structure in index.html; SSE/polling split verified against existing patterns
- Pitfalls: HIGH — Retina canvas blurring, rAF loop leak, and hit-test staleness are well-documented Canvas API issues; error rate SQL logic is project-specific and verified against existing query patterns in api.js

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable APIs — Canvas 2D and Node.js process are not changing)
