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

interface ObservStore {
  // State
  agents: Map<string, Agent>
  sessions: Map<string, Session>
  events: ToolEvent[]
  activeSessionFilter: string | null
  sessionCosts: CostStateEntry[]
  todayCost: number
  costModels: ModelCost[]
  config: Config | null
  health: HealthState | null
  sseConnected: boolean
  contextFillPct: number

  // Actions
  addAgent(data: Omit<Agent, 'cost' | 'tokens'>): void
  updateAgentState(agentId: string, state: Agent['state'], ts: number): void
  updateAgentCost(agentId: string, cost: number, tokens: number): void
  appendEvent(event: ToolEvent): void
  updateEventDuration(tool_call_id: string, duration_ms: number, exit_status: number): void
  hydrateEvents(events: ToolEvent[]): void
  setCostData(sessions: CostStateEntry[], todayTotal: number, models: ModelCost[]): void
  setConfig(config: Config): void
  setSessionFilter(sessionId: string | null): void
  setHealth(h: HealthState): void
  setSseConnected(v: boolean): void
  setContextFillPct(pct: number): void
}

export const useObservStore = create<ObservStore>()((set, _get) => ({
  // Initial state
  agents: new Map(),
  sessions: new Map(),
  events: [],
  activeSessionFilter: null,
  sessionCosts: [],
  todayCost: 0,
  costModels: [],
  config: null,
  health: null,
  sseConnected: false,
  contextFillPct: 0,

  // Actions

  addAgent(data) {
    set((s) => {
      const agents = new Map(s.agents)
      agents.set(data.agentId, { ...data, cost: 0, tokens: 0 })

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
          children: [...existing.children, data.agentId],
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

  setCostData(sessions, todayTotal, models) {
    set({ sessionCosts: sessions, todayCost: todayTotal, costModels: models })
  },

  setConfig(config) {
    set({ config })
  },

  setSessionFilter(sessionId) {
    set({ activeSessionFilter: sessionId })
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
}))
