# Phase 11: Dashboard Overhaul + Filters - Research

**Researched:** 2026-03-07
**Domain:** React dashboard UI (Zustand state, Tailwind CSS, virtualized lists, time filtering, chart integration)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Agent Tree Prominence**
- Agent tree should occupy ~35% of the dashboard width (wider than current ~30%, but balanced with log area)
- Agent tree is the primary focal point but log area still has good breathing room
- Existing w-56 layout will be adjusted — recommend flex-basis or specific percentage width

**Agent Sorting and Grouping**
- Maintain session-based hierarchy (sessions contain agents)
- Within each session, agents are interleaved (not separated into active/inactive sections)
- Active agents are visually distinguished through color (existing green/yellow/red color coding)
- Idle agents receive reduced visual emphasis to show they're not currently running

**Active Agent Visual Emphasis**
- Idle and completed agents are grouped in a separate collapsible "Inactive" section at the bottom of the agent tree
- This keeps active agents always visible and prominent without scrolling
- Active agents remain in full color (green) and are visually primary
- Collapsible section can be toggled, with state persisted to localStorage (following existing pattern)

**Time Filters for Tool Log**
- Quick-filter buttons placed inline with existing session/agent filters in the agent tree sidebar (not in the log tab bar)
- Buttons: "Last 5min" / "Last 15min" / "Last 1hr" / "All"
- Filtering logic filters events by timestamp, live SSE events continue uninterrupted
- Filters stack with existing session/agent filters (time AND session/agent)

**Session History Filtering**
- HistoryPage gains quick-filter buttons for date-based filtering: "Last 15min" / "Last 1hr" / "Last 24hr" / "All"
- Buttons calculate time range relative to current time and filter displayed sessions
- Consistent pattern with tool log time filters
- No date range picker — quick buttons only for simplicity and UX consistency

**Cost and Health Panel Strategy**
- Right sidebar: Keep existing right sidebar (Cost above, Health below) as-is for quick reference during live sessions
- New Insights tab: Create a 4th tab alongside Log/Timeline: "Log" / "Timeline" / "Insights" / (existing tabs)
- Insights tab contains: Cost breakdown (by model, session, agent), Health statistics and status indicators, Charts/graphs showing cost trends and latency metrics (p50/p95) over time, More detailed analytics than the compact right sidebar
- The Insights tab expands dashboard observability beyond current static panels

### Claude's Discretion
- Exact pixel widths and Tailwind breakpoints for responsive behavior
- Specific chart library choice (Chart.js, Recharts, Plotly, etc.) and styling
- Inactive section collapse animation and transition timing
- Exact spacing and padding in the Insights tab layout
- Filter button styling and hover states

### Deferred Ideas (OUT OF SCOPE)
- Interactive alerts/anomaly detection based on cost spikes or error rates — future phase
- Custom time range picker (more flexible than quick buttons) — could enhance Phase 11 but not required
- Export Insights charts as PDF/image — future phase
- Agent performance comparison (comparing agents side-by-side in Insights) — future phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH2-01 | Dashboard reorganizes the agent hierarchy as the primary view — agent tree is the dominant panel with full-height prominence | AgentTree width: change from `w-56` (224px, ~14% of 1440px viewport) to `flex-basis: 35%`. LiveDashboard.tsx 3-column layout needs flex-basis adjustments. Agent tree already has full-height via `overflow-y-auto`. |
| DASH2-02 | Active/running agents are visually prominent (full color); idle/completed agents are de-emphasized (muted) | Add "Inactive" collapsible `<details>` section at bottom of AgentTree.tsx. Split `sessionAgents` into `active[]` and `inactive[]`. Inactive rows get `opacity-50` or `text-muted-foreground`. localStorage key for collapse state already established. |
| DASH2-03 | Dashboard has time filter quick-select controls (Last 5min / Last 15min / Last 1hr / All) that filter the tool log and agent view | Add `timeFilter: '5m' | '15m' | '1h' | 'all'` to `useObservStore`. `ToolLog.tsx` `useMemo` already does session/agent filtering — extend it with timestamp comparison `e.timestamp > Date.now() - windowMs`. SSE events append live regardless of filter. |
| DASH2-04 | Context fill % bar in the cost/token panel is fixed and functional (tied to CALC-01 fix) | `CostPanel.tsx` already has the context fill bar (lines 121-139). `contextFillPct` is in the store and updated via SSE `cost_update`. CALC-01 was completed in Phase 8. Verify bar is wired correctly to `contextFillPct` state — appears already functional from code review. |
| FILT-01 | Session history page has a date/time range picker (from → to) | CONTEXT.md locked this as quick-filter buttons ONLY (no date range picker). FILT-01 text says "date/time range picker" but CONTEXT.md overrides: quick buttons calculate time range relative to current time. Implement as buttons only. |
| FILT-02 | Session history page has quick filter buttons: Last 15min / Last 1hr / Last 24hr / All | HistoryPage.tsx currently fetches `/api/sessions` with `date_from`/`date_to` query params already supported in api.js (lines 107-108). Client-side filtering is also viable since sessions list is small. Both approaches work. |
</phase_requirements>

---

## Summary

Phase 11 is a pure frontend UI overhaul. There is no backend work required — all data is already available via existing APIs and SSE events. The work falls into four bounded areas: (1) AgentTree layout/visual changes with an Inactive section, (2) time filter state in Zustand + ToolLog filtering, (3) Insights tab with charts in the center panel, and (4) session history quick-filter buttons.

The existing codebase is well-structured for these changes. The Zustand store (`useObservStore`) handles centralized state with the `new Map()`/`new Set()` immutability pattern. Tailwind CSS v4 is used throughout with established color tokens (green-400/yellow-400/red-400/muted-foreground). The `ToolLog.tsx` already uses `useMemo` for filtering, making time filter addition straightforward. The `/api/sessions` endpoint already accepts `date_from`/`date_to` query params.

The chart library decision is left to Claude's discretion. **Chart.js** (via `react-chartjs-2`) is already referenced in the project description and is already in the npm registry. However, the project currently has NO chart library installed — the Insights tab will require installing one. Recharts is lighter and better suited to React component composition patterns used throughout this codebase.

**Primary recommendation:** Add `timeFilter` state to the Zustand store, extend `ToolLog` `useMemo` with timestamp window filtering, split `AgentTree` into active/inactive sections with localStorage-persisted collapse, add an Insights tab with a charting library, and add quick-filter buttons to HistoryPage. All frontend-only changes.

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI framework | Project foundation |
| Zustand | ^5.0.11 | State management | Already used for all filter/agent/event state |
| Tailwind CSS | ^4.2.1 | Styling | Established design system in project |
| @tanstack/react-virtual | ^3.13.19 | ToolLog virtualization | Already in use, scales with filtered results |
| lucide-react | ^0.576.0 | Icons | Already installed — use for filter button icons |

### Chart Library (must be installed)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| recharts | ^2.15.x | Insights tab charts | Best React integration via composable components, small bundle (~150KB), TypeScript types included. Better than Chart.js for React component model. |

**Installation:**
```bash
npm install recharts
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | react-chartjs-2 + chart.js | Chart.js is canvas-based, less composable in React. Recharts SVG-based, easier to style with Tailwind-adjacent patterns. |
| recharts | victory | Victory is heavier, less maintained. Recharts is actively maintained. |
| recharts | plotly.js | Plotly is massive (~3MB). Overkill for cost trend charts. |

---

## Architecture Patterns

### Recommended Project Structure Changes
```
frontend/src/
├── store/
│   └── useObservStore.ts       # Add timeFilter state + action
├── hooks/
│   └── useSessionFilter.ts     # Extend for time filter if needed
├── components/
│   ├── agents/
│   │   └── AgentTree.tsx       # Split active/inactive sections + time filter buttons
│   ├── log/
│   │   └── ToolLog.tsx         # Extend useMemo with time window filtering
│   ├── insights/               # NEW folder
│   │   └── InsightsPanel.tsx   # New Insights tab component
│   └── timeline/
│       └── TimelineWaterfall.tsx  # Unchanged
├── pages/
│   ├── LiveDashboard.tsx       # Add 'insights' tab, widen agent tree
│   └── HistoryPage.tsx         # Add quick-filter buttons
```

### Pattern 1: Time Filter State in Zustand

**What:** Add `timeFilter` as a store property, with `setTimeFilter` action. `ToolLog` reads it in `useMemo`.

**When to use:** Any component that needs to react to filter changes subscribes via `useObservStore(s => s.timeFilter)`.

```typescript
// In useObservStore.ts — extend ObservStore interface
type TimeFilter = '5m' | '15m' | '1h' | 'all'

interface ObservStore {
  // ... existing ...
  timeFilter: TimeFilter

  // Actions
  setTimeFilter(filter: TimeFilter): void
}

// Initial state
timeFilter: 'all',

// Action
setTimeFilter(filter) {
  set({ timeFilter: filter })
},
```

### Pattern 2: Time-Window Filtering in ToolLog useMemo

**What:** Compose time filter on top of existing session/agent filter in ToolLog's `useMemo`.

**When to use:** Filtering is purely client-side — all events are already in store memory. No API call needed.

```typescript
// In ToolLog.tsx — extend existing useMemo
const timeFilter = useObservStore((s) => s.timeFilter)

const events = useMemo(() => {
  const windowMs: Record<string, number> = {
    '5m':  5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h':  60 * 60 * 1000,
  }
  const cutoffTs = timeFilter !== 'all' ? Date.now() - windowMs[timeFilter] : 0

  let filtered = allEvents
  if (activeAgentFilter) {
    filtered = filtered.filter((e) => e.agent_id === activeAgentFilter)
  } else if (activeSessionFilter) {
    filtered = filtered.filter((e) => e.session_id === activeSessionFilter)
  }
  if (cutoffTs > 0) {
    filtered = filtered.filter((e) => e.timestamp >= cutoffTs)
  }
  return filtered
}, [allEvents, activeSessionFilter, activeAgentFilter, timeFilter])
```

**Key insight:** `e.timestamp` in `ToolEvent` is already a Unix ms timestamp. No parsing needed.

### Pattern 3: Active/Inactive Agent Split in AgentTree

**What:** Within each session's agent list, split into `activeAgents` (state === 'active') and `inactiveAgents` (idle/errored). Show active agents first at full opacity. Show inactive in a collapsible section at the end.

**When to use:** Always — this is the new default rendering for AgentTree.

```typescript
// In AgentTree.tsx — split per-session agents
const activeAgents = sessionAgents.filter((a) => a.state === 'active')
const inactiveAgents = sessionAgents.filter((a) => a.state !== 'active')

// Render active agents normally (full color)
// Then render inactive section:
const LS_INACTIVE_KEY = 'observagent:inactive-collapsed'
// Use same localStorage pattern as collapsedSessions
```

**Inactive row styling:**
```typescript
// De-emphasize inactive agents
className="opacity-50 hover:opacity-75 transition-opacity"
```

### Pattern 4: Quick Filter Buttons

**What:** Small rounded toggle-style buttons, consistent styling across AgentTree sidebar (for tool log) and HistoryPage (for sessions).

**When to use:** Both AgentTree.tsx and HistoryPage.tsx — shared visual pattern.

```typescript
// Reusable button pattern — inline in each component (no need for separate component)
function TimeFilterButton({
  label, value, active, onClick
}: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors border',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
```

### Pattern 5: LiveDashboard Agent Tree Width

**What:** Change `w-56` (fixed 224px) to a flex-basis percentage to give agent tree ~35% width.

**When to use:** The current 3-column layout uses `w-56 shrink-0` for both sidebars.

```typescript
// In LiveDashboard.tsx — Col 1 change
// Before:
<div className="w-56 shrink-0 border-r border-border flex flex-col overflow-y-auto">

// After: use flex-basis for percentage
<div className="shrink-0 border-r border-border flex flex-col overflow-y-auto" style={{ flexBasis: '35%', minWidth: '200px', maxWidth: '400px' }}>
```

**Note:** Right sidebar (Col 3) should remain `w-56` (224px fixed) since it's compact metrics. Only the agent tree gets wider.

### Pattern 6: Insights Panel with Recharts

**What:** New `InsightsPanel.tsx` component that shows cost breakdown bar chart and latency line chart using Recharts.

**Data sources:**
- Cost by model: `useObservStore(s => s.costModels)` — already populated from `/api/cost`
- Cost by session: `useObservStore(s => s.sessionCosts)` — already populated
- Latency data: computed from `useObservStore(s => s.events)` — filter PreToolUse events with `duration_ms !== null`, derive p50/p95

```typescript
// InsightsPanel.tsx — p50/p95 calculation
function computeLatencyPercentiles(events: ToolEvent[]) {
  const durations = events
    .filter((e) => e.hook_type === 'PreToolUse' && e.duration_ms !== null)
    .map((e) => e.duration_ms as number)
    .sort((a, b) => a - b)
  if (durations.length === 0) return { p50: 0, p95: 0 }
  const p50 = durations[Math.floor(durations.length * 0.5)]
  const p95 = durations[Math.floor(durations.length * 0.95)]
  return { p50, p95 }
}
```

```typescript
// Recharts BarChart for cost by model
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

<ResponsiveContainer width="100%" height={180}>
  <BarChart data={costModels}>
    <XAxis dataKey="model" tick={{ fontSize: 10 }} />
    <YAxis tick={{ fontSize: 10 }} />
    <Tooltip formatter={(v: number) => `$${v.toFixed(4)}`} />
    <Bar dataKey="cost" fill="#4ade80" radius={[2, 2, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Pattern 7: HistoryPage Time Filtering

**What:** Add quick-filter buttons at top of HistoryPage. Filter client-side by comparing `last_event_ts` to a cutoff time — no backend change needed.

**Data available:** `sessions` is already fetched via `/api/sessions`. The `last_event_ts` field is an ISO datetime string in each `SessionSummary`.

```typescript
// In HistoryPage.tsx — add filter state
type HistoryTimeFilter = '15m' | '1h' | '24h' | 'all'
const [historyTimeFilter, setHistoryTimeFilter] = useState<HistoryTimeFilter>('all')

// Filtered sessions
const filteredSessions = useMemo(() => {
  if (historyTimeFilter === 'all') return sessions
  const windowMs: Record<HistoryTimeFilter, number> = {
    '15m': 15 * 60 * 1000,
    '1h':  60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    'all': 0,
  }
  const cutoff = Date.now() - windowMs[historyTimeFilter]
  return sessions.filter((s) => new Date(s.last_event_ts).getTime() >= cutoff)
}, [sessions, historyTimeFilter])

// Then replace `sessions` with `filteredSessions` in grouped useMemo
```

### Anti-Patterns to Avoid

- **Filtering via API call on every button click:** The `/api/sessions` endpoint accepts `date_from`/`date_to` params, but this adds network latency. Since sessions are already fetched once, client-side filtering is instant and preferred for quick-filter buttons.
- **Adding `timeFilter` to URL search params:** Time filter state is ephemeral. Unlike session/agent filter (which goes to URL for deep linking), time filter does not need URL persistence. Keep it in store only.
- **Modifying live SSE event ingestion for time filtering:** SSE events (`appendEvent`) must always append regardless of active time filter. The filter is applied only at render time in `ToolLog`'s `useMemo`. Never filter at the `appendEvent` level.
- **Using `Date.now()` in `useMemo` without a tick:** The time window cutoff is calculated as `Date.now() - windowMs`. Since `Date.now()` is called at render time, the filter is accurate at render but does not auto-refresh every second. For quick filters at 5min/15min scale, this is acceptable — events arriving via SSE trigger re-renders which recalculate the cutoff.
- **Forgetting Zustand `new Map()` pattern for agents:** Always create `new Map(s.agents)` before mutating agent state. The store already follows this consistently; new actions must follow the same pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cost/latency charts | Custom SVG chart | recharts | Responsive container, tooltip, axis tick handling, animation — all covered |
| Percentile computation | Custom library | Native array sort + index math | Simple math, no library needed for p50/p95 |
| localStorage collapse state | Custom persistence hook | Same pattern as `LS_KEY = 'observagent:collapsed-sessions'` in AgentTree | Pattern already established, just add a new key |
| Time window calculation | Date library (date-fns, dayjs) | `Date.now() - windowMs` | Simple arithmetic, no library needed |
| Filter button group | shadcn ToggleGroup | Inline styled `<button>` elements | Simpler, consistent with existing filter UI patterns. Project uses shadcn only for Card/Badge/Tooltip. |

**Key insight:** This phase is a UI composition task. All state, data, and filtering math is simple arithmetic on existing in-memory data. No new backend APIs needed. Avoid over-engineering with extra libraries.

---

## Common Pitfalls

### Pitfall 1: Time Filter Drift on Long-Running Sessions
**What goes wrong:** A user sets "Last 5min" filter, then leaves the dashboard open. Events from 5 minutes ago slowly fall off as `Date.now()` advances, but the ToolLog doesn't re-compute unless an event triggers a render.
**Why it happens:** `useMemo` only recomputes when its dependencies change. `Date.now()` called inside `useMemo` captures the time at last render.
**How to avoid:** Accept this behavior for quick-filter use case (SSE events trigger re-renders frequently during active sessions). For idle sessions, add a 30-second interval ticker in `ToolLog` to force re-computation: `const [tick, setTick] = useState(0)` + `setInterval(() => setTick(t => t+1), 30_000)` in a `useEffect`, then include `tick` in `useMemo` deps.
**Warning signs:** User sets 5min filter during an active session, then no new events arrive — old events remain visible past the window.

### Pitfall 2: Inactive Section Causing Layout Shift in AgentTree
**What goes wrong:** The `<details>` element used for the Inactive section opens/closes with native browser animation (none by default) — but adding CSS transitions to `<details>` content height is tricky.
**Why it happens:** `details`/`summary` content doesn't animate natively with CSS `max-height` without JS.
**How to avoid:** Use the native `<details>` element for collapse (same as existing session groups) without animation — consistent with the rest of AgentTree. The CONTEXT.md explicitly delegates animation timing to Claude's discretion — keep it simple with no animation.

### Pitfall 3: recharts Responsive Container Inside Flex Column
**What goes wrong:** `<ResponsiveContainer width="100%" height={180}>` inside a flex column with unknown height renders at 0px or overflows.
**Why it happens:** Recharts `ResponsiveContainer` needs a parent with explicit height or `flex: 1` with a defined row height.
**How to avoid:** Always wrap `ResponsiveContainer` in a `div` with an explicit height: `<div style={{ height: 180 }}><ResponsiveContainer width="100%" height="100%">`. Verified pattern from recharts docs.

### Pitfall 4: Filter Buttons Not Clearing Correctly
**What goes wrong:** User clicks "All" after "Last 5min" but stale `activeAgentFilter` still narrows events before time filter runs, resulting in confusing "no events" state.
**Why it happens:** Filters stack: time AND session AND agent. When all filters are "All", result should show everything.
**How to avoid:** "All" for time filter sets `timeFilter: 'all'`, resulting in `cutoffTs = 0` and no time filtering. The existing session/agent filters are independent — "All" for time does not clear them. This is correct behavior. Document this stacking clearly in component comments.

### Pitfall 5: Agent Tree Width Breaking Responsive Layout at Small Viewports
**What goes wrong:** Setting `flex-basis: 35%` for agent tree means on a 1024px viewport, agent tree is 358px and log area has only ~388px — may cause ToolLog virtualized rows to measure incorrectly on first render.
**Why it happens:** `@tanstack/react-virtual` measures items after mount. Layout shifts can cause scroll position bugs.
**How to avoid:** Add `minWidth: '200px'` and `maxWidth: '400px'` to agent tree. ToolLog virtualizer already uses `measureElement` for dynamic row heights — it recovers from layout shifts correctly.

---

## Code Examples

### Time Filter Buttons in AgentTree Sidebar

```typescript
// Place below the "Agents" header row, above AgentTree
const TIME_FILTER_OPTIONS = [
  { label: '5m',  value: '5m'  as const },
  { label: '15m', value: '15m' as const },
  { label: '1h',  value: '1h'  as const },
  { label: 'All', value: 'all' as const },
]

// In LiveDashboard.tsx Col 1:
<div className="px-2 py-1 border-b border-border flex flex-wrap gap-1">
  {TIME_FILTER_OPTIONS.map(({ label, value }) => (
    <button
      key={value}
      onClick={() => setTimeFilter(value)}
      className={[
        'px-2 py-0.5 rounded text-[10px] font-medium transition-colors border',
        timeFilter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  ))}
</div>
```

### Insights Tab Addition to LiveDashboard

```typescript
// Extend ActiveTab type
type ActiveTab = 'log' | 'timeline' | 'insights'

// Tab bar — add 'insights' button following existing pattern
// Panel content:
{activeTab === 'insights' ? (
  <div className="flex-1 overflow-auto p-3">
    <InsightsPanel />
  </div>
) : activeTab === 'log' ? (
  <ToolLog />
) : (
  <div className="flex-1 overflow-auto p-2">
    <TimelineWaterfall />
  </div>
)}
```

### Recharts Bar Chart for Cost by Model

```typescript
// Source: recharts.org documentation
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

function CostByModelChart({ models }: { models: ModelCost[] }) {
  const data = models.map((m) => ({
    name: m.model.split('/').at(-1) ?? m.model,
    cost: m.cost,
  }))

  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
          <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} width={40} />
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
            contentStyle={{ fontSize: 10, background: 'var(--popover)', border: '1px solid var(--border)' }}
          />
          <Bar dataKey="cost" fill="#4ade80" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### Session History Quick Filters

```typescript
// In HistoryPage.tsx — add above Card grid
const HISTORY_FILTERS = [
  { label: 'Last 15m', value: '15m' as const },
  { label: 'Last 1h',  value: '1h'  as const },
  { label: 'Last 24h', value: '24h' as const },
  { label: 'All',      value: 'all' as const },
]

<div className="flex items-center gap-2 mb-3">
  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Show:</span>
  {HISTORY_FILTERS.map(({ label, value }) => (
    <button
      key={value}
      onClick={() => setHistoryTimeFilter(value)}
      className={[
        'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
        historyTimeFilter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  ))}
</div>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Fixed `w-56` for agent tree | `flex-basis: 35%` with min/max constraints | Agent tree gets proper proportional width |
| All agents mixed together | Active agents up top, inactive in collapsible section | Reduces cognitive load during multi-agent runs |
| No time filtering on tool log | Quick-filter buttons composing with existing session/agent filter | Faster signal-to-noise during long sessions |
| Cost stats only in right sidebar | Full Insights tab with charts | Matches DataDog/Grafana aesthetic for observability |

---

## Open Questions

1. **DASH2-04: Is the context fill % bar already working?**
   - What we know: `CostPanel.tsx` lines 121-139 show a working `contextFillPct` bar. `setContextFillPct` is called in `useSSE.ts` on `cost_update` events (line 145-147). CALC-01 fix shipped in Phase 8.
   - What's unclear: Whether `contextFillPct` ever receives a value in practice (depends on live SSE `cost_update` events including `contextFillPct` field). State.md says "CALC-01 resolved in Plan 04" — the bar should be functional.
   - Recommendation: Verify during implementation by checking SSE event payloads include `contextFillPct`. If it's showing 0 constantly, check relay.py for `contextFillPct` field emission.

2. **Agent tree `activeAgentCount` badge placement**
   - What we know: Currently shown in the "Agents" header in `LiveDashboard.tsx`. After the Inactive section redesign, active count remains relevant.
   - What's unclear: Should the count badge move to the active section header within AgentTree, or stay in the LiveDashboard sidebar header?
   - Recommendation: Keep in LiveDashboard header where it is — it serves as a global status indicator, not a section count.

3. **Recharts CSS variable theming**
   - What we know: Recharts uses inline SVG `fill` attributes. The codebase uses CSS custom properties via Tailwind v4 (`var(--muted-foreground)`, etc.).
   - What's unclear: Whether Recharts `tick.fill` accepts CSS variable strings as values.
   - Recommendation: Use hardcoded hex values for chart colors that match the Tailwind palette: green `#4ade80` (green-400), muted `#6b7280` (gray-500). Tooltip can use inline `var()` syntax for background/border since it's a DOM div.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `/frontend/src/` — all existing patterns verified by reading actual source files
- `/routes/api.js` — confirmed `/api/sessions` accepts `date_from`/`date_to` params, `/api/cost` returns `models` array, `/api/events` exists
- `/frontend/package.json` — confirmed installed dependencies (recharts NOT installed, must be added)
- `/frontend/src/store/useObservStore.ts` — confirmed store shape, `timeFilter` not yet present
- `/frontend/src/components/log/ToolLog.tsx` — confirmed `useMemo` filter pattern, `e.timestamp` is Unix ms

### Secondary (MEDIUM confidence)
- Recharts documentation pattern for `ResponsiveContainer` + `BarChart` — consistent with official recharts docs style
- Tailwind v4 CSS variable pattern for tooltip theming — consistent with project's established approach

### Tertiary (LOW confidence)
- Recharts CSS variable support in `tick.fill` attribute — unverified; hardcoded hex values recommended as safe fallback

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct package.json inspection, all libraries confirmed
- Architecture: HIGH — all patterns derived from existing code in the repo
- Pitfalls: MEDIUM — derived from code analysis + common React/recharts patterns
- Time filter logic: HIGH — `ToolEvent.timestamp` is Unix ms, arithmetic is simple

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (30 days — stable libraries, internal codebase)
