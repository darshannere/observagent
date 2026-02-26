# Stack Research: ObservAgent v1.1

**Domain:** Real-time AI agent observability platform — v1.1 additions on top of existing Fastify/better-sqlite3/vanilla JS stack
**Researched:** 2026-02-26
**Confidence:** HIGH (verified against npm registry, live JSONL inspection, Anthropic docs)

---

## Existing Stack (DO NOT RE-RESEARCH)

Already validated and in production (`package.json` confirms):

| Package | Version | Role |
|---------|---------|------|
| `fastify` | 5.7.4 | HTTP server + SSE |
| `fastify-sse-v2` | 4.2.2 | SSE plugin |
| `better-sqlite3` | 12.6.2 | Synchronous SQLite, WAL mode |

Runtime: Node.js 22.12.0 (confirmed). Project type: `"type": "module"` (pure ESM).

---

## New Dependencies for v1.1 Features

### 1. JSONL File Watching — `chokidar` 4.0.3

**Feature:** JSONL-based cost and token tracking

**Use:** Watching `~/.claude/projects/**/*.jsonl` for new bytes appended by Claude Code.

| Property | Value |
|----------|-------|
| Version | `4.0.3` (not 5.0.0) |
| Why 4.x not 5.x | 5.0.0 requires Node >= 20.19.0 exactly; 4.x requires >= 14.16.0 which gives more headroom for contributors on slightly older Node 20.x minor versions. Both work fine on Node 22.12.0. |
| Module type | Dual CJS/ESM (`exports` field provides both) — compatible with `"type": "module"` project |
| No build step | Pure JS, no native binaries |
| Why not raw `fs.watch` | `fs.watch` on macOS is unreliable for subdirectory watching — misses events under `~/.claude/projects/` subdirectories |
| Why not `5.0.0` | `readdirp@5` peer dependency also requires Node >= 20.19.0; creates a trap for anyone on 20.18.x or earlier |

```bash
npm install chokidar@4.0.3
```

**JSONL parsing:** Zero new dependencies. Node's built-in readline + file handle is sufficient. Pattern: open file at offset 0, read lines with `readline.createInterface`, buffer partial last line, re-scan from last known byte offset on subsequent watcher events. `JSON.parse()` per line.

---

### 2. Cost Calculation — No New Library

**Feature:** COST-01 through COST-04 (token tracking, context fill, live dollar cost, budget alerts)

**The JSONL schema is known.** Live inspection of `~/.claude/projects/-Users-darshannere-claude-observagent/*.jsonl` confirms the `usage` object structure for `type: "assistant"` messages:

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-6",
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 6191,
      "cache_read_input_tokens": 25354,
      "output_tokens": 122,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 6191,
        "ephemeral_1h_input_tokens": 0
      }
    }
  }
}
```

**Pricing table (verified via Anthropic docs, 2026-02-26):**

| Model ID pattern | Input $/MTok | Output $/MTok | Cache Write $/MTok | Cache Read $/MTok |
|-----------------|-------------|--------------|-------------------|--------------------|
| `claude-opus-*` | $15 | $75 | $18.75 (25% markup) | $1.50 (10% of input) |
| `claude-sonnet-*` | $3 | $15 | $3.75 | $0.30 |
| `claude-haiku-*` | $0.80 | $4 | $1.00 | $0.08 |

**Cost formula (embed as a JS module, no npm package):**

```js
// lib/cost.js
const PRICING = {
  'opus':   { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'sonnet': { input: 3,  output: 15, cacheWrite: 3.75,  cacheRead: 0.30 },
  'haiku':  { input: 0.8,output: 4,  cacheWrite: 1.00,  cacheRead: 0.08 },
};

export function calcCostUSD(model, usage) {
  const tier = Object.keys(PRICING).find(k => model?.includes(k)) ?? 'sonnet';
  const p = PRICING[tier];
  const M = 1_000_000;
  return (
    (usage.input_tokens             * p.input      / M) +
    (usage.output_tokens            * p.output     / M) +
    (usage.cache_creation_input_tokens * p.cacheWrite / M) +
    (usage.cache_read_input_tokens  * p.cacheRead  / M)
  );
}
```

No npm package. Inline constant map. Keyed by model name substring match.

---

### 3. Multi-Agent Tree Visualization — `d3-hierarchy` 3.1.2

**Feature:** AGENT-01 — agent tree showing parent → child relationships

**Context:** The existing stack uses Chart.js 4.x from CDN. For the agent tree, a full graph library (vis-network, cytoscape) is overkill — agent trees are strictly hierarchical (parent → child), not arbitrary graphs.

| Option | CDN Size | Verdict |
|--------|----------|---------|
| vis-network 10.0.2 standalone | 644 KB | Too large for a local tool dashboard; also drags in multiple peer deps |
| D3 v7.9.0 full | 280 KB | Overkill — only need `d3-hierarchy` layout + manual SVG |
| cytoscape 3.33.1 | ~200 KB | Graph-oriented (arbitrary edges); overkill for a tree |
| **d3-hierarchy 3.1.2** | **15 KB** | Correct scope — pure layout math for trees, no rendering |
| Custom DOM tree (no library) | 0 KB | Viable but requires writing layout algorithm |

**Recommendation: `d3-hierarchy` from CDN, rendered to SVG via vanilla JS DOM.**

Why: d3-hierarchy computes node positions (x, y, width, height) for tree layouts (`d3.tree()`, `d3.stratify()`). The render step is standard SVG `<rect>`, `<text>`, `<path>` elements — no framework needed. This approach integrates cleanly with the existing vanilla JS + Chart.js dashboard and adds only 15 KB.

```html
<!-- In index.html — CDN, no build step -->
<script src="https://cdn.jsdelivr.net/npm/d3-hierarchy@3.1.2/dist/d3-hierarchy.min.js"></script>
```

**Tree data model:** Agent tree is reconstructed from the `events` SQLite table. The `session_id` field from hooks + `parentUuid`/`sessionId` fields in JSONL Task tool entries (`tool_name = 'Task'`) identify parent → child relationships. Store a `sessions` table with `session_id`, `parent_session_id` (NULL for top-level), `created_at`. JSONL parser populates this when it finds a `type: "assistant"` entry containing a `Task` tool_use with a recognizable child session ID.

---

### 4. Gantt Timeline View — Chart.js horizontal bar (no new library)

**Feature:** DASH-03 — Gantt-style agent timeline view

**Context:** Chart.js 4.5.1 is already loaded in the dashboard. It supports horizontal bar charts natively.

| Option | CDN Size | Verdict |
|--------|----------|---------|
| frappe-gantt 1.2.2 | 48 KB | Purpose-built Gantt; adds dependency but clean API |
| Chart.js horizontal bar (existing) | 0 KB additional | Already loaded; enough for agent swimlanes |
| D3 custom | 280 KB | Overkill |
| dhtmlx-gantt | Not OSS for this use | Skip |

**Recommendation: Use Chart.js horizontal bar chart already in the stack.**

A Gantt swimlane for agent timelines maps directly to Chart.js's horizontal bar chart: each dataset is one agent, bars represent tool call durations (x-axis = time, bar = [startMs, endMs]). Chart.js v4 supports `min`/`max` data format for bars via `{x: [start, end], y: label}`. Zero new KB.

If frappe-gantt is needed (e.g., interactive drag/resize for future features), it can be added later at 48 KB. Defer until the use case demands it.

---

### 5. CLI Tooling — `commander` 14.0.3 + `open` 11.0.0

**Feature:** SETUP-01 through SETUP-04 — `npx observagent init/start/doctor`

**Pattern:** `package.json` `bin` field. No `create-*` convention needed — `npx observagent` works via the `bin` field when package is published to npm.

```json
// package.json additions
{
  "bin": {
    "observagent": "./cli/index.js"
  }
}
```

**`commander` 14.0.3** — industry standard for Node CLI argument parsing.
- Engine: Node >= 20 (compatible with runtime Node 22.12.0)
- Pure ESM — compatible with `"type": "module"` project
- Commands: `program.command('init')`, `.command('start')`, `.command('doctor')`
- No alternatives needed — `yargs` and `meow` are both valid but commander has the cleanest API for subcommand CLIs

**`open` 11.0.0** — opens the dashboard URL in the default browser after `observagent start`.
- Engine: Node >= 20
- Pure ESM
- Single purpose, maintained by sindresorhus

```bash
npm install commander@14.0.3 open@11.0.0
```

**`init` command specifics:**
- Writes hooks config to `~/.claude/settings.json` — use `fs.readFile`/`fs.writeFile` with JSON merge (no new library)
- Detects `~/.claude/projects/` and reports found session files
- Pattern: read existing settings, merge `hooks` key, write back

**`doctor` command specifics:**
- Check: is server running? (`fetch('http://localhost:4999/health')` with 500ms timeout)
- Check: are hooks in `~/.claude/settings.json`?
- Check: any `.jsonl` files found in `~/.claude/projects/`?
- Check: Node version >= 18?
- All pure stdlib + `fs` — no new dependencies

---

### 6. Session Export — No New Library

**Feature:** HIST-03 — export session data as JSONL or CSV

**CSV export:** Build CSV string in JS — `Array.join(',')` with proper quoting. No csv-parse/fast-csv needed at this scale. Return as `Content-Disposition: attachment` response from Fastify.

**JSONL export:** Already in the format — SQLite rows serialized with `JSON.stringify` per line. Same response pattern.

No new npm dependencies for export.

---

### 7. Session History and Filtering — No New Library

**Feature:** HIST-01, HIST-02 — browse sessions, filter by date/cost/project/model/error

**Implementation:** SQLite queries. The `sessions` table (new, populated by JSONL watcher) will have columns for `project`, `model`, `total_cost_usd`, `has_errors`, `started_at`. Fastify route `/api/sessions` with query params for filter. Standard `WHERE` clauses with `better-sqlite3` prepared statements.

No new npm dependency — this is SQL + existing stack.

---

## Updated Dependency Summary

### New npm packages to add

```bash
npm install chokidar@4.0.3 commander@14.0.3 open@11.0.0
```

That's it. Three packages. Everything else uses:
- Node stdlib (`fs`, `readline`, `path`, `os`)
- CDN-loaded JS (`d3-hierarchy` 3.1.2 — 15 KB)
- Existing Chart.js (already loaded)
- Inline logic modules (`lib/cost.js`, `lib/jsonlWatcher.js`)

### No Build Step Maintained

All new server code is plain ESM `.js` files in `lib/` or `routes/`. CLI is `cli/index.js` with shebang. Dashboard additions are vanilla JS added to `public/index.html`. No bundler, no TypeScript compilation required.

---

## Integration Points with Existing Stack

| New Feature | Integration Point | How |
|-------------|-----------------|-----|
| JSONL watcher | `server.js` startup | `import { startJsonlWatcher } from './lib/jsonlWatcher.js'` called after `initDb()` |
| Cost data | `db/schema.js` | Add `sessions` table migration (inside existing `initDb`) and `token_snapshots` table |
| Agent tree | `routes/api.js` | New `/api/sessions/tree` route using `db.prepare()` |
| Gantt view | `public/index.html` | New `<canvas>` + Chart.js horizontal bar dataset built from `/api/events` with time range |
| CLI | `cli/index.js` | New file, referenced from `bin` in `package.json` |
| Session export | `routes/api.js` | New `/api/sessions/:id/export` route with `Content-Disposition` header |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `vis-network` | 644 KB standalone bundle; graph-oriented not tree-oriented | `d3-hierarchy` (15 KB) + vanilla SVG |
| `frappe-gantt` | Adds 48 KB for a feature Chart.js horizontal bar already handles | Chart.js existing load |
| `drizzle-orm` | Mentioned in prior STACK.md research but never added; `better-sqlite3` prepared statements are sufficient and already proven | `db.prepare()` directly |
| `csv-parse` / `fast-csv` | CSV export at this scale is 10 lines of string join | Inline string building |
| `dotenv` | Config is in `config.json` (already exists); no `.env` file needed for local tool | `fs.readFileSync` + `JSON.parse` |
| `chokidar@5.0.0` | Requires Node >= 20.19.0 exactly — creates contributor trap on Node 20.18.x | `chokidar@4.0.3` |
| `yargs` or `meow` | Valid but more complex API than needed for 3 subcommands | `commander@14.0.3` |
| `React`/`Vue` frontend | Adds build step, kills contributor DX | Vanilla JS added to existing `index.html` |
| `socket.io` / WebSockets | Existing SSE is unidirectional-only and that's all dashboard needs | SSE already in stack |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|----------------|-------|
| `chokidar` | 4.0.3 | Node >= 14.16.0 | Dual CJS/ESM; works with `"type": "module"` |
| `commander` | 14.0.3 | Node >= 20 | Pure ESM; `"type": "module"` compatible |
| `open` | 11.0.0 | Node >= 20 | Pure ESM; `"type": "module"` compatible |
| `d3-hierarchy` | 3.1.2 (CDN) | All modern browsers | No npm install needed; browser-only |
| `better-sqlite3` | 12.6.2 (existing) | Node 22.12.0 | No change |
| `fastify` | 5.7.4 (existing) | Node 22.12.0 | No change |

All three new npm packages are pure ESM. The project is already `"type": "module"`. No CommonJS interop issues.

---

## JSONL Data Schema Reference

Confirmed from live `~/.claude/projects/` inspection. Cost-relevant records have `"type": "assistant"` and contain:

```
message.model          — model ID, e.g. "claude-sonnet-4-6"
message.usage.input_tokens
message.usage.output_tokens
message.usage.cache_creation_input_tokens
message.usage.cache_read_input_tokens
sessionId              — matches hook relay session_id
parentUuid             — UUID of parent message within same session
timestamp              — ISO 8601 string
```

Task tool spawns appear as `type: "assistant"` with `message.content[].name === "Task"`. The child session ID is NOT directly in the JSONL of the parent — it must be correlated by `cwd` + start timestamp matching. The `hooks/relay.py` already captures `session_id`; sub-agents get their own new session IDs which appear in their own JSONL files under the same project directory.

---

## Sources

- npm registry (`npm info [package] version engines`) — HIGH confidence, verified 2026-02-26
- Live `~/.claude/projects/` JSONL inspection — HIGH confidence, actual runtime data
- Anthropic docs (https://docs.anthropic.com/en/docs/about-claude/models/overview) — HIGH confidence, fetched 2026-02-26; pricing: Opus $15/$75, Sonnet $3/$15, Haiku ~$1/$5 input/output per MTok
- CDN size checks via `curl -sI cdn.jsdelivr.net` — HIGH confidence, verified 2026-02-26
- Project `package.json` and source files — HIGH confidence, current state

---
*Stack research for: ObservAgent v1.1 — additive dependencies only*
*Researched: 2026-02-26*
