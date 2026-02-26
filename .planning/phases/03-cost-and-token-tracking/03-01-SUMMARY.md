---
phase: 03-cost-and-token-tracking
plan: "01"
subsystem: cost-tracking
tags: [sqlite, jsonl, sse, cost-engine, file-watching]
depends_on: []
provides:
  - session_cost SQLite table with full token breakdown and USD cost
  - observagent_config SQLite table for runtime key-value config
  - PRICING and CONTEXT_WINDOWS maps for all current Claude models
  - extractUsageRecords() with stop_reason dedup rule
  - computeCost(), getContextFillPercent(), aggregateSessionCost()
  - startJsonlWatcher(db) auto-discovers ~/.claude/projects/**/*.jsonl
  - cost_update SSE events broadcast after each JSONL file re-parse
affects:
  - db/schema.js (extended with two new tables)
  - server.js (new tables created on startup via initDb())
tech_stack:
  added: []
  patterns:
    - readline.createInterface for streaming JSONL parsing
    - Module-scope debounceMap for per-file 300ms debouncing
    - Lazy prepared statement initialization (upsertStmt created once on first processFile call)
    - INSERT OR REPLACE ... ON CONFLICT for idempotent upserts
key_files:
  created:
    - lib/costEngine.js
    - lib/jsonlWatcher.js
  modified:
    - db/schema.js
decisions:
  - "stop_reason null dedup rule: skip assistant records where stop_reason is null/undefined — these are streaming-start duplicates that would double all token counts if included"
  - "Lazy prepared statement: upsertStmt created on first processFile call rather than at module load, since db instance is only available after startJsonlWatcher(db) is called"
  - "300ms debounce per file: prevents CPU thrash during active Claude Code sessions that write JSONL rapidly"
  - "Silent error catch in processFile: cost tracking must never crash the server regardless of malformed JSONL or DB errors"
  - "os.homedir() for PROJECTS_DIR: never hardcode /Users/... paths, portable across environments"
  - "cache_write_5m vs cache_write_1h split: prefer nested cache_creation.ephemeral_5m_input_tokens, fall back to flat cache_creation_input_tokens (treated as 5m)"
metrics:
  duration_seconds: 134
  tasks_completed: 3
  files_created: 2
  files_modified: 1
  completed_date: "2026-02-26"
---

# Phase 3 Plan 01: JSONL Ingestion Backbone Summary

**One-liner:** SQLite schema extended with session_cost/observagent_config tables, costEngine.js implements model-specific USD pricing with streaming-start dedup, jsonlWatcher.js auto-discovers ~/.claude/projects/**/*.jsonl and broadcasts cost_update SSE events after each re-parse.

## What Was Built

Three files form the complete JSONL-to-cost data pipeline for Phase 3:

**db/schema.js** — Extended with two new tables:
- `session_cost`: stores per-session token breakdown (input, output, cache_read, cache_write_5m, cache_write_1h), total_cost_usd, last_event_ts, updated_at; PRIMARY KEY on session_id with INSERT OR REPLACE upsert pattern
- `observagent_config`: key-value store for runtime configuration
- `idx_session_cost_ts` index on last_event_ts for time-range queries
- All DDL uses CREATE TABLE IF NOT EXISTS — idempotent server restarts

**lib/costEngine.js** — Pure computation module, no side effects:
- `PRICING`: 10-model map with input/output/cacheRead/cacheWrite5m/cacheWrite1h rates (USD per million tokens)
- `CONTEXT_WINDOWS`: per-model context window sizes (all 200K, with `_default` fallback)
- `extractUsageRecords()`: filters to assistant records with non-null stop_reason, handles nested cache_creation breakdown
- `computeCost()`: applies model-specific rates with sonnet-4-6 fallback for unknown models
- `getContextFillPercent()`: integer 0-100 based on total input tokens vs context window
- `aggregateSessionCost()`: sums all records in a session, uses last record's model and timestamp

**lib/jsonlWatcher.js** — Full JSONL data pipeline:
- `parseJsonlFile()`: streams via readline.createInterface, skips malformed lines silently
- `debounceMap`: 300ms debounce per file path prevents CPU thrash from rapid writes
- `processFile()`: parse → extractUsageRecords → aggregateSessionCost → upsert session_cost → broadcast cost_update
- `watchFile()`: fs.watch per individual JSONL file with error recovery (removes stale watchers)
- `startJsonlWatcher(db)`: discovers all subdirs of ~/.claude/projects/, processes + watches existing files, sets recursive watch for new files; graceful no-op when directory absent

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — Schema extension | 4f6b3be | feat(03-01): extend SQLite schema with session_cost and observagent_config tables |
| 2 — costEngine.js | f768893 | feat(03-01): create lib/costEngine.js with pricing table, cost formula, usage extraction |
| 3 — jsonlWatcher.js | 2feefba | feat(03-01): create lib/jsonlWatcher.js — JSONL discovery, watching, SQLite upsert, SSE broadcast |

## Verification Results

- Schema: all three tables confirmed via sqlite_master query
- costEngine: all assertions passed (dedup rule, cost formula, context fill)
- jsonlWatcher: started without error, discovered 5+ session_cost rows from real ~/.claude/projects/ JSONL files
- server.js: new tables initialized without DDL conflicts (server already running on 4999 confirmed)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files created/modified:
- FOUND: /Users/darshannere/claude/observagent/db/schema.js (modified)
- FOUND: /Users/darshannere/claude/observagent/lib/costEngine.js (created)
- FOUND: /Users/darshannere/claude/observagent/lib/jsonlWatcher.js (created)
- FOUND: /Users/darshannere/claude/observagent/.planning/phases/03-cost-and-token-tracking/03-01-SUMMARY.md (this file)

Commits verified:
- FOUND: 4f6b3be — schema extension
- FOUND: f768893 — costEngine.js
- FOUND: 2feefba — jsonlWatcher.js
