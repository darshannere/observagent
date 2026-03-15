---
phase: quick-1
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/cmd-start.js
  - lib/cmd-init.js
  - lib/cmd-doctor.js
  - routes/api.js
  - frontend/src/pages/LiveDashboard.tsx
autonomous: true
requirements: [VER-01, VER-02, VER-03, CLI-01, CLI-02, CLI-03]
must_haves:
  truths:
    - "`npx observagent start` shows an update banner when a newer npm version is available, never blocks startup"
    - "`npx observagent init` prints numbered next steps on both fresh-install and already-installed paths"
    - "`npx observagent doctor` prints a header and shows a JSON snippet when hooks are missing"
    - "Dashboard TopBar shows a version badge (e.g. v2.4.0) between the LIVE badge and the nav tabs"
  artifacts:
    - path: lib/cmd-start.js
      provides: checkForUpdate function + Promise.all([open, checkForUpdate]) integration
    - path: lib/cmd-init.js
      provides: numbered next-steps on both code paths, process.exit(0) removed
    - path: lib/cmd-doctor.js
      provides: header + showJsonBlock on hooks check failure
    - path: routes/api.js
      provides: GET /api/meta returning { version }
    - path: frontend/src/pages/LiveDashboard.tsx
      provides: version state, /api/meta fetch, badge rendered in TopBar
  key_links:
    - from: lib/cmd-start.js
      to: registry.npmjs.org
      via: fetch with 2-second AbortController timeout
    - from: frontend/src/pages/LiveDashboard.tsx
      to: /api/meta
      via: fetch in mount useEffect, sets version state
---

<objective>
Implement CLI version banner, improved init and doctor output, and a dashboard version badge.

Purpose: Surface the current package version in the dashboard TopBar and notify CLI users when an update is available, while making `init` and `doctor` output more actionable.
Output: Five files modified — no new files, no new dependencies.
</objective>

<execution_context>
@/Users/darshannere/.claude/get-shit-done/workflows/execute-plan.md
@/Users/darshannere/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/1-implement-cli-version-banner-and-dashboa/1-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: CLI improvements — cmd-start, cmd-init, cmd-doctor</name>
  <files>lib/cmd-start.js, lib/cmd-init.js, lib/cmd-doctor.js</files>
  <action>
**lib/cmd-start.js** — Add `chalk` and `createRequire` imports at the top of the file (after existing imports):

```js
import chalk from 'chalk';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
```

Add the `checkForUpdate` function before `runStart`:

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
    clearTimeout(timerId);
  }
}
```

Replace the existing `await open(url);` line (line 68 — in the new-server branch, after `waitForPort` resolves) with:

```js
await Promise.all([
  open(url),
  checkForUpdate(version),
]);
```

Do NOT touch the `await open(url)` on line 41 (the already-running-server branch) — that path returns early and is unaffected.

---

**lib/cmd-init.js** — Two changes:

1. Fresh-install path (currently line 59): Replace `console.log('✓ ObservAgent hooks installed\n\nRun: observagent start');` with:
```js
console.log('✓ ObservAgent hooks installed');
console.log('\nNext steps:');
console.log('  1. Start the server:   npx observagent start');
console.log('  2. Trigger a session:  open Claude Code and run any task');
console.log('  3. View dashboard:     http://localhost:4999');
```

2. Already-installed path (currently lines 42-44): Replace `console.log('✓ Already installed'); process.exit(0);` with:
```js
console.log('✓ ObservAgent already configured');
console.log('\nNext steps:');
console.log('  1. Start the server:   npx observagent start');
console.log('  2. Trigger a session:  open Claude Code and run any task');
console.log('  3. View dashboard:     http://localhost:4999');
return;
```
Note: `process.exit(0)` → `return` also fixes a bug where `cmd-doctor --fix` would kill the whole process when hooks were already installed.

---

**lib/cmd-doctor.js** — Three changes:

1. Add `showJsonBlock: true` to the hooks check object (the second entry in `checks`, with label `'Hooks installed in ~/.claude/settings.json'`):
```js
{
  label: 'Hooks installed in ~/.claude/settings.json',
  run: checkHooksInstalled,
  fixCmd: 'observagent init',
  autoFixable: true,
  autoFix: runInit,
  showJsonBlock: true,   // add this line
},
```

2. Before the `for (const check of checks)` loop, add:
```js
console.log(chalk.bold('\nObservAgent Health Check'));
console.log('────────────────────────');
```

3. In the failure branch inside the loop, after `console.log(\`     Fix: ${chalk.yellow(check.fixCmd)}\`);`, add:
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
  </action>
  <verify>
    <automated>node -e "import('./lib/cmd-start.js').then(m => console.log('cmd-start OK:', typeof m.runStart))" && node -e "import('./lib/cmd-init.js').then(m => console.log('cmd-init OK:', typeof m.runInit))" && node -e "import('./lib/cmd-doctor.js').then(m => console.log('cmd-doctor OK:', typeof m.runDoctor))"</automated>
  </verify>
  <done>All three CLI modules import without error. `runStart`, `runInit`, `runDoctor` are all exported functions. Manual spot-check: `node -e "import('./lib/cmd-doctor.js').then(m => m.runDoctor())"` prints "ObservAgent Health Check" header before the checklist.</done>
</task>

<task type="auto">
  <name>Task 2: Backend GET /api/meta + dashboard version badge</name>
  <files>routes/api.js, frontend/src/pages/LiveDashboard.tsx</files>
  <action>
**routes/api.js** — Add `createRequire` import and version read at the top of the file, alongside the existing `import fs from 'fs'`:

```js
import fs from 'fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
```

Inside `apiRoutes`, add the new endpoint alongside the other `fastify.get` registrations (anywhere before the closing brace of `apiRoutes`):

```js
fastify.get('/api/meta', async () => ({ version }));
```

---

**frontend/src/pages/LiveDashboard.tsx** — Three changes:

1. Add `version` state alongside the other `useState` hooks (after `const [activeTab, setActiveTab] = useState<ActiveTab>('log')`):
```ts
const [version, setVersion] = useState<string | null>(null)
```

2. In the existing mount `useEffect`, add a 5th fetch alongside the others (after the agents fetch block, before the `return () => { cancelled = true }`):
```ts
// 5. App version
fetch('/api/meta')
  .then(r => r.json())
  .then(data => { if (!cancelled) setVersion(data.version ?? null) })
  .catch(() => {})
```

3. In the TopBar JSX, insert the version badge as a sibling `<span>` immediately after the closing `</div>` of the LIVE badge (line 127) and before the `{/* Nav tabs */}` div. Do NOT add `ml-auto` to the badge — it must sit left-of-nav, visually grouped with LIVE:

```tsx
{/* Version badge — new, sits between LIVE badge and nav tabs */}
{version && (
  <span className="font-mono text-[10px] text-[#3d5a7a]">v{version}</span>
)}
```

The TopBar structure should look like:
```
[Logo]  [LIVE badge]  [v2.4.0]  ...ml-auto...  [Live] [History]
```
  </action>
  <verify>
    <automated>node -e "import('./routes/api.js').then(() => console.log('routes/api.js OK')).catch(e => { console.error(e.message); process.exit(1) })" && cd /Users/darshannere/claude/observagent/frontend && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
- `GET /api/meta` returns `{ "version": "x.y.z" }` (confirm with `curl http://localhost:4999/api/meta` after server starts)
- Dashboard TopBar shows a muted version string (e.g. `v2.4.0`) between the LIVE badge and nav tabs
- TypeScript compilation reports no new errors
  </done>
</task>

</tasks>

<verification>
1. `node -e "import('./lib/cmd-start.js').then(m => console.log(typeof m.runStart))"` → prints `function`
2. `node -e "import('./lib/cmd-doctor.js').then(m => m.runDoctor())"` → prints bold header before checklist items
3. `curl http://localhost:4999/api/meta` (after `npx observagent start`) → `{"version":"x.y.z"}`
4. Dashboard TopBar: version string visible between LIVE badge and nav tabs
5. Start server with no internet access: server opens normally, no error in terminal (2-second abort fires silently)
</verification>

<success_criteria>
- All five files modified per spec
- No new dependencies added
- `checkForUpdate` never blocks startup (Promise.all runs it concurrently with `open`)
- `process.exit(0)` removed from `cmd-init.js` already-installed path (replaced with `return`)
- Version badge only renders when `/api/meta` responds — `null` state hides it
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/1-implement-cli-version-banner-and-dashboa/1-SUMMARY.md` with what was implemented, files changed, and any notable decisions.
</output>
