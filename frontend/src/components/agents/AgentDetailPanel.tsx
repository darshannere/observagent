import { useState, useEffect } from 'react'
import { useObservStore } from '@/store/useObservStore'
import { PromptTab, ContextTab, CallsTab, TokensTab } from './AgentDetailTabs'
import type { AgentDetail } from './AgentDetailTabs'

type Tab = 'prompt' | 'context' | 'calls' | 'tokens'

const TABS: { id: Tab; label: string }[] = [
  { id: 'prompt', label: 'Prompt' },
  { id: 'context', label: 'Context' },
  { id: 'calls', label: 'Calls' },
  { id: 'tokens', label: 'Tokens' },
]

export function AgentDetailPanel() {
  const selectedAgent = useObservStore((s) => s.selectedAgent)
  const setSelectedAgent = useObservStore((s) => s.setSelectedAgent)
  const agents = useObservStore((s) => s.agents)

  const [activeTab, setActiveTab] = useState<Tab>('prompt')
  const [data, setData] = useState<AgentDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedAgent) {
      setData(null)
      return
    }
    setLoading(true)
    fetch(`/api/agents/${selectedAgent}/detail`)
      .then((r) => r.json())
      .then((d: AgentDetail) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [selectedAgent])

  const agent = selectedAgent ? agents.get(selectedAgent) : null
  const agentLabel = agent
    ? `${agent.agentType || 'agent'} [${agent.agentId.slice(-4)}]`
    : ''

  return (
    <div
      className={[
        'fixed top-0 right-0 h-screen w-80 bg-[rgba(3,12,28,0.9)] border-l border-[rgba(0,212,255,0.18)] flex flex-col z-50 transition-transform duration-200',
        selectedAgent ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="panel-header shrink-0 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold truncate">{agentLabel}</span>
        <button
          onClick={() => setSelectedAgent(null)}
          className="text-muted-foreground hover:text-foreground ml-2 shrink-0 text-base leading-none"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex-1 px-2 py-1.5 text-xs font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-[#00ffb2] text-[#00ffb2]'
                : 'border-transparent text-[#3d5a7a] hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-muted-foreground text-xs px-3 py-4">Loading...</div>
        ) : !data ? (
          <div className="text-muted-foreground text-xs px-3 py-4">Select an agent to view details</div>
        ) : (
          <>
            {activeTab === 'prompt' && <PromptTab data={data} />}
            {activeTab === 'context' && <ContextTab agentId={selectedAgent} />}
            {activeTab === 'calls' && <CallsTab data={data} />}
            {activeTab === 'tokens' && <TokensTab data={data} />}
          </>
        )}
      </div>
    </div>
  )
}
