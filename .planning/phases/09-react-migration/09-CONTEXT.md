# Phase 9: React Migration - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild the entire frontend (index.html + history.html) in React 18 + Vite as a single SPA. Full feature parity with v1.0 + Phase 8 enrichments. The backend (Fastify, SSE, SQLite) is not touched. Vanilla JS HTML files are kept as fallback but React becomes the primary served app.

</domain>

<decisions>
## Implementation Decisions

### History page scope
- Both `index.html` and `history.html` migrate to React in Phase 9 — no mixed codebase
- Single SPA with React Router: `/live` = live dashboard, `/history` = session history browser
- Active session filter is URL-reflected (e.g., `/live?session=abc123`) — shareable and survives refresh
- Export (JSONL/CSV) stays on the history page `/history` — consistent with current behavior

### Styling approach
- Use **shadcn/ui + Tailwind CSS** — not a mechanical port of existing CSS
- Phase 9 can look better: use shadcn components fully (cards, badges, tooltips, etc.) throughout
- **Dark theme only** — no light/dark toggle; keep the terminal/dev-tool aesthetic
- Status color semantics preserved (green = active, yellow = idle, red = error) but exact hex values adapted to fit the shadcn dark theme palette
- Tool log uses **compact list rows** (not cards) — dense, fast-scrolling, same feel as current

### State management
- **Zustand** for global store — agent tree, cost state, SSE events, active session filter all in one store
- **Custom `useSSE` hook** manages EventSource lifecycle and dispatches messages into Zustand store — components read from store, no direct SSE dependency
- **TanStack Virtual** for tool log virtualization — handles 1000+ rows without DOM bloat
- **Plain `useEffect` + `fetch`** for initial data load — no React Query; SSE handles real-time, initial fetch is one-shot

### Cutover strategy
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

</decisions>

<specifics>
## Specific Ideas

- "Use shadcn/ui to make beautiful and good-looking components" — Phase 9 should result in a visually improved dashboard, not just a mechanical migration
- The dashboard is a dev tool, so the dark terminal aesthetic is core identity — shadcn dark theme is the right fit
- Phase 10 (Agent Panel Redesign) builds on the React foundation, so component structure should be extensible

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/index.html` (~1735 lines): Contains all dashboard logic — agent tree, tool log, timeline waterfall, cost panel, health panel, SSE subscription, session filter, export. Each logical block becomes a React component.
- `public/history.html` (~559 lines): Session history browser with session list, replay/filter, export (JSONL/CSV). Becomes the `/history` React route.
- Format utilities (formatTs, formatDuration, formatCost, formatTokens, formatTokensCompact, latencyClass) — port as a `utils/format.ts` module.

### Established Patterns
- **SSE at `/events`**: Fastify SSE stream. Current `subscribeSSE()` function handles agent_spawn, agent_update, tool_use, cost_update, health_update message types. Wrap in `useSSE` hook.
- **REST endpoints**: `/api/events`, `/api/cost`, `/api/config`, `/api/sessions/:id/export`. All stay as-is — React fetches from same endpoints.
- **CSS variables**: Current theme uses `--bg`, `--surface`, `--border`, `--text`, `--muted`, `--green`, `--yellow`, `--red`. These become Tailwind/shadcn theme tokens.
- **Agent tree state**: `sessions` Map, `agents` Map with depth/parentSessionId/state/cost tracking. Becomes a Zustand slice.
- **Replay mode**: `?replay=SESSION_ID` query param hides SSE, shows historical data with a banner. Preserve in React.

### Integration Points
- `server.js` / `routes/dashboard.js`: Currently serves `public/index.html` directly. Update to serve `public/dist/index.html` for all SPA routes.
- `routes/sse.js`: SSE endpoint stays unchanged — React's `useSSE` hook connects to same `/events` URL.
- `routes/api.js`: All REST routes unchanged — React fetches from same paths.
- Vite config needs a proxy: `{ '/api': 'http://localhost:PORT', '/events': 'http://localhost:PORT' }`.

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-react-migration*
*Context gathered: 2026-03-03*
