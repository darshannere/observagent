---
phase: 05-session-history-and-discovery
plan: "04"
subsystem: frontend
tags: [history-page, filter-bar, session-cards, export, dashboard]
dependency_graph:
  requires: [05-02, 05-03]
  provides: [history-page, /history-route]
  affects: [routes/dashboard.js, public/history.html]
tech_stack:
  added: []
  patterns: [details-summary-collapsible, debounced-filter, blob-download, readFileSync-startup]
key_files:
  created:
    - public/history.html
  modified:
    - routes/dashboard.js
decisions:
  - "details/summary HTML elements used for native collapsible project groups — no JS state management needed, collapsed by default without JavaScript"
  - "escHtml() helper added to history.html for XSS safety on all user-supplied data rendered into innerHTML"
  - "Export helpers (toCsvRow, triggerDownload, exportSession) copied verbatim from index.html — history.html is a standalone page, shared code via copy avoids module dependency"
  - "historyHtml readFileSync at module load (not per-request) — zero I/O overhead per request, consistent with existing html pattern in dashboard.js"
metrics:
  duration: ~8min
  completed_date: "2026-02-27"
  tasks_completed: 2
  files_modified: 2
---

# Phase 05 Plan 04: Session History Page Summary

**One-liner:** Standalone history.html with debounced filter bar, native collapsible project groups, session cards with replay links and JSONL/CSV export, wired to new /history Fastify route in dashboard.js.

## Tasks Completed

| # | Name | Files | Status |
|---|------|-------|--------|
| 1 | Create public/history.html — filter bar, project groups, session cards, export | public/history.html | Done |
| 2 | Add /history route to routes/dashboard.js | routes/dashboard.js | Done |

## What Was Built

### public/history.html

A complete, standalone dark-themed HTML page that:

- Matches the existing dashboard aesthetics with identical CSS custom properties (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent-blue`, `--accent-green`, `--accent-red`, `--accent-amber`)
- **Nav bar** (48px, sticky): "ObservAgent — Session History" title left, "Live Dashboard" link right
- **Filter bar** (two rows):
  - Primary: date-from, date-to, project text search, "More Filters" button
  - Secondary (hidden by default): cost-min, cost-max, model text input, has-errors checkbox
- **Filter logic**: 300ms debounce via `scheduleFilter()` — `applyFilters()` builds `URLSearchParams` and fetches `/api/sessions`
- **renderSessionList()**: groups sessions by `project_name`, sorts live sessions first within each group and groups with live sessions at the top, renders native `<details>` elements (collapsed by default — no `open` attribute)
- **Session cards**: date/time, model, cost (amber), optional ERRORS badge (red), LIVE badge (green, links to `/`) for live sessions
- **Card click**: navigates to `/?session_id=SESSION_ID` for replay mode
- **Export buttons**: JSONL and CSV buttons per card call `exportSession()` with event propagation stopped
- **Export functions**: `toCsvRow`, `triggerDownload`, `exportSession` copied from index.html — identical logic, standalone file
- **Empty state**: "No sessions found. Run a Claude Code session to see it here." centered in `--text-muted`
- **Error state**: red error message if fetch fails
- **XSS safety**: `escHtml()` helper sanitizes all dynamic strings inserted into innerHTML

### routes/dashboard.js

Extended with:
```javascript
const historyHtml = readFileSync(join(__dirname, '../public/history.html'), 'utf8');
// ...
fastify.get('/history', (request, reply) => {
  reply.type('text/html').send(historyHtml);
});
```
Follows the exact same pattern as the existing `/` route. Both files read once at startup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Added escHtml() XSS sanitizer**
- **Found during:** Task 1 — history.html uses innerHTML to render session data from the API
- **Issue:** session_id, project_name, model strings from DB rendered as HTML via string concatenation — XSS risk if any field contains `<script>` or similar
- **Fix:** Added `escHtml()` helper wrapping all dynamic values in innerHTML-rendered card HTML
- **Files modified:** public/history.html
- **Commit:** (included in Task 1 commit)

None of the plan's core logic was changed — deviations were additive.

## Key Decisions Made

1. **Native `<details>`/`<summary>` for collapsible groups** — Zero JavaScript state, browser handles open/close natively. Collapsed by default because no `open` attribute is set.

2. **`escHtml()` added for XSS safety** — history.html renders API data into innerHTML via string concatenation. All 7 dynamic fields (session_id, project_name, model, cost, date, groupMeta) are escaped.

3. **Export helpers copied from index.html** — history.html is standalone (not a module), so `toCsvRow`, `triggerDownload`, and `exportSession` are duplicated. This avoids creating a shared module dependency not called for by the plan spec.

4. **`historyHtml` at module scope** — Read once on server start, served synchronously. Identical pattern to `html` for index.html. Zero per-request I/O.

## Self-Check

- [x] `public/history.html` exists
- [x] `routes/dashboard.js` contains `historyHtml` readFileSync and `GET /history` route
- [x] `applyFilters` present in history.html
- [x] `renderSessionList` present in history.html
- [x] `exportSession` present in history.html
- [x] `filter-project` input present in history.html
- [x] `project-group` class present on details elements
- [x] "More Filters" button present in history.html
- [x] `IS_REPLAY` NOT present in history.html (correct — history.html is not a replay page)
- [x] `createObjectURL` present in history.html (via `triggerDownload`)
