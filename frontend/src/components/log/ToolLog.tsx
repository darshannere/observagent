import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useObservStore } from '@/store/useObservStore'
import { ToolLogRow } from './ToolLogRow'

export function ToolLog() {
  const events = useObservStore((s) =>
    s.activeSessionFilter
      ? s.events.filter((e) => e.session_id === s.activeSessionFilter)
      : s.events,
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)

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

  // Auto-scroll-to-bottom: only scroll if user is near the bottom
  useEffect(() => {
    const newLen = events.length
    if (newLen === prevLenRef.current) return
    prevLenRef.current = newLen

    const container = containerRef.current
    if (!container) return

    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distFromBottom <= 150) {
      virtualizer.scrollToIndex(newLen - 1, { align: 'end' })
    }
  }, [events.length, virtualizer])

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
          No events yet — waiting for tool calls...
        </div>
      )}
    </div>
  )
}
