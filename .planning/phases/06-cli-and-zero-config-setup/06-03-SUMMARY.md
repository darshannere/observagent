---
phase: 06-cli-and-zero-config-setup
plan: 03
subsystem: infra
tags: [cli, start, doctor, child_process, net, open, chalk, health-check, tcp-probe, browser-open]

# Dependency graph
requires:
  - phase: 06-cli-and-zero-config-setup
    plan: 02
    provides: bin/cli.js Commander entry point with dynamic imports wired for start and doctor; lib/cmd-init.js for --fix auto-repair
  - phase: 06-cli-and-zero-config-setup
    plan: 01
    provides: open and chalk packages installed; server.js exists as spawn target
affects:
  - 06-04-cli-doctor (if separate plan extends doctor)

provides:
  - lib/cmd-start.js — runStart() spawns server.js foreground, polls TCP, opens browser, forwards SIGINT
  - lib/cmd-doctor.js — runDoctor() three-check health report with colored TTY output and --fix auto-repair
  - SETUP-03 and SETUP-04 requirements satisfied

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TCP probe via net.createConnection with 1000ms timeout — deterministic port readiness check without shell commands"
    - "waitForPort polling loop: 200ms interval up to 10s timeout — resilient startup wait before browser open"
    - "spawn with stdio: 'inherit' for foreground server — logs stream directly to user terminal"
    - "process.on('SIGINT') forwards to child.kill('SIGINT') — clean shutdown on Ctrl+C"
    - "chalk auto-strips ANSI when not TTY — no manual process.stdout.isTTY check needed"
    - "ENOENT-safe readdir in JSONL check — ~/.claude/projects/ may not exist on fresh install"

key-files:
  created:
    - lib/cmd-start.js
    - lib/cmd-doctor.js
  modified: []

key-decisions:
  - "stdio: 'inherit' for server spawn — server logs stream to user terminal; no pipe buffering or output loss"
  - "waitForPort polls before open() call — prevents browser from hitting a 404 on server that hasn't initialized yet"
  - "getDbPath() uses APPDATA ?? homedir() on win32 — handles rare case where APPDATA is unset"
  - "foreground server not auto-startable from doctor --fix — server requires an attached TTY; doctor cannot detach a background server safely"
  - "checkHooksInstalled scans all four Claude Code events — relay.py in any one event is sufficient proof of install"
  - "checkJsonlFiles walks subdirectory level only (not recursive) — ~/.claude/projects/ is always one level deep per Claude Code convention"

patterns-established:
  - "isServerRunning() duplicated in cmd-start.js and cmd-doctor.js — lightweight enough that shared module would add more complexity than value; both files are self-contained"

requirements-completed:
  - SETUP-03
  - SETUP-04

# Metrics
duration: ~1min
completed: 2026-03-01
---

# Phase 6 Plan 03: Start and Doctor Subcommands Summary

**Foreground server spawner with TCP readiness polling + browser open, and a three-check health reporter with TTY-colored output and --fix auto-repair for hooks**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-01T06:41:26Z
- **Completed:** 2026-03-01T06:42:36Z
- **Tasks:** 2
- **Files modified:** 2 (lib/cmd-start.js, lib/cmd-doctor.js)

## Accomplishments
- Created lib/cmd-start.js: idempotent server start (TCP probe before spawn), waits for port readiness before opening browser, streams server logs to terminal via stdio: inherit, forwards SIGINT for clean shutdown
- Created lib/cmd-doctor.js: three-check health report (server running, hooks installed, JSONL files found), chalk auto-adapts for TTY vs pipe, --fix calls runInit() for hooks repair, exits 0/1 correctly
- Both commands fully integrated with bin/cli.js dynamic imports from 06-02 — `node bin/cli.js start` and `node bin/cli.js doctor` work end-to-end
- All five verification checks from plan passed: --help for both commands, doctor exit code, all three check labels visible, uncolored pipe output

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/cmd-start.js — foreground server spawn + browser open** - `2c1f2e4` (feat)
2. **Task 2: Create lib/cmd-doctor.js — three-check health report with --fix** - `719eb7e` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `lib/cmd-start.js` - runStart() export; spawns server.js via child_process, polls TCP port, opens browser with open package, holds process alive until child exits
- `lib/cmd-doctor.js` - runDoctor() export; three health checks with chalk.green/red output, fix hints in chalk.yellow, auto-runs runInit() when --fix passed and hooks missing

## Decisions Made
- `stdio: 'inherit'` for server spawn — server logs stream directly to user terminal; no buffering, no output loss, identical to running `node server.js` directly
- waitForPort polls before browser open — prevents browser from hitting a server that hasn't finished initializing routes/DB
- Foreground server not auto-startable from `doctor --fix` — doctor's check is boolean; starting a foreground server from within doctor would block doctor from completing; user must run `observagent start` separately
- `checkHooksInstalled` scans all four hook events — any one event with relay.py is sufficient evidence that init was run
- `checkJsonlFiles` uses one-level readdir — ~/.claude/projects/ uses flat project-directory structure per Claude Code convention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both files matched plan spec exactly and all verifications passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SETUP-03 (doctor) and SETUP-04 (start) requirements fully satisfied
- lib/cmd-start.js complete — ready for 06-04 if additional CLI commands are needed
- lib/cmd-doctor.js complete — --fix hook repair works end-to-end via runInit() from 06-02
- All Phase 6 operational commands (init, start, doctor) are now implemented

## Self-Check: PASSED

- FOUND: lib/cmd-start.js
- FOUND: lib/cmd-doctor.js
- FOUND: 2c1f2e4 (Task 1 commit)
- FOUND: 719eb7e (Task 2 commit)

---
*Phase: 06-cli-and-zero-config-setup*
*Completed: 2026-03-01*
