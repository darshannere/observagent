# ObservAgent Developer Documentation

**Version:** 2.4.3 | **License:** Apache-2.0 | **Package:** `@darshannere/observagent`

ObservAgent is a local-first observability tool for Claude Code. It captures every tool call, subagent spawn, token usage, and cost — with zero changes to your AI code.

## Documentation Contents

| Document | Description |
|---|---|
| [Architecture](./architecture.md) | End-to-end data flow, component map, design decisions |
| [CLI Reference](./cli.md) | `init`, `start`, `doctor` commands and options |
| [Server](./server.md) | Fastify server, startup sequence, environment variables |
| [API Reference](./api-reference.md) | All REST endpoints — request/response shapes |
| [Database Schema](./database.md) | All tables, columns, indexes, migration strategy |
| [Hook Relay](./hooks.md) | `relay.py` — how events enter the system |
| [Frontend](./frontend.md) | React SPA — pages, components, Zustand store, SSE |
| [Contributing](./contributing.md) | Setup, conventions, release process |

## Quick orientation

```
Claude Code (hooks)
       │
       ▼
 hooks/relay.py          ← Python 3, stdlib only, 500ms fire-and-forget
       │  POST /ingest
       ▼
  server.js              ← Fastify 5, localhost:4999
  ├── routes/ingest.js   ← Pre/Post pairing, agent_nodes management
  ├── routes/sse.js      ← SSE broadcast to connected dashboards
  ├── routes/api.js      ← REST read API
  ├── routes/insights.js ← Analytics queries
  └── routes/dashboard.js← Serves React SPA from public/dist/

  lib/jsonlWatcher.js    ← Watches ~/.claude/projects/**/*.jsonl
       │                    for token/cost data
       ▼
  db/schema.js           ← better-sqlite3, WAL mode, 5 tables
       │
       ▼
  public/dist/           ← Pre-built React SPA (Vite + Tailwind)
```

## Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 |
| Python | ≥ 3 (stdlib only, for the hook relay) |
| Claude Code | Any version supporting hooks |
