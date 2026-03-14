import { useEffect, useMemo, useState } from 'react'
import { Folder } from 'lucide-react'
import { useObservStore } from '@/store/useObservStore'
import { useSessionFilter } from '@/hooks/useSessionFilter'
import { formatAgentCost } from '@/utils/format'
import type { Agent } from '@/types'

const LS_KEY = 'observagent:collapsed-sessions'
const LS_INACTIVE_KEY = 'observagent:inactive-collapsed'
const LS_REPO_KEY = 'observagent:collapsed-repos'

function agentStateColor(state: Agent['state']): string {
  if (state === 'active') return 'text-[#00ffb2]'
  if (state === 'errored') return 'text-[#ff4d4d]'
  return 'text-[#1e3a5a]'
}

function agentLabel(agent: Agent): string {
  const type = agent.agentType || 'agent'
  const last4 = agent.agentId.slice(-4)
  return `${type} [${last4}]`
}

function ToolBadge({ tool }: { tool: string | null }) {
  if (!tool) return null
  return (
    <span className="rounded bg-[rgba(0,212,255,0.06)] px-1 text-[10px] text-[#00d4ff] font-mono truncate max-w-[80px]">
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
    <span className="ml-1 rounded bg-[rgba(255,123,43,0.15)] px-1 text-[10px] text-[#ff7b2b] font-mono">
      idle {secs}s
    </span>
  )
}

export function AgentTree() {
  const agents = useObservStore((s) => s.agents)
  const sessions = useObservStore((s) => s.sessions)
  const sessionCosts = useObservStore((s) => s.sessionCosts)
  const activeSessionFilter = useObservStore((s) => s.activeSessionFilter)
  const activeAgentFilter = useObservStore((s) => s.activeAgentFilter)
  const collapsedSessions = useObservStore((s) => s.collapsedSessions)
  const toggleSessionCollapse = useObservStore((s) => s.toggleSessionCollapse)
  const setSelectedAgent = useObservStore((s) => s.setSelectedAgent)
  const { setSessionFilter, setAgentFilter } = useSessionFilter()

  const sessionProjectNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of sessionCosts) {
      if (entry.project_name) {
        map.set(entry.session_id, entry.project_name)
      }
    }
    return map
  }, [sessionCosts])

  const [inactiveCollapsed, setInactiveCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_INACTIVE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(LS_REPO_KEY)
      if (stored) {
        const names: string[] = JSON.parse(stored)
        return new Set(names)
      }
    } catch {
      // ignore parse errors
    }
    return new Set()
  })

  // Persist inactive section collapse to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_INACTIVE_KEY, String(inactiveCollapsed))
    } catch {}
  }, [inactiveCollapsed])

  // Persist repo collapse state to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(LS_REPO_KEY, JSON.stringify(Array.from(collapsedRepos)))
    } catch {}
  }, [collapsedRepos])

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

  const sessionEntries = useMemo(() => {
    return Array.from(sessions.values())
      .map((session) => {
        const sessionAgents = session.children
          .map((id) => agents.get(id))
          .filter((a): a is Agent => a !== undefined)
        const latestActivityTs = sessionAgents.reduce(
          (maxTs, agent) => Math.max(maxTs, agent.lastActivityTs),
          0,
        )
        const projectName = sessionProjectNames.get(session.sessionId) || 'unknown'
        return { session, sessionAgents, latestActivityTs, projectName }
      })
      .sort((a, b) => b.latestActivityTs - a.latestActivityTs)
  }, [agents, sessions, sessionProjectNames])

  const repoGroups = useMemo(() => {
    const groups = new Map<
      string,
      { repoName: string; sessions: typeof sessionEntries; latestActivityTs: number }
    >()

    for (const entry of sessionEntries) {
      const key = entry.projectName
      const existing = groups.get(key)
      if (existing) {
        existing.sessions.push(entry)
        existing.latestActivityTs = Math.max(existing.latestActivityTs, entry.latestActivityTs)
      } else {
        groups.set(key, {
          repoName: key,
          sessions: [entry],
          latestActivityTs: entry.latestActivityTs,
        })
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.latestActivityTs - a.latestActivityTs)
  }, [sessionEntries])

  if (agents.size === 0) {
    return (
      <div className="text-muted-foreground text-xs px-2 py-3">(No agents yet)</div>
    )
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {repoGroups.map((repo) => {
        const repoAgentCount = repo.sessions.reduce(
          (sum, s) => sum + s.sessionAgents.length,
          0,
        )
        const repoHasActiveSession = repo.sessions.some(
          (s) => s.session.sessionId === activeSessionFilter,
        )
        const isRepoCollapsed = collapsedRepos.has(repo.repoName)
        const repoOpen = repoHasActiveSession || !isRepoCollapsed

        return (
          <details key={repo.repoName} open={repoOpen} className="group">
            <summary
              onClick={(e) => {
                e.preventDefault()
                setCollapsedRepos((prev) => {
                  const next = new Set(prev)
                  if (next.has(repo.repoName)) {
                    next.delete(repo.repoName)
                  } else {
                    next.add(repo.repoName)
                  }
                  return next
                })
              }}
              className="cursor-pointer select-none list-none flex items-center gap-2 px-2.5 py-1.5 rounded text-foreground border-l-4 border-[rgba(0,212,255,0.30)] bg-[rgba(0,212,255,0.04)] hover:bg-[rgba(0,212,255,0.08)] transition-colors"
            >
              <Folder size={12} className="text-[#00d4ff]/80" />
              <span className="font-mono font-semibold text-sm truncate">
                {repo.repoName}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {repo.sessions.length} session{repo.sessions.length !== 1 ? 's' : ''} ·{' '}
                {repoAgentCount} agent{repoAgentCount !== 1 ? 's' : ''}
              </span>
            </summary>

            <div className="pl-2 flex flex-col gap-1">
              {repo.sessions.map(({ session, sessionAgents }) => {
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
                        'cursor-pointer select-none list-none flex items-center gap-1.5 px-2 py-1 rounded text-muted-foreground border-l-2 text-[11px]',
                        isSessionSelected
                          ? 'bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.20)] text-white'
                          : 'hover:bg-[rgba(0,212,255,0.04)] hover:border-[rgba(0,212,255,0.12)] border-transparent',
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
                                'flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer text-[11px]',
                                isSelected
                                  ? 'bg-[rgba(0,212,255,0.08)] border-l-2 border-[rgba(0,212,255,0.20)]'
                                  : 'hover:bg-[rgba(0,212,255,0.04)] border-l-2 border-transparent',
                                withOpacity
                                  ? 'opacity-50 hover:opacity-75 transition-opacity'
                                  : '',
                              ].join(' ')}
                            >
                              <span className={agentStateColor(agent.state)}>●</span>
                              <span className="font-mono truncate max-w-[120px]">
                                {agentLabel(agent)}
                              </span>
                              <ToolBadge tool={agent.currentTool} />
                              <StuckBadge agent={agent} />
                              <span className="ml-auto text-[#ff7b2b] text-[10px] shrink-0 font-mono">
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
                                {!inactiveCollapsed &&
                                  inactiveAgents.map((agent) => renderAgentRow(agent, true))}
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
          </details>
        )
      })}
    </div>
  )
}
