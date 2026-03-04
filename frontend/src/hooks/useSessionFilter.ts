import { useSearchParams } from 'react-router'
import { useObservStore } from '@/store/useObservStore'

export function useSessionFilter() {
  const [, setSearchParams] = useSearchParams()
  const setStoreSessionFilter = useObservStore((s) => s.setSessionFilter)
  const setStoreAgentFilter = useObservStore((s) => s.setAgentFilter)

  const setSessionFilter = (sessionId: string | null) => {
    setStoreSessionFilter(sessionId)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (sessionId) next.set('session', sessionId)
      else next.delete('session')
      next.delete('agent')
      return next
    })
  }

  const setAgentFilter = (agentId: string | null, sessionId: string | null) => {
    if (!agentId) {
      setStoreSessionFilter(null)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('session')
        next.delete('agent')
        return next
      })
      return
    }

    setStoreAgentFilter(agentId, sessionId)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (sessionId) next.set('session', sessionId)
      else next.delete('session')
      next.set('agent', agentId)
      return next
    })
  }

  return { setSessionFilter, setAgentFilter }
}
