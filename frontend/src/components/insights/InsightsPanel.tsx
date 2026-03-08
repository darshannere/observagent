import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useObservStore } from '@/store/useObservStore'
import type { ToolEvent } from '@/types'

function computeLatencyPercentiles(events: ToolEvent[]) {
  const durations = events
    .filter((e) => e.hook_type === 'PostToolUse' && e.duration_ms != null)
    .map((e) => e.duration_ms as number)
    .sort((a, b) => a - b)
  if (durations.length === 0) return { p50: 0, p95: 0, count: 0 }
  const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0
  const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0
  return { p50, p95, count: durations.length }
}

const TOOLTIP_STYLE: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  color: 'var(--popover-foreground)',
}

export function InsightsPanel() {
  const costModels = useObservStore((s) => s.costModels)
  const sessionCosts = useObservStore((s) => s.sessionCosts)
  const events = useObservStore((s) => s.events)

  const modelChartData = useMemo(() =>
    costModels.map((m) => ({
      name: m.model.split('/').at(-1) ?? m.model,
      cost: m.cost,
    })),
    [costModels]
  )

  const sessionChartData = useMemo(() =>
    sessionCosts.slice(0, 10).map((s) => ({
      name: s.session_id.slice(0, 8),
      cost: s.total_cost_usd,
    })),
    [sessionCosts]
  )

  const latency = useMemo(() => computeLatencyPercentiles(events), [events])

  return (
    <div className="p-4 space-y-6 overflow-auto">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Cost by Model
        </h3>
        {modelChartData.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data yet</p>
        ) : (
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelChartData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={44} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Cost']} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="cost" fill="#4ade80" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Cost by Session (Top 10)
        </h3>
        {sessionChartData.length === 0 ? (
          <p className="text-xs text-muted-foreground">No session data yet</p>
        ) : (
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionChartData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} width={44} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Cost']} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="cost" fill="#60a5fa" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Tool Call Latency
        </h3>
        {latency.count === 0 ? (
          <p className="text-xs text-muted-foreground">No completed tool calls yet</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-border p-2 text-center">
              <div className="text-lg font-mono font-semibold text-green-400">{latency.p50}ms</div>
              <div className="text-[10px] text-muted-foreground">p50</div>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <div className="text-lg font-mono font-semibold text-yellow-400">{latency.p95}ms</div>
              <div className="text-[10px] text-muted-foreground">p95</div>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <div className="text-lg font-mono font-semibold text-foreground">{latency.count}</div>
              <div className="text-[10px] text-muted-foreground">samples</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
