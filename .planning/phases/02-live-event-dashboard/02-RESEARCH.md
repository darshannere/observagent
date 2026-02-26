# Phase 2: Live Event Dashboard - Research

**Researched:** 2026-02-26
**Domain:** Server-Sent Events, Fastify static serving, vanilla JS dashboard UI, SQLite query API
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tool call log display**
- Each row shows: tool name + timestamp + duration (e.g. "Read — 12:04:01 — 342ms")
- Compact single-line rows — maximize events visible at once
- Auto-scroll to bottom as new events arrive; pause auto-scroll if user manually scrolls up
- Events grouped by agent with collapsible sections (not a flat stream)

**Error and failure visibility**
- Failed tool call rows: red background or red left border — instantly scannable
- Toast notification fires when an error occurs (useful if user isn't watching the log)
- In-progress calls (PreToolUse fired, PostToolUse not yet received): subtle spinner or pulsing indicator on the row
- Error rows include a truncated error message inline, e.g. "Read — file not found — 0ms"

**Latency presentation**
- Duration displayed at end of row in human-readable form: "342ms" or "1.2s"
- Color-coded by threshold:
  - Green: < 500ms
  - Yellow: 500ms – 2s
  - Red: > 2s
- In-progress calls show a live elapsed timer counting up (e.g. "1.2s…") that turns into the final duration on completion

**Dashboard layout and panels**
- Grid layout with equal-weight panels — dashboard looks complete from day one
- All four panels present: Tool Call Log, Agent Tree, Cost Meters, Health Indicators
- Empty panels show: section title + "Available in Phase X" label (honest, sets expectations)
- Visual theme: dark, terminal-inspired — monospace font for tool names, dark background

### Claude's Discretion
- Exact grid proportions and responsive breakpoints
- Specific monospace font choice
- Toast notification position and dismiss timing
- Spacing and padding within rows

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INGEST-02 | User can see a live tool call log per agent showing what tools ran and in what order | SSE EventSource pattern + server-side pairing Map + Fastify GET /events/:session route |
| INGEST-03 | User can see when an agent errors or a tool call fails, highlighted in the dashboard | exit_status field in DB schema; CSS class toggling on SSE event receive |
| DASH-01 | Dashboard shows agent tree, cost meters, and health indicators on a single unified screen | CSS Grid 4-panel layout; placeholder panels with "Available in Phase X" labels |
| DASH-02 | Dashboard shows latency per tool call (time between PreToolUse and PostToolUse) | Server-side in-memory Map keyed by tool_call_id; duration_ms computed on PostToolUse arrival; live elapsed timer via setInterval |
</phase_requirements>

---

## Summary

Phase 2 builds the browser-facing dashboard on top of Phase 1's proven SSE bus. The backend needs two additions: (1) a route to serve the HTML dashboard file, and (2) a route to query historical events from SQLite so the page can hydrate on load. The existing `/events` SSE endpoint and `broadcast()` function from Phase 1 carry live updates; no SSE infrastructure changes are required.

The most technically interesting problem is latency computation. The current `ingest` route stores `duration_ms: null` for all events because it cannot know latency at PreToolUse time. The server must maintain an in-memory Map keyed by `tool_call_id` to record PreToolUse timestamps, then compute and store `duration_ms` when the matching PostToolUse arrives. This pairing logic must be added to `ingest.js` and the correlated event broadcast to SSE clients.

The dashboard itself is pure HTML + vanilla JS + CSS — no framework. The architecture decision (Fastify + vanilla JS + SQLite) is locked from Phase 1 and well-supported for this use case. The browser `EventSource` API handles reconnection automatically. The "live elapsed timer" for in-progress calls uses `setInterval` on the client, ticking every 100ms against a stored `startedAt` timestamp.

**Primary recommendation:** Add a `pendingCalls` Map in ingest.js for PreToolUse/PostToolUse pairing, serve `public/index.html` via a Fastify GET route with `fs.readFileSync`, add a `GET /api/events` route for hydration from SQLite, and build the dashboard as a single `index.html` with inline CSS and JS.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 5.7.4 (already installed) | HTTP server + routes | Already in use; Phase 1 foundation |
| better-sqlite3 | 12.6.2 (already installed) | Read events for hydration | Already in use; synchronous, prepared statements |
| fastify-sse-v2 | 4.2.2 (already installed) | SSE push to browser | Already in use; Phase 1 proven |
| Browser EventSource API | Built-in | Connect to /events SSE stream | Native browser API, no install; auto-reconnects |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/static | ^8.0.0 | Serve public/ directory | Use if multiple static assets (CSS, JS files); optional if single HTML |
| Node.js fs (stdlib) | Built-in | Read index.html at startup | Use for single-file HTML serving without @fastify/static |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fs.readFileSync + route | @fastify/static 8.x | @fastify/static adds etag/cache headers automatically; for a single HTML file with inlined CSS+JS, readFileSync is simpler and has zero extra dependency |
| Inline CSS+JS in index.html | Separate public/css + public/js files | Separate files require @fastify/static; single-file is simpler for Phase 2, easier to refactor later |
| Browser setInterval elapsed timer | Server-push elapsed time | Server-push would require extra SSE event per tick; client setInterval is correct approach |

**Installation (if @fastify/static chosen):**
```bash
npm install @fastify/static
```

No other new packages required — Phase 2 is built entirely on Phase 1's dependency set plus browser built-ins.

---

## Architecture Patterns

### Recommended Project Structure
```
observagent/
├── server.js              # existing — add static/api route registration
├── routes/
│   ├── ingest.js          # existing — add pendingCalls Map + pairing logic
│   ├── sse.js             # existing — no changes needed
│   ├── dashboard.js       # NEW — GET / serves index.html
│   └── api.js             # NEW — GET /api/events?session_id=X&limit=200
├── public/
│   └── index.html         # NEW — full dashboard (CSS + JS inlined)
├── db/
│   └── schema.js          # existing — no changes needed
└── lib/
    ├── sseClients.js       # existing — no changes needed
    └── writeQueue.js       # existing — no changes needed
```

### Pattern 1: PreToolUse/PostToolUse Pairing via In-Memory Map

**What:** When a PreToolUse event arrives, store `{ timestamp, session_id, tool_name }` in a Map keyed by `tool_call_id`. When PostToolUse arrives with matching `tool_call_id`, compute `duration_ms = now - stored.timestamp`, update the event, and clear the map entry.

**When to use:** Mandatory — without this, `duration_ms` remains null for all events and DASH-02 cannot be met.

**Example:**
```javascript
// Source: project design — server-side pairing
const pendingCalls = new Map(); // tool_call_id -> { startTs, session_id, tool_name }

// In ingest route POST /ingest:
if (event.hook_type === 'PreToolUse') {
  pendingCalls.set(event.tool_call_id, { startTs: event.timestamp, session_id: event.session_id });
  event.duration_ms = null; // still in-progress
} else if (event.hook_type === 'PostToolUse') {
  const pending = pendingCalls.get(event.tool_call_id);
  if (pending) {
    event.duration_ms = event.timestamp - pending.startTs;
    pendingCalls.delete(event.tool_call_id);
  }
}
```

**Key constraint:** The Map lives in server process memory. If the server restarts mid-call, the pair is lost and `duration_ms` stays null — acceptable for Phase 2.

### Pattern 2: SSE EventSource Connection with Auto-Scroll

**What:** Browser creates `new EventSource('/events')`, listens for messages, appends rows to a log container. Auto-scroll to bottom unless user has manually scrolled up.

**When to use:** Core INGEST-02 pattern — every agent-grouped log section uses this.

**Example:**
```javascript
// Source: MDN EventSource API
const es = new EventSource('/events');
const log = document.getElementById('tool-log');

let userScrolledUp = false;
log.addEventListener('scroll', () => {
  const atBottom = log.scrollHeight - log.scrollTop <= log.clientHeight + 50;
  userScrolledUp = !atBottom;
});

es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  if (event.type === 'connected') return;
  appendRow(event);
  if (!userScrolledUp) {
    log.scrollTop = log.scrollHeight;
  }
};

es.onerror = (err) => {
  console.warn('[sse] connection lost, browser will auto-reconnect in 3s');
  // EventSource reconnects automatically — no manual retry needed
};
```

### Pattern 3: Live Elapsed Timer for In-Progress Calls

**What:** When a PreToolUse arrives, create a row with a timer element. Start a `setInterval` updating every 100ms. When PostToolUse arrives for the same `tool_call_id`, stop the interval and replace elapsed time with final duration.

**When to use:** For every row in "in-progress" state (PreToolUse received, PostToolUse not yet received).

**Example:**
```javascript
// Source: project design — client-side elapsed timer
const inProgressTimers = new Map(); // tool_call_id -> intervalId

function appendRow(event) {
  if (event.hook_type === 'PreToolUse') {
    const row = createRow(event);
    const timerEl = row.querySelector('.duration');
    const startMs = event.timestamp;
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startMs;
      timerEl.textContent = formatDuration(elapsed) + '…';
    }, 100);
    inProgressTimers.set(event.tool_call_id, { intervalId, row, timerEl });
    getAgentSection(event.session_id).appendChild(row);

  } else if (event.hook_type === 'PostToolUse') {
    const pending = inProgressTimers.get(event.tool_call_id);
    if (pending) {
      clearInterval(pending.intervalId);
      inProgressTimers.delete(event.tool_call_id);
      // Update existing row with final duration and color
      pending.timerEl.textContent = formatDuration(event.duration_ms);
      pending.timerEl.className = 'duration ' + latencyClass(event.duration_ms);
      if (event.exit_status !== 0 && event.exit_status !== null) {
        pending.row.classList.add('error');
      }
    }
  }
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function latencyClass(ms) {
  if (ms === null) return '';
  if (ms < 500) return 'green';
  if (ms <= 2000) return 'yellow';
  return 'red';
}
```

### Pattern 4: GET /api/events — Hydration Route

**What:** When the dashboard first loads, it fetches recent events from SQLite via a REST GET endpoint to populate the log before SSE starts delivering new events. This prevents the log from appearing empty on load.

**When to use:** Page load initialization — called once by `DOMContentLoaded` before SSE subscription.

**Example:**
```javascript
// Source: better-sqlite3 synchronous query pattern
// routes/api.js
export async function apiRoutes(fastify, options) {
  const { db } = options;
  const stmtBySession = db.prepare(
    `SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC LIMIT 500`
  );
  const stmtAll = db.prepare(
    `SELECT * FROM events ORDER BY timestamp DESC LIMIT 200`
  );

  fastify.get('/api/events', (request, reply) => {
    const { session_id } = request.query;
    const rows = session_id ? stmtBySession.all(session_id) : stmtAll.all();
    reply.send(rows);
  });
}
```

### Pattern 5: Dashboard HTML Structure

**What:** Four-panel CSS Grid layout with dark terminal theme, monospace font for tool names.

**When to use:** Single `public/index.html` containing all CSS and JS inline.

**Example:**
```html
<!-- Source: project design — 4-panel dark dashboard -->
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  }

  body { margin: 0; background: var(--bg); color: var(--text); font-family: sans-serif; }

  .dashboard {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 1px;
    height: 100vh;
    background: var(--border); /* gap color = border */
  }

  .panel {
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  /* Tool call log row */
  .log-row {
    font-family: var(--mono);
    font-size: 12px;
    padding: 2px 4px;
    display: flex;
    gap: 8px;
    border-radius: 2px;
    white-space: nowrap;
    overflow: hidden;
  }
  .log-row.error { background: rgba(248, 81, 73, 0.12); border-left: 3px solid var(--red); }
  .log-row.in-progress { opacity: 0.7; }

  .tool-name { color: var(--text); min-width: 120px; }
  .ts { color: var(--text-muted); }
  .duration.green { color: var(--green); }
  .duration.yellow { color: var(--yellow); }
  .duration.red { color: var(--red); }
  .duration { color: var(--text-muted); }

  /* Placeholder panel */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 13px;
    gap: 6px;
  }
  .placeholder .phase-label {
    font-size: 11px;
    opacity: 0.6;
  }
</style>

<div class="dashboard">
  <div class="panel" id="panel-log">
    <div class="panel-header">Tool Call Log</div>
    <div class="panel-body" id="tool-log"></div>
  </div>
  <div class="panel">
    <div class="panel-header">Agent Tree</div>
    <div class="panel-body placeholder">
      <span>Agent Tree</span>
      <span class="phase-label">Available in Phase 4</span>
    </div>
  </div>
  <div class="panel">
    <div class="panel-header">Cost Meters</div>
    <div class="panel-body placeholder">
      <span>Cost & Token Tracking</span>
      <span class="phase-label">Available in Phase 3</span>
    </div>
  </div>
  <div class="panel">
    <div class="panel-header">Health</div>
    <div class="panel-body placeholder">
      <span>Health Indicators</span>
      <span class="phase-label">Available in Phase 4</span>
    </div>
  </div>
</div>
```

### Pattern 6: Agent-Grouped Collapsible Sections

**What:** Tool Call Log panel groups rows by `session_id`. Each agent gets a `<details>` element (default open) with a `<summary>` showing session_id. New agents are created dynamically as new session_ids appear.

**When to use:** All rows in the Tool Call Log panel.

**Example:**
```javascript
// Source: project design — collapsible agent sections
const agentSections = new Map(); // session_id -> container element

function getAgentSection(sessionId) {
  if (agentSections.has(sessionId)) return agentSections.get(sessionId);

  const details = document.createElement('details');
  details.open = true; // default expanded
  details.dataset.sessionId = sessionId;

  const summary = document.createElement('summary');
  summary.textContent = `Agent: ${sessionId.slice(0, 8)}`;
  summary.style.cssText = 'cursor:pointer; padding:4px; font-size:11px; color:var(--text-muted);';

  const container = document.createElement('div');
  details.appendChild(summary);
  details.appendChild(container);
  document.getElementById('tool-log').appendChild(details);
  agentSections.set(sessionId, container);
  return container;
}
```

### Pattern 7: Dashboard Route — Serve index.html

**What:** Fastify GET route reads `public/index.html` at startup and serves it as text/html.

**When to use:** Root route `/` — one-time read at server startup, zero runtime overhead.

**Example:**
```javascript
// Source: Fastify docs + project pattern
// routes/dashboard.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '../public/index.html'), 'utf8');

export async function dashboardRoutes(fastify, options) {
  fastify.get('/', (request, reply) => {
    reply.type('text/html').send(html);
  });
}
```

### Pattern 8: Toast Notification — Pure JS, No Library

**What:** A `showToast(message)` function creates a div, appends to body, animates in, auto-dismisses after a timeout, and removes itself from DOM.

**When to use:** Called when an SSE event arrives with non-zero exit_status (error condition).

**Example:**
```javascript
// Source: project design — ~20 lines, no library
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.style.cssText = `
      position: fixed; bottom: 16px; right: 16px;
      display: flex; flex-direction: column; gap: 8px; z-index: 9999;
    `;
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(message, type = 'error') {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #1f1f1f; border: 1px solid #f85149;
    color: #e6edf3; padding: 10px 14px; border-radius: 6px;
    font-size: 12px; font-family: var(--mono);
    opacity: 0; transition: opacity 0.2s;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 5000);
}
```

### Anti-Patterns to Avoid

- **Calling `reply.send()` or returning from SSE route handler:** fastify-sse-v2 keeps the SSE connection open by design. Returning closes the stream — verified from Phase 1 code review.
- **Building a frontend framework (React, Vue):** User decided vanilla JS. A framework adds build complexity with zero benefit for this single-page dashboard.
- **Querying SQLite in a loop per event:** Pre-compile prepared statements in route constructor using `db.prepare()`, not per-request.
- **Using `setInterval(fn, 1000)` for elapsed timer:** Use 100ms interval for smooth "1.2s…" updates. 1s interval looks laggy.
- **Storing pendingCalls in SQLite:** The pairing Map is transient, lives in memory. SQLite is for persisted events only.
- **Computing duration_ms client-side from two separate SSE events:** Client clocks may drift. Server-side pairing (Pattern 1) is authoritative — client only receives the final computed `duration_ms`.
- **Using `reply.raw.write()` for SSE broadcast:** Phase 1 uses `reply.sse()` from fastify-sse-v2 for per-client sends and `reply.raw.write()` for the broadcast utility. This distinction is correct — don't change it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE auto-reconnect | Manual WebSocket + reconnect loop | Browser `EventSource` built-in | Native auto-reconnect after 3s; sends Last-Event-ID header; zero code |
| Toast notification library | Custom notification framework | ~20-line pure JS `showToast()` | Toastify.js or EggyJS work too, but add a CDN dependency; pure JS is simpler for a single call type |
| Latency pairing | Custom DB schema with pending_events table | In-memory `Map` in ingest.js | DB round-trip adds latency to latency measurement; Map is O(1) and correct |
| Font loading | Web font server | System monospace stack (`ui-monospace, monospace`) or Google Fonts CDN | System stack works offline and has zero latency; CDN works but adds external dependency |

**Key insight:** The browser provides SSE reconnection, timing APIs, and DOM manipulation for free. The server provides SQLite queries and a Map for pairing. No library fills any gap not already covered.

---

## Common Pitfalls

### Pitfall 1: `duration_ms` Always Null in Broadcast

**What goes wrong:** The SSE broadcast fires before PostToolUse pairing is computed, so the browser always sees `duration_ms: null`. The live elapsed timer never stops.

**Why it happens:** In Phase 1, `broadcast()` is called inside `setImmediate()` along with `writeQueue.enqueue()`. Both currently store `duration_ms: null`. The pairing Map update must happen BEFORE the broadcast call.

**How to avoid:** In the updated `ingest.js`, compute `duration_ms` from the pendingCalls Map BEFORE calling `broadcast(event)`. The sequence must be: update event → enqueue → broadcast.

**Warning signs:** Dashboard shows "1.2s…" timers that never stop even after tool calls complete.

---

### Pitfall 2: Auto-Scroll Breaks When New Agent Section Appended

**What goes wrong:** Appending a new `<details>` section for a new agent_id changes the scroll height of the container, causing the "at bottom" check to fail and auto-scroll to stop working.

**Why it happens:** The `scrollHeight` check runs before the DOM is repainted with the new section.

**How to avoid:** Call `requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; })` after appending any new section, not just new rows.

**Warning signs:** Scroll position stays at previous position after first event from a new agent.

---

### Pitfall 3: CORS Issue When HTML Is Served from Same Origin

**What goes wrong:** If the dashboard HTML is NOT served by the Fastify server (e.g., opened as a local file `file://`), the EventSource connection fails with CORS error.

**Why it happens:** `EventSource` to `http://localhost:4999/events` from `file://` is a cross-origin request. Browser blocks it.

**How to avoid:** Always serve `index.html` from the same Fastify server (Pattern 7 above). The user opens `http://localhost:4999`, not `file:///path/to/index.html`. This is the correct architecture anyway.

**Warning signs:** Browser console shows "CORS policy blocked" on EventSource creation.

---

### Pitfall 4: Stale `inProgressTimers` Map Growth

**What goes wrong:** The client-side `inProgressTimers` Map grows indefinitely if PostToolUse events arrive with tool_call_ids not in the Map (e.g., events from before page load), or if tool calls never complete (server crash).

**Why it happens:** No cleanup mechanism for orphaned pending entries.

**How to avoid:** Hydration events (from `/api/events` on page load) that are already completed (PostToolUse) should be rendered immediately with final duration — skip the timer for historical data. Only live SSE events need the timer. Add a 60s `setTimeout` that clears any `inProgressTimers` entry not yet resolved (a stuck tool).

**Warning signs:** Memory usage of browser tab grows over a long session with many agents.

---

### Pitfall 5: pendingCalls Map Grows If PostToolUse Never Arrives

**What goes wrong:** Server-side `pendingCalls` Map grows if Claude Code crashes mid-tool-call, PostToolUse never fires, and the PreToolUse entry lives forever.

**Why it happens:** No expiry mechanism on server-side Map.

**How to avoid:** Add a TTL — on each PreToolUse insert, also store a `Date.now()` timestamp. Periodically (every 5 minutes via `setInterval`) scan the Map and delete entries older than 5 minutes. Keep it simple.

**Warning signs:** Server memory usage grows over days of use without restarts.

---

### Pitfall 6: exit_status Interpretation

**What goes wrong:** Marking a row as "error" when `exit_status === 0` or `exit_status === null`.

**Why it happens:** Phase 1's schema has `exit_status INTEGER` — a 0 means success, non-zero means failure, null means in-progress (PostToolUse not yet received).

**How to avoid:** Error condition is `event.exit_status !== null && event.exit_status !== 0`. In-progress condition is `event.hook_type === 'PreToolUse'` (no PostToolUse yet for this tool_call_id). Document this in code comments.

**Warning signs:** All completed tool calls show error styling.

---

## Code Examples

Verified patterns from Phase 1 codebase + official sources:

### Fastify Route Registration (ESM, Fastify 5 pattern from existing server.js)
```javascript
// Source: observagent/server.js — existing working pattern
import { dashboardRoutes } from './routes/dashboard.js';
import { apiRoutes } from './routes/api.js';

fastify.register(dashboardRoutes);
fastify.register(apiRoutes, { db });
```

### better-sqlite3 Prepared Statement Query (from existing writeQueue.js pattern)
```javascript
// Source: observagent/lib/writeQueue.js — same prepare-once pattern
const stmtQuery = db.prepare(
  `SELECT id, tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status
   FROM events
   WHERE session_id = ?
   ORDER BY timestamp ASC
   LIMIT 500`
);
// Usage:
const rows = stmtQuery.all(sessionId);
```

### EventSource MDN Pattern (verified from MDN)
```javascript
// Source: MDN Web Docs — Using server-sent events
const es = new EventSource('http://localhost:4999/events');
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // handle event
};
es.onerror = () => {
  // Browser auto-reconnects after ~3s — this fires during reconnect attempts
  console.warn('[sse] reconnecting...');
};
// Close when done:
// es.close();
```

### Hydration on Page Load
```javascript
// Source: project design — fetch historical events before SSE subscription
async function hydrate() {
  const res = await fetch('/api/events?limit=200');
  const events = await res.json();
  // Replay events in order — skip timer for historical completed calls
  for (const e of events) {
    renderHistoricalRow(e); // no timer, final duration already known
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await hydrate();
  subscribeSSE(); // start live updates after history loaded
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket for server push | SSE via EventSource | Ongoing — SSE is correct for unidirectional | Simpler, auto-reconnect built-in, works over HTTP/1.1 |
| Polling GET endpoint every 1s | SSE push | Phase 1 proven | Zero wasted requests, <50ms event delivery |
| Separate CSS/JS files served static | Single index.html with inlined CSS+JS | Project decision | Zero static plugin needed for Phase 2 |

**Deprecated/outdated:**
- `fastify-static` (without @): Use `@fastify/static` — the scoped package is current. Version 8.x supports Fastify 5.

---

## Open Questions

1. **exit_status value from Claude Code PostToolUse**
   - What we know: Phase 1 schema has `exit_status INTEGER`; relay.py receives the raw PostToolUse payload
   - What's unclear: What exact integer value Claude Code puts in exit_status for a failed tool call — 1? Custom code? Is it always present?
   - Recommendation: Log the raw PostToolUse payload in relay.py during development (to a temp file, not stdout) to inspect. Until confirmed, treat any non-null, non-zero value as error.

2. **tool_call_id presence in both hook events**
   - What we know: Phase 1 relay.py extracts `tool_use_id` from the hook payload and stores it as `tool_call_id`. Phase 1 is proven to work.
   - What's unclear: Whether PostToolUse always includes the same `tool_use_id` as its matching PreToolUse — or if it's sometimes absent.
   - Recommendation: Test with a real Claude Code session and verify both events carry the same `tool_use_id`. If absent, fall back to session_id + sequence correlation.

3. **Multiple simultaneous active sessions**
   - What we know: The `/api/events` route design above accepts `?session_id=X` for filtering
   - What's unclear: Should Phase 2 dashboard show a specific session or "all recent events"? No session selector UI is in scope yet.
   - Recommendation: Default to showing all events grouped by agent. Session filtering is Phase 5.

---

## Sources

### Primary (HIGH confidence)
- Existing Phase 1 codebase (`observagent/server.js`, `routes/ingest.js`, `routes/sse.js`, `lib/sseClients.js`, `db/schema.js`) — ground truth for existing patterns
- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — EventSource API, reconnect behavior, event format
- [MDN — EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) — API surface
- [fastify/fastify-static GitHub](https://github.com/fastify/fastify-static) — confirmed @fastify/static 8.x supports Fastify 5.x

### Secondary (MEDIUM confidence)
- WebSearch: @fastify/static 8.x / Fastify 5 compatibility confirmed via npm search + GitHub tree — `@fastify/static ≥8.x → Fastify ^5.x`
- WebSearch: Browser EventSource 3-second default reconnect timing — confirmed by javascript.info and MDN
- WebSearch: `fs.readFileSync` + `reply.type('text/html').send(html)` pattern for single HTML file serving without @fastify/static — from Fastify community docs

### Tertiary (LOW confidence)
- exit_status field values from Claude Code PostToolUse hook — behavior not confirmed from official docs; marked as open question

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed and proven in Phase 1; only @fastify/static is optional new addition
- Architecture: HIGH — patterns build directly on existing Phase 1 code; all routes follow established Fastify ESM plugin pattern
- Pitfalls: HIGH — identified from direct inspection of Phase 1 code (null duration_ms in broadcast, exit_status interpretation) and verified SSE behavior from MDN

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days — Fastify + better-sqlite3 + SSE specs are stable)
