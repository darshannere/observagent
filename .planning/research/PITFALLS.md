# Pitfalls Research

**Domain:** AI Agent Observability — Claude Code hooks + JSONL file parsing (v1.1 feature additions)
**Researched:** 2026-02-26
**Confidence:** HIGH — All critical pitfalls verified against real JSONL files on this machine and official Claude Code hook documentation.

---

## Critical Pitfalls

### Pitfall 1: JSONL Streaming Entries Have Wrong Token Counts — Only the Final Entry Is Authoritative

**What goes wrong:**
Claude Code writes multiple JSONL entries per assistant message as it streams the response. Entries with `stop_reason: null` contain only a placeholder output token count (commonly 8 tokens regardless of actual output length). Only the final entry — with `stop_reason: "tool_use"` or `"end_turn"` — has the true token counts. Using `INSERT OR IGNORE` on `UNIQUE(session_id, message_id)` inserts the first partial entry and ignores all subsequent updates, resulting in severely undercounted token and cost totals.

**Why it happens:**
Developers see the `UNIQUE` constraint in the schema (added to prevent double-counting on file re-reads) and assume it handles deduplication correctly. It does — but only if the first write wins. For streaming JSONL, the first write is always wrong.

**Verified by:** Live inspection of `~/.claude/projects/` session JSONL files on this machine. For 42 null-stop_reason entries, 32 showed exactly 8 output tokens; true counts on final entries ranged from 127 to 964.

**How to avoid:**
- Use `INSERT OR REPLACE` (not `INSERT OR IGNORE`) so that a later entry with the same `message_id` overwrites the earlier partial one
- Alternatively, skip all entries where `stop_reason IS NULL` during parsing — these are intermediate streaming frames and should never be stored
- The safest pattern: only process assistant entries where `stop_reason` is `"tool_use"`, `"end_turn"`, or another non-null value

**Warning signs:**
- Running cost totals feel much lower than Anthropic's actual billing dashboard
- `output_tokens` stuck at 8 for most entries in `token_snapshots` table
- Cost per session matches only ~1-5% of actual bill

**Phase to address:** Phase 3 (Cost and Token Tracking)

---

### Pitfall 2: SubagentStop Hook Fires in Parent Context — session_id Is the Parent, Not the Child

**What goes wrong:**
When `SubagentStop` fires, its `session_id` field is the **parent** session's ID, not the subagent's ID. The subagent is identified by `agent_id` (a short hash like `"aaef527"`). Developers expecting a child session ID to link to a separate sessions table record will find nothing — because subagent JSONL files use the parent's session_id as their own `sessionId` field and are stored at `~/.claude/projects/<project>/<parent-session-id>/subagents/<agent-id>.jsonl`.

**Why it happens:**
The mental model of "SubagentStop gives me the child session ID" seems logical but is wrong. The subagent is not a separate session in Claude Code's model — it is a sidechain within the parent session. Both the parent and subagent JSONL entries share the same `sessionId`.

**Verified by:**
- SubagentStop payload from official docs: `session_id` = parent session, `agent_id` = subagent identifier, `agent_transcript_path` = full path to subagent JSONL
- Real subagent JSONL file inspection: `sessionId: "5e4c7246-..."` (parent), `agentId: "aaef527"`, `isSidechain: true`

**How to avoid:**
- Store agent hierarchy using `(parent_session_id, agent_id)` not two session IDs
- The `agent_transcript_path` in SubagentStop payload gives the exact JSONL file to tail — use it directly as the watcher target
- Schema should have an `agents` table (not a `sessions` table) with `session_id` (parent FK), `agent_id`, `agent_transcript_path`
- Do NOT use the cwd + timing inference approach documented in ARCHITECTURE.md — SubagentStop makes it unnecessary

**Warning signs:**
- Agent tree queries return no parent-child links
- Attempting `JOIN sessions ON child.session_id = parent.session_id` on two different values returns nothing
- Subagent costs not aggregating to parent

**Phase to address:** Phase 4 (Multi-Agent Observability)

---

### Pitfall 3: ObservAgent relay.py Does Not Currently Register SubagentStop — Subagent Events Are Silently Dropped

**What goes wrong:**
The current `~/.claude/settings.json` only registers the relay for `PreToolUse` and `PostToolUse`. `SubagentStop` (and `SubagentStart`) are not registered. This means all subagent lifecycle events — the only zero-code surface for detecting when a subagent completes and obtaining its `agent_transcript_path` — are never sent to the server. The agent tree will appear empty even though sub-agents are running.

**Why it happens:**
Phase 1 built only what was needed for the live event log. SubagentStop was deferred. The relay.py works fine — it just isn't registered for these hook types.

**How to avoid:**
- Register `SubagentStop` (and optionally `SubagentStart`) in `settings.json` when building Phase 4
- The `npx observagent init` CLI (Phase 6) must register all required hooks, not just PreToolUse/PostToolUse
- `observagent doctor` must check that SubagentStop hook is registered, not just that _any_ hook is registered

**Warning signs:**
- Dashboard shows no agent tree even during known multi-agent GSD runs
- No `SubagentStop` events in the server logs
- `observagent doctor` passes but agent tree is empty

**Phase to address:** Phase 4 (Multi-Agent Observability), validated in Phase 6 (CLI)

---

### Pitfall 4: Subagent JSONL Files Are in a Subdirectory — Glob Pattern Must Include `subagents/`

**What goes wrong:**
The chokidar watcher configured for `~/.claude/projects/**/*.jsonl` does match subagent files, but only if the glob depth is sufficient. A pattern like `~/.claude/projects/*/*.jsonl` (one-level glob) misses them entirely. Subagent JSONL files live three directory levels deep: `~/.claude/projects/<project>/<parent-session-id>/subagents/<agent-id>.jsonl`.

**Why it happens:**
The common assumption is that JSONL files are flat in the project directory. The actual structure has subagents nested one additional directory level below the session ID directory.

**Verified by:** Real file paths observed: `~/.claude/projects/-Users-darshannere-DarshanWeb/5ee79270-ace7-4940-8c65-d2a2ffdbb22c/subagents/agent-aprompt_suggestion-33a4cf.jsonl`

**How to avoid:**
- Use chokidar with `**/*.jsonl` (recursive glob, two-star) not `*/*.jsonl`
- Explicitly test with a known subagent file path before shipping Phase 4
- When SubagentStop fires and provides `agent_transcript_path`, add that specific path to the watcher dynamically rather than relying on glob discovery alone

**Warning signs:**
- Parent session costs show correctly but subagent costs are zero
- Subagent JSONL files exist on disk but no events are fired for them

**Phase to address:** Phase 3 (JSONL Watcher) / Phase 4 (Multi-Agent Observability)

---

### Pitfall 5: Context Window Fill Cannot Be Read from JSONL — Must Be Computed

**What goes wrong:**
The JSONL `usage` field contains token counts for individual messages but no `context_window_max` or `context_fill_percentage` field. Developers expecting to read context fill directly from JSONL will not find it and may incorrectly conclude the data is unavailable or attempt to parse it from system entries.

**Why it happens:**
The context window fill percentage is a derived metric, not a raw field. It requires: cumulative `input_tokens + output_tokens` across all messages in a session divided by the known model context window size (a separate lookup).

**Verified by:** Inspected all JSONL entry types: `assistant`, `user`, `system`, `progress`, `file-history-snapshot`, `queue-operation`. No entry type contains a raw context window fill or remaining percentage field. The GSD statusline hook reads `data.context_window.remaining_percentage` from a different JSON source (the statusline input payload, not JSONL).

**How to avoid:**
- Compute context fill from cumulative token totals: `sum(input_tokens + output_tokens) / model_context_max`
- Maintain a model-to-context-size lookup table (claude-sonnet-4-6: 200K, claude-haiku: 200K, claude-opus: 200K for current Anthropic models)
- Parse the `model` field from each `assistant` entry in JSONL to determine the correct max context size
- Display as a percentage bar, not a raw number

**Warning signs:**
- Context fill bar always shows 0% or NaN
- "context_window not found in JSONL" errors in logs

**Phase to address:** Phase 3 (Cost and Token Tracking)

---

### Pitfall 6: npx CLI With ESM Package Requires Explicit Shebang and Correct Bin Registration

**What goes wrong:**
The project uses `"type": "module"` in package.json (ESM). A CLI bin file without a proper `#!/usr/bin/env node` shebang line will fail silently on some systems. Additionally, if the `bin` field in package.json points to a `.js` file that uses `require()` anywhere, it will throw `ERR_REQUIRE_ESM` at runtime. Mixed CommonJS/ESM in the same module graph breaks `npx observagent init`.

**Why it happens:**
CLI tooling is typically an afterthought. The bin file may be written as CommonJS (with `require`) because that's what older examples show, but the package is configured as ESM. Node.js resolves the module type from `package.json` — `"type": "module"` applies to all `.js` files.

**How to avoid:**
- Add `"bin": { "observagent": "./bin/cli.js" }` to package.json
- The `bin/cli.js` must start with `#!/usr/bin/env node`
- Use only ESM syntax (`import`/`export`) throughout — no `require()` anywhere in the CLI
- Test with `npm pack && npm install -g .` locally before publishing; test `npx observagent` on a clean directory
- For the `init` subcommand that modifies `~/.claude/settings.json`, use `fs.readFileSync` + JSON merge, never overwrite the whole file

**Warning signs:**
- `ERR_REQUIRE_ESM` on `npx observagent`
- `SyntaxError: Cannot use import statement in a module` (opposite direction)
- `command not found: observagent` after `npm install -g` (missing bin field or shebang)

**Phase to address:** Phase 6 (CLI and Zero-Config Setup)

---

### Pitfall 7: `observagent init` Overwrites Existing Hook Config — Destroys Other Tools' Hooks

**What goes wrong:**
If `observagent init` writes a fresh `~/.claude/settings.json` without reading and merging the existing file, it destroys all other hooks (GSD, context monitor, etc.) that the user has configured. On this machine, settings.json already contains GSD hooks, the statusline, and plugin configurations — a naive write would silently delete all of them.

**Why it happens:**
Writing a new file is simpler than reading, parsing, and merging JSON. Developers implement the easy path first.

**How to avoid:**
- Always read `~/.claude/settings.json` first; parse it
- Merge: check if the ObservAgent hook command already exists in each hook array before appending
- Preserve all existing hook entries, plugin configs, and statusLine settings
- Write back only if changes were actually made; print a diff of what changed
- Never use `JSON.stringify(newConfig)` directly — always merge into the existing object

**Warning signs:**
- GSD hooks stop working after running `observagent init`
- `observagent doctor` shows hooks installed but other tools break
- User reports "Claude Code stopped responding to my hooks after installing ObservAgent"

**Phase to address:** Phase 6 (CLI and Zero-Config Setup)

---

### Pitfall 8: SQLite Schema Must Be Migrated — Existing DB Has No `agents` or `token_snapshots` Tables

**What goes wrong:**
Phase 1 created the `events` table with a specific schema. Phases 3 and 4 require new tables (`token_snapshots`, `agents`) and new columns (e.g., `parent_session_id` on sessions). If `initDb()` only uses `CREATE TABLE IF NOT EXISTS`, it silently does nothing on an existing database that already has the table with the old schema. New columns added to the schema are never applied to the existing DB file, causing runtime errors when inserting data that includes new fields.

**Why it happens:**
`CREATE TABLE IF NOT EXISTS` is correct for fresh installs but does not apply schema changes to existing databases. There is no migration layer yet.

**How to avoid:**
- Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for additive changes to existing tables
- Use `CREATE TABLE IF NOT EXISTS` only for entirely new tables
- Before Phase 3 ships, add migration logic to `initDb()` that checks for missing columns and adds them
- Keep migrations as a numbered array: `[migration_001, migration_002, ...]` applied in order via a `schema_migrations` table
- For development: accept that the existing `observagent.db` may need to be deleted and recreated during early phase transitions

**Warning signs:**
- `table events has no column named parent_session_id` errors at runtime
- Server starts but JSONL watcher silently fails to write token snapshots
- `SQLITE_ERROR: no such table: token_snapshots` in logs

**Phase to address:** Phase 3 (schema additions for token_snapshots), Phase 4 (schema additions for agents)

---

### Pitfall 9: Gantt Timeline — Concurrent Bars Require Absolute Pixel Positioning, Not CSS Flow

**What goes wrong:**
Developers implement the Gantt swimlane view using `display: flex` or CSS grid with sequential bar elements. Tool calls that overlap in time (parallel agents running simultaneously) then render incorrectly — they appear sequential even though they were concurrent. The timeline becomes misleading rather than useful.

**Why it happens:**
CSS flow layout is the default mental model. It works for sequential data but cannot represent overlapping time ranges without absolute positioning.

**How to avoid:**
- Render the timeline on an HTML `<canvas>` element or use `position: absolute` with pixel coordinates computed from timestamps
- Compute bar positions: `left = (startMs - timelineStartMs) / totalDurationMs * canvasWidth`; `width = durationMs / totalDurationMs * canvasWidth`
- One swimlane row per `session_id` (or `agent_id` for subagents); rows are absolutely positioned vertically
- Minimum bar width of 4px so fast tool calls are still visible
- Chart.js does not support horizontal Gantt charts natively — use canvas2d directly or a library like `frappe-gantt` (vanilla JS) if a library is acceptable

**Warning signs:**
- Parallel agent bars appear sequential when they shouldn't
- Timeline shows agents one-after-another even though `timestamp` data confirms they were concurrent
- UI freezes when rendering long sessions (DOM node count explosion from many elements)

**Phase to address:** Phase 7 (Agent Timeline View)

---

### Pitfall 10: SSE Broadcast of Cost Updates Causes Per-Token-Update Flooding

**What goes wrong:**
The JSONL watcher detects a file change, reads new lines, and immediately broadcasts a `cost_update` SSE event for each new token snapshot. During active Claude sessions, the JSONL file receives updates every few seconds. If each token snapshot triggers a separate SSE broadcast, the dashboard receives many updates per second that each re-render the entire cost display, causing visible flicker and wasted CPU on both ends.

**Why it happens:**
The simple pattern — detect change → parse → broadcast — works correctly but does not batch rapid updates.

**How to avoid:**
- Debounce cost SSE broadcasts: accumulate all token snapshots parsed in a 200ms window, then emit a single aggregated `cost_update` event with the session total
- Never broadcast per-line updates from JSONL; broadcast per-session totals after debounce
- The `chokidar` watcher should already debounce file-change events; add a second debounce at the broadcast layer as defense in depth

**Warning signs:**
- Dashboard cost display flickers rapidly during active sessions
- Browser devtools Network tab shows dozens of SSE events per second
- CPU usage spikes on dashboard tab when agents are active

**Phase to address:** Phase 3 (Cost and Token Tracking)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `INSERT OR IGNORE` for token_snapshots | Simple deduplication | Silently captures partial streaming entries; severely undercounts costs | Never — use `INSERT OR REPLACE` |
| Hardcoding model pricing rates as constants | Fast to implement | Rates change; users on different model tiers pay differently | Never — use configurable rates from config or env |
| Single glob `**/*.jsonl` without dynamic path registration | Simple watcher setup | Misses subagent files created after watcher starts if glob depth is wrong | Acceptable as backup only; primary path should use `agent_transcript_path` from SubagentStop |
| Re-reading entire JSONL on every change event | Simple implementation | O(n) grows with session length; large sessions cause latency spikes | Never — byte-offset tail is the correct pattern and already specified in ARCHITECTURE.md |
| Overwriting `~/.claude/settings.json` in `observagent init` | Trivially simple write | Destroys all other users' hooks silently | Never — always read-modify-write |
| Skipping schema migration infrastructure | Saves one phase's worth of work | Every schema change in later phases requires manual DB deletion | Only acceptable if developer can guarantee a fresh DB per phase; not acceptable for released tool |
| Using CSS flow layout for Gantt timeline bars | Familiar to implement | Concurrent tool calls render incorrectly — misleading output | Never for a timeline feature whose core value is showing concurrency |

---

## Integration Gotchas

Common mistakes when connecting v1.1 features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SubagentStop hook registration | Only registering PreToolUse/PostToolUse (current state) | Add SubagentStop entry to settings.json; the relay.py script already handles arbitrary hook types via `hook_event_name` field |
| JSONL watcher + existing SSE broadcast | Calling `broadcast()` directly from the watcher for every parsed line | Route through a debounced aggregator; batch per-session totals before broadcasting |
| Token snapshot writes + write queue | Bypassing the existing WriteQueue for JSONL-sourced writes | All SQLite writes must go through the single WriteQueue instance to preserve serial write semantics |
| `npx observagent init` + existing settings.json | Writing a new settings.json without reading the old one | Read → parse → merge (deduplicate hook commands) → write |
| Gantt timeline + SSE event bus | Replaying all historical events via SSE on connect | Serve the initial timeline snapshot via REST (`GET /api/timeline`); SSE updates only new events |
| Session history export + SQLite | Streaming a `SELECT *` for large sessions that blocks reads | Use pagination (`LIMIT/OFFSET`) or cursor-based pagination; never unbounded SELECT in production path |
| `observagent doctor` + hook detection | Checking only that `PreToolUse` hooks exist | Doctor must verify SubagentStop is also registered, and that the relay.py path in settings matches the actual relay.py location |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full JSONL re-read on every change event | Server CPU spikes; JSONL parsing latency increases with session length | Byte-offset tracking per file (already in ARCHITECTURE.md) | Long sessions (>1000 lines, ~30+ min sessions) |
| Storing all events in memory for timeline render | Dashboard tab uses 500MB+ RAM on long multi-agent runs | Paginate REST queries; render only visible time window in Gantt | Sessions >200 tool calls across >4 agents |
| Un-indexed queries for session history filter | Filter UI response time >2s even with 50 sessions | Add indexes on `sessions(project_path)`, `sessions(started_at)`, `sessions(total_cost_usd)` | >100 stored sessions |
| Broadcasting every JSONL line as SSE | Dozens of SSE events/second; dashboard flicker | Debounce JSONL-sourced broadcasts at 200ms | During active Claude sessions |
| Recursive agent tree query without depth limit | Infinite loop or timeout if self-referential parent_session_id exists (data corruption) | Add `WHERE depth < 10` guard to recursive CTE | Immediately if DB is corrupted |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Serving raw tool input or file content in JSONL export | Sensitive file contents exposed in CSV download (relay.py already strips this from hook events, but JSONL files themselves contain raw content) | JSONL export must strip `tool_input` and `tool_response` fields before serving; only export metadata (timestamps, token counts, tool names) |
| Serving `~/.claude/projects/` files over HTTP | Full conversation transcripts exposed if server is accidentally bound to `0.0.0.0` | Server must always bind to `127.0.0.1` only; verify in CLI startup that host is loopback; `observagent doctor` should warn if server is reachable externally |
| `agent_transcript_path` path traversal in SubagentStop payload | If the relay accepts `agent_transcript_path` from untrusted input and passes it to the file watcher unvalidated | Validate that the path starts with the expected `~/.claude/projects/` prefix before adding to watcher |
| Pricing config from env vars without validation | Negative or zero pricing rates produce nonsensical negative cost totals | Validate pricing rates at startup: must be positive floats; reject and warn on invalid config |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Live cost meter shows `$0.00` until the session ends | Users think the tool isn't working; they don't trust the numbers | Update cost in real-time on every JSONL line parse (with debounce); even partial counts are better than zero |
| Gantt timeline shows wall clock time labels in UTC | Developers look at local time in their mental model; UTC timestamps create mismatch | Always display timeline timestamps in the browser's local timezone |
| Session history sorted by start time descending but most recent session isn't "active" | User navigates to history page during an active session and sees nothing being highlighted | Add a visual badge or row highlight for sessions where `last_event_at` is within the last 60 seconds |
| `observagent doctor` exits 0 even when problems exist | Users see "doctor passed" but the tool isn't working | `doctor` must exit non-zero if any check fails; use exit codes that map to which check failed |
| Budget alert fires once and never repeats | User dismisses the alert, keeps running, and overspends | Re-emit budget alerts every N additional dollars (configurable threshold step); store last-alerted-at to debounce repeated alerts during the same second |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **JSONL token tracking:** Often missing the `INSERT OR REPLACE` vs `INSERT OR IGNORE` fix — verify that the `token_snapshots` table correctly shows final token counts (not 8-token placeholder counts) by checking the first 10 stored entries
- [ ] **Agent tree visualization:** Often missing SubagentStop registration in settings.json — verify by checking `cat ~/.claude/settings.json` for SubagentStop entry, not just PreToolUse
- [ ] **Cost totals:** Often missing cache token pricing — verify that `cache_creation_input_tokens` and `cache_read_input_tokens` are priced at their distinct rates (not the same as `input_tokens`)
- [ ] **CLI `observagent init`:** Often missing idempotency — verify that running `init` twice does not add duplicate hook entries to settings.json
- [ ] **Subagent JSONL watching:** Often missing deep glob coverage — verify by checking that a subagent file at `~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl` triggers the watcher
- [ ] **Context fill percentage:** Often missing null guard for unknown models — verify that the meter shows something reasonable (or "unknown") rather than NaN/Infinity for a model not in the pricing table
- [ ] **Gantt timeline:** Often missing minimum bar width — verify that a tool call completing in <100ms is still visible on the timeline
- [ ] **Session export:** Often missing field stripping — verify that the CSV/JSONL download does not include raw `tool_input` or `tool_response` content from the JSONL source files

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong token counts due to INSERT OR IGNORE | MEDIUM | Delete `token_snapshots` table rows; re-tail all JSONL files from byte offset 0; re-insert with corrected INSERT OR REPLACE |
| settings.json overwritten by `observagent init` | HIGH | Restore from backup if available; manually re-add all hook entries; no automatic recovery — must prevent by design |
| Missing SubagentStop registration — no agent tree data | LOW | Add SubagentStop to settings.json; historical sessions won't have hierarchy; future sessions will build correctly |
| SQLite schema missing new columns | LOW for dev, HIGH for released tool | For dev: delete observagent.db and restart; for released: apply ALTER TABLE ADD COLUMN migrations in `initDb()` |
| Incorrect Gantt overlap rendering | LOW | CSS/canvas layout bug — fix rendering logic; no data is lost |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| JSONL streaming entries have wrong token counts | Phase 3 | Inspect `token_snapshots` table after a real session; confirm output_tokens > 8 for most entries |
| SubagentStop session_id is parent, not child | Phase 4 | Verify agents table uses `(session_id, agent_id)` composite key, not a foreign key to a separate child session row |
| relay.py not registered for SubagentStop | Phase 4 | Confirm `cat ~/.claude/settings.json | jq '.hooks.SubagentStop'` is non-null |
| Subagent JSONL in subdirectory | Phase 3 (watcher), Phase 4 (hierarchy) | Create a test subagent session; verify watcher fires for `subagents/*.jsonl` files |
| Context fill must be computed, not read | Phase 3 | Context fill % bar updates live and shows non-zero during an active session |
| npx CLI ESM shebang and bin registration | Phase 6 | Run `npx observagent` on a clean directory; verify no module system errors |
| `observagent init` overwrites settings.json | Phase 6 | Run init twice; verify settings.json still contains all pre-existing hooks and plugins |
| SQLite schema migration for new tables/columns | Phase 3 (add token_snapshots), Phase 4 (add agents) | Start server with existing Phase 1/2 DB; verify new tables exist and old data is preserved |
| Gantt timeline concurrent bars | Phase 7 | Run two parallel agent sessions; verify their bars overlap on the timeline |
| Cost update SSE flooding | Phase 3 | Open browser devtools Network tab during active session; verify <5 cost_update SSE events/second |

---

## Sources

- **Live JSONL file inspection on this machine** (HIGH confidence) — Confirmed: duplicate entries per message_id, null stop_reason placeholder token counts (8), final entries have `stop_reason: "tool_use"` or `"end_turn"` with true token counts. Confirmed: subagent JSONL files live at `<project>/<parent-session-id>/subagents/<agent-id>.jsonl` and use parent's session_id as their own `sessionId`.
- **Official Claude Code hooks documentation** (HIGH confidence) — Fetched via tool-result cache. Confirmed SubagentStop payload schema: `session_id` (parent), `agent_id`, `agent_transcript_path`, `agent_type`, `last_assistant_message`, `stop_hook_active`.
- **Claude Code source code (minified)** (HIGH confidence) — Extracted SubagentStop payload construction: `{...bG(T), hook_event_name:"SubagentStop", stop_hook_active:_, agent_id:B, agent_transcript_path:Wk(B), agent_type:H??"", last_assistant_message:O}`
- **Current `~/.claude/settings.json`** (HIGH confidence) — Confirmed SubagentStop not currently registered; existing hooks: PreToolUse, PostToolUse, SessionStart only.
- **Existing codebase** (`server.js`, `db/schema.js`, `lib/writeQueue.js`, `routes/ingest.js`) — Confirmed single-writer pattern, WAL mode, ESM package type, Fastify v5 installed.

---
*Pitfalls research for: ObservAgent v1.1 (JSONL cost tracking, agent hierarchy, session history, CLI, Gantt timeline)*
*Researched: 2026-02-26*
