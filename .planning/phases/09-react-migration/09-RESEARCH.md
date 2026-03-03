# Phase 9: React Migration - Research

**Researched:** 2026-03-03
**Domain:** React 18 + Vite + shadcn/ui + Zustand + TanStack Virtual — migrating a 2300-line vanilla JS dashboard to a typed, componentized SPA
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Both `index.html` and `history.html` migrate to React in Phase 9 — no mixed codebase
- Single SPA with React Router: `/live` = live dashboard, `/history` = session history browser
- Active session filter is URL-reflected (e.g., `/live?session=abc123`) — shareable and survives refresh
- Export (JSONL/CSV) stays on the history page `/history` — consistent with current behavior
- Use **shadcn/ui + Tailwind CSS** — not a mechanical port of existing CSS
- Phase 9 can look better: use shadcn components fully (cards, badges, tooltips, etc.) throughout
- **Dark theme only** — no light/dark toggle; keep the terminal/dev-tool aesthetic
- Status color semantics preserved (green = active, yellow = idle, red = error) but exact hex values adapted to fit the shadcn dark theme palette
- Tool log uses **compact list rows** (not cards) — dense, fast-scrolling, same feel as current
- **Zustand** for global store — agent tree, cost state, SSE events, active session filter all in one store
- **Custom `useSSE` hook** manages EventSource lifecycle and dispatches messages into Zustand store — components read from store, no direct SSE dependency
- **TanStack Virtual** for tool log virtualization — handles 1000+ rows without DOM bloat
- **Plain `useEffect` + `fetch`** for initial data load — no React Query; SSE handles real-time, initial fetch is one-shot
- **Vite dev server** (port 5173) with proxy to Fastify (port 3000 or whatever is configured)
- React source code lives in `frontend/` directory at project root (`frontend/src/`, `frontend/vite.config.ts`, `frontend/package.json`)
- Vite builds to `public/dist/` — Fastify continues serving from `public/` with minimal changes
- `public/index.html` and `public/history.html` kept as **fallback** (accessible at `/legacy` route) — not deleted after React ships

### Claude's Discretion
- React component file/folder structure within `frontend/src/`
- Zustand store slice organization (single store vs named slices)
- Exact TanStack Virtual implementation details
- How Fastify's static handler is updated to serve `public/dist/index.html` as the SPA root
- Toast notification implementation in React

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-01 | Dashboard migrates from vanilla JS to React (Vite + React) while preserving all existing v1.0 and Phase 8 functionality — feature parity required before new Phase 10 UI is built on top | Full stack researched: Vite 6 + React 18 + shadcn/ui + Zustand + TanStack Virtual + React Router v7 + @fastify/static SPA serving pattern |
</phase_requirements>

---

## Summary

Phase 9 rebuilds ObservAgent's 2300-line vanilla JS dashboard (index.html + history.html) as a single React SPA. The existing Fastify backend — SSE endpoint at `/events`, REST endpoints at `/api/*` — is untouched. The migration is a pure frontend concern: move logic from imperative DOM manipulation into React components backed by a Zustand store.

The locked stack (Vite + React 18, shadcn/ui + Tailwind CSS v4, Zustand 5, TanStack Virtual 3, React Router v7 declarative mode) is well-supported and standard in 2026. Every element of the stack has clear documentation, active maintenance, and a direct mapping to the existing vanilla JS logic. The main risk areas are: (1) correctly proxying SSE through Vite's dev server (requires `X-Accel-Buffering: no` header from backend or explicit proxy bypass), (2) the Fastify static server SPA fallback pattern to serve `public/dist/index.html` for all non-API routes, and (3) TanStack Virtual integration with the tool log's mixed PreToolUse/PostToolUse "live-update-in-place" row model.

The migration path is direct: the existing vanilla JS logic maps cleanly to React components. Format utilities become `utils/format.ts`. The agent tree state machine becomes a Zustand store. SSE subscription becomes a `useSSE` hook. DOM-building functions (`createRow`, `renderAgentTree`, `renderTimeline`) become React components. Phase 8 tool enrichment (tool_summary second line, token badge) carries forward as component props.

**Primary recommendation:** Bootstrap `frontend/` with `npm create vite@latest frontend -- --template react-ts`, then immediately install shadcn/ui (Tailwind v4 path), Zustand 5, TanStack Virtual, and React Router. Wire the Vite proxy before writing any components to unblock dev iteration against the live Fastify backend.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 6.x | Build tool, dev server, proxy | Industry standard for React SPAs; sub-second HMR; first-class TypeScript |
| React | 18.x | UI framework | Locked decision; component model replaces imperative DOM |
| TypeScript | 5.x | Type safety | Required by Vite react-ts template; shadcn/ui components are typed |
| React Router | 7.x (declarative) | Client-side routing | `/live` and `/history` routes + `useSearchParams` for URL-reflected session filter |
| Zustand | 5.x (latest: 5.0.11) | Global state management | Locked decision; no context provider overhead; selector-based subscriptions prevent unnecessary re-renders |
| @tanstack/react-virtual | 3.x (latest: 3.13.19) | Tool log virtualization | Locked decision; handles 1000+ rows at 60fps; headless (works with any markup) |
| shadcn/ui | latest (canary for Tailwind v4) | Component library | Locked decision; copy-paste components, full dark mode control, no runtime bundle overhead |
| Tailwind CSS | 4.x | Utility CSS | Required by shadcn/ui; v4 moves config to CSS-only (no tailwind.config.js) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitejs/plugin-react | 4.x | JSX/React support in Vite | Required by all React + Vite projects |
| @tailwindcss/vite | 4.x | Tailwind v4 Vite plugin | Replaces postcss setup used in Tailwind v3; simpler setup |
| tw-animate-css | latest | CSS animations for shadcn/ui | shadcn deprecated tailwindcss-animate in favor of tw-animate-css for Tailwind v4 |
| @types/node | 20+ | Node types for path.resolve in vite.config | Required for path alias setup |
| @fastify/static | 8.x | Serve React build from Fastify | SPA fallback pattern; version 8.x supports Fastify 5.x |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| React Router v7 (declarative) | React Router v7 (framework/data) | Framework mode adds file-based routing complexity; declarative is simpler for 2-route SPA |
| Zustand | Jotai, Redux Toolkit | Zustand is locked; simpler API for this use case; atom-based libs suit different patterns |
| TanStack Virtual | react-window, react-virtuoso | TanStack Virtual is locked; headless approach fits shadcn/ui custom row markup |
| Tailwind v4 + shadcn | Tailwind v3 + shadcn | v4 simplifies config; official shadcn install path targets v4 as of 2026 |

**Installation:**
```bash
# Bootstrap Vite React TypeScript project
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install

# Core routing and state
npm install react-router zustand @tanstack/react-virtual

# Tailwind v4 (via Vite plugin)
npm install tailwindcss @tailwindcss/vite

# Types for vite.config.ts path alias
npm install -D @types/node

# shadcn/ui init (run after Tailwind setup)
npx shadcn@latest init

# Add components used in the dashboard
npx shadcn@latest add badge card tooltip

# Animation library (shadcn Tailwind v4 requirement)
npm install tw-animate-css
```

---

## Architecture Patterns

### Recommended Project Structure
```
frontend/
├── package.json              # separate npm workspace for frontend
├── vite.config.ts            # proxy + build.outDir = '../public/dist'
├── tsconfig.json             # baseUrl + paths for @/* alias
├── tsconfig.app.json         # same baseUrl + paths
├── index.html                # Vite entry HTML
└── src/
    ├── main.tsx              # React root, BrowserRouter, dark mode class
    ├── App.tsx               # Routes: /live, /history
    ├── store/
    │   └── useObservStore.ts # Single Zustand store (all state)
    ├── hooks/
    │   └── useSSE.ts         # EventSource lifecycle hook
    ├── utils/
    │   └── format.ts         # Port of formatTs, formatDuration, formatCost, etc.
    ├── components/
    │   ├── layout/
    │   │   └── DashboardLayout.tsx
    │   ├── agents/
    │   │   └── AgentTree.tsx
    │   ├── log/
    │   │   ├── ToolLog.tsx       # TanStack Virtual container
    │   │   └── ToolLogRow.tsx    # Individual row with tool_summary + token badge
    │   ├── cost/
    │   │   └── CostPanel.tsx
    │   ├── health/
    │   │   └── HealthPanel.tsx
    │   └── timeline/
    │       └── TimelineWaterfall.tsx
    └── pages/
        ├── LiveDashboard.tsx   # /live route
        └── HistoryPage.tsx     # /history route
```

### Pattern 1: Vite Config with Proxy + Custom OutDir

**What:** Configure Vite to output built files to `../public/dist/` (relative to `frontend/` root) and proxy `/api` and `/events` to the Fastify backend in development.

**When to use:** Always — this is the cutover strategy for serving React from Fastify.

**Critical:** SSE requires `X-Accel-Buffering: no` response header from Fastify's SSE route to prevent proxy buffering. Without this, EventSource will appear to hang during development.

```typescript
// frontend/vite.config.ts
// Source: https://vite.dev/config/build-options + https://vite.dev/config/server-options
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const BACKEND_PORT = process.env.PORT ?? '4999'
const BACKEND = `http://127.0.0.1:${BACKEND_PORT}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/events': {
        target: BACKEND,
        changeOrigin: true,
        // SSE needs these to prevent proxy buffering
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'text/event-stream')
          })
        },
      },
    },
  },
  build: {
    outDir: '../public/dist',
    emptyOutDir: true,
  },
})
```

**Add to Fastify's SSE route** (`routes/sse.js`) to fix buffering in dev proxy:
```javascript
reply.raw.setHeader('X-Accel-Buffering', 'no')
```

### Pattern 2: Fastify SPA Static Serving

**What:** Update `routes/dashboard.js` to serve `public/dist/index.html` for all non-API routes via `@fastify/static` with wildcard fallback.

**When to use:** Production cutover — replaces the current `readFileSync` serving of vanilla HTML.

```javascript
// routes/dashboard.js (updated)
// Source: https://github.com/fastify/fastify-static
import fastifyStatic from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function dashboardRoutes(fastify, options) {
  // Serve legacy vanilla HTML at /legacy (fallback per user decision)
  fastify.get('/legacy', (req, reply) => {
    reply.type('text/html').sendFile('index.html', join(__dirname, '../public'))
  })
  fastify.get('/legacy/history', (req, reply) => {
    reply.type('text/html').sendFile('history.html', join(__dirname, '../public'))
  })

  // Serve React SPA build — wildcard: false + notFoundHandler for SPA fallback
  fastify.register(fastifyStatic, {
    root: join(__dirname, '../public/dist'),
    wildcard: false,
    decorateReply: false, // avoid conflict if already registered
  })

  // Catch all — React Router handles client-side routing
  fastify.setNotFoundHandler((request, reply) => {
    // Don't catch /api/* or /events routes
    if (request.url.startsWith('/api') || request.url === '/events' || request.url.startsWith('/ingest')) {
      reply.callNotFound()
      return
    }
    reply.type('text/html').sendFile('index.html', join(__dirname, '../public/dist'))
  })
}
```

### Pattern 3: Zustand Store — Single Store Design

**What:** One Zustand store holds all dashboard state: events list, agent tree, session cost, active session filter, health data, SSE connection status.

**When to use:** Always — Zustand's selector system prevents unnecessary re-renders even with a large single store. Zustand 5 requires TypeScript double-parentheses `create<T>()()`.

```typescript
// src/store/useObservStore.ts
// Source: https://github.com/pmndrs/zustand (v5.0.11)
import { create } from 'zustand'

interface Agent {
  agentId: string
  parentSessionId: string
  agentType: string
  state: 'active' | 'idle' | 'errored'
  lastActivityTs: number
  cost: number
  tokens: number
}

interface ToolEvent {
  id: number
  tool_name: string
  hook_type: 'PreToolUse' | 'PostToolUse'
  session_id: string
  tool_call_id: string | null
  timestamp: number
  duration_ms: number | null
  exit_status: number | null
  tool_summary: string | null
  nearest_input_tokens: number | null
  nearest_output_tokens: number | null
}

interface ObservStore {
  // Agent tree
  agents: Map<string, Agent>
  sessions: Map<string, { sessionId: string; children: string[]; cost: number; tokens: number }>
  // Tool log (flat list, ordered chronological)
  events: ToolEvent[]
  inProgressMap: Map<string, string>  // tool_call_id -> event index tracking
  // Filters
  activeSessionFilter: string | null
  // Cost
  sessionCosts: unknown[]
  todayCost: number
  // Health
  health: { lastEventTs: number | null; totalCalls: number; errorCount: number; errorRate: number } | null
  // SSE status
  sseConnected: boolean
  // Actions
  addAgent: (agent: Omit<Agent, 'cost' | 'tokens'>) => void
  updateAgentState: (agentId: string, state: Agent['state'], ts: number) => void
  updateAgentCost: (agentId: string, cost: number, tokens: number) => void
  appendEvent: (event: ToolEvent) => void
  hydrateEvents: (events: ToolEvent[]) => void
  setSessionFilter: (sessionId: string | null) => void
  setHealth: (h: ObservStore['health']) => void
  setSseConnected: (v: boolean) => void
}

export const useObservStore = create<ObservStore>()((set, get) => ({
  agents: new Map(),
  sessions: new Map(),
  events: [],
  inProgressMap: new Map(),
  activeSessionFilter: null,
  sessionCosts: [],
  todayCost: 0,
  health: null,
  sseConnected: false,

  addAgent: (agentData) => set((state) => {
    const agents = new Map(state.agents)
    const sessions = new Map(state.sessions)
    if (!sessions.has(agentData.parentSessionId)) {
      sessions.set(agentData.parentSessionId, {
        sessionId: agentData.parentSessionId,
        children: [],
        cost: 0,
        tokens: 0,
      })
    }
    const session = sessions.get(agentData.parentSessionId)!
    if (!session.children.includes(agentData.agentId)) {
      session.children.push(agentData.agentId)
    }
    agents.set(agentData.agentId, { ...agentData, cost: 0, tokens: 0 })
    return { agents, sessions }
  }),

  updateAgentState: (agentId, state, ts) => set((s) => {
    const agents = new Map(s.agents)
    const agent = agents.get(agentId)
    if (agent) agents.set(agentId, { ...agent, state, lastActivityTs: ts })
    return { agents }
  }),

  updateAgentCost: (agentId, cost, tokens) => set((s) => {
    const agents = new Map(s.agents)
    const agent = agents.get(agentId)
    if (!agent) return {}
    agents.set(agentId, { ...agent, cost, tokens })
    // Roll up session cost
    const sessions = new Map(s.sessions)
    const session = sessions.get(agent.parentSessionId)
    if (session) {
      let totalCost = 0, totalTokens = 0
      for (const childId of session.children) {
        const child = agents.get(childId)
        if (child) { totalCost += child.cost; totalTokens += child.tokens }
      }
      sessions.set(agent.parentSessionId, { ...session, cost: totalCost, tokens: totalTokens })
    }
    return { agents, sessions }
  }),

  appendEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  hydrateEvents: (events) => set({ events }),
  setSessionFilter: (sessionId) => set({ activeSessionFilter: sessionId }),
  setHealth: (health) => set({ health }),
  setSseConnected: (sseConnected) => set({ sseConnected }),
}))
```

### Pattern 4: useSSE Hook — Single EventSource, Zustand Dispatch

**What:** A single `useSSE` hook manages one EventSource connection and dispatches all SSE messages into Zustand. Components never import EventSource directly.

**Critical:** React 18 StrictMode double-mounts components in development. The cleanup function MUST call `eventSource.close()` to prevent two concurrent connections. Use `useRef` to hold the EventSource — NOT `useState`.

```typescript
// src/hooks/useSSE.ts
import { useEffect, useRef } from 'react'
import { useObservStore } from '@/store/useObservStore'

export function useSSE() {
  const esRef = useRef<EventSource | null>(null)
  const store = useObservStore.getState()

  useEffect(() => {
    // Close any existing connection (guards against StrictMode double-mount)
    if (esRef.current) {
      esRef.current.close()
    }

    const es = new EventSource('/events')
    esRef.current = es

    es.onopen = () => {
      useObservStore.getState().setSseConnected(true)
    }

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      const s = useObservStore.getState()

      if (msg.type === 'connected') return
      if (msg.type === 'agent_spawn') {
        s.addAgent({
          agentId: msg.agentId,
          parentSessionId: msg.parentSessionId,
          agentType: msg.agentType || '',
          state: 'active',
          lastActivityTs: msg.ts || Date.now(),
        })
        return
      }
      if (msg.type === 'agent_update') {
        s.updateAgentState(msg.agentId, msg.state, msg.ts || Date.now())
        return
      }
      if (msg.type === 'cost_update' && msg.agentId) {
        const totalTokens = (msg.tokens?.input || 0) + (msg.tokens?.output || 0) +
                           (msg.tokens?.cacheRead || 0) + (msg.tokens?.cacheWrite || 0)
        s.updateAgentCost(msg.agentId, msg.cost, totalTokens)
        return
      }
      // Tool events
      if (msg.hook_type === 'PreToolUse' || msg.hook_type === 'PostToolUse') {
        s.appendEvent(msg)
      }
    }

    es.onerror = () => {
      useObservStore.getState().setSseConnected(false)
      // Browser auto-reconnects; no manual retry needed
    }

    return () => {
      es.close()
      esRef.current = null
      useObservStore.getState().setSseConnected(false)
    }
  }, []) // Empty deps — single mount connection
}
```

### Pattern 5: TanStack Virtual Tool Log with Dynamic Row Heights

**What:** The tool log has variable row heights (1-line rows without tool_summary, 2-line rows with tool_summary). Use TanStack Virtual v3's `measureElement` for accurate measurement.

**When to use:** ToolLog component only. Start with `estimateSize: () => 28` (compact row height), rely on `measureElement` for accurate layout.

```typescript
// src/components/log/ToolLog.tsx
// Source: https://tanstack.com/virtual/v3/docs/framework/react/examples/dynamic
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useObservStore } from '@/store/useObservStore'
import { ToolLogRow } from './ToolLogRow'

export function ToolLog() {
  const events = useObservStore((s) =>
    s.activeSessionFilter
      ? s.events.filter(e => e.session_id === s.activeSessionFilter)
      : s.events
  )
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,   // minimum row height (compact list row)
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 10,
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-auto font-mono text-xs">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              width: '100%',
            }}
          >
            <ToolLogRow event={events[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Pattern 6: React Router SPA Routing with URL-Reflected Session Filter

**What:** React Router v7 in declarative mode with `BrowserRouter` + `Routes` + `Route`. Use `useSearchParams` for the session filter.

```typescript
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'

// Force dark mode always — shadcn/ui reads class="dark" from html element
document.documentElement.classList.add('dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// src/App.tsx
import { Routes, Route, Navigate } from 'react-router'
import { LiveDashboard } from '@/pages/LiveDashboard'
import { HistoryPage } from '@/pages/HistoryPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/live" replace />} />
      <Route path="/live" element={<LiveDashboard />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  )
}
```

**Session filter URL reflection** (`/live?session=abc123`):
```typescript
// Source: https://reactrouter.com/how-to/spa
import { useSearchParams } from 'react-router'
import { useObservStore } from '@/store/useObservStore'

export function useSessionFilter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const setStoreFilter = useObservStore((s) => s.setSessionFilter)

  const sessionFilter = searchParams.get('session')

  const setFilter = (sessionId: string | null) => {
    setStoreFilter(sessionId)
    if (sessionId) {
      setSearchParams({ session: sessionId })
    } else {
      setSearchParams({})
    }
  }

  return { sessionFilter, setFilter }
}
```

### Pattern 7: shadcn/ui Dark-Mode-Only Setup

**What:** Force dark mode by setting `class="dark"` on `<html>` at app startup. No theme toggle.

**Tailwind v4 dark mode config in `src/index.css`:**
```css
@import "tailwindcss";
@import "tw-animate-css";

/* Force dark mode — terminal/dev-tool aesthetic */
:root {
  color-scheme: dark;
}

@layer base {
  :root {
    --background: hsl(216 28% 7%);        /* ~#0d1117 — GitHub dark bg */
    --foreground: hsl(213 31% 91%);       /* ~#e6edf3 */
    --card: hsl(215 28% 9%);             /* ~#161b22 */
    --card-foreground: hsl(213 31% 91%);
    --border: hsl(215 14% 19%);          /* ~#30363d */
    --muted: hsl(215 14% 34%);           /* ~#8b949e */
    --muted-foreground: hsl(215 14% 55%);
    /* Status colors */
    --green: hsl(133 55% 58%);           /* ~#3fb950 */
    --yellow: hsl(38 82% 47%);           /* ~#d29922 */
    --red: hsl(5 86% 63%);              /* ~#f85149 */
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-border: var(--border);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
}
```

### Anti-Patterns to Avoid
- **Direct EventSource in components:** Always go through `useSSE` → Zustand. Direct EventSource in components causes multiple connections and cleanup leaks.
- **useState for EventSource ref:** Use `useRef` — EventSource stored in state causes re-render loops.
- **Full store subscription:** `useObservStore((s) => s)` subscribes to every change. Always select specific slices.
- **innerHTML in React components:** The vanilla JS timeline used `innerHTML` for performance. In React, use proper JSX — the virtual DOM handles diffing.
- **Hardcoded Fastify port in vite.config:** Use `process.env.PORT` so it respects the same env variable as the server.
- **emptyOutDir: false:** Without this, stale Vite chunks accumulate in `public/dist/`. Keep `emptyOutDir: true`.
- **No TanStack Virtual scroll-to-bottom:** The tool log auto-scrolls to the latest event. In TanStack Virtual, use `virtualizer.scrollToIndex(events.length - 1)` on new events appended.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| List virtualization (1000+ rows) | Custom windowing with scroll events | `@tanstack/react-virtual` | Off-by-one errors, resize observer edge cases, scroll jank at boundaries |
| Component library dark theme | Custom CSS variables + components | `shadcn/ui` | Tooltip portaling, focus management, a11y attributes, dark mode tokens already calibrated |
| URL-search-param state sync | Manual `window.location` mutation | `useSearchParams` from `react-router` | Handles browser back/forward, encodes values, React integration |
| Toast notifications | Vanilla JS DOM injection (current approach) | shadcn/ui `Sonner` or built-in Toast | Current approach leaks DOM nodes on hot reload; shadcn's approach integrates with React lifecycle |
| Proxy buffering fix for SSE | Manual HTTP streaming middleware | `X-Accel-Buffering: no` header on SSE route | Single header; nginx, Vite proxy, and most reverse-proxies respect it |

**Key insight:** The vanilla JS dashboard hand-rolled everything (toast, virtualization, tooltips). React's ecosystem has battle-tested solutions for all of these that handle edge cases the current code doesn't.

---

## Common Pitfalls

### Pitfall 1: Vite Proxy Breaks SSE in Development
**What goes wrong:** EventSource connects but receives no events; or connection hangs forever in the browser's network tab.
**Why it happens:** Vite's dev server proxy buffers HTTP responses by default. SSE is a streaming response — buffering breaks it.
**How to avoid:** Add `reply.raw.setHeader('X-Accel-Buffering', 'no')` to `routes/sse.js` in the Fastify backend before any SSE data is sent. This header is the standard signal to all proxies (nginx, Vite, etc.) to disable buffering for this response.
**Warning signs:** EventSource `onopen` fires but `onmessage` never fires during dev server mode.

### Pitfall 2: React StrictMode Double EventSource Connection
**What goes wrong:** Two SSE connections open simultaneously during development; duplicate events appear in the log.
**Why it happens:** React 18 StrictMode mounts, unmounts, then remounts every component in development to detect side effects. A `useEffect(() => { new EventSource(...) }, [])` without proper cleanup creates the first connection, unmounts (doesn't close it), then creates a second.
**How to avoid:** Always return `() => { es.close() }` from the `useSSE` hook's `useEffect`. Store the EventSource in `useRef`, check if `esRef.current` exists before creating a new one.
**Warning signs:** Two `EventSource` entries in browser DevTools Network tab for `/events`.

### Pitfall 3: Fastify SPA Route Conflict with API Routes
**What goes wrong:** The `setNotFoundHandler` fallback to `index.html` intercepts `/api/*` requests that 404, serving HTML instead of a JSON error.
**Why it happens:** `setNotFoundHandler` catches ALL unmatched routes — including missing API endpoints.
**How to avoid:** In the not-found handler, check `request.url.startsWith('/api')` and `request.url === '/events'` before serving `index.html`. Return `reply.callNotFound()` for API routes that genuinely don't exist.
**Warning signs:** `fetch('/api/nonexistent')` returns HTML with status 200.

### Pitfall 4: TanStack Virtual Tool Log Doesn't Auto-Scroll
**What goes wrong:** New SSE events append to the store but the tool log stays scrolled to old position.
**Why it happens:** TanStack Virtual manages scroll position independently. Appending to the data array doesn't automatically scroll to the bottom.
**How to avoid:** In `ToolLog`, track whether the user is near the bottom. If yes, call `virtualizer.scrollToIndex(events.length - 1, { align: 'end' })` when events array grows. Use a ref to track previous length.
**Warning signs:** Live events appear in the store (verified via React DevTools) but aren't visible without manual scroll.

### Pitfall 5: `public/dist/` Vite Output Outside `frontend/` Root
**What goes wrong:** Vite refuses to empty `outDir: '../public/dist'` or throws a security error.
**Why it happens:** By default, Vite's `emptyOutDir` is set to `false` if `outDir` is outside the project root (to prevent accidental deletion).
**How to avoid:** Explicitly set `build.emptyOutDir: true` in `frontend/vite.config.ts`. This opts in to cleaning the output directory even though it's outside `frontend/`.
**Warning signs:** `vite build` completes but old chunks remain in `public/dist/`; or Vite prints a warning about outDir being outside project root.

### Pitfall 6: Zustand Map Mutations Don't Trigger Re-Renders
**What goes wrong:** Agent tree appears stale after updates even though the store was written to.
**Why it happens:** Zustand uses `Object.is` equality. Mutating a `Map` in place (`map.set(...)`) does NOT change the Map reference — Zustand sees the same reference and skips re-render.
**How to avoid:** Always create a `new Map(existingMap)` before calling `.set()` inside Zustand actions, then return the new map. See Pattern 3 code examples above.
**Warning signs:** Agent rows don't update after `agent_update` SSE events; React DevTools shows correct store state but components don't re-render.

### Pitfall 7: `shadcn@latest init` Targets Tailwind v3 by Default (OLD CLI)
**What goes wrong:** Running `npx shadcn-ui@latest init` installs Tailwind v3 config, creating `tailwind.config.js` which conflicts with the v4 CSS-only approach.
**Why it happens:** The old package is `shadcn-ui`; the new package is `shadcn`. The Tailwind v4 path requires `shadcn` (not `shadcn-ui`).
**How to avoid:** Use `npx shadcn@latest init` (without the `-ui` suffix). This is the canonical 2026 command.
**Warning signs:** `tailwind.config.js` appears after init; Tailwind classes don't apply to components.

---

## Code Examples

### Format Utilities — Port to TypeScript
```typescript
// src/utils/format.ts
// Ported from public/index.html vanilla JS utilities

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

export function latencyClass(ms: number | null): string {
  if (ms === null) return ''
  if (ms < 500) return 'text-green-400'
  if (ms < 2000) return 'text-yellow-400'
  return 'text-red-400'
}
```

### ToolLogRow Component — Phase 8 Enrichment Preserved
```typescript
// src/components/log/ToolLogRow.tsx
import { cn } from '@/lib/utils'
import { formatTs, formatDuration, formatTokensCompact, latencyClass } from '@/utils/format'

interface ToolEvent {
  tool_name: string
  hook_type: string
  timestamp: number
  duration_ms: number | null
  exit_status: number | null
  tool_summary: string | null
  nearest_input_tokens: number | null
  nearest_output_tokens: number | null
}

export function ToolLogRow({ event }: { event: ToolEvent }) {
  const isError = event.exit_status !== null && event.exit_status !== undefined && event.exit_status !== 0
  const isInProgress = event.hook_type === 'PreToolUse'

  return (
    <div className={cn(
      'px-1 py-0.5 border-l-2 border-transparent font-mono text-xs flex flex-col gap-0.5 rounded-sm',
      isError && 'border-l-red-500 bg-red-950/20',
      isInProgress && 'opacity-70',
    )}>
      {/* Main row */}
      <div className="flex gap-2 whitespace-nowrap overflow-hidden min-w-0">
        <span className={cn('text-foreground', isError && 'text-red-400')}>
          {isError ? `${event.tool_name} — error` : event.tool_name}
        </span>
        <span className="text-muted-foreground">{formatTs(event.timestamp)}</span>
        <span className={cn('ml-auto', latencyClass(event.duration_ms))}>
          {formatDuration(event.duration_ms)}
        </span>
        {/* Token badge — Phase 8 enrichment */}
        {event.nearest_input_tokens != null && (
          <span className="text-muted-foreground text-[10px] ml-1 flex-shrink-0">
            {formatTokensCompact(event.nearest_input_tokens)} in / {formatTokensCompact(event.nearest_output_tokens ?? 0)} out
          </span>
        )}
      </div>
      {/* Summary row — Phase 8 enrichment */}
      {event.tool_summary && (
        <div
          className="text-muted-foreground truncate text-[10px]"
          title={event.tool_summary}
        >
          {event.tool_summary}
        </div>
      )}
    </div>
  )
}
```

### Replay Mode Preservation
```typescript
// In LiveDashboard.tsx — check ?replay= query param
import { useSearchParams } from 'react-router'

export function LiveDashboard() {
  const [searchParams] = useSearchParams()
  const replaySessionId = searchParams.get('replay')
  const isReplay = !!replaySessionId

  // If replay, fetch that session's events only; skip SSE
  // useSSE hook accepts isReplay flag; if true, it doesn't open EventSource
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vanilla JS DOM manipulation | React components + Zustand | Phase 9 | Testable, typed, component reuse |
| `readFileSync` HTML serving | `@fastify/static` + SPA fallback | Phase 9 | Supports React Router client routing |
| `tailwind.config.js` | CSS-only config (`@import "tailwindcss"`) | Tailwind v4 (2024) | No config file; faster builds |
| `tailwindcss-animate` | `tw-animate-css` | shadcn/ui Tailwind v4 path | shadcn deprecated animate plugin |
| `shadcn-ui@latest` CLI | `shadcn@latest` CLI | 2024 rebranding | Package renamed; old one still works but outdated |
| Multiple EventSource connections | Single `useSSE` hook → Zustand | Phase 9 | Eliminates known bug (two EventSources in current dashboard) |

**Deprecated/outdated:**
- `shadcn-ui` npm package: renamed to `shadcn`. Use `npx shadcn@latest` going forward.
- `tailwindcss-animate`: use `tw-animate-css` with Tailwind v4.
- `fastify-static@4.x`: deprecated; use `@fastify/static@8.x`.

---

## Open Questions

1. **Concurrent `npm run build` trigger from `observagent start`**
   - What we know: `observagent start` currently just runs `node server.js`; the Fastify server reads `public/dist/index.html` after React build.
   - What's unclear: Should `observagent start` automatically run `npm run build` in `frontend/` if the build hasn't been run, or should it be a separate step users run manually?
   - Recommendation: Keep them separate for Phase 9. Document in README that users run `cd frontend && npm run build` after install. Phase 9 success criterion only requires the build to work, not automate it.

2. **`@fastify/static` conflict when already registered**
   - What we know: If Fastify has static registered elsewhere, registering it again in `dashboardRoutes` causes a "already registered" error.
   - What's unclear: The current codebase doesn't appear to use `@fastify/static` today — serving is done via `readFileSync` + `reply.send()`.
   - Recommendation: Install `@fastify/static` fresh; `decorateReply: false` if the `sendFile` decorator conflicts.

3. **Replay mode (?replay=SESSION_ID) in React Router context**
   - What we know: Current code checks `IS_REPLAY` at page load by reading `location.search`. React Router's `useSearchParams` provides the same capability.
   - What's unclear: If user navigates to `/live?replay=abc123`, should `useSSE` not connect? Or should it just filter display?
   - Recommendation: `useSSE` hook accepts an `isReplay` prop; if true, skip `new EventSource('/events')` entirely and only fetch the specific session via `/api/events?session_id=`.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — this project uses `mode: "yolo"` and `workflow.verifier: true` (manual UAT), not automated test gates. Skipping formal validation architecture.

The verifier agent will perform manual UAT against the running app per the success criteria in CONTEXT.md. No automated test infrastructure exists for the frontend.

---

## Sources

### Primary (HIGH confidence)
- [ui.shadcn.com/docs/installation/vite](https://ui.shadcn.com/docs/installation/vite) — exact install commands and tsconfig setup
- [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 CSS variable setup
- [ui.shadcn.com/docs/dark-mode](https://ui.shadcn.com/docs/dark-mode) — `class="dark"` on html element for forced dark mode
- [tanstack.com/virtual/v3/docs/framework/react/react-virtual](https://tanstack.com/virtual/v3/docs/framework/react/react-virtual) — `useVirtualizer` hook signature and pattern
- [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand) — store creation pattern, TypeScript double-parens requirement
- [reactrouter.com/how-to/spa](https://reactrouter.com/how-to/spa) — BrowserRouter declarative mode, useSearchParams
- [vite.dev/config/build-options](https://vite.dev/config/build-options) — `build.outDir` and `build.emptyOutDir`
- [github.com/fastify/fastify-static](https://github.com/fastify/fastify-static) — `wildcard: false` + `setNotFoundHandler` SPA pattern

### Secondary (MEDIUM confidence)
- [github.com/vitejs/vite/discussions/10851](https://github.com/vitejs/vite/discussions/10851) — SSE proxy bypass; `X-Accel-Buffering: no` header approach verified by multiple community reports
- [npmjs.com/package/zustand](https://www.npmjs.com/package/zustand) — version 5.0.11 confirmed current
- [npmjs.com/package/@tanstack/react-virtual](https://www.npmjs.com/package/@tanstack/react-virtual) — version 3.13.19 confirmed current (last published 7 days ago)
- [oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view) — React 18 SSE hook patterns

### Tertiary (LOW confidence)
- Various WebSearch results on React 18 StrictMode double-mount — widely reported issue, cleanup approach consensus is clear, LOW only because specific React 18 docs weren't fetched directly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified on npm, official install docs fetched
- Architecture: HIGH — patterns derived from official docs and direct project code analysis
- Pitfalls: MEDIUM-HIGH — SSE proxy issue verified from official Vite GitHub discussion; StrictMode double-mount is widely documented; others derived from project code analysis

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (30 days — stack is stable; Tailwind v4/shadcn evolving fast, re-verify if >30 days old)
