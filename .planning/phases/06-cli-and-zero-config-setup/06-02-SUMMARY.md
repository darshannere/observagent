---
phase: 06-cli-and-zero-config-setup
plan: 02
subsystem: infra
tags: [cli, commander, hooks, settings-json, relay-py, zero-config, idempotent]

# Dependency graph
requires:
  - phase: 06-cli-and-zero-config-setup
    plan: 01
    provides: package.json with bin field mapping observagent to ./bin/cli.js; chalk/commander/open installed; hooks/relay.py exists
affects:
  - 06-03-cli-start-command
  - 06-04-cli-doctor

provides:
  - bin/cli.js — Commander entry point with init/start/doctor subcommands using dynamic imports
  - lib/cmd-init.js — non-destructive settings.json hook merge with idempotency
  - ~/.claude/observagent/relay.py stable path for hook command
  - All 4 Claude Code events (PreToolUse, PostToolUse, SubagentStart, SubagentStop) receive ObservAgent hook

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic imports inside .action() handlers — prevents ERR_MODULE_NOT_FOUND at --help time for modules not yet created"
    - "Idempotency via command.includes('relay.py') scan — works for both old project-path hooks and new stable-path hooks"
    - "settings.hooks[event] ??= [] — safe merge that never overwrites existing non-relay hook groups"
    - "Always copy relay.py on init (overwrite) — handles upgrades transparently"

key-files:
  created:
    - bin/cli.js
    - lib/cmd-init.js
  modified: []

key-decisions:
  - "Dynamic imports inside action() handlers not top-level — ESM resolves static imports at load time; dynamic imports are deferred to invocation, so --help works before cmd-start.js/cmd-doctor.js exist"
  - "Idempotency checks command string for 'relay.py' substring — catches both ~/.claude/observagent/relay.py and legacy project-path hooks"
  - "relay.py always overwritten on init — handles version upgrades of relay.py without user manual steps"
  - "RELAY_DEST uses os.homedir() absolute path — never project node_modules path which breaks on npx or global install"

patterns-established:
  - "Commander subcommand pattern: program.command('name').description('...').action(async () => { const { fn } = await import('../lib/cmd-name.js'); await fn(); })"

requirements-completed:
  - SETUP-01

# Metrics
duration: ~3min
completed: 2026-03-01
---

# Phase 6 Plan 02: CLI Entry Point and Init Subcommand Summary

**Commander CLI with dynamic-import subcommands and non-destructive settings.json hook merge that installs relay.py into all 4 Claude Code events idempotently**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-01T06:36:24Z
- **Completed:** 2026-03-01T06:39:01Z
- **Tasks:** 2
- **Files modified:** 2 (bin/cli.js, lib/cmd-init.js)

## Accomplishments
- Created bin/cli.js with Commander dispatch for init/start/doctor — dynamic imports prevent module-not-found errors before Wave 3 ships
- Created lib/cmd-init.js with idempotent hook installation: scans existing hooks for relay.py, skips if already present
- Hook merge is additive — existing settings.json fields (statusLine, enabledPlugins, other hooks) are fully preserved
- relay.py is always copied to ~/.claude/observagent/relay.py on every init run (upgrade-safe)
- All 4 Claude Code hook events receive the ObservAgent entry with correct absolute path

## Task Commits

Each task was committed atomically:

1. **Task 1: Create bin/cli.js — Commander entry point with dynamic imports** - `bc9f71f` (feat)
2. **Task 2: Create lib/cmd-init.js — settings.json merge + relay.py copy** - `ac8cca0` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `bin/cli.js` - Commander CLI entry point; #!/usr/bin/env node shebang; init/start/doctor subcommands with dynamic imports
- `lib/cmd-init.js` - runInit() export; reads ~/.claude/settings.json, merges hooks non-destructively, copies relay.py, idempotent

## Decisions Made
- Used dynamic imports inside each `.action()` handler — ESM resolves static imports at load time, so importing cmd-start.js or cmd-doctor.js at the top of cli.js would throw ERR_MODULE_NOT_FOUND since those files don't exist until Plan 06-03. Dynamic imports defer resolution to when the subcommand is actually invoked.
- Idempotency check uses `h.command?.includes('relay.py')` — catches both `~/.claude/observagent/relay.py` (new path) and legacy project-directory paths like `/path/to/project/hooks/relay.py`; either means ObservAgent is already wired
- relay.py is overwritten on every init run — not just on first install — so `observagent init` after upgrading the package automatically deploys the new relay script to the stable path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The plan's verification command uses a monkey-patched `process.exit` to prevent actual process termination during the test. This causes both code paths (Already installed + fresh install) to execute in sequence in the same process, producing duplicate entries in settings.json. Resolved by:
1. Cleaning up the duplicate entries after the monkey-patched verify
2. Running the actual `node bin/cli.js init` command for proper idempotency verification
3. Confirmed: real binary behavior is correct — second run prints "Already installed" and does not add duplicate hooks

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- bin/cli.js ready for 06-03 to add lib/cmd-start.js (dynamic import already wired in start action)
- bin/cli.js ready for 06-03/06-04 to add lib/cmd-doctor.js (dynamic import already wired in doctor action)
- lib/cmd-init.js complete — SETUP-01 requirement fully satisfied

## Self-Check: PASSED

- FOUND: bin/cli.js
- FOUND: lib/cmd-init.js
- FOUND: bc9f71f (Task 1 commit)
- FOUND: ac8cca0 (Task 2 commit)

---
*Phase: 06-cli-and-zero-config-setup*
*Completed: 2026-03-01*
