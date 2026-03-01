# Phase 6: CLI and Zero-Config Setup - Research

**Researched:** 2026-03-01
**Domain:** Node.js CLI tooling, npm package distribution, Claude Code hook configuration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**init hook behavior:**
- Merge ObservAgent hooks alongside existing hooks in settings.json — non-destructive, reads existing config and appends
- If settings.json doesn't exist, create it
- If ObservAgent hooks are already present, skip silently — print "✓ Already installed" and exit 0 (idempotent)
- On success: minimal confirmation + next step — e.g. `✓ ObservAgent hooks installed\n\nRun: observagent start`
- `init` does only hook configuration — it does NOT start the server

**start command mode:**
- Foreground process — blocking, streams logs to terminal, Ctrl+C to stop
- Auto-open browser when server is confirmed ready — use `open` (macOS) / `xdg-open` (Linux) / `start` (Windows)
- If server is already running on the port: detect, print "ObservAgent already running at http://localhost:4999", open browser, exit 0
- --port flag supported — default 4999, override with `--port 5000` etc.

**doctor output & fixes:**
- Colored checklist with fix hints — uses chalk (or equivalent) for green ✓ / red ✗, no color if NOT a TTY
- Default: report-only — each failing check prints the exact command to fix it
- --fix flag — auto-repairs all found issues without prompting
- Exactly three checks (from spec):
  1. Server running at expected port
  2. Hooks installed in ~/.claude/settings.json
  3. JSONL files found in ~/.claude/projects/
- Exit code: 0 if all pass, 1 if any fail (scriptable)

**Package & distribution:**
- Package name: `observagent` on npm (clean, matches product, `npx observagent init` just works)
- Single package — CLI + server bundled together (bin/cli.js, server.js, routes/, public/, db/ all in one)
- bin entry: `observagent` → `bin/cli.js`
- `npx observagent init` works cold (downloads package on first use)
- After `npm install -g observagent`, persistent `observagent start` and `observagent doctor` commands are available

### Claude's Discretion
- Exact chalk color palette and icon choices for doctor output
- Internal structure of bin/cli.js (commander, yargs, or manual arg parsing)
- How browser-open is implemented cross-platform (use `open` npm package or raw exec)
- Where the server data directory (SQLite DB) lives when installed globally

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SETUP-01 | User can install ObservAgent hooks with a single command (`npx observagent init`) that automatically configures `~/.claude/settings.json` | Settings.json schema verified from live file; merge pattern documented; idempotency check pattern identified |
| SETUP-03 | User can run `observagent doctor` to diagnose installation issues (is server running? are hooks installed? are JSONL files found?) | Three-check pattern: TCP probe for server, JSON parse for hooks, fs.readdir for JSONL; chalk TTY detection documented |
| SETUP-04 | User can start the server and open the dashboard with a single command (`observagent start`) | TCP port probe for already-running detection; `open` package v11 API; child_process.spawn pattern for foreground server |
</phase_requirements>

---

## Summary

Phase 6 wraps the completed ObservAgent server in a polished three-command CLI. The server itself is already complete (Fastify + better-sqlite3 on port 4999); this phase adds `bin/cli.js` as an npm bin entry with three subcommands dispatched by Commander.js v14.

The biggest implementation subtlety is the `init` command's settings.json merge. The real `~/.claude/settings.json` has been inspected and confirmed: it contains a `hooks` object with event-type keys (`PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`), each mapping to an array of matcher-group objects. The ObservAgent relay.py hook must be appended to each of these four arrays without disturbing existing entries (GSD context monitor, status line, etc.). The idempotency check is a string match on the `command` field — if any existing hook's `command` contains `relay.py`, skip the entire install.

The project is already `"type": "module"` in package.json (ESM), so all new CLI code uses `import` syntax. Commander v14 (latest stable), chalk v5 (ESM-only), and the `open` package v11 (ESM-only) are all fully compatible with the existing setup. The `bin/cli.js` shebang must use `#!/usr/bin/env node` and the file must have its extension — using `.js` works because `package.json` has `"type": "module"`.

**Primary recommendation:** Add `bin/cli.js` as the CLI entry point using Commander.js v14 for subcommand dispatch; use chalk v5 for color, `open` v11 for browser launch, and Node.js built-in `net` for port probing. No new architecture required — the CLI is a thin wrapper that either mutates `~/.claude/settings.json` (init) or spawns/probes the existing server (start/doctor).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | CLI argument parsing — subcommands, options, auto-help | Industry standard for Node.js CLIs; 116k+ npm packages depend on it; ESM support confirmed |
| chalk | ^5.3.0 | Terminal color output | ESM-native, zero deps, handles TTY detection automatically, works with project's ESM setup |
| open | ^10.1.0 | Cross-platform browser launch | Sindre Sorhus's canonical package; handles macOS/Linux/Windows natively; ESM-native |

> **Note on `open` version:** v11 is the latest (released Nov 2025) but v10.x is also ESM-native and fully functional. Prefer v10.1.0 for broader compatibility; v11 is fine if Node.js v20+ is targeted.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:net (built-in) | built-in | TCP port probe for server health | Already available — use for `doctor` server check and `start` idempotency check |
| node:fs/promises (built-in) | built-in | Read/write ~/.claude/settings.json | Already available — no extra dep needed |
| node:path (built-in) | built-in | Cross-platform path resolution for settings.json | Required for `~` expansion to `os.homedir()` |
| node:os (built-in) | built-in | `os.homedir()` to find ~/.claude/ | Required for portable home directory resolution |
| node:child_process (built-in) | built-in | Spawn server process (start command) | Already in Node.js — used to start server.js as foreground subprocess |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | yargs | Yargs has richer docs but heavier API; commander is simpler for 3 subcommands |
| commander | manual process.argv parsing | Viable for 3 commands but loses auto-help and --version handling |
| chalk | picocolors | picocolors is smaller but chalk is project-familiar and already referenced in decisions |
| open | raw `child_process.exec('open url')` | Platform-specific; open package handles all 3 OS edge cases correctly |

**Installation:**
```bash
npm install commander chalk open
```

---

## Architecture Patterns

### Recommended Project Structure
```
bin/
└── cli.js              # Shebang entry point; imports and runs program
lib/
├── cmd-init.js         # init subcommand: settings.json merge logic
├── cmd-start.js        # start subcommand: spawn server + open browser
└── cmd-doctor.js       # doctor subcommand: three checks + fix logic
server.js               # Existing Fastify server (unchanged)
package.json            # Add bin field and new dependencies
```

The CLI lives in `bin/cli.js` (thin dispatcher) with logic split into `lib/cmd-*.js` modules. This keeps `bin/cli.js` small and each command independently testable.

### Pattern 1: bin/cli.js — Shebang + Commander Dispatch

**What:** The npm bin entry that Commander uses to parse argv and dispatch to subcommands.
**When to use:** Every CLI tool with multiple subcommands.

```javascript
#!/usr/bin/env node
// Source: Commander.js official docs + 2ality.com/2022/07/nodejs-esm-shell-scripts.html
import { Command } from 'commander';
import { runInit } from '../lib/cmd-init.js';
import { runStart } from '../lib/cmd-start.js';
import { runDoctor } from '../lib/cmd-doctor.js';

const program = new Command();

program
  .name('observagent')
  .description('ObservAgent — Claude Code agent observability')
  .version('1.0.0');

program
  .command('init')
  .description('Configure Claude Code hooks in ~/.claude/settings.json')
  .action(runInit);

program
  .command('start')
  .description('Start the ObservAgent server and open the dashboard')
  .option('-p, --port <number>', 'Port to listen on', '4999')
  .action((options) => runStart(options));

program
  .command('doctor')
  .description('Check ObservAgent setup health')
  .option('--fix', 'Auto-repair all failing checks')
  .option('-p, --port <number>', 'Port to check', '4999')
  .action((options) => runDoctor(options));

program.parse();
```

### Pattern 2: TCP Port Probe (server running check)

**What:** Use `node:net` to attempt a TCP connection on the target port. ECONNREFUSED = not running; success = running.
**When to use:** Both `start` (idempotency check) and `doctor` (check 1).

```javascript
// Source: nodejs.org/api/net.html — stdlib, no deps
import net from 'node:net';

function isServerRunning(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);   // server is up
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);  // ECONNREFUSED = not running
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);  // timeout = treat as down
    });
  });
}
```

### Pattern 3: settings.json Merge (non-destructive hook install)

**What:** Read existing `~/.claude/settings.json`, add ObservAgent hooks to each event array, write back atomically.
**When to use:** `init` command only.

**Critical:** The live `~/.claude/settings.json` schema has been verified. The structure is:
```json
{
  "hooks": {
    "PreToolUse": [
      { "hooks": [{ "type": "command", "command": "python3 /path/to/relay.py" }] }
    ],
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "python3 /path/to/relay.py" }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "command", "command": "python3 /path/to/relay.py" }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "python3 /path/to/relay.py" }] }
    ]
  }
}
```

**ObservAgent hooks to install:**
```javascript
// Source: verified from relay.py and live settings.json
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'];
const RELAY_PATH = join(homedir(), '.claude', 'observagent', 'relay.py');

const OBSERVAGENT_HOOK = {
  hooks: [{ type: 'command', command: `python3 ${RELAY_PATH}` }]
};

function isHookInstalled(settings) {
  for (const event of HOOK_EVENTS) {
    const groups = settings?.hooks?.[event] ?? [];
    for (const group of groups) {
      for (const h of group.hooks ?? []) {
        if (h.command?.includes('relay.py')) return true;
      }
    }
  }
  return false;
}

async function mergeHooks(settingsPath) {
  let settings = {};
  try {
    const raw = await readFile(settingsPath, 'utf8');
    settings = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid JSON — start fresh
  }

  if (isHookInstalled(settings)) return { alreadyInstalled: true };

  settings.hooks ??= {};
  for (const event of HOOK_EVENTS) {
    settings.hooks[event] ??= [];
    settings.hooks[event].push(OBSERVAGENT_HOOK);
  }

  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return { alreadyInstalled: false };
}
```

**Key decision on relay.py location:** When installed via `npm install -g observagent`, the relay.py must be referenced by absolute path. The safest approach is to copy relay.py to `~/.claude/observagent/relay.py` during `init` so the path is stable regardless of npm global install location. This was identified as a concern in STATE.md.

### Pattern 4: Foreground Server with Browser Open

**What:** Spawn the server as a foreground child process, wait for TCP readiness, then open browser.
**When to use:** `start` command.

```javascript
// Source: Commander.js docs + open package v10/11 README
import { spawn } from 'node:child_process';
import open from 'open';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runStart({ port = '4999' }) {
  const portNum = parseInt(port, 10);
  const url = `http://localhost:${portNum}`;

  // Idempotency: if already running, just open browser
  if (await isServerRunning(portNum)) {
    console.log(`ObservAgent already running at ${url}`);
    await open(url);
    return;
  }

  // Spawn server as foreground process
  const serverPath = join(__dirname, '..', 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',     // stream logs to parent terminal
    env: { ...process.env, PORT: port }
  });

  // Wait for server to accept connections
  await waitForPort(portNum, 10000);
  await open(url);

  // Keep CLI alive while server runs (Ctrl+C kills both)
  await new Promise((resolve) => {
    child.on('exit', resolve);
    process.on('SIGINT', () => {
      child.kill('SIGINT');
    });
  });
}
```

### Pattern 5: Chalk TTY Detection

**What:** chalk automatically disables color when stdout is not a TTY. No manual check needed.
**When to use:** Doctor output.

```javascript
// Source: chalk v5 README (github.com/chalk/chalk)
import chalk from 'chalk';

// chalk respects process.stdout.isTTY automatically
// chalk.level === 0 when piped/redirected (no color)
// chalk.level === 3 when terminal supports truecolor

const pass = chalk.green('✓');
const fail = chalk.red('✗');
```

### Anti-Patterns to Avoid

- **Hardcoding relay.py as a relative path in settings.json:** When installed globally via npm, the package lands in a non-predictable location (e.g., `/usr/local/lib/node_modules/observagent/`). The absolute path must be anchored to `~/.claude/observagent/relay.py` (copied during init), not to the npm package location.
- **Writing settings.json without reading first:** Always read-parse-merge-write. Never JSON.stringify a fresh object that drops existing config (statusLine, enabledPlugins, etc. would be lost).
- **Using `spawn` with `detached: true` for `start`:** The decision is foreground/blocking. Don't detach the process.
- **String-replacing settings.json:** Parse as JSON and mutate the object. String manipulation of JSON files is fragile (comments, whitespace, order).
- **Checking port with `server.listen()` to test if it's free:** Use `net.createConnection()` — attempting to bind a socket as a test is side-effectful and unreliable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform browser open | `exec('open url')` / `exec('xdg-open url')` / `exec('start url')` with manual OS detection | `open` npm package v10/11 | Handles macOS, Linux, Windows, WSL, and browser-not-found edge cases correctly |
| CLI argument parsing | Manual `process.argv.slice(2)` parsing with if-chains | Commander.js v14 | Auto-generates --help, handles --version, validates required args, normalizes option names |
| Terminal color output | ANSI escape code strings | chalk v5 | Handles 8-color, 256-color, truecolor, no-color-when-piped automatically |

**Key insight:** The CLI is only ~200 lines of actual logic across 3 commands. The value of the listed libraries is not size reduction — it's correctness on edge cases (Windows paths, piped output, missing browsers) that are tedious to test manually.

---

## Common Pitfalls

### Pitfall 1: relay.py Absolute Path Breaks After Global Install

**What goes wrong:** `init` writes `python3 /Users/darshan/.npm/lib/node_modules/observagent/hooks/relay.py` to settings.json. After `npm install -g observagent` on another machine, this path doesn't exist.

**Why it happens:** npm global install location varies by OS, Node version manager (nvm, brew), and user configuration. There is no reliable way to know the path at install time.

**How to avoid:** During `init`, copy `hooks/relay.py` from the npm package (located via `import.meta.url`) to `~/.claude/observagent/relay.py`. Write `python3 ~/.claude/observagent/relay.py` as the hook command (using the expanded absolute path). This path is stable across all environments.

**Warning signs:** If the hook command contains `node_modules` in the path, it will break on reinstall.

### Pitfall 2: Destroying Existing settings.json Content

**What goes wrong:** `init` reads the file, constructs a new `{ hooks: {...} }` object, and writes it — silently dropping `statusLine`, `enabledPlugins`, `statusLine`, and other top-level fields.

**Why it happens:** Only the `hooks` key is in scope for the developer implementing init. Other keys are invisible unless the full file is inspected.

**How to avoid:** Always do a full `JSON.parse()` of the existing file first, then mutate only `settings.hooks[event]`. Preserve all other keys by spreading onto the existing object.

**Warning signs:** After `init`, `settings.json` is smaller than before it ran.

### Pitfall 3: Duplicate Hook Entries After Re-Running Init

**What goes wrong:** Running `npx observagent init` twice inserts relay.py hooks twice in each event array. Claude Code fires the relay twice per event, doubling every ingested event.

**Why it happens:** No idempotency check before appending.

**How to avoid:** Before modifying settings.json, scan all existing hook entries for any `command` field that contains `relay.py`. If found, print "Already installed" and exit 0 without modifying the file.

**Warning signs:** Each tool call generates 2 events in the ObservAgent dashboard instead of 1.

### Pitfall 4: `open` Package ESM Import Failure

**What goes wrong:** `import open from 'open'` throws `ERR_REQUIRE_ESM` or resolution fails.

**Why it happens:** Project already uses `"type": "module"` in package.json, so ESM is the module system. `open` v10+ is ESM-only — this is the correct combination. The error appears when someone accidentally uses CommonJS syntax (`const open = require('open')`).

**How to avoid:** Use `import open from 'open'` in the ESM CLI file. Never use `require()` in a file under a `"type": "module"` package.

### Pitfall 5: server.js Port Hardcoded to 4999

**What goes wrong:** `observagent start --port 5000` opens the browser on port 5000, but server.js still binds to 4999.

**Why it happens:** server.js currently has `port: 4999` hardcoded (verified from source). The `start` command's `--port` flag has no effect unless server.js reads from an environment variable or argument.

**How to avoid:** Update server.js to read `process.env.PORT ?? 4999` before the CLI is implemented. The `start` command passes `PORT` env var via `spawn({ env: { ...process.env, PORT: port } })`.

### Pitfall 6: Race Between Browser Open and Server Ready

**What goes wrong:** `open(url)` is called immediately after spawning the server process. The browser opens while the server is still initializing — the user sees a "connection refused" page.

**Why it happens:** `spawn()` returns synchronously before the child process has bound its TCP port.

**How to avoid:** Poll `isServerRunning(port)` after spawn with a timeout (e.g., retry every 200ms for 10 seconds). Only call `open(url)` after the port probe succeeds.

---

## Code Examples

### Complete doctor check implementation
```javascript
// Source: chalk docs + net module docs
import chalk from 'chalk';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function runDoctor({ fix = false, port = '4999' }) {
  const portNum = parseInt(port, 10);
  const results = [];

  // Check 1: Server running
  const serverRunning = await isServerRunning(portNum);
  results.push({
    label: `Server running at http://localhost:${portNum}`,
    pass: serverRunning,
    fix: `observagent start`,
  });

  // Check 2: Hooks installed
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  const hooksInstalled = await checkHooksInstalled(settingsPath);
  results.push({
    label: 'Hooks installed in ~/.claude/settings.json',
    pass: hooksInstalled,
    fix: `observagent init`,
  });

  // Check 3: JSONL files found
  const jsonlFound = await checkJsonlFiles();
  results.push({
    label: 'JSONL session files found in ~/.claude/projects/',
    pass: jsonlFound,
    fix: 'Start a Claude Code session to generate session data',
  });

  // Print results
  let anyFailed = false;
  for (const result of results) {
    const icon = result.pass ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon}  ${result.label}`);
    if (!result.pass) {
      anyFailed = true;
      if (fix && result.fix.startsWith('observagent')) {
        // auto-repair
      } else {
        console.log(`     Fix: ${chalk.yellow(result.fix)}`);
      }
    }
  }

  process.exit(anyFailed ? 1 : 0);
}
```

### package.json changes required
```json
{
  "name": "observagent",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "bin": {
    "observagent": "./bin/cli.js"
  },
  "files": [
    "bin/",
    "lib/",
    "routes/",
    "public/",
    "db/",
    "hooks/",
    "server.js"
  ],
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "chalk": "^5.3.0",
    "commander": "^14.0.3",
    "fastify": "^5.7.4",
    "fastify-sse-v2": "^4.2.2",
    "open": "^10.1.0"
  }
}
```

### waitForPort polling helper
```javascript
// Poll until TCP port accepts connections or timeout exceeded
async function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning(port)) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chalk 4.x (CommonJS) | chalk 5.x (ESM-only) | 2021 | Project uses ESM — must use chalk 5 |
| commander 12 (Node 18+) | commander 14 (Node 20+) | 2025 | Current stable; project targets Node 20+ |
| open v9 (last CJS) | open v10/11 (ESM-only) | 2022 | Project uses ESM — must use v10/11 |
| `#!/usr/bin/env node` + `.js` in ESM pkg | Same — still correct | N/A | No change; `"type":"module"` makes `.js` files ESM |

**Deprecated/outdated:**
- chalk 4: Do NOT install; incompatible pattern for this ESM project even though it has CJS compatibility
- commander 12/13: Older, still functional but 14 is current stable with Node 20+ requirement matching project's target runtime
- `opn` package: Old name for `open`; long since replaced by `open`

---

## Open Questions

1. **Where does the SQLite DB live when installed globally?**
   - What we know: Currently hardcoded as `./observagent.db` (relative to server.js CWD)
   - What's unclear: When `observagent start` is run from any directory after global install, CWD varies. The DB ends up wherever the user ran the command.
   - Recommendation: Resolve this in the `start` command by passing `OBSERVAGENT_DB_PATH` env var pointing to `~/.local/share/observagent/observagent.db` (Linux/macOS) or `%APPDATA%\observagent\observagent.db` (Windows). server.js reads `process.env.OBSERVAGENT_DB_PATH ?? './observagent.db'` to preserve backward compatibility for local dev.

2. **What Python version does the relay.py need?**
   - What we know: relay.py uses only stdlib (`sys`, `json`, `urllib`) — works on Python 3.6+
   - What's unclear: `npx observagent init` on Windows may fail if python3 is not in PATH (Windows uses `python` not `python3`)
   - Recommendation: In doctor check 2 (hooks installed), also test that `python3 --version` succeeds. If not, print "Fix: Install Python 3 or alias python3". The --fix implementation is out of scope (can't install Python for the user).

3. **Should `init` be idempotent for the relay.py file copy?**
   - What we know: relay.py must be copied to `~/.claude/observagent/relay.py` during init
   - What's unclear: On re-run, should the copy be skipped if the file exists, or always overwrite (to update)?
   - Recommendation: Always overwrite during init — this handles version upgrades silently and is idempotent from the user's perspective.

---

## Sources

### Primary (HIGH confidence)
- Live `~/.claude/settings.json` inspection — exact settings.json schema with hooks array structure verified from production file
- `code.claude.com/docs/en/hooks` — full Claude Code hooks reference: event names, matcher schema, handler type/command structure
- `github.com/sindresorhus/open` — current version v11.0.0 (Nov 2025); API: `await open(url)`; ESM-only confirmed
- `github.com/tj/commander.js` CHANGELOG — v14.0.3 current stable (Jan 2026); requires Node.js v20+
- Project `package.json` — `"type": "module"` confirmed; existing deps: better-sqlite3, fastify, fastify-sse-v2
- Project `server.js` — port 4999 hardcoded; CWD-relative DB path `./observagent.db`
- Project `hooks/relay.py` — full source read; hook events: PreToolUse, PostToolUse, SubagentStart, SubagentStop

### Secondary (MEDIUM confidence)
- `2ality.com/2022/07/nodejs-esm-shell-scripts.html` — ESM shebang + bin field pattern; `#!/usr/bin/env node` works for `.js` in `"type":"module"` package; npm sets executable bit automatically
- chalk npm page — v5.6.2 latest; ESM-only; zero deps; auto-detects TTY
- Commander.js jsDocs.io v14.0.3 — subcommand API, option parsing, action handler signature

### Tertiary (LOW confidence)
- WebSearch findings on `commander` v15 (ESM-only) — not yet verified via official release notes; sticking with v14 (confirmed stable)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified from npm changelogs and official GitHub
- Architecture: HIGH — settings.json schema verified from live production file; existing server.js code read
- Pitfalls: HIGH — pitfalls derived from known code facts (hardcoded port, hardcoded DB path, live settings.json structure)

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable ecosystem; commander, chalk, open are slow-moving)
