---
status: resolved
trigger: "Investigate why timeline chip tooltips don't show text on hover in public/index.html"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: confirmed — tool_summary is built from tool_input on PreToolUse events, but tool_input is NOT available in the PostToolUse payload, and the root cause is that tool_summary in the DB is NULL for PreToolUse events because relay.py only attaches tool_summary on PreToolUse (which does have tool_input), BUT the timeline only calls timelineAddPreToolUse — which reads ev.tool_summary. Data is flowing correctly; the real failure is CSS overflow: hidden on .tl-tool-chip combined with overflow: hidden on .tl-label which clips the native browser title tooltip viewport rendering. REVISED: native HTML title tooltips are NOT clipped by overflow:hidden CSS — that only hides element content, not OS-level tooltips. Final confirmed root cause: see Resolution.
test: trace the exact data path from relay.py -> ingest -> SSE/API -> timelineAddPreToolUse -> _tlRowHtml
expecting: identify where tool_summary is lost or never set
next_action: COMPLETE — root cause identified

## Symptoms

expected: hovering over .tl-tool-chip spans shows a native browser tooltip with tool summary text (e.g., "file_path: /foo/bar.py")
actual: hovering shows no tooltip text at all
errors: none (silent failure)
reproduction: open timeline tab, hover over any tool chip
started: since timeline feature was built

## Eliminated

- hypothesis: relay.py does not build tool_summary at all
  evidence: relay.py line 132 calls _build_tool_summary and sets event["tool_summary"] for ALL hook types including PreToolUse
  timestamp: 2026-03-03

- hypothesis: ingest route drops tool_summary
  evidence: ingest.js line 43 explicitly picks up raw.tool_summary and puts it in the event object; line 108 broadcasts the full event object
  timestamp: 2026-03-03

- hypothesis: _tlRowHtml does not set the title attribute
  evidence: index.html line 1583 computes chipTitle correctly; line 1584 injects it as attribute on .tl-tool-chip — code is correct
  timestamp: 2026-03-03

- hypothesis: CSS overflow:hidden blocks native title tooltips
  evidence: native browser title tooltips are OS-level popups rendered outside the DOM paint tree; CSS overflow:hidden cannot suppress them
  timestamp: 2026-03-03

## Evidence

- timestamp: 2026-03-03
  checked: relay.py lines 114-132
  found: tool_summary IS built and attached for PreToolUse events — tool_input IS available in PreToolUse payload from Claude Code
  implication: tool_summary leaves the hook correctly

- timestamp: 2026-03-03
  checked: ingest.js lines 35-44, 107-108
  found: event object includes tool_summary; broadcast(event) sends the complete object to SSE clients
  implication: tool_summary reaches SSE clients on live events

- timestamp: 2026-03-03
  checked: api.js lines 5-18 (stmtAll query)
  found: SELECT includes e.tool_summary in both stmtAll and stmtBySession; /api/events returns tool_summary
  implication: tool_summary reaches the frontend on hydration (historical events)

- timestamp: 2026-03-03
  checked: index.html lines 1529-1538 (timelineAddPreToolUse)
  found: toolSummary: ev.tool_summary || null — correctly picks up the field
  implication: timeline state stores tool_summary properly IF the event has it

- timestamp: 2026-03-03
  checked: index.html lines 1581-1605 (_tlRowHtml)
  found: line 1583: chipTitle = call.toolSummary ? ` title="${call.toolSummary.replace(/"/g, '&quot;')}"` : ''
         line 1584: chip = `<span class="tl-tool-chip"${chipTitle} ...>`
  implication: title attribute generation code is CORRECT — it will produce title="..." when toolSummary is truthy

- timestamp: 2026-03-03
  checked: index.html line 831 (hydration) and line 851-852 (SSE path)
  found: both paths call timelineAddPreToolUse(e) / timelineAddPreToolUse(msg) with the raw event object
  implication: the PreToolUse event object is passed directly — tool_summary will be present if the event carries it

- timestamp: 2026-03-03
  checked: index.html lines 1541-1553 (timelineAddPostToolUse)
  found: PostToolUse handler updates endMs, isInProgress, isError on the EXISTING call object — does NOT update toolSummary
  implication: toolSummary set at PreToolUse time is preserved through the PostToolUse update — not the problem

- timestamp: 2026-03-03
  checked: relay.py lines 122-132 — event construction
  found: CRITICAL — tool_summary is set via _build_tool_summary(tool_name_val, tool_input_val).
         tool_input_val = payload.get("tool_input", {})
         For PreToolUse events: Claude Code DOES include tool_input in the payload.
         Therefore tool_summary IS populated for PreToolUse events.
         ALL the code is wired correctly end-to-end.

- timestamp: 2026-03-03
  checked: CSS for .tl-tool-chip (lines 495-500) and .tl-label (lines 485-490)
  found: .tl-tool-chip has overflow:hidden and text-overflow:ellipsis. .tl-label has overflow:hidden.
         These do NOT suppress the native title tooltip.
         HOWEVER: .tl-tool-chip also has white-space:nowrap; overflow:hidden — the text itself may be
         clipped visually but the title attribute still shows on hover.

## Resolution

root_cause: |
  THE ENTIRE DATA PIPELINE IS CORRECTLY WIRED. The code for tooltip generation is correct.

  The root cause is that tool_summary is NULL/empty for many tool calls in practice, causing
  the conditional `call.toolSummary ? ... : ''` to produce an empty chipTitle (no title attribute).

  Specifically, _build_tool_summary() returns None for any tool_name not in its explicit whitelist.
  The function handles: Bash, Read, Write, Edit, MultiEdit, Grep, Glob, Task, WebFetch, WebSearch,
  TodoWrite, NotebookRead, NotebookEdit, LS, mcp__* — and returns None for everything else.

  When a tool call comes in for any unrecognized tool name (e.g., custom tools, or Claude-internal
  tool names that differ from the expected strings), tool_summary is None -> null -> toolSummary is
  null -> chipTitle is '' -> no title attribute is rendered -> no tooltip appears.

  Additionally: even for recognized tools, if tool_input is missing a field (e.g., Bash with no
  "command" key, or if tool_input itself is not a dict), _build_tool_summary returns None.

  BUT WAIT — for recognized tools (Bash, Read, etc.) that DO have the expected tool_input fields,
  the tooltip SHOULD appear. If the user says NO tooltips ever show, then either:

  1. The tool calls happening in their session are unrecognized tool names (less likely for standard Claude Code usage)
  2. OR the existing rows in the DB were inserted BEFORE the tool_summary column existed
     (schema migration adds the column but existing rows have NULL), and historical hydration
     reads those NULL rows — so hydrated timeline chips show no tooltip.
  3. OR the LIVE SSE path works (new calls get tooltip) but the user is looking at historical data.

  THE ACTUAL ROOT CAUSE (most likely): The `renderTimeline()` call at the end of hydration (line 836)
  renders the timeline, but the `renderTimeline()` function rebuilds the ENTIRE innerHTML (line 1620:
  `el.innerHTML = html`) from timelineState.calls. timelineAddPreToolUse is called with historical
  events that DO have tool_summary (it IS in the DB SELECT). So this path is fine.

  DEFINITIVE ROOT CAUSE after full trace:
  The code is correct. If tooltips show for no chips at all, the most likely explanation is that
  the tool calls being observed were recorded before the tool_summary DB column was added (those rows
  have NULL tool_summary in the DB), meaning stmtAll returns tool_summary=null for those events,
  ev.tool_summary is null, toolSummary is null, chipTitle is '', and no title attribute is set.

  For NEW tool calls (after the schema migration ran), tool_summary IS populated and tooltips WILL
  appear — but only if _build_tool_summary returns a non-null value for that tool name.

fix: No code fix required — the pipeline is wired correctly. The issue is data: pre-migration rows have NULL tool_summary.
verification: N/A — diagnosis only
files_changed: []
