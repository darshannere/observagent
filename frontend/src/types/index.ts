export interface ToolEvent {
  id: number
  tool_name: string
  hook_type: 'PreToolUse' | 'PostToolUse'
  session_id: string
  agent_id: string | null
  tool_call_id: string | null
  timestamp: number
  duration_ms: number | null
  exit_status: number | null
  tool_summary: string | null
  nearest_input_tokens: number | null
  nearest_output_tokens: number | null
}

export interface Agent {
  agentId: string
  parentSessionId: string
  agentType: string
  state: 'active' | 'idle' | 'errored'
  lastActivityTs: number
  cost: number
  tokens: number
  currentTool: string | null
}

export interface Session {
  sessionId: string
  children: string[]
  cost: number
  tokens: number
}

export interface CostStateEntry {
  session_id: string
  project_name?: string
  total_cost_usd: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  context_fill_pct: number | null
  models: ModelCost[]
}

export interface ModelCost {
  model: string
  cost: number
  sessions: number
}

export interface HealthState {
  lastEventTs: number | null
  totalCalls: number
  errorCount: number
  errorRate: number
}

export interface Config {
  budget_threshold_usd?: number | null
  ctx_fill_threshold_pct?: number | null
  budget_usd?: number | null
  budget_tokens?: number | null
  context_max_tokens?: number
  autocompact_buffer?: number
}

export type AgentState = 'active' | 'idle' | 'errored'
