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

const CONTEXT_WINDOW = 200_000

export function PromptTab({ data }: { data: AgentDetail }) {
  const totalInput = data.tokenBreakdown.reduce((sum, r) => sum + r.input_tokens, 0)
  const contextPct = Math.min(100, Math.round((totalInput / CONTEXT_WINDOW) * 100))
  const barColor =
    contextPct > 80 ? 'bg-red-500' : contextPct > 60 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="p-3 flex flex-col gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          Initial Prompt
        </div>
        {data.agent.initial_prompt ? (
          <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-muted/30 rounded p-2 max-h-60 overflow-y-auto">
            {data.agent.initial_prompt}
          </pre>
        ) : (
          <div className="text-xs text-muted-foreground italic">No prompt captured</div>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          Context Fill — {contextPct}%
        </div>
        <div className="h-2 bg-muted rounded overflow-hidden">
          <div
            className={`h-full rounded transition-all ${barColor}`}
            style={{ width: `${contextPct}%` }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {totalInput.toLocaleString()} / {CONTEXT_WINDOW.toLocaleString()} tokens
        </div>
      </div>
    </div>
  )
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
