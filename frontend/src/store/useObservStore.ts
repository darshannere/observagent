import { create } from 'zustand'
import type {
  Agent,
  Session,
  ToolEvent,
  CostStateEntry,
  ModelCost,
  HealthState,
  Config,
} from '../types'

export type TimeFilter = '5m' | '15m' | '1h' | 'all'

type SessionCostInput = Partial<CostStateEntry> & {
  session_id?: string
  project_name?: string
  cache_write_5m?: number
  cache_write_1h?: number
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeSessionCostEntry(entry: SessionCostInput): CostStateEntry {
  const inputTokens = asNumber(entry.input_tokens)
  const outputTokens = asNumber(entry.output_tokens)
  const cacheReadTokens = asNumber(entry.cache_read_tokens)
  const cacheWriteTokens =
    typeof entry.cache_write_tokens === 'number'
      ? entry.cache_write_tokens
      : asNumber(entry.cache_write_5m) + asNumber(entry.cache_write_1h)

  return {
    session_id: entry.session_id ?? '',
    project_name: entry.project_name,
    total_cost_usd: asNumber(entry.total_cost_usd),
    total_tokens:
      typeof entry.total_tokens === 'number'
        ? entry.total_tokens
        : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    context_fill_pct:
      typeof entry.context_fill_pct === 'number' ? entry.context_fill_pct : null,
    models: Array.isArray(entry.models) ? entry.models : [],
  }
}

interface ObservStore {
  // State
  agents: Map<string, Agent>
  sessions: Map<string, Session>
  events: ToolEvent[]
  activeSessionFilter: string | null
  activeAgentFilter: string | null
  selectedAgent: string | null
  collapsedSessions: Set<string>
  sessionCosts: CostStateEntry[]
  todayCost: number
  costModels: ModelCost[]
  config: Config | null
  health: HealthState | null
  sseConnected: boolean
  contextFillPct: number
  timeFilter: TimeFilter

  // Actions
  setSelectedAgent(agentId: string | null): void
  toggleSessionCollapse(sessionId: string): void
  updateAgentCurrentTool(agentId: string, toolName: string): void
  addAgent(data: Omit<Agent, 'cost' | 'tokens' | 'currentTool'>): void
  updateAgentState(agentId: string, state: Agent['state'], ts: number): void
  updateAgentCost(agentId: string, cost: number, tokens: number): void
  appendEvent(event: ToolEvent): void
  updateEventDuration(tool_call_id: string, duration_ms: number, exit_status: number): void
  hydrateEvents(events: ToolEvent[]): void
  mergeEvents(events: ToolEvent[]): void
  setCostData(sessions: CostStateEntry[], todayTotal: number, models: ModelCost[]): void
  updateSessionCost(
    sessionId: string,
    costUpdate: {
      cost?: number
      tokens?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
      contextFillPct?: number
      projectName?: string
    },
  ): void
  setConfig(config: Config): void
  setSessionFilter(sessionId: string | null): void
  setAgentFilter(agentId: string | null, sessionId?: string | null): void
  setHealth(h: HealthState): void
  setSseConnected(v: boolean): void
  setContextFillPct(pct: number): void
  setTimeFilter(filter: TimeFilter): void
}

export const useObservStore = create<ObservStore>()((set) => ({
  // Initial state
  agents: new Map(),
  sessions: new Map(),
  events: [],
  activeSessionFilter: null,
  activeAgentFilter: null,
  selectedAgent: null,
  collapsedSessions: new Set(),
  sessionCosts: [],
  todayCost: 0,
  costModels: [],
  config: null,
  health: null,
  sseConnected: false,
  contextFillPct: 0,
  timeFilter: 'all',

  // Actions

  setSelectedAgent(agentId) {
    set({ selectedAgent: agentId })
  },

  toggleSessionCollapse(sessionId) {
    set((s) => {
      const collapsedSessions = new Set(s.collapsedSessions)
      if (collapsedSessions.has(sessionId)) {
        collapsedSessions.delete(sessionId)
      } else {
        collapsedSessions.add(sessionId)
      }
      return { collapsedSessions }
    })
  },

  updateAgentCurrentTool(agentId, toolName) {
    set((s) => {
      const existing = s.agents.get(agentId)
      if (!existing) return {}
      const agents = new Map(s.agents)
      agents.set(agentId, { ...existing, currentTool: toolName })
      return { agents }
    })
  },

  addAgent(data) {
    set((s) => {
      const agents = new Map(s.agents)
      agents.set(data.agentId, { ...data, cost: 0, tokens: 0, currentTool: null })

      const sessions = new Map(s.sessions)
      const parentId = data.parentSessionId
      if (!sessions.has(parentId)) {
        sessions.set(parentId, {
          sessionId: parentId,
          children: [data.agentId],
          cost: 0,
          tokens: 0,
        })
      } else {
        const existing = sessions.get(parentId)!
        sessions.set(parentId, {
          ...existing,
          children: existing.children.includes(data.agentId)
            ? existing.children
            : [...existing.children, data.agentId],
        })
      }

      return { agents, sessions }
    })
  },

  updateAgentState(agentId, state, ts) {
    set((s) => {
      const existing = s.agents.get(agentId)
      if (!existing) return {}
      const agents = new Map(s.agents)
      agents.set(agentId, { ...existing, state, lastActivityTs: ts })
      return { agents }
    })
  },

  updateAgentCost(agentId, cost, tokens) {
    set((s) => {
      const existing = s.agents.get(agentId)
      if (!existing) return {}

      const agents = new Map(s.agents)
      agents.set(agentId, { ...existing, cost, tokens })

      // Roll up session totals
      const parentId = existing.parentSessionId
      const session = s.sessions.get(parentId)
      if (!session) return { agents }

      const sessions = new Map(s.sessions)
      let sessionCost = 0
      let sessionTokens = 0
      for (const childId of session.children) {
        const child = agents.get(childId)
        if (child) {
          sessionCost += child.cost
          sessionTokens += child.tokens
        }
      }
      sessions.set(parentId, { ...session, cost: sessionCost, tokens: sessionTokens })

      return { agents, sessions }
    })
  },

  appendEvent(event) {
    set((s) => ({ events: [...s.events, event] }))
  },

  updateEventDuration(tool_call_id, duration_ms, exit_status) {
    set((s) => ({
      events: s.events.map((e) => {
        if (
          e.hook_type === 'PreToolUse' &&
          e.tool_call_id === tool_call_id &&
          e.duration_ms === null
        ) {
          return { ...e, duration_ms, exit_status }
        }
        return e
      }),
    }))
  },

  hydrateEvents(events) {
    set({ events })
  },

  mergeEvents(newEvents) {
    set((s) => {
      const existingIds = new Set(s.events.map((e) => e.id))
      const toAdd = newEvents.filter((e) => !existingIds.has(e.id))
      if (toAdd.length === 0) return {}
      return { events: [...s.events, ...toAdd] }
    })
  },

  setCostData(sessions, todayTotal, models) {
    set({
      sessionCosts: sessions.map((entry) => normalizeSessionCostEntry(entry)),
      todayCost: asNumber(todayTotal),
      costModels: models,
    })
  },

  updateSessionCost(sessionId, costUpdate) {
    set((s) => {
      const index = s.sessionCosts.findIndex((sc) => sc.session_id === sessionId)
      const existing =
        index >= 0
          ? s.sessionCosts[index]
          : normalizeSessionCostEntry({ session_id: sessionId })

      const inputTokens = costUpdate.tokens?.input ?? existing.input_tokens
      const outputTokens = costUpdate.tokens?.output ?? existing.output_tokens
      const cacheReadTokens = costUpdate.tokens?.cacheRead ?? existing.cache_read_tokens
      const cacheWriteTokens = costUpdate.tokens?.cacheWrite ?? existing.cache_write_tokens

      const updated: CostStateEntry = {
        ...existing,
        session_id: sessionId,
        project_name: costUpdate.projectName ?? existing.project_name,
        total_cost_usd: costUpdate.cost ?? existing.total_cost_usd,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        total_tokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
        context_fill_pct: costUpdate.contextFillPct ?? existing.context_fill_pct,
      }

      // Keep the freshest session at the top so the cost panel tracks live traffic.
      const sessionCosts =
        index >= 0
          ? [updated, ...s.sessionCosts.slice(0, index), ...s.sessionCosts.slice(index + 1)]
          : [updated, ...s.sessionCosts]

      const todayCost = sessionCosts.reduce((sum, sc) => sum + asNumber(sc.total_cost_usd), 0)

      return { sessionCosts, todayCost }
    })
  },

  setConfig(config) {
    set({ config })
  },

  setSessionFilter(sessionId) {
    set({ activeSessionFilter: sessionId, activeAgentFilter: null })
  },

  setAgentFilter(agentId, sessionId) {
    if (!agentId) {
      set({ activeAgentFilter: null, activeSessionFilter: sessionId ?? null })
      return
    }
    set({ activeAgentFilter: agentId, activeSessionFilter: sessionId ?? null })
  },

  setHealth(h) {
    set({ health: h })
  },

  setSseConnected(v) {
    set({ sseConnected: v })
  },

  setContextFillPct(pct) {
    set({ contextFillPct: pct })
  },

  setTimeFilter(filter) {
    set({ timeFilter: filter })
  },
}))

/**
 * Selector: returns the count of agents currently in the 'active' state.
 * Usage: const activeCount = useObservStore(selectActiveAgentCount)
 */
export function selectActiveAgentCount(s: { agents: Map<string, { state: string }> }): number {
  return Array.from(s.agents.values()).filter((a) => a.state === 'active').length
}
