import { useObservStore } from '@/store/useObservStore'
import { useSessionFilter } from '@/hooks/useSessionFilter'
import { formatAgentCost } from '@/utils/format'
import type { Agent } from '@/types'

function agentStateColor(state: Agent['state']): string {
  if (state === 'active') return 'text-green-400'
  if (state === 'errored') return 'text-red-400'
  return 'text-yellow-400'
}

function agentLabel(agent: Agent): string {
  return agent.agentType || agent.agentId.slice(-8)
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
  const { setSessionFilter, setAgentFilter } = useSessionFilter()

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

        return (
          <details key={session.sessionId} open className="group">
            <summary
              onClick={(e) => {
                e.preventDefault()
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
              {sessionAgents.map((agent) => {
                const isAgentSelected = activeAgentFilter === agent.agentId
                const isSelected = isAgentSelected || isSessionSelected
                return (
                  <div
                    key={agent.agentId}
                    onClick={() =>
                      setAgentFilter(
                        isAgentSelected ? null : agent.agentId,
                        isAgentSelected ? null : session.sessionId,
                      )
                    }
                    className={[
                      'flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer',
                      isSelected
                        ? 'bg-accent/50 border-l-2 border-primary'
                        : 'hover:bg-accent/20 border-l-2 border-transparent',
                    ].join(' ')}
                  >
                    <span className={agentStateColor(agent.state)}>●</span>
                    <span className="font-mono truncate max-w-[120px]">
                      {agentLabel(agent)}
                    </span>
                    <StuckBadge agent={agent} />
                    <span className="ml-auto text-muted-foreground text-[10px] shrink-0">
                      {formatAgentCost(agent.tokens, agent.cost)}
                    </span>
                  </div>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
