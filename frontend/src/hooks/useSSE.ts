import { useEffect, useRef } from 'react'
import { useObservStore } from '../store/useObservStore'
import type { ToolEvent } from '../types'

interface SSEMessage {
  type?: string
  ts?: number
  agentId?: string
  parentSessionId?: string
  agentType?: string
  state?: 'active' | 'idle' | 'errored'
  cost?: number
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
}

export function useSSE(isReplay = false): void {
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Replay mode: skip SSE entirely — caller fetches historical data via REST
    if (isReplay) return

    // Guard against React StrictMode double-mount
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
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
        store.addAgent({
          agentId: msg.agentId!,
          parentSessionId: msg.parentSessionId!,
          agentType: msg.agentType ?? '',
          state: 'active',
          lastActivityTs: msg.ts ?? Date.now(),
        })
        return
      }

      if (msg.type === 'agent_update') {
        store.updateAgentState(msg.agentId!, msg.state!, msg.ts ?? Date.now())
        return
      }

      if (msg.type === 'cost_update' && msg.agentId) {
        const t = msg.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        const totalTokens = t.input + t.output + t.cacheRead + t.cacheWrite
        store.updateAgentCost(msg.agentId, msg.cost ?? 0, totalTokens)
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
        store.appendEvent(msg as unknown as ToolEvent)
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
  }, [])
}
