# Architecture Patterns

**Project:** ObservAgent v2.5 — Developer Experience
**Milestone:** DX/Onboarding improvements on existing architecture
**Researched:** 2026-03-11
**Mode:** Integration Architecture — existing codebase

---

## Existing System Map

Before documenting integration points, here is the current architecture that v2.5 modifies.

```
CLI entry                    Backend                          Frontend (React SPA)
──────────────               ──────────────────────────       ──────────────────────────
bin/cli.js                   server.js (Fastify)              App.tsx → React Router
  └─ commander                 ├─ routes/api.js               ├─ /live → LiveDashboard.tsx
       ├─ init → cmd-init.js   ├─ routes/ingest.js            │     ├─ AgentTree
       ├─ start → cmd-start.js ├─ routes/sse.js               │     ├─ ToolLog / Timeline / InsightsPanel
       └─ doctor → cmd-doctor.js├─ routes/insights.js         │     ├─ CostPanel
                               └─ routes/dashboard.js         │     └─ HealthPanel
                                    (serves public/dist/)     └─ /history → HistoryPage.tsx
                               db/schema.js (better-sqlite3)
                                 tables: events, session_cost,
                                         observagent_config,
                                         agent_nodes, api_calls
```

**SSE data flow:** `relay.py` → POST `/ingest/*` → `WriteQueue` → `sseClients.broadcast()` → frontend `useSSE` hook → Zustand store

**Config persistence:** `observagent_config` table (key/value TEXT). Used today for `budget_threshold_usd` and `ctx_fill_threshold_pct`. `GET /api/config` + `POST /api/config` already wired to LiveDashboard on mount.

---

## Integration Points for v2.5 Features

### 1. npm Registry Version Check in CLI Startup

**Where it hooks in:** `lib/cmd-start.js` — `runStart()` function, before the `waitForPort` / `open` calls.

**How:** Fetch `https://registry.npmjs.org/@darshannere/observagent/latest` (the scoped-package latest-version endpoint). This URL returns the full latest version object; extract `.version`. Compare against the local package version read from `package.json` via `createRequire` (already used in `bin/cli.js`).

**Verified behavior:** `curl https://registry.npmjs.org/@darshannere/observagent/latest` returns `{ "name": "...", "version": "2.4.0", ... }` — lightweight, no full manifest download needed. [HIGH confidence — verified against live registry]

**Pattern:**
```js
// In runStart() — before waitForPort
const localVersion = require('../package.json').version; // already done in cli.js
try {
  const res = await fetch('https://registry.npmjs.org/@darshannere/observagent/latest', {
    signal: AbortSignal.timeout(3000)
  });
  if (res.ok) {
    const { version: latest } = await res.json();
    if (latest !== localVersion) {
      console.log(chalk.yellow(`Update available: ${localVersion} → ${latest}`));
      console.log(chalk.dim('Run: npx observagent update'));
    }
  }
} catch {
  // Silent — network failures must never block startup
}
```

**New vs modified:** MODIFIED — `lib/cmd-start.js`

**Key constraint:** The fetch must be non-blocking and fire-and-forget if the network is unavailable. Use `AbortSignal.timeout(3000)`. Never `await` without a catch that swallows errors.

**No new dependencies needed:** Node 18+ `fetch` is global. `chalk` is already a dependency.

---

### 2. `npx observagent update` Command

**Where it hooks in:** Two touch points:
1. `bin/cli.js` — new `.command('update')` registration
2. New file: `lib/cmd-update.js`

**How it works:** The update command should:
1. Fetch latest version from registry (same call as above)
2. Display changelog inline (see Section 3 for where changelog comes from)
3. Execute `npm install -g @darshannere/observagent@latest` (or `npx` equivalent) as a child process, forwarding stdio

**Pattern:**
```
bin/cli.js
  └─ .command('update') → lib/cmd-update.js
       ├─ fetch registry version
       ├─ fetch + display changelog from bundled lib/changelog.json
       └─ spawn: npm install -g @darshannere/observagent@latest
```

**New vs modified:**
- MODIFIED: `bin/cli.js` — add command registration
- NEW: `lib/cmd-update.js`

**Constraint:** `npm install -g` requires npm to be on PATH. The command should detect the install method (global npm vs npx one-shot) and use the right upgrade command. For npx one-shot users, instruct them to re-run `npx @darshannere/observagent@latest`.

---

### 3. Changelog Data — Storage and Retrieval

**Decision: Bundle as a static JSON file, not in SQLite.**

**Rationale:** Changelog is static, version-coupled content. It ships with the package at publish time. Storing it in SQLite adds migration complexity with no benefit. The file is small (< 5KB), never user-generated, and needs no querying.

**Storage location:** `lib/changelog.json` — included in `package.json#files` array (already includes `lib/`).

**Format:**
```json
[
  {
    "version": "2.5.0",
    "date": "2026-03-XX",
    "highlights": ["Feature A", "Feature B"],
    "breaking": []
  },
  {
    "version": "2.4.0",
    "date": "2026-03-10",
    "highlights": ["Insights panel", "stalled agent badge"],
    "breaking": []
  }
]
```

**Backend — serve to dashboard:**
Add a new route to `routes/api.js`: `GET /api/changelog`

```js
import changelog from '../lib/changelog.json' assert { type: 'json' };
fastify.get('/api/changelog', (request, reply) => {
  reply.send(changelog);
});
```

This is a one-liner. No DB queries, no prepared statements.

**Frontend consumption:** The "What's New" page and the dashboard version badge both call `GET /api/changelog`. Because this is static data, it can be fetched once and cached in a local React state — no Zustand store needed, no SSE update.

**New vs modified:**
- NEW: `lib/changelog.json`
- MODIFIED: `routes/api.js` — add `/api/changelog` route
- NEW (frontend): `pages/WhatsNewPage.tsx`
- MODIFIED (frontend): `App.tsx` — add `/whats-new` route

---

### 4. First-Run State Tracking

**Decision: Single state file at `~/.local/share/observagent/state.json`**

**Rationale:** The server already uses `~/.local/share/observagent/observagent.db` (see `getDbPath()` in `cmd-start.js`). Using the same directory is consistent. A JSON file avoids adding a DB migration for a simple boolean flag. XDG `$XDG_STATE_HOME` convention (`~/.local/state`) is technically more correct for transient state, but the project already established `~/.local/share/observagent/` as its home — stay consistent. [MEDIUM confidence — XDG spec consulted]

**State file structure:**
```json
{
  "firstRunComplete": true,
  "installedVersion": "2.5.0",
  "lastSeenChangelogVersion": "2.5.0"
}
```

**Where it's read/written:**

| Trigger | Action | File location |
|---------|--------|---------------|
| `observagent start` completes for the first time | Write `firstRunComplete: false, installedVersion` | `lib/cmd-start.js` |
| Dashboard loads | `GET /api/meta` returns `firstRun` flag | `routes/api.js` reads state file |
| User completes onboarding walkthrough | `POST /api/meta` with `{ firstRunComplete: true }` | `routes/api.js` writes state file |
| User views "What's New" | `POST /api/meta` with `{ lastSeenChangelogVersion: "x.y.z" }` | `routes/api.js` |

**Implementation note:** The state file must be read/written with `fs/promises` (already used throughout `lib/`). Parse failures must default to `{ firstRunComplete: false }` — treat any missing/corrupt state file as first run.

**New vs modified:**
- NEW: `lib/state.js` — helper module: `readState()`, `writeState(patch)`, `getDataDir()`
- MODIFIED: `routes/api.js` — add `GET /api/meta` and `POST /api/meta`
- MODIFIED: `lib/cmd-start.js` — initialize state file on first server start (if state file missing)

**Why not SQLite for this?** The dashboard frontend calls `/api/meta` on mount to decide whether to show onboarding. The DB is open at that point, but a separate lightweight JSON file keeps this concern isolated and avoids a DB migration. It also lets the CLI read state without starting the server.

---

### 5. In-Dashboard Onboarding Walkthrough Component

**Decision: Custom lightweight walkthrough, not a third-party library.**

**Rationale:** The dashboard is a tight dark-theme layout with small typography. Third-party libraries (react-joyride, driver.js) add 30-80KB and impose their own overlay styles that fight Tailwind v4 dark mode. The onboarding flow is simple: 4-6 fixed steps pointing at existing elements. A custom component using the existing `shadcn/ui` Tooltip primitive (already in `frontend/src/components/ui/tooltip.tsx`) costs zero bundle overhead. [MEDIUM confidence — tradeoff based on codebase inspection]

**Component placement:**
```
LiveDashboard.tsx
  ├─ OnboardingOverlay    ← NEW: renders only when firstRun === true
  │    ├─ Step 1: AgentTree header ("These are your agents...")
  │    ├─ Step 2: ToolLog tab ("This is the live tool log...")
  │    ├─ Step 3: InsightsPanel tab ("Cost and latency analytics...")
  │    ├─ Step 4: CostPanel ("Session cost and budget alerts...")
  │    └─ Step 5: Dismiss → POST /api/meta { firstRunComplete: true }
  └─ (existing layout unchanged)
```

**State management:** `OnboardingOverlay` receives `firstRun: boolean` as a prop from `LiveDashboard`. `LiveDashboard` fetches `/api/meta` on mount (alongside the existing fetches in the mount `useEffect`). No Zustand store addition needed — local `useState` in `LiveDashboard` suffices.

**Trigger:** `GET /api/meta` returns `{ firstRun: true, version: "2.5.0", hasNewChangelog: false }`. If `firstRun` is true, `OnboardingOverlay` renders with step 1 active.

**Dismiss flow:**
1. User clicks "Got it" on final step or presses Escape
2. `POST /api/meta { firstRunComplete: true }`
3. `setFirstRun(false)` in local state → overlay unmounts

**New vs modified:**
- NEW (frontend): `components/onboarding/OnboardingOverlay.tsx`
- MODIFIED (frontend): `pages/LiveDashboard.tsx` — add `/api/meta` fetch, conditional `<OnboardingOverlay />` render

---

### 6. Tooltip System Integration

**Decision: Use existing shadcn/ui `Tooltip` component already in `frontend/src/components/ui/tooltip.tsx`.**

**Rationale:** The tooltip primitive is already imported in the project. Wrapping chart labels and panel headers in `<Tooltip>` + `<TooltipContent>` requires no new dependencies and no bundle impact. [HIGH confidence — file confirmed present at `frontend/src/components/ui/tooltip.tsx`]

**Where tooltips attach:**

| Target | Tooltip content | Component file to modify |
|--------|----------------|--------------------------|
| InsightsPanel chart labels | "7-day cost trend. Includes all agent types." | `components/insights/InsightsPanel.tsx` |
| HealthPanel "Hook status" row | "Checks ~/.claude/settings.json for relay.py" | `components/health/HealthPanel.tsx` |
| CostPanel "Context Fill" label | "% of 160K effective window used. Turns red at 80%." | `components/cost/CostPanel.tsx` |
| AgentTree "active" badge | "Agents currently executing a tool call" | `components/agents/AgentTree.tsx` |
| Dashboard version badge | "v2.5.0 — click to see What's New" | NEW: `components/layout/TopBar.tsx` |

**Integration pattern:**
```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

<Tooltip>
  <TooltipTrigger asChild>
    <span className="text-muted-foreground">Context Fill</span>
  </TooltipTrigger>
  <TooltipContent>
    <p>% of 160K effective window used. Turns red at 80%.</p>
  </TooltipContent>
</Tooltip>
```

**Requires `TooltipProvider`** at the app root. Check whether it already wraps the app — if not, add to `App.tsx` wrapping the `<Routes>`. This is a one-line addition with no risk.

**New vs modified:**
- MODIFIED: `components/insights/InsightsPanel.tsx`, `components/health/HealthPanel.tsx`, `components/cost/CostPanel.tsx`, `components/agents/AgentTree.tsx`
- NEW: `components/layout/TopBar.tsx` — version badge + "What's New" link

---

## New Backend Endpoint Summary

| Endpoint | Method | Handler location | What it does |
|----------|--------|-----------------|--------------|
| `/api/changelog` | GET | `routes/api.js` | Serves bundled `lib/changelog.json` |
| `/api/meta` | GET | `routes/api.js` | Returns `{ firstRun, version, hasNewChangelog }` from state file |
| `/api/meta` | POST | `routes/api.js` | Writes state patch to `~/.local/share/observagent/state.json` |

All three are added to the existing `apiRoutes` function in `routes/api.js`. No new route file needed.

---

## New Files

| File | Type | Purpose |
|------|------|---------|
| `lib/cmd-update.js` | CLI module | `npx observagent update` implementation |
| `lib/changelog.json` | Static data | Bundled version history served to dashboard |
| `lib/state.js` | Utility module | `readState()` / `writeState()` with path resolution |
| `frontend/src/components/onboarding/OnboardingOverlay.tsx` | React component | First-run walkthrough UI |
| `frontend/src/components/layout/TopBar.tsx` | React component | Version badge + changelog link |
| `frontend/src/pages/WhatsNewPage.tsx` | React page | Full changelog view at `/whats-new` |

---

## Modified Files

| File | Change |
|------|--------|
| `bin/cli.js` | Add `update` command registration |
| `lib/cmd-start.js` | Add version check fetch + first-run state initialization |
| `routes/api.js` | Add `/api/changelog`, `GET /api/meta`, `POST /api/meta` |
| `frontend/src/App.tsx` | Add `/whats-new` route, ensure `TooltipProvider` wraps routes |
| `frontend/src/pages/LiveDashboard.tsx` | Fetch `/api/meta` on mount, render `<OnboardingOverlay />` conditionally |
| `frontend/src/components/insights/InsightsPanel.tsx` | Add tooltips to chart section labels |
| `frontend/src/components/health/HealthPanel.tsx` | Add tooltips to metric labels |
| `frontend/src/components/cost/CostPanel.tsx` | Add tooltip to "Context Fill" label |
| `frontend/src/components/agents/AgentTree.tsx` | Add tooltip to active count badge |
| `lib/cmd-init.js` | Improve post-install output with clear next steps |
| `lib/cmd-doctor.js` | Overhaul diagnostics with hook activation detection |

---

## Data Flow Additions

```
Version check flow (CLI startup):
  cmd-start.js
    → fetch registry.npmjs.org/latest       [non-blocking, 3s timeout]
    → compare local vs remote version
    → print banner if update available
    → waitForPort → open dashboard (unchanged)

First-run detection flow:
  lib/state.js — readState() / writeState()
    → state.json: { firstRunComplete, installedVersion, lastSeenChangelogVersion }

  cmd-start.js (on first start, state file absent):
    → writeState({ firstRunComplete: false, installedVersion: "2.5.0" })

  LiveDashboard.tsx (mount useEffect):
    → GET /api/meta → { firstRun: true, version, hasNewChangelog }
    → firstRun === true → render <OnboardingOverlay />

  OnboardingOverlay.tsx (user dismisses):
    → POST /api/meta { firstRunComplete: true }
    → setFirstRun(false) → overlay unmounts

Changelog flow:
  lib/changelog.json (bundled with package, updated each release)
    → GET /api/changelog → WhatsNewPage.tsx renders version history
    → GET /api/meta.hasNewChangelog → TopBar.tsx badge dot indicator
    → POST /api/meta { lastSeenChangelogVersion } → clears dot on visit

Update command flow:
  npx observagent update
    → lib/cmd-update.js
    → fetch registry latest version
    → display inline changelog entries since current version
    → spawn: npm install -g @darshannere/observagent@latest
```

---

## Recommended Build Order

Dependencies between features drive this order:

**Step 1 — Foundation (no dependencies):**
`lib/state.js` + `/api/meta` GET + POST in `routes/api.js`

Everything that tracks "has the user been here before" or "what version did they last see" depends on this. Build first. Test with `curl /api/meta`.

**Step 2 — Static data layer (parallel with Step 1):**
`lib/changelog.json` + `/api/changelog` route

Static file, zero risk. Unblocks "What's New" page and version badge.

**Step 3 — CLI version check:**
Modify `lib/cmd-start.js` — add version fetch before `waitForPort`

Standalone. Verifiable by running `observagent start` and checking for the banner.

**Step 4 — Update command:**
`lib/cmd-update.js` + add to `bin/cli.js`

Depends on changelog being defined (Step 2) so it can display inline. Depends on nothing in frontend.

**Step 5 — Frontend infrastructure:**
`App.tsx` — add `/whats-new` route + `TooltipProvider` wrapper; `TopBar.tsx` — version badge

Depends on `/api/changelog` (Step 2) and `/api/meta` (Step 1). Add `TopBar` to `LiveDashboard` layout.

**Step 6 — Tooltip additions:**
Modify `InsightsPanel`, `HealthPanel`, `CostPanel`, `AgentTree`

Mechanical. Depends only on `TooltipProvider` being in place (Step 5). Low risk, do component by component.

**Step 7 — Onboarding walkthrough:**
`OnboardingOverlay.tsx` + `LiveDashboard` integration

Most visible feature. Depends on `/api/meta` (Step 1) and `TooltipProvider` confirmed (Step 5). Build last — validated with a real first-run state.

**Step 8 — CLI init/doctor improvements:**
`cmd-init.js` output + `cmd-doctor.js` overhaul

Independent of all frontend work. Can be done in parallel with Steps 5-7 or last.

---

## Architecture Constraints and Cautions

| Concern | Detail |
|---------|--------|
| Network fetch in CLI | Must be `try/catch` with `AbortSignal.timeout(3000)`. A hung registry fetch must never delay `observagent start`. |
| State file path | Must reuse the same `getDataDir()` logic as the DB path — platform-aware (APPDATA on Windows, `~/.local/share` on POSIX). Extract from `cmd-start.js` into `lib/state.js` to avoid duplication. |
| `TooltipProvider` wrapping | Shadcn/ui `Tooltip` requires `<TooltipProvider>` ancestor. Verify it exists in `App.tsx` or `main.tsx` before adding tooltips. If missing, add as outermost wrapper in `App.tsx`. |
| Changelog JSON import | ESM `import ... assert { type: 'json' }` requires Node 18.3+ and `"type": "module"` in `package.json` (already set). This is satisfied. |
| First-run only once | `OnboardingOverlay` must not re-appear after the user dismisses it, even after server restarts. State file persists this. The DB cleanup on server restart (marks agents 'interrupted') does not touch the state file. |
| `update` command and install method | `npm install -g` requires global npm access. Users who ran via `npx observagent` without a global install need a different instruction. Detect by checking whether the binary lives in a temp npx cache path (e.g., path contains `/.npm/_npx/`). |
| No Zustand additions needed | None of the v2.5 features require new Zustand state. Use local `useState` for `firstRun` and `changelog` in the components that need them. This keeps the store lean. |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| npm registry API endpoint | HIGH | Verified live: `GET /latest` returns `{ version }` |
| Changelog static file pattern | HIGH | Confirmed `lib/` is in `package.json#files`; ESM JSON import works in Node 18+ |
| State file in `~/.local/share/observagent/` | HIGH | `getDbPath()` already uses this dir in `cmd-start.js` |
| Tooltip shadcn/ui integration | HIGH | `tooltip.tsx` confirmed present; needs `TooltipProvider` ancestor check |
| Custom walkthrough vs third-party library | MEDIUM | Avoids bundle bloat; tradeoff is more code but fits the tight layout better |
| `update` command install detection | MEDIUM | npx cache path heuristic needs testing on real systems |

---

## Sources

- npm registry API: `GET https://registry.npmjs.org/@darshannere/observagent/latest` — verified live, returns `{ version: "2.4.0" }` [HIGH]
- XDG Base Directory Specification: [https://specifications.freedesktop.org/basedir/latest/](https://specifications.freedesktop.org/basedir/latest/) [MEDIUM]
- react-joyride considered and rejected: [https://github.com/gilbarbara/react-joyride](https://github.com/gilbarbara/react-joyride) [MEDIUM]
- npm registry internals / dist-tags: [https://www.edoardoscibona.com/exploring-the-npm-registry-api](https://www.edoardoscibona.com/exploring-the-npm-registry-api) [MEDIUM]
- Codebase: `lib/cmd-start.js`, `lib/cmd-init.js`, `lib/cmd-doctor.js`, `bin/cli.js`, `routes/api.js`, `db/schema.js`, `frontend/src/pages/LiveDashboard.tsx`, `frontend/src/store/useObservStore.ts`, `frontend/src/App.tsx`, `frontend/src/components/ui/tooltip.tsx` — all read directly [HIGH]
