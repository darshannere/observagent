# Phase 10: Agent Panel Redesign - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Users navigate the full agent hierarchy with collapsible tree branches, see an active agent count badge in real-time, view human-readable agent names with current tool indicators, and drill into any agent via a side panel with 4 tabs: Prompt, Context, Calls, Tokens.

</domain>

<decisions>
## Implementation Decisions

### Collapse Behavior
- Session expand/collapse state persists in localStorage (tied to session ID)
- State survives page refresh, persists across SSE updates
- Default: sessions start expanded

### Active Count Badge
- Displayed in the header bar at top of dashboard
- Real-time updates on every agent state change
- Shows count with label, e.g., "3 active" with green background

### Human-Readable Names
- Format: `{agentType} [{last4}]` e.g., `gsd-executor [a1b2]`
- Current tool shown in agent tree rows (not just in detail panel)
- Tool name updates on PreToolUse events

### Tabbed Detail Panel
- Opens as slide-in side panel (not modal)
- All 4 tabs included: Prompt, Context, Calls, Tokens
- **Prompt tab**: Initial task prompt that started this agent
- **Context tab**: Conversation message history (user/assistant turns)
- **Calls tab**: Tool call table with Tool, Timestamp, Duration, Status columns
- **Tokens tab**: Per-call breakdown (input/output/cache tokens per API call)

### Claude's Discretion
- Exact animation curves for collapse/expand
- Side panel width and transition timing
- Table column widths and sorting in Calls tab
- Error states if data unavailable

</decisions>

<specifics>
## Specific Ideas

- Agent tree should feel like Xcode's navigator or Chrome DevTools — familiar hierarchy pattern
- Badge should be prominent but not distracting — top header is natural location
- Side panel should not obstruct the tool log while open

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AgentTree.tsx` — already has session grouping, state colors, selection, stuck badge
- `Agent` interface — agentId, agentType, state, cost, tokens fields
- `useSessionFilter` hook — handles agent selection for filtering
- `Badge` component in `frontend/src/components/ui/badge.tsx`
- Existing ToolLogRow for tool call display patterns

### Established Patterns
- Zustand store for state management
- SSE for real-time updates
- Tailwind CSS for styling (dark theme)

### Integration Points
- AgentTree component needs enhancement (collapse state, current tool, readable names)
- New AgentDetailPanel component (side panel with tabs)
- New Header component with active count badge
- Store needs new state for: selectedAgent, collapsedSessions

</code_context>

<deferred>
## Deferred Ideas

- AGNT-10: Conversation history (Phase 11) — requires database schema for message storage, relay.py parsing of subagent JSONL files, new API endpoints
- URL-based sharing of selected agent (future enhancement)
- Search within agent messages (Phase 11)
- Export agent history to JSONL (Phase 11)

</deferred>

---

*Phase: 10-agent-panel-redesign*
*Context gathered: 2026-03-04*
