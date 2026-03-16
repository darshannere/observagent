# CLI Reference

The `observagent` binary is registered via the `bin` field in `package.json` and implemented in `bin/cli.js`. It uses `commander` and lazily imports each command module.

```
observagent <command> [options]
```

---

## `observagent init`

**File:** `lib/cmd-init.js`

Installs the hook relay and patches `~/.claude/settings.json`.

### What it does

1. Copies `hooks/relay.py` from the npm package directory to `~/.claude/observagent/relay.py` (overwrites on upgrade — always uses the version that matches the installed package).
2. Reads `~/.claude/settings.json`. Creates it fresh if absent or contains invalid JSON.
3. **Idempotency check:** scans all existing hook `command` strings for `relay.py`. If already present, prints "already configured" and exits without modifying the file.
4. Merges a hook entry into all four Claude Code hook events: `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`.
5. Atomically writes the updated `settings.json`.

### Hook command registered

```
python3 ~/.claude/observagent/relay.py
```

### Settings.json shape after init

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          { "type": "command", "command": "python3 ~/.claude/observagent/relay.py" }
        ]
      }
    ],
    "PostToolUse": [ ... ],
    "SubagentStart": [ ... ],
    "SubagentStop": [ ... ]
  }
}
```

### Notes

- Running `init` again after upgrading the package is safe and recommended — it refreshes `relay.py` without duplicating hook entries.
- If `~/.claude/settings.json` has existing hooks for other tools, they are preserved.

---

## `observagent start`

**File:** `lib/cmd-start.js`

Starts the server, waits for it to be ready, then opens the dashboard in the browser.

### Options

| Flag | Default | Description |
|---|---|---|
| `-p, --port <number>` | `4999` | Port to listen on |

### What it does

1. **Already running check:** TCP-connects to `127.0.0.1:{port}`. If something responds, opens the browser to `http://localhost:{port}` and exits — does not start a second server.
2. **Spawns** `node server.js` as a child process with `stdio: 'inherit'` (server logs appear in the same terminal).
3. **Environment variables passed to the server:**
   - `PORT` — the requested port number
   - `OBSERVAGENT_DB_PATH` — platform-specific data directory path (see below)
4. **Polls** the port every 200ms for up to 10 seconds.
5. **Opens** the browser (`open` package — cross-platform).
6. **Concurrently** checks `https://registry.npmjs.org/@darshannere/observagent/latest` for a newer version (2-second timeout, silent on network error). Prints a yellow update banner if a newer version is available.
7. **Stays alive** — forwards `SIGINT` to the child process; exits when the server exits.

### DB path by platform

| Platform | Path |
|---|---|
| macOS / Linux | `~/.local/share/observagent/observagent.db` |
| Windows | `%APPDATA%\observagent\observagent.db` |

The directory is created automatically by `initDb()` if it does not exist.

---

## `observagent doctor`

**File:** `lib/cmd-doctor.js`

Checks the three preconditions for ObservAgent to work and optionally repairs them.

### Options

| Flag | Default | Description |
|---|---|---|
| `--fix` | false | Auto-repair all fixable checks |
| `-p, --port <number>` | `4999` | Port to check for the running server |

### Checks

| # | Check | Pass condition | Auto-fixable |
|---|---|---|---|
| 1 | Server running at `http://localhost:{port}` | TCP connection succeeds | No — run `observagent start` manually |
| 2 | Hooks installed in `~/.claude/settings.json` | `relay.py` appears in any hook `command` string | Yes — calls `runInit()` |
| 3 | JSONL session files found in `~/.claude/projects/` | At least one `.jsonl` file exists | No — run a Claude Code session first |

### Exit code

- `0` — all checks passed (or all fixable failures were repaired)
- `1` — at least one check failed

### Example output

```
ObservAgent Health Check
────────────────────────
  ✓  Server running at http://localhost:4999
  ✓  Hooks installed in ~/.claude/settings.json
  ✗  JSONL session files found in ~/.claude/projects/
     Fix: Start a Claude Code session to generate session data
```
