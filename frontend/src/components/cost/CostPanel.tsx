import { useRef, useState } from 'react'
import { useObservStore } from '@/store/useObservStore'
import { formatCost, formatTokens } from '@/utils/format'

function useDebouncedPost(url: string, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (payload: Record<string, unknown>) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    }, delay)
  }
}

export function CostPanel() {
  const sessionCosts = useObservStore((s) => s.sessionCosts)
  const todayCost = useObservStore((s) => s.todayCost)
  const config = useObservStore((s) => s.config)
  const activeFilter = useObservStore((s) => s.activeSessionFilter)

  const postConfig = useDebouncedPost('/api/config')

  const [budgetUsd, setBudgetUsd] = useState<string>('')
  const [budgetTokens, setBudgetTokens] = useState<string>('')

  // Derive active session: prefer filter match, else highest cost
  const activeSession =
    (activeFilter
      ? sessionCosts.find((s) => s.session_id === activeFilter)
      : null) ??
    [...sessionCosts].sort((a, b) => b.total_cost_usd - a.total_cost_usd)[0] ??
    null

  const overBudget =
    config?.budget_usd != null &&
    activeSession != null &&
    activeSession.total_cost_usd >= config.budget_usd

  const fillPct = activeSession?.context_fill_pct ?? 0
  const fillRed = fillPct >= 80

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {/* Budget alert */}
      {overBudget && (
        <div className="rounded border border-red-500 bg-red-950/30 px-3 py-2 text-red-400 font-semibold">
          Budget exceeded — session cost {formatCost(activeSession!.total_cost_usd)} &ge;{' '}
          {formatCost(config!.budget_usd!)}
        </div>
      )}

      {/* Session cost */}
      <div>
        <div className="text-muted-foreground mb-0.5 uppercase tracking-wide text-[10px]">
          Session Cost
        </div>
        <div className="text-2xl font-bold text-foreground tabular-nums">
          {activeSession ? formatCost(activeSession.total_cost_usd) : '$0.000'}
        </div>
        <div className="text-muted-foreground text-[10px] mt-0.5">
          Today: {formatCost(todayCost)}
        </div>
      </div>

      {/* Token breakdown */}
      {activeSession && (
        <div>
          <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">
            Tokens
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input</span>
              <span className="tabular-nums">{formatTokens(activeSession.input_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="tabular-nums">{formatTokens(activeSession.output_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache read</span>
              <span className="tabular-nums">
                {formatTokens(activeSession.cache_read_tokens)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache write</span>
              <span className="tabular-nums">
                {formatTokens(activeSession.cache_write_tokens)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Context fill % bar */}
      {activeSession && (
        <div>
          <div
            className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1"
            title="Context window fill %. Calculated using 160K effective window (200K model max − 40K autocompact buffer) to match Claude Code display."
          >
            Context Fill
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={['h-full rounded-full transition-all', fillRed ? 'bg-red-500' : 'bg-primary'].join(' ')}
              style={{ width: `${Math.min(fillPct, 100)}%` }}
            />
          </div>
          <div
            className={['text-[10px] mt-0.5', fillRed ? 'text-red-400' : 'text-muted-foreground'].join(' ')}
          >
            {fillPct.toFixed(1)}%
          </div>
        </div>
      )}

      {/* Model breakdown */}
      {activeSession && activeSession.models.length > 0 && (
        <div>
          <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">
            Models
          </div>
          <div className="flex flex-col gap-0.5">
            {activeSession.models.map((m) => (
              <div key={m.model} className="flex justify-between gap-2">
                <span className="text-muted-foreground truncate">{m.model}</span>
                <span className="tabular-nums shrink-0">{formatCost(m.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budget threshold inputs */}
      <div>
        <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">
          Budget Thresholds
        </div>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground w-16 shrink-0">Cost (USD)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={config?.budget_usd?.toString() ?? 'e.g. 1.00'}
              value={budgetUsd}
              onChange={(e) => {
                setBudgetUsd(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) postConfig({ budget_usd: v })
              }}
              className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground w-16 shrink-0">Tokens (K)</span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder={
                config?.budget_tokens ? String(Math.round(config.budget_tokens / 1000)) : 'e.g. 100'
              }
              value={budgetTokens}
              onChange={(e) => {
                setBudgetTokens(e.target.value)
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v)) postConfig({ budget_tokens: v * 1000 })
              }}
              className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
