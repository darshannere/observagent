# Project Research Summary

**Project:** ObservAgent
**Domain:** Real-time AI agent observability platform (Claude Code-native)
**Researched:** 2026-02-26
**Confidence:** HIGH

## Executive Summary

ObservAgent is a local-first observability platform that solves a uniquely constrained problem: monitoring Claude Code agents without modifying them. The only zero-code instrumentation surfaces Claude Code exposes are shell hooks (PreToolUse/PostToolUse/Stop/SubagentStop) and session JSONL files at `~/.claude/projects/`. Every architectural and technology decision flows from this constraint — the hook relay must be a fire-and-forget shell-invoked script, the server must respond 202 immediately without blocking the hook, and JSONL parsing must be incremental via byte-offset tailing rather than full re-reads. This is not a general observability problem — it is a Claude Code-specific plumbing problem that happens to have a clean solution.

The recommended stack is well-settled and internally consistent: Fastify 4.x for the HTTP server (2x Express throughput, clean SSE support), better-sqlite3 with WAL mode as the embedded store (synchronous writes, safe concurrent reads, zero server overhead), chokidar 4.x for reliable macOS JSONL watching, and vanilla JS + Chart.js for the dashboard (no build step, zero contributor friction). The data flows through two independent paths — real-time hook events via HTTP POST and cost/token data via JSONL file tailing — that both converge into SQLite and then fan out to connected dashboard clients via SSE. The architecture is simple enough to build correctly in one pass.

The dominant risk is blocking Claude Code itself. Three pitfalls — hooks that don't fire-and-forget, synchronous DB writes before the 202 response, and shell injection via payload interpolation — are all CRITICAL and must be addressed in Phase 1 before any feature work. A secondary risk is agent hierarchy inference: parent-child session links are not explicit in JSONL, but `PreToolUse` on a Task tool fires in the parent session context and provides the session ID linkage needed — this is the authoritative approach, and timing-based inference must be avoided. ObservAgent's competitive moat is that every alternative (LangSmith, Helicone, AgentOps) requires wrapping the LLM client, which is impossible with Claude Code as a black box. This moat is worth protecting — zero-code setup is not just a convenience feature, it is the product's core value proposition.

---

## Key Findings

### Recommended Stack

The stack is Node.js end-to-end with no polyglot complexity. Fastify is preferred over Express for its throughput advantages and cleaner SSE streaming model. The database is better-sqlite3 (not the experimental `node:sqlite`) running in WAL mode, managed via drizzle-orm for schema clarity. SQLite is the correct choice — this is a local developer tool, not a multi-tenant service, and embedded storage eliminates all operational overhead.

JSONL parsing is plain `JSON.parse()` per line with a byte-offset tracker per file — no streaming JSON parser is needed because JSONL is already newline-delimited. The hook relay is a thin Node.js CLI (not a bash script, despite the initial recommendation in STACK.md) that reads stdin and fires HTTP POST — this keeps the hook fast while avoiding shell injection risk. The dashboard is vanilla JS + native EventSource + Chart.js via CDN, with no build toolchain.

**Core technologies:**
- **Fastify 4.x**: HTTP server and SSE host — 2x Express throughput, built-in SSE, first-class TypeScript
- **better-sqlite3 + drizzle-orm**: Embedded DB — synchronous API, WAL mode for concurrent reads, zero server overhead
- **chokidar 4.x**: JSONL file watcher — reliable cross-platform, handles macOS kqueue unreliability, awaitWriteFinish prevents partial-read races
- **Native SSE (EventSource)**: Dashboard streaming — unidirectional is all that's needed, no Socket.io overhead
- **Vanilla JS + Chart.js 4.x**: Dashboard UI — no build step, CDN delivery, zero contributor friction
- **tsx + vitest + tsup**: Dev/test/bundle toolchain — ESM-native, no compile step in dev
- **curl (fire-and-forget)** or **thin Node.js CLI**: Hook relay — must exit in <5ms, never block on server response

### Expected Features

The feature research identifies a clear competitive gap: ObservAgent is the only tool that can observe Claude Code agents without code changes. This is the moat. All features should reinforce zero-code observability — any feature that requires agent modification is out of scope.

**Must have (table stakes):**
- Real-time event stream — live view is the baseline expectation; no live view means flying blind
- Token usage per request/session — cost is the primary user pain point
- Cost estimate in dollars — developers think in dollars, not tokens; model-specific rate conversion required
- Latency per call — first question after "what did it do?" is "how long did it take?"
- Error/failure visibility — surface tool failures and agent crashes immediately
- Session list and history — browse past runs, not just the live view
- Tool call log — ordered trace of what tools each agent called
- Search and filter runs — once history exists, discovery is essential
- Zero instrumentation setup — hooks + JSONL are the only valid integration surfaces
- Auto-refreshing dashboard — static pages feel broken

**Should have (differentiators):**
- Agent tree visualization — parent-child hierarchy from Task tool spawns; no competitor does this for Claude Code
- Context window fill indicator — per-agent fill percentage with progress bar; unique to ObservAgent
- Stuck agent detection — last event timestamp vs wall clock, configurable threshold
- Per-agent cost breakdown in multi-agent runs — which sub-agent is burning money?
- Context window pressure alerts — proactive warning before context limit hit
- Session cost budget alerts — prevent runaway spend during long multi-agent workflows
- JSONL export / CSV download — power users want raw data for offline analysis

**Defer to v2+:**
- Agent timeline (Gantt/swimlane) view — high complexity, deliver after core tree works
- GSD workflow awareness (agent persona labeling) — prompt pattern matching, nice-to-have not critical
- LLM evaluation / grading — different product category, LangSmith owns this
- Multi-user SaaS / auth — explicitly out of scope for v1
- Alerting integrations (Slack, PagerDuty) — in-dashboard alerts are sufficient for local tool
- Custom dashboard / widget builder — ship opinionated fixed layout first

### Architecture Approach

The system has three data flow paths that converge at SQLite and fan out via SSE. Path 1: hook events flow from Claude Code through a thin hook relay CLI → HTTP POST `/api/events` → 202 immediately → async normalize + write to SQLite → SSE broadcast to dashboard. Path 2: JSONL files are tailed by chokidar + byte-offset reader → token/cost fields parsed → written to `token_snapshots` table + session cost updated → SSE `cost_update` event pushed. Path 3: dashboard initial load fetches agent tree and session snapshots via REST, then subscribes to SSE for all future updates. The agent hierarchy is maintained via a `parent_session_id` column in the sessions table, linked at the moment a Task tool `PreToolUse` fires in the parent context.

**Major components:**
1. **Hook Relay** — Thin CLI reads hook stdin JSON, POSTs to server, exits immediately; never blocks Claude Code
2. **Event Ingestion** — Validates and normalizes hook events, writes to SQLite asynchronously (post-202)
3. **JSONL Watcher** — Tails `~/.claude/projects/**/*.jsonl` via chokidar; parses token/cost fields from new lines only
4. **SQLite Store** — Persists sessions, events, token snapshots; WAL mode + write queue prevents BUSY errors
5. **SSE Event Bus** — In-memory Map of client responses; broadcasts on every write; heartbeat every 15s
6. **REST API** — Serves historical snapshots for dashboard initial load (`/api/agents`, `/api/sessions`, `/api/events`)
7. **Browser Dashboard** — Vanilla JS; EventSource for live updates, REST for history; Chart.js for cost time series

### Critical Pitfalls

1. **Hooks blocking Claude Code** — Hook relay must fire-and-forget with `--max-time 1` or background `&`; server must return 202 before any DB work; relay must always `exit 0` on non-intentional errors. This is the single most dangerous failure mode — it freezes the user's Claude session.

2. **Shell injection via hook payloads** — Never interpolate tool input into shell strings. Read the entire payload via stdin (`PAYLOAD=$(cat)`), pass as raw JSON body. Test with paths containing spaces, quotes, backticks, semicolons.

3. **JSONL partial writes crashing the watcher** — Wrap every `JSON.parse()` in try/catch; buffer incomplete lines; use `chokidar` with `awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 }` to avoid reading mid-write. macOS `kqueue` via raw `fs.watch` misses rename/replace events — chokidar is mandatory, not optional.

4. **SQLite write contention under parallel agents** — GSD spawns 4+ agents simultaneously. Must use WAL mode (`PRAGMA journal_mode = WAL`), `busy_timeout = 5000`, and a single in-process write queue. Never write from multiple concurrent async operations.

5. **Agent hierarchy from timing inference** — Do not infer parent-child from session start timestamps. The `PreToolUse` hook fires in the parent session context and provides the parent session ID directly. Use this as the authoritative link. Timing-based inference produces false positives under any load.

---

## Implications for Roadmap

Based on combined research, the build order is forced by three hard dependencies: (1) the ingestion pipeline must exist before any feature can be observed, (2) JSONL parsing must be proven reliable before cost data can be trusted, and (3) agent hierarchy tracking must be correct before any multi-agent features are built on top of it.

### Phase 1: Foundation and Ingestion Pipeline

**Rationale:** Nothing else works until the data pipeline is proven. The hook relay, event ingestion, SQLite schema, and SSE bus are all prerequisites for every feature in every later phase. Four of the eight critical/moderate pitfalls must be addressed here or they will corrupt all downstream work.

**Delivers:** Working end-to-end pipeline — Claude Code hook fires → event stored in SQLite → SSE pushes to browser. Minimal dashboard proves the plumbing before any UI investment.

**Addresses:** Zero instrumentation setup (table stakes), real-time event stream (table stakes), tool call log (table stakes)

**Avoids:**
- Pitfall 1: hooks blocking Claude — fire-and-forget pattern, 202-first design
- Pitfall 2: shell injection — stdin-only payload handling
- Pitfall 3: JSONL partial writes — chokidar + awaitWriteFinish + try/catch
- Pitfall 5: SSE memory leaks — `req.on('close')` cleanup, heartbeat, Set-based client map
- Pitfall 6: SQLite contention — WAL mode, busy_timeout, write queue from day one

**Needs research during planning:** No — architecture is fully specified in ARCHITECTURE.md. Build directly from the component diagrams and schema.

### Phase 2: Cost and Token Visibility

**Rationale:** Token/cost tracking is the highest-value user pain point and the fastest path to "I can't live without this." JSONL parsing is a second independent data path that must be proven reliable before any multi-agent aggregation is built on top of it.

**Delivers:** Live cost counter per session, token usage display, context window fill indicator, cost-per-request breakdown.

**Addresses:** Token usage per request (table stakes), cost estimate in dollars (table stakes), context window fill indicator (differentiator), context window pressure alerts (differentiator), session cost budget alerts (differentiator)

**Avoids:**
- Pitfall 3 (continued): byte-offset tailing, partial line buffering, deduplication via `UNIQUE(session_id, message_id)` in token_snapshots
- Pricing hardcoding: make model rates configurable, not constants

**Needs research during planning:** Verify exact JSONL entry schema for `usage` fields by inspecting `~/.claude/projects/` directly before coding. Fetch current Anthropic model pricing at runtime rather than hardcoding.

### Phase 3: Agent Tree and Multi-Agent Observability

**Rationale:** The agent hierarchy visualization is ObservAgent's primary differentiator. It depends on Phase 1 (session tracking) and Phase 2 (cost data) being stable. Building it third ensures the data is trustworthy before the visualization layer is added.

**Delivers:** Visual agent tree (parent-child hierarchy), per-agent cost breakdown, stuck agent detection, error/failure visibility per agent.

**Addresses:** Agent tree visualization (top differentiator), per-agent cost breakdown (differentiator), stuck agent detection (differentiator), error/failure visibility (table stakes)

**Avoids:**
- Pitfall 4: parent-child correlation — use PreToolUse hook env var (parent session ID), never timing inference. Verify whether SubagentStop includes child session_id in payload — if yes, eliminates the correlation entirely.

**Needs research during planning:** Inspect actual SubagentStop hook payload to determine if child session_id is present. This single unknown changes the implementation complexity of agent hierarchy from "requires inference" to "trivially captured."

### Phase 4: Session History and Discovery

**Rationale:** Once live data is solid, historical data becomes the next user need. Search and filter require the events and sessions tables to be populated with real data — building history before the pipeline is mature would produce unreliable results.

**Delivers:** Session list, historical browsing, search and filter by project/date/model/cost/error, JSONL export.

**Addresses:** Session list/history (table stakes), search/filter runs (table stakes), JSONL export (differentiator)

**Avoids:** Building a history UI before the ingestion pipeline has proven reliability in Phase 1-3.

**Needs research during planning:** No — REST API patterns and SQLite query design are well-documented. Build from the schema and component boundaries already defined.

### Phase 5: Polish, CLI, and Zero-Config Experience

**Rationale:** The zero-config install experience is what makes adoption possible. It must be tested on a clean machine before any public release. The `observagent doctor` command is not a nice-to-have — it is the primary debug surface for users who can't get hooks to fire.

**Delivers:** `npx observagent init` (auto-installs hooks), `observagent start` (starts server + opens dashboard), `observagent doctor` (diagnoses setup issues), clean machine install testing.

**Addresses:** Zero-config local setup (table stakes and differentiator), onboarding friction reduction

**Avoids:**
- Pitfall 7: onboarding friction — auto-install hooks, never require manual `~/.claude/settings.json` editing

**Needs research during planning:** Verify Claude Code `~/.claude/settings.json` hook configuration schema before writing the auto-install code. Schema may differ across Claude Code versions.

### Phase Ordering Rationale

- **Phase 1 before everything:** Hook relay and ingestion are the only data entry points. Nothing can be observed without them.
- **Phase 2 before Phase 3:** Cost data from JSONL must be proven reliable before per-agent cost aggregation is built. A buggy cost pipeline would make the agent tree's cost rollups untrustworthy.
- **Phase 3 before Phase 4:** Agent hierarchy must be correct before historical browsing of multi-agent sessions makes sense. History of broken session trees is worse than no history.
- **Phase 4 before Phase 5:** Discovery features need real data to be meaningful. CLI polish is last because it wraps a working system, not a partial one.

### Research Flags

Needs research during planning (verify before coding):
- **Phase 2:** Exact JSONL entry schema for `usage` fields — inspect `~/.claude/projects/` on a real session before writing the parser
- **Phase 3:** SubagentStop hook payload — does it include the child session_id? This is the highest-impact unknown in the entire project. If yes, agent hierarchy becomes trivial. If no, correlation logic is needed.
- **Phase 5:** Claude Code `~/.claude/settings.json` hook configuration schema — verify before writing the auto-install CLI command

Standard patterns (skip research-phase):
- **Phase 1:** Fastify + SQLite WAL + SSE are well-documented. Architecture.md provides implementation-ready patterns including code samples.
- **Phase 4:** REST API + SQLite queries are standard. Schema is fully defined in Architecture.md.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are stable, well-documented choices with clear rationale. No experimental dependencies. |
| Features | MEDIUM | Feature set is derived from competitor analysis and domain knowledge. Exact user priorities unvalidated — ship to validate. Open questions about hook payload schemas remain. |
| Architecture | HIGH | Architecture.md provides implementation-ready component designs, SQLite schema, and code patterns. Build order is specified. Anti-patterns are explicit. |
| Pitfalls | HIGH | Pitfalls are grounded in real constraints (Claude Code hook behavior, macOS fs.watch limitations, SQLite concurrency). Prevention strategies are concrete and actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **Hook payload schemas:** The exact fields available in PreToolUse/PostToolUse/SubagentStop payloads are not confirmed by official documentation. Resolution: inspect `~/.claude/projects/` and trigger real hooks in development before writing parsers.

- **SubagentStop child session_id:** Whether SubagentStop includes the child session_id in its payload is unknown. This is the most consequential unknown — if it does, the agent hierarchy problem is trivially solved; if it does not, correlation logic (matching by cwd + time window) is required. Resolution: trigger a real Task tool spawn and inspect the hook payload in the first days of Phase 3.

- **Anthropic model pricing:** Rates should not be hardcoded. Resolution: fetch from a configurable source (env var or config file) at startup; provide sensible defaults that are easy to update.

- **Claude Code `~/.claude/settings.json` schema:** The hook auto-install CLI (Phase 5) must write this file correctly. Resolution: read existing config and merge rather than overwrite; test on a clean machine before any release.

---

## Sources

### Primary (HIGH confidence)
- ARCHITECTURE.md — component boundaries, data flow, SQLite schema, implementation patterns, build order
- PITFALLS.md — critical failure modes with concrete prevention strategies grounded in Claude Code hook behavior
- STACK.md — technology recommendations with explicit rationale and "do not use" guidance

### Secondary (MEDIUM confidence)
- FEATURES.md — competitor analysis (LangSmith, Helicone, Braintrust, AgentOps, Langfuse, Arize Phoenix), feature table stakes and differentiators
- PROJECT.md — requirements, constraints, out-of-scope boundaries

### Tertiary (LOW confidence — validate during implementation)
- Assumed Claude Code hook payload schemas — not verified against official Claude Code documentation
- Assumed SubagentStop hook behavior — verify before Phase 3 implementation
- Anthropic model pricing constants — fetch at runtime, do not trust research-time values

---
*Research completed: 2026-02-26*
*Ready for roadmap: yes*
