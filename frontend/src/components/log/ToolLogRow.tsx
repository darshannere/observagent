import type { ToolEvent } from '@/types'
import { formatTs, formatDuration, latencyClass, formatTokensCompact } from '@/utils/format'

interface ToolLogRowProps {
  event: ToolEvent
}

export function ToolLogRow({ event }: ToolLogRowProps) {
  const isError = event.exit_status !== null && event.exit_status !== 0
  const isInProgress = event.hook_type === 'PreToolUse'
  const hasTokenBadge = event.nearest_input_tokens !== null

  const rowClass = [
    'px-1 py-0.5 font-mono text-xs border-l-2 flex flex-col gap-0',
    isError
      ? 'border-red-500 bg-red-950/20'
      : 'border-transparent',
    isInProgress ? 'opacity-70' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const latCls = latencyClass(event.duration_ms)

  return (
    <div className={rowClass}>
      {/* Line 1: tool_name | timestamp | latency | token badge */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-foreground font-semibold truncate shrink-0 max-w-[140px]">
          {event.tool_name}
        </span>
        <span className="text-muted-foreground shrink-0">
          {formatTs(event.timestamp)}
        </span>
        <span className={['shrink-0', latCls || 'text-muted-foreground'].join(' ')}>
          {formatDuration(event.duration_ms)}
        </span>
        {hasTokenBadge && (
          <span className="ml-auto shrink-0 rounded bg-accent px-1 text-[10px] text-accent-foreground">
            {formatTokensCompact(event.nearest_input_tokens!)}↑{' '}
            {formatTokensCompact(event.nearest_output_tokens ?? 0)}↓
          </span>
        )}
      </div>

      {/* Line 2 (conditional): tool_summary */}
      {event.tool_summary && (
        <div
          className="text-[10px] text-muted-foreground truncate"
          title={event.tool_summary}
        >
          {event.tool_summary}
        </div>
      )}
    </div>
  )
}
