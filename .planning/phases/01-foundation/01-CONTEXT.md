# Phase 1: Foundation - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working end-to-end data pipeline: Claude Code PreToolUse/PostToolUse hooks fire → relay.py forwards events to the server → server stores them in SQLite → server pushes events to any connected browser tab via SSE. No dashboard UI in this phase — proof that the plumbing works end-to-end.

</domain>

<decisions>
## Implementation Decisions

### Event schema
- Metadata-only records: tool_name, hook_type (pre/post), session_id, timestamp, duration_ms, exit_status
- No tool call arguments or response bodies — avoids storing potentially sensitive file contents or commands
- PreToolUse and PostToolUse each write a separate row, linked by a shared correlation ID (tool_call_id)
- session_id captured from Claude Code environment variables (CLAUDE_SESSION_ID) so Phase 4 agent tree has the data it needs

### Error status
- PostToolUse hook captures exit code / error status and stores it in the event row
- Field present from Phase 1 so Phase 2 can highlight failures without a schema migration

### Server-down behavior
- Hook relay: silent fail — attempts one HTTP POST, gets connection refused, exits with code 0 immediately
- No local buffering, no stderr output, Claude Code session sees nothing
- HTTP POST timeout: 500ms max (protects Claude session if server is hung, not just down)
- No retries — fire and forget

### Ingest endpoint response
- POST /ingest returns 202 with empty body before any database write occurs
- Server returns 202 first (async write via queue), validating the success criterion by log order

### Server startup (Phase 1)
- Started with: `python server.py`
- Port: hardcoded 4999
- Logging: stdout only, no log files
- SQLite database: ./observagent.db (project directory, easy to inspect/delete)
- SQLite WAL mode + write queue from the start to prevent BUSY errors under concurrent hook events

### Hook script design
- Single `relay.py` handles both PreToolUse and PostToolUse hooks
- Both hook types in Claude Code settings.json point to the same `python relay.py` command
- hook_type field in the JSON payload identifies which hook fired
- Target: hardcoded localhost:4999 — no env vars or config files needed in Phase 1
- All relay.py output (stderr) suppressed — Claude Code session stays completely clean

### Claude's Discretion
- Exact SQLite schema column names and types
- Internal async queue implementation (asyncio queue, threading, etc.)
- SSE event format / message envelope structure
- How tool_call_id correlation ID is generated
- Exact logging format for server stdout

</decisions>

<specifics>
## Specific Ideas

- The 5ms hook relay exit constraint is non-negotiable — relay.py must be fire-and-forget with no blocking waits beyond the 500ms timeout safety net
- The 202-before-write success criterion must be verifiable by log order (server logs "202 sent" before "DB write complete")

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-26*
