---
phase: 04-multi-agent-observability
plan: 02
subsystem: database
tags: [sqlite, jsonl, sse, cost-tracking, subagents, file-watching]

# Dependency graph
requires:
  - phase: 03-cost-and-token-tracking
    provides: jsonlWatcher.js with processFile pipeline and session_cost table
  - phase: 04-01
    provides: agent_nodes schema, SubagentStart/SubagentStop relay, agent_id extraction patterns
provides:
  - Per-agent cost rows in session_cost via composite (session_id, agent_id) primary key
  - Subagent JSONL discovery in {projectDir}/{sessionId}/subagents/agent-{hex}.jsonl
  - cost_update SSE events with agentId field for frontend per-agent attribution
  - Silent startup when subagents/ directory is absent (no ENOENT crash)
  - Live recursive watcher picks up new subagent JSONL files during active sessions
affects: [04-03-agent-tree-ui, 04-04-stuck-detection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite primary key (session_id, agent_id) — parent sessions use agent_id='' as default, subagents use hex from filename"
    - "sessionIdOverride parameter pattern — subagent files belong to parent session, not their own filename-derived ID"
    - "try/catch with silent continue for optional directory discovery (subagents/ may not exist)"

key-files:
  created: []
  modified:
    - db/schema.js
    - lib/jsonlWatcher.js

key-decisions:
  - "Composite PRIMARY KEY (session_id, agent_id) with agent_id DEFAULT '' — parent sessions store rows with empty agent_id, subagents store with hex agent_id; no conflicts, clean separation"
  - "sessionIdOverride parameter for processFile — subagent JSONL filename is agent-{hex}.jsonl but the session_id must be the parent session directory name; override prevents wrong key derivation"
  - "Silent continue on readdir(subagentsDir) ENOENT — subagents/ directory is optional, most sessions have none; crashing or logging warnings would pollute startup output"
  - "agentId field in cost_update SSE event — frontend can now attribute cost to individual agent tree rows; empty string for parent sessions is intentional sentinel"
  - "Strip 'agent-' prefix with replace(/^agent-/, '') — filename is agent-{hex}.jsonl, stored agent_id is bare hex to match agent_nodes table"

patterns-established:
  - "Parameter defaulting with override: processFile(filePath, db, agentId='', sessionIdOverride=null) — safe backward-compatible extension"
  - "Recursive watcher path parsing: split on /[/\\]/, find 'subagents' index, take parent dir as sessionId and next segment as agent file"

requirements-completed: [AGENT-02]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 4 Plan 02: Per-Agent Cost Tracking Summary

**jsonlWatcher extended with subagent JSONL discovery, composite (session_id, agent_id) primary key in session_cost, and agentId field in cost_update SSE events for per-agent cost attribution**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-26T19:03:00Z
- **Completed:** 2026-02-26T19:04:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- session_cost table now has composite PRIMARY KEY (session_id, agent_id) so parent sessions and subagents each get independent cost rows
- startJsonlWatcher discovers subagent JSONL files in {projectDir}/{sessionId}/subagents/ on startup with silent handling of missing directories
- processFile updated with agentId and sessionIdOverride parameters — backward compatible, subagent files pass parent sessionId instead of deriving from filename
- watchFile updated to forward agentId and sessionIdOverride to processFile on each re-parse
- Recursive PROJECTS_DIR watcher detects new subagent JSONL files during live sessions and extracts correct sessionId/agentId from path
- cost_update SSE events include agentId field enabling Phase 3 frontend panel to show per-agent breakdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Add agent_id to session_cost composite primary key and update processFile** - `f1fb6be` (feat)
2. **Task 2: Extend startJsonlWatcher to discover and watch subagent JSONL files** - `ea037c9` (feat)

## Files Created/Modified

- `db/schema.js` - Added agent_id column and changed PRIMARY KEY from session_id alone to (session_id, agent_id) with CREATE INDEX on last_event_ts
- `lib/jsonlWatcher.js` - Updated processFile signature, upsert stmt, broadcast event; added watchFile parameter forwarding; added subagent discovery loop and recursive watcher path detection

## Decisions Made

- Composite PRIMARY KEY (session_id, agent_id) with agent_id DEFAULT '' — parent sessions store rows with empty agent_id, subagents store with hex agent_id extracted by stripping 'agent-' prefix. No conflicts, clean separation between parent and child agent costs.
- sessionIdOverride parameter added to processFile — subagent JSONL filename is agent-{hex}.jsonl but the DB session_id must be the parent session directory name. Without override, the wrong key would be derived from basename.
- Silent continue on readdir(subagentsDir) failure — subagents/ is optional; most sessions have no subagents. An ENOENT here is normal, not an error.
- agentId empty string as sentinel for parent sessions — explicit and unambiguous; frontend checks agentId === '' to identify parent-session cost rows.

## Deviations from Plan

None - plan executed exactly as written. Both tasks were implemented in prior session and verified in this session. All verification checks pass.

## Issues Encountered

None. Both tasks were committed in the prior session. Verification of schema integrity and agentId extraction logic confirmed correct implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Per-agent cost data flows end-to-end: subagent JSONL files parsed, cost rows stored with agent_id, SSE events carry agentId
- 04-03 (agent tree UI) can now display per-agent cost by listening for cost_update events with non-empty agentId
- 04-04 (stuck detection) has no dependency on this plan's changes

---
*Phase: 04-multi-agent-observability*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: db/schema.js
- FOUND: lib/jsonlWatcher.js
- FOUND: 04-02-SUMMARY.md
- FOUND commit f1fb6be (Task 1: add agent_id composite PK)
- FOUND commit ea037c9 (Task 2: subagent JSONL discovery)
- Verification: session_cost composite primary key test PASS
- Verification: agentId extraction logic test PASS
