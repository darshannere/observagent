# Project Research Summary

**Project:** ObservAgent v2.0 — Agent Intelligence Milestone
**Domain:** Real-time AI agent observability platform (Claude Code-native, local-first)
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

ObservAgent v2.0 is a feature expansion of a working local observability platform for Claude Code. The system already captures tool call events via Python hook relay and displays them live in a Fastify/SQLite/vanilla-JS dashboard. The five v2.0 additions — cost/token tracking, multi-agent tree visualization, session history, zero-config CLI setup, and Gantt timeline — are additive in nature but introduce two entirely new data paths: JSONL file watching from `~/.claude/projects/` and subagent lifecycle detection via `SubagentStop` hooks. The recommended approach is minimal new dependencies (only chokidar, commander, and open via npm; d3-hierarchy via CDN) with all business logic in plain ESM modules. The no-build-step, no-framework philosophy that makes v1.0 easy to contribute to must be preserved.

The most critical architectural finding is the correct subagent identity model. Live JSONL inspection and official Claude Code docs confirm that Claude subagents are NOT separate sessions — they are sidechains within the parent session. The `SubagentStop` hook payload provides `agent_id` and `agent_transcript_path` (not a child session ID). This invalidates the cwd+timing inference approach described in ARCHITECTURE.md and mandates a separate `agents` table keyed by `(session_id, agent_id)`. The ARCHITECTURE.md and PITFALLS.md research files are internally inconsistent on this point: ARCHITECTURE.md proposes cwd+time inference while PITFALLS.md (based on verified hook payload inspection) confirms the explicit `agent_transcript_path` approach is correct and the inference approach is unnecessary. **PITFALLS.md takes precedence** on all points where the two conflict.

The three highest-priority risks are: (1) JSONL streaming entries have placeholder token counts — only the final entry with a non-null `stop_reason` is authoritative, requiring `INSERT OR REPLACE` not `INSERT OR IGNORE`; (2) the `SubagentStop` hook is not currently registered in `settings.json`, meaning agent tree data is silently dropped until Phase 4 fixes this; and (3) the CLI `init` command must read-merge-write `~/.claude/settings.json` to avoid destroying existing GSD and other hooks already present on this machine. All three are preventable with straightforward patterns and are critical to get right in their respective phases.

## Key Findings

### Recommended Stack

The existing stack (Fastify 5.7.4, better-sqlite3 12.6.2, Node 22.12.0, pure ESM, no build step) remains unchanged. Only three new npm packages are needed: `chokidar@4.0.3` for JSONL file watching (4.x preferred over 5.x for Node compatibility headroom on Node 20.x minor versions), `commander@14.0.3` for CLI subcommand parsing, and `open@11.0.0` for browser launch after `observagent start`. The agent tree is rendered via `d3-hierarchy@3.1.2` loaded from CDN (15 KB) — this provides layout math only, rendering is vanilla SVG. The Gantt timeline uses HTML Canvas with computed pixel positions. Cost calculation lives in an inline `lib/pricingConfig.js` module with a configurable model rate map.

**Core technologies:**
- `chokidar@4.0.3`: JSONL file watching — macOS `fs.watch` is unreliable for subdirectory watching; 4.x over 5.x for Node >=14.16.0 compatibility
- `commander@14.0.3`: CLI parsing — clean subcommand API, pure ESM, no alternatives needed for 3 subcommands
- `open@11.0.0`: Browser launch after `observagent start` — single-purpose, pure ESM, sindresorhus-maintained
- `d3-hierarchy@3.1.2` (CDN): Agent tree layout — 15 KB vs 644 KB for vis-network; provides only the layout math, rendering is vanilla SVG
- `lib/pricingConfig.js` (inline): Cost calculation — configurable rate map; `computeCost(model, usage)` function; unknown model warning and fallback

**Critical version note:** Use `chokidar@4.0.3` not `5.0.0`. The `5.x` peer dependency `readdirp@5` requires Node >= 20.19.0 exactly — a contributor trap on Node 20.18.x. Both versions work on the project's Node 22.12.0, but 4.x is safer for contributors.

### Expected Features

Research confirms a clear competitive gap: ObservAgent is the only tool that observes Claude Code agents without code changes. The features below are scoped exclusively to v2.0 additions on top of the already-working v1.0 system.

**Must have (table stakes) — v2.0 core:**
- Token usage display (input/output/cache read/cache write) — every LLM observability tool shows this; absence makes the product feel incomplete
- Running dollar cost total with real-time updates — developers think in dollars, not tokens; required from first session
- Cost budget alert (in-dashboard toast/badge) — prevents runaway spend in multi-agent runs
- Session history list — required for any observability tool used beyond a single day; "how much did Monday's run cost vs today's?"
- Session filter by date/project/cost/status — unfiltered lists become unusable after 10+ sessions
- Session data export (JSONL/CSV) — power users need raw data; high trust signal at low implementation cost
- `npx observagent init` CLI — zero-friction setup is table stakes for adoption; manual config editing loses most users before they see value
- `observagent doctor` diagnostic command — single command diagnosis reduces support burden; must exit non-zero when any check fails
- `observagent start` with auto browser-open — removes launch friction; standard developer tool pattern

**Should have (competitive differentiators) — v2.0 extended:**
- Agent tree visualization with parent-child hierarchy — the primary differentiator; no competitor visualizes Task tool spawn trees for Claude Code
- Per-agent cost breakdown — "total cost $2.40" is useless in multi-agent runs without per-agent attribution
- Context window fill percentage per agent — surfaces impending context limit failures before they cause errors; unique to ObservAgent
- Stuck agent detection (60s threshold) — no competitor detects this for Claude Code; GSD users frequently encounter stuck states

**Defer to v2.x:**
- Gantt timeline view — high complexity, depends on all other data being stable; ships as a separate "Timeline" tab after v2.0 core features are validated
- Cost fill rate ($/min) — add when cost tracking is proven stable and users explicitly request it
- Webhook/Slack cost alerts — over-engineering for a local-first tool; in-dashboard alert covers v2.0 needs
- Session comparison/diffing — low frequency use case vs implementation cost
- Custom dashboard layout — ship opinionated fixed layout first, validate before building customization
- OpenTelemetry export — enterprise-scale concern, out of scope for single-developer local tool
- GSD semantic agent role labeling — fragile coupling to GSD prompt format; use first-50-chars task label instead

### Architecture Approach

The v2.0 architecture adds two new data paths to the existing hook relay pipeline without modifying the core event flow. The first new path is JSONL file watching: `lib/jsonlWatcher.js` uses chokidar to tail `~/.claude/projects/**/*.jsonl` (including the `subagents/` subdirectory) by byte offset, parses `assistant` entries with non-null `stop_reason`, computes cost via `lib/pricingConfig.js`, and writes to a new `token_snapshots` table via the existing single-writer `WriteQueue`. The second new path is subagent lifecycle detection: `SubagentStop` hook events carry `agent_id` and `agent_transcript_path`; the ingest route writes to a new `agents` table and dynamically adds the subagent JSONL path to the chokidar watcher. Both paths broadcast typed SSE events (`cost_update`, `session_new`, `agent_stuck`) to the dashboard, which gains three new panels plus a separate Gantt Timeline tab (deferred from core).

**Major components:**
1. `lib/jsonlWatcher.js` (NEW) — chokidar-based byte-offset JSONL tailing; skips null-stop_reason entries; token/cost parsing; SSE broadcast after 200ms debounce
2. `lib/pricingConfig.js` (NEW) — configurable model rate map with cost rates and context window maxima; `computeCost(model, usage)` function; unknown model warning and fallback to sonnet rates
3. `lib/hierarchy.js` (NEW) — SubagentStop payload processing; `agents` table upserts via `(session_id, agent_id)` composite key; dynamic watcher path registration from `agent_transcript_path`
4. `bin/cli.js` (NEW) — `init` / `start` / `doctor` subcommands using commander; idempotent settings.json merge including SubagentStop registration
5. `db/schema.js` (MODIFIED) — add `sessions`, `token_snapshots`, `agents` tables; ALTER events table for new columns; full index set; `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration pattern
6. `routes/ingest.js` (MODIFIED) — sessions upsert on every event; Task PreToolUse detection; SubagentStop handling with `agent_id` linkage (not cross-session hierarchy)
7. `routes/api.js` (MODIFIED) — add `/api/sessions` (filter params), `/api/agents` (recursive CTE on agents table), `/api/export` (stripped of tool_input content)
8. `public/index.html` (MODIFIED) — Agent Tree panel (d3-hierarchy SVG), Cost Meters panel, Session History panel; new SSE event type handlers; existing Tool Call Log panel unchanged

**Correct schema note — PITFALLS supersedes ARCHITECTURE on this point:**
```
agents table: PRIMARY KEY (session_id, agent_id)
  session_id -> parent session (not a separate child session)
  agent_id   -> short hash from SubagentStop payload (e.g., "aaef527")
  agent_transcript_path -> direct path to subagent JSONL file
```
Do NOT use a self-referential `sessions.parent_session_id` — subagents share the parent's `sessionId` and are not separate sessions.

### Critical Pitfalls

1. **JSONL streaming entries have placeholder token counts — use `INSERT OR REPLACE`, skip null `stop_reason`** — Claude Code writes multiple entries per message during streaming; entries with `stop_reason: null` contain exactly 8 output tokens regardless of actual output (verified: 32 of 42 null entries showed exactly 8 tokens; true final counts ranged 127-964). Use `INSERT OR REPLACE` (never `INSERT OR IGNORE`) and skip all entries where `stop_reason IS NULL`. Failure produces cost totals at 1-5% of actual Anthropic billing.

2. **SubagentStop `session_id` is the parent, not the child — use `agents` table, not sessions with `parent_session_id`** — Subagents are sidechains within the parent session sharing the parent's `sessionId`. The SubagentStop payload provides `agent_id` (a short hash like `"aaef527"`) and `agent_transcript_path` (exact path to subagent JSONL). Build an `agents` table keyed by `(session_id, agent_id)`, not a self-referential sessions hierarchy. The cwd+timing inference approach described in ARCHITECTURE.md is superseded by this verified finding from PITFALLS.md.

3. **SubagentStop hook is not currently registered — agent tree data is silently dropped** — `~/.claude/settings.json` only has PreToolUse/PostToolUse hooks. SubagentStop events are never sent to the server. Register SubagentStop in Phase 4; the CLI `init` command must install all required hooks including SubagentStop; `doctor` must verify SubagentStop registration specifically (not just that any hook exists).

4. **`observagent init` must read-merge-write settings.json — never overwrite** — A naive write would destroy GSD hooks, context monitor, statusline, and other tools already in `~/.claude/settings.json` on this machine. Always read -> parse -> deduplicate-merge -> write back. Running `init` twice must not add duplicate hook entries.

5. **Subagent JSONL files are nested in a `subagents/` subdirectory — glob must be `**/*.jsonl`** — Files live at `~/.claude/projects/<project>/<parent-session-id>/subagents/<agent-id>.jsonl`, three levels deep (verified real path: `~/.claude/projects/-Users-darshannere-DarshanWeb/5ee79270-.../subagents/agent-aprompt_suggestion-33a4cf.jsonl`). Use `agent_transcript_path` from SubagentStop as the primary watch path; the recursive glob is backup discovery only.

## Implications for Roadmap

The dependency graph is clear and strict: schema first, write queue extension second, JSONL watcher and cost tracking third, agent hierarchy fourth, session history fifth, CLI sixth, dashboard panels seventh. The Gantt timeline is the only feature that should slip to v2.x — everything else belongs in v2.0 core.

### Phase 1: Schema Foundation
**Rationale:** Every subsequent phase writes to the database. Schema must be finalized before any feature code is written. The `agents` table structure (not a self-referential sessions table) must be correct from the start based on the verified SubagentStop payload findings. Getting this wrong requires a table rebuild mid-development.
**Delivers:** `sessions`, `token_snapshots`, and `agents` tables; `ALTER TABLE events` for `agent_id` and `tool_input_summary` columns; full index set (`idx_events_session`, `idx_sessions_parent`, `idx_snapshots_session`, etc.); migration infrastructure in `initDb()` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
**Addresses:** Foundation for HIST-01, COST-01, AGENT-01
**Avoids:** Silent `SQLITE_ERROR: no such table` runtime crashes; schema redesign mid-project; wrong hierarchy table structure
**Research flag:** SKIP — SQLite migration patterns are well-documented; schema is fully specified across ARCHITECTURE.md and PITFALLS.md.

### Phase 2: WriteQueue Extension
**Rationale:** The single-writer guarantee is the core reliability mechanism. All new tables (token_snapshots, agents, sessions update) must route through one queue. Extending before any new writes are introduced prevents the most common anti-pattern — multiple concurrent writers causing BUSY errors under GSD's 4+ parallel agent load.
**Delivers:** Multi-statement WriteQueue with type discriminator (`event`, `session_upsert`, `token_snapshot`, `session_cost`, `agent_upsert`); updated `enqueue(type, data)` API; all existing call sites updated; verified no regressions to existing event logging
**Avoids:** Multiple write queues causing SQLite BUSY errors under parallel agent load
**Research flag:** SKIP — Pattern is fully specified with code samples in ARCHITECTURE.md; refactor of existing code.

### Phase 3: Cost and Token Tracking
**Rationale:** Highest user-pain feature and the data foundation for everything downstream — per-agent cost badges, context fill, and budget alerts all depend on `token_snapshots` being populated correctly. The JSONL watcher is also the required mechanism for discovering subagent JSONL files in Phase 4. Validating byte-offset tailing here de-risks Phase 4 before it depends on it.
**Delivers:** `lib/jsonlWatcher.js` with byte-offset tailing on `**/*.jsonl` (including subagent subdirectory); `lib/pricingConfig.js` with configurable rates for all observed model variants (sonnet-4-6, opus-4-6, haiku-4-5, plus default fallback); real-time cost SSE updates debounced at 200ms; context fill percentage computed from cumulative token totals / model context max; cost budget alert threshold check; `token_snapshots` and `sessions.total_cost_usd` populated
**Addresses:** COST-01 through COST-04, context fill indicator
**Avoids:** Pitfall 1 (INSERT OR REPLACE + skip null stop_reason), Pitfall 4 (deep glob covers subagent JSONL at 3 directory levels), Pitfall 5 (context fill is computed from token totals, not read from JSONL), SSE cost flooding (200ms debounce aggregates per-session totals)
**Research flag:** VERIFY stop_reason edge cases — confirm that `"tool_use"` stop_reason (in addition to `"end_turn"`) also contains true final token counts and not placeholder values. Inspect one real multi-turn session with tool calls in the JSONL before writing the filter condition.

### Phase 4: Multi-Agent Observability
**Rationale:** Requires Phase 3's JSONL watcher (to dynamically add `agent_transcript_path` to the watcher) and Phase 1's agents table. The critical prerequisite is registering SubagentStop in settings.json and observing a real payload live before writing any hierarchy code. One real test eliminates the single most consequential unknown remaining in the project.
**Delivers:** SubagentStop registration in settings.json; `lib/hierarchy.js` with `agents` table upserts from SubagentStop payload; dynamic JSONL watcher registration from `agent_transcript_path`; `GET /api/agents` using recursive CTE on agents table; stuck agent detection via `setInterval` (30s check, 60s threshold); agent hierarchy SSE events (`session_new`, `session_end`, `agent_stuck`)
**Addresses:** AGENT-01, AGENT-02, AGENT-03
**Avoids:** Pitfall 2 (agents table uses `(session_id, agent_id)` — not cross-session parent_session_id), Pitfall 3 (SubagentStop registered and doctor checks it specifically), Pitfall 4 (dynamic watcher from agent_transcript_path as primary path)
**Research flag: VERIFY BEFORE CODING** — Register SubagentStop in settings.json, trigger a real Task tool spawn (e.g., a short GSD run), and log the raw SubagentStop JSON payload before writing a single line of hierarchy code. Confirm `agent_id` format and `agent_transcript_path` field are present and stable. This is the most consequential open question remaining in the entire milestone.

### Phase 5: Session History and Export
**Rationale:** Pure read-path feature that depends on sessions and token_snapshots being populated (Phases 3-4) but adds no new writes. Building after Phase 4 ensures history includes complete agent tree data from the start. Can be built incrementally — session list first, then filters, then export.
**Delivers:** `GET /api/sessions` with filter query params (date range, project path substring, cost range, status, has-errors); `GET /api/export` with JSONL/CSV response (tool_input and tool_response content stripped); Session History panel in dashboard with filter controls and export button; 50-per-page pagination
**Addresses:** HIST-01, HIST-02, HIST-03
**Avoids:** Security pitfall — export strips sensitive tool_input/tool_response content before serving; pagination prevents unbounded SELECT on large session histories
**Research flag:** SKIP — SQL filtering and REST export are standard patterns; schema is fully defined.

### Phase 6: CLI and Zero-Config Setup
**Rationale:** CLI is the adoption gateway, but it must be built after the features it installs are proven stable. A broken `init` that installs partial features creates more confusion than no CLI. Building last ensures `npx observagent init` installs a complete, tested system including SubagentStop hook registration (determined in Phase 4).
**Delivers:** `bin/cli.js` with `init`, `start`, `doctor` subcommands via commander; `package.json` bin field with `#!/usr/bin/env node` shebang; `init` idempotent read-merge-write of settings.json (registers PreToolUse, PostToolUse, SubagentStop); `doctor` checking server alive + all three hook types + JSONL files present + relay.py executable, with non-zero exit on any failure; `start` with `open` package auto-browser-launch
**Addresses:** SETUP-01 through SETUP-04
**Avoids:** Pitfall 6 (ESM shebang and correct bin field in package.json), Pitfall 7 (settings.json read-merge-write with idempotency), doctor exit non-zero behavior
**Research flag:** SKIP — Node CLI packaging with commander is well-documented; settings.json merge is straightforward JSON read-modify-write.

### Phase 7: Dashboard Panels
**Rationale:** Dashboard panels are the user-facing expression of all backend work in Phases 3-6. Building them after APIs are stable means panels hydrate from complete, correct data. The three new panels (Cost Meters, Agent Tree, Session History) can be built in any order once Phase 6 is done.
**Delivers:** Cost Meters panel with live token counters, per-model cost display, and context fill percentage bars; Agent Tree panel with `d3-hierarchy` layout rendered to SVG, cost badges per node, and stuck agent warning badges; Session History panel with filter controls and export button; new SSE event type handlers (`cost_update`, `session_new`, `session_end`, `agent_stuck`); existing Tool Call Log panel and SSE event handling unchanged
**Addresses:** Dashboard rendering for all v2.0 features
**Avoids:** Gantt concurrent-bar rendering pitfall (canvas absolute pixel positioning required, not CSS flow) — Gantt deferred to v2.x keeps this pitfall out of scope for this phase
**Research flag:** SKIP — vanilla JS + existing dashboard patterns are established; d3-hierarchy CDN integration is straightforward.

### Phase Ordering Rationale

- **Schema-first:** No runtime `no such table` errors at any phase transition; `agents` table structure must be right before data is written to it
- **WriteQueue before writes:** Single-writer invariant preserved before any new table writes are introduced; parallel GSD agents will hit this under load
- **JSONL watcher before agent hierarchy:** The watcher is the file discovery mechanism for `agent_transcript_path`; Phase 4 depends on Phase 3's watcher infrastructure
- **Session history after agent hierarchy:** Historical sessions include complete tree data from the start, not just later sessions
- **CLI last:** `npx observagent init` installs SubagentStop hook (determined in Phase 4); building last means it installs a complete, tested system
- **Gantt deferred to v2.x:** High complexity canvas rendering; retrospective value (post-session analysis) not the live value that defines v2.0; depends on all other data being stable

### Research Flags

Phases needing live verification before implementation begins:
- **Phase 3:** Inspect a fresh `~/.claude/projects/` session JSONL to confirm that `stop_reason: "tool_use"` entries (not just `"end_turn"`) also contain true final token counts. One multi-turn session with tool calls is sufficient.
- **Phase 4 (CRITICAL):** Register SubagentStop in settings.json, trigger a real GSD multi-agent run, and log the raw SubagentStop JSON payload before writing any hierarchy code. Confirm `agent_id` and `agent_transcript_path` fields match the documented schema and are present in all SubagentStop events.

Phases with well-documented patterns (skip research-phase):
- **Phase 1:** SQLite migration — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is standard; schema fully specified
- **Phase 2:** WriteQueue extension — refactor of existing code; full code sample in ARCHITECTURE.md
- **Phase 5:** SQL filtering with REST export — standard CRUD, no novel patterns
- **Phase 6:** Node CLI packaging with commander — well-documented; settings.json merge is idiomatic JSON read-modify-write
- **Phase 7:** Dashboard vanilla JS panel additions — follows existing patterns in `public/index.html`

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against npm registry, live Node 22.12.0 runtime, live JSONL files, Anthropic pricing docs (2026-02-26); CDN sizes verified; all three new npm packages confirmed as pure ESM, compatible with "type": "module" project |
| Features | HIGH | JSONL schema and SubagentStop payload confirmed via live inspection and official Claude Code docs; competitor table-stakes analysis is training knowledge (MEDIUM) but feature requirements are grounded in verified runtime data |
| Architecture | HIGH | Direct codebase inspection of all source files; live JSONL inspection (Claude Code 2.1.59); hook payload schemas confirmed against official docs and Claude Code minified source; PITFALLS corrects ARCHITECTURE on agents table model |
| Pitfalls | HIGH | All critical pitfalls (streaming token placeholder counts, SubagentStop payload schema, subagent file directory structure) verified against live files, official Claude Code documentation, and minified source |

**Overall confidence:** HIGH

### Gaps to Address

- **ARCHITECTURE.md vs PITFALLS.md inconsistency on hierarchy approach:** ARCHITECTURE.md documents cwd+timing inference for parent-child linking; PITFALLS.md (verified against official docs and Claude Code source) confirms the correct approach uses `agent_id` + `agent_transcript_path` from SubagentStop payload. **PITFALLS.md takes precedence.** The `agents` table schema (not a self-referential sessions table) reflects this. Verify once more at the start of Phase 4 with a live SubagentStop payload log before any schema alterations.

- **`stop_reason` completeness:** Live data confirms `null` = streaming placeholder and `"end_turn"` = final entry. It is unclear whether `"tool_use"` stop reason (which appears when the assistant makes a tool call) always contains true token counts. Verify during Phase 3 implementation with a multi-turn session that includes tool calls in the JSONL.

- **Context window size per model:** All current Claude models (sonnet-4-6, opus-4-6, haiku-4-5) have 200K context windows. Build `pricingConfig.js` to include both pricing rates and context window maxima as configurable values with sensible defaults — do not hardcode. Update when Anthropic releases new models.

- **`observagent doctor` exit code scheme:** PITFALLS.md specifies `doctor` must exit non-zero when any check fails, but the specific exit code per failed check type is unspecified. Define the exit code mapping before Phase 6 implementation.

- **Startup JSONL hydration on server restart:** Byte-offset state is lost on restart, causing all JSONL files to be re-read from offset 0. The `UNIQUE(session_id, id)` deduplication constraint prevents double-counting, but startup time grows linearly with session history size. Acceptable for v2.0 — flag for offset persistence to a JSON file in v2.x backlog.

- **`settings.json` hook schema version stability:** The hook entry format (keys, structure) in `~/.claude/settings.json` is assumed from live file inspection. Verify the format has not changed across Claude Code versions before the CLI `init` command writes it. An incorrect format installs silently broken hooks.

## Sources

### Primary (HIGH confidence)
- Live `~/.claude/projects/` JSONL inspection on this machine — JSONL schema, streaming entry behavior (42 null-stop_reason entries verified, 32 showed exactly 8 tokens, true counts ranged 127-964), subagent file path structure confirmed
- Official Claude Code hooks documentation — SubagentStop payload schema: `session_id` (parent), `agent_id`, `agent_transcript_path`, `agent_type`, `last_assistant_message`, `stop_hook_active`
- Claude Code minified source — SubagentStop payload construction confirmed: `{...bG(T), hook_event_name:"SubagentStop", stop_hook_active:_, agent_id:B, agent_transcript_path:Wk(B), agent_type:H??"", last_assistant_message:O}`
- Current `~/.claude/settings.json` — confirmed SubagentStop not currently registered; existing hooks: PreToolUse, PostToolUse, SessionStart only
- Existing codebase (`server.js`, `db/schema.js`, `lib/writeQueue.js`, `routes/ingest.js`, `hooks/relay.py`, `public/index.html`) — component boundaries, write queue pattern, Fastify v5, ESM module type confirmed
- npm registry — `chokidar@4.0.3`, `commander@14.0.3`, `open@11.0.0` version requirements, engine constraints, module type compatibility
- Anthropic pricing docs — model rates for Opus ($15/$75), Sonnet ($3/$15), Haiku ($0.80/$4) input/output per MTok (fetched 2026-02-26)

### Secondary (MEDIUM confidence)
- Competitor analysis (LangSmith, Helicone, AgentOps, Langfuse, Braintrust) — feature table-stakes identification; training knowledge, no live access
- CDN size verification — d3-hierarchy 15 KB vs vis-network 644 KB vs frappe-gantt 48 KB (curl-verified 2026-02-26)
- GSD hook ecosystem (`gsd-statusline.js`, `gsd-context-monitor.js`) — statusLine payload schema, context_window.remaining_percentage location confirmed

### Tertiary (LOW confidence — validate during implementation)
- Arize Phoenix patterns — local-first OSS observability; training knowledge, least verified of competitor set
- Context window size per model (200K assumed for all current Claude models) — should be made configurable; verify against Anthropic docs when building `pricingConfig.js`

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
