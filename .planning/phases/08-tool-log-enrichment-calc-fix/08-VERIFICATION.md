---
phase: 08-tool-log-enrichment-calc-fix
verified: 2026-03-02T00:00:00Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 8: Tool Log Enrichment + Calc Fix Verification Report

**Phase Goal:** Enrich tool log entries with per-call summaries (TOOL-01 through TOOL-05) and fix context window fill % calculation discrepancy (CALC-01)
**Verified:** 2026-03-02
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | relay.py builds a tool_summary string for every PreToolUse event based on tool type | VERIFIED | `_build_tool_summary()` present at line 63 in hooks/relay.py; all 9 named tool types plus mcp__ catch-all confirmed passing live tests |
| 2  | tool_summary field is included in every POST body sent to /ingest | VERIFIED | `event["tool_summary"] = _build_tool_summary(...)` at relay.py line 132 |
| 3  | The events table has a tool_summary TEXT column | VERIFIED | `addColumnIfNotExists(db, 'events', 'tool_summary', 'TEXT')` at schema.js line 75; runtime check confirms column exists with correct type |
| 4  | relay.py never extracts content, new_str, old_str, or new_content | VERIFIED | Live test confirms none of these fields leak into summary output; Edit tool returns only file_path |
| 5  | relay.py still exits 0 and never writes to stdout/stderr | VERIFIED | sys.exit(0) at relay.py line 164; all exceptions caught silently |
| 6  | tool_summary from relay POST body is stored in the events table | VERIFIED | ingest.js line 43: `tool_summary: raw.tool_summary \|\| null`; writeQueue INSERT includes tool_summary column; runtime test confirms end-to-end storage |
| 7  | GET /api/events returns tool_summary on every event row | VERIFIED | stmtAll and stmtBySession both SELECT tool_summary in routes/api.js lines 7 and 24 |
| 8  | CSV export from history page includes a tool_summary column | VERIFIED | history.html lines 527-528: headers array includes 'tool_summary'; rows include `e.tool_summary \|\| ''` |
| 9  | full_tool_input_enabled=0 is seeded in observagent_config on server start | VERIFIED | schema.js line 78: INSERT OR IGNORE with default '0'; runtime check confirms key present with value '0' |
| 10 | ingest.js checks full_tool_input_enabled before logging raw tool_input | VERIFIED | ingest.js lines 48-51: conditional guard queries observagent_config; only logs when value === '1' |
| 11 | Each tool log row shows tool_summary second line in monospace gray | VERIFIED | .tool-summary CSS class (index.html line 102): font-size:10px, color:var(--text-muted), text-overflow:ellipsis; createRow() conditionally appends summaryEl at line 746 |
| 12 | Long tool_summary strings truncated with ellipsis at row width | VERIFIED | .tool-summary has `text-overflow: ellipsis; overflow: hidden; white-space: nowrap` |
| 13 | Hovering a row with tool_summary shows full string via native title tooltip | VERIFIED | summaryEl.title = event.tool_summary at index.html line 750 |
| 14 | Timeline view chip shows tool_summary as a title tooltip on hover | VERIFIED | timelineAddPreToolUse() stores toolSummary at line 1532; _tlRowHtml() computes chipTitle and applies it to chip span at lines 1583-1584 |
| 15 | Context fill % shown in the dashboard uses effectiveWindow = 160K (not 200K) | VERIFIED | AUTOCOMPACT_BUFFER=40_000 at costEngine.js line 100; effectiveWindow = contextWindow - AUTOCOMPACT_BUFFER at line 119; runtime test confirms 80K tokens = 50% (not 40%) |
| 16 | An info icon appears next to the context fill % in the dashboard | VERIFIED | index.html line 594: span.info-icon immediately after #ctx-pct with tooltip text "ObservAgent calculates context fill from API token usage..." |
| 17 | api_calls table exists with session_id, timestamp_ms, input_tokens, output_tokens columns and UNIQUE constraint | VERIFIED | schema.js lines 59-68: CREATE TABLE IF NOT EXISTS api_calls with UNIQUE(session_id, timestamp_ms) and index; runtime test confirms dedup via INSERT OR IGNORE |
| 18 | jsonlWatcher inserts per-API-call token records and GET /api/events returns nearest_input/output_tokens | VERIFIED | jsonlWatcher.js lines 97-112: insertApiCallStmt inserts each usageRecord; api.js stmtAll and stmtBySession include correlated subqueries for nearest_input_tokens and nearest_output_tokens; index.html createRow() renders .token-counts span when non-null |

**Score:** 18/18 truths verified

---

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `hooks/relay.py` | `_build_tool_summary()` function + `event['tool_summary']` wired in main() | VERIFIED | Function at line 63; wiring at line 132; exits 0; no forbidden field extraction |
| `db/schema.js` | tool_summary TEXT column via addColumnIfNotExists(); api_calls table with index; full_tool_input_enabled seeded | VERIFIED | Lines 75, 59-68, 78 respectively |
| `routes/ingest.js` | event.tool_summary mapped from raw.tool_summary; full_tool_input_enabled conditional guard | VERIFIED | Lines 43, 48-51 |
| `lib/writeQueue.js` | INSERT statement includes tool_summary column | VERIFIED | Lines 9-10 |
| `routes/api.js` | stmtAll, stmtBySession, stmtExportEvents include tool_summary; nearest_input_tokens and nearest_output_tokens subqueries | VERIFIED | Lines 7, 24, 126, 8-17, 25-34 |
| `public/history.html` | CSV export has tool_summary header and values | VERIFIED | Lines 527-528 |
| `public/index.html` | .tool-summary CSS + createRow() second line; .log-row-main wrapper; timeline toolSummary + chipTitle; .token-counts badge; info-icon with tooltip | VERIFIED | Lines 75-110 (CSS), 706-755 (createRow), 1529-1538 (timeline), 1581-1584 (chipTitle), 262-268 (info-icon CSS), 594 (HTML element) |
| `lib/costEngine.js` | getContextFillPercent() uses AUTOCOMPACT_BUFFER (40K) effectiveWindow | VERIFIED | Lines 100, 119-120 |
| `lib/jsonlWatcher.js` | Inserts per-API-call records to api_calls table on each JSONL record processed | VERIFIED | Lines 97-113; lazy-init insertApiCallStmt, INSERT OR IGNORE per usageRecord |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| relay.py main() | JSON POST body | `event["tool_summary"] = _build_tool_summary(...)` | WIRED | relay.py line 132 |
| db/schema.js initDb() | events table | `addColumnIfNotExists(db, 'events', 'tool_summary', 'TEXT')` | WIRED | schema.js line 75 |
| routes/ingest.js event.tool_summary | lib/writeQueue.js INSERT | `tool_summary: raw.tool_summary \|\| null` + @tool_summary binding | WIRED | ingest.js line 43; writeQueue.js lines 9-10 |
| routes/api.js stmtAll | GET /api/events JSON | SELECT includes tool_summary column + nearest token subqueries | WIRED | api.js lines 7, 8-17 |
| db/schema.js initDb() | observagent_config table | INSERT OR IGNORE key=full_tool_input_enabled value=0 | WIRED | schema.js line 78 |
| lib/jsonlWatcher.js JSONL record processing | api_calls table INSERT | INSERT OR IGNORE per usageRecord with session_id + timestamp_ms | WIRED | jsonlWatcher.js lines 97-113 |
| routes/api.js GET /api/events | api_calls table correlated subquery | Subquery on ABS(timestamp_ms - e.timestamp) < 30000 | WIRED | api.js lines 8-17, 25-34 |
| lib/costEngine.js getContextFillPercent() | effectiveWindow | contextWindow - AUTOCOMPACT_BUFFER (40K) | WIRED | costEngine.js lines 100, 119 |
| public/index.html context fill display | info tooltip | span.info-icon with title attribute | WIRED | index.html line 594 |
| createRow() in index.html | .tool-summary DOM element | event.tool_summary check — only added when truthy | WIRED | index.html lines 746-752 |
| timelineAddPreToolUse() in index.html | timelineState.calls entry | `toolSummary: ev.tool_summary \|\| null` | WIRED | index.html line 1532 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TOOL-01 | 08-01, 08-02, 08-03 | Bash tool calls show command string in log row (truncated at 200 chars) | SATISFIED | relay.py returns "command: " + cmd[:200]; stored in events; rendered in createRow() as .tool-summary second line |
| TOOL-02 | 08-01, 08-02, 08-03 | Read, Write, Edit tool calls show file path in log row | SATISFIED | relay.py returns "file_path: " + path; stored; rendered |
| TOOL-03 | 08-01, 08-02, 08-03 | Grep and Glob tool calls show search pattern in log row | SATISFIED | relay.py returns "pattern: " + pattern; stored; rendered |
| TOOL-04 | 08-01, 08-02, 08-03 | Task tool calls show task description and subagent_type in log row | SATISFIED | relay.py returns "description: X \| subagent_type: Y"; stored; rendered |
| TOOL-05 | 08-05 | Each tool call log row shows input + output token counts from corresponding API call | SATISFIED | api_calls table feeds nearest_input_tokens/nearest_output_tokens to GET /api/events; createRow() renders .token-counts badge when non-null |
| CALC-01 | 08-04 | Context window fill % calculation matches Claude Code's displayed values | SATISFIED | AUTOCOMPACT_BUFFER=40K applied; effectiveWindow=160K for 200K models; runtime test confirms 80K tokens = 50% (was 40% before fix); info-icon tooltip explains residual discrepancy |

All 6 Phase 8 requirement IDs (TOOL-01 through TOOL-05, CALC-01) are accounted for and satisfied.

---

### Anti-Patterns Found

No TODO/FIXME/PLACEHOLDER/stub anti-patterns found in any Phase 8 modified file. No return-null or empty-handler stubs. All implementations are substantive and wired.

---

### Human Verification Required

The following items cannot be verified programmatically:

#### 1. Tool summary second line visual appearance

**Test:** Start the ObservAgent server, trigger a Bash tool call from Claude Code, open the dashboard
**Expected:** The tool log row shows a gray monospace second line beneath the tool name/timestamp/duration line reading "command: <actual command>"
**Why human:** Visual layout and CSS rendering cannot be verified from code inspection alone

#### 2. Token count badge appearance on historical rows

**Test:** After a live Claude Code session, load the dashboard and look at historical rows in the tool log
**Expected:** Rows where an API call was found within 30 seconds show a compact "X.XK in / YYY out" badge aligned to the right of the main line
**Why human:** Requires a live session with actual JSONL data and the 30-second proximity matching to fire

#### 3. Timeline chip tooltip on hover

**Test:** Hover over a Gantt-style timeline chip in the timeline view after a tool call has been recorded
**Expected:** Native browser tooltip shows the tool summary string (e.g., "command: git status")
**Why human:** Native title attribute tooltip behavior requires browser interaction

#### 4. Context fill % value closer to Claude Code display

**Test:** Start a Claude Code session, note the context % in Claude Code's UI, then compare with ObservAgent dashboard
**Expected:** ObservAgent's context fill % should now be much closer to Claude Code's displayed value (within a few percent rather than ~10% lower)
**Why human:** Requires a live session with a real model and actual token accumulation to compare

---

### Gaps Summary

No gaps found. All must-haves from all five plans (08-01 through 08-05) have been verified as implemented, substantive, and correctly wired end-to-end in the codebase.

---

_Verified: 2026-03-02_
_Verifier: Claude (gsd-verifier)_
