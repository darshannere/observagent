# Phase 10: Agent Panel Redesign - Research

**Phase:** 10
**Goal:** Implement agent panel redesign with collapsible tree, active count badge, human-readable names, current tool display, and tabbed detail panel
**Status:** Research Complete

---

## Executive Summary

Phase 10 implements the Agent Panel (AGNT) requirements from v2.0, enabling users to navigate the full agent hierarchy with collapsible branches, see real-time active agent count, view human-readable agent names with current tool indicators, and drill into any agent via a side panel with 4 tabs. This phase requires backend API additions, database schema changes, and frontend enhancements across the Zustand store, AgentTree component, and new AgentDetailPanel component.

---

## 1. Persisting Collapse State in localStorage with React

### Approach

The collapse state should be stored in localStorage with a key pattern that ties it to the session ID, allowing different sessions to have independent collapse states.

```typescript
// localStorage key pattern
const COLLAPSE_STORAGE_KEY = 'observagent:collapsed-sessions'

// Hook for managing collapse state
function useCollapseState(sessionId: string) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY)
    if (!stored) return false
    try {
      const collapsedSessions: Record<string, boolean> = JSON.parse(stored)
      return collapsedSessions[sessionId] ?? false
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const newValue = !prev
      const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY)
      const collapsedSessions: Record<string, boolean> = stored ? JSON.parse(stored) : {}
      collapsedSessions[sessionId] = newValue
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedSessions))
      return newValue
    })
  }, [sessionId])

  return { collapsed, toggle }
}
```

### Integration with AgentTree

The existing AgentTree uses native `<details>`/`<summary>` elements for collapse behavior. The `open` attribute should be controlled by the localStorage-backed state:

```tsx
<details open={!collapsed} onToggle={(e) => {
  // Prevent default and use our controlled state
  e.preventDefault()
  toggle()
}}>
```

### Key Decision

The CONTEXT.md specifies that collapse state should persist across SSE updates. The implementation must:
- Load initial state from localStorage on component mount
- Update localStorage on every toggle
- Not rely on SSE events for collapse state (local-only preference)

---

## 2. Tracking Current Tool Per Agent

### Required Agent Type Extension

The current `Agent` interface needs to be extended to include `currentTool`:

```typescript
// frontend/src/types/index.ts
export interface Agent {
  agentId: string
  parentSessionId: string
  agentType: string
  state: 'active' | 'idle' | 'errored'
  lastActivityTs: number
  cost: number
  tokens: number
  currentTool: string | null  // NEW: current tool being executed
}
```

### Backend SSE Event Enhancement

The SSE handler must emit `current_tool` information with each `PreToolUse` event. Looking at the existing `useSSE.ts`, the `PreToolUse` handling should be extended:

```typescript
// In useSSE.ts SSEMessage interface
interface SSEMessage {
  // ... existing fields
  currentTool?: string  // ADD: tool_name from PreToolUse
}

// In the PreToolUse handler
if (msg.hook_type === 'PreToolUse') {
  store.appendEvent(msg as unknown as ToolEvent)
  // NEW: Update current tool for the agent
  if (msg.session_id) {
    store.updateAgentCurrentTool(msg.session_id, msg.tool_name)
  }
  return
}
```

### Store Action Addition

```typescript
// In useObservStore.ts
updateAgentCurrentTool(agentId: string, toolName: string) {
  set((s) => {
    const existing = s.agents.get(agentId)
    if (!existing) return {}
    const agents = new Map(s.agents)
    agents.set(agentId, { ...existing, currentTool: toolName })
    return { agents }
  })
}
```

### Database Consideration

The `currentTool` is ephemeral state derived from the most recent `PreToolUse` event. It does not need to be persisted to the database - it is purely in-memory state that resets when the agent becomes idle.

---

## 3. Data Structure for Side Panel Tabs

### Tab Definitions

The AgentDetailPanel requires four distinct tabs with different data sources:

| Tab | Data Source | Display |
|-----|-------------|---------|
| Prompt | Agent's initial task prompt | Text display with truncation |
| Context | Conversation messages | Message history (user/assistant turns) |
| Calls | Tool call events for this agent | Table with timestamps, tool name, duration, status |
| Tokens | Per-API-call token breakdown | Table with input/output/cache tokens per call |

### TypeScript Interfaces

```typescript
// Tab configuration
type AgentDetailTab = 'prompt' | 'context' | 'calls' | 'tokens'

interface AgentDetailTabs {
  activeTab: AgentDetailTab
  setActiveTab: (tab: AgentDetailTab) => void
}

// Data structures for each tab
interface PromptData {
  initialPrompt: string
  spawnedAt: number
}

interface ContextMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
}

interface ToolCall {
  toolName: string
  timestamp: number
  durationMs: number | null
  exitStatus: number | null
  toolSummary: string | null
}

interface TokenCall {
  timestamp: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}
```

### Component Structure

```tsx
// AgentDetailPanel.tsx
export function AgentDetailPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<AgentDetailTab>('prompt')
  const agent = useObservStore(s => s.agents.get(agentId))

  return (
    <div className="w-80 border-l border-border flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="font-mono text-xs">{agent?.agentType}</span>
        <button onClick={onClose}>&times;</button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {(['prompt', 'context', 'calls', 'tokens'] as AgentDetailTab[]).map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? 'border-b-2 border-primary' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-2">
        {activeTab === 'prompt' && <PromptTab agentId={agentId} />}
        {activeTab === 'context' && <ContextTab agentId={agentId} />}
        {activeTab === 'calls' && <CallsTab agentId={agentId} />}
        {activeTab === 'tokens' && <TokensTab agentId={agentId} />}
      </div>
    </div>
  )
}
```

---

## 4. Fetching Agent Message History from Backend

### Required: New API Endpoint

The existing `/api/agents` endpoint only returns basic agent metadata. A new endpoint is needed to fetch detailed agent information including prompt and context:

```javascript
// routes/api.js - New endpoint
fastify.get('/api/agents/:id/detail', (request, reply) => {
  const { id } = request.params

  // 1. Get agent metadata
  const agent = stmtAgentById.get(id)
  if (!agent) return reply.code(404).send({ error: 'Agent not found' })

  // 2. Get tool call history for this agent
  const toolCalls = stmtAgentToolCalls.all(id)
  // Returns: tool_name, timestamp, duration_ms, exit_status, tool_summary

  // 3. Get token data per API call (30s proximity matching)
  const tokenData = stmtAgentTokens.all(id)
  // Returns: timestamp_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens

  // 4. Get initial prompt - REQUIRES NEW DATABASE COLUMN
  // Currently no column stores the initial prompt

  reply.send({
    agent,
    toolCalls,
    tokenData,
    // prompt: agent.initial_prompt  // when column exists
  })
})
```

### Database Schema Change Required

The CONTEXT.md specifies that the Prompt tab should show "initial task prompt the agent was given when spawned". This requires a new column in `agent_nodes`:

```sql
-- Add to db/schema.js
addColumnIfNotExists(db, 'agent_nodes', 'initial_prompt', 'TEXT');
```

The initial prompt should be captured when the agent is first spawned (from the JSONL watcher or SSE relay). Looking at Phase 4 research, this was identified but deferred - now it is required for AGNT-06.

### Alternative: Parse from Tool Events

If the initial prompt is not explicitly stored, it could potentially be inferred from early `Task` tool calls or system messages. However, explicit storage is more reliable.

---

## 5. Displaying Per-Call Token Breakdown

### Existing Token Data in Database

The `api_calls` table already exists with token columns:

```sql
CREATE TABLE api_calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT    NOT NULL,
  timestamp_ms  INTEGER NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, timestamp_ms)
);
```

However, the table is missing `cache_read_tokens` and `cache_write_tokens` columns that are needed for the Tokens tab (AGNT-09).

### Schema Enhancement Required

```sql
-- Add to api_calls table
ALTER TABLE api_calls ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_calls ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0;
```

### Frontend Token Display

```tsx
// TokensTab component
function TokensTab({ agentId }: { agentId: string }) {
  const [tokenData, setTokenData] = useState<TokenCall[]>([])
  const agent = useObservStore(s => s.agents.get(agentId))

  useEffect(() => {
    fetch(`/api/agents/${agentId}/detail`)
      .then(r => r.json())
      .then(data => setTokenData(data.tokenData || []))
  }, [agentId])

  if (tokenData.length === 0) {
    return <div className="text-muted-foreground text-xs">No token data available</div>
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th>Time</th>
          <th>Input</th>
          <th>Output</th>
          <th>Cache</th>
        </tr>
      </thead>
      <tbody>
        {tokenData.map((call, i) => (
          <tr key={i} className="border-t border-border">
            <td className="py-1">{formatTime(call.timestamp_ms)}</td>
            <td>{formatNumber(call.inputTokens)}</td>
            <td>{formatNumber(call.outputTokens)}</td>
            <td>{formatNumber(call.cacheReadTokens + call.cacheWriteTokens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

### Token Aggregation Display

For a summary view, show totals at the bottom:

```tsx
const totalInput = tokenData.reduce((sum, c) => sum + c.inputTokens, 0)
const totalOutput = tokenData.reduce((sum, c) => sum + c.outputTokens, 0)
const totalCache = tokenData.reduce((sum, c) => sum + c.cacheReadTokens + c.cacheWriteTokens, 0)

return (
  <tfoot className="font-semibold border-t-2 border-border">
    <tr>
      <td>Total</td>
      <td>{formatNumber(totalInput)}</td>
      <td>{formatNumber(totalOutput)}</td>
      <td>{formatNumber(totalCache)}</td>
    </tr>
  </tfoot>
)
```

---

## 6. UI Patterns for Collapsible Tree Components

### Existing Implementation

The current `AgentTree.tsx` uses native HTML `<details>`/`<summary>` elements, which provides built-in accessibility and requires no JavaScript for basic functionality. This is the pattern to build upon.

### Enhancement Pattern

1. **Visual Indication**: Add chevron icon that rotates on expand/collapse
2. **State Synchronization**: Controlled open state tied to localStorage
3. **Animation**: CSS transitions for smooth expand/collapse (optional enhancement)

```tsx
// Enhanced collapse indicator
<details open={!collapsed} className="group">
  <summary className="cursor-pointer list-none flex items-center gap-1">
    <ChevronIcon
      className={collapsed ? 'rotate-0' : 'rotate-90'}
      style={{ transition: 'transform 150ms ease' }}
    />
    <span className="font-mono">{session.sessionId.slice(-8)}</span>
  </summary>
  {/* children */}
</details>
```

### Performance Consideration

The CONTEXT.md references Phase 8 research about "DOM thrash fix — debounce at 150ms + external collapsed-state Set before adding collapsible tree UI". This indicates that render performance was previously an issue. The new implementation should:

- Use controlled collapse state (not relying on React re-renders for DOM manipulation)
- Consider using `useMemo` for session/agent derived data
- Keep the `<details>`/`<summary>` approach as it does not require JavaScript for the toggle

### Active Count Badge Implementation

The active count badge should be in the header bar:

```tsx
// In LiveDashboard.tsx header
const activeAgents = useObservStore(s =>
  Array.from(s.agents.values()).filter(a => a.state === 'active').length
)

// In the header JSX
<div className="flex items-center gap-2">
  <span className="text-xs text-muted-foreground">Agents</span>
  {activeAgents > 0 && (
    <span className="px-2 py-0.5 bg-green-900/60 text-green-300 text-xs rounded-full">
      {activeAgents} active
    </span>
  )}
</div>
```

The badge should update in real-time via SSE - the existing `agent_update` event type should trigger a re-computation of the active count.

---

## 7. Summary of Required Changes

### Database (db/schema.js)

1. Add `initial_prompt TEXT` column to `agent_nodes` table (for AGNT-06)
2. Add `cache_read_tokens INTEGER DEFAULT 0` column to `api_calls` table (for AGNT-09)
3. Add `cache_write_tokens INTEGER DEFAULT 0` column to `api_calls` table (for AGNT-09)

### Backend (routes/api.js)

1. Add `GET /api/agents/:id/detail` endpoint returning:
   - Agent metadata
   - Tool call history (timestamp, tool_name, duration_ms, exit_status, tool_summary)
   - Token breakdown per API call (timestamp_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
   - Initial prompt (from new column)

### Frontend Types (frontend/src/types/index.ts)

1. Extend `Agent` interface with `currentTool: string | null`

### Frontend Store (frontend/src/store/useObservStore.ts)

1. Add `selectedAgent: string | null` state
2. Add `collapsedSessions: Set<string>` state
3. Add `setSelectedAgent(agentId: string | null)` action
4. Add `toggleSessionCollapse(sessionId: string)` action
5. Add `updateAgentCurrentTool(agentId: string, toolName: string)` action

### Frontend Components

1. **AgentTree.tsx** - Enhanced with:
   - Controlled collapse state from localStorage
   - Human-readable names: `{agentType} [{last4}]`
   - Current tool display in each row
   - Selection opens detail panel

2. **AgentDetailPanel.tsx** (NEW) - Side panel with 4 tabs:
   - PromptTab: Initial task prompt
   - ContextTab: Conversation messages (placeholder - requires future API)
   - CallsTab: Tool call history table
   - TokensTab: Per-call token breakdown

3. **LiveDashboard.tsx** - Enhanced with:
   - Active count badge in header
   - AgentDetailPanel integration (conditionally rendered when agent selected)

---

## 8. Requirement Coverage

| Requirement | Implementation Approach |
|-------------|------------------------|
| AGNT-01: Collapsible tree | Extend AgentTree with localStorage-backed `<details open>` state |
| AGNT-02: Active count badge | Computed from agents with state='active', displayed in header |
| AGNT-03: Human-readable names | Format: `{agentType} [{last4}]` in AgentTree row |
| AGNT-04: Current tool display | New `currentTool` field updated on PreToolUse events |
| AGNT-05: Click to open detail | Add selectedAgent to store, render AgentDetailPanel |
| AGNT-06: Prompt tab | New DB column + API endpoint + PromptTab component |
| AGNT-07: Context fill % | Already exists in store (contextFillPct), display in PromptTab |
| AGNT-08: Calls tab | API returns tool calls, CallsTab renders table |
| AGNT-09: Tokens tab | New API + schema columns, TokensTab renders breakdown |
| AGNT-10: Context tab | Deferred - requires conversation history API (future phase) |

---

## 9. Risks and Open Questions

1. **Context Tab (AGNT-10)**: The conversation history is not currently captured in the database. This requirement may need to be scoped differently or deferred to a future phase unless message capture is added.

2. **Initial Prompt Capture**: The relay.py or jsonlWatcher needs to capture and store the initial prompt when an agent spawns. This requires coordination between the Python relay and the Node.js backend.

3. **Token Data Completeness**: The `api_calls` table needs the cache token columns added and populated. Need to verify the relay is sending this data.

4. **Performance**: The active count computation runs on every store update. Consider memoization if performance becomes an issue.

---

## 10. Database Schema Implementation Details

The codebase uses `addColumnIfNotExists` helper in `db/schema.js` for safe schema migrations. Here are the exact changes needed:

### Schema Migration Code

```javascript
// In db/schema.js, add after line 73 (after tool_summary column):

addColumnIfNotExists(db, 'agent_nodes', 'initial_prompt', 'TEXT');
console.log('[db] initial_prompt column ready for agent_nodes');

addColumnIfNotExists(db, 'api_calls', 'cache_read_tokens', 'INTEGER NOT NULL DEFAULT 0');
console.log('[db] cache_read_tokens column ready for api_calls');

addColumnIfNotExists(db, 'api_calls', 'cache_write_tokens', 'INTEGER NOT NULL DEFAULT 0');
console.log('[db] cache_write_tokens column ready for api_calls');
```

### Verification Queries

After migration, verify columns exist:

```sql
PRAGMA table_info(agent_nodes);
-- Should show: agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts, initial_prompt

PRAGMA table_info(api_calls);
-- Should show: id, session_id, timestamp_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
```

---

## 11. Validation Architecture

For Nyquist validation, this phase should include:

- Unit tests for localStorage collapse state persistence
- Integration tests for new API endpoint
- Visual regression tests for AgentTree with various collapse states
- Verification that active badge updates in real-time

---

## Sources

### Primary (HIGH confidence)
- Context7: `/facebook/react` - React hooks, useState patterns
- Context7: `/pmndrs/zustand` - Zustand store patterns
- Existing codebase: AgentTree.tsx (line 48 details/summary), useObservStore.ts, db/schema.js
- Existing API: routes/api.js - existing endpoint patterns

### Secondary (MEDIUM confidence)
- WebSearch: "React slide-in drawer component patterns" - verified against existing Tailwind patterns in codebase

### Tertiary (LOW confidence)
- None required - sufficient existing code and docs

---

*Research completed: 2026-03-04*

