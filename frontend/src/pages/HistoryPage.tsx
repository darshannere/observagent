import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  formatCost,
} from '@/utils/format'

type HistoryTimeFilter = '15m' | '1h' | '24h' | 'all'

interface SessionSummary {
  session_id: string
  project_name: string
  last_event_ts: string
  total_cost_usd: number
  model: string | null
  has_errors: number
  is_live: number
}

async function exportSession(sessionId: string, format: 'jsonl' | 'csv') {
  const res = await fetch(`/api/sessions/${sessionId}/export?format=${format}`)
  const text = await res.text()
  const blob = new Blob([text], {
    type: format === 'csv' ? 'text/csv' : 'application/x-ndjson',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `session-${sessionId.slice(-8)}.${format}`
  a.click()
  URL.revokeObjectURL(url)
}

function modelShortName(model: string | null): string {
  if (!model) return '—'
  const parts = model.split('/')
  return parts[parts.length - 1]
}

function formatLastEvent(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

interface SessionRowProps {
  session: SessionSummary
  expanded: boolean
  onToggle: () => void
}

function SessionRow({ session: s, expanded, onToggle }: SessionRowProps) {
  return (
    <div className="border-b border-border last:border-b-0">
      {/* Main row — click to expand */}
      <div
        className="px-2 py-1 font-mono text-xs flex items-center gap-2 cursor-pointer hover:bg-accent/10 min-w-0"
        onClick={onToggle}
      >
        {/* Session ID */}
        <span className="text-foreground font-semibold shrink-0 w-20 truncate">
          {s.session_id.slice(-8)}
        </span>

        {/* Last event timestamp */}
        <span className="text-muted-foreground shrink-0">
          {formatLastEvent(s.last_event_ts)}
        </span>

        {/* Cost */}
        <span className="text-green-400 shrink-0">{formatCost(s.total_cost_usd)}</span>

        {/* Model */}
        <span className="text-muted-foreground shrink-0 max-w-[120px] truncate" title={s.model ?? undefined}>
          {modelShortName(s.model)}
        </span>

        {/* Error badge */}
        {s.has_errors > 0 && (
          <span className="text-red-400 shrink-0">err</span>
        )}

        {/* Active badge */}
        {s.is_live > 0 && (
          <span className="text-green-400 shrink-0 text-[10px]">● active</span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Export buttons */}
        <button
          className="shrink-0 px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            exportSession(s.session_id, 'jsonl')
          }}
        >
          JSONL
        </button>
        <button
          className="shrink-0 px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            exportSession(s.session_id, 'csv')
          }}
        >
          CSV
        </button>

        {/* Replay link */}
        <Link
          to={`/live?replay=${s.session_id}`}
          className="shrink-0 px-1.5 py-0.5 text-[10px] rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Replay →
        </Link>
      </div>

      {/* Expanded detail row */}
      {expanded && (
        <div className="px-4 py-2 font-mono text-[10px] text-muted-foreground bg-accent/5 border-t border-border space-y-0.5">
          <div>
            <span className="text-foreground/60">session_id:</span>{' '}
            {s.session_id}
          </div>
          <div>
            <span className="text-foreground/60">project:</span>{' '}
            {s.project_name}
          </div>
          <div>
            <span className="text-foreground/60">last_event:</span>{' '}
            {s.last_event_ts}
          </div>
        </div>
      )}
    </div>
  )
}

export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyTimeFilter, setHistoryTimeFilter] = useState<HistoryTimeFilter>('all')

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data) => {
        const list: SessionSummary[] = Array.isArray(data)
          ? data
          : (data?.sessions ?? [])
        setSessions(list)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
        setLoading(false)
      })
  }, [])

  const HISTORY_WINDOW_MS: Partial<Record<HistoryTimeFilter, number>> = {
    '15m': 15 * 60 * 1000,
    '1h':  60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  }

  const filteredSessions = useMemo(() => {
    const windowMs = HISTORY_WINDOW_MS[historyTimeFilter]
    if (windowMs == null) return sessions   // 'all' — no filtering
    const cutoff = Date.now() - windowMs
    return sessions.filter((s) => new Date(s.last_event_ts).getTime() >= cutoff)
  }, [sessions, historyTimeFilter])

  // Group sessions by project name, sorted by last_event_ts desc within each group
  const grouped = useMemo(() => {
    const map = new Map<string, SessionSummary[]>()
    for (const s of filteredSessions) {
      const proj = s.project_name || 'unknown'
      if (!map.has(proj)) map.set(proj, [])
      map.get(proj)!.push(s)
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => new Date(b.last_event_ts).getTime() - new Date(a.last_event_ts).getTime())
    }
    return map
  }, [filteredSessions])

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Session History</h1>
        <Link
          to="/live"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Live Dashboard →
        </Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-muted-foreground text-sm font-mono">Loading sessions...</div>
      )}

      {/* Error state */}
      {error && (
        <div className="text-red-400 text-sm font-mono">Error: {error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && sessions.length === 0 && (
        <div className="text-muted-foreground text-sm font-mono">No sessions recorded yet.</div>
      )}

      {/* Session history quick filters */}
      {!loading && !error && sessions.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Show:</span>
          {(
            [
              { label: 'Last 15m', value: '15m' },
              { label: 'Last 1hr', value: '1h' },
              { label: 'Last 24hr', value: '24h' },
              { label: 'All', value: 'all' },
            ] as const
          ).map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setHistoryTimeFilter(value)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                historyTimeFilter === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Project groups */}
      {!loading && !error && grouped.size > 0 && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([project, projectSessions]) => (
            <Card key={project} className="overflow-hidden py-0">
              <CardHeader className="px-3 py-2 border-b border-border bg-accent/5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {project}
                  <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/60">
                    ({projectSessions.length} session{projectSessions.length !== 1 ? 's' : ''})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {projectSessions.map((s) => (
                  <SessionRow
                    key={s.session_id}
                    session={s}
                    expanded={expandedId === s.session_id}
                    onToggle={() => toggleExpand(s.session_id)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
