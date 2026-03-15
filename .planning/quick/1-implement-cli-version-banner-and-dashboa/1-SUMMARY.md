---
phase: quick-1
plan: 1
subsystem: cli, api, dashboard
tags: [version, cli, dx, update-notifier, badge]
dependency_graph:
  requires: []
  provides: [GET /api/meta, checkForUpdate, version-badge]
  affects: [lib/cmd-start.js, lib/cmd-init.js, lib/cmd-doctor.js, routes/api.js, frontend/src/pages/LiveDashboard.tsx]
tech_stack:
  added: []
  patterns: [AbortController timeout, Promise.all concurrency, createRequire in ESM]
key_files:
  created: []
  modified:
    - lib/cmd-start.js
    - lib/cmd-init.js
    - lib/cmd-doctor.js
    - routes/api.js
    - frontend/src/pages/LiveDashboard.tsx
decisions:
  - checkForUpdate runs concurrently with open() via Promise.all — startup never delayed
  - process.exit(0) removed from cmd-init.js already-installed path; replaced with return — fixes cmd-doctor --fix terminating early
  - showJsonBlock property on doctor checks array drives optional JSON snippet output
  - version state in LiveDashboard is null until /api/meta responds — badge hidden until data arrives
metrics:
  duration: ~8 minutes
  completed_date: "2026-03-15T00:34:12Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
---

# Quick Task 1: CLI Version Banner and Dashboard Version Badge Summary

**One-liner:** Non-blocking npm update banner in CLI start, numbered next-steps in init/doctor, and a muted version badge in the dashboard TopBar via a new GET /api/meta endpoint.

---

## What Was Implemented

### Task 1 — CLI Improvements (lib/cmd-start.js, lib/cmd-init.js, lib/cmd-doctor.js)

**cmd-start.js:**
- Added `chalk` and `createRequire` imports; read `version` from `package.json` at module load
- Added `checkForUpdate(localVersion)` function: fetches `registry.npmjs.org/@darshannere/observagent/latest` with a 2-second AbortController timeout; prints a yellow double-line border banner only when a newer version is available; all errors and timeouts are silently swallowed
- In the new-server branch, replaced `await open(url)` with `await Promise.all([open(url), checkForUpdate(version)])` so the version check never delays browser open or server startup

**cmd-init.js:**
- Already-installed path: replaced `console.log('✓ Already installed'); process.exit(0)` with `console.log('✓ ObservAgent already configured')` + numbered next-steps + `return` — removes a bug where `cmd-doctor --fix` would kill the whole process when hooks were already installed
- Fresh-install path: replaced single-line log with numbered next-steps (start / trigger / dashboard URL)

**cmd-doctor.js:**
- Added `chalk.bold('\nObservAgent Health Check')` header and separator line before the checklist loop
- Added `showJsonBlock: true` property to the hooks check object
- In the failure branch, after the `Fix:` line, added conditional JSON block display when `check.showJsonBlock` is truthy — no chalk color on the JSON content

### Task 2 — Backend + Dashboard (routes/api.js, frontend/src/pages/LiveDashboard.tsx)

**routes/api.js:**
- Added `createRequire` import and `version` read from `../package.json` at the top of the file
- Registered `fastify.get('/api/meta', async () => ({ version }))` inside `apiRoutes` alongside the other endpoints

**LiveDashboard.tsx:**
- Added `const [version, setVersion] = useState<string | null>(null)` alongside other state declarations
- Added `/api/meta` fetch in the existing mount `useEffect` with a `!cancelled` guard
- Inserted `{version && <span className="font-mono text-[10px] text-[#3d5a7a]">v{version}</span>}` in the TopBar JSX immediately after the LIVE badge's closing `</div>` and before the `ml-auto` nav tabs div

---

## Decisions Made

1. **Promise.all for concurrent update check** — `checkForUpdate` runs in parallel with `open(url)`, not before or after. The banner may print after the browser opens; this is intentional.
2. **return vs process.exit(0) in cmd-init.js** — Changing to `return` fixes the silent cmd-doctor --fix termination bug without any behavioral change in the normal `npx observagent init` flow.
3. **null state hides badge** — `version === null` until `/api/meta` responds; the badge only renders when data is available. This handles server downtime gracefully.
4. **No new dependencies** — `chalk` was already a direct dependency; `createRequire` is Node built-in. Zero additions to `package.json`.

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

- `node -e "import('./lib/cmd-start.js').then(m => console.log(typeof m.runStart))"` → `function`
- `node -e "import('./lib/cmd-init.js').then(m => console.log(typeof m.runInit))"` → `function`
- `node -e "import('./lib/cmd-doctor.js').then(m => console.log(typeof m.runDoctor))"` → `function`
- `node -e "import('./routes/api.js').then(() => console.log('OK'))"` → `OK`
- TypeScript: `npx tsc --noEmit` → no output (clean)

---

## Self-Check: PASSED

Files modified exist:
- lib/cmd-start.js — FOUND
- lib/cmd-init.js — FOUND
- lib/cmd-doctor.js — FOUND
- routes/api.js — FOUND
- frontend/src/pages/LiveDashboard.tsx — FOUND

Commits:
- 51b1363 feat(quick-1): improve CLI output for start, init, and doctor
- 48e61bb feat(quick-1): add GET /api/meta endpoint and dashboard version badge
