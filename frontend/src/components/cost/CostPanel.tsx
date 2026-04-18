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
  const contextFillPct = useObservStore((s) => s.contextFillPct)
  const contextWindowTokens = useObservStore((s) => s.contextWindowTokens)
  const setContextWindowTokens = useObservStore((s) => s.setContextWindowTokens)
  const selectedCostSession = useObservStore((s) => s.selectedCostSession)
  const setSelectedCostSession = useObservStore((s) => s.setSelectedCostSession)

  const postConfig = useDebouncedPost('/api/config')

  const [budgetUsd, setBudgetUsd] = useState<string>('')
  const [contextBudgetPct, setContextBudgetPct] = useState<string>('')

  // Derive tracked session: user-picked cost session > filter match > most recent
  const trackedSession =
    (selectedCostSession
      ? sessionCosts.find((s) => s.session_id === selectedCostSession)
      : null) ??
    (activeFilter
      ? sessionCosts.find((s) => s.session_id === activeFilter)
      : null) ??
    sessionCosts[0] ??
    null


  const costBudgetUsd = config?.budget_threshold_usd ?? config?.budget_usd ?? null
  const contextBudget = config?.ctx_fill_threshold_pct ?? null

  const overBudget =
    costBudgetUsd != null &&
    trackedSession != null &&
    trackedSession.total_cost_usd >= costBudgetUsd

  const overContextBudget =
    contextBudget != null &&
    contextFillPct >= contextBudget

  const fillRed = contextFillPct >= 80

  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {/* Budget alert */}
      {(overBudget || overContextBudget) && (
        <div className="rounded border border-red-500 bg-red-950/30 px-3 py-2 text-red-400 font-semibold">
          {overBudget && trackedSession && (
            <div>
              Cost budget exceeded — {formatCost(trackedSession.total_cost_usd)} &ge;{' '}
              {formatCost(costBudgetUsd!)}
            </div>
          )}
          {overContextBudget && (
            <div>
              Context budget exceeded — {contextFillPct.toFixed(1)}% &ge; {contextBudget!.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {/* Session cost */}
      <div>
        <div className="text-muted-foreground mb-0.5 uppercase tracking-wide text-[10px]">
          Session Cost
        </div>
        <div className="font-display font-bold text-[#ff7b2b] text-2xl tabular-nums">
          {trackedSession ? formatCost(trackedSession.total_cost_usd) : '$0.000'}
        </div>
        <div className="text-muted-foreground text-[10px] mt-0.5">
          Today: {formatCost(todayCost)}
        </div>
        <div className="text-muted-foreground text-[10px] mt-0.5">
          Context budget: {contextBudget != null ? `${contextBudget.toFixed(1)}%` : 'Not set'}
        </div>
      </div>

      {/* Token breakdown */}
      {trackedSession && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <div className="text-muted-foreground uppercase tracking-wide text-[10px]">
              Tokens
            </div>
            {/* Session picker */}
            {sessionCosts.length > 0 && (
              <select
                value={selectedCostSession ?? '__auto__'}
                onChange={(e) => {
                  setSelectedCostSession(e.target.value === '__auto__' ? null : e.target.value)
                }}
                className="text-[9px] rounded border border-border bg-background px-1 py-0.5 text-muted-foreground max-w-[120px]"
              >
                <option value="__auto__">
                  Auto ({sessionCosts[0]?.project_name?.slice(0, 10) ?? sessionCosts[0]?.session_id?.slice(0, 6) ?? ''})
                </option>
                {sessionCosts.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.project_name?.slice(0, 10) ?? s.session_id?.slice(0, 6)} — {formatCost(s.total_cost_usd)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input</span>
              <span className="tabular-nums font-display font-bold text-primary">{formatTokens(trackedSession.input_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="tabular-nums font-display font-bold text-primary">{formatTokens(trackedSession.output_tokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache read</span>
              <span className="tabular-nums font-display font-bold text-primary">
                {formatTokens(trackedSession.cache_read_tokens)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cache write</span>
              <span className="tabular-nums font-display font-bold text-primary">
                {formatTokens(trackedSession.cache_write_tokens)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Context fill % bar — contextFillPct is recalculated locally when context window changes */}
      <div>
        <div
          className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1"
          title="Context window fill %. Calculated using 160K effective window (200K model max − 40K autocompact buffer) to match Claude Code display."
        >
          Context Fill
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={[
            'h-full rounded-full transition-all',
            fillRed
              ? 'bg-red-500'
              : 'bg-gradient-to-r from-primary to-lime shadow-[0_0_8px_var(--glow-l)]',
          ].join(' ')}
            style={{ width: `${Math.min(contextFillPct, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span
            className={['text-[10px]', fillRed ? 'text-red-400' : 'text-muted-foreground'].join(' ')}
          >
            {contextFillPct.toFixed(1)}%
          </span>
          <select
            value={contextWindowTokens}
            onChange={(e) => {
              const tokens = Number(e.target.value)
              setContextWindowTokens(tokens)
              postConfig({ context_window_tokens: tokens })
            }}
            className="text-[9px] rounded border border-border bg-background px-1 py-0.5 text-muted-foreground"
          >
            <option value={200_000}>200K ctx</option>
            <option value={1_000_000}>1M ctx</option>
          </select>
        </div>
      </div>

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
              placeholder={costBudgetUsd?.toString() ?? 'e.g. 1.00'}
              value={budgetUsd}
              onChange={(e) => {
                setBudgetUsd(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) postConfig({ budget_threshold_usd: v })
              }}
              className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground w-16 shrink-0">Context (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              placeholder={contextBudget != null ? contextBudget.toString() : 'e.g. 80'}
              value={contextBudgetPct}
              onChange={(e) => {
                setContextBudgetPct(e.target.value)
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) postConfig({ ctx_fill_threshold_pct: v })
              }}
              className="w-full rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
