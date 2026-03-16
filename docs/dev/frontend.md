# Frontend

**Location:** `frontend/src/`
**Build output:** `public/dist/` (committed and shipped in the npm package)
**Framework:** React 18 + TypeScript + Vite
**State:** Zustand
**Routing:** React Router v7 (`BrowserRouter`)
**UI:** Tailwind CSS + shadcn/ui primitives
**Charts:** Recharts
**Virtualization:** `@tanstack/react-virtual`

Dark mode is forced on load by adding `class="dark"` to `<html>`.

---

## Building

```bash
cd frontend
npm install
npm run build   # outputs to ../public/dist/
```

The build output is committed to the repo and included in the npm package via the `"public/"` entry in `package.json#files`. End users get the pre-built SPA — they do not need to install the frontend dependencies.

---

## Routes

| URL | Component | Description |
|---|---|---|
| `/` | redirect | Redirects to `/live` |
| `/live` | `LiveDashboard` | Real-time agent + tool monitoring |
| `/history` | `HistoryPage` | Session history with filtering and export |

---

## Pages

### `pages/LiveDashboard.tsx`

Three-column layout:

```
┌──────────────┬──────────────────────────┬────────────────┐
│  Agent Tree  │  Log / Timeline /        │  Cost Panel    │
│              │  Insights tabs           │                │
│              │                          │  Health Panel  │
└──────────────┴──────────────────────────┴────────────────┘
```

**On mount:**
1. `GET /api/events` (or `?session_id={replayId}` in replay mode)
2. `GET /api/cost`
3. `GET /api/config`
4. `GET /api/agents` (skipped in replay mode)
5. Restore `?session=` and `?agent=` URL params into store
6. `GET /api/meta` for version badge

**Replay mode:** activated by `?replay={sessionId}` URL param. Skips SSE, fetches only that session's events, hides the Agent Tree session filter.

**On-demand loading:** when `activeSessionFilter` changes to a session not in memory, fetches that session's events via `GET /api/events?session_id=` and calls `store.mergeEvents()`.

**Time filter strip:** `5m`, `15m`, `1h`, `All` — filters the tool log display without affecting fetched data.

---

### `pages/HistoryPage.tsx`

Displays all sessions grouped by project name.

**On mount:** `GET /api/sessions`

**Filtering:**
- Quick buttons: Last 15m / 1hr / 24hr / All
- Date range pickers (override quick buttons)
- Groups sessions by `project_name` using a `Map`, sorted by `last_event_ts DESC`

**Per-session actions:**
- Expand row to see full `session_id`, `project_name`, `last_event_ts`
- **Export JSONL / CSV** — calls `GET /api/sessions/:id/export` and triggers a file download
- **Replay** — navigates to `/live?replay={session_id}`

---

## Components

### `components/agents/AgentTree.tsx`

Left column of `LiveDashboard`. Hierarchical tree: repo group → session → agent.

**Collapsible state** is persisted to `localStorage`:
- Repo groups: `observagent:collapsed-repos`
- Sessions within repos: `observagent:collapsed-sessions`
- Inactive agents: `observagent:inactive-collapsed`

**Per-agent display:**
- Colored dot: green = active, red = errored (any `exit_status = 1` in last 5 min), dark = idle
- Label: `{agentType} [{last4 of agentId}]`
- Current tool badge (last `PreToolUse` tool name)
- Idle badge: shows orange `idle {N}s` after 60 seconds of inactivity
- Cost and token counts

**Interaction:** clicking a session sets `?session=` URL param; clicking an agent sets both `?session=` and `?agent=` URL params. This updates Zustand store and triggers filtered data loads.

---

### `components/log/ToolLog.tsx`

Center column, "Log" tab. Virtualized event list.

- Uses `@tanstack/react-virtual` with estimated row height 28px
- Filters by `activeSessionFilter`, `activeAgentFilter`, and `timeFilter`
- Time filter ticks every 30 seconds to keep the cutoff current
- Events displayed **newest first** (reverse chronological)

### `components/log/ToolLogRow.tsx`

Single event row: tool color swatch, HH:MM:SS timestamp, tool name, duration (color-coded), exit status badge, tool summary text.

---

### `components/timeline/TimelineWaterfall.tsx`

Center column, "Timeline" tab. Gantt-style horizontal chart.

- Only shows `PreToolUse` events with `duration_ms > 0`
- Groups by `session_id` — each session is a swimlane
- Bar position: `(timestamp - minTs) / totalMs * 100%`
- Bar width: proportional to `duration_ms`, minimum 4%
- Minimum bar width prevents invisible bars for fast tool calls
- X-axis: 5 labels at 0%, 25%, 50%, 75%, 100%

**Tool color coding:**

| Tool | Color |
|---|---|
| `Read` | Cyan |
| `Write` | Green |
| `Bash` | Orange |
| `Edit`, `MultiEdit` | Bright green |
| `Glob`, `Grep` | Cyan |
| `Task` | Orange |

---

### `components/cost/CostPanel.tsx`

Right column, top section.

**Budget alert:** red border warning box shown when:
- `total_cost_usd >= budget_threshold_usd`, or
- `contextFillPct >= ctx_fill_threshold_pct`

**Displays:**
- Active session cost (large orange number, live-updating via SSE)
- Today's total cost
- Token breakdown: input / output / cache read / cache write (K/M formatted)
- Context fill progress bar: cyan→green below 80%, red above 80%
- Budget threshold inputs (cost in USD, context in %) — POSTs to `POST /api/config` with 500ms debounce

---

### `components/health/HealthPanel.tsx`

Right column, bottom section.

- SSE connection status dot (green = connected, red = disconnected)
- Last event time (relative, refreshes every 5 seconds)
- Total tool calls, error count, error rate
- Server uptime (fetched once from `GET /api/health` on mount)

---

### `components/insights/InsightsPanel.tsx`

Center column, "Insights" tab. Three sub-tabs.

**Cost tab:**
- 7-day cost trend (AreaChart) — from `GET /api/insights/cost-daily`
- Cost by agent type (BarChart) — from `GET /api/insights/cost-by-agent`
- Cost by model (BarChart) — from `sessionCosts` store state
- Cost by session top 10 (BarChart) — from `sessionCosts` store state
- Tool call latency p50/p95/count — computed client-side from events in store

**Activity tab:** (re-polls every 30s)
- Tool call activity per minute (AreaChart) — from `GET /api/insights/activity?session_id=`
- Token burn rate per minute — input + output series (AreaChart) — from `GET /api/insights/tokens-over-time?session_id=`

**Health tab:** (re-polls every 30s)
- Stalled agents list — from `GET /api/insights/stalled-agents`; tab title shows count badge
- Error rate per 5-minute bucket (AreaChart) — from `GET /api/insights/error-rate?session_id=`
- Latency by tool p50/p95 (grouped BarChart) — from `GET /api/insights/latency-by-tool?session_id=`

---

## Zustand store (`store/useObservStore.ts`)

Single store for all app state. Key slices:

| Key | Type | Description |
|---|---|---|
| `agents` | `Map<string, Agent>` | All known agents keyed by `agentId` |
| `sessions` | `Map<string, Session>` | Sessions with `children[]` array |
| `events` | `ToolEvent[]` | All tool events, oldest first |
| `activeSessionFilter` | `string\|null` | Currently selected session |
| `activeAgentFilter` | `string\|null` | Currently selected agent |
| `sessionCosts` | `CostStateEntry[]` | Per-session cost data, most-recently-updated first |
| `todayCost` | `number` | Sum of today's session costs |
| `config` | `Config\|null` | Budget thresholds |
| `health` | `HealthState\|null` | Health metrics from SSE |
| `sseConnected` | `boolean` | SSE connection state |
| `contextFillPct` | `number` | Latest context fill % from `cost_update` SSE |
| `timeFilter` | `'5m'\|'15m'\|'1h'\|'all'` | Tool log time window |

**Key actions:**
- `appendEvent(event)` — adds to `events[]`; updates `agents` current tool
- `updateEventDuration(tool_call_id, duration_ms, exit_status)` — patches the matching `PreToolUse` event when `PostToolUse` arrives
- `mergeEvents(events)` — merges on-demand loaded events without duplicates
- `hydrateEvents(events)` — replaces events on initial load or session switch
- `updateSessionCost(data)` — upserts `sessionCosts` entry; recomputes `todayCost`
- `setSessionFilter(id)` / `setAgentFilter(id)` — updates filter and syncs URL params

---

## SSE hook (`hooks/useSSE.ts`)

Manages the `EventSource('/events')` connection (skipped in replay mode).

| SSE `type` | Store action |
|---|---|
| `agent_spawn` | `addAgent(...)` |
| `agent_update` | `updateAgentState(...)` |
| `cost_update` | `setContextFillPct`, `updateAgentCost`, `updateSessionCost` |
| `health_update` | `setHealth(...)` |
| `PreToolUse` event | `appendEvent(...)`, `updateAgentCurrentTool(...)` |
| `PostToolUse` event | `updateEventDuration(tool_call_id, duration_ms, exit_status)` |

On disconnect, reopens `EventSource` automatically.

---

## URL param sync (`hooks/useSessionFilter.ts`)

Thin hook that bidirectionally syncs Zustand filter state with `?session=` and `?agent=` URL search params. Allows sharing a link to a specific session view and preserving selection on page refresh.

---

## Utility functions (`utils/format.ts`)

| Function | Output |
|---|---|
| `formatTs(ms)` | `HH:MM:SS` |
| `formatDuration(ms)` | `342ms` or `3.4s` |
| `latencyClass(ms)` | `'green'` < 500ms, `'yellow'` < 2s, `'red'` otherwise |
| `formatCost(usd)` | `$0.042` |
| `formatTokens(n)` | `45.2K` or `1.2M` |
| `formatTokensCompact(n)` | Shorter variant |
| `formatRelativeTime(ts)` | `2m ago`, `just now`, etc. |
| `formatUptime(s)` | `1h 2m 3s` |
| `formatIdle(s)` | `idle 72s` |

---

## TypeScript types (`types/index.ts`)

```ts
type ToolEvent = {
  id: number;
  tool_name: string;
  hook_type: string;
  session_id: string;
  agent_id: string | null;
  tool_call_id: string | null;
  timestamp: number;
  duration_ms: number | null;
  exit_status: number | null;
  tool_summary: string | null;
  nearest_input_tokens: number | null;
  nearest_output_tokens: number | null;
};

type Agent = {
  agentId: string;
  parentSessionId: string;
  agentType: string;
  state: 'active' | 'completed' | 'stale' | 'interrupted';
  lastActivityTs: number;
  cost: number;
  tokens: number;
  currentTool: string | null;
};

type CostStateEntry = {
  sessionId: string;
  agentId: string;
  cost: number;
  projectName: string;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextFillPct: number;
  model: string;
  ts: number;
};
```
