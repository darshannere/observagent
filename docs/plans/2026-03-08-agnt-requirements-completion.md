# AGNT Requirements Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mark AGNT-01 through AGNT-09 as complete in REQUIREMENTS.md and implement AGNT-10 (conversation history via on-demand JSONL transcript read).

**Architecture:** AGNT-01–09 are already implemented in code — only REQUIREMENTS.md checkboxes need updating. AGNT-10 adds a `transcript_path` column to `agent_nodes`, forwards the path through relay.py → ingest.js, and serves it via a new `/api/agents/:id/context` endpoint that reads the JSONL file on-demand. The `ContextTab` in `AgentDetailTabs.tsx` fetches and renders conversation turns.

**Tech Stack:** Python (relay.py), Node.js/Fastify (backend), React + TypeScript (frontend), SQLite via better-sqlite3, Vite build

---

### Task 1: Check off AGNT-01 through AGNT-09 in REQUIREMENTS.md

**Files:**
- Modify: `.planning/REQUIREMENTS.md`

**Step 1: Update checkboxes**

Open `.planning/REQUIREMENTS.md`. Find each of the following lines and change `[ ]` to `[x]`:

- `[ ] **AGNT-01**`
- `[ ] **AGNT-02**`
- `[ ] **AGNT-03**`
- `[ ] **AGNT-06**`
- `[ ] **AGNT-07**`
- `[ ] **AGNT-08**`
- `[ ] **AGNT-09**`

Also update the traceability table rows for these IDs — change `Pending` to `Complete` in the Status column.

**Step 2: Verify**

```bash
grep -E "AGNT-0[123]|AGNT-0[6789]" .planning/REQUIREMENTS.md | grep "\[ \]"
```
Expected: no output (all should now be `[x]`)

**Step 3: Commit**

```bash
git add .planning/REQUIREMENTS.md
git commit -m "chore: mark AGNT-01 through AGNT-09 complete in REQUIREMENTS.md"
```

---

### Task 2: Add `transcript_path` migration to db/schema.js

**Files:**
- Modify: `db/schema.js`

**Step 1: Add migration line**

In `db/schema.js`, find the block of `addColumnIfNotExists` calls (around line 70+). Add this line after the `initial_prompt` migration:

```js
addColumnIfNotExists(db, 'agent_nodes', 'transcript_path', 'TEXT');
console.log('[db] transcript_path column ready');
```

Place it directly after:
```js
addColumnIfNotExists(db, 'agent_nodes', 'initial_prompt', 'TEXT');
console.log('[db] initial_prompt column ready');
```

**Step 2: Verify the migration runs without error**

```bash
node -e "import('./db/schema.js').then(m => { m.initDb('./test-migration.db'); process.exit(0); })"
```
Expected: logs including `[db] transcript_path column ready` with no errors.

Clean up:
```bash
rm -f test-migration.db test-migration.db-wal test-migration.db-shm
```

**Step 3: Commit**

```bash
git add db/schema.js
git commit -m "feat(db): add transcript_path column to agent_nodes"
```

---

### Task 3: Forward `agent_transcript_path` in relay.py on SubagentStart

**Files:**
- Modify: `hooks/relay.py`

**Context:** The hook payload for SubagentStart contains `agent_transcript_path` — the path to the new subagent's JSONL transcript file. Currently relay.py captures it only for SubagentStop. We need it for SubagentStart too.

**Step 1: Add the field capture**

In `hooks/relay.py`, find the SubagentStart block (around line 168–171):

```python
if hook_event == "SubagentStart":
    event["agent_type"] = payload.get("agent_type", "")
```

Change it to:

```python
if hook_event == "SubagentStart":
    event["agent_type"]            = payload.get("agent_type", "")
    event["agent_transcript_path"] = payload.get("agent_transcript_path", "")
```

**Step 2: Verify with a dry-run parse**

```bash
echo '{"hook_event_name":"SubagentStart","session_id":"sess-abc","agent_id":"agt-xyz","agent_type":"gsd-executor","agent_transcript_path":"/home/user/.claude/projects/foo/agent-xyz.jsonl"}' \
  | python3 hooks/relay.py
```
Expected: exits 0, no output to stdout or stderr (relay is fire-and-forget silent).

**Step 3: Commit**

```bash
git add hooks/relay.py
git commit -m "feat(relay): forward agent_transcript_path on SubagentStart"
```

---

### Task 4: Store `transcript_path` in ingest.js on SubagentStart

**Files:**
- Modify: `routes/ingest.js`

**Step 1: Update the prepared statement**

In `routes/ingest.js`, find `upsertAgentNode` (around line 27–35):

```js
const upsertAgentNode = db.prepare(`
  INSERT INTO agent_nodes (agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts)
  VALUES (@agent_id, @parent_session_id, @agent_type, @state, @spawned_at, @last_activity_ts)
  ON CONFLICT(agent_id) DO UPDATE SET
    state            = excluded.state,
    last_activity_ts = excluded.last_activity_ts
`);
```

Replace with:

```js
const upsertAgentNode = db.prepare(`
  INSERT INTO agent_nodes (agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts, transcript_path)
  VALUES (@agent_id, @parent_session_id, @agent_type, @state, @spawned_at, @last_activity_ts, @transcript_path)
  ON CONFLICT(agent_id) DO UPDATE SET
    state            = excluded.state,
    last_activity_ts = excluded.last_activity_ts,
    transcript_path  = COALESCE(excluded.transcript_path, agent_nodes.transcript_path)
`);
```

The `COALESCE` keeps the existing path if the upsert fires without a path (e.g., state updates).

**Step 2: Pass `transcript_path` in the SubagentStart handler**

Find the `upsertAgentNode.run({...})` call inside the `SubagentStart` block (around line 107–116):

```js
upsertAgentNode.run({
  agent_id:          agentId,
  parent_session_id: event.session_id,
  agent_type:        agentType,
  state:             'active',
  spawned_at:        event.timestamp,
  last_activity_ts:  event.timestamp,
});
```

Replace with:

```js
upsertAgentNode.run({
  agent_id:          agentId,
  parent_session_id: event.session_id,
  agent_type:        agentType,
  state:             'active',
  spawned_at:        event.timestamp,
  last_activity_ts:  event.timestamp,
  transcript_path:   raw.agent_transcript_path || null,
});
```

**Step 3: Verify the server starts cleanly**

```bash
node server.js &
sleep 2
curl -s http://localhost:4999/api/agents | head -c 200
kill %1
```
Expected: valid JSON response, no crash, no `[db] error` in server logs.

**Step 4: Commit**

```bash
git add routes/ingest.js
git commit -m "feat(ingest): store transcript_path in agent_nodes on SubagentStart"
```

---

### Task 5: Add `GET /api/agents/:id/context` endpoint

**Files:**
- Modify: `routes/api.js`

**Step 1: Add `import fs from 'fs'` if not present**

At the top of `routes/api.js`, check if `fs` is imported. If not, add:

```js
import fs from 'fs';
```

**Step 2: Add the endpoint**

At the end of `routes/api.js`, just before the closing `}` of the exported function, add:

```js
fastify.get('/api/agents/:id/context', (request, reply) => {
  const { id } = request.params;

  const agent = db.prepare(
    `SELECT transcript_path FROM agent_nodes WHERE agent_id = ?`
  ).get(id);

  if (!agent || !agent.transcript_path) {
    return reply.send({ turns: [], total_lines: 0 });
  }

  let raw;
  try {
    raw = fs.readFileSync(agent.transcript_path, 'utf8');
  } catch {
    return reply.send({ turns: [], total_lines: 0, error: 'transcript_not_found' });
  }

  const lines = raw.split('\n').filter(Boolean);
  const total_lines = lines.length;

  // Parse each line; skip malformed ones
  const allTurns = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      // Claude Code transcript format: { type: "user"|"assistant", message: { role, content: [...] } }
      // Also handle flat { role, content } format
      const msg = obj.message || obj;
      const role = msg.role;
      if (!role || !Array.isArray(msg.content)) continue;
      allTurns.push({ role, content: msg.content });
    } catch {
      // skip malformed lines
    }
  }

  // Return last 50 turns
  const turns = allTurns.slice(-50);
  reply.send({ turns, total_lines });
});
```

**Step 3: Test the endpoint manually**

Start the server and call the endpoint with a known agent ID:

```bash
node server.js &
sleep 2
curl -s http://localhost:4999/api/agents/nonexistent/context
```
Expected: `{"turns":[],"total_lines":0}`

```bash
kill %1
```

**Step 4: Commit**

```bash
git add routes/api.js
git commit -m "feat(api): add GET /api/agents/:id/context endpoint"
```

---

### Task 6: Pass `agentId` to `ContextTab` in AgentDetailPanel.tsx

**Files:**
- Modify: `frontend/src/components/agents/AgentDetailPanel.tsx`

**Context:** `ContextTab` currently takes no props. It needs the selected agent's ID to fetch conversation history. `AgentDetailPanel` already has `selectedAgent` (the agent ID string).

**Step 1: Update `ContextTab` call**

In `AgentDetailPanel.tsx`, find:

```tsx
{activeTab === 'context' && <ContextTab />}
```

Replace with:

```tsx
{activeTab === 'context' && <ContextTab agentId={selectedAgent} />}
```

**Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: error about `ContextTab` not accepting `agentId` prop — this is expected and will be fixed in the next task.

---

### Task 7: Implement `ContextTab` in AgentDetailTabs.tsx

**Files:**
- Modify: `frontend/src/components/agents/AgentDetailTabs.tsx`

**Step 1: Add types and the ContextTab component**

In `AgentDetailTabs.tsx`, replace the existing `ContextTab` function:

```tsx
// Current placeholder to replace:
export function ContextTab() {
  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="text-xs text-muted-foreground">
        Conversation history will be available in Phase 11.
      </div>
      <div className="text-[10px] text-muted-foreground italic">
        Requires: database schema for message storage, relay.py JSONL parsing, new API endpoints.
      </div>
    </div>
  )
}
```

Replace with:

```tsx
interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | Array<{ type: string; text?: string }>
}

interface ConversationTurn {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}

interface ContextResponse {
  turns: ConversationTurn[]
  total_lines: number
  error?: string
}

function truncate(text: string, max = 500): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max), truncated: true }
}

function ToolUseBlock({ block }: { block: ContentBlock }) {
  const inputStr = block.input ? JSON.stringify(block.input).slice(0, 100) : ''
  return (
    <div className="text-[10px] font-mono bg-blue-950/40 text-blue-300 rounded px-1.5 py-0.5 truncate">
      [{block.name}] {inputStr}
    </div>
  )
}

function TextBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const { text: shown, truncated } = truncate(text, 500)
  return (
    <div className="text-xs whitespace-pre-wrap break-words">
      {expanded ? text : shown}
      {truncated && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 text-[10px] text-primary underline"
        >
          show more
        </button>
      )}
    </div>
  )
}

function TurnRow({ turn }: { turn: ConversationTurn }) {
  const isUser = turn.role === 'user'
  return (
    <div className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
        {turn.role}
      </span>
      <div
        className={[
          'max-w-[95%] rounded px-2 py-1.5 flex flex-col gap-1',
          isUser ? 'bg-primary/10 text-foreground' : 'bg-muted/30 text-foreground',
        ].join(' ')}
      >
        {turn.content.map((block, i) => {
          if (block.type === 'text' && block.text) {
            return <TextBlock key={i} text={block.text} />
          }
          if (block.type === 'tool_use') {
            return <ToolUseBlock key={i} block={block} />
          }
          if (block.type === 'tool_result') {
            const resultText =
              typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map((c) => c.text || '').join('\n')
                  : ''
            return (
              <div key={i} className="text-[10px] text-muted-foreground italic truncate">
                [tool result] {resultText.slice(0, 80)}
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

export function ContextTab({ agentId }: { agentId: string | null }) {
  const [data, setData] = useState<ContextResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!agentId) return
    setLoading(true)
    fetch(`/api/agents/${agentId}/context`)
      .then((r) => r.json())
      .then((d: ContextResponse) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId])

  if (loading) {
    return <div className="text-xs text-muted-foreground px-3 py-4">Loading...</div>
  }

  if (!data || data.turns.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-4">
        {data?.error === 'transcript_not_found'
          ? 'Transcript file not found.'
          : 'No conversation history yet.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {data.turns.map((turn, i) => (
          <TurnRow key={i} turn={turn} />
        ))}
      </div>
      <div className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        Showing last {data.turns.length} turns · {data.total_lines.toLocaleString()} lines total
      </div>
    </div>
  )
}
```

Also add `useState` to the import at the top of the file if not already present:
```tsx
import { useState } from 'react'
```

**Step 2: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors

**Step 3: Build frontend**

```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: `built in X.XXs` with no errors. Note the new asset filenames.

**Step 4: Update `public/dist/index.html` with new asset references**

After building, copy the new dist output:

```bash
cp -r frontend/dist/* public/dist/
```

**Step 5: Verify the full app builds and serves**

```bash
node server.js &
sleep 2
curl -s http://localhost:4999/ | head -5
kill %1
```
Expected: HTML response starting with `<!doctype html>`

**Step 6: Commit**

```bash
git add frontend/src/components/agents/AgentDetailTabs.tsx \
        frontend/src/components/agents/AgentDetailPanel.tsx \
        public/dist/
git commit -m "feat(ui): implement ContextTab with on-demand JSONL conversation history (AGNT-10)"
```

---

### Task 8: Update REQUIREMENTS.md for AGNT-10 and final verification

**Files:**
- Modify: `.planning/REQUIREMENTS.md`

**Step 1: Check off AGNT-10**

In `.planning/REQUIREMENTS.md`, change:
```
- [ ] **AGNT-10**
```
to:
```
- [x] **AGNT-10**
```

Also update its traceability table row from `Pending` to `Complete`.

**Step 2: Verify all AGNT requirements are now checked**

```bash
grep "AGNT-" .planning/REQUIREMENTS.md | grep "\[ \]"
```
Expected: no output

**Step 3: Final build check**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: clean build

**Step 4: Commit**

```bash
git add .planning/REQUIREMENTS.md
git commit -m "chore: mark AGNT-10 complete — all AGNT requirements done"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Check off AGNT-01–09 in REQUIREMENTS.md |
| 2 | DB migration: `transcript_path` column in `agent_nodes` |
| 3 | relay.py: forward `agent_transcript_path` on SubagentStart |
| 4 | ingest.js: store `transcript_path` when agent spawns |
| 5 | api.js: `GET /api/agents/:id/context` reads JSONL on-demand |
| 6 | AgentDetailPanel: pass `agentId` to ContextTab |
| 7 | AgentDetailTabs: full ContextTab implementation |
| 8 | Check off AGNT-10, final verification |
