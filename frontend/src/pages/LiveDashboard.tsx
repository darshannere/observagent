import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useSSE } from '@/hooks/useSSE'
import { useObservStore } from '@/store/useObservStore'
import { AgentTree } from '@/components/agents/AgentTree'
import { ToolLog } from '@/components/log/ToolLog'
import { TimelineWaterfall } from '@/components/timeline/TimelineWaterfall'
import { CostPanel } from '@/components/cost/CostPanel'
import { HealthPanel } from '@/components/health/HealthPanel'

type ActiveTab = 'log' | 'timeline'

export function LiveDashboard() {
  const [searchParams] = useSearchParams()
  const replayId = searchParams.get('replay')
  const isReplay = !!replayId

  // Mount SSE once — skipped in replay mode
  useSSE(isReplay)

  const [activeTab, setActiveTab] = useState<ActiveTab>('log')

  // Hydrate state on mount
  useEffect(() => {
    const store = useObservStore.getState()
    let cancelled = false

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

    // 4. Agents — hydrate tree from DB (same as legacy dashboard)
    if (!isReplay) {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((agents: Array<{ agent_id: string; agent_type: string; parent_session_id: string; state: string; last_activity_ts: number }>) => {
          if (cancelled) return
          for (const a of agents) {
            store.addAgent({
              agentId: a.agent_id,
              agentType: a.agent_type,
              parentSessionId: a.parent_session_id,
              state: (a.state as 'active' | 'idle' | 'errored') ?? 'idle',
              lastActivityTs: a.last_activity_ts,
            })
            if (a.state !== 'active') {
              store.updateAgentState(a.agent_id, a.state as 'idle' | 'errored', a.last_activity_ts)
            }
          }
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [isReplay, replayId])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {/* Replay banner */}
      {isReplay && (
        <div className="shrink-0 bg-yellow-900/50 border-b border-yellow-700 px-4 py-1.5 text-yellow-300 text-sm font-medium">
          Replaying session {replayId}
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Col 1: Agent Tree */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-y-auto">
          <div className="px-2 py-1.5 border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Agents
          </div>
          <AgentTree />
        </div>

        {/* Col 2: Tool Log / Timeline with tab switcher */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border">
            {(['log', 'timeline'] as ActiveTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-4 py-1.5 text-xs font-medium capitalize border-b-2 transition-colors',
                  activeTab === tab
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab === 'log' ? 'Log' : 'Timeline'}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'log' ? (
              <ToolLog />
            ) : (
              <div className="flex-1 overflow-auto p-2">
                <TimelineWaterfall />
              </div>
            )}
          </div>
        </div>

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
