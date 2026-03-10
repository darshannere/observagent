# Phase 14: Health and Latency Charts - Research

**Researched:** 2026-03-10
**Domain:** Recharts 3.x — AreaChart with conditional dot rendering, BarChart grouped bars, React polling patterns, tab badge state
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Anomalous spike = any bucket where error_count > 0 (any non-zero error count is a spike)
- Spike visualization: red dot rendered on the AreaChart line at spike buckets (custom dot via recharts dot prop)
- Y-axis shows error rate % (error_count / sample_count * 100), not raw count
- Session scope: auto-select latest active session (same pattern as Activity tab); if no session, show empty state
- Stalled agent format: compact card list — one card per stalled agent showing agent name, idle duration, and start time
- Tab label badge: dynamic — "Health (N)" when N > 0 stalled agents, plain "Health" when none
- Badge updates in background even when not on Health tab (always-on poll for stalled-agents)
- Read-only: no dismiss/kill actions on stalled agent cards
- Empty state: "All agents healthy" with green tint — positive confirmation, not just blank
- Widget order (top to bottom): Stalled Agents → Error Rate → Latency by Tool
- Latency chart: grouped bars per tool type — p50 (green #4ade80) and p95 (yellow #facc15) side-by-side per tool
- Existing Tool Call Latency stat boxes stay in Cost tab — not duplicated in Health tab
- All Health tab data polls every 30 seconds while Health tab is visible — one shared interval
- Exception: stalled-agents also polls in the background (always-on, not just when Health tab visible)
- Session filter: auto-select `sessionCosts[0]?.session_id` as the active session
- If no session active: empty state per widget, no API calls made
- Loading state: `animate-pulse bg-muted` skeleton at chart height (160px) while loading
- Per-chart inline retry: "Failed to load — retry?" on error
- Each widget fails independently

### Claude's Discretion

- Exact badge styling (count badge component or parenthetical in tab label text)
- Green tint implementation for "All agents healthy" empty state
- Exact card layout for stalled agents (padding, divider, icon choices)
- Whether to show agent_type label on stalled agent cards if available

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INSG-05 | User can see error rate timeline showing errors over time with visual spike highlighting | AreaChart with custom dot prop for conditional red dot rendering; Y-axis as error rate %; API returns `[{ bucket_ms, errors, total }]` — compute `errors/total*100` in frontend |
| INSG-06 | User can see per-tool-type latency chart (p50/p95 bars for Bash, Read, Write, Grep, etc.) | Grouped BarChart with two `<Bar>` children (p50 green, p95 yellow); API returns `[{ tool_name, p50_ms, p95_ms, sample_count }]`; recharts groups automatically |
| INSG-07 | User can identify stalled agents directly from the Insights panel (agents active beyond 10-min threshold) | API returns `[{ agent_id, agent_type, last_activity_ts, idle_seconds }]`; render compact card list; always-on background poll drives tab badge count |
</phase_requirements>

## Summary

Phase 14 fills in the Health tab stub in InsightsPanel.tsx with three widgets — all purely frontend work. Backend endpoints are fully implemented from Phase 12 and their contracts are verified by reading `routes/insights.js` directly. No schema migrations, no new routes, no new dependencies.

The implementation follows established Phase 13 patterns: 30-second `setInterval` polling in `useEffect`, `animate-pulse bg-muted` skeleton states, per-widget independent error/retry handling, and the `TOOLTIP_STYLE` constant shared across all charts. The only new pattern is the always-on background poll for stalled-agents (decoupled from tab visibility) to keep the badge count live.

The custom spike dot in the error rate AreaChart uses recharts' `dot` prop with a render function. In recharts 3.x (installed: ^3.8.0), the `dot` prop on `<Area>` accepts `false | true | object | ReactElement | function`. The function signature receives per-point props and must return a React element or `null`. This is the standard pattern for conditional point highlighting and is verified from the recharts 3.x API docs.

**Primary recommendation:** Build all three widgets inline in InsightsPanel.tsx, mirroring the Activity tab's state/effect structure. Use a single `useEffect` for Health tab polling (error-rate + latency-by-tool), and a separate mount-time `useEffect` for the always-on stalled-agents poll.

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^3.8.0 | AreaChart (error rate with spike dots), BarChart (latency grouped bars) | Already in use across InsightsPanel; all chart primitives imported |
| React 19 | ^19.2.0 | Component model, useState/useEffect/useRef/useMemo | Project standard |
| Zustand | ^5.0.11 | `useObservStore` for `sessionCosts[0]?.session_id` | Project standard |
| Tailwind CSS v4 | ^4.2.1 | Skeleton pulse animation, card styling, green tint empty state | Project standard |

### Already Imported in InsightsPanel.tsx

```typescript
import {
  AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
```

No new imports needed — every recharts primitive required for this phase is already in the import list.

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Structure (all changes to one file)

```
frontend/src/components/insights/
└── InsightsPanel.tsx    // Only file modified — add Health tab state + widgets
```

All state, effects, and render logic live inline in InsightsPanel.tsx, consistent with how Cost and Activity tabs are implemented. No new component files needed.

### Pattern 1: Always-On Background Poll (stalled-agents)

**What:** A `useEffect` that fires once on mount (empty dependency array) sets up a `setInterval` independent of tab visibility. Polls `/api/insights/stalled-agents` every 30 seconds. The returned count updates the tab label badge.

**When to use:** When data must stay fresh regardless of which tab is active (badge count accuracy).

**Example:**
```typescript
// Fires on mount, clears on unmount — independent of activeTab
useEffect(() => {
  const fetchStalled = () => {
    fetch('/api/insights/stalled-agents')
      .then(r => r.json())
      .then((data: StalledAgent[]) => {
        setStalledAgents(data)
        setStalledStatus('ok')
      })
      .catch(() => setStalledStatus('error'))
  }
  fetchStalled()
  const id = setInterval(fetchStalled, 30000)
  return () => clearInterval(id)
}, []) // empty array = mount only
```

### Pattern 2: Tab-Gated Poll (error-rate + latency-by-tool)

**What:** Mirror of Activity tab's `useEffect` — deps include `[activeTab, latestSessionId]`, short-circuits if `activeTab !== 'Health'` or no session. Fetches both endpoints together, sets up shared 30-second interval.

**When to use:** Data only needed when the Health tab is visible.

**Example:**
```typescript
useEffect(() => {
  if (activeTab !== 'Health' || !latestSessionId) return
  const fetchHealth = () => {
    setErrorRateStatus('loading')
    setLatencyStatus('loading')
    fetch(`/api/insights/error-rate?session_id=${latestSessionId}`)
      .then(r => r.json())
      .then(d => { setErrorRateData(d); setErrorRateStatus('ok') })
      .catch(() => setErrorRateStatus('error'))
    fetch(`/api/insights/latency-by-tool?session_id=${latestSessionId}`)
      .then(r => r.json())
      .then(d => { setLatencyData(d); setLatencyStatus('ok') })
      .catch(() => setLatencyStatus('error'))
  }
  fetchHealth()
  const id = setInterval(fetchHealth, 30000)
  return () => clearInterval(id)
}, [activeTab, latestSessionId])
```

### Pattern 3: Conditional Spike Dot (recharts 3.x `dot` prop)

**What:** The `dot` prop on `<Area>` accepts a render function. The function receives point props including the data payload. Return a `<circle>` SVG element for spike buckets, `null` for non-spike buckets.

**When to use:** Whenever a specific data point needs visual differentiation on an AreaChart line.

**Example:**
```typescript
// Source: recharts 3.x API docs — dot prop accepts function
const spikeDot = (props: any) => {
  const { cx, cy, payload } = props
  if (!payload || payload.error_rate <= 0) return null
  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#ef4444" stroke="none" />
}

<Area
  dataKey="error_rate"
  dot={spikeDot}
  // ...
/>
```

**Key detail:** The `dot` function is called for every data point. Return `null` (not `<g/>` or empty fragment) to skip rendering a dot. Use a stable `key` prop on the returned element to avoid React reconciliation warnings.

### Pattern 4: Dynamic Tab Label

**What:** Replace static string tab labels with computed labels. The `TABS` array is currently `['Cost', 'Activity', 'Health']` — this remains unchanged as a type array. The tab label rendering in the JSX computes the display string:

```typescript
// In the tab bar map:
{TABS.map((tab) => (
  <button key={tab} onClick={() => setActiveTab(tab)} className={...}>
    {tab === 'Health' && stalledCount > 0 ? `Health (${stalledCount})` : tab}
  </button>
))}
```

**When to use:** Badge count is derived directly from `stalledAgents.length` — no extra state variable needed.

### Pattern 5: Grouped BarChart (latency by tool)

**What:** Two `<Bar>` children inside one `<BarChart>` — recharts groups them automatically side-by-side. Data shape must have both keys on each object.

**Example:**
```typescript
// Source: recharts 3.x — multiple Bar children produce grouped bars
// API response: [{ tool_name, p50_ms, p95_ms, sample_count }]
<BarChart data={latencyData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
  <XAxis dataKey="tool_name" tick={{ fontSize: 9, fill: '#6b7280' }} angle={-20} textAnchor="end" />
  <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} tickFormatter={(v: number) => `${v}ms`} />
  <Tooltip formatter={(v) => [`${v}ms`]} contentStyle={TOOLTIP_STYLE} />
  <Legend wrapperStyle={{ fontSize: 9 }} />
  <Bar dataKey="p50_ms" fill="#4ade80" name="p50" radius={[2, 2, 0, 0]} />
  <Bar dataKey="p95_ms" fill="#facc15" name="p95" radius={[2, 2, 0, 0]} />
</BarChart>
```

### Pattern 6: Error Rate Data Transformation

**What:** The API returns `{ bucket_ms, errors, total }` — the frontend computes `error_rate = errors / total * 100` before passing to recharts. Do this in the fetch callback, not in the render.

**Example:**
```typescript
fetch(`/api/insights/error-rate?session_id=${latestSessionId}`)
  .then(r => r.json())
  .then((raw: { bucket_ms: number; errors: number; total: number }[]) => {
    const transformed = raw.map(d => ({
      bucket_ms: d.bucket_ms,
      error_rate: d.total > 0 ? (d.errors / d.total) * 100 : 0,
    }))
    setErrorRateData(transformed)
    setErrorRateStatus('ok')
  })
```

**Why in fetch callback:** Keeps render logic clean; data shape matches `dataKey="error_rate"` directly.

### Pattern 7: Stalled Agent Card Layout

**What:** A compact card list. Each card shows agent name (`agent_id.slice(0, 8)` or `agent_type`), idle duration formatted from `idle_seconds`, and start time from `last_activity_ts`. Claude has discretion over exact padding/divider/icons.

**Idle duration formatting:**
```typescript
const formatIdle = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}
```

### Anti-Patterns to Avoid

- **Fetching stalled-agents inside the Health tab effect:** The badge must update when the user is on Cost or Activity tab. Keep stalled-agents in its own mount-time effect.
- **Nesting both error-rate and stalled-agents in one `setInterval`:** Different refresh triggers (tab-gated vs always-on). Separate effects prevent one from canceling the other on tab switch.
- **Passing raw `errors` count as Y-axis value:** The decision locks Y-axis to error rate % (0-100 scale). Always transform to `error_rate` before binding to the chart.
- **Using `key={index}` on stalled agent cards:** Use `agent_id` as key — list may reorder as agents become stalled.
- **Returning empty `<g/>` from spike dot function instead of `null`:** recharts renders invisible SVG groups; return `null` explicitly for no-dot buckets.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grouped bar side-by-side | Custom bar positioning logic | recharts multiple `<Bar>` children | recharts handles x-offset math automatically |
| Chart tooltip styling | Custom tooltip component | `TOOLTIP_STYLE` constant (already defined) | One-liner prop; matches all existing charts |
| Idle duration string | Date math library | Inline `Math.floor(seconds / 60)` | Seconds already computed server-side; no library needed |
| Polling interval cleanup | Custom AbortController wrapper | `setInterval` + `clearInterval` in effect return | Project pattern; three effects already use it |
| Error state component | Custom error boundary | Inline conditional `<p>Failed to load — <button>retry?</button></p>` | Phase 13 pattern; keeps everything colocated |

**Key insight:** The entire phase is a composition of patterns already proven in Phases 12 and 13. No new primitives are required.

## Common Pitfalls

### Pitfall 1: Stalled-Agents Poll Cleaned Up on Tab Switch

**What goes wrong:** If the stalled-agents fetch is placed inside the Health tab `useEffect` (which returns a cleanup when `activeTab` changes), the background poll stops when the user leaves Health tab — badge goes stale.

**Why it happens:** `useEffect` cleanup runs whenever deps change; `activeTab` changing triggers cleanup.

**How to avoid:** Two separate effects — one with `[activeTab, latestSessionId]` for error-rate/latency, one with `[]` for stalled-agents.

**Warning signs:** Badge shows "Health (2)" when on Health tab but reverts to "Health" when switching away.

### Pitfall 2: Error Rate Spike Dot Returns Falsy Instead of `null`

**What goes wrong:** Returning `undefined`, `false`, or `0` from the dot function — recharts in v3 may render unexpected fallback dots or throw React key warnings.

**Why it happens:** JavaScript falsy values are not all equivalent to React's `null` for conditional rendering inside recharts internals.

**How to avoid:** Always return explicit `null` for non-spike points. Return a JSX element with a unique `key` prop for spike points.

### Pitfall 3: `setInterval` with Stale Closure on `latestSessionId`

**What goes wrong:** The interval callback captures `latestSessionId` from mount time. If the session changes, the interval still fetches the old session's data.

**Why it happens:** Closures in `setInterval` capture the variable at creation time.

**How to avoid:** The `useEffect` for tab-gated data has `latestSessionId` in its dependency array — a session change tears down the old interval and creates a new one with the fresh session ID. The stalled-agents poll has no session ID, so this doesn't apply there.

**Warning signs:** Charts show data for a previous session after a new session starts.

### Pitfall 4: Missing `idle` Check Before First Stalled-Agents Response

**What goes wrong:** `stalledCount` is derived from `stalledAgents.length`. If the initial state is `[]` (empty array) and the first fetch hasn't returned yet, the badge shows "Health" (correct) — but if the first fetch errors, count stays 0 indefinitely.

**Why it happens:** No distinction between "not yet fetched" and "zero stalled agents".

**How to avoid:** Separate `stalledStatus` state (`'idle' | 'loading' | 'ok' | 'error'`) from `stalledAgents` array. The badge only shows a count when `stalledStatus === 'ok'`.

### Pitfall 5: BarChart with `angle={-20}` Clips Long Tool Names

**What goes wrong:** Tool names like "mcp__context7__query-docs" are long. With `angle={-20}` and small font, the angled labels may overflow the chart bottom margin.

**Why it happens:** recharts `XAxis` does not auto-expand margin for angled text.

**How to avoid:** Use `margin={{ bottom: 28, ... }}` (slightly more than the standard 20) for the latency chart. Optionally truncate tool names to ~20 chars in the data transform step.

## Code Examples

Verified patterns from existing codebase and recharts 3.x API:

### State Variables for Health Tab

```typescript
// Stalled agents (always-on)
const [stalledAgents, setStalledAgents] = useState<StalledAgent[]>([])
const [stalledStatus, setStalledStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

// Error rate (tab-gated)
const [errorRateData, setErrorRateData] = useState<{ bucket_ms: number; error_rate: number }[]>([])
const [errorRateStatus, setErrorRateStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

// Latency by tool (tab-gated)
const [latencyData, setLatencyData] = useState<{ tool_name: string; p50_ms: number; p95_ms: number; sample_count: number }[]>([])
const [latencyStatus, setLatencyStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

// Derived — no extra state
const stalledCount = stalledStatus === 'ok' ? stalledAgents.length : 0
```

### Type Definitions

```typescript
interface StalledAgent {
  agent_id: string
  agent_type: string
  last_activity_ts: number
  idle_seconds: number
}
```

### Error Rate AreaChart (with spike dots)

```typescript
// Source: recharts 3.x Area dot prop — function variant
const spikeDot = (props: any) => {
  const { cx, cy, payload } = props
  if (!payload || payload.error_rate <= 0) return null
  return <circle key={`spike-${payload.bucket_ms}`} cx={cx} cy={cy} r={4} fill="#ef4444" />
}

<AreaChart data={errorRateData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
  <XAxis
    dataKey="bucket_ms"
    tick={{ fontSize: 9, fill: '#6b7280' }}
    tickFormatter={(v: number) =>
      new Date(v).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })
    }
  />
  <YAxis
    tick={{ fontSize: 9, fill: '#6b7280' }}
    tickFormatter={(v: number) => `${v.toFixed(1)}%`}
    domain={[0, 'auto']}
  />
  <Tooltip
    formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Error Rate']}
    contentStyle={TOOLTIP_STYLE}
  />
  <Area
    dataKey="error_rate"
    fill="#ef4444"
    stroke="#dc2626"
    fillOpacity={0.15}
    type="monotone"
    dot={spikeDot}
  />
</AreaChart>
```

### "All Agents Healthy" Empty State

```typescript
// Green tint — Claude's discretion, this pattern matches project style
<div className="rounded border border-green-800 bg-green-950/30 p-3 text-center">
  <p className="text-xs text-green-400">All agents healthy</p>
</div>
```

### Tab Label with Badge

```typescript
// Replace static tab name with conditional display
{TABS.map((tab) => (
  <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={[
      'px-4 py-2 text-xs font-medium transition-colors',
      activeTab === tab
        ? 'border-b-2 border-green-400 text-foreground'
        : 'text-muted-foreground hover:text-foreground',
    ].join(' ')}
  >
    {tab === 'Health' && stalledCount > 0 ? `Health (${stalledCount})` : tab}
  </button>
))}
```

## API Contract Reference

All three backend endpoints verified from `routes/insights.js`:

### `/api/insights/stalled-agents` (GET, no params)
Returns agents where `state = 'active'` AND `last_activity_ts < (now - 10min)`:
```json
[
  { "agent_id": "abc123...", "agent_type": "gsd-executor", "last_activity_ts": 1741608000000, "idle_seconds": 647 }
]
```

### `/api/insights/error-rate?session_id=X` (GET)
Returns PostToolUse events in 5-minute buckets (300000ms). `session_id=''` = global view:
```json
[
  { "bucket_ms": 1741608000000, "errors": 2, "total": 18 }
]
```
Frontend computes: `error_rate = errors / total * 100`

### `/api/insights/latency-by-tool?session_id=X` (GET)
Returns p50/p95 per tool_name. Only tools with `sample_count >= 2` included:
```json
[
  { "tool_name": "Bash", "p50_ms": 234, "p95_ms": 1820, "sample_count": 47 }
]
```
Ordered by `p95_ms DESC` — highest latency tools appear first.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| recharts 2.x dot prop as object only | recharts 3.x dot prop accepts function | v3.0 release | Enables conditional rendering without wrapping entire chart |
| Static tab labels as string array | Dynamic computed label in JSX render | Phase 14 (new) | Badge count without changing TABS type definition |
| Tab-gated polling only | Mount-time always-on poll for badge data | Phase 14 (new) | Badge stays accurate across tab switches |

**Deprecated/outdated:**
- `activeIndex` prop on Area/Line: removed in recharts 3.0 — not relevant here but worth noting for any future chart work

## Open Questions

1. **recharts 3.x `dot` prop exact TypeScript type**
   - What we know: Accepts `false | true | object | ReactElement | function` (from API docs, MEDIUM confidence)
   - What's unclear: Exact TypeScript interface for the function argument (`props: any` vs typed props object)
   - Recommendation: Use `props: any` in the dot function — recharts 3.x typings for custom props are loose; this avoids TypeScript errors while maintaining correct runtime behavior

2. **Stalled agent cards when `agent_type` is empty string**
   - What we know: `agent_type` can be empty for solo sessions (per Phase 12 decisions); `agent_nodes` rows have `agent_type` field
   - What's unclear: Whether stalled solo agents have `agent_type = ''`
   - Recommendation: Display `agent_type || agent_id.slice(0, 8)` as the card title — graceful fallback

## Sources

### Primary (HIGH confidence)
- Direct file read: `routes/insights.js` — complete API contract for all three endpoints, verified response shapes
- Direct file read: `frontend/src/components/insights/InsightsPanel.tsx` — exact existing patterns (polling, state shape, TOOLTIP_STYLE, skeleton, error/retry)
- Direct file read: `frontend/package.json` — confirmed recharts ^3.8.0, React 19, Tailwind v4

### Secondary (MEDIUM confidence)
- recharts 3.x API docs (recharts.github.io/en-US/api/Area) — `dot` prop type and function signature
- recharts 3.0 migration guide — confirmed no breaking changes to `dot` prop behavior

### Tertiary (LOW confidence)
- None — all claims verified from primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from package.json and existing imports
- Architecture: HIGH — all patterns verified from existing InsightsPanel.tsx code
- API contracts: HIGH — read directly from routes/insights.js source
- Recharts dot prop function variant: MEDIUM — verified from official API docs; TypeScript typings uncertain
- Pitfalls: HIGH — derived from direct code analysis of existing patterns and known recharts v3 changes

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (recharts 3.x stable; all other patterns project-internal)
