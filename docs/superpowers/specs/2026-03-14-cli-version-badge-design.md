# Design: CLI Version Banner + Dashboard Version Badge

**Date:** 2026-03-14
**Phases:** 16 (partial) + 17 (partial)
**Scope:** What is implementable without Phase 15 (state persistence + changelog data layer)

---

## Goal

1. Users running `npx observagent start` see a banner when a newer version is available on npm.
2. Users running `npx observagent init` see numbered next steps after setup completes.
3. Users running `npx observagent doctor` see a clean pass/fail checklist with inline fix commands.
4. The dashboard TopBar shows the current ObservAgent version as a static badge.

---

## What Is NOT In Scope

- `npx observagent update` command (needs `lib/changelog.json` from Phase 15)
- What's New page / auto-show on upgrade (needs `/api/meta` first-run flag from Phase 15)

---

## Architecture

### Phase 16 — CLI Changes

#### 1. Version check banner (`lib/cmd-start.js`)

After the server starts and before `open()` is called, fire a non-blocking npm registry check:

- Fetch `https://registry.npmjs.org/@darshannere/observagent/latest` with a 2-second timeout
- Compare returned `version` against local `package.json` version using semver comparison
- If newer: print a yellow chalk banner:
  ```
  ┌─────────────────────────────────────────────────────────┐
  │  New version available: 2.4.0 → 2.5.0                  │
  │  Run: npm install -g @darshannere/observagent           │
  └─────────────────────────────────────────────────────────┘
  ```
- If registry unreachable or times out: silently skip — startup is never delayed
- Check must be fully non-blocking: server open happens regardless of check result

**Implementation note:** Use `Promise.race` with a 2-second timeout promise to enforce the deadline.

#### 2. Better `init` output (`lib/cmd-init.js`)

After the success message, print numbered next steps:

```
✓ ObservAgent hooks installed

Next steps:
  1. Start the server:   npx observagent start
  2. Trigger a session:  open Claude Code and run any task
  3. View dashboard:     http://localhost:4999
```

Change applies to both fresh-install and already-installed paths.

#### 3. Better `doctor` output (`lib/cmd-doctor.js`)

The checklist structure already exists. Changes:
- Add a header line: `ObservAgent Health Check` before the checklist
- When hooks are not installed, show the exact JSON block to add to `~/.claude/settings.json` in addition to the fix command
- Exit code behaviour unchanged (1 on any failure, 0 on all pass)

---

### Phase 17 (partial) — Version Badge

#### New endpoint: `GET /api/meta`

Added to `routes/api.js`. Returns:

```json
{ "version": "2.4.0" }
```

Reads version from `package.json` at startup (already available in `bin/cli.js` via `createRequire`). No state file, no first-run flag — those are Phase 15 additions.

#### Version badge in TopBar (`frontend/src/pages/LiveDashboard.tsx`)

- On mount, `LiveDashboard` fetches `/api/meta` and stores `version` in local `useState`
- Badge renders next to the logo in the existing TopBar inline markup:
  ```
  ObservAgent  [LIVE]  v2.4.0  |  Live  History
  ```
- Style: same monospace font, muted cyan color (`text-[#3d5a7a]`), no border — subtle, not distracting
- If the fetch fails, the badge is simply not rendered (no error state)
- Not clickable (no What's New page yet)

---

## Files Changed

| File | Change |
|------|--------|
| `lib/cmd-start.js` | Add non-blocking npm version check + banner |
| `lib/cmd-init.js` | Add numbered next-steps after success |
| `lib/cmd-doctor.js` | Add header + hooks JSON block on failure |
| `routes/api.js` | Add `GET /api/meta` endpoint |
| `frontend/src/pages/LiveDashboard.tsx` | Fetch `/api/meta`, render version badge in TopBar |

---

## Phase 15 Hook Points

When Phase 15 is implemented, these stubs expand cleanly:

- `GET /api/meta` gains `first_run` and `last_version` fields from `lib/state.js`
- The version badge becomes clickable, navigating to `/whats-new`
- `npx observagent update` command added using `lib/changelog.json`

---

## Out of Scope / Future

- `npx observagent update` command
- What's New page
- Auto-show on upgrade
- Version badge click behaviour
