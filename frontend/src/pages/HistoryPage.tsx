import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  formatTs,
  formatCost,
  formatTokens,
  formatDuration,
} from '@/utils/format'

interface SessionSummary {
  session_id: string
  project_path: string
  start_time: number
  end_time: number | null
  total_cost_usd: number
  total_tokens: number
  model: string | null
  error_count: number
  event_count: number
  is_active: boolean
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

interface SessionRowProps {
  session: SessionSummary
  expanded: boolean
  onToggle: () => void
}

function SessionRow({ session: s, expanded, onToggle }: SessionRowProps) {
  const duration =
    s.end_time !== null ? formatDuration(s.end_time - s.start_time) : null

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

        {/* Date + duration */}
        <span className="text-muted-foreground shrink-0">
          {formatTs(s.start_time)}
          {duration !== null && (
            <span className="ml-1 text-muted-foreground/70">({duration})</span>
          )}
        </span>

        {/* Cost */}
        <span className="text-green-400 shrink-0">{formatCost(s.total_cost_usd)}</span>

        {/* Tokens */}
        <span className="text-muted-foreground shrink-0">{formatTokens(s.total_tokens)}</span>

        {/* Model */}
        <span className="text-muted-foreground shrink-0 max-w-[120px] truncate" title={s.model ?? undefined}>
          {modelShortName(s.model)}
        </span>

        {/* Error count */}
        {s.error_count > 0 && (
          <span className="text-red-400 shrink-0">{s.error_count} err</span>
        )}

        {/* Active badge */}
        {s.is_active && (
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
            {s.project_path}
          </div>
          <div>
            <span className="text-foreground/60">start:</span>{' '}
            {new Date(s.start_time).toISOString()}
          </div>
          {s.end_time !== null && (
            <div>
              <span className="text-foreground/60">end:</span>{' '}
              {new Date(s.end_time).toISOString()}
            </div>
          )}
          <div>
            <span className="text-foreground/60">events:</span> {s.event_count}
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

  // Group sessions by project name, sorted by start_time desc within each group
  const grouped = useMemo(() => {
    const map = new Map<string, SessionSummary[]>()
    for (const s of sessions) {
      const proj = s.project_path.split('/').pop() || s.project_path
      if (!map.has(proj)) map.set(proj, [])
      map.get(proj)!.push(s)
    }
    for (const [, arr] of map) arr.sort((a, b) => b.start_time - a.start_time)
    return map
  }, [sessions])

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
