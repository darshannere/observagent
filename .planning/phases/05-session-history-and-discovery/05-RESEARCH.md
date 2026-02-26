# Phase 5: Session History and Discovery - Research

**Researched:** 2026-02-26
**Domain:** Session history UI, SQLite filtering, CSV/JSONL export, vanilla JS, Fastify routing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Session List Layout
- Card-based layout (not table rows)
- Each card shows: project name, date/time, total cost, error indicator (compact)
- Default sort: most recent session first within each group
- Sessions grouped by project, sorted by date within each group
- Project groups are collapsible, collapsed by default
- Live (active) sessions appear at the top of their project group with a "LIVE" badge
- Clicking a LIVE badge navigates to the main real-time dashboard
- Page navigation: Claude decides (own route vs tab on existing dashboard)

#### Filter UX
- Filters live in a top bar above the session list
- Filters apply live — results update instantly as filters change (no submit button)
- Prominently shown in top bar: date range picker + project name search
- Secondary filters (cost range, model, error presence) accessible via "More filters" or secondary row
- "Has errors" filter design: Claude decides simplest approach

#### Session Detail / Drill-down
- Clicking a session card opens the existing live dashboard replaying that session's data
- Replay mode shows a banner at the top: "Viewing: [project] — [date]" + back-to-history button
- Export buttons are available in both the history list (on each card) and in the replay banner

#### Export Behavior
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HIST-01 | User can browse a list of past and active sessions organized by project | Project name derivation from JSONL `cwd` field; session_cost schema migration to add `project_name`; grouping query; `<details>`/`<summary>` collapsible groups; live session detection via events table |
| HIST-02 | User can filter sessions by date, cost range, project, model, and error presence | SQLite parameterized LIKE filter pattern; LEFT JOIN to events for error presence; date comparison via ISO string comparison; live filter via fetch on input events |
| HIST-03 | User can export session data as JSONL or CSV for offline analysis | Blob + anchor download pattern; hand-rolled CSV escaping; Fastify `/api/sessions/:id/export` route; export from events table + session_cost; filename format pattern |
</phase_requirements>

---

## Summary

Phase 5 adds a history browsing page to ObservAgent. The existing stack (Fastify 5, better-sqlite3, vanilla JS) handles all requirements without new npm dependencies. The most significant implementation challenge is **project name tracking**: the `session_cost` table currently has no `project_name` column, and Claude Code stores sessions in `~/.claude/projects/{encoded-path}/` directories. The encoded directory name cannot be reliably decoded (path separators and dashes are ambiguous), but each JSONL record's `cwd` field contains the exact working directory string. The fix is to (1) add a `project_name` column to `session_cost` via a safe migration, and (2) extract `basename(cwd)` from the first suitable JSONL record when calling `processFile()`.

The history page itself is a second HTML file served at `/history` — a new Fastify route parallel to the existing dashboard route. The page uses native `<details>`/`<summary>` for collapsible project groups, native `<input type="date">` for date range filtering, and a fetch-based live filter that debounces calls to a new `/api/sessions` endpoint. Session replay reuses the existing `index.html` dashboard with a `?session_id=` query parameter; the dashboard reads this param to show only that session's data and renders a replay banner.

Export is entirely client-side: a new `/api/sessions/:id/export` Fastify route returns JSON; the frontend converts it to CSV or JSONL and triggers a browser download via `URL.createObjectURL(blob)`. No CSV library is needed — RFC 4180 CSV can be hand-rolled in ~15 lines of JS.

**Primary recommendation:** Add `project_name` to `session_cost` at the schema migration step, derive it from `cwd` in JSONL records, and build the history UI as a second static HTML file at `/history`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 (existing) | Parameterized filter queries, migration | Already in project, synchronous API matches Fastify's single-threaded model |
| Fastify | ^5.7.4 (existing) | New `/history` and `/api/sessions` routes | Already in project |
| Vanilla JS + CSS | — | History page UI, filter logic, export download | Existing project pattern — no framework, no bundler |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `path.basename` | built-in | Extract project name from cwd string | Project name derivation in `jsonlWatcher.js` |
| Node.js `fs.readFileSync` | built-in | Serve history.html at startup | Same pattern as `dashboard.js` serving `index.html` |
| Browser `URL.createObjectURL` | browser built-in | File download trigger | CSV/JSONL export |
| Native `<input type="date">` | HTML5 | Date range filter UI | Zero-dependency date picker |
| Native `<details>`/`<summary>` | HTML5 | Collapsible project groups | Already used in the existing dashboard's agent sections |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<input type="date">` | vanillajs-datepicker, Flatpickr | Library gives better cross-browser UX but adds a dependency; native is sufficient for a dev tool used in Chrome |
| Hand-rolled CSV | `csv-stringify` npm package | Library handles edge cases better, but RFC 4180 is simple enough; adding a dep for 15 lines of JS is not warranted |
| Separate `/history` route | Tab on existing dashboard | Tab avoids a second HTML file but complicates replay mode (replaying inside the tab vs navigating to main dashboard); a separate route is cleaner |
| `basename(cwd)` from JSONL | Last-segment heuristic on dir name | JSONL `cwd` is exact; dir-name decoding is ambiguous for paths with dashes |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
observagent/
├── db/
│   └── schema.js            # ADD: project_name column migration + index
├── lib/
│   └── jsonlWatcher.js      # MODIFY: extract project_name from cwd, pass to processFile
│   └── costEngine.js        # NO CHANGE
├── routes/
│   ├── api.js               # ADD: /api/sessions (filtered list) + /api/sessions/:id/export
│   ├── dashboard.js         # MODIFY: add /history route serving history.html
│   └── history.js           # NEW: serves public/history.html (or inline in dashboard.js)
├── public/
│   ├── index.html           # MODIFY: add replay banner + session_id param handling
│   └── history.html         # NEW: history page with filter bar + card grid
```

### Pattern 1: Safe Schema Migration

**What:** Add `project_name` column to existing `session_cost` table without breaking existing rows.
**When to use:** Any time a column must be added to a table that already has data.

```javascript
// Source: SQLite PRAGMA table_info pattern — verified against SQLite 3.51.2 in this codebase
function addColumnIfNotExists(db, table, column, typeDef) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
    console.log(`[db] added column ${column} to ${table}`);
  }
}

// In initDb(), after CREATE TABLE IF NOT EXISTS session_cost:
addColumnIfNotExists(db, 'session_cost', 'project_name', "TEXT NOT NULL DEFAULT ''");
```

**Why:** SQLite 3.51.2 does NOT support `ALTER TABLE ADD COLUMN IF NOT EXISTS` — this throws `near "EXISTS": syntax error`. The PRAGMA check pattern is the correct workaround. Verified in this project's SQLite version.

### Pattern 2: Project Name from JSONL `cwd` Field

**What:** Extract `basename(cwd)` from any JSONL record that has a `cwd` field, then pass it through `processFile()`.
**When to use:** When first processing a JSONL file or when `project_name` is still `''`.

```javascript
// In jsonlWatcher.js — modification to parseJsonlFile or processFile
import { basename } from 'node:path';

async function extractProjectName(filePath) {
  // Read first ~20 records to find a cwd field
  const records = await parseJsonlFile(filePath); // already exists
  for (const r of records) {
    if (r.cwd && typeof r.cwd === 'string') {
      return basename(r.cwd); // e.g. '/Users/x/claude/observagent' -> 'observagent'
    }
  }
  // Fallback: derive from parent directory name if no cwd found
  const parts = filePath.split('/');
  // ~/.claude/projects/{dirName}/{session}.jsonl
  const dirName = parts[parts.length - 2] || '';
  const segments = dirName.replace(/^-/, '').split('-');
  return segments[segments.length - 1] || 'unknown';
}
```

**Note:** `cwd` appears in `progress`, `user`, and `assistant` record types. It is present in every session tested in this codebase.

### Pattern 3: History Session List Query with Filters

**What:** Single SQL query that aggregates session data, joins error presence, and applies all five filters. Uses parameterized LIKE for safe project name search.
**When to use:** `/api/sessions` endpoint handler.

```javascript
// Source: verified against SQLite 3.51.2 in this codebase
const stmtSessions = db.prepare(`
  SELECT
    sc.session_id,
    sc.project_name,
    sc.model,
    sc.total_cost_usd,
    sc.last_event_ts,
    CASE WHEN e.has_errors THEN 1 ELSE 0 END AS has_errors,
    CASE WHEN live.max_ts > ? THEN 1 ELSE 0 END AS is_live
  FROM session_cost sc
  LEFT JOIN (
    SELECT session_id,
           MAX(CASE WHEN exit_status != 0 AND exit_status IS NOT NULL THEN 1 ELSE 0 END) AS has_errors
    FROM events
    GROUP BY session_id
  ) e ON sc.session_id = e.session_id
  LEFT JOIN (
    SELECT session_id, MAX(timestamp) AS max_ts
    FROM events
    GROUP BY session_id
  ) live ON sc.session_id = live.session_id
  WHERE sc.agent_id = ''
    AND (? = '' OR sc.project_name LIKE '%' || ? || '%')
    AND (? = '' OR sc.last_event_ts >= ?)
    AND (? = '' OR sc.last_event_ts <= ?)
    AND (? = '' OR sc.model = ?)
    AND (? = 0   OR sc.total_cost_usd >= ?)
    AND (? = 0   OR sc.total_cost_usd <= ?)
    AND (? = 0   OR CASE WHEN e.has_errors THEN 1 ELSE 0 END = 1)
  ORDER BY sc.last_event_ts DESC
`);

// Call: pass liveThreshold (now - 10 min in ms) then filter values
// is_live: session has had an event in the last 10 minutes
```

**LIVE threshold:** 10 minutes (600,000ms) — sessions with a tool event in the last 10 min are considered live. This matches the 5-min orphaned call TTL already in the codebase plus a buffer.

### Pattern 4: Client-Side File Download

**What:** Convert server JSON response to CSV or JSONL and trigger browser download without any library.
**When to use:** Export button click in history list card or replay banner.

```javascript
// Source: standard browser File API — HIGH confidence across all modern browsers
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // Release memory immediately
}

// CSV escape: RFC 4180 — verified correct
function toCsvRow(values) {
  return values.map(v => {
    const str = (v === null || v === undefined) ? '' : String(v);
    return (str.includes(',') || str.includes('"') || str.includes('\n'))
      ? '"' + str.replace(/"/g, '""') + '"'
      : str;
  }).join(',');
}

// JSONL: one JSON object per line
function toJsonl(rows) {
  return rows.map(r => JSON.stringify(r)).join('\n');
}

// Filename: observagent_[project]_[YYYY-MM-DD].jsonl
function makeFilename(project, dateStr, ext) {
  const date = dateStr ? dateStr.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const safeName = project.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `observagent_${safeName}_${date}.${ext}`;
}
```

### Pattern 5: Replay Mode in Existing Dashboard

**What:** The existing `index.html` at `/` reads `?session_id=` from URL params, loads only that session's events, and shows a replay banner.
**When to use:** When user clicks a session card in history.

```javascript
// In index.html script section — modification
const urlParams = new URLSearchParams(window.location.search);
const REPLAY_SESSION_ID = urlParams.get('session_id');
const IS_REPLAY = !!REPLAY_SESSION_ID;

// Modify hydrate() to use session-specific endpoint:
async function hydrate() {
  const url = IS_REPLAY
    ? `/api/events?session_id=${REPLAY_SESSION_ID}`
    : '/api/events';
  // ... existing fetch logic unchanged
}

// Disable SSE subscription in replay mode (no live updates needed)
// Show replay banner if IS_REPLAY:
if (IS_REPLAY) {
  renderReplayBanner(REPLAY_SESSION_ID);
}
```

**Note:** The existing `/api/events?session_id=` parameter is ALREADY implemented in `api.js` (`stmtBySession`). Replay mode requires no backend changes to the events API.

### Pattern 6: Collapsible Project Groups

**What:** Native `<details>`/`<summary>` elements for project groups, collapsed by default. Already used in the existing dashboard's agent section log.
**When to use:** Session list grouped by project.

```html
<!-- collapsed by default (no 'open' attribute) -->
<details class="project-group" data-project="observagent">
  <summary class="project-group-header">
    <span class="project-name">observagent</span>
    <span class="project-meta">3 sessions · $0.42</span>
  </summary>
  <!-- session cards go here -->
  <div class="session-card" data-session-id="abc-123">
    <!-- card content -->
  </div>
</details>
```

### Anti-Patterns to Avoid

- **Re-scanning filesystem on every `/api/sessions` request:** The `~/.claude/projects/` dir scan is slow. All project_name data must be in SQLite at write time, not derived at query time.
- **Using `LIKE '%' || value || '%'` without sanitizing %/_ in the search value:** Users searching for project names with underscores or percent signs would produce unexpected LIKE results. For this use case (project name search), it's acceptable to leave it — project names rarely contain LIKE wildcards. Flag as LOW priority.
- **Building a second full SSE subscription in history.html:** History is static data, not live. No SSE needed on the history page.
- **Blocking the event loop with synchronous file reads for export:** Export data comes from SQLite (synchronous better-sqlite3 is fine), not from JSONL file parsing. No async needed.
- **Modifying `appendRow` in replay mode:** In replay mode, do NOT connect to SSE. The replay banner must suppress SSE subscription to prevent live events contaminating the replayed session view.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping | Custom parser | ~15 lines of RFC 4180 logic (hand-roll is fine here) | CSV format is well-specified; a full library is overkill for this data shape |
| Date picker UI | Custom calendar widget | Native `<input type="date">` | The target audience is developers using Chrome; native date input is sufficient |
| File download | Custom server endpoint for file streaming | Browser `URL.createObjectURL(blob)` | Server already returns JSON; browser converts to file client-side |
| Filter debouncing | setTimeout re-invention | Use existing 600ms debounce pattern from threshold inputs | The codebase already has a correct debounce implementation to copy |

**Key insight:** This phase has no complex algorithmic problems. The hard part is schema migration and data plumbing (project_name), not UI library selection.

---

## Common Pitfalls

### Pitfall 1: `ALTER TABLE ADD COLUMN IF NOT EXISTS` Not Supported

**What goes wrong:** `db.exec('ALTER TABLE session_cost ADD COLUMN IF NOT EXISTS project_name TEXT')` throws `near "EXISTS": syntax error` in SQLite 3.51.2 and all current SQLite versions.
**Why it happens:** `IF NOT EXISTS` on `ADD COLUMN` is not a supported SQLite syntax (only `CREATE TABLE IF NOT EXISTS` is supported).
**How to avoid:** Use the `PRAGMA table_info()` check pattern (see Architecture Patterns #1). This is idempotent and safe on repeated server starts.
**Warning signs:** Server startup crash on first run after schema change.

### Pitfall 2: `project_name` Empty String for Pre-existing Sessions

**What goes wrong:** Sessions loaded into `session_cost` before Phase 5 have `project_name = ''` (the DEFAULT). The history page shows them under an "unknown" group.
**Why it happens:** `project_name` is added retroactively; existing rows have no value.
**How to avoid:** Run a backfill on server startup — for all rows where `project_name = ''`, attempt to find and re-read the source JSONL file for its `cwd` field. This can be done lazily (only when history page is first loaded) or eagerly (on startup). Eager is simpler.
**Warning signs:** History page shows many "unknown" groups for all pre-existing sessions.

### Pitfall 3: Replay Mode Receiving Live SSE Events

**What goes wrong:** User navigates to `/?session_id=abc-123` (replay), but the SSE connection pushes new events from a different live session, corrupting the replayed view.
**Why it happens:** `subscribeSSE()` in `index.html` subscribes to ALL events, not session-filtered events. The SSE endpoint has no session filter.
**How to avoid:** In replay mode (`IS_REPLAY === true`), skip `subscribeSSE()` entirely. Replay is static — it calls `hydrate()` with `?session_id=` and stops.
**Warning signs:** Replayed session shows unexpected tool calls from a different project.

### Pitfall 4: Client-Side Filter Fires on Every Keystroke

**What goes wrong:** Filter input fires a new `fetch('/api/sessions?...')` request on every keypress — heavy typing causes many in-flight requests, race conditions on response ordering.
**Why it happens:** Simple `addEventListener('input', fetchSessions)` without debounce.
**How to avoid:** Debounce at 300ms (shorter than the 600ms threshold input pattern since filter UX must feel instant per the CONTEXT requirement).
**Warning signs:** Network tab shows 10+ concurrent requests while typing a project name.

### Pitfall 5: Export Endpoint Returns All Events Including PreToolUse

**What goes wrong:** Export includes duplicate rows (PreToolUse + PostToolUse for each tool call), inflating line counts.
**Why it happens:** The events table stores both `PreToolUse` and `PostToolUse` hook types.
**How to avoid:** Export query filters to `hook_type = 'PostToolUse'` only — these have `duration_ms` and `exit_status` populated, giving the complete summary per tool call.
**Warning signs:** CSV has ~2x expected number of rows with half having null duration.

### Pitfall 6: `URL.createObjectURL` Memory Leak

**What goes wrong:** Each export click creates a new blob URL that is never revoked, slowly leaking memory across a long dashboard session.
**Why it happens:** `URL.createObjectURL()` creates a permanent reference until explicitly revoked.
**How to avoid:** Call `URL.revokeObjectURL(url)` immediately after `a.click()`. The download starts asynchronously and the blob data is already captured by the browser.
**Warning signs:** Memory profiler shows growing blob URLs in a long session.

---

## Code Examples

### Schema Migration (db/schema.js)

```javascript
// Source: verified SQLite PRAGMA pattern — works on SQLite 3.51.2 in this project
// Place after CREATE TABLE IF NOT EXISTS session_cost block
function addColumnIfNotExists(db, table, col, typeDef) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().find(c => c.name === col);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
}

addColumnIfNotExists(db, 'session_cost', 'project_name', "TEXT NOT NULL DEFAULT ''");

// Add index for fast project grouping
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_session_cost_project
    ON session_cost(project_name, last_event_ts DESC)
`);
```

### Project Name Extraction (lib/jsonlWatcher.js)

```javascript
// Source: verified cwd field exists in progress/user/assistant record types
// in this codebase's actual JSONL files
import { basename } from 'node:path';

async function extractProjectName(rawRecords) {
  // rawRecords already parsed by parseJsonlFile()
  for (const r of rawRecords) {
    if (r.cwd && typeof r.cwd === 'string' && r.cwd.length > 1) {
      return basename(r.cwd); // '/Users/x/claude/observagent' -> 'observagent'
    }
  }
  return 'unknown';
}

// Modification to processFile() — add projectName parameter:
async function processFile(filePath, db, agentId = '', sessionIdOverride = null) {
  const rawRecords = await parseJsonlFile(filePath);
  const projectName = await extractProjectName(rawRecords);
  // ... rest of processFile unchanged, but upsertStmt includes project_name
}
```

### Sessions API Endpoint (routes/api.js)

```javascript
// Source: verified parameterized LIKE pattern for better-sqlite3
// Note: pass each param twice when the OR-empty-string pattern is used

fastify.get('/api/sessions', (request, reply) => {
  const {
    project = '', date_from = '', date_to = '',
    model = '', cost_min = '', cost_max = '', has_errors = '0'
  } = request.query;

  const liveThresholdMs = Date.now() - 10 * 60 * 1000; // 10 min ago
  const rows = stmtSessions.all(
    liveThresholdMs,       // for is_live calculation
    project, project,      // LIKE filter (param + repeat for OR '' check)
    date_from, date_from,
    date_to, date_to,
    model, model,
    cost_min, Number(cost_min) || 0,
    cost_max, Number(cost_max) || 0,
    Number(has_errors) || 0
  );
  reply.send(rows);
});
```

### Export Endpoint (routes/api.js)

```javascript
fastify.get('/api/sessions/:id/export', (request, reply) => {
  const { id } = request.params;

  // Session metadata
  const session = stmtSessionById.get(id);
  if (!session) return reply.code(404).send({ error: 'Session not found' });

  // Tool call events — PostToolUse only (complete calls with duration + exit_status)
  const events = stmtEventsBySession.all(id); // existing stmtBySession already in api.js

  reply.send({
    session,
    events: events.filter(e => e.hook_type === 'PostToolUse').map(e => ({
      tool_name:   e.tool_name,
      timestamp:   e.timestamp,
      duration_ms: e.duration_ms,
      exit_status: e.exit_status,
    })),
  });
});
```

### Client-Side Export (history.html script)

```javascript
// Source: standard browser File API — no library needed
async function exportSession(sessionId, format) {
  const data = await fetch(`/api/sessions/${sessionId}/export`).then(r => r.json());
  const { session, events } = data;
  const project = session.project_name || 'unknown';
  const date = (session.last_event_ts || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const safeName = project.replace(/[^a-zA-Z0-9_-]/g, '_');

  let content, mimeType, ext;

  if (format === 'jsonl') {
    content = events.map(e => JSON.stringify({ ...e, session_id: sessionId, project_name: project })).join('\n');
    mimeType = 'application/jsonl';
    ext = 'jsonl';
  } else {
    const headers = ['session_id', 'project_name', 'tool_name', 'timestamp', 'duration_ms', 'exit_status'];
    const rows = events.map(e => [
      sessionId, project, e.tool_name, e.timestamp, e.duration_ms, e.exit_status
    ]);
    content = [headers, ...rows].map(toCsvRow).join('\n');
    mimeType = 'text/csv';
    ext = 'csv';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `observagent_${safeName}_${date}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsvRow(values) {
  return values.map(v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }).join(',');
}
```

### Live Filter with Debounce (history.html script)

```javascript
// Debounce pattern — copied from existing threshold input pattern in index.html
let filterTimer;
function scheduleFilter() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 300);
}

async function applyFilters() {
  const project  = document.getElementById('filter-project').value.trim();
  const dateFrom = document.getElementById('filter-date-from').value;
  const dateTo   = document.getElementById('filter-date-to').value;

  const params = new URLSearchParams();
  if (project)  params.set('project', project);
  if (dateFrom) params.set('date_from', dateFrom + 'T00:00:00.000Z');
  if (dateTo)   params.set('date_to',   dateTo   + 'T23:59:59.999Z');
  // ... secondary filters

  const sessions = await fetch('/api/sessions?' + params).then(r => r.json());
  renderSessionList(sessions);
}

// Wire inputs
['filter-project', 'filter-date-from', 'filter-date-to'].forEach(id => {
  document.getElementById(id).addEventListener('input', scheduleFilter);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ALTER TABLE ADD COLUMN IF NOT EXISTS` | `PRAGMA table_info()` check then `ALTER TABLE` | N/A — SQLite never supported IF NOT EXISTS on ADD COLUMN | Prevents startup crash |
| Library-based CSV (e.g., fast-csv) | Hand-rolled RFC 4180 CSV | N/A | No new dependency for simple tabular export |
| `<details>` + JavaScript toggle | `<details>`/`<summary>` native (no JS needed) | HTML5 — now universal | Simpler code, accessible by default |

**Deprecated/outdated:**
- `XHR` for fetch calls: Use `fetch()` — already used throughout this codebase.
- `window.open('data:text/csv,...')` for download: Deprecated in Chrome; use Blob + `createObjectURL` instead.

---

## Open Questions

1. **Backfill strategy for existing sessions without `project_name`**
   - What we know: All sessions loaded before Phase 5 have `project_name = ''`
   - What's unclear: Should we re-scan JSONL files on startup to populate these, or show "unknown" and let future runs populate organically?
   - Recommendation: Eager backfill on server startup — iterate `session_cost` rows with `project_name = ''`, find the corresponding JSONL file in `~/.claude/projects/`, extract `cwd`, update. This runs once and is silent on subsequent starts. Acceptable startup cost (< 1 second for typical session counts).

2. **Live session detection threshold**
   - What we know: A session with a tool event in the last 10 min is heuristically "live"
   - What's unclear: Users who leave Claude Code open but idle will look "live" for 10 min after last tool use
   - Recommendation: 10 minutes is acceptable — it matches the 5-min orphaned call TTL with a buffer. No alternative to this heuristic without a persistent "session active" flag.

3. **History page route: `/history` vs tab**
   - What we know: CONTEXT.md marks this as Claude's Discretion
   - Recommendation: Use `/history` as a separate route. Serves `history.html` via a second `readFileSync` at startup. Replay goes to `/?session_id=X`. This avoids state management complexity of tabs.

---

## Sources

### Primary (HIGH confidence)
- SQLite PRAGMA table_info — verified directly against SQLite 3.51.2 in this codebase
- `better-sqlite3` existing project patterns — verified in `db/schema.js`, `routes/api.js`
- JSONL `cwd` field — verified by scanning `~/.claude/projects/` JSONL files in this codebase
- Browser `URL.createObjectURL` — standard W3C File API, HIGH confidence
- `<details>`/`<summary>` — HTML5 standard, used in existing `index.html` agent sections

### Secondary (MEDIUM confidence)
- SQLite parameterized LIKE with `'%' || ? || '%'` — confirmed via [SQLite official expression docs](https://www.sqlite.org/lang_expr.html) and [SQLite LIKE tutorial](https://www.sqlitetutorial.net/sqlite-like/)
- RFC 4180 CSV escaping — standard, verified via [GeeksForGeeks CSV in JS](https://www.geeksforgeeks.org/how-to-create-and-download-csv-file-in-javascript/)
- Fastify serving second HTML page with `readFileSync` at startup — same pattern already in `routes/dashboard.js`; [Fastify routes docs](https://fastify.dev/docs/latest/Reference/Routes/)

### Tertiary (LOW confidence)
- None — all key findings verified against the actual codebase or official specs.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all findings verified against existing project code
- Architecture: HIGH — project_name derivation verified by scanning actual JSONL files; migration pattern verified against SQLite 3.51.2
- Pitfalls: HIGH — SQLite `IF NOT EXISTS` limitation confirmed with live test; other pitfalls are derived from existing code patterns

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable domain — SQLite, browser File API, HTML5 native elements do not change rapidly)
