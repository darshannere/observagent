# Project Research Summary

**Project:** ObservAgent v2.5 — Developer Experience
**Domain:** CLI + React dashboard DX — onboarding, version management, in-app guidance
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

ObservAgent v2.5 adds Developer Experience polish to a production-grade AI agent observability tool. The system already ships a working Fastify backend, SQLite storage, SSE streaming, and a React 19 + Tailwind v4 + Zustand dashboard. This milestone does not redesign anything — it layers guidance, discovery, and version management on top of the existing architecture. The research conclusion is clear: almost every feature in scope has a well-documented industry pattern (update-notifier, shadcn Tooltip, empty state UX, doctor-command checklists) and the existing codebase already contains the primitives needed to implement them with minimal new dependencies.

The recommended approach is two new npm packages total — `update-notifier@^7.3.1` for CLI version checking and `driver.js@^1.4.0` for the onboarding walkthrough — plus a new `lib/changelog.json` static file, a `lib/state.js` utility, three new backend endpoints, and six new or modified frontend components. The architecture is additive: no schema migrations, no Zustand additions, no new route files. Every new capability plugs into an existing seam (routes/api.js, bin/cli.js, LiveDashboard.tsx mount effect).

The primary risks are infrastructure-level: a blocking network call during `observagent start` would degrade every user's workflow; an onboarding tour that re-fires on every page load would erode trust in the feature immediately; and generic empty states that don't distinguish "hooks not configured" from "no sessions yet" miss the single most common new-user failure mode. All three risks have concrete preventions identified in research and must be addressed at the implementation stage, not patched afterward.

---

## Key Findings

### Recommended Stack

The existing stack requires no changes beyond two targeted additions. The backend is Node.js with Fastify 5.7.4, better-sqlite3 in WAL mode, and Commander for CLI. The frontend is React 19.2, Vite 7, Zustand 5, Recharts 3, Tailwind v4, and radix-ui 1.4.3. Every v2.5 feature either extends an existing integration point or uses packages already installed.

**Core new technologies:**
- `update-notifier@^7.3.1`: CLI version-check banner and `update` command — pure ESM, unref'd child process model, 24-hour cache, respects `NO_UPDATE_NOTIFIER` convention; preferred over `simple-update-notifier` (fewer options) and raw `fetch` (requires reimplementing caching and opt-out)
- `driver.js@^1.4.0`: In-dashboard onboarding walkthrough — MIT license, framework-agnostic (no React peer dependency), ~15KB gzipped; preferred over `react-joyride` (documented React 18/19 incompatibility, GitHub issues #1122/#1124) and Shepherd.js (AGPL license)
- `lib/changelog.json` (static asset, no package): Bundled version history served at `/api/changelog`; avoids remote fetch dependency, works offline, version-matches installed package

**What requires zero new packages:**
- Feature tooltips: `radix-ui` + `frontend/src/components/ui/tooltip.tsx` already present and production-ready
- `npx observagent update` confirmation prompt: Node.js stdlib `readline` (8 lines vs. 50KB `inquirer`)
- Changelog CLI display: Node.js `fs.readFile` on bundled CHANGELOG.md
- Onboarding localStorage state: same pattern already in AgentTree.tsx

### Expected Features

**Must have (table stakes):**
- Post-init printed guidance with numbered next steps — every major CLI (Vite, Prisma, create-react-app) does this; silent init feels broken
- Empty states in all dashboard panels — "no data" without context cannot be distinguished from a bug
- CLI version check banner on `start` — absence implies the tool is unmaintained
- Dashboard version badge — users need to know what version they are running
- Doctor command with actionable fixes including exact config blocks to paste — listing failures without fix commands frustrates users

**Should have (differentiators):**
- Hook activation detection with inline fix instructions — ObservAgent's only real failure mode; detecting it proactively removes the #1 setup failure
- In-dashboard first-run onboarding walkthrough — contextual guidance that self-dismisses as data arrives
- `npx observagent update` command with inline changelog — no other local dev tool does this; one-step update + context
- Dashboard "What's New" modal triggered from version badge — keeps power users informed without requiring a GitHub visit
- Feature tooltips on domain-specific metrics (p50/p95, context fill %, stalled agent, cache hit rate)

**Defer to future milestone:**
- Full interactive step-by-step blocking modal tour — anti-pattern for dev tools; users dismiss immediately
- Demo/fake data mode — synthetic data in an observability tool violates the core product value
- Telemetry for onboarding tracking — permanently out of scope; conflicts with local-first, privacy-preserving architecture

### Architecture Approach

The v2.5 architecture is purely additive integration into an existing production system. The existing data flow (relay.py → POST /ingest → WriteQueue → SSE broadcast → useSSE → Zustand) is untouched. First-run state lives in `~/.local/share/observagent/state.json` (same directory as the DB), read/written via a new `lib/state.js` module. Changelog data is bundled as `lib/changelog.json` and served statically. All three new backend endpoints (`/api/changelog`, `GET /api/meta`, `POST /api/meta`) are added to the existing `routes/api.js`. No schema migrations. No Zustand store additions — local `useState` in `LiveDashboard` suffices for `firstRun` and `changelog`.

**Major components:**
1. `lib/state.js` — foundation utility: `readState()` / `writeState(patch)` with platform-aware path resolution; everything that tracks "has the user been here" depends on this
2. `lib/changelog.json` + `/api/changelog` route — static data layer: version history bundled with package, served locally, works offline
3. `lib/cmd-update.js` + `bin/cli.js` registration — new CLI command: fetches registry version, displays changelog diff, spawns npm install
4. `components/onboarding/OnboardingOverlay.tsx` — first-run walkthrough: gate on `firstRun` prop from `/api/meta`, dismiss via `POST /api/meta`
5. `components/layout/TopBar.tsx` — version badge + "What's New" trigger; connects `/api/meta` version to changelog modal
6. Modified panels (InsightsPanel, HealthPanel, CostPanel, AgentTree) — tooltip additions using existing shadcn `Tooltip`

### Critical Pitfalls

1. **Version check blocks CLI startup** — `await fetch(registry)` before `runStart()` adds 200–800ms on good connections, hangs on registry outages (npm outage January 29, 2026 documented). Use `update-notifier` unref'd child process model; version banner appears on next invocation from cache, never the current one.

2. **Onboarding walkthrough re-fires on every dashboard load** — storing `onboardingCompleted` in Zustand (in-memory only, resets on page load) or `sessionStorage` causes the tour to fire every session. Persist `{ status: not_started|skipped|completed, version: "2.5" }` in `localStorage`; version-key allows re-showing on major upgrades.

3. **Tour targets DOM elements that don't exist yet** — LiveDashboard fetches data on mount and conditionally renders panels; tour library steps targeting class or ID selectors find nothing during onboarding (the exact state a new user is in). Add stable `data-tour="..."` attributes; gate tour start until hydration `useEffect` resolves; test specifically against empty-DB state.

4. **Empty states are generic and miss the setup path** — "No data yet" with no CTA cannot tell a misconfigured user from a user waiting for data. Use `/api/config` (already exists, returns hook state) to branch: hooks absent → show init instructions with exact commands; hooks present → show "waiting for first session."

5. **npx cache serves stale version after update** — documented unresolved npm/cli bug (issues #2329, #6179). `npx observagent update` must not silently run `npm install -g`; instead output explicit instructions for both global and npx-only users; include `npx --yes @darshannere/observagent@latest` as the npx path.

---

## Implications for Roadmap

The dependency graph is the primary driver of phase ordering. `lib/state.js` and the changelog data layer are blocking foundations; everything UI-visible depends on them. CLI improvements are independent of frontend work. Tooltip additions are mechanical and low-risk, appropriate for late-phase. The onboarding overlay is the highest-visibility feature and should build last when all dependencies are verified.

### Phase 1: Foundation + Static Data Layer

**Rationale:** `lib/state.js` and `/api/meta` are blocking dependencies for the onboarding overlay, "What's New" auto-show, and version badge. `lib/changelog.json` + `/api/changelog` unblocks the dashboard "What's New" page and the CLI `update` command. Both have zero risk and no external dependencies.
**Delivers:** `lib/state.js` (readState/writeState with XDG-aware path), `lib/changelog.json`, three new routes in `routes/api.js` (`/api/changelog`, `GET /api/meta`, `POST /api/meta`)
**Addresses:** Foundation for all features that track first-run state or display changelog data
**Avoids:** Building UI features on unstable or absent state primitives; circular dependency where CLI update command needs changelog before it exists

### Phase 2: CLI Improvements

**Rationale:** CLI features (version check, `update` command, improved init/doctor output) are fully independent of frontend work and can proceed in parallel with frontend phases. The version check uses Node 18 built-in `fetch` + chalk (already a dependency) — no new packages for that feature alone. The `update` command needs `update-notifier` and `lib/changelog.json` from Phase 1.
**Delivers:** Version check banner in `cmd-start.js` (fire-and-forget, 3s timeout, scoped to `start` only), `npx observagent update` command (`lib/cmd-update.js` + `bin/cli.js` registration), improved post-init guidance in `cmd-init.js`, overhauled `cmd-doctor.js` with hook detection and actionable fixes
**Addresses:** Table-stakes version check and doctor overhaul; differentiator `update` command
**Avoids:** Blocking startup on network call; version check on `--help`/`doctor` commands; silent `npm install -g` in update command; npx stale cache trap

### Phase 3: Dashboard Version Badge + "What's New"

**Rationale:** Depends on `/api/changelog` and `/api/meta` from Phase 1. The version badge in `TopBar.tsx` is the entry point for "What's New" — build the badge first, then the modal. `TooltipProvider` added here unblocks Phase 5 tooltip additions.
**Delivers:** `components/layout/TopBar.tsx` (version badge), `pages/WhatsNewPage.tsx`, `TooltipProvider` wrapper in `App.tsx`, localStorage version tracking for auto-show on update
**Addresses:** Dashboard version badge (table stakes), "What's New" modal (differentiator)
**Avoids:** Version badge flash of "unknown" by defaulting to `VITE_APP_VERSION` build-time variable; stale changelog by serving bundled local file, never remote as primary source

### Phase 4: Empty States

**Rationale:** One shared `EmptyState` component with conditional renders in each panel. No dependencies on Phase 3 frontend work — only requires the existing Zustand store and the already-present `/api/config` endpoint. Low complexity, high impact for new users.
**Delivers:** `components/shared/EmptyState.tsx`, conditional renders in AgentTree, ToolLog, Cost/Activity/Health charts, Session History; hook-absent vs. hook-present branching logic
**Addresses:** Table-stakes empty states; hook-not-configured detection (the #1 new-user failure mode)
**Avoids:** Generic "no data" with no CTA; indistinguishable "misconfigured" from "waiting"

### Phase 5: Feature Tooltips

**Rationale:** Mechanical additions using the existing `tooltip.tsx` shadcn component. Requires `TooltipProvider` to be in place (added in Phase 3). Low risk; do component by component. Recharts conflict pitfall is avoided by placing all tooltip triggers in chart title rows, outside `<ResponsiveContainer>`.
**Delivers:** Tooltips on p50/p95 latency, context fill %, stalled agent, cache hit rate, hook status across InsightsPanel, HealthPanel, CostPanel, AgentTree
**Addresses:** Feature tooltips differentiator
**Avoids:** Tooltip z-index issues (use `z-[9999]` not Tailwind `z-50`); Recharts conflict (triggers placed outside ResponsiveContainer); hover-only inaccessibility (focusable triggers with `tabIndex={0}`)

### Phase 6: Onboarding Walkthrough

**Rationale:** Highest-visibility feature; build last when all dependencies are verified. Depends on `/api/meta` (Phase 1), `TooltipProvider` (Phase 3), empty states (Phase 4, so new users see correct panel content during tour). Uses `driver.js` (MIT, React 19 safe, ~15KB). Must test specifically against empty-DB state with no hooks configured — the exact state every new user is in.
**Delivers:** `components/onboarding/OnboardingOverlay.tsx`, LiveDashboard integration, `data-tour` attributes on key elements, localStorage `{ status: not_started|skipped|completed, version }` persistence, "Show tour again" link in TopBar
**Addresses:** First-run walkthrough differentiator
**Avoids:** Re-fire on page load (localStorage, not Zustand); missing DOM targets (`data-tour` attributes + hydration gate); skip vs. complete ambiguity (three-state status)

### Phase Ordering Rationale

- Phase 1 is prerequisite because CLI `update` command and dashboard onboarding both depend on the same state primitives — building them first eliminates integration risk across two independent surfaces
- Phases 2 and 3 can proceed in parallel once Phase 1 is complete; CLI work does not depend on frontend work
- Phase 4 (empty states) is independent of tooltip and walkthrough phases; only requires existing Zustand store and `/api/config`
- Phase 5 (tooltips) is gated solely on `TooltipProvider` being in App.tsx (Phase 3); otherwise fully mechanical
- Phase 6 (onboarding) is last because it depends on Phase 1 (state), Phase 3 (TooltipProvider confirmed), and benefits from Phase 4 (empty states in place for the panels the tour highlights)

### Research Flags

Phases with standard, well-documented patterns that do not need deeper research during planning:
- **Phase 1 (Foundation):** Static JSON file + Fastify one-liner route; XDG state directory already established by existing codebase
- **Phase 2 (CLI):** `update-notifier` 3-line integration; Commander subcommand registration already in use; doctor checklist pattern directly from React Native CLI / npm doctor
- **Phase 3 (Version badge):** `VITE_APP_VERSION` define in vite.config.ts; localStorage version tracking has multiple documented implementations
- **Phase 4 (Empty states):** IBM Carbon Design System pattern; one shared component, conditional renders

Phases that benefit from a research spike during planning:
- **Phase 6 (Onboarding):** driver.js React integration is imperative (not declarative); the hydration-gate pattern and `data-tour` attribute management across a complex multi-panel layout warrants a brief spike before task breakdown. Confidence is MEDIUM on React 19 runtime behavior with imperative driver.js.
- **Phase 2 (Update command, npx detection):** npx install method detection (global vs. npx cache path heuristic) has MEDIUM confidence; needs testing on real systems before implementation. Default to showing both instructions if detection is ambiguous.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All existing packages verified from actual `frontend/package.json` and root `package.json`; `tooltip.tsx` read directly; `update-notifier` and `driver.js` version/license confirmed via multiple sources |
| Features | HIGH | Industry patterns (Vite, Prisma, React Native CLI, npm doctor, IBM Carbon) directly applicable; anti-features have clear rationale grounded in UX research |
| Architecture | HIGH | All integration points derived from direct codebase reads; npm registry endpoint verified live; ESM JSON import confirmed for Node 18+; existing `getDbPath()` directory pattern confirmed for state file placement |
| Pitfalls | HIGH | Six critical pitfalls derived from direct code inspection (z-50 confirmed in tooltip.tsx, Zustand non-persistence confirmed, hydration pattern confirmed in LiveDashboard.tsx); npx caching bugs sourced from open GitHub issues |

**Overall confidence:** HIGH

### Gaps to Address

- **npx install method detection:** The heuristic for detecting whether a user runs via global install vs. npx one-shot (checking if binary path contains `/.npm/_npx/`) has MEDIUM confidence. Default to showing both instructions if detection is ambiguous rather than guessing wrong.
- **driver.js hydration gate:** The exact sequence for gating driver.js tour start until LiveDashboard's `useEffect` fetches resolve needs validation in practice. Research confirms the pattern is correct in principle; timing depends on React 19's concurrent rendering behavior.
- **changelog.json ESM JSON import syntax:** `import ... assert { type: 'json' }` is Node 18.3+ and may require explicit flag in some environments. Confirm during Phase 1; fallback is `JSON.parse(fs.readFileSync(...))` which is always safe.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase: `frontend/package.json`, `frontend/src/components/ui/tooltip.tsx`, `frontend/src/components/agents/AgentTree.tsx`, `bin/cli.js`, `lib/cmd-start.js`, `routes/api.js`, `db/schema.js`, `frontend/src/pages/LiveDashboard.tsx`, `frontend/src/App.tsx` — all read directly
- npm registry live endpoint: `GET https://registry.npmjs.org/@darshannere/observagent/latest` — verified returns `{ version: "2.4.0" }`
- react-joyride GitHub issues #1122, #1124 — React 18/19 incompatibility confirmed
- driver.js MIT license: `github.com/kamranahmedse/driver.js/blob/master/license` — confirmed
- radix-ui unified package v1.4.3 — matches installed version in `frontend/package.json`
- npm/cli GitHub issues #2329, #6179, #6804, #7838 — npx stale cache bug confirmed unresolved as of 2026
- npm outage January 29, 2026 — getautonoma.com status, confirms version checks must be offline-resilient

### Secondary (MEDIUM confidence)
- update-notifier npm page — version 7.3.1, ESM-only, 249k weekly downloads, unref'd child process model
- driver.js npm and docs (driverjs.com) — version 1.4.0, React integration pattern
- XDG Base Directory Specification — state file path convention
- Radix UI tooltip accessibility docs — `onFocus` activation requires focusable trigger; portal rendering behavior
- Flowjam 2025 onboarding best practices — anti-patterns for blocking modal tours
- onboardjs.com 2026 library comparison — download counts, license status per library
- Barcelona Code School — localStorage popup-once pattern
- npm registry internals / dist-tags — edoardoscibona.com

### Tertiary (foundational, no validation needed)
- Command Line Interface Guidelines (clig.dev) — post-init output pattern, feedback principles
- IBM Carbon Design System — empty state categories (informational, action-oriented, celebratory)
- shadcn/ui Charts Tooltip docs — existing stack tooltip documentation
- Vercel Changelog — in-product changelog modal reference pattern
- Recharts + Radix tooltip conflict — community-known interaction pattern; prevention is placement outside `ResponsiveContainer`

---
*Research completed: 2026-03-11*
*Ready for roadmap: yes*
