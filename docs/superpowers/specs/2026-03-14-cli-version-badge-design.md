# Design: CLI Version Banner + Dashboard Version Badge

**Date:** 2026-03-14
**Phases:** 16 (partial) + 17 (partial)
**Scope:** What is implementable without Phase 15 (state persistence + changelog data layer)

---

## Goal

1. `npx observagent start` — show banner when newer npm version available
2. `npx observagent init` — show numbered next steps after setup
3. `npx observagent doctor` — clean pass/fail checklist with fix commands
4. Dashboard TopBar — static version badge near the LIVE badge

---

## What Is NOT In Scope

- `npx observagent update` command (needs `lib/changelog.json` from Phase 15)
- What's New page / auto-show on upgrade (needs first-run flag from Phase 15)

---

## Architecture

### Phase 16 — CLI Changes

#### 1. Version check banner (`lib/cmd-start.js`)

Add at the top of the file:

```js
import chalk from 'chalk';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');  // lib/ is one level below root
```

Add a `checkForUpdate` function. The exact implementation:

```js
async function checkForUpdate(localVersion) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch('https://registry.npmjs.org/@darshannere/observagent/latest', {
      signal: controller.signal,
    });
    const { version: latest } = await res.json();
    if (latest && latest !== localVersion) {
      const line1 = `  Update available  ${localVersion} → ${latest}`;
      const line2 = `  npm install -g @darshannere/observagent`;
      const innerWidth = Math.max(line1.length, line2.length);
      const bar = '═'.repeat(innerWidth + 2);
      console.log(chalk.yellow(`╔${bar}╗`));
      console.log(chalk.yellow(`║ ${line1.padEnd(innerWidth)} ║`));
      console.log(chalk.yellow(`║ ${line2.padEnd(innerWidth)} ║`));
      console.log(chalk.yellow(`╚${bar}╝`));
    }
  } catch {
    // network error, timeout, or abort — silently skip
  } finally {
    clearTimeout(timerId);  // clears the setTimeout timer, not the AbortController
  }
}
```

`checkForUpdate` runs **only in the new-server branch** (after `waitForPort`), not in the already-running branch. The already-running branch (`if (await isServerRunning(portNum))`) returns early and is not affected.

After `waitForPort` resolves, replace the existing `await open(url)` call with:

```js
await Promise.all([
  open(url),
  checkForUpdate(version),
]);
```

The banner may print after the browser opens — this ordering is intentional; startup is never delayed.

#### 2. Better `init` output (`lib/cmd-init.js`)

No chalk import needed. Plain unicode only.

**Fresh-install path** — replace the existing `console.log`:
```js
// Before:
console.log('✓ ObservAgent hooks installed\n\nRun: observagent start');
// After:
console.log('✓ ObservAgent hooks installed');
console.log('\nNext steps:');
console.log('  1. Start the server:   npx observagent start');
console.log('  2. Trigger a session:  open Claude Code and run any task');
console.log('  3. View dashboard:     http://localhost:4999');
```

**Already-installed path** — replace BOTH `console.log('✓ Already installed')` AND `process.exit(0)` together as a unit. Note: removing `process.exit(0)` here also fixes a bug where `cmd-doctor --fix` would terminate the whole process when hooks were already installed:
```js
// Before:
console.log('✓ Already installed');
process.exit(0);
// After:
console.log('✓ ObservAgent already configured');
console.log('\nNext steps:');
console.log('  1. Start the server:   npx observagent start');
console.log('  2. Trigger a session:  open Claude Code and run any task');
console.log('  3. View dashboard:     http://localhost:4999');
return;
```

#### 3. Better `doctor` output (`lib/cmd-doctor.js`)

Chalk already imported.

Add a `showJsonBlock` property to the hooks check object:
```js
{
  label: 'Hooks installed in ~/.claude/settings.json',
  run: checkHooksInstalled,
  fixCmd: 'observagent init',
  autoFixable: true,
  autoFix: runInit,
  showJsonBlock: true,   // add this
},
```

Before the checklist loop, add:
```js
console.log(chalk.bold('\nObservAgent Health Check'));
console.log('────────────────────────');
```

In the failure branch inside the loop, after the existing `Fix:` line, add:
```js
if (check.showJsonBlock) {
  console.log(`     Or add manually to ~/.claude/settings.json:\n`);
  console.log(`     {`);
  console.log(`       "hooks": {`);
  console.log(`         "PreToolUse":    [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/relay.py" }] }],`);
  console.log(`         "PostToolUse":   [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/relay.py" }] }],`);
  console.log(`         "SubagentStart": [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/relay.py" }] }],`);
  console.log(`         "SubagentStop":  [{ "hooks": [{ "type": "command", "command": "python3 ~/.claude/observagent/relay.py" }] }]`);
  console.log(`       }`);
  console.log(`     }`);
}
```

No chalk color on the JSON block. Exit code behaviour unchanged.

---

### Phase 17 (partial) — Version Badge

#### New endpoint: `GET /api/meta` in `routes/api.js`

Add at the **top of the file**, before the `apiRoutes` function and alongside the existing `import fs from 'fs'`:

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');  // routes/ is one level below root
```

Inside `apiRoutes`:
```js
fastify.get('/api/meta', async () => ({ version }));
```

Happy path: `200 { "version": "2.4.0" }`. If `require` throws at module load time, Fastify fails to start — acceptable, this path does not occur in normal npm installs.

#### Version badge in `frontend/src/pages/LiveDashboard.tsx`

Add `version` state with the other `useState` hooks at the top of the component body (after `useSearchParams`, alongside `activeTab`):
```ts
const [version, setVersion] = useState<string | null>(null)
```

In the existing mount `useEffect`, add alongside the other fetches:
```ts
fetch('/api/meta')
  .then(r => r.json())
  .then(data => { if (!cancelled) setVersion(data.version ?? null) })
  .catch(() => {})
```

In the TopBar JSX, insert the badge as a sibling `<span>` **immediately after the closing `</div>` of the LIVE badge and before `<div className="ml-auto ...">` nav tabs div**. Do NOT add `ml-auto` — the badge sits left-of-nav, visually grouped with LIVE:

```tsx
{/* LIVE badge — existing */}
<div className="flex items-center gap-1 px-2 py-0.5 rounded ...">
  ...
</div>

{/* Version badge — new sibling */}
{version && (
  <span className="font-mono text-[10px] text-[#3d5a7a]">v{version}</span>
)}

{/* Nav tabs — existing, ml-auto pushes to right edge */}
<div className="ml-auto flex items-center gap-1">
  ...
</div>
```

No border, no background, no click handler. `version === null` → badge not rendered.

**Verification:** Disconnect from the internet and run `npx observagent start`. The browser must open normally and no error must appear in the terminal — confirming the 2-second abort prevents startup delay.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/cmd-start.js` | Add `chalk` + `createRequire` imports; add `checkForUpdate` function; replace `await open(url)` with `Promise.all([open(url), checkForUpdate(version)])` |
| `lib/cmd-init.js` | Replace `process.exit(0)` + log on already-installed path with `return` + next-steps; add next-steps to fresh-install path |
| `lib/cmd-doctor.js` | Add header before checklist; add `showJsonBlock` property to hooks check; print JSON block when `check.showJsonBlock` is true |
| `routes/api.js` | Add `createRequire` + version read at top of file; register `GET /api/meta` inside `apiRoutes` |
| `frontend/src/pages/LiveDashboard.tsx` | Add `version` state; fetch `/api/meta` in mount effect; insert badge between LIVE badge and nav tabs |

---

## Phase 15 Hook Points

When Phase 15 is implemented:

- `GET /api/meta` gains `first_run` and `last_version` fields from `lib/state.js`
- The version badge becomes clickable, navigating to `/whats-new`
- `npx observagent update` command added using `lib/changelog.json`

---

## Out of Scope / Future

- `npx observagent update` command
- What's New page
- Auto-show on upgrade
- Version badge click behaviour
