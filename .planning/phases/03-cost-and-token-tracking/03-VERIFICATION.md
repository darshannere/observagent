---
phase: 03-cost-and-token-tracking
verified: 2026-02-26T00:00:00Z
status: human_needed
score: 11/11 automated must-haves verified
human_verification:
  - test: "Cost panel shows real session cost in $0.000000 format with all four token type counts"
    expected: "Session row from JSONL files displayed; In/Out/Cache↑/Cache↓ counts visible and non-zero after active session"
    why_human: "Requires live JSONL files to exist in ~/.claude/projects/ and real session data to render"
  - test: "Context fill bar color changes: green below 80%, yellow 80-94%, red 95%+"
    expected: "Bar transitions color correctly at each threshold boundary"
    why_human: "Color rendering requires visual browser inspection; cannot verify CSS class application produces correct color without rendering"
  - test: "Budget alert banner appears with specific message when threshold is exceeded and disappears when cleared"
    expected: "Setting budget to $0.01 shows 'Session cost $X.XXXXXX exceeded budget $0.01'; clearing input hides banner"
    why_human: "Interactive UI behavior with dynamic DOM state; requires browser interaction"
  - test: "Threshold values persist across server restart"
    expected: "Budget threshold set to $5.00 survives server stop/start; input field shows 5 after reload"
    why_human: "Requires starting, stopping, and restarting the server and observing persisted SQLite state in UI"
  - test: "Cost panel updates live when new tool calls happen (no page refresh)"
    expected: "Triggering a Claude Code tool call causes cost and token values to update within ~2 seconds"
    why_human: "Requires live JSONL file writes from an active Claude Code session and real-time SSE delivery"
  - test: "Phase 2 tool call log still works; no JavaScript console errors"
    expected: "Tool call log panel shows live events; browser console shows no errors"
    why_human: "Regression test requiring visual inspection and active tool call in browser"
---

# Phase 3: Cost and Token Tracking — Verification Report

**Phase Goal:** Developers can see exactly what a session costs in dollars and tokens, with real-time updates and a warning before they burn through their budget
**Verified:** 2026-02-26
**Status:** human_needed — all automated checks passed; 6 items require human verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Token usage broken down into input, output, cache read, cache write counts per session — updated live | VERIFIED | `tok-input`, `tok-output`, `tok-cache-read`, `tok-cache-write` elements in HTML; `handleCostUpdate()` updates all four on SSE; `hydrateCost()` loads from `/api/cost` |
| 2 | Context window fill percentage bar turns warning color at 80%+ | VERIFIED | `progress-fill.warning` CSS at 80%, `.danger` at 95%; JS logic at line 621: `pct >= 95 ? ' danger' : pct >= 80 ? ' warning' : ''` |
| 3 | Running dollar cost total updates in real-time using model-specific pricing rates | VERIFIED | PRICING map in costEngine.js; `cost_update` SSE event calls `handleCostUpdate(msg)` which updates `total_cost_usd` and calls `renderCostPanel()`; SSE branch at line 515 |
| 4 | User can set a cost budget threshold and see a visible in-dashboard alert when exceeded | VERIFIED | `renderAlertBanner()` checks `budget_threshold_usd`; threshold inputs POST to `/api/config`; `observagent_config` table stores persistently |
| 5 | ObservAgent automatically discovers JSONL session files in ~/.claude/projects/ with no manual path config | VERIFIED | `startJsonlWatcher()` uses `os.homedir()` + `.claude/projects`; recursive `readdir` on startup; graceful no-op if path missing |

**Score:** 5/5 truths verified (automated)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db/schema.js` | session_cost and observagent_config tables | VERIFIED | `CREATE TABLE IF NOT EXISTS session_cost` at line 22; `CREATE TABLE IF NOT EXISTS observagent_config` at line 36; index on `last_event_ts` present |
| `lib/costEngine.js` | PRICING map, CONTEXT_WINDOWS map, computeCost(), extractUsageRecords(), getContextFillPercent(), aggregateSessionCost() | VERIFIED | All 6 exports present; 159 lines of substantive logic; no stubs |
| `lib/jsonlWatcher.js` | startJsonlWatcher(db) — auto-discovery, watching, SQLite upsert, SSE broadcast | VERIFIED | 213 lines; all four stages implemented (parse, extract, aggregate, upsert, broadcast); debounce at 300ms; recursive watch |
| `routes/api.js` | /api/cost GET, /api/config GET+POST endpoints | VERIFIED | All three routes present at lines 48, 57, 66; prepared statements for session_cost and observagent_config |
| `server.js` | startJsonlWatcher wired into server startup | VERIFIED | Import at line 9; call inside `fastify.listen` callback at line 37 |
| `public/index.html` | cost panel DOM, CSS styles, JS hydration, SSE handler, threshold inputs, alert banner | VERIFIED | `id="cost-panel"` at line 285; all elements present; CSS cost panel section starts at line 165; JS logic 565-759 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/jsonlWatcher.js` | `lib/costEngine.js` | `import { extractUsageRecords, aggregateSessionCost }` | WIRED | Import at line 6; both functions called in `processFile()` at lines 74, 78 |
| `lib/jsonlWatcher.js` | `lib/sseClients.js` | `import { broadcast }` | WIRED | Import at line 7; `broadcast({ type: 'cost_update', ... })` called at line 118 |
| `lib/jsonlWatcher.js` | `session_cost` table | `INSERT INTO session_cost ... ON CONFLICT(session_id) DO UPDATE SET` | WIRED | Full upsert SQL at lines 85-102; executed via `upsertStmt.run()` at line 105 |
| `routes/api.js` | `session_cost` table | `stmtSessionCost.all()` and `stmtTodayCost.get()` | WIRED | `SELECT FROM session_cost ORDER BY updated_at DESC` at line 20; `COALESCE(SUM(total_cost_usd), 0)` at line 28 |
| `routes/api.js` | `observagent_config` table | `stmtGetConfig` / `stmtSetConfig` prepared statements | WIRED | `SELECT value FROM observagent_config WHERE key = ?` at line 35; `INSERT OR REPLACE INTO observagent_config` at line 39 |
| `server.js` | `lib/jsonlWatcher.js` | `startJsonlWatcher(db)` called after `fastify.listen` | WIRED | Import at line 9; call at line 37 inside listen callback |
| `public/index.html` cost JS | `/api/cost` | `fetch('/api/cost')` in `hydrateCost()` on DOMContentLoaded | WIRED | `fetch('/api/cost').then(r => r.json())` at line 677; called from `DOMContentLoaded` at line 757 |
| `public/index.html` SSE handler | `cost_update` SSE event | `msg.type === 'cost_update'` branch in `es.onmessage` | WIRED | Line 515: `if (msg.type === 'cost_update') { handleCostUpdate(msg); return; }` inside `subscribeSSE()` |
| threshold inputs | `/api/config` POST | `fetch('/api/config', { method: 'POST', ... })` on input change | WIRED | `wireThresholdInputs()` at line 724; `fetch('/api/config', ...)` at line 740; 600ms debounce |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SETUP-02 | 03-01 | Auto-detect session files in ~/.claude/projects/ without manual path config | SATISFIED | `startJsonlWatcher` uses `os.homedir()` join; gracefully no-ops if dir absent |
| COST-01 | 03-01, 03-02, 03-03 | Token usage (input, output, cache read, cache write) per agent and session | SATISFIED | All four token types extracted in `costEngine.js`, stored in `session_cost`, displayed in four HTML elements |
| COST-02 | 03-01, 03-02, 03-03 | Context window fill percentage with visual warning at 80%+ | SATISFIED | `getContextFillPercent()` computes 0-100; CSS `.warning` at 80%, `.danger` at 95%; JS applies class at threshold |
| COST-03 | 03-01, 03-02, 03-03 | Live running dollar cost total with real-time updates | SATISFIED | `computeCost()` uses PRICING map; `cost_update` SSE events trigger `renderCostPanel()`; no page refresh needed |
| COST-04 | 03-02, 03-03 | Cost budget threshold with in-dashboard alert when exceeded | SATISFIED | `renderAlertBanner()` checks threshold; `observagent_config` table persists across restart; POST /api/config stores value |

**Orphaned requirements check:** REQUIREMENTS.md maps only SETUP-02, COST-01, COST-02, COST-03, COST-04 to Phase 3. All five are claimed by plans. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `public/index.html` | 163 | CSS plan used `--fg`/`--muted` variable names, but implementation correctly uses `--text`/`--text-muted` matching `:root` definitions | INFO | No impact — adaptation is correct |
| `lib/jsonlWatcher.js` | 84 | `upsertStmt` initialized lazily on first `processFile()` call, not at `startJsonlWatcher()` time | INFO | Correct pattern given `db` is available; no thread safety issue with synchronous better-sqlite3 |

No blockers or warnings found. No TODO/FIXME/placeholder comments. No stub implementations. No empty handlers. No ignored fetch responses.

---

### Human Verification Required

#### 1. Cost data from real JSONL files

**Test:** Start server (`node server.js`), open `http://127.0.0.1:4999/`. Confirm the Cost & Tokens panel shows a non-zero session cost and non-zero token counts (not all zeros).
**Expected:** Session cost shows a real dollar value in `$X.XXXXXX` format; In/Out/Cache↑/Cache↓ show non-zero counts from existing JSONL sessions.
**Why human:** Requires real JSONL files in `~/.claude/projects/` to exist and be parseable. Automated checks confirmed the pipeline is wired but cannot inject live session data.

#### 2. Context fill bar color coding

**Test:** With the dashboard open, observe the context fill bar color. If below 80%, temporarily set a low ctx alert threshold (below current fill %) via the "Ctx alert (%)" input to force the warning state.
**Expected:** Bar is green when fill < 80%, turns yellow (gold) at 80-94%, turns red at 95%+. Color transition is smooth (CSS transition 0.3s).
**Why human:** CSS class application to color rendering requires visual inspection in a browser. Cannot verify rendered color from source alone.

#### 3. Budget alert banner behavior

**Test:** In the "Budget ($)" input, type a value lower than the current session cost (e.g., `0.01`). Wait 600ms for debounce. Observe the top of the cost panel.
**Expected:** A red alert banner appears showing the exact message format: `Session cost $X.XXXXXX exceeded budget $0.01`. Clearing the input field hides the banner.
**Why human:** Dynamic DOM visibility and message formatting require interactive browser verification.

#### 4. Threshold persistence across server restart

**Test:** Set the budget threshold to `5.00`. Stop the server (Ctrl+C). Restart it (`node server.js`). Reload `http://127.0.0.1:4999/`.
**Expected:** The "Budget ($)" input shows `5` (value loaded from SQLite observagent_config table via `/api/config`).
**Why human:** Requires an actual server restart cycle and browser reload to verify SQLite persistence through the full round-trip.

#### 5. Live cost update without page refresh

**Test:** Open the dashboard. In a separate terminal, trigger any Claude Code tool call in the current session.
**Expected:** The cost panel updates (cost value and token counts change) within approximately 2 seconds without any page refresh.
**Why human:** Requires an active Claude Code session generating JSONL writes; the SSE pipeline cannot be exercised programmatically in a static check.

#### 6. Phase 2 regression — tool call log still works

**Test:** With the dashboard open, trigger a tool call. Confirm the Tool Call Log panel (top-left) shows the new event. Open browser dev tools and confirm no JavaScript console errors exist.
**Expected:** Tool call appears in log; console shows no errors (particularly no `ReferenceError: handleCostUpdate is not defined` or similar).
**Why human:** Requires live tool calls and browser console inspection.

---

## Summary

All six automated must-haves from the Phase 3 plans are fully verified:

- `db/schema.js` — `session_cost` and `observagent_config` tables created with correct DDL, index, and idempotent `IF NOT EXISTS` guards.
- `lib/costEngine.js` — Complete pure computation module: PRICING (10 models), CONTEXT_WINDOWS, dedup rule enforced (`stop_reason === null` skip), cost formula correct (per-MTok pricing), `getContextFillPercent` returns 0-100 integer, `aggregateSessionCost` sums all records per session.
- `lib/jsonlWatcher.js` — Full pipeline: `parseJsonlFile` with readline, 300ms debounce map, `processFile` upserts to SQLite via INSERT OR REPLACE, broadcasts `cost_update` SSE event, `startJsonlWatcher` auto-discovers `~/.claude/projects/**/*.jsonl` using `os.homedir()` (no hardcoded paths), recursive watch for new files.
- `routes/api.js` — `/api/cost` returns sessions + todayTotal; `/api/config` GET returns null-safe threshold values; `/api/config` POST accepts null to clear thresholds; all four prepared statements initialized at registration time.
- `server.js` — `startJsonlWatcher(db)` imported and called inside `fastify.listen` callback (after server ready, before blocking JSONL parse).
- `public/index.html` — Complete cost panel: alert banner (display:none until threshold exceeded), session/today cost in $0.000000 format, four token types, context fill bar with CSS color transitions, model breakdown grouped by model, threshold inputs with 600ms debounce posting to `/api/config`. SSE `cost_update` branch correctly integrated into the existing `es.onmessage` handler (no second EventSource created). CSS variables correctly use `--text`/`--text-muted` matching the `:root` definitions.

All 5 key links between components are fully wired. No stubs, placeholders, or empty implementations detected. No TODO/FIXME comments in any modified file.

The 6 remaining items require human browser verification because they involve visual rendering, live data from JSONL files, and interactive behavior that cannot be confirmed through static code analysis.

---

_Verified: 2026-02-26_
_Verifier: Claude (gsd-verifier)_
