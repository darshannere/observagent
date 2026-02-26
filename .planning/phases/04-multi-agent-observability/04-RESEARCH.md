# Phase 4: Multi-Agent Observability - Research

**Researched:** 2026-02-26
**Domain:** Claude Code hook events (SubagentStart/SubagentStop), SSE real-time propagation, vanilla JS DOM tree management, SQLite agent hierarchy schema
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Agent tree layout
- Indented list style (file-tree), not node-link graph or nested cards
- Lives in a left sidebar / dedicated panel — always visible alongside the live event log
- Agent label = subagent type when available (e.g. `gsd-executor`), fallback to session ID prefix (first 8 chars)
- New agent spawn: instant render with a subtle brief highlight to draw the eye — no slide animation

#### Per-agent cost display
- Cost shown inline on each tree row (not tooltip, not separate panel)
- Show both tokens + dollars per agent row (e.g. `12.4k / $0.04`)
- Parent session row shows rolled-up total cost (sum of all child agents)
- Highest-cost agent gets a subtle visual accent (color tint or bold cost) to make the biggest spender obvious at a glance

#### Stuck-agent UX
- Stuck = no tool activity for 60+ seconds
- Visual indicator: amber/yellow warning color on the row + warning icon (⚠️ or clock)
- Show elapsed idle time inline (e.g. `idle 1m 23s`) — not a countdown
- Auto-clears immediately when a new event arrives from that agent — no manual dismissal
- Stuck threshold (60s default) is configurable via URL param or .env only — not exposed in the dashboard UI

#### Agent lifecycle states
- Three states: Active / Completed / Errored
- Active: normal appearance (green accent or default)
- Completed: stays in tree, visually dimmed — preserves full session history
- Errored: red accent + error icon (❌ or X) on the row
- Clicking an agent row filters the live event log to show only that agent's tool calls (cross-panel filter)

### Claude's Discretion
- Exact color values and icon choices for each state
- How the live log filter is cleared (click again to deselect, or a clear button)
- Token display format (e.g. `12.4k` vs `12,400`)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGENT-01 | User can see the agent tree showing parent → child relationships created by Task tool spawns | SubagentStart hook provides `agent_id` + `agent_type`; PreToolUse Task event fires before spawn. Server must store parent→child mapping using session_id (parent) + agent_id (child). DOM renders indented list from in-memory tree. |
| AGENT-02 | User can see cost (tokens + dollars) broken down per individual agent in a multi-agent run | Each agent has its own JSONL at `~/.claude/projects/{project}/{session}/subagents/agent-{id}.jsonl`. jsonlWatcher can discover and process these. session_cost table needs an agent_id column so cost is tracked per agent, not just per session. |
| AGENT-03 | User can see a stuck-agent warning when an agent has had no tool activity for 60+ seconds | Client-side: track lastActivityTs per agent_id; setInterval checks idle time; amber highlight + idle time display on rows >60s. Auto-clear on new PreToolUse from that agent. |
</phase_requirements>

---

## Summary

Phase 4 requires three interconnected capabilities: a live agent hierarchy tree (AGENT-01), per-agent cost breakdown (AGENT-02), and stuck-agent detection (AGENT-03). The critical technical challenge is the **agent hierarchy correlation problem** — Claude Code's existing hook events were designed around a single `session_id` that all agents in a run share. The platform now provides `SubagentStart` and `SubagentStop` hooks with an `agent_id` field that uniquely identifies each sub-agent, and the `PreToolUse` hook for the `Task` tool fires with `tool_input.subagent_type` immediately before spawning.

The hierarchy approach that works with current Claude Code is: (1) capture the `SubagentStart` event which delivers `agent_id` + `agent_type` under the parent's `session_id`, (2) store a `parent_session_id → [agent_id, agent_type]` mapping in SQLite, (3) propagate this mapping to the client via a new SSE event type. All sub-agent tool calls share the parent's `session_id` — they cannot be attributed to individual child agents via hook events alone. However, the JSONL file at `~/.claude/projects/{project}/{session}/subagents/agent-{id}.jsonl` contains each sub-agent's individual usage records, enabling per-agent cost tracking.

The frontend is pure vanilla JS + CSS already in place. Adding the agent tree panel means replacing the "Available in Phase 4" placeholder in the existing HTML with a live-rendered indented list. The stuck-agent timer runs entirely on the client using `setInterval`, watching `lastActivityTs` per agent. No new npm packages are needed for any of these three features.

**Primary recommendation:** Use `SubagentStart` hook + a new `agent_nodes` SQLite table to store the hierarchy. Extend `jsonlWatcher` to discover subagent JSONL files. Track stuck agents client-side with a 5-second polling interval over the agent node map.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.6.2 | New `agent_nodes` table for hierarchy + cost | Already in project; WAL mode handles concurrent writes |
| fastify | ^5.7.4 | New `/api/agents` endpoint + SSE event type | Already registered; just add route handler |
| fastify-sse-v2 | ^4.2.2 | Broadcast `agent_spawn` + `agent_update` SSE events | Already wired in sseClients.js |
| Node.js fs/node:fs | stdlib | Discover subagent JSONL at `subagents/agent-*.jsonl` | Already used in jsonlWatcher.js |

### No New Dependencies

All Phase 4 features are implementable with existing stack:
- Agent tree: vanilla JS DOM manipulation (already used in Phase 2)
- Stuck detection: `setInterval` (already used for in-progress timers)
- Cost per agent: extend existing `jsonlWatcher.js` + `costEngine.js`
- SSE events: extend existing `broadcast()` in `sseClients.js`

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure Changes

```
db/schema.js           # Add agent_nodes table
lib/jsonlWatcher.js    # Extend to scan subagents/ subdirectories
routes/api.js          # Add /api/agents endpoint
routes/ingest.js       # Capture SubagentStart/SubagentStop events
public/index.html      # Replace placeholder with live agent tree panel
```

### Pattern 1: SubagentStart Hook → Hierarchy Correlation

**What:** Capture SubagentStart hook events in relay.py and POST to `/ingest` with `hook_type: "SubagentStart"`. The server writes a row to `agent_nodes` linking `parent_session_id` → `agent_id` + `agent_type`.

**When to use:** This is the only reliable way to correlate agents given current Claude Code APIs. The `session_id` in SubagentStart is the PARENT's session ID. The `agent_id` is the unique identifier for the spawned child.

**SubagentStart payload (official docs, HIGH confidence):**
```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../abc123.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "SubagentStart",
  "agent_id": "agent-abc123",
  "agent_type": "Explore"
}
```

**SubagentStop payload (official docs, HIGH confidence):**
```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/.../abc123.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_id": "def456",
  "agent_type": "Explore",
  "agent_transcript_path": "~/.claude/projects/.../abc123/subagents/agent-def456.jsonl",
  "last_assistant_message": "Analysis complete..."
}
```

**Task tool PreToolUse payload (official docs, HIGH confidence):**
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Task",
  "tool_input": {
    "prompt": "Find all API endpoints",
    "description": "Find API endpoints",
    "subagent_type": "Explore",
    "model": "sonnet"
  },
  "tool_use_id": "toolu_01ABC123"
}
```

**Relay.py extension:**
```python
# In relay.py main(), extract additional fields for SubagentStart/SubagentStop
if payload.get("hook_event_name") == "SubagentStart":
    event["agent_id"]   = payload.get("agent_id", "")
    event["agent_type"] = payload.get("agent_type", "")
elif payload.get("hook_event_name") == "SubagentStop":
    event["agent_id"]   = payload.get("agent_id", "")
    event["agent_type"] = payload.get("agent_type", "")
    event["agent_transcript_path"] = payload.get("agent_transcript_path", "")
```

### Pattern 2: `agent_nodes` Table — Hierarchy Storage

**What:** Add a new table to SQLite that stores each known agent node with parent linkage and lifecycle state.

```sql
CREATE TABLE IF NOT EXISTS agent_nodes (
  agent_id          TEXT PRIMARY KEY,
  parent_session_id TEXT NOT NULL,
  agent_type        TEXT NOT NULL DEFAULT '',
  state             TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'errored'
  spawned_at        INTEGER NOT NULL,
  last_activity_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_nodes_parent
  ON agent_nodes(parent_session_id);
```

**Key insight:** `parent_session_id` is the `session_id` from the SubagentStart event — it is the parent agent's session. This is how the tree is built: group by `parent_session_id`, children are rows with that parent.

### Pattern 3: Subagent JSONL Discovery for Per-Agent Cost

**What:** Extend `jsonlWatcher.js` to discover and process JSONL files in the `subagents/` subdirectory within each session directory.

**Actual file structure (verified by filesystem inspection):**
```
~/.claude/projects/{project-slug}/
  {session-id}.jsonl               # Parent session transcript
  {session-id}/                    # Session subfolder
    subagents/
      agent-{agent_id}.jsonl       # Per-subagent transcript
      agent-{agent_id}.jsonl
```

**Note:** The session subfolder matches the session ID (UUID). The `agent_id` in the filename matches the `agent_id` field from SubagentStart/SubagentStop hooks.

**Discovery logic:**
```javascript
// In startJsonlWatcher, after processing project dirs:
for (const projectDir of projectDirs) {
  const entries = await readdir(projectDir, { withFileTypes: true });
  // Existing: process *.jsonl files directly in projectDir
  // New: scan subdirectories for subagents/ folder
  for (const entry of entries.filter(e => e.isDirectory())) {
    const subagentsDir = join(projectDir, entry.name, 'subagents');
    try {
      const subFiles = await readdir(subagentsDir);
      for (const f of subFiles.filter(f => f.endsWith('.jsonl'))) {
        // agent_id extracted from filename: "agent-{id}.jsonl"
        const agentId = basename(f, '.jsonl').replace(/^agent-/, '');
        await processAgentFile(join(subagentsDir, f), agentId, db);
        watchFile(join(subagentsDir, f), db);
      }
    } catch { /* subagents dir doesn't exist yet */ }
  }
}
```

### Pattern 4: Client-Side Agent Tree DOM Rendering

**What:** Build the indented list tree in vanilla JS. The tree state is an in-memory Map. Each render call does a full reconcile — simpler than diffing, fast enough for <50 agents.

**Tree data structure:**
```javascript
// In-memory tree state (client-side)
const agentTree = {
  // session_id -> { sessionId, children: [agentId...], cost, tokens }
  sessions: new Map(),
  // agent_id -> { agentId, parentSessionId, agentType, state, lastActivityTs, cost, tokens }
  agents: new Map(),
};
```

**Rendering the indented list:**
```javascript
function renderAgentTree() {
  const container = document.getElementById('agent-tree-body');
  container.innerHTML = ''; // full reconcile

  for (const [sessionId, session] of agentTree.sessions) {
    // Parent row
    const parentRow = createAgentRow({
      label: sessionId.slice(0, 8),
      cost: session.cost,
      tokens: session.tokens,
      state: 'active',
      depth: 0,
    });
    container.appendChild(parentRow);

    // Child rows (indented)
    for (const agentId of session.children) {
      const agent = agentTree.agents.get(agentId);
      if (!agent) continue;
      const childRow = createAgentRow({
        label: agent.agentType || agentId.slice(0, 8),
        cost: agent.cost,
        tokens: agent.tokens,
        state: agent.state,
        depth: 1,
        agentId,
      });
      container.appendChild(childRow);
    }
  }
}
```

### Pattern 5: Client-Side Stuck Detection

**What:** A single `setInterval` at 5-second resolution scans all active agents. Any agent whose `lastActivityTs` is >60s ago gets the stuck class applied to its row.

```javascript
const STUCK_THRESHOLD_MS = (() => {
  const p = new URLSearchParams(window.location.search);
  return (parseInt(p.get('stuck_threshold') || '60', 10)) * 1000;
})();

setInterval(() => {
  const now = Date.now();
  for (const [agentId, agent] of agentTree.agents) {
    if (agent.state !== 'active') continue;
    const idle = now - agent.lastActivityTs;
    const row = document.querySelector(`[data-agent-id="${agentId}"]`);
    if (!row) continue;
    if (idle >= STUCK_THRESHOLD_MS) {
      row.classList.add('stuck');
      const idleEl = row.querySelector('.agent-idle');
      if (idleEl) idleEl.textContent = formatIdle(idle);
    } else {
      row.classList.remove('stuck');
    }
  }
}, 5_000);
```

### Pattern 6: Dashboard Layout Restructure

**What:** The existing 2×2 grid must be changed to accommodate the agent tree as a persistent left sidebar alongside the tool call log. The CONTEXT.md specifies the agent tree panel is "always visible alongside the live event log."

**Current layout (CSS grid):**
```
grid-template-columns: 1fr 1fr
grid-template-rows: 1fr 1fr
```

**New layout (3-panel or reassignment):**
The four panels currently are: Tool Call Log, Agent Tree (placeholder), Cost & Tokens, Health (placeholder). Phase 4 makes the Agent Tree panel real and positions it as a persistent sidebar.

**Option A** — Keep 2×2, make agent tree the top-right panel (replaces placeholder). This is simplest.
**Option B** — Change to 3-column layout: [agent-tree | tool-log | cost+health]. More VS Code-like.

The CONTEXT.md says "left sidebar / dedicated panel — always visible alongside the live event log." This means the agent tree should be next to the log, not in a separate quadrant. **Use a 3-column layout:** `[240px agent-tree | 1fr tool-log | 1fr cost+health-stacked]`.

### Anti-Patterns to Avoid

- **Polling `/api/events` for agent activity** — wastes bandwidth. Track lastActivityTs client-side from SSE events.
- **Trying to attribute PreToolUse events to individual agents by agent_id** — Tool hooks only carry `session_id`, not `agent_id`. Individual tool calls CANNOT be attributed to sub-agents from hook events alone.
- **Rebuilding tree from scratch on every SSE event** — Full DOM reconcile every 5 seconds is fine; doing it on every tool event (potentially >100/minute) causes flicker.
- **Adding parent_session_id to relay.py** — The relay payload already sends `session_id` which IS the parent session ID when `hook_type` is SubagentStart. No extra field needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idle time formatting | Custom date math | Simple JS: `Math.floor(idle/60000) + 'm ' + ...` | Trivial; no library needed |
| Tree diffing/reconcile | Virtual DOM | Full innerHTML re-render on each tick (5s interval) | <50 agent nodes; DOM reconcile is imperceptible |
| Cost aggregation per agent | Custom parser | Reuse existing `extractUsageRecords` + `aggregateSessionCost` from costEngine.js | Already handles dedup rule, all token types |
| Stuck threshold configuration | Settings UI | URL param `?stuck_threshold=90` or env var | CONTEXT.md explicitly says not in dashboard UI |

**Key insight:** The entire phase is buildable by extending existing modules — no new architectural layers, no new npm packages.

---

## Common Pitfalls

### Pitfall 1: Shared session_id Across All Hook Types

**What goes wrong:** Developer writes code that tries to distinguish parent vs child agent using only the `session_id` in PreToolUse/PostToolUse hook events.

**Why it happens:** Claude Code's tool hooks (`PreToolUse`, `PostToolUse`) do NOT include `agent_id`. All tool calls in a multi-agent run share the parent's `session_id`. Only `SubagentStart` and `SubagentStop` carry `agent_id`.

**How to avoid:** Use SubagentStart/SubagentStop hooks to learn WHICH agents exist and their IDs. Accept that tool-call events cannot be attributed to individual sub-agents. The agent tree shows which agents are active, but the tool log remains session-level.

**Warning signs:** Code that reads `agent_id` from a PreToolUse or PostToolUse payload will always find `undefined`.

### Pitfall 2: Missing subagents/ Directory on First Scan

**What goes wrong:** `jsonlWatcher` tries to read `subagents/` inside every session directory, but the directory only exists after the first Task tool call completes. A missing directory throws an ENOENT that crashes the watcher.

**How to avoid:** Wrap the `readdir(subagentsDir)` call in a try/catch and continue silently on ENOENT. The recursive `fs.watch` on `PROJECTS_DIR` will fire when the `subagents/` directory is created — at that point, scan and register the new JSONL files.

**Warning signs:** Server logs showing "ENOENT: no such file or directory, scandir…/subagents" on startup.

### Pitfall 3: Agent Tree Cleared on Browser Refresh

**What goes wrong:** The agent tree is only populated from SSE events. A browser refresh clears it — the user sees an empty tree until new events arrive.

**How to avoid:** Add a `GET /api/agents` endpoint that returns all `agent_nodes` rows. Hydrate the tree from this endpoint on page load (same pattern as `hydrate()` used for the event log in Phase 2).

**Warning signs:** Agent tree appears empty after page reload even when agents are running.

### Pitfall 4: Stuck Timer Not Resetting on New Activity

**What goes wrong:** A stuck timer fires, marks agent as stuck, then a new tool call arrives from that agent — but the amber highlight stays because the `lastActivityTs` isn't updated.

**How to avoid:** On every `PreToolUse` SSE event, update `agent.lastActivityTs = event.timestamp` for the matching session. The 5-second interval check will then clear the stuck class on the next tick.

**Warning signs:** Agents that are actively running show stuck warning indefinitely.

### Pitfall 5: agent_id Extraction from Filename

**What goes wrong:** The JSONL filename is `agent-a2918dfba4e76fb6f.jsonl`. If you use `basename(f, '.jsonl')` you get `agent-a2918dfba4e76fb6f`, not the bare `a2918dfba4e76fb6f`. When comparing to the `agent_id` from SubagentStop hook (`def456` style), these won't match if the id format differs.

**How to avoid:** Inspect actual subagent JSONL filenames from a live session. Confirmed filenames: `agent-a2918dfba4e76fb6f.jsonl`. The SubagentStop `agent_id` field is `"def456"` style in docs but may be the full ID including `agent-` prefix or just the hex suffix. Strip the `agent-` prefix when extracting from filename: `basename(f, '.jsonl').replace(/^agent-/, '')`. Cross-reference with actual hook payload to confirm.

**Warning signs:** Per-agent cost shows zero because file-derived agent_id doesn't match hook-derived agent_id.

### Pitfall 6: relay.py Sends Output for SubagentStart Events

**What goes wrong:** The relay.py's CRITICAL constraint is "NEVER write to stdout or stderr." If the SubagentStart hook handler writes anything, it corrupts the Claude Code UI.

**How to avoid:** The existing relay.py already uses `sys.stdin.read()` → POST → silent exit. Just extend the event dict to include the additional SubagentStart/SubagentStop fields. The hook registration in `settings.json` adds SubagentStart and SubagentStop as additional hook event types alongside the existing PreToolUse/PostToolUse matchers.

---

## Code Examples

### Hook Registration Extension (settings.json)

```json
{
  "hooks": {
    "PreToolUse": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/hooks/relay.py" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/hooks/relay.py" }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/hooks/relay.py" }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/hooks/relay.py" }] }
    ]
  }
}
```

### Schema Extension (db/schema.js)

```javascript
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_nodes (
    agent_id          TEXT PRIMARY KEY,
    parent_session_id TEXT NOT NULL,
    agent_type        TEXT NOT NULL DEFAULT '',
    state             TEXT NOT NULL DEFAULT 'active',
    spawned_at        INTEGER NOT NULL,
    last_activity_ts  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_nodes_parent
    ON agent_nodes(parent_session_id);
`);
```

### Ingest Route — SubagentStart Handling (routes/ingest.js)

```javascript
// In ingestRoutes, after the existing hook_type check:
if (event.hook_type === 'SubagentStart') {
  const agentId   = raw.agent_id   || '';
  const agentType = raw.agent_type || '';
  if (agentId) {
    // Write to agent_nodes — use setImmediate so 202 flushes first
    setImmediate(() => {
      upsertAgentNode.run({
        agent_id:          agentId,
        parent_session_id: event.session_id,
        agent_type:        agentType,
        state:             'active',
        spawned_at:        event.timestamp,
        last_activity_ts:  event.timestamp,
      });
      broadcast({ type: 'agent_spawn', agentId, agentType, parentSessionId: event.session_id, ts: event.timestamp });
    });
  }
} else if (event.hook_type === 'SubagentStop') {
  const agentId = raw.agent_id || '';
  if (agentId) {
    setImmediate(() => {
      updateAgentState.run({ state: 'completed', agent_id: agentId });
      broadcast({ type: 'agent_update', agentId, state: 'completed', ts: event.timestamp });
    });
  }
}
```

### API Endpoint (routes/api.js)

```javascript
// GET /api/agents — hydration for page load
const stmtAgents = db.prepare(`
  SELECT agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts
  FROM agent_nodes
  ORDER BY spawned_at ASC
`);

fastify.get('/api/agents', (request, reply) => {
  reply.send(stmtAgents.all());
});
```

### Agent Row CSS (addition to index.html)

```css
/* Agent tree panel */
.agent-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  font-family: var(--mono);
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
  border-left: 3px solid transparent;
}
.agent-row:hover { background: rgba(255,255,255,0.04); }
.agent-row.selected { background: rgba(255,255,255,0.07); border-left-color: var(--green); }
.agent-row.depth-1 { padding-left: 20px; } /* indent child rows */
.agent-row.depth-0 { font-weight: 500; }   /* bold parent row */

/* Lifecycle states */
.agent-row.state-active  .agent-indicator { color: var(--green); }
.agent-row.state-completed { opacity: 0.55; }
.agent-row.state-errored .agent-indicator { color: var(--red); }

/* Stuck state */
.agent-row.stuck { background: rgba(210, 153, 34, 0.1); border-left-color: var(--yellow); }
.agent-row.stuck .agent-label { color: var(--yellow); }
.agent-idle { font-size: 10px; color: var(--yellow); margin-left: auto; }

/* Highest-cost accent */
.agent-row.top-spender .agent-cost { color: var(--yellow); font-weight: 600; }
```

### Idle Time Formatter

```javascript
function formatIdle(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `idle ${m}m ${rem}s` : `idle ${s}s`;
}
```

### Token Display Formatter (for agent rows)

```javascript
// Format tokens for compact display: "12.4k" or "1.2M"
function formatTokensCompact(n) {
  n = n || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)    return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// Combined display: "12.4k / $0.04"
function formatAgentCost(tokens, costUsd) {
  return `${formatTokensCompact(tokens)} / $${costUsd.toFixed(2)}`;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No SubagentStart hook | SubagentStart fires on Task spawn with `agent_id` + `agent_type` | Exists as of current Claude Code (confirmed in docs) | Enables reliable agent hierarchy tracking |
| SubagentStop missing `agent_id` | SubagentStop now includes `agent_id`, `agent_type`, `agent_transcript_path` | Confirmed in current docs (issue #7881 was about shared session_ids, not about missing agent_id in SubagentStop) | Per-agent lifecycle tracking is possible |
| Tool hooks lack agent attribution | Still true — PreToolUse/PostToolUse do NOT include agent_id | No change | Tool call log remains session-level; cannot attribute to individual sub-agents |

**Important clarification:** GitHub issue #7881 reports SubagentStop "cannot identify which specific subagent finished." However the CURRENT official docs for SubagentStop explicitly include `agent_id` and `agent_type` in the payload. The issue may have been filed before these fields were added. Trust the official docs (HIGH confidence) over the GitHub issue (filed 2025, possibly outdated).

**Deprecated/outdated:**
- Using only `session_id` for agent correlation: impossible — all agents share parent session_id for tool hooks. Must use `agent_id` from SubagentStart/SubagentStop.

---

## Open Questions

1. **Does PreToolUse for Task tool include `agent_id` of the child being spawned?**
   - What we know: Official docs show Task PreToolUse includes `tool_input.subagent_type`, `tool_input.prompt`, `tool_input.description`. No `agent_id` in the PreToolUse payload.
   - What's unclear: Is the Task tool's `tool_use_id` the same as the spawned agent's `agent_id`? If yes, we could correlate Task PreToolUse → SubagentStart by tool_use_id.
   - Recommendation: Do not rely on this. Use SubagentStart as the authoritative agent spawn signal.

2. **Does the subagent JSONL `agent_id` exactly match SubagentStop `agent_id`?**
   - What we know: Filenames observed on disk: `agent-a2918dfba4e76fb6f.jsonl`. SubagentStop docs show `agent_id: "def456"` (placeholder). The actual format is unknown.
   - What's unclear: Is the file's `agent-` prefix stripped when comparing to hook `agent_id`, or does the hook also return `agent-{hex}`?
   - Recommendation: In the first implementation task, add a debug log that prints both the SubagentStop `agent_id` value and the observed filename prefix side-by-side. Adjust the strip logic accordingly.

3. **Does the parent session's JSONL in `~/.claude/projects/{project}/{session}.jsonl` contain usage records for sub-agents, or only the parent agent?**
   - What we know: Each sub-agent has its own JSONL at `subagents/agent-{id}.jsonl`. The parent JSONL has its own usage records.
   - What's unclear: Whether sub-agent costs roll up into the parent JSONL automatically.
   - Recommendation: Process both the parent JSONL AND the sub-agent JSONLs. Sum sub-agent costs explicitly. Do not assume parent JSONL includes sub-agent usage.

4. **Can SubagentStop fire with `state: "errored"` or is there a separate error signal?**
   - What we know: SubagentStop fires when a sub-agent finishes. The `last_assistant_message` field is included.
   - What's unclear: Whether there is a PostToolUseFailure event for the Task tool that signals a crashed sub-agent.
   - Recommendation: Listen for `PostToolUseFailure` on the Task tool as the errored signal. On that event, update the agent's state to `errored` if we can identify which agent_id corresponds.

---

## Sources

### Primary (HIGH confidence)

- Official Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks
  - SubagentStart payload schema (agent_id, agent_type confirmed)
  - SubagentStop payload schema (agent_id, agent_type, agent_transcript_path confirmed)
  - PreToolUse Task tool_input schema (subagent_type, prompt, description confirmed)
  - Hook event table (SubagentStart fires on Task spawn confirmed)

- Verified filesystem inspection: `/Users/darshannere/.claude/projects/-Users-darshannere-claude-observagent/212ea9f8-06c8-4db5-aac0-4d700a82db9f/subagents/`
  - Confirmed actual filenames: `agent-{hex}.jsonl`
  - Confirmed directory structure: `{session-id}/subagents/agent-{id}.jsonl`

### Secondary (MEDIUM confidence)

- GitHub Issue #7881 (SubagentStop shared session_id problem): https://github.com/anthropics/claude-code/issues/7881
  - Confirms historical problem; current docs show it has been partially resolved with agent_id fields
  - Current payload still uses parent's session_id for tool events (not per-agent session_ids)

- GitHub Issue #14859 (Agent Hierarchy Feature Request): https://github.com/anthropics/claude-code/issues/14859
  - Confirms agent_id/parent_agent_id are requested but not yet in tool hook events
  - Validates the design choice to use SubagentStart as the hierarchy signal

### Tertiary (LOW confidence)

- WebSearch results re: multi-agent observability implementations — not directly applicable since this project has unique constraints (zero-dependency relay.py, Fastify backend, vanilla JS frontend)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — No new dependencies; all existing modules identified and verified in codebase
- Architecture (hierarchy via SubagentStart): HIGH — Official docs confirm SubagentStart includes agent_id; filesystem inspection confirms subagent JSONL structure
- Architecture (per-agent cost via subagent JSONL): HIGH — File structure verified; costEngine.js already handles the parsing logic
- Architecture (stuck detection client-side): HIGH — Trivial setInterval pattern consistent with existing Phase 2 approach
- Pitfalls: HIGH — Derived from official docs and live code inspection; not speculative
- Open Questions: MEDIUM — Require runtime validation on first implementation task

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (30 days — Claude Code hook payload schemas are stable; SubagentStart/SubagentStop fields unlikely to change)
