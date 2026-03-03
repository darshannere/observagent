import { useSearchParams } from 'react-router'
import { useObservStore } from '@/store/useObservStore'

export function useSessionFilter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const setStoreFilter = useObservStore((s) => s.setSessionFilter)
  const sessionFilter = searchParams.get('session')

  const setFilter = (sessionId: string | null) => {
    setStoreFilter(sessionId)
    if (sessionId) setSearchParams({ session: sessionId })
    else setSearchParams({})
  }

  return { sessionFilter, setFilter }
}
