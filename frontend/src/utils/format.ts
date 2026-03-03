export function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '...'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function latencyClass(ms: number | null): string {
  if (ms === null) return ''
  if (ms < 500) return 'text-green-400'
  if (ms < 2000) return 'text-yellow-400'
  return 'text-red-400'
}

export function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001'
  return `$${usd.toFixed(3)}`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatTokensCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function formatAgentCost(tokens: number, costUsd: number): string {
  return `${formatTokens(tokens)} tok / ${formatCost(costUsd)}`
}

export function formatIdle(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s idle`
  return `${Math.floor(ms / 60_000)}m idle`
}

export function formatRelativeTime(ms: number): string {
  if (ms < 1000) return `${ms}ms ago`
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s ago`
  return `${Math.floor(ms / 60_000)}m ago`
}

export function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
