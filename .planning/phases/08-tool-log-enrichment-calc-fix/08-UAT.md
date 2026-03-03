---
status: diagnosed
phase: 08-tool-log-enrichment-calc-fix
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md
started: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Tool Summary in Relay
expected: Relay.py extracts tool_summary for each tool call (Bash, Read, Write, Edit, Grep, Glob, Task, WebFetch, etc.) and sends it in the POST body to /ingest.
result: pass

### 2. Tool Summary Stored in Database
expected: Events table has tool_summary column populated via migration; old rows have NULL, new rows have the summary string.
result: pass

### 3. Tool Summary in API Response
expected: GET /api/events returns tool_summary field on every event row.
result: pass

### 4. Tool Summary in CSV Export
expected: Session CSV export includes tool_summary as the 7th column (empty for old rows).
result: pass

### 5. Tool Log Renders Summary Second Line
expected: Dashboard tool log shows tool_summary as a muted monospace second line with ellipsis truncation; native tooltip shows full text on hover.
result: pass

### 6. Timeline Chip Tooltip
expected: Hovering over a timeline chip shows the full tool summary string via native title attribute.
result: issue
reported: "doesnt work"
severity: major

### 7. Context Fill Calculation Accurate
expected: Context fill % now accounts for 40K autocompact buffer (effective 160K denominator on 200K model), showing more accurate percentage closer to Claude Code's display.
result: pass

### 8. Context Fill Info Tooltip
expected: Info icon (ⓘ) appears next to context fill % with native browser tooltip explaining the potential residual discrepancy.
result: issue
reported: "there is a tooltip, when i hover, it becomes a question mark, but no text comes up"
severity: minor

### 9. Token Count Badge on Historical Rows
expected: Tool log shows compact token badge (e.g., "1.2K in / 456 out") on historical rows that have nearby api_call data.
result: issue
reported: "recent ones have token badge, but when there is a second line (tool summary), there is no token in/out text"
severity: major

### 10. API Calls Table and JSONL Watcher
expected: api_calls table exists with session_id, timestamp_ms, input_tokens, output_tokens; jsonlWatcher inserts records on JSONL reparse.
result: issue
reported: "table exists but most recent input_tokens are just 1, token counts are wrong"
severity: major

### 11. Full Tool Input Toggle
expected: full_tool_input_enabled config is seeded to 0 by default; raw tool_input is NOT logged unless toggle is enabled via direct DB update.
result: pass

## Summary

total: 11
passed: 7
issues: 4
pending: 0
skipped: 0

## Gaps

- truth: "Hovering over a timeline chip shows the full tool summary string via native title attribute"
  status: failed
  reason: "User reported: doesnt work"
  severity: major
  test: 6
  root_cause: "tool_summary is null for historical rows (pre-migration) and any unrecognized tool names. Rendering code is correct — chipTitle logic in _tlRowHtml() only emits title attribute when toolSummary is truthy. Fix: fall back to tool name as tooltip text when tool_summary is null so all chips have useful hover info."
  artifacts:
    - path: "public/index.html"
      issue: "_tlRowHtml() emits no title attribute when toolSummary is null"
  missing:
    - "Fallback: show tool name in chip title when tool_summary is null"

- truth: "Token count badge (e.g. '1.2K in / 456 out') appears on every row that has nearby api_call data, including rows with a tool_summary second line"
  status: failed
  reason: "User reported: recent ones have token badge, but when there is a second line (tool summary), there is no token in/out text"
  severity: major
  test: 9
  root_cause: ".log-row-main has overflow: hidden which clips the rightmost flex child (token badge) when tool name + ts + duration fill the container. Fix: move overflow: hidden from .log-row-main to .tool-name so tool name truncates with ellipsis instead."
  artifacts:
    - path: "public/index.html"
      issue: ".log-row-main overflow: hidden clips .token-counts badge"
  missing:
    - "Move overflow: hidden + text-overflow: ellipsis to .tool-name, add min-width: 0 to .log-row-main"

- truth: "api_calls table rows have accurate input_tokens and output_tokens (not 1)"
  status: failed
  reason: "User reported: table exists but most recent input_tokens are just 1, token counts are wrong"
  severity: major
  test: 10
  root_cause: "extractUsageRecords() in costEngine.js deduplicates streaming records using stop_reason === null filter, but ALL Claude Code JSONL assistant records have stop_reason: null. Only tiny streaming-start preview records (input_tokens: 1-4) survive. Fix: dedup by message ID keeping last record per ID (which has final accumulated token counts)."
  artifacts:
    - path: "lib/costEngine.js"
      issue: "stop_reason dedup filter kills all real token count records"
  missing:
    - "Replace stop_reason filter with last-record-per-message-ID dedup in extractUsageRecords()"

- truth: "Info icon (ⓘ) next to context fill % shows tooltip text explaining the discrepancy on hover"
  status: failed
  reason: "User reported: there is a tooltip, when i hover, it becomes a question mark, but no text comes up"
  severity: minor
  test: 8
  root_cause: ".ctx-label is display:flex justify-content:space-between. The ⓘ span is a third flex child, rendering at zero width — cursor: help fires but hit-box is zero so browser never triggers the title tooltip. Fix: wrap ctx-pct and info-icon together in a single span so they share one flex slot."
  artifacts:
    - path: "public/index.html"
      issue: "info-icon is third flex child in space-between container, zero effective width"
  missing:
    - "Wrap <span id=ctx-pct> and <span class=info-icon> in a container span"
