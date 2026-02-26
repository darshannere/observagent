# Pitfalls: AI Agent Observability Platform (Claude Code)

**Domain:** Real-time agent observability via Claude Code hooks + JSONL file parsing
**Researched:** 2026-02-26

---

## Pitfall 1: Hooks Block Claude When Backend Is Down
**Severity:** CRITICAL | **Phase:** 1 (Foundation)

Claude Code hooks are synchronous — if a hook hangs, Claude hangs. If the ObservAgent backend isn't running, every hook invocation will hang until timeout.

**Warning signs:**
- Claude feels "frozen" after tool use when backend is down
- Long pauses between tool calls during development

**Prevention:**
- Use fire-and-forget: POST via `curl --max-time 1 --silent` or write to a Unix socket/FIFO — don't wait for response
- Hook script must always exit in <5ms from the shell's perspective
- Hook must always `exit 0` on non-intentional failures (only `exit 2` to block tool use intentionally)
- Wrap hook in `timeout 2s curl ...` to guarantee fast failure

**Never do:**
```bash
# BAD — blocks Claude if server is down
curl http://localhost:4000/ingest -d "$payload"

# GOOD — fire and forget
curl --max-time 1 --silent --output /dev/null http://localhost:4000/ingest -d "$payload" &
```

---

## Pitfall 2: Shell Injection via Hook Payloads
**Severity:** CRITICAL | **Phase:** 1 (Foundation)

Hook scripts receive JSON payloads. If payload data is interpolated into shell variables, malicious tool input (file paths with quotes, backticks, semicolons) can execute arbitrary commands.

**Warning signs:**
- Hook scripts that do `"$TOOL_INPUT"` string interpolation
- File paths with spaces or special characters breaking hooks

**Prevention:**
- Read payload via stdin only: `PAYLOAD=$(cat)` then pass as JSON body
- Never interpolate tool input into shell strings
- Test with file paths containing: spaces, `'`, `"`, `` ` ``, `;`, `$`

```bash
# BAD
curl ... -d "{\"tool\": \"$TOOL_NAME\", \"input\": \"$INPUT\"}"

# GOOD
echo "$PAYLOAD" | curl ... -d @-
```

---

## Pitfall 3: JSONL Partial Writes Cause Parse Failures
**Severity:** CRITICAL | **Phase:** 1 (Foundation)

Claude Code writes JSONL files while sessions are active. `fs.watch` or chokidar will fire change events mid-write on large messages. Reading at that moment produces truncated JSON that crashes `JSON.parse()`.

**Warning signs:**
- Intermittent JSON parse errors in logs
- Token counts missing from some events
- Crashes on long agent responses

**Prevention:**
- Buffer incomplete lines (check for trailing `\n` before parsing)
- Wrap every `JSON.parse()` in try/catch; queue failed lines for retry after 100ms
- Use `chokidar` with `awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 }` option — waits for file to stop changing before emitting event
- `awaitWriteFinish` also handles macOS `kqueue` unreliability (raw `fs.watch` misses events on macOS)

---

## Pitfall 4: Agent Hierarchy Is Inferred, Not Explicit
**Severity:** MODERATE | **Phase:** 2 (Agent Tree)

JSONL session files don't contain explicit parent-child session links. The Task tool spawn creates a new Claude Code process with a new session ID — but the relationship isn't written anywhere obvious.

**Warning signs:**
- Sub-agents appear as disconnected top-level sessions
- Parent-child cost rollup is wrong

**Prevention:**
- The hook fires in the parent session context — `$CLAUDE_SESSION_ID` (or equivalent env var) at `PreToolUse` on a Task tool call IS the parent ID. Capture it and pass it with the event.
- Store: `{ parentSessionId, childSessionId }` when a Task tool PreToolUse fires
- When the child session JSONL appears (watch for new files), link it via the stored mapping
- Use this as the authoritative signal — **never infer parent-child from timing alone**

---

## Pitfall 5: SSE Memory Leaks from Uncleaned Connections
**Severity:** MODERATE | **Phase:** 1 (Foundation)

Each browser tab that opens the dashboard creates an SSE connection. If connections aren't cleaned up on disconnect, the connection Set grows unboundedly and events are pushed to dead sockets.

**Warning signs:**
- Memory grows over time with dashboard open across restarts
- `ECONNRESET` errors in logs after browser tab closes

**Prevention:**
- Always register: `req.on('close', () => connections.delete(res))`
- Use `Set<Response>` not Array for O(1) removal
- Send SSE heartbeat comment every 15s: `res.write(': heartbeat\n\n')` — detects stale connections, keeps proxies alive
- Check `res.write()` return value — if `false`, connection is backpressured; skip or buffer

---

## Pitfall 6: SQLite Write Contention Under Parallel Agents
**Severity:** CRITICAL | **Phase:** 1 (Foundation)

GSD can spawn 4+ parallel agents all POSTing hook events simultaneously. SQLite's default locking will cause `SQLITE_BUSY` errors under concurrent writes.

**Warning signs:**
- "database is locked" errors in logs during parallel agent runs
- Dropped events during heavy GSD executions

**Prevention:**
- `PRAGMA journal_mode = WAL` — allows concurrent reads during writes
- `PRAGMA busy_timeout = 5000` — retry for 5s before failing
- Use a **write queue** (single in-process writer, async queue of pending events) — serialize writes, never write from multiple concurrent async operations
- If using `better-sqlite3` (synchronous API), run in a worker thread — its synchronous writes block the event loop

```js
// Good pattern: single writer with queue
const writeQueue = [];
async function enqueueEvent(event) {
  writeQueue.push(event);
  drainQueue();
}
```

---

## Pitfall 7: Onboarding Friction Kills Adoption
**Severity:** MODERATE | **Phase:** 1 (Foundation) + Ongoing

Observability tools die from setup complexity. If a user must manually edit `~/.claude/settings.json` to add hooks, most won't complete it. Every extra step is drop-off.

**Warning signs:**
- Users saying "I couldn't get it to work" without specifying an error
- GitHub issues about hook not firing

**Prevention:**
- CLI command installs hooks automatically: `npx observagent init` writes the hook config to `~/.claude/settings.json`
- `observagent start` starts the server and opens the dashboard in one command
- Test the install flow on a **clean machine with no prior config** before every release
- Provide `observagent doctor` to diagnose: is server running? are hooks installed? are JSONL files found?

---

## Pitfall 8: macOS `kqueue` Misses JSONL File Events
**Severity:** MODERATE | **Phase:** 1 (Foundation)

Raw `fs.watch()` on macOS uses `kqueue` which misses rename/replace events and is unreliable for directory watching. If Claude Code's JSONL writer uses atomic replace (write to temp, rename), `fs.watch` will miss it entirely.

**Warning signs:**
- Dashboard not updating even though agent is clearly running
- Events only appear after a file is explicitly closed

**Prevention:**
- Use `chokidar` (wraps `kqueue` with polling fallback) — reliable on macOS
- Enable `usePolling: false, awaitWriteFinish: true` as default; fallback to `usePolling: true` if events are missed
- Do NOT use raw `fs.watch` or `fs.watchFile` — too many edge cases on macOS

---

## Summary: Prevention by Phase

| Phase | Critical Pitfalls to Address |
|-------|------------------------------|
| 1 — Foundation | Hook fire-and-forget, shell injection, JSONL partial writes, SQLite WAL + write queue, SSE cleanup, macOS chokidar, zero-config CLI install |
| 2 — Agent Tree | Parent-child session correlation via hook env var (not timing inference) |
| 3 — Polish | Onboarding doctor command, clean machine install testing |

---
*Research completed: 2026-02-26*
