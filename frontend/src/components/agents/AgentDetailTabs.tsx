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
  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="text-xs text-muted-foreground">
        Conversation history will be available in Phase 11.
      </div>
      <div className="text-[10px] text-muted-foreground italic">
        Requires: database schema for message storage, relay.py JSONL parsing, new API endpoints.
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function CallsTab({ data }: { data: AgentDetail }) {
  if (data.toolCalls.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-4">No tool calls yet</div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-[10px] uppercase tracking-wide">
            <th className="px-2 py-1.5 text-left">Tool</th>
            <th className="px-2 py-1.5 text-left">Time</th>
            <th className="px-2 py-1.5 text-right">Dur</th>
            <th className="px-2 py-1.5 text-center">OK</th>
          </tr>
        </thead>
        <tbody>
          {data.toolCalls.map((call, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-accent/10">
              <td className="px-2 py-1 font-mono truncate max-w-[100px]">{call.tool_name}</td>
              <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                {formatTime(call.timestamp * 1000)}
              </td>
              <td className="px-2 py-1 text-right text-muted-foreground">
                {formatDuration(call.duration_ms)}
              </td>
              <td className="px-2 py-1 text-center">
                <span
                  className={
                    call.exit_status === 0
                      ? 'text-green-400'
                      : call.exit_status === null
                        ? 'text-muted-foreground'
                        : 'text-red-400'
                  }
                >
                  {call.exit_status === null ? '—' : call.exit_status === 0 ? '✓' : '✗'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function TokensTab(_props: { data: AgentDetail }) {
  return <div className="p-3 text-xs text-muted-foreground">Loading...</div>
}
