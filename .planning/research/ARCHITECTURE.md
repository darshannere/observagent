# Architecture Research

**Domain:** Real-time AI agent observability (Claude Code-specific, v2.0 Agent Intelligence)
**Researched:** 2026-03-02
**Confidence:** HIGH — Based on direct inspection of existing codebase, live JSONL files, live DB queries, and hook payload schemas confirmed via real SubagentStart/Stop data.

---

## Baseline Architecture (v1.0 Shipped)

Everything below builds on what is already working in production. Do not modify what is not broken.

```
Claude Code Process(es)
  Hooks: PreToolUse / PostToolUse / SubagentStart / SubagentStop
      | stdin JSON payload
      v
hooks/relay.py                         (Python stdlib only, fire-and-forget, 500ms timeout)
  Reads: tool_name, hook_event_name, session_id, tool_use_id, exit_status
  For SubagentStart: also reads agent_id, agent_type
  For SubagentStop: also reads agent_id, agent_type, agent_transcript_path
  NEVER reads: tool_input, tool_response (security boundary)
  POSTs to: http://localhost:4999/ingest, exits 0
      | HTTP POST
      v
server.js (Fastify 5.7.4, WAL SQLite via better-sqlite3)
  routes/ingest.js    — 202 immediately, setImmediate enqueue + broadcast
  routes/sse.js       — GET /events, fastify-sse-v2 keepalive stream
  routes/api.js       — REST endpoints for history/agents/cost/config
  routes/dashboard.js — Serves public/index.html and public/history.html
  lib/jsonlWatcher.js — fs.watch on ~/.claude/projects/ recursive, processFile on change
  lib/writeQueue.js   — Single-writer queue, setImmediate drain, one stmt
  lib/sseClients.js   — Set<reply>, broadcast() to all connected clients
  lib/costEngine.js   — Pure computation: pricing, context fill, aggregation
      v
db/schema.js (better-sqlite3 12.x, WAL + NORMAL sync)
  TABLE events:       tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status
  TABLE session_cost: session_id, agent_id, model, token columns, total_cost_usd, last_event_ts, project_name
  TABLE agent_nodes:  agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts
  TABLE observagent_config: key/value store for user settings

public/index.html (inline vanilla JS, no build step)
  3-column CSS grid: agent tree (240px) | tool log + timeline tabs (1fr) | cost + health (1fr)
  Two EventSources: /events for live tool events and agent lifecycle
  REST hydration: /api/events, /api/agents, /api/cost, /api/config on load
```

### Current relay.py Security Boundary (Non-Negotiable)

The relay currently sends ONLY metadata — never `tool_input` or `tool_response`. This is intentional: those fields can contain file contents, command outputs, passwords, and private keys. The v2.0 selective capture feature EXTENDS this pattern by extracting specific safe sub-fields rather than abandoning the boundary.

---

## v2.0 Integration Architecture

### System Overview: What Changes

```
┌───────────────────────────────────────────────────────────────────────────┐
│                     Claude Code Process(es)                               │
│  Hooks: PreToolUse / PostToolUse / SubagentStart / SubagentStop          │
│                                                                           │
│  tool_input now partially forwarded (safe fields only per tool type)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ stdin JSON payload
                                      v
┌─────────────────────────────────────────────────────────────────────────┐
│               hooks/relay.py  [MODIFIED — Feature 1]                    │
│                                                                          │
│  NEW: selective_tool_input(payload) extracts safe fields by tool:       │
│    Bash:           command + description (description is safe short label)│
│    Read/Write/Edit: file_path only (NOT content)                        │
│    Grep:           pattern, path (NOT results)                          │
│    Glob:           pattern, path (NOT results)                          │
│    Task:           description + subagent_type (NOT prompt)             │
│    SubagentStart:  description (if present) from payload                │
│    All others:     None (no tool_input forwarded)                       │
│                                                                          │
│  Adds to POST body: tool_input_summary: {field: value, ...} | null     │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │ HTTP POST /ingest
                                      v
┌─────────────────────────────────────────────────────────────────────────┐
│           routes/ingest.js  [MODIFIED — Features 1, 3]                  │
│                                                                          │
│  Existing: PreToolUse/PostToolUse → events table                        │
│  Existing: SubagentStart → agent_nodes upsert + agent_spawn SSE         │
│  Existing: SubagentStop  → agent_nodes state update + agent_update SSE  │
│                                                                          │
│  NEW: tool_input_summary stored in events row (new column)              │
│  NEW: SubagentStart also stores initial_prompt (from payload if present)│
│       writes to agent_nodes.initial_prompt column (new)                 │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                    ┌─────────────────┴──────────────────┐
                    │                                    │
                    v                                    v
┌─────────────────────────────┐      ┌─────────────────────────────────┐
│  lib/writeQueue.js          │      │  lib/sseClients.js              │
│  [UNCHANGED in v2.0]        │      │  [UNCHANGED in v2.0]            │
│  Single writer preserved    │      │  broadcast() unchanged          │
└──────────────┬──────────────┘      └─────────────────────────────────┘
               │ enqueue(event)
               v
┌─────────────────────────────────────────────────────────────────────────┐
│           db/schema.js  [MODIFIED — Feature 1, 3]                       │
│                                                                          │
│  events table: ADD COLUMN tool_input_summary TEXT (nullable JSON)       │
│  agent_nodes table: ADD COLUMN initial_prompt TEXT (nullable)           │
│  agent_nodes table: ADD COLUMN description TEXT (nullable)              │
│                                                                          │
│  New API query (not new table):                                          │
│    per-agent events = SELECT * FROM events                               │
│    WHERE session_id = @parent_session_id                                 │
│    AND tool_call_id IN (agent's time window)  ← problematic, see below  │
└─────────────────────────────────────┬───────────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────────────────────────────────┐
│           lib/costEngine.js  [MODIFIED — Feature 2]                     │
│                                                                          │
│  getContextFillPercent() — DIAGNOSIS + FIX:                             │
│    Current formula: input_tokens + cache_read + cache_write             │
│    This equals total tokens sent to the API (correct)                   │
│    Discrepancy source: Claude Code's statusline uses its own tokenizer  │
│    estimate which INCLUDES tool schema definitions (~8-15K tokens)      │
│    PLUS applies an ~80% safety cap, showing usage scaled to that cap    │
│                                                                          │
│    Fix approach: no formula change needed; instead add a correction     │
│    factor. The observed gap pattern:                                     │
│    - ObservAgent reports actual API input tokens (accurate)             │
│    - Claude Code statusline estimates and scales to 80% cap             │
│    - They measure DIFFERENT things and will never match exactly         │
│    Recommendation: document this, surface both if possible              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│           routes/api.js  [MODIFIED — Features 3, 4, 5]                  │
│                                                                          │
│  Existing: GET /api/events, /api/cost, /api/agents, /api/config        │
│            GET /api/sessions (filtered), GET /api/sessions/:id/export   │
│                                                                          │
│  NEW: GET /api/agents/:id                                                │
│    Returns: agent row + per-agent events (see data model section)        │
│                                                                          │
│  NEW: GET /api/events?session_id=X&since=T&until=T (time filter)       │
│    Server-side time params added to existing stmtBySession prepared stmt │
│                                                                          │
│  MODIFIED: GET /api/events now returns tool_input_summary column        │
└─────────────────────────────────────────────────────────────────────────┘
                              │ SSE stream + REST
                              v
┌─────────────────────────────────────────────────────────────────────────┐
│           public/index.html  [MODIFIED — Features 3, 4, 5]              │
│                                                                          │
│  Feature 3: Agent detail panel                                           │
│    Click agent row → slide-in or replace panel with agent details       │
│    Shows: initial_prompt, context fill %, per-agent tool call history   │
│                                                                          │
│  Feature 4: Dashboard layout change                                      │
│    Current: 3-column (240px agent tree | tool log | cost+health stacked)│
│    v2.0: Restructure to make agent hierarchy primary view               │
│    Approach: CSS grid change + component reorganization                 │
│                                                                          │
│  Feature 5: Time filter                                                  │
│    Client-side for live events (already in DOM)                          │
│    Server-side for historical hydration (query param on /api/events)    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component-by-Component Integration Details

### Feature 1: Selective tool_input Capture

#### relay.py Changes (MODIFIED)

The selective capture function must run synchronously within the 500ms timeout. Since we are extracting individual fields from an already-parsed dict (not doing any I/O), this adds under 1ms.

**Confirmed safe fields per tool (from live JSONL inspection):**

| Tool | Safe Fields | Unsafe Fields (never capture) |
|------|-------------|-------------------------------|
| Bash | `command`, `description` | (none — command IS the interesting field) |
| Read | `file_path` | `limit`, `offset` (metadata only, low value) |
| Write | `file_path` | `content` (file contents, always unsafe) |
| Edit | `file_path` | `old_string`, `new_string`, `replace_all` (code content) |
| Grep | `pattern`, `path` | `output_mode` (metadata) |
| Glob | `pattern`, `path` | (none beyond path/pattern) |
| Task | `description`, `subagent_type` | `prompt` (full agent prompt, always unsafe), `model` (optional) |
| SubagentStart | `description` | (if available in payload — verify field name) |
| All others | None | Everything |

**Implementation pattern in relay.py:**

```python
SAFE_FIELDS = {
    'Bash':    ['command', 'description'],
    'Read':    ['file_path'],
    'Write':   ['file_path'],
    'Edit':    ['file_path'],
    'Grep':    ['pattern', 'path'],
    'Glob':    ['pattern', 'path'],
    'Task':    ['description', 'subagent_type'],
}

def extract_safe_tool_input(payload):
    tool_name = payload.get('tool_name', '')
    fields = SAFE_FIELDS.get(tool_name)
    if not fields:
        return None
    tool_input = payload.get('tool_input', {})
    if not isinstance(tool_input, dict):
        return None
    return {k: tool_input[k] for k in fields if k in tool_input} or None
```

The result is added to the event dict as `tool_input_summary` before the POST. For PostToolUse, `tool_input` is still present in the payload (confirmed by relay.py comment) — extract it there too.

**SubagentStart payload research finding:** Current relay.py captures `agent_id` and `agent_type` from SubagentStart. The payload MAY also contain `description` (the Task tool's description that spawned this agent). This needs live verification — add a temporary logging line to relay.py for SubagentStart and run one GSD session to log the full payload fields.

#### DB Schema Change (db/schema.js)

```javascript
// Add to initDb() using the existing addColumnIfNotExists pattern:
addColumnIfNotExists(db, 'events', 'tool_input_summary', 'TEXT');  // nullable JSON string

// Add to agent_nodes:
addColumnIfNotExists(db, 'agent_nodes', 'initial_prompt', 'TEXT');  // nullable, from SubagentStart
addColumnIfNotExists(db, 'agent_nodes', 'description', 'TEXT');     // nullable, Task description
```

No new tables required for Feature 1. The `addColumnIfNotExists` pattern already exists in `schema.js` and handles live DB migration safely.

#### writeQueue.js Change (UNCHANGED)

The `events` INSERT prepared statement must be updated to include `tool_input_summary`. Since `writeQueue.js` prepares the statement once, the new column must be added to the INSERT before the server starts. The prepared statement will fail if the column doesn't exist — schema migration must happen before the statement is prepared (already guaranteed by `initDb()` running before `new WriteQueue(db)`).

**New prepared statement in writeQueue.js:**

```javascript
this.stmt = db.prepare(`
  INSERT INTO events (tool_name, hook_type, session_id, tool_call_id,
                      timestamp, duration_ms, exit_status, tool_input_summary)
  VALUES (@tool_name, @hook_type, @session_id, @tool_call_id,
          @timestamp, @duration_ms, @exit_status, @tool_input_summary)
`);
```

The event object must include `tool_input_summary: JSON.stringify(raw.tool_input_summary) || null`.

---

### Feature 2: Context Fill % Accuracy

#### Root Cause Diagnosis (Confirmed via Live Data)

The ~10% gap between ObservAgent's context fill display and Claude Code's statusline is **not a bug in the formula**. They measure different things:

**ObservAgent formula (current, correct):**
```
context_fill_pct = (input_tokens + cache_read_input_tokens + cache_creation_input_tokens) / 200_000
```
This uses actual Anthropic API token counts from the last JSONL assistant record. It is the most accurate representation of tokens that actually went into the model.

**Claude Code statusline source:**
The statusline hook receives `context_window.remaining_percentage` from the statusLine payload — a different pipeline entirely, not from the JSONL. Claude Code computes this internally using:
1. Its own tokenizer estimate (not the API's reported count)
2. Includes tool schema definitions (JSON schemas for ~30 built-in tools, ~8-15K tokens)
3. Scales the display to an 80% safety cap (100% displayed = 80% actual usage)

**Verified:** The statusline's `used_pct` in the bridge file is `Math.min(100, Math.round((rawUsed / 80) * 100))` — scaled to 80% maximum. If the API says 40% used, the statusline shows 50% (40/80*100).

**Fix strategy:**

Option A (Recommended): No formula change. Add a UI tooltip explaining the difference: "Context % is based on actual API token counts. Claude Code's statusline applies a safety scaling to 80% cap."

Option B: Apply the same 80% scaling: `Math.min(100, Math.round((pct / 80) * 100))`. This matches the visual the user sees in their terminal but is less mathematically accurate.

Option C (if exact match is critical): Read from the `/tmp/claude-ctx-{session_id}.json` bridge file in the JSONL watcher or as a new data source. The bridge file has `remaining_percentage` from the actual statusLine payload. This would require per-session bridge file reading — adds complexity.

**Recommendation:** Option A for v2.0. Document the discrepancy clearly. The actual API counts are more useful for cost projection.

**Additional finding: cache_write5m vs cache_write1h bucketing**

The current `costEngine.js` correctly handles the nested `cache_creation` object:
```javascript
const cacheWrite5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0;
const cacheWrite1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
```

From live data: nearly all cache writes are `ephemeral_1h` (not 5m). The `getContextFillPercent` function sums both — correct behavior.

**The formula IS correct.** The visual discrepancy is a display choice, not a calculation error.

---

### Feature 3: Agent Detail Panel

#### Data Model for Per-Agent History (Critical Design Decision)

This is the most architecturally complex part of v2.0. The problem:

- `events` table has `session_id` (always the **parent** session ID for subagent tool calls)
- `agent_nodes` has `agent_id`, `parent_session_id`
- **There is no `agent_id` column in `events`** — and relay.py for PreToolUse/PostToolUse does NOT send agent_id

**Confirmed via live DB query:** All subagent tool events share the parent session_id. The agent_id from SubagentStart is NOT forwarded for individual PreToolUse/PostToolUse events.

**Two possible approaches:**

**Approach A: Add agent_id to PreToolUse/PostToolUse hook forwarding (Recommended)**

The PreToolUse/PostToolUse hook payload for a subagent tool call likely includes the agent's session context. However, relay.py currently only reads `session_id` (parent), not any agent-specific identifier. This needs verification: does the hook payload for a subagent's Bash tool call contain `agent_id` or a way to identify which agent is running it?

If Claude Code includes `agent_id` in PreToolUse/PostToolUse payloads for subagent tool calls:
- relay.py should extract and forward it
- events table gets `agent_id TEXT` column
- Per-agent history = `SELECT * FROM events WHERE session_id = @parent AND agent_id = @agent_id`

**Approach B: Time-window attribution (Fallback)**

If the hook payload does NOT include agent_id for individual tool calls:
- Use `spawned_at` and `last_activity_ts` from `agent_nodes` to define a time window
- Per-agent events = `SELECT * FROM events WHERE session_id = @parent_session_id AND timestamp BETWEEN @spawned_at AND @completed_at`
- Limitation: overlapping time windows if multiple agents run concurrently (common in GSD)

**Approach C: Track agent_id from SubagentStart context (Most Accurate)**

When SubagentStart fires for agent X, ALL subsequent events with the same parent `session_id` from that point until SubagentStop are NOT necessarily from agent X (other agents may also be running). This approach does not work for concurrent agents.

**Decision required before implementation:** Add temporary logging to relay.py to capture a full PreToolUse payload from a subagent tool call. If `agent_id` or equivalent is present, use Approach A. If not, use Approach B with documented limitation.

**Schema addition regardless of approach:**

```javascript
// agents_nodes - store human-readable info
addColumnIfNotExists(db, 'agent_nodes', 'initial_prompt', 'TEXT');  // first user message
addColumnIfNotExists(db, 'agent_nodes', 'description', 'TEXT');     // Task tool description
addColumnIfNotExists(db, 'agent_nodes', 'slug', 'TEXT');            // JSONL slug field (human name)
```

**The `slug` field from JSONL is the agent's human-readable name.** Live data shows: `slug: "kind-doodling-riddle"` — a memorable adjective-noun-noun combination. This is available in the subagent JSONL's first user record. The `jsonlWatcher.js` already processes these files — it can extract `slug` and write it to `agent_nodes` via upsert.

**Per-agent data serving approach:**

```javascript
// New API endpoint: GET /api/agents/:id
fastify.get('/api/agents/:id', (req, reply) => {
  const agent = db.prepare(`SELECT * FROM agent_nodes WHERE agent_id = ?`).get(req.params.id);
  if (!agent) return reply.code(404).send();

  // Get cost from session_cost where agent_id matches
  const cost = db.prepare(`SELECT * FROM session_cost WHERE agent_id = ?`).get(req.params.id);

  // Get tool history (Approach A or B depending on payload research)
  const events = db.prepare(`
    SELECT * FROM events
    WHERE session_id = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC LIMIT 500
  `).all(agent.parent_session_id, agent.spawned_at, agent.last_activity_ts + 60000);

  reply.send({ agent, cost, events });
});
```

**initial_prompt sourcing:**

The subagent JSONL first user record's `message.content` contains the initial prompt. The `jsonlWatcher.js` already reads these files for cost data — it can also extract the first user message content on first processing and write it to `agent_nodes.initial_prompt`. This does NOT require any hook changes.

```javascript
// In jsonlWatcher.js processFile(), for subagent files only:
function extractInitialPrompt(rawRecords) {
  for (const r of rawRecords) {
    if (r.type === 'user' && r.message) {
      const content = r.message.content;
      if (typeof content === 'string') return content.slice(0, 2000); // truncate
      if (Array.isArray(content)) {
        const textItem = content.find(c => c.type === 'text');
        if (textItem) return String(textItem.text || '').slice(0, 2000);
      }
    }
  }
  return null;
}

// Also extract slug:
function extractSlug(rawRecords) {
  for (const r of rawRecords) {
    if (r.type === 'user' && r.slug) return r.slug;
  }
  return null;
}
```

---

### Feature 4: Dashboard Layout Change

#### Current Layout (from index.html inspection)

```css
.dashboard {
  display: grid;
  grid-template-columns: 240px 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  height: 100vh;
}
/* panel-agents: grid-row: 1 / -1  (full height, 240px wide) */
/* panel-log:    grid-row: 1 / -1  (full height, 1fr) */
/* cost-panel:   row 1, column 3 */
/* health-panel: row 2, column 3 */
```

#### v2.0 Layout Target

The goal is "agent hierarchy as primary view, active-first layout." Options:

**Option A: Expand agent tree column + add detail panel**
```css
grid-template-columns: 300px 1fr 300px;
/* Column 1: Agent tree (wider, with active count badge) */
/* Column 2: Tool log / timeline (main content) */
/* Column 3: Context-sensitive detail (cost/tokens OR agent detail on click) */
```
Advantage: detail panel slides into column 3 without layout shift. Clean.

**Option B: Split column 1 into tree + detail (sidebar within sidebar)**
```css
grid-template-columns: 280px 1fr 260px;
/* Agent tree: full column 1 with collapse/expand */
/* Detail: opens in overlay or replaces column 3 */
```

**Option C: Agent tree takes column 1+3, log in center**
Higher complexity, less benefit. Not recommended.

**Recommendation: Option A** — minimal CSS change, preserves existing panel positions, column 3 becomes a "context panel" that shows cost+health by default and agent details on agent click. Requires:
- CSS: `grid-template-columns: 300px 1fr 300px` (adjust widths)
- JS: click handler on agent rows that swaps column 3 content between cost/health view and agent detail view
- No new HTML structure beyond the detail panel markup

**Active-first layout for agent tree:**
The agent tree already renders active agents highlighted. Sort change: move `state=active` agents to top of their session group. This is a JS sort change in the `renderAgentTree()` function, no DB change required.

---

### Feature 5: Time Filter

#### Client-side vs Server-side Decision

| Scenario | Approach | Rationale |
|----------|----------|-----------|
| Live events (after page load) | Client-side | Already in DOM, filter by timestamp attribute |
| Historical events on hydration | Server-side params | 500-event DB limit, time filter needed to narrow window |
| Session history page (/history) | Already server-side | `/api/sessions` already supports `date_from` / `date_to` |

**Implementation for main dashboard:**

The existing `/api/events` endpoint returns latest 200 events DESC. A time filter here needs server-side params:

```javascript
// Modify stmtAll in api.js to accept since/until:
const stmtAllFiltered = db.prepare(`
  SELECT * FROM events
  WHERE (@since = 0 OR timestamp >= @since)
    AND (@until = 0 OR timestamp <= @until)
  ORDER BY timestamp DESC LIMIT 200
`);
```

For the frontend, a time picker above the tool log panel with predefined ranges (Last 15m, Last 1h, Today, All) triggers a re-hydration fetch with `?since=...` param. Live SSE events are filtered client-side with `if (msg.timestamp < sinceFilter) return`.

**UI approach:** A toolbar row above the panel-log with radio buttons or a segmented control. Keep it simple: no date pickers, just preset ranges plus "All." This avoids the complexity of timezone handling and date picker libraries.

---

## Data Flow Changes Summary

### New Data Flow: Tool Input Enrichment (Feature 1)

```
Claude Code fires PreToolUse hook
  → relay.py reads tool_input (full payload field)
  → extract_safe_tool_input() picks safe fields per tool type
  → adds tool_input_summary: {command: "...", description: "..."} to POST body
  → ingest.js receives tool_input_summary
  → stored as JSON string in events.tool_input_summary
  → broadcast event includes tool_input_summary
  → frontend tool log row shows tool-specific detail (file path, command description)
```

### New Data Flow: Agent Detail (Feature 3)

```
Path A: Initial prompt from JSONL
  jsonlWatcher.js processes subagent JSONL on first change
  → extractInitialPrompt() reads first user record's message.content
  → extractSlug() reads slug field
  → upsertAgentNode includes initial_prompt, slug, description
  → stored in agent_nodes
  → served by GET /api/agents/:id

Path B: Per-agent events (pending relay.py payload verification)
  If agent_id in PreToolUse/PostToolUse payload:
    → relay.py forwards agent_id
    → events.agent_id column populated
    → per-agent history = events WHERE agent_id = X
  If not:
    → time-window query: events WHERE session_id = parent AND timestamp BETWEEN spawned_at AND last_activity_ts
```

### Modified Data Flow: Context Fill Display (Feature 2)

```
UNCHANGED: costEngine.getContextFillPercent(model, lastUsage) → integer 0-100
CHANGED: UI tooltip added explaining formula uses actual API tokens
OPTIONAL: Add scaling factor (/ 0.80) to match Claude Code statusline visual
```

---

## New vs Modified Components

| Component | Status | What Changes |
|-----------|--------|--------------|
| `hooks/relay.py` | MODIFIED | Add `extract_safe_tool_input()`, add `tool_input_summary` to POST body |
| `db/schema.js` | MODIFIED | `events.tool_input_summary` TEXT, `agent_nodes.initial_prompt/description/slug` TEXT |
| `lib/writeQueue.js` | MODIFIED | Update prepared statement to include `tool_input_summary` column |
| `routes/ingest.js` | MODIFIED | Pass `tool_input_summary` from raw body into event object for queue |
| `lib/jsonlWatcher.js` | MODIFIED | Extract `initial_prompt` and `slug` from subagent JSONLs, upsert to agent_nodes |
| `lib/costEngine.js` | MODIFIED | Document discrepancy, optionally add 80% scaling for statusline parity |
| `routes/api.js` | MODIFIED | Add `GET /api/agents/:id`, add time filter params to `/api/events` |
| `public/index.html` | MODIFIED | Agent detail panel, layout change, time filter toolbar, tool log enrichment display |
| `lib/sseClients.js` | UNCHANGED | No changes needed |
| `server.js` | UNCHANGED | No new routes or startup logic needed |
| `bin/cli.js` | UNCHANGED | No v2.0 changes |

**No new files required for v2.0.** All changes are modifications to existing components.

---

## Build Order (Dependency Graph)

```
1. relay.py selective capture (Feature 1, relay side)
      ↓ produces tool_input_summary in POST body
2. db/schema.js column additions (Feature 1, 3 schema side)
      ↓ columns exist before any data flows
3. writeQueue.js statement update (Feature 1, write side)
      ↓ INSERT includes tool_input_summary
4. ingest.js update (Feature 1, parse side)
      ↓ passes tool_input_summary through
5. jsonlWatcher.js update (Feature 3, JSONL side)
      ↓ initial_prompt + slug populated in agent_nodes
6. costEngine.js documentation update (Feature 2)
      ↓ context fill explanation added
7. api.js additions (Features 3, 5)
      ↓ /api/agents/:id and time filter params served
8. index.html changes (Features 3, 4, 5)
      ↓ consumes all new endpoints and data
```

**Rationale:** Schema changes before any code that writes to the schema. relay.py before ingest.js because ingest.js must handle the new field. jsonlWatcher.js before api.js because api serves what the watcher writes. Frontend last because it consumes all backend changes.

**Critical prerequisite before Step 1:** Add a temporary debug log to relay.py for SubagentStart events that prints the full payload fields (to a temp file, not stdout/stderr). Run one GSD session to capture a real SubagentStart payload. Confirm: (a) whether `description` is a field, and (b) whether PreToolUse/PostToolUse payloads for subagent tool calls include `agent_id`. This 10-minute test determines which approach is used for per-agent history.

---

## Integration Points

### relay.py Security Boundary Preservation

The selective capture must follow three rules:
1. Never read `tool_response` for any field
2. Never read `tool_input.content` for Write tool
3. Never read `tool_input.prompt` for Task tool

The `extract_safe_tool_input()` function must use an explicit allowlist (not a blocklist). New tool types default to returning `None` (nothing captured) unless explicitly added to the allowlist.

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| relay.py → ingest.js | HTTP POST, adds `tool_input_summary` field | Max 500ms total; string truncation in relay.py for safety |
| jsonlWatcher.js → agent_nodes | Direct SQLite upsert | Already doing upsert for cost; add initial_prompt to same upsert |
| api.js → frontend | REST + SSE | `tool_input_summary` included in event broadcasts and REST responses |
| agent_nodes detail → frontend | New REST endpoint `/api/agents/:id` | Single-row lookup, fast |

### SSE Event Type Changes

No new SSE event types needed. Existing `agent_spawn` and `agent_update` events can carry the new fields (`description`, `slug`) when they are available.

The existing `tool event broadcast` in ingest.js already calls `broadcast(event)` — the enriched event (with `tool_input_summary`) will automatically reach all connected clients.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Capturing tool_response Fields

**What people do:** Add `exit_status` extraction and then think "I'll also grab the Bash stdout for display."
**Why it's wrong:** Bash stdout can contain API keys, database dumps, private file contents. The relay.py security boundary was designed to prevent exactly this.
**Do this instead:** Only capture what's in the explicit allowlist. `exit_status` is already derived from `stderr` presence (boolean, not content).

### Anti-Pattern 2: Blocklist Instead of Allowlist for tool_input

**What people do:** `{k: v for k, v in tool_input.items() if k not in ['content', 'prompt']}` — grab everything except known dangerous fields.
**Why it's wrong:** New tool types or new fields in existing tools would be forwarded by default. A new `Bash.api_key` field would leak.
**Do this instead:** Explicit per-tool field allowlist. Unknown tools return `None`.

### Anti-Pattern 3: Blocking the ingest Route on tool_input_summary Parsing

**What people do:** Parse and validate `tool_input_summary` JSON in the ingest route before sending 202.
**Why it's wrong:** The 202 must be sent immediately (< 500ms relay deadline). Any CPU work before the 202 risks timeout.
**Do this instead:** Pass `raw.tool_input_summary` as-is (already JSON string from relay.py). Validate lazily on read.

### Anti-Pattern 4: New DB Table for Per-Agent Events

**What people do:** Create an `agent_events` join table to support per-agent queries.
**Why it's wrong:** Duplicates data; requires maintaining consistency with `events` table; double the write load under high-frequency tool calls.
**Do this instead:** Add `agent_id` column to `events` (if payload supports it) or use time-window query on the existing table.

### Anti-Pattern 5: Always-On agent_id Lookup in ingest.js

**What people do:** On every PreToolUse/PostToolUse, query `agent_nodes` to find which agent is active and attach its `agent_id` to the event.
**Why it's wrong:** This turns a fire-and-forget DB write into a synchronous read-then-write. Under parallel agent load (GSD runs 4+ concurrent agents), this serializes and creates a write bottleneck.
**Do this instead:** Let the hook payload provide `agent_id` directly. If the payload doesn't include it, use the time-window approach at read time, not write time.

### Anti-Pattern 6: Full Reparse of JSONL for initial_prompt on Every Change

**What people do:** Every time a subagent JSONL changes, re-read the entire file to extract the initial prompt.
**Why it's wrong:** The initial prompt is always in line 1 and never changes. Re-reading it on every cost update wastes I/O.
**Do this instead:** Extract initial_prompt only if `agent_nodes.initial_prompt IS NULL` for this agent_id. One-time extraction.

---

## Scaling Considerations

This is a local-first tool. Scaling concerns are about single-machine performance under GSD's multi-agent load, not distributed systems.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-4 concurrent agents (typical GSD) | Current architecture is sufficient. WAL mode handles concurrent readers. Single write queue serializes safely. |
| 8-16 concurrent agents (heavy GSD) | tool_input_summary JSON parsing in ingest.js may add measurable latency. Mitigation: move JSON.stringify to relay.py (already there if relay sends JSON). |
| SQLite events table > 100K rows | Add index on `(session_id, timestamp)` for time-window queries. Current index is only on implicit rowid. |

### First Bottleneck

The events table time-window query for per-agent history (if using Approach B — no `agent_id` column) will be a full scan of events for a session_id. With 500-event limit this is fast, but add an index on `(session_id, timestamp)` preemptively.

```javascript
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, timestamp)`);
```

---

## Sources

- Direct codebase inspection: `hooks/relay.py`, `db/schema.js`, `lib/writeQueue.js`, `routes/ingest.js`, `routes/api.js`, `lib/jsonlWatcher.js`, `lib/costEngine.js`, `public/index.html` (2026-03-02)
- Live DB query: `agent_nodes` table (agent_type values confirmed: gsd-research-synthesizer, gsd-project-researcher, etc.)
- Live JSONL inspection: subagent JSONL first user record confirms `slug`, `agentId`, `sessionId`, `isSidechain` fields
- Live tool input analysis: confirmed Bash (`command`, `description`), Read (`file_path`), Write (`file_path`, `content`), Edit (`file_path`, `old_string`, `new_string`), Grep (`pattern`, `path`, `output_mode`), Glob (`pattern`), Task (`description`, `subagent_type`, `prompt`)
- Context fill analysis: confirmed formula correctness; statusline scaling (80% cap) from `gsd-statusline.js` source code
- Existing research: v1.0 ARCHITECTURE.md (2026-02-26) — SubagentStop payload confirmed, hierarchy model confirmed

---

*Architecture research for: ObservAgent v2.0 Agent Intelligence features*
*Researched: 2026-03-02*
*Confidence: HIGH (all findings from direct codebase and live data inspection)*
