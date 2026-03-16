# Contributing

## Local development setup

```bash
git clone https://github.com/darshannere/observagent
cd observagent
npm install

# Run the server directly (uses ./observagent.db in the repo root)
node server.js

# Dashboard is served at http://localhost:4999
```

To test hooks end-to-end, run `observagent init` once (installs `relay.py` to `~/.claude/observagent/`) and then open Claude Code in any project. Events will flow to your local server.

---

## Building the frontend

The React SPA source lives in `frontend/src/`. The build output goes to `public/dist/` and is committed to the repo (end users get the pre-built SPA — no frontend toolchain required).

```bash
cd frontend
npm install
npm run build        # production build → ../public/dist/
npm run dev          # Vite dev server with HMR (proxies API to localhost:4999)
```

When making frontend changes, always commit the `public/dist/` build alongside the source changes.

---

## Project structure

```
bin/cli.js              CLI entry point
lib/
  cmd-init.js           observagent init
  cmd-start.js          observagent start
  cmd-doctor.js         observagent doctor
  costEngine.js         Pricing math (no I/O)
  jsonlWatcher.js       JSONL file watcher
  sseClients.js         SSE broadcast
  writeQueue.js         Serialized SQLite writer
routes/
  ingest.js             POST /ingest
  sse.js                GET /events
  api.js                GET /api/*
  insights.js           GET /api/insights/*
  dashboard.js          SPA serving
db/schema.js            SQLite init + migrations
hooks/relay.py          Claude Code hook relay
server.js               Fastify server entry
frontend/src/           React SPA source
public/dist/            Pre-built SPA (committed)
```

---

## Key conventions

**Write path:** all inserts into the `events` table must go through `WriteQueue.enqueue()`. Direct `db.prepare(...).run()` is fine for all other tables.

**SSE events:** broadcast with `broadcast(data)` from `lib/sseClients.js`. Keep payloads small — SSE is sent to every connected browser tab.

**relay.py:** must never write to stdout/stderr, must always exit 0, must complete within 500ms. Adding a new field to the event dict is the right way to send new data — avoid any logic that could throw an uncaught exception.

**Migrations:** add new columns with `addColumnIfNotExists()` in `db/schema.js`. Never drop or rename columns in migrations.

**Frontend builds:** run `npm run build` in `frontend/` and commit `public/dist/`. The npm package includes `public/` in its `files` list.

---

## Release process

See the full step-by-step in the internal `memory/release.md`. Quick summary:

1. **Bump version** in `package.json`
2. **Commit and push** to `main`
3. **Create and push tag** — `git tag -a vX.Y.Z -m "vX.Y.Z" HEAD && git push origin vX.Y.Z`
4. **Create GitHub release** — `gh release create vX.Y.Z --title "..." --notes "..."`
5. The `publish.yml` GitHub Actions workflow triggers automatically and publishes to npm via `NPM_TOKEN`.

**Verify:** `gh run list --limit 1 --workflow publish.yml` should show `completed success`.

---

## Troubleshooting during development

**Server won't start — port in use:**
```bash
lsof -i :4999
kill -9 <PID>
```

**Hook not firing:**
```bash
observagent doctor
# Check ~/.claude/settings.json has the relay.py command
```

**JSONL watcher not picking up cost data:**
```bash
ls ~/.claude/projects/
# Should show project directories with .jsonl files
```

**Database locked errors:**
This should not happen with WAL mode, but if it does, check that you don't have two server instances running against the same DB file.

**relay.py debugging:**
Add temporary `print(...)` to `relay.py` and run it manually:
```bash
echo '{"tool_name":"Bash","hook_type":"PreToolUse","session_id":"test"}' \
  | python3 ~/.claude/observagent/relay.py
```
Remember to remove print statements before committing — any stdout output breaks Claude Code.
