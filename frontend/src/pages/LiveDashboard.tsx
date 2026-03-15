import { useEffect, useRef, useState } from 'react'
import { useSearchParams, Link } from 'react-router'
import { useSSE } from '@/hooks/useSSE'
import { useObservStore, selectActiveAgentCount } from '@/store/useObservStore'
import type { TimeFilter } from '@/store/useObservStore'
import { AgentTree } from '@/components/agents/AgentTree'
import { ToolLog } from '@/components/log/ToolLog'
import { TimelineWaterfall } from '@/components/timeline/TimelineWaterfall'
import { InsightsPanel } from '@/components/insights/InsightsPanel'
import { CostPanel } from '@/components/cost/CostPanel'
import { HealthPanel } from '@/components/health/HealthPanel'

type ActiveTab = 'log' | 'timeline' | 'insights'

export function LiveDashboard() {
  const [searchParams] = useSearchParams()
  const replayId = searchParams.get('replay')
  const isReplay = !!replayId

  // Mount SSE once — skipped in replay mode
  useSSE(isReplay)

  const activeAgentCount = useObservStore(selectActiveAgentCount)
  const activeSessionFilter = useObservStore((s) => s.activeSessionFilter)
  const timeFilter = useObservStore((s) => s.timeFilter)
  const setTimeFilter = useObservStore((s) => s.setTimeFilter)
  const [activeTab, setActiveTab] = useState<ActiveTab>('log')
  const [version, setVersion] = useState<string | null>(null)

  // Capture initial URL params once — used to restore filter on mount only.
  // Do NOT put searchParams in the effect deps: every agent/session click calls
  // setSearchParams, which would re-run hydration and wipe live SSE events.
  const initialParamsRef = useRef(searchParams)

  // Hydrate state on mount only (isReplay/replayId changes are the only valid re-runs)
  useEffect(() => {
    const store = useObservStore.getState()
    let cancelled = false

    // Clear any stale session/agent filter when entering replay mode
    if (isReplay) {
      store.setSessionFilter(null)
      store.setAgentFilter(null)
    }

    // 1. Events
    const eventsUrl = isReplay ? `/api/events?session_id=${replayId}` : '/api/events'
    fetch(eventsUrl)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (Array.isArray(data)) store.hydrateEvents(data)
        else if (Array.isArray(data?.events)) store.hydrateEvents(data.events)
      })
      .catch(() => {})

    // 2. Cost
    fetch('/api/cost')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        store.setCostData(
          data?.sessions ?? [],
          data?.todayTotal ?? 0,
          data?.models ?? [],
        )
      })
      .catch(() => {})

    // 3. Config
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        store.setConfig(data)
      })
      .catch(() => {})

    // 4. Agents — hydrate tree from DB
    if (!isReplay) {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((agents: Array<{ agent_id: string; agent_type: string; parent_session_id: string; state: string; last_activity_ts: number; total_cost_usd: number; total_tokens: number }>) => {
          if (cancelled) return
          for (const a of agents) {
            const normalizedState: 'active' | 'idle' | 'errored' =
              a.state === 'active' ? 'active' : a.state === 'errored' ? 'errored' : 'idle'
            store.addAgent({
              agentId: a.agent_id,
              agentType: a.agent_type,
              parentSessionId: a.parent_session_id,
              state: normalizedState,
              lastActivityTs: a.last_activity_ts,
            })
            if (a.total_cost_usd > 0 || a.total_tokens > 0) {
              store.updateAgentCost(a.agent_id, a.total_cost_usd, a.total_tokens)
            }
          }
        })
        .catch(() => {})
    }

    // 5. Restore filter state from initial URL params (read once on mount via ref)
    const initialParams = initialParamsRef.current
    const agentId = initialParams.get('agent')
    const sessionId = initialParams.get('session')
    if (agentId) {
      store.setAgentFilter(agentId, sessionId)
    } else if (sessionId) {
      store.setSessionFilter(sessionId)
    }

    // 5. App version
    fetch('/api/meta')
      .then(r => r.json())
      .then(data => { if (!cancelled) setVersion(data.version ?? null) })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReplay, replayId])

  // Fetch events for old sessions on demand — the initial load only fetches the
  // 200 most-recent events globally, so older sessions may have no events in memory.
  useEffect(() => {
    if (!activeSessionFilter || isReplay) return
    const store = useObservStore.getState()
    const hasEvents = store.events.some((e) => e.session_id === activeSessionFilter)
    if (hasEvents) return
    fetch(`/api/events?session_id=${activeSessionFilter}`)
      .then((r) => r.json())
      .then((data) => {
        const events = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : []
        store.mergeEvents(events)
      })
      .catch(() => {})
  }, [activeSessionFilter, isReplay])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* TopBar */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-[rgba(3,8,17,0.9)] backdrop-blur-xl border-b border-[rgba(0,212,255,0.15)]">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#00ffb2] shadow-[0_0_8px_#00ffb2] animate-pulse shrink-0" />
          <span className="font-display font-extrabold text-sm text-white">
            Observ<span className="text-[#00ffb2]">Agent</span>
          </span>
        </div>
        {/* LIVE badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(0,255,178,0.08)] border border-[rgba(0,255,178,0.25)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00ffb2] animate-pulse" />
          <span className="font-mono text-[10px] text-[#00ffb2] uppercase tracking-widest">Live</span>
        </div>
        {/* Version badge — sits between LIVE badge and nav tabs */}
        {version && (
          <span className="font-mono text-[10px] text-[#3d5a7a]">v{version}</span>
        )}
        {/* Nav tabs */}
        <div className="ml-auto flex items-center gap-1">
          <span className="font-mono text-[10px] px-2.5 py-1 rounded text-[#00d4ff] bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)]">
            Live
          </span>
          <Link
            to="/history"
            className="font-mono text-[10px] px-2.5 py-1 rounded text-[#3d5a7a] hover:text-[#00d4ff] transition-colors"
          >
            History
          </Link>
        </div>
      </div>
      {/* Replay banner */}
      {isReplay && (
        <div className="shrink-0 bg-yellow-900/50 border-b border-yellow-700 px-4 py-1.5 text-yellow-300 text-sm font-medium">
          Replaying session {replayId}
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Col 1: Agent Tree */}
        <div
          className="shrink-0 border-r border-border flex flex-col overflow-y-auto"
          style={{ flexBasis: '35%', minWidth: '200px', maxWidth: '400px' }}
        >
          <div className="px-2 py-1.5 border-b border-border text-[9px] uppercase tracking-widest text-[#1e3a5a] font-mono flex items-center gap-1.5">
            Agents
            {activeAgentCount > 0 && (
              <span className="ml-auto rounded-full bg-[rgba(0,255,178,0.12)] border border-[rgba(0,255,178,0.30)] px-1.5 py-0.5 text-[9px] font-mono text-[#00ffb2] leading-none">
                {activeAgentCount} active
              </span>
            )}
          </div>
          {/* Time filter strip — filters tool log by time window */}
          <div className="px-2 py-1.5 border-b border-border flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Log:</span>
            {(['5m', '15m', '1h', 'all'] as const).map((value: TimeFilter) => {
              const label = value === 'all' ? 'All' : `Last ${value}`
              return (
                <button
                  key={value}
                  onClick={() => setTimeFilter(value)}
                  className={[
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-colors border',
                    timeFilter === value
                      ? 'bg-[rgba(0,255,178,0.10)] border border-[rgba(0,255,178,0.25)] text-[#00ffb2]'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <AgentTree />
        </div>

        {/* Col 2: Tool Log / Timeline with tab switcher */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            {(['log', 'timeline', 'insights'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-4 py-1.5 text-xs font-medium capitalize border-b-2 transition-colors',
                  activeTab === tab
                    ? 'border-[#00d4ff] text-[#00d4ff]'
                    : 'border-transparent text-[#3d5a7a] hover:text-foreground',
                ].join(' ')}
              >
                {tab === 'log' ? 'Log' : tab === 'timeline' ? 'Timeline' : 'Insights'}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'insights' ? (
              <div className="flex-1 overflow-auto">
                <InsightsPanel />
              </div>
            ) : activeTab === 'log' ? (
              <ToolLog />
            ) : (
              <div className="flex-1 overflow-auto p-2">
                <TimelineWaterfall />
              </div>
            )}
          </div>
        </div>

        {/* Agent detail panel — disabled */}
        {/* <AgentDetailPanel /> */}

        {/* Col 3: Cost + Health */}
        <div className="w-56 shrink-0 border-l border-border flex flex-col overflow-y-auto">
          <div className="border-b border-border">
            <CostPanel />
          </div>
          <HealthPanel />
        </div>
      </div>
    </div>
  )
}
