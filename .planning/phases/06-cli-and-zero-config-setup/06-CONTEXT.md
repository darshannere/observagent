# Phase 6: CLI and Zero-Config Setup - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Three terminal commands that take a developer from zero to live dashboard with no documentation required:
- `npx observagent init` — configures Claude Code hooks in ~/.claude/settings.json
- `observagent start` — starts the server and opens the dashboard
- `observagent doctor` — diagnoses setup problems with actionable fix hints

This phase is about the invocation experience. The dashboard, server, and data pipeline already exist from Phases 1–5. This phase wraps them in a polished, zero-friction CLI.

</domain>

<decisions>
## Implementation Decisions

### init hook behavior
- **Merge** ObservAgent hooks alongside existing hooks in settings.json — non-destructive, reads existing config and appends
- If settings.json doesn't exist, create it
- If ObservAgent hooks are already present, **skip silently** — print "✓ Already installed" and exit 0 (idempotent)
- On success: minimal confirmation + next step — e.g. `✓ ObservAgent hooks installed\n\nRun: observagent start`
- `init` does **only** hook configuration — it does NOT start the server

### start command mode
- **Foreground process** — blocking, streams logs to terminal, Ctrl+C to stop
- **Auto-open browser** when server is confirmed ready — use `open` (macOS) / `xdg-open` (Linux) / `start` (Windows)
- If server is already running on the port: detect, print "ObservAgent already running at http://localhost:4999", open browser, exit 0
- **--port flag** supported — default 4999, override with `--port 5000` etc.

### doctor output & fixes
- **Colored checklist with fix hints** — uses chalk (or equivalent) for green ✓ / red ✗, no color if NOT a TTY
- **Default: report-only** — each failing check prints the exact command to fix it
- **--fix flag** — auto-repairs all found issues without prompting
- **Exactly three checks** (from spec):
  1. Server running at expected port
  2. Hooks installed in ~/.claude/settings.json
  3. JSONL files found in ~/.claude/projects/
- Exit code: 0 if all pass, 1 if any fail (scriptable)

### Package & distribution
- **Package name:** `observagent` on npm (clean, matches product, `npx observagent init` just works)
- **Single package** — CLI + server bundled together (bin/cli.js, server.js, routes/, public/, db/ all in one)
- **bin entry:** `observagent` → `bin/cli.js`
- `npx observagent init` works cold (downloads package on first use)
- After `npm install -g observagent`, persistent `observagent start` and `observagent doctor` commands are available

### Claude's Discretion
- Exact chalk color palette and icon choices for doctor output
- Internal structure of bin/cli.js (commander, yargs, or manual arg parsing)
- How browser-open is implemented cross-platform (use `open` npm package or raw exec)
- Where the server data directory (SQLite DB) lives when installed globally

</decisions>

<specifics>
## Specific Ideas

- The zero-to-dashboard target is **under two minutes** on a clean machine — this shapes how fast and quiet the install flow should be
- `npx observagent init` should work as the very first command someone types after reading the README — no prior setup expected

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-cli-and-zero-config-setup*
*Context gathered: 2026-02-27*
