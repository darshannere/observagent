# Server

**File:** `server.js`
**Framework:** Fastify v5 with `fastify-sse-v2` and `@fastify/static`

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4999` | TCP port to listen on. Always bound to `127.0.0.1`. |
| `OBSERVAGENT_DB_PATH` | `./observagent.db` | Path to the SQLite database file. The parent directory is created automatically. |

When starting via `observagent start`, both variables are set by `lib/cmd-start.js` before the process is spawned.

---

## Startup sequence

1. Read `OBSERVAGENT_DB_PATH` (default `./observagent.db`) and `PORT` (default `4999`).
2. Call `initDb(DB_PATH)`:
   - Creates parent directory if missing.
   - Opens SQLite in WAL mode.
   - Runs all `CREATE TABLE IF NOT EXISTS` DDL.
   - Runs `addColumnIfNotExists` migrations.
   - Seeds default config values.
3. **Stale node cleanup** — marks any `agent_nodes` row with `state = 'active'` as `'interrupted'`. These are agents that were active when the server last stopped and whose `SubagentStop` hook was never received.
4. Instantiate a single `WriteQueue` with the `db` handle.
5. Register `FastifySSEPlugin`.
6. Register all route plugins, each receiving `{ db, writeQueue }` as plugin options:
   - `ingestRoutes` at `/ingest`
   - `sseRoutes` at `/events`
   - `dashboardRoutes` at `/`
   - `apiRoutes` at `/api`
   - `insightsRoutes` at `/api/insights`
7. Call `fastify.listen({ port: PORT, host: '127.0.0.1' })`.
8. After successful listen, call `startJsonlWatcher(db)`.

---

## Route registration

Routes are registered as Fastify plugins using `fastify.register(plugin, opts)`. Each plugin receives the shared `db` (better-sqlite3 instance) and `writeQueue`.

```
POST /ingest          → routes/ingest.js
GET  /events          → routes/sse.js
GET  /                → routes/dashboard.js (SPA entry + static)
GET  /legacy          → routes/dashboard.js (legacy vanilla dashboard)
GET  /api/*           → routes/api.js
GET  /api/insights/*  → routes/insights.js
```

---

## Running directly

You can bypass the CLI and run the server directly:

```bash
OBSERVAGENT_DB_PATH=/tmp/test.db PORT=5000 node server.js
```

This is useful for development and testing. The server will not auto-open a browser and will not check for updates.

---

## Logging

Fastify's built-in logger is disabled (`logger: false`). All logging is done with manual `console.log` prefixed by component, e.g.:

```
[db] initialized — WAL mode active
[ingest] session abc123 — first PreToolUse, creating session root node
[server] marked 2 stale active agent(s) as 'interrupted' on startup
[sse] client connected (total: 1)
```

This keeps the output clean and structured without the noise of Fastify's default JSON logs.
