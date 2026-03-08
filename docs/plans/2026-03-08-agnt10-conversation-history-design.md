# Design: AGNT-10 Conversation History

**Date:** 2026-03-08
**Requirement:** AGNT-10 — Agent detail panel shows the agent's full conversation history (messages received and sent)
**Status:** Approved

---

## Problem

The `ContextTab` in `AgentDetailPanel` is a placeholder. No conversation history is captured or displayed. Claude Code transcript JSONL files contain the full conversation but are not read by ObservAgent.

## Approach: On-demand Transcript Read

Read the existing Claude Code transcript JSONL file from disk when the Context tab is opened. No new DB tables, no real-time streaming, no relay.py latency risk.

## Data Flow

```
Hook payload (has transcript_path)
    ↓
relay.py → forwards transcript_path in POST body
    ↓
ingest.js (SubagentStart) → stores transcript_path in agent_nodes
    ↓
GET /api/agents/:id/context → reads JSONL from disk, parses, returns turns
    ↓
ContextTab → renders as chat-style timeline
```

## Backend Changes

### relay.py
Add `transcript_path` to POST body (1-line change):
```python
"transcript_path": payload.get("transcript_path", "")
```

### db/schema.js
Migration — add column to agent_nodes:
```js
addColumnIfNotExists(db, 'agent_nodes', 'transcript_path', 'TEXT')
```

### ingest.js
Store on SubagentStart alongside existing fields:
```js
upsertAgentNode.run({ ..., transcript_path: raw.transcript_path || null })
```
Update `upsertAgentNode` prepared statement to include the new column.

### routes/api.js — new endpoint
`GET /api/agents/:id/context`
1. Fetch `transcript_path` from `agent_nodes WHERE agent_id = ?`
2. If null/missing → return `{ turns: [], total_lines: 0 }`
3. `fs.readFileSync(transcript_path, 'utf8')` → split on newline → parse each line as JSON
4. Skip lines that fail JSON.parse
5. Extract `{ role, content }` from each `message` object
6. Cap at last 50 turns; return `{ turns, total_lines }`

### Error handling
- File not found → `{ turns: [], total_lines: 0, error: 'transcript_not_found' }`
- Permission error → same empty response
- Malformed lines → silently skipped

## JSONL Message Format

Claude Code transcript lines:
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"..."}]}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"..."},{"type":"tool_use","name":"Bash","input":{...}}]}}
```

Parser extracts:
- `text` blocks → rendered as chat bubble, truncated at 500 chars with expand toggle
- `tool_use` blocks → rendered as collapsed pill (tool name + first 100 chars of input)
- `tool_result` blocks → collapsed by default

## Frontend: ContextTab

Replace placeholder with scrollable message list:

```
┌─────────────────────────────┐
│ user                        │
│ ┌─────────────────────────┐ │
│ │ Fix the bug in relay.py │ │
│ └─────────────────────────┘ │
│                    assistant │
│ ┌─────────────────────────┐ │
│ │ I'll read the file...   │ │
│ │ [Read] relay.py         │ │  ← collapsed tool_use
│ └─────────────────────────┘ │
└─────────────────────────────┘
  Showing last 50 turns · 2,341 lines total
```

**Component:** `ContextTab` in `AgentDetailTabs.tsx`
- Fetches `GET /api/agents/:id/context` when tab becomes active
- Renders turns in chronological order
- User turns: right-aligned bubble
- Assistant turns: left-aligned, groups text + tool_use blocks together
- Footer: "Showing last N turns · M lines total"

## Files Modified

| File | Change |
|------|--------|
| `hooks/relay.py` | Forward `transcript_path` in POST body |
| `db/schema.js` | Add `transcript_path` migration |
| `routes/ingest.js` | Store `transcript_path` in `agent_nodes` on SubagentStart |
| `routes/api.js` | New `GET /api/agents/:id/context` endpoint |
| `frontend/src/components/agents/AgentDetailTabs.tsx` | Implement `ContextTab` |
| `frontend/src/components/agents/AgentDetailPanel.tsx` | Pass `agentId` to `ContextTab` |

## Out of Scope

- Real-time updates while agent is running (read on tab open is sufficient)
- Storing messages in DB (file read is fast enough)
- Full message search
