import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
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

type Tab = 'Cost' | 'Activity' | 'Health'
const TABS: Tab[] = ['Cost', 'Activity', 'Health']

export function InsightsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('Cost')

  const costModels = useObservStore((s) => s.costModels)
  const sessionCosts = useObservStore((s) => s.sessionCosts)
  const events = useObservStore((s) => s.events)

  // --- Cost tab: historical API charts ---
  const hasFetchedCost = useRef(false)

  const [costDailyData, setCostDailyData] = useState<{ day: string; cost_usd: number }[]>([])
  const [costDailyStatus, setCostDailyStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  const [costAgentData, setCostAgentData] = useState<{ agent_type: string; cost_usd: number }[]>([])
  const [costAgentStatus, setCostAgentStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (activeTab !== 'Cost' || hasFetchedCost.current) return
    hasFetchedCost.current = true

    setCostDailyStatus('loading')
    setCostAgentStatus('loading')

    fetch('/api/insights/cost-daily')
      .then(r => r.json())
      .then(data => { setCostDailyData(data); setCostDailyStatus('ok') })
      .catch(() => setCostDailyStatus('error'))

    fetch('/api/insights/cost-by-agent')
      .then(r => r.json())
      .then(data => { setCostAgentData(data); setCostAgentStatus('ok') })
      .catch(() => setCostAgentStatus('error'))
  }, [activeTab])

  const retryCostDaily = () => {
    setCostDailyStatus('loading')
    fetch('/api/insights/cost-daily')
      .then(r => r.json())
      .then(data => { setCostDailyData(data); setCostDailyStatus('ok') })
      .catch(() => setCostDailyStatus('error'))
  }

  const retryCostAgent = () => {
    setCostAgentStatus('loading')
    fetch('/api/insights/cost-by-agent')
      .then(r => r.json())
      .then(data => { setCostAgentData(data); setCostAgentStatus('ok') })
      .catch(() => setCostAgentStatus('error'))
  }

  // --- Activity tab ---
  const latestSessionId = sessionCosts[0]?.session_id ?? null

  const [activityData, setActivityData] = useState<{ bucket_ms: number; tool_calls: number }[]>([])
  const [activityStatus, setActivityStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  const [tokensData, setTokensData] = useState<{ bucket_ms: number; input_tokens: number; output_tokens: number }[]>([])
  const [tokensStatus, setTokensStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (activeTab !== 'Activity' || !latestSessionId) return

    const fetchData = () => {
      setActivityStatus('loading')
      setTokensStatus('loading')
      fetch(`/api/insights/activity?session_id=${latestSessionId}`)
        .then(r => r.json())
        .then(d => { setActivityData(d); setActivityStatus('ok') })
        .catch(() => setActivityStatus('error'))

      fetch(`/api/insights/tokens-over-time?session_id=${latestSessionId}`)
        .then(r => r.json())
        .then(d => { setTokensData(d); setTokensStatus('ok') })
        .catch(() => setTokensStatus('error'))
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [activeTab, latestSessionId])

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-xs font-medium transition-colors',
              activeTab === tab
                ? 'border-b-2 border-green-400 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'Cost' && (
          <div className="space-y-6">
            {/* Chart 1: 7-Day Cost Trend (API-backed, historical) */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                7-Day Cost Trend
              </h3>
              {costDailyStatus === 'loading' || costDailyStatus === 'idle' ? (
                <div style={{ height: 160 }} className="animate-pulse bg-muted rounded" />
              ) : costDailyStatus === 'error' ? (
                <p className="text-xs text-muted-foreground">
                  Failed to load —{/* */}{' '}
                  <button className="underline" onClick={retryCostDaily}>retry?</button>
                </p>
              ) : costDailyData.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet</p>
              ) : (
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={costDailyData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                        tickFormatter={(v: string) =>
                          new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                        width={44}
                        tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                      />
                      <Tooltip
                        formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Cost']}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Area
                        dataKey="cost_usd"
                        fill="#4ade80"
                        stroke="#22c55e"
                        fillOpacity={0.3}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 2: Cost by Agent Type (API-backed, historical) */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Cost by Agent Type
              </h3>
              {costAgentStatus === 'loading' || costAgentStatus === 'idle' ? (
                <div style={{ height: 160 }} className="animate-pulse bg-muted rounded" />
              ) : costAgentStatus === 'error' ? (
                <p className="text-xs text-muted-foreground">
                  Failed to load —{/* */}{' '}
                  <button className="underline" onClick={retryCostAgent}>retry?</button>
                </p>
              ) : costAgentData.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet</p>
              ) : (
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costAgentData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                      <XAxis
                        dataKey="agent_type"
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                        angle={-20}
                        textAnchor="end"
                      />
                      <YAxis
                        tick={{ fontSize: 9, fill: '#6b7280' }}
                        width={44}
                        tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                      />
                      <Tooltip
                        formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Cost']}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Bar dataKey="cost_usd" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 3: Cost by Model (live session data) */}
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

            {/* Chart 4: Cost by Session (live session data) */}
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
        )}

        {activeTab === 'Activity' && (
          <div className="space-y-6">
            {latestSessionId ? (
              <p className="text-xs text-muted-foreground mb-3">
                Session: {latestSessionId.slice(0, 8)}
              </p>
            ) : null}

            {!latestSessionId ? (
              <p className="text-xs text-muted-foreground">
                No active session yet. Run an agent to see activity.
              </p>
            ) : (
              <>
                {/* Chart 1: Tool Call Activity */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Tool Call Activity
                  </h3>
                  {activityStatus === 'loading' ? (
                    <div style={{ height: 160 }} className="animate-pulse bg-muted rounded" />
                  ) : activityStatus === 'error' ? (
                    <p className="text-xs text-muted-foreground">
                      Failed to load —{/* */}{' '}
                      <button
                        className="underline"
                        onClick={() => {
                          setActivityStatus('loading')
                          fetch(`/api/insights/activity?session_id=${latestSessionId}`)
                            .then(r => r.json())
                            .then(d => { setActivityData(d); setActivityStatus('ok') })
                            .catch(() => setActivityStatus('error'))
                        }}
                      >
                        retry?
                      </button>
                    </p>
                  ) : activityData.length === 0 && activityStatus === 'ok' ? (
                    <p className="text-xs text-muted-foreground">No data yet</p>
                  ) : (
                    <div style={{ height: 160 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activityData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                          <XAxis
                            dataKey="bucket_ms"
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            tickFormatter={(v: number) =>
                              new Date(v).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
                            }
                          />
                          <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} allowDecimals={false} />
                          <Tooltip
                            formatter={(v) => [`${v} calls`, 'Tool Calls']}
                            contentStyle={TOOLTIP_STYLE}
                          />
                          <Area
                            dataKey="tool_calls"
                            fill="#4ade80"
                            stroke="#22c55e"
                            fillOpacity={0.3}
                            type="monotone"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Chart 2: Token Burn Rate */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Token Burn Rate
                  </h3>
                  {tokensStatus === 'loading' ? (
                    <div style={{ height: 160 }} className="animate-pulse bg-muted rounded" />
                  ) : tokensStatus === 'error' ? (
                    <p className="text-xs text-muted-foreground">
                      Failed to load —{/* */}{' '}
                      <button
                        className="underline"
                        onClick={() => {
                          setTokensStatus('loading')
                          fetch(`/api/insights/tokens-over-time?session_id=${latestSessionId}`)
                            .then(r => r.json())
                            .then(d => { setTokensData(d); setTokensStatus('ok') })
                            .catch(() => setTokensStatus('error'))
                        }}
                      >
                        retry?
                      </button>
                    </p>
                  ) : tokensData.length === 0 && tokensStatus === 'ok' ? (
                    <p className="text-xs text-muted-foreground">No data yet</p>
                  ) : (
                    <div style={{ height: 160 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={tokensData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                          <XAxis
                            dataKey="bucket_ms"
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            tickFormatter={(v: number) =>
                              new Date(v).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
                            }
                          />
                          <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} allowDecimals={false} />
                          <Tooltip
                            formatter={(v: any, name: any) => [`${v}`, name]}
                            contentStyle={TOOLTIP_STYLE}
                          />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Area
                            dataKey="input_tokens"
                            fill="#60a5fa"
                            stroke="#3b82f6"
                            fillOpacity={0.2}
                            type="monotone"
                            name="Input"
                          />
                          <Area
                            dataKey="output_tokens"
                            fill="#a78bfa"
                            stroke="#8b5cf6"
                            fillOpacity={0.2}
                            type="monotone"
                            name="Output"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'Health' && (
          <p className="text-xs text-muted-foreground">Health charts coming in next release.</p>
        )}
      </div>
    </div>
  )
}
