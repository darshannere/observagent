import { useRef, useEffect, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useObservStore } from '@/store/useObservStore'
import type { TimeFilter } from '@/store/useObservStore'
import { ToolLogRow } from './ToolLogRow'

const WINDOW_MS: Partial<Record<TimeFilter, number>> = {
  '5m':  5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h':  60 * 60 * 1000,
}

export function ToolLog() {
  const allEvents = useObservStore((s) => s.events)
  const activeSessionFilter = useObservStore((s) => s.activeSessionFilter)
  const activeAgentFilter = useObservStore((s) => s.activeAgentFilter)
  const timeFilter = useObservStore((s) => s.timeFilter)

  // 30-second tick keeps the time window fresh even when no SSE events arrive
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (timeFilter === 'all') return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [timeFilter])

  const events = useMemo(() => {
    let filtered = allEvents
    if (activeSessionFilter) {
      filtered = filtered.filter((e) => e.session_id === activeSessionFilter)
      // If agent_id is tracked in events, further narrow to just that agent
      if (activeAgentFilter) {
        const byAgent = filtered.filter((e) => e.agent_id === activeAgentFilter)
        if (byAgent.length > 0) filtered = byAgent
      }
    } else if (activeAgentFilter) {
      filtered = filtered.filter((e) => e.agent_id === activeAgentFilter)
    }
    const windowMs = WINDOW_MS[timeFilter]
    if (windowMs != null) {
      const cutoffTs = Date.now() - windowMs
      filtered = filtered.filter((e) => e.timestamp >= cutoffTs)
    }
    return filtered.slice().reverse()
  }, [allEvents, activeSessionFilter, activeAgentFilter, timeFilter, tick])

  const containerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 28,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
    overscan: 10,
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={containerRef} className="overflow-auto flex-1 font-mono text-xs">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {items.map((virtualItem) => {
          const event = events[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ToolLogRow event={event} />
            </div>
          )
        })}
      </div>

      {events.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs py-8">
          {activeAgentFilter
            ? 'No events for selected agent yet...'
            : 'No events yet — waiting for tool calls...'}
        </div>
      )}
    </div>
  )
}
