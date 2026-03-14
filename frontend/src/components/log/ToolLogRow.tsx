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
    'px-1 py-0.5 font-mono text-xs border-l-2 flex flex-col gap-0 hover:bg-[rgba(0,212,255,0.03)]',
    isError
      ? 'border-[rgba(255,77,77,0.5)] bg-[rgba(255,77,77,0.04)]'
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
        <span className={[
          'h-1.5 w-1.5 rounded-full shrink-0',
          isError
            ? 'bg-[#ff4d4d] shadow-[0_0_5px_rgba(255,77,77,0.5)]'
            : isInProgress
              ? 'bg-[#00d4ff] animate-pulse'
              : 'bg-[#00e887]',
        ].join(' ')} />
        <span className="text-[#00d4ff] font-mono font-semibold truncate shrink-0 max-w-[140px]">
          {event.tool_name}
        </span>
        <span className="text-[#1e3a5a] font-mono shrink-0">
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
          className="text-[10px] text-[#1e3a5a] font-mono truncate"
          title={event.tool_summary}
        >
          {event.tool_summary}
        </div>
      )}
    </div>
  )
}
