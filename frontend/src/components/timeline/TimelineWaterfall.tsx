import { useObservStore } from '@/store/useObservStore'
import { formatDuration } from '@/utils/format'
import type { ToolEvent } from '@/types'

function getToolColor(toolName: string): string {
  const name = toolName.toLowerCase()
  if (name === 'read') return '#3b82f6'       // blue
  if (name === 'write') return '#a855f7'      // purple
  if (name === 'bash') return '#f97316'       // orange
  if (name === 'edit' || name === 'multiedit') return '#14b8a6' // teal
  if (name === 'glob' || name === 'grep') return '#06b6d4'      // cyan
  if (name === 'task') return '#eab308'       // yellow
  return '#6b7280'                            // gray default
}

interface SwimlaneEvent {
  event: ToolEvent
  leftPct: number
  widthPct: number
}

export function TimelineWaterfall() {
  const allEvents = useObservStore((s) => s.events)

  // Only completed tool calls have a meaningful position
  const completed = allEvents.filter(
    (e) => e.hook_type === 'PreToolUse' && e.duration_ms !== null && e.duration_ms > 0,
  )

  if (completed.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs py-8">
        No timeline data yet
      </div>
    )
  }

  const minTs = Math.min(...completed.map((e) => e.timestamp))
  const maxTs = Math.max(...completed.map((e) => e.timestamp + (e.duration_ms ?? 0)))
  const totalMs = maxTs - minTs || 1

  // Group by session_id
  const groups = new Map<string, ToolEvent[]>()
  for (const e of completed) {
    if (!groups.has(e.session_id)) groups.set(e.session_id, [])
    groups.get(e.session_id)!.push(e)
  }

  // X-axis labels at 25%, 50%, 75%
  const xLabels = [0, 25, 50, 75, 100].map((pct) => ({
    pct,
    label: formatDuration(Math.round((pct / 100) * totalMs)),
  }))

  return (
    <div className="flex flex-col gap-0 overflow-x-auto text-xs">
      {/* X-axis */}
      <div className="relative h-5 mb-1 mx-2">
        {xLabels.map(({ pct, label }) => (
          <span
            key={pct}
            className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
            style={{ left: `${pct}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Swimlanes */}
      {Array.from(groups.entries()).map(([sessionId, events]) => {
        const bars: SwimlaneEvent[] = events.map((e) => ({
          event: e,
          leftPct: ((e.timestamp - minTs) / totalMs) * 100,
          widthPct: Math.max(4, ((e.duration_ms ?? 0) / totalMs) * 100),
        }))

        return (
          <div key={sessionId} className="flex items-center gap-2 mb-1 group">
            <div className="w-20 shrink-0 text-muted-foreground truncate font-mono text-[10px] text-right">
              {sessionId.slice(-8)}
            </div>
            <div className="relative flex-1 h-5 bg-muted/30 rounded">
              {bars.map(({ event, leftPct, widthPct }) => (
                <div
                  key={event.id}
                  className="absolute top-0.5 h-4 rounded-sm"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minWidth: '4px',
                    backgroundColor: getToolColor(event.tool_name),
                  }}
                  title={`${event.tool_name} — ${formatDuration(event.duration_ms)}`}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
