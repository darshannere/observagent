import { useEffect, useState } from 'react'
import { useObservStore } from '@/store/useObservStore'
import { useSessionFilter } from '@/hooks/useSessionFilter'
import { formatAgentCost } from '@/utils/format'
import type { Agent } from '@/types'

const LS_KEY = 'observagent:collapsed-sessions'
const LS_INACTIVE_KEY = 'observagent:inactive-collapsed'

function agentStateColor(state: Agent['state']): string {
  if (state === 'active') return 'text-green-400'
  if (state === 'errored') return 'text-red-400'
  return 'text-yellow-400'
}

function agentLabel(agent: Agent): string {
  const type = agent.agentType || 'agent'
  const last4 = agent.agentId.slice(-4)
  return `${type} [${last4}]`
}

function ToolBadge({ tool }: { tool: string | null }) {
  if (!tool) return null
  return (
    <span className="rounded bg-blue-900/60 px-1 text-[10px] text-blue-300 truncate max-w-[80px]">
      {tool}
    </span>
  )
}

function StuckBadge({ agent }: { agent: Agent }) {
  if (agent.state !== 'active') return null
  const idleMs = Date.now() - agent.lastActivityTs
  if (idleMs <= 60_000) return null
  const secs = Math.floor(idleMs / 1000)
  return (
    <span className="ml-1 rounded bg-yellow-900/60 px-1 text-[10px] text-yellow-300">
      idle {secs}s
    </span>
  )
}

export function AgentTree() {
  const agents = useObservStore((s) => s.agents)
  const sessions = useObservStore((s) => s.sessions)
  const activeSessionFilter = useObservStore((s) => s.activeSessionFilter)
  const activeAgentFilter = useObservStore((s) => s.activeAgentFilter)
  const collapsedSessions = useObservStore((s) => s.collapsedSessions)
  const toggleSessionCollapse = useObservStore((s) => s.toggleSessionCollapse)
  const setSelectedAgent = useObservStore((s) => s.setSelectedAgent)
  const { setSessionFilter, setAgentFilter } = useSessionFilter()

  const [inactiveCollapsed, setInactiveCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_INACTIVE_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Persist inactive section collapse to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_INACTIVE_KEY, String(inactiveCollapsed))
    } catch {}
  }, [inactiveCollapsed])

  // Load collapse state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) {
        const ids: string[] = JSON.parse(stored)
        ids.forEach((id) => toggleSessionCollapse(id))
      }
    } catch {
      // ignore parse errors
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist collapse state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(collapsedSessions)))
    } catch {
      // ignore storage errors
    }
  }, [collapsedSessions])

  if (agents.size === 0) {
    return (
      <div className="text-muted-foreground text-xs px-2 py-3">(No agents yet)</div>
    )
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {Array.from(sessions.values())
        .map((session) => {
          const sessionAgents = session.children
            .map((id) => agents.get(id))
            .filter((a): a is Agent => a !== undefined)
          const latestActivityTs = sessionAgents.reduce(
            (maxTs, agent) => Math.max(maxTs, agent.lastActivityTs),
            0,
          )

          return { session, sessionAgents, latestActivityTs }
        })
        .sort((a, b) => b.latestActivityTs - a.latestActivityTs)
        .map(({ session, sessionAgents }) => {
        const isSessionSelected = activeSessionFilter === session.sessionId
        const isCollapsed = collapsedSessions.has(session.sessionId)

        return (
          <details key={session.sessionId} open={!isCollapsed} className="group">
            <summary
              onClick={(e) => {
                e.preventDefault()
                toggleSessionCollapse(session.sessionId)
                if (isSessionSelected && activeAgentFilter === null) {
                  setSessionFilter(null)
                } else {
                  setSessionFilter(session.sessionId)
                }
              }}
              className={[
                'cursor-pointer select-none list-none flex items-center gap-1 px-2 py-1 rounded text-muted-foreground border-l-2',
                isSessionSelected
                  ? 'bg-accent/50 border-primary'
                  : 'hover:bg-accent/30 border-transparent',
              ].join(' ')}
            >
              <span className="font-mono font-semibold text-foreground">
                {session.sessionId.slice(-8)}
              </span>
              <span className="ml-auto text-[10px]">
                {sessionAgents.length} agent{sessionAgents.length !== 1 ? 's' : ''}
              </span>
            </summary>

            <div className="pl-3 flex flex-col gap-0.5 mt-0.5">
              {(() => {
                const activeAgents = sessionAgents.filter((a) => a.state === 'active')
                const inactiveAgents = sessionAgents.filter((a) => a.state !== 'active')
                const renderAgentRow = (agent: Agent, withOpacity = false) => {
                  const isAgentSelected = activeAgentFilter === agent.agentId
                  const isSelected = isAgentSelected || isSessionSelected
                  return (
                    <div
                      key={agent.agentId}
                      onClick={() => {
                        setAgentFilter(
                          isAgentSelected ? null : agent.agentId,
                          isAgentSelected ? null : session.sessionId,
                        )
                        setSelectedAgent(isAgentSelected ? null : agent.agentId)
                      }}
                      className={[
                        'flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer',
                        isSelected
                          ? 'bg-accent/50 border-l-2 border-primary'
                          : 'hover:bg-accent/20 border-l-2 border-transparent',
                        withOpacity ? 'opacity-50 hover:opacity-75 transition-opacity' : '',
                      ].join(' ')}
                    >
                      <span className={agentStateColor(agent.state)}>●</span>
                      <span className="font-mono truncate max-w-[120px]">
                        {agentLabel(agent)}
                      </span>
                      <ToolBadge tool={agent.currentTool} />
                      <StuckBadge agent={agent} />
                      <span className="ml-auto text-muted-foreground text-[10px] shrink-0">
                        {formatAgentCost(agent.tokens, agent.cost)}
                      </span>
                    </div>
                  )
                }

                if (activeAgents.length === 0) {
                  // All agents are inactive — render them all normally, no split
                  return sessionAgents.map((agent) => renderAgentRow(agent, false))
                }

                return (
                  <>
                    {activeAgents.map((agent) => renderAgentRow(agent, false))}
                    {inactiveAgents.length > 0 && (
                      <div>
                        <button
                          onClick={() => setInactiveCollapsed((c) => !c)}
                          className="w-full flex items-center gap-1 px-3 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span>{inactiveCollapsed ? '▶' : '▼'}</span>
                          <span>Inactive ({inactiveAgents.length})</span>
                        </button>
                        {!inactiveCollapsed && inactiveAgents.map((agent) => renderAgentRow(agent, true))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </details>
        )
      })}
    </div>
  )
}
