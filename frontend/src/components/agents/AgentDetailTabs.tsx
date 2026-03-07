// Tab content components for AgentDetailPanel

export interface AgentDetail {
  agent: {
    agent_id: string
    agent_type: string
    state: string
    initial_prompt: string | null
  }
  toolCalls: Array<{
    timestamp: number
    tool_name: string
    duration_ms: number | null
    exit_status: number | null
    tool_summary: string | null
  }>
  tokenBreakdown: Array<{
    timestamp_ms: number
    input_tokens: number
    output_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
  }>
}

// Stub — implementations added per task below

export function PromptTab(_props: { data: AgentDetail }) {
  return <div className="p-3 text-xs text-muted-foreground">Loading...</div>
}

export function ContextTab() {
  return <div className="p-3 text-xs text-muted-foreground">Loading...</div>
}

export function CallsTab(_props: { data: AgentDetail }) {
  return <div className="p-3 text-xs text-muted-foreground">Loading...</div>
}

export function TokensTab(_props: { data: AgentDetail }) {
  return <div className="p-3 text-xs text-muted-foreground">Loading...</div>
}
