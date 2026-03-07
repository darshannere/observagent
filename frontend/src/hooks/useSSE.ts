import { useEffect, useRef } from 'react'
import { useObservStore } from '../store/useObservStore'
import type { Agent, ToolEvent } from '../types'

interface SSEMessage {
  type?: string
  id?: number
  tool_name?: string
  ts?: number
  timestamp?: number
  agentId?: string
  agent_id?: string
  sessionId?: string
  session_id?: string
  parentSessionId?: string
  parent_session_id?: string
  agentType?: string
  agent_type?: string
  state?: 'active' | 'idle' | 'errored' | 'completed'
  cost?: number
  contextFillPct?: number
  tokens?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  totalCalls?: number
  errorCount?: number
  errorRate?: number
  lastEventTs?: number | null
  hook_type?: 'PreToolUse' | 'PostToolUse'
  tool_call_id?: string | null
  duration_ms?: number | null
  exit_status?: number | null
  tool_summary?: string | null
  nearest_input_tokens?: number | null
  nearest_output_tokens?: number | null
}

function firstString(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function normalizeAgentState(state: SSEMessage['state']): Agent['state'] {
  if (state === 'active' || state === 'idle' || state === 'errored') {
    return state
  }
  // Backend emits "completed" for SubagentStop; map it to idle for UI state.
  return 'idle'
}

function toToolEvent(msg: SSEMessage): ToolEvent | null {
  if (msg.hook_type !== 'PreToolUse') return null
  const sessionId = firstString(msg.session_id, msg.sessionId)
  if (!sessionId) return null

  return {
    id: typeof msg.id === 'number' ? msg.id : Date.now(),
    tool_name: msg.tool_name ?? '',
    hook_type: 'PreToolUse',
    session_id: sessionId,
    agent_id: firstString(msg.agent_id, msg.agentId),
    tool_call_id: msg.tool_call_id ?? null,
    timestamp: msg.timestamp ?? msg.ts ?? Date.now(),
    duration_ms: msg.duration_ms ?? null,
    exit_status: msg.exit_status ?? null,
    tool_summary: msg.tool_summary ?? null,
    nearest_input_tokens: msg.nearest_input_tokens ?? null,
    nearest_output_tokens: msg.nearest_output_tokens ?? null,
  }
}

export function useSSE(isReplay = false): void {
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Always close any previous connection before mode changes.
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    // Replay mode: skip SSE entirely — caller fetches historical data via REST
    if (isReplay) {
      useObservStore.getState().setSseConnected(false)
      return
    }

    const es = new EventSource('/events')
    esRef.current = es

    es.onopen = () => {
      useObservStore.getState().setSseConnected(true)
    }

    es.onerror = () => {
      useObservStore.getState().setSseConnected(false)
    }

    es.onmessage = (event: MessageEvent) => {
      let msg: SSEMessage
      try {
        msg = JSON.parse(event.data) as SSEMessage
      } catch {
        return
      }

      const store = useObservStore.getState()

      if (msg.type === 'connected') {
        // No-op — just an acknowledgement from the server
        return
      }

      if (msg.type === 'agent_spawn') {
        const agentId = firstString(msg.agentId, msg.agent_id)
        const parentSessionId = firstString(msg.parentSessionId, msg.parent_session_id)
        if (!agentId || !parentSessionId) return

        store.addAgent({
          agentId,
          parentSessionId,
          agentType: firstString(msg.agentType, msg.agent_type) ?? '',
          state: 'active',
          lastActivityTs: msg.ts ?? Date.now(),
        })
        return
      }

      if (msg.type === 'agent_update') {
        const agentId = firstString(msg.agentId, msg.agent_id)
        if (!agentId) return
        store.updateAgentState(agentId, normalizeAgentState(msg.state), msg.ts ?? Date.now())
        return
      }

      if (msg.type === 'cost_update') {
        const agentId = firstString(msg.agentId, msg.agent_id)
        const sessionId = firstString(msg.sessionId, msg.session_id)

        if (msg.contextFillPct != null) {
          store.setContextFillPct(msg.contextFillPct)
        }
        // Update agent cost if agentId present
        if (agentId) {
          const t = msg.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
          const totalTokens = t.input + t.output + t.cacheRead + t.cacheWrite
          store.updateAgentCost(agentId, msg.cost ?? 0, totalTokens)
        }
        // Update session cost if sessionId present
        if (sessionId) {
          store.updateSessionCost(sessionId, {
            cost: msg.cost,
            tokens: msg.tokens,
            contextFillPct: msg.contextFillPct,
          })
        }
        return
      }

      if (msg.type === 'health_update') {
        store.setHealth({
          totalCalls: msg.totalCalls ?? 0,
          errorCount: msg.errorCount ?? 0,
          errorRate: msg.errorRate ?? 0,
          lastEventTs: msg.lastEventTs ?? null,
        })
        return
      }

      if (msg.hook_type === 'PreToolUse') {
        const preToolEvent = toToolEvent(msg)
        if (preToolEvent) {
          store.appendEvent(preToolEvent)
        }
        // Update currentTool for the agent on every PreToolUse event
        const agentId = firstString(msg.agent_id, msg.agentId)
        const sessionId = firstString(msg.session_id, msg.sessionId)
        const toolName = msg.tool_name
        if (toolName && (agentId || sessionId)) {
          store.updateAgentCurrentTool(agentId ?? sessionId ?? '', toolName)
        }
        return
      }

      if (msg.hook_type === 'PostToolUse') {
        store.updateEventDuration(
          msg.tool_call_id ?? '',
          msg.duration_ms ?? 0,
          msg.exit_status ?? 0,
        )
        return
      }
    }

    return () => {
      es.close()
      esRef.current = null
      useObservStore.getState().setSseConnected(false)
    }
  }, [isReplay])
}
