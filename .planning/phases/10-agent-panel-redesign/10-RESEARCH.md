# Phase 10: Agent Panel Redesign - Research

**Researched:** 2026-03-04
**Domain:** React/TypeScript frontend enhancement for multi-agent observability UI
**Confidence:** HIGH

## Summary

Phase 10 enhances the existing AgentTree component with collapsible state persistence, active agent count badge, human-readable agent names with current tool indicator, and a tabbed detail panel. The backend already tracks agents via SubagentStart/SubagentStop hooks and broadcasts agent_spawn/agent_update events. Key work involves: (1) extending the Zustand store with collapsed/selected state, (2) enhancing the AgentTree component, (3) adding an active count badge to the header, and (4) creating a new AgentDetailPanel component. The main data gaps are the initial prompt and conversation history - these will need new API endpoints or SSE events.

**Primary recommendation:** Use existing HTML details/summary pattern from Phase 9, extend Zustand store for panel state, create new AgentDetailPanel as a slide-in drawer component.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Collapse behavior: localStorage persistence tied to session ID, survives page refresh and SSE updates, default: expanded
- Active count badge: header bar at top of dashboard, real-time updates, "X active" with green background
- Human-readable names: `{agentType} [{last4}]` format (e.g., `gsd-executor [a1b2]`)
- Current tool shown in agent tree rows (not just detail panel), updates on PreToolUse events
- Tabbed detail panel: slide-in side panel (not modal), 4 tabs: Prompt, Context, Calls, Tokens

### Claude's Discretion
- Exact animation curves for collapse/expand
- Side panel width and transition timing
- Table column widths and sorting in Calls tab
- Error states if data unavailable

### Deferred Ideas (OUT OF SCOPE)
- URL-based sharing of selected agent (future enhancement)
- Search within agent messages (Phase 11)
- Export agent history to JSONL (Phase 11)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | Collapsible tree (parent session → subagents indented, expandable/collapsible per branch) | HTML details/summary already used in AgentTree.tsx; needs localStorage persistence |
| AGNT-02 | Live active agent count badge showing how many agents running | Header bar location decided; needs store action to compute count |
| AGNT-03 | Human-readable name in format `description [short-id]` instead of raw hex | Format `{agentType} [{last4}]` from CONTEXT.md; existing agentLabel function needs update |
| AGNT-04 | Current tool being executed in real time (updates on PreToolUse) | Need new field in Agent type; SSE event already includes tool_name |
| AGNT-05 | Click agent row to open per-agent detail panel | Need selectedAgent state in store; new AgentDetailPanel component |
| AGNT-06 | Detail panel shows initial task description / prompt when agent spawned | **DATA GAP**: No existing field for prompt; need to find source or defer |
| AGNT-07 | Detail panel shows context fill % bar (cumulative input tokens / model context window max) | Context fill calculation exists in store; display in panel |
| AGNT-08 | Detail panel shows per-agent tool call history with timestamps | Need new API endpoint for agent-specific events |
| AGNT-09 | Detail panel shows input + output token counts per API call | API calls table exists but not linked to agents; need new query |
| AGNT-10 | Detail panel shows full conversation history (context window contents) | **DATA GAP**: No existing message storage; need new mechanism |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.x | UI framework | Already in use (Phase 9) |
| TypeScript | ^5.x | Type safety | Already in use |
| Zustand | ^5.x | State management | Already in use |
| Tailwind CSS | ^3.4.x | Styling | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router | ^7.x | Navigation | Already in use |
| @tanstack/react-virtual | ^3.x | Virtual scrolling | Tool log uses this; good for Calls tab with many rows |
| lucide-react | ^0.400+ | Icons | Already installed with shadcn |

**Installation:**
No new packages required - all needed libraries already in use.

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── components/
│   ├── agents/
│   │   ├── AgentTree.tsx        # Enhanced with collapse state + current tool
│   │   ├── AgentDetailPanel.tsx # NEW: slide-in tabbed panel
│   │   └── ActiveBadge.tsx       # NEW: active count badge
│   └── ui/
│       └── tabs.tsx              # Already exists (shadcn)
├── store/
│   └── useObservStore.ts         # Add: collapsedSessions, selectedAgent
├── hooks/
│   └── useAgentDetail.ts         # NEW: fetch agent-specific data
└── pages/
    └── LiveDashboard.tsx         # Add header with ActiveBadge
```

### Pattern 1: Collapsible Tree with localStorage
**What:** Use HTML `<details>`/`<summary>` with localStorage persistence tied to session ID
**When to use:** Agent tree branches, session groups
**Example:**
```typescript
// AgentTree.tsx - use details element with localStorage sync
const [isOpen, setIsOpen] = useState(() => {
  const stored = localStorage.getItem(`agent-tree-${sessionId}`)
  return stored === null ? true : stored === 'open'
})

const toggle = () => {
  setIsOpen(!isOpen)
  localStorage.setItem(`agent-tree-${sessionId}`, !isOpen ? 'open' : 'closed')
}
```
**Source:** Existing AgentTree.tsx already uses details/summary pattern (line 48)

### Pattern 2: Slide-in Drawer Panel
**What:** Fixed-position side panel with CSS transform for slide animation
**When to use:** Agent detail panel, should not block tool log
**Example:**
```typescript
// AgentDetailPanel.tsx
<div className={[
  'fixed right-0 top-0 h-full w-80 bg-card border-l border-border',
  'transform transition-transform duration-200 ease-out',
  isOpen ? 'translate-x-0' : 'translate-x-full'
].join(' ')}>
  {/* Tabbed content */}
</div>
```

### Pattern 3: Active Agent Count Badge
**What:** Computed derived state from agents Map, updates on SSE events
**When to use:** Header bar, real-time badge
**Example:**
```typescript
// In LiveDashboard header
const activeCount = useObservStore((s) =>
  Array.from(s.agents.values()).filter(a => a.state === 'active').length
)

// Badge with green background
<span className="bg-green-900/60 text-green-300 px-2 py-0.5 rounded text-xs">
  {activeCount} active
</span>
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible UI | Custom collapse logic | HTML details/summary | Native browser support, accessible, Phase 9 already uses it |
| Side panel animation | Custom transition | Tailwind transform classes | Already used in codebase, consistent with theme |
| Virtualized table | Custom virtualization | @tanstack/react-virtual | Already in use for ToolLog |

---

## Common Pitfalls

### Pitfall 1: localStorage Serialization with Maps
**What goes wrong:** Cannot directly store Map objects in localStorage; attempting to do so results in empty object `{}`
**Why it happens:** localStorage only stores strings; JSON.stringify/parse with Map requires conversion
**How to avoid:** Store collapsed state as simple object: `{ [sessionId]: boolean }`, convert Map to object when saving
**Warning signs:** Collapse state not persisting after refresh

### Pitfall 2: SSE Event Ordering
**What goes wrong:** agent_spawn events may arrive after first tool events; current tool shows wrong value
**Why it happens:** Network ordering not guaranteed; tool events may process faster
**How to avoid:** Initialize currentTool to null/undefined, only display when confirmed by matching PreToolUse with agentId

### Pitfall 3: Memory Leaks in SSE Subscriptions
**What goes wrong:** Event listeners accumulate if component unmounts while panel is open
**Why it happens:** useEffect cleanup missing or incomplete
**How to avoid:** Always return cleanup function that removes event listeners

### Pitfall 4: Context Window Overflow
**What goes wrong:** Large conversation history crashes or freezes the browser
**Why it happens:** Rendering thousands of message elements without virtualization
**How to avoid:** Use @tanstack/react-virtual for Context tab, similar to ToolLog

---

## Code Examples

### Adding currentTool to Agent Type
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

### Zustand Store Extension
```typescript
// frontend/src/store/useObservStore.ts
interface ObservStore {
  // ... existing fields
  collapsedSessions: Set<string>    // NEW: session IDs that are collapsed
  selectedAgent: string | null      // NEW: currently selected agent for detail panel

  // ... existing actions
  toggleSessionCollapse(sessionId: string): void
  setSelectedAgent(agentId: string | null): void
  updateAgentCurrentTool(agentId: string, toolName: string): void
}

// Implementation
toggleSessionCollapse(sessionId) {
  set(s => {
    const collapsed = new Set(s.collapsedSessions)
    if (collapsed.has(sessionId)) collapsed.delete(sessionId)
    else collapsed.add(sessionId)
    return { collapsedSessions: collapsed }
  })
}
```

### SSE Current Tool Update
```typescript
// In useSSE.ts hook
if (msg.type === 'PreToolUse' && msg.agentId) {
  store.updateAgentCurrentTool(msg.agentId, msg.tool_name)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw hex session IDs | `{agentType} [{last4}]` format | Phase 10 | Better readability |
| Collapsible without persistence | localStorage persistence | Phase 10 | State survives refresh |
| No detail panel | Slide-in tabbed panel | Phase 10 | Full agent introspection |

**Deprecated/outdated:**
- AgentTree without current tool indicator - replaced by real-time tool display
- Modal-based detail view - replaced by slide-in side panel (less disruptive)

---

## Open Questions

1. **Initial Prompt Storage**
   - What we know: Agent spawns via SubagentStart hook; no prompt field in agent_nodes table
   - What's unclear: Where does the initial task description come from? Is it available in Claude Code hooks?
   - Recommendation: Check relay.py for SubagentStart payload; may contain task description

2. **Conversation History / Messages**
   - What we know: Events table has tool calls; no message history storage
   - What's unclear: How to reconstruct conversation context? Is this part of the Claude Code event stream?
   - Recommendation: Investigate if SubagentStart includes parent messages; may need Phase 11 or new ingest logic

3. **API for Agent-Specific Events**
   - What we know: /api/events returns all events; no filter by agent
   - What's unclear: Best endpoint design - /api/agents/:id/events or /api/events?agent_id=X
   - Recommendation: Add agent_id filter to existing /api/events for consistency

---

## Sources

### Primary (HIGH confidence)
- Context7: `/facebook/react` - React hooks, useState patterns
- Context7: `/pmndrs/zustand` - Zustand store patterns
- Existing codebase: AgentTree.tsx (line 48 details/summary), useObservStore.ts

### Secondary (MEDIUM confidence)
- WebSearch: "React slide-in drawer component patterns" - verified against existing Tailwind patterns in codebase

### Tertiary (LOW confidence)
- None required - sufficient existing code and docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use, no new dependencies
- Architecture: HIGH - Existing AgentTree pattern well-established, Zustand patterns clear
- Pitfalls: MEDIUM - localStorage/Map serialization is known TypeScript issue; SSE ordering handled in Phase 9

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days - stable domain)
