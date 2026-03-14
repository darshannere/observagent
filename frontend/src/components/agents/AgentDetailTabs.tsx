// Tab content components for AgentDetailPanel
import { useState, useEffect } from 'react'

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
    contextPct > 80
      ? 'bg-red-500'
      : 'bg-gradient-to-r from-[#00d4ff] to-[#00ffb2]'

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

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | Array<{ type: string; text?: string }>
}

interface ConversationTurn {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}

interface ContextResponse {
  turns: ConversationTurn[]
  total_lines: number
  error?: string
}

function truncate(text: string, max = 500): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false }
  return { text: text.slice(0, max), truncated: true }
}

function ToolUseBlock({ block }: { block: ContentBlock }) {
  const inputStr = block.input ? JSON.stringify(block.input).slice(0, 100) : ''
  return (
    <div className="text-[10px] font-mono bg-[rgba(0,212,255,0.06)] text-[#00d4ff] rounded px-1.5 py-0.5 truncate">
      [{block.name}] {inputStr}
    </div>
  )
}

function TextBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const { text: shown, truncated } = truncate(text, 500)
  return (
    <div className="text-xs whitespace-pre-wrap break-words">
      {expanded ? text : shown}
      {truncated && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 text-[10px] text-primary underline"
        >
          show more
        </button>
      )}
    </div>
  )
}

function TurnRow({ turn }: { turn: ConversationTurn }) {
  const isUser = turn.role === 'user'
  return (
    <div className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
        {turn.role}
      </span>
      <div
        className={[
          'max-w-[95%] rounded px-2 py-1.5 flex flex-col gap-1',
          isUser ? 'bg-[rgba(0,255,178,0.06)] text-foreground' : 'bg-[rgba(0,212,255,0.04)] text-foreground',
        ].join(' ')}
      >
        {turn.content.map((block, i) => {
          if (block.type === 'text' && block.text) {
            return <TextBlock key={i} text={block.text} />
          }
          if (block.type === 'tool_use') {
            return <ToolUseBlock key={i} block={block} />
          }
          if (block.type === 'tool_result') {
            const resultText =
              typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map((c) => c.text || '').join('\n')
                  : ''
            return (
              <div key={i} className="text-[10px] text-muted-foreground italic truncate">
                [tool result] {resultText.slice(0, 80)}
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

export function ContextTab({ agentId }: { agentId: string | null }) {
  const [data, setData] = useState<ContextResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setData(null)
    if (!agentId) return
    setLoading(true)
    fetch(`/api/agents/${agentId}/context`)
      .then((r) => r.json())
      .then((d: ContextResponse) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId])

  if (loading) {
    return <div className="text-xs text-muted-foreground px-3 py-4">Loading...</div>
  }

  if (!data || data.turns.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-4">
        {data?.error === 'transcript_not_found'
          ? 'Transcript file not found.'
          : 'No conversation history yet.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {data.turns.map((turn, i) => (
          <TurnRow key={i} turn={turn} />
        ))}
      </div>
      <div className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        Showing last {data.turns.length} turns · {data.total_lines.toLocaleString()} lines total
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

export function TokensTab({ data }: { data: AgentDetail }) {
  if (data.tokenBreakdown.length === 0) {
    return <div className="text-xs text-muted-foreground px-3 py-4">No API calls yet</div>
  }

  const totals = data.tokenBreakdown.reduce(
    (acc, r) => ({
      input: acc.input + r.input_tokens,
      output: acc.output + r.output_tokens,
      cache: acc.cache + r.cache_read_tokens + r.cache_write_tokens,
    }),
    { input: 0, output: 0, cache: 0 },
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground text-[10px] uppercase tracking-wide">
            <th className="px-2 py-1.5 text-left">Time</th>
            <th className="px-2 py-1.5 text-right">In</th>
            <th className="px-2 py-1.5 text-right">Out</th>
            <th className="px-2 py-1.5 text-right">Cache</th>
          </tr>
        </thead>
        <tbody>
          {data.tokenBreakdown.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-accent/10">
              <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                {formatTime(row.timestamp_ms)}
              </td>
              <td className="px-2 py-1 text-right">{row.input_tokens.toLocaleString()}</td>
              <td className="px-2 py-1 text-right">{row.output_tokens.toLocaleString()}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">
                {(row.cache_read_tokens + row.cache_write_tokens).toLocaleString()}
              </td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold bg-muted/20">
            <td className="px-2 py-1 text-muted-foreground text-[10px] uppercase">Total</td>
            <td className="px-2 py-1 text-right">{totals.input.toLocaleString()}</td>
            <td className="px-2 py-1 text-right">{totals.output.toLocaleString()}</td>
            <td className="px-2 py-1 text-right text-muted-foreground">
              {totals.cache.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
