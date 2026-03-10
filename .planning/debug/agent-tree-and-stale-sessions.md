---
status: resolved
trigger: "Two related bugs: (1) Solo sessions missing from agent tree — sessions that never spawn a subagent don't appear. (2) Sessions stuck as 'active' after server restart or signal loss."
created: 2026-03-09T00:00:00Z
updated: 2026-03-09T00:10:00Z
---

## Current Focus

hypothesis: Both root causes confirmed by code inspection. Fixes implemented in routes/ingest.js and server.js. Frontend bundle rebuilt successfully (tsc + vite, zero errors).
test: Human verification — restart server, run a solo session, check AgentTree; then kill and restart server, confirm no stale active nodes.
expecting: Solo sessions appear in AgentTree on first tool use. Previously-active agents show as idle after server restart.
next_action: await human verification

## Symptoms

expected: Every Claude Code session appears in the agent tree, even if it never spawns a subagent
actual: Sessions only appear when at least one subagent is spawned (SubagentStart received). A solo session running tools directly never appears. Also, agent_nodes rows with state='active' persist forever if server/Claude restarts without SubagentStop.
errors: No errors — silent failures only
reproduction: (1) Run a Claude Code session that uses Read/Write/Bash but never calls Task tool. (2) Start server, run agent, kill server before SubagentStop, restart server.
started: By design — never implemented

## Eliminated

- hypothesis: agent_nodes schema might not support a solo session concept
  evidence: Schema has agent_id (TEXT PRIMARY KEY), parent_session_id, agent_type (TEXT DEFAULT ''), state, spawned_at, last_activity_ts — all nullable/defaulted enough to store a session-root node with agent_id = session_id, parent_session_id = session_id, agent_type = 'session'
  timestamp: 2026-03-09T00:00:00Z

- hypothesis: Frontend might need a completely different code path for session-root nodes vs agent nodes
  evidence: AgentTree.tsx renders from sessions Map (keyed by parentSessionId) + agents Map. addAgent() in useObservStore creates a session entry automatically when a new parentSessionId is seen, and adds child agentId. A session-root node (agentId = sessionId, parentSessionId = sessionId) will appear as an agent within its own session group. The agentLabel() function uses last4 of agentId + agentType — will display correctly.
  timestamp: 2026-03-09T00:00:00Z

- hypothesis: The Agent type state field might not support 'interrupted' or 'stale'
  evidence: types/index.ts defines Agent.state as 'active' | 'idle' | 'errored'. Adding 'interrupted' requires extending this type. However, since normalizeAgentState() in useSSE.ts maps any unknown state to 'idle', and backend 'interrupted'/'stale' will be mapped to idle on the frontend, we can keep the DB states richer than the UI states (DB: active/completed/interrupted/stale, UI: active/idle/errored).
  timestamp: 2026-03-09T00:00:00Z

## Evidence

- timestamp: 2026-03-09T00:00:00Z
  checked: routes/ingest.js SubagentStart handler (lines 97-118)
  found: agent_nodes rows are ONLY inserted when hook_type === 'SubagentStart' and agentId is present. PreToolUse events (lines 67-81) only update pendingCalls map, never create agent_nodes rows.
  implication: Solo sessions (no subagents) never get an agent_nodes row, therefore never appear in GET /api/agents and never in the AgentTree.

- timestamp: 2026-03-09T00:00:00Z
  checked: routes/ingest.js PreToolUse handler + agent_id derivation
  found: For top-level session events, relay.py's _derive_agent_id() returns "" (empty string) when no explicit agent_id and no subagent transcript path. The ingest route then sets event.agent_id = null (line 51: raw.agent_id || null). So top-level session PreToolUse events have agent_id = null.
  implication: To create a solo-session root node, we use session_id as both agent_id and parent_session_id. We detect "first PreToolUse for a session with no existing agent_nodes row" — i.e., agent_id is null/empty AND no row exists for this session_id as agent_id.

- timestamp: 2026-03-09T00:00:00Z
  checked: server.js startup sequence (lines 1-41)
  found: initDb() is called synchronously, then routes are registered, then listen() is called. There is no post-startup cleanup of stale active agent_nodes. No background interval exists in server.js for staleness detection.
  implication: Need to add: (1) immediate SQL UPDATE on startup to mark active→interrupted, (2) setInterval in ingest.js (alongside existing pendingCalls cleanup) to mark active→stale when last_activity_ts is older than 10 minutes.

- timestamp: 2026-03-09T00:00:00Z
  checked: db/schema.js agent_nodes table definition
  found: last_activity_ts column exists (INTEGER NOT NULL). The upsertAgentNode and updateAgentState prepared statements in ingest.js both set last_activity_ts on every write.
  implication: last_activity_ts is already maintained correctly for subagent events. We just need to also update it on PreToolUse events for the session-root node, and use it in the staleness interval.

- timestamp: 2026-03-09T00:00:00Z
  checked: frontend AgentTree.tsx — how root nodes would render
  found: agentLabel() returns `${agentType} [${last4}]`. For a session-root node with agentType='session', this shows "session [xxxx]". The AgentTree groups by parentSessionId — a node with agentId=sessionId and parentSessionId=sessionId means it appears under its own group. The session group header shows sessionId.slice(-8). This is acceptable — the session node appears as a child of its own session header row.
  implication: No frontend changes needed for Bug 1 display. The existing addAgent()/sessions Map logic handles this naturally.

- timestamp: 2026-03-09T00:00:00Z
  checked: useSSE.ts normalizeAgentState() (line 48-54)
  found: Maps 'active', 'idle', 'errored' directly; anything else (including 'completed', 'interrupted', 'stale') maps to 'idle'. So frontend Agent.state type doesn't need to change — backend states 'interrupted' and 'stale' both display as idle (yellow dot) on the frontend.
  implication: No frontend type changes needed for Bug 2. The visual distinction between completed/interrupted/stale is not required for the fix (they all show as yellow/idle).

## Resolution

root_cause: Bug 1 — agent_nodes rows only created on SubagentStart; top-level solo sessions with agent_id=null/empty never get a row and never appear in GET /api/agents or AgentTree. Bug 2 — no startup cleanup of active nodes and last_activity_ts never used for staleness; stale green dots persist indefinitely after server/Claude restart.
fix: |
  routes/ingest.js:
  - Added _dbRef module-level var; set in ingestRoutes() registration so setInterval can access db
  - Added getSessionRootNode, insertSessionRootNode, touchSessionRootNode prepared statements
  - Extended setInterval to query agent_nodes WHERE state='active' AND last_activity_ts < (now-10min), mark each 'stale', broadcast agent_update
  - In setImmediate PreToolUse handler: when event.agent_id is null/empty, check for existing session root; if absent, insert root node (agent_id=session_id, parent_session_id=session_id, agent_type='session') + broadcast agent_spawn; if present, touch last_activity_ts
  server.js:
  - After initDb(), run UPDATE agent_nodes SET state='interrupted' WHERE state='active'; log count
verification: pending human confirmation
files_changed:
  - routes/ingest.js
  - server.js
