# Stack Research: ObservAgent

## Domain
Real-time AI agent observability platform for Claude Code — Node.js backend, SQLite, SSE, web dashboard.

## Recommended Stack

### HTTP Server
**Fastify 4.x** ✅ HIGH CONFIDENCE
- Faster than Express (~2x throughput), cleaner plugin model
- First-class TypeScript support
- Built-in SSE streaming via `reply.raw` / `fastify-sse-v2`
- Do NOT use: bare `http` module (too low level), Express (slower, messier SSE)

### Database
**better-sqlite3 + drizzle-orm** ✅ HIGH CONFIDENCE
- Synchronous API — avoids async complexity for high-frequency writes
- WAL mode (Write-Ahead Logging) — safe for concurrent reads while writing
- Zero server overhead, embedded in process
- Do NOT use: `node:sqlite` (experimental as of Node 22), Postgres (overkill for local tool)

### Real-time Streaming
**Native SSE via Fastify** ✅ HIGH CONFIDENCE
- `EventSource` on client, chunked response on server — no library needed
- Unidirectional (server → browser) is exactly what a dashboard needs
- Do NOT use: Socket.io / WebSockets (bidirectional overhead not needed), polling

### File Watching
**chokidar 4.x** ✅ HIGH CONFIDENCE
- Reliable cross-platform `fs.watch` wrapper — raw `fs.watch` unreliable on macOS for subdirectories
- Handles `~/.claude/projects/**/*.jsonl` glob watching cleanly
- Debounce support for burst writes

### JSONL Parsing
**Plain `JSON.parse()` per line** ✅ HIGH CONFIDENCE
- JSONL is already newline-delimited — no streaming JSON parser needed
- Read new bytes, split on `\n`, parse each complete line
- Handle partial last line by buffering until next newline arrives

### Dashboard UI
**Vanilla JS + native EventSource + Chart.js 4.x** ✅ HIGH CONFIDENCE
- No build step — zero setup friction for contributors
- Chart.js via CDN for token/cost time series
- Native `EventSource` API for SSE connection
- Do NOT use: React/Vue (build toolchain adds friction), D3 (steep learning curve for simple charts)

### Hooks Integration (Claude Code → Server)
**Bash script + curl** ✅ HIGH CONFIDENCE
- 5-10ms per hook invocation vs 100-200ms Node.js cold-start
- Claude Code hooks are shell commands — keep them as shell
- Hook POSTs JSON event body to `http://localhost:PORT/ingest`
- Do NOT use: Node.js script as hook (cold-start latency on every tool use)

### TypeScript Tooling
- **tsx** — run TypeScript directly, no compile step in dev
- **vitest** — fast unit tests, ESM-native
- **eslint + @typescript-eslint + prettier** — standard TS quality tooling
- **tsup** — bundle for distribution (npm package or single-file install)

## Architecture Fit

```
Claude Code hooks (bash+curl)
        ↓ POST /ingest
  Fastify server
        ↓ better-sqlite3
     SQLite (WAL)
        ↓ SSE stream
  Browser dashboard (vanilla JS + Chart.js)

File watcher (chokidar)
  watches ~/.claude/projects/**/*.jsonl
        ↓ parsed token/cost data
  Fastify server (same process)
```

## What NOT to Build

- WebSocket server — SSE is sufficient for one-way streaming
- Separate database process — embedded SQLite is correct for local tool
- React/Next.js frontend — adds build step, kills contributor DX
- node:sqlite — still experimental, API unstable

---
*Research completed: 2026-02-26*
