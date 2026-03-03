import { useEffect, useState } from 'react'
import { useObservStore } from '@/store/useObservStore'
import { formatRelativeTime, formatUptime } from '@/utils/format'

export function HealthPanel() {
  const health = useObservStore((s) => s.health)
  const sseConnected = useObservStore((s) => s.sseConnected)
  const [uptime, setUptime] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Tick every 5 seconds so relative time stays fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  // Fetch server uptime once on mount
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data?.uptime_seconds === 'number') {
          setUptime(data.uptime_seconds)
        }
      })
      .catch(() => {})
  }, [])

  const lastEventAgo =
    health?.lastEventTs != null
      ? formatRelativeTime(now - health.lastEventTs)
      : 'No events yet'

  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      <div className="text-muted-foreground uppercase tracking-wide text-[10px]">
        Session Health
      </div>

      {/* SSE connection */}
      <div className="flex items-center gap-2">
        <span
          className={['h-2 w-2 rounded-full shrink-0', sseConnected ? 'bg-green-400' : 'bg-red-500'].join(' ')}
        />
        <span className={sseConnected ? 'text-green-400' : 'text-red-400'}>
          {sseConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Metrics */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last event</span>
          <span className="tabular-nums">{lastEventAgo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total calls</span>
          <span className="tabular-nums">{health?.totalCalls ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Errors</span>
          <span className="tabular-nums">{health?.errorCount ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Error rate</span>
          <span className="tabular-nums">
            {((health?.errorRate ?? 0) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Uptime</span>
          <span className="tabular-nums">
            {uptime !== null ? formatUptime(uptime) : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Hook status</span>
          <span className="text-green-400">Installed</span>
        </div>
      </div>
    </div>
  )
}
