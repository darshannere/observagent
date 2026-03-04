---
phase: 09-react-migration
plan: "05"
subsystem: ui
tags: [react, fastify, spa, static-serving, legacy-fallback]

# Dependency graph
requires:
  - phase: 09-03
    provides: React Live Dashboard components (AgentTree, ToolLog, CostPanel, HealthPanel, TimelineWaterfall)
  - phase: 09-04
    provides: React HistoryPage with project-grouped sessions, export, and replay
provides:
  - Fastify serves React SPA from public/dist/ at all primary routes (/, /live, /history)
  - SPA catch-all via setNotFoundHandler handles React Router client-side routing
  - Legacy vanilla JS dashboard preserved at /legacy and /legacy/history
  - @fastify/static registered with wildcard: false, explicit /assets/* route for Vite build output
affects:
  - phase 10 (any dashboard routing changes will build on this serving pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@fastify/static wildcard: false + explicit /assets/* route + setNotFoundHandler SPA fallback"
    - "Guard /api, /events, /ingest, /legacy in not-found handler to preserve API and SSE routes"
    - "Legacy HTML served via readFileSync at module load — no performance penalty for rarely-accessed fallback routes"

key-files:
  created: []
  modified:
    - routes/dashboard.js

key-decisions:
  - "Used wildcard: false on @fastify/static and added explicit GET /assets/* route — required because Fastify's auto-wildcard conflicted with setNotFoundHandler SPA fallback"
  - "setNotFoundHandler guards /api, /events, /ingest, /legacy explicitly — any route not matching these returns index.html for React Router"
  - "Legacy routes kept at /legacy and /legacy/history — plain readFileSync at module load, no performance impact"
  - "Removed decorateReply: false from fastify-static registration — not needed after removing conflicting wildcard behavior"

patterns-established:
  - "SPA serving pattern: @fastify/static wildcard:false + explicit asset route + setNotFoundHandler catch-all"
  - "API/SSE guard in not-found handler prevents React Router from swallowing 404s for backend routes"

requirements-completed: [ARCH-01]

# Metrics
duration: ~15min (including human checkpoint verification)
completed: 2026-03-04
---

# Phase 9 Plan 05: React SPA Production Cutover Summary

**Fastify routes/dashboard.js rewritten to serve React SPA from public/dist/ with @fastify/static, explicit asset route, SPA catch-all, and vanilla JS preserved at /legacy**

## Performance

- **Duration:** ~15 min (including human checkpoint verification)
- **Started:** 2026-03-04
- **Completed:** 2026-03-04
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 1 (routes/dashboard.js)

## Accomplishments

- React SPA is now the primary served application at http://localhost:4999/ — Fastify no longer serves vanilla JS index.html as default
- SPA catch-all via `fastify.setNotFoundHandler` enables React Router to handle /live, /history, and any future client-side routes with full page-refresh support
- Explicit `/assets/*` route added to correctly serve Vite-bundled JS/CSS — resolved 404s on static assets that would have blocked the React app from loading
- Legacy vanilla JS dashboard preserved and accessible at /legacy and /legacy/history as a fallback
- Human checkpoint confirmed: React dashboard loads, SSE real-time updates work, Phase 8 enrichments (tool_summary second line, token badges) visible, no browser console errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite routes/dashboard.js to serve React SPA** - `2a5a1ac` (feat)
2. **Task 1 (fix): Fix SPA asset serving, agent tree hydration, contextFillPct** - `4bdced2` (fix — multiple auto-fixes during task execution)
3. **Task 1 (fix): Wire contextFillPct from SSE, fix CostPanel errors** - `be6fee3` (fix)
4. **Task 1 (fix): Align HistoryPage with actual /api/sessions fields** - `09e357b` (fix)
5. **Task 2: Human verify React dashboard** - Approved (no code commit — checkpoint approval)

## Files Created/Modified

- `routes/dashboard.js` — Rewritten to serve React SPA from public/dist/ using @fastify/static; /assets/* explicit route; setNotFoundHandler SPA fallback guarding /api, /events, /ingest, /legacy; /legacy and /legacy/history serve vanilla JS via readFileSync

## Decisions Made

- **wildcard: false + explicit /assets/* route:** @fastify/static auto-wildcard mode conflicted with setNotFoundHandler — disabling wildcard and adding an explicit GET /assets/* route resolved asset 404s while keeping SPA fallback behavior intact
- **Removed decorateReply: false:** Not needed once the wildcard conflict was resolved; simplifies plugin registration
- **setNotFoundHandler guards:** /api, /events, /ingest, /legacy are explicitly excluded from the SPA catch-all so backend 404s return JSON `{ error: 'Not found' }` rather than HTML

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Vite asset 404s blocking React app load**
- **Found during:** Task 1 (server start and curl verification)
- **Issue:** @fastify/static with wildcard: false did not serve /assets/* routes, causing JS/CSS bundles to 404 and React app to fail loading
- **Fix:** Added explicit `fastify.get('/assets/*', ...)` route to proxy asset requests through sendFile
- **Files modified:** routes/dashboard.js
- **Verification:** React app loaded with all assets after fix
- **Committed in:** 4bdced2

**2. [Rule 1 - Bug] Fixed agent tree hydration and contextFillPct for root sessions**
- **Found during:** Task 1 (post-fix verification)
- **Issue:** AgentTree not populating on initial hydration; contextFillPct calculation failing for root-level sessions
- **Fix:** Corrected hydration path in useSSE or store; guarded contextFillPct calculation
- **Files modified:** frontend/ source files
- **Committed in:** 4bdced2

**3. [Rule 1 - Bug] Wired contextFillPct from SSE to store; fixed CostPanel errors**
- **Found during:** Task 1 (continued verification)
- **Issue:** contextFillPct not flowing through SSE events into the Zustand store; CostPanel throwing JS errors on missing fields
- **Fix:** Added contextFillPct to SSE event handling and store update logic; added null guards in CostPanel
- **Files modified:** frontend/ source files
- **Committed in:** be6fee3

**4. [Rule 1 - Bug] Aligned HistoryPage with actual /api/sessions response shape**
- **Found during:** Task 1 (HistoryPage rendering)
- **Issue:** HistoryPage expected different field names than what /api/sessions returned; sessions not rendering in history view
- **Fix:** Updated field access in HistoryPage to match actual API response
- **Files modified:** frontend/src/pages/HistoryPage.tsx (or similar)
- **Committed in:** 09e357b

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs)
**Impact on plan:** All fixes necessary for correct React SPA loading and feature functionality. No scope creep — all issues were integration bugs discovered during wiring.

## Issues Encountered

- Initial @fastify/static configuration did not account for Vite's asset fingerprinting under /assets/ — required adding explicit GET /assets/* route rather than relying on static plugin's default behavior
- Several React component bugs surfaced only at runtime (contextFillPct, HistoryPage field names) — resolved through iterative auto-fix commits before human checkpoint

## User Setup Required

None - no external service configuration required. The React build is committed to public/dist/ and served automatically on server start.

## Next Phase Readiness

- React SPA is the primary dashboard, fully operational at port 4999
- All Phase 8 enrichments (tool_summary, token badges, context fill %) visible in the React build
- Legacy vanilla JS preserved as fallback — accessible at /legacy
- Phase 9 complete — React migration finished across all 5 plans
- Phase 10 can build new features directly on the React stack without any serving infrastructure changes

---
*Phase: 09-react-migration*
*Completed: 2026-03-04*
