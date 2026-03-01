---
phase: 06-cli-and-zero-config-setup
plan: 01
subsystem: infra
tags: [npm, cli, commander, chalk, open, env-vars, package-json]

# Dependency graph
requires:
  - phase: 05-session-history-and-discovery
    provides: completed server.js with all routes; package.json as baseline
provides:
  - package.json bin entry mapping observagent to ./bin/cli.js
  - package.json files array for npm publish
  - chalk, commander, open installed in node_modules
  - server.js env-driven PORT (process.env.PORT ?? 4999)
  - server.js env-driven DB path (process.env.OBSERVAGENT_DB_PATH ?? ./observagent.db)
affects:
  - 06-02-cli-start-command
  - 06-03-cli-status-and-logs
  - 06-04-auto-hook-install

# Tech tracking
tech-stack:
  added:
    - chalk ^5.3.0 (ESM terminal coloring)
    - commander ^14.0.3 (CLI argument/subcommand parsing)
    - open ^10.1.0 (cross-platform browser launcher)
  patterns:
    - process.env.VAR ?? 'default' pattern for all server env-var reads
    - bin field in package.json for npm global install resolution

key-files:
  created: []
  modified:
    - package.json
    - server.js

key-decisions:
  - "chalk ^5.3.0 not 4.x — ESM project requires ESM-compatible chalk; 4.x is CommonJS-only"
  - "open ^10.1.0 not ^11 — tested stable version per plan spec"
  - "commander ^14.0.3 per plan spec — latest stable at plan time"
  - "parseInt(process.env.PORT ?? '4999', 10) — explicit radix 10, nullish coalescing preserves 0 as valid port"
  - "Fallback ?? not || — preserves PORT=0 as valid (test environments) and OBSERVAGENT_DB_PATH='' as intentional override"

patterns-established:
  - "Env var pattern: const VAR = process.env.ENV_KEY ?? 'default' before use"
  - "npm bin resolution: bin field maps CLI name to ./bin/cli.js entry point"

requirements-completed:
  - SETUP-01
  - SETUP-03
  - SETUP-04

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 6 Plan 01: CLI and Zero-Config Setup — Package and Server Preparation Summary

**package.json wired for npm global install (bin + files + 3 CLI deps), server.js reads PORT and OBSERVAGENT_DB_PATH from environment with correct fallbacks**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-01T06:32:27Z
- **Completed:** 2026-03-01T06:37:00Z
- **Tasks:** 2
- **Files modified:** 2 (package.json, server.js) + package-lock.json

## Accomplishments
- Added bin field to package.json mapping `observagent` to `./bin/cli.js` — required for npm global install resolution
- Added files array restricting npm publish to runtime dirs only (bin/, lib/, routes/, public/, db/, hooks/, server.js)
- Installed chalk ^5.3.0, commander ^14.0.3, open ^10.1.0 — all ESM-compatible, no CommonJS conflicts
- Made server.js read PORT from environment with parseInt and ?? fallback to 4999
- Made server.js read OBSERVAGENT_DB_PATH from environment with ?? fallback to ./observagent.db
- Verified PORT=9999 env var correctly binds server to port 9999; default (no env var) still binds to 4999

## Task Commits

Each task was committed atomically:

1. **Task 1: Update package.json — bin field, files array, new dependencies** - `f16ee58` (feat)
2. **Task 2: Update server.js — env-driven PORT and DB path** - `a631e39` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `package.json` - Added bin, files, description, keywords; added chalk/commander/open to dependencies
- `server.js` - DB path and PORT now read from environment variables with correct defaults

## Decisions Made
- Used `??` (nullish coalescing) not `||` for env var fallbacks — preserves PORT=0 as valid and DB path of empty string as intentional override
- `parseInt(..., 10)` with explicit radix — prevents octal parsing edge cases
- chalk ^5.3.0 explicitly chosen over 4.x — ESM project incompatible with chalk 4.x CommonJS build
- open ^10.1.0 specified per plan — tested stable version; v11 not validated
- commander ^14.0.3 per plan — latest stable at plan authoring time

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The plan's Task 1 verification command used the old `assert` import attribute syntax (`{assert:{type:'json'}}`), which Node 22 has replaced with `{with:{type:'json'}}`. Used the correct Node 22 syntax for verification only — no change to production code needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- package.json bin field ready — 06-02 can now create bin/cli.js and npm will resolve it as a command
- chalk, commander, open in node_modules — all CLI plans can import them immediately
- server.js PORT env var ready — `observagent start --port 4998` will work once CLI passes PORT env to child process
- OBSERVAGENT_DB_PATH ready — global install can write DB to user data directory

## Self-Check: PASSED

- FOUND: package.json
- FOUND: server.js
- FOUND: 06-01-SUMMARY.md
- FOUND: f16ee58 (Task 1 commit)
- FOUND: a631e39 (Task 2 commit)

---
*Phase: 06-cli-and-zero-config-setup*
*Completed: 2026-03-01*
