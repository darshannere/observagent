import Fastify from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { initDb } from './db/schema.js';
import { WriteQueue } from './lib/writeQueue.js';
import { ingestRoutes } from './routes/ingest.js';
import { sseRoutes } from './routes/sse.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { apiRoutes } from './routes/api.js';
import { startJsonlWatcher } from './lib/jsonlWatcher.js';

const fastify = Fastify({ logger: false }); // manual stdout logging; Fastify's built-in logger is disabled

// Initialize database — WAL mode set inside initDb()
const DB_PATH = process.env.OBSERVAGENT_DB_PATH ?? './observagent.db';
const db = initDb(DB_PATH);

// Startup stale-node cleanup — any agent_nodes row that was 'active' when the server last
// stopped is now in an unknown state (SubagentStop was never received). Mark them as
// 'interrupted' so the AgentTree doesn't show stale green dots after a server restart.
const interruptedCount = db.prepare(
  `UPDATE agent_nodes SET state = 'interrupted' WHERE state = 'active'`
).run().changes;
if (interruptedCount > 0) {
  console.log(`[server] marked ${interruptedCount} stale active agent(s) as 'interrupted' on startup`);
}

// Single write queue instance — all writes serialized through one queue
// Multiple instances would defeat the single-writer pattern and produce BUSY errors
const writeQueue = new WriteQueue(db);

// Register SSE plugin before routes
fastify.register(FastifySSEPlugin);

// Register routes — pass writeQueue and db to ingest route via options
fastify.register(ingestRoutes, { writeQueue, db });
fastify.register(sseRoutes);
fastify.register(dashboardRoutes);
const SERVER_START_MS = Date.now();
fastify.register(apiRoutes, { db, serverStartMs: SERVER_START_MS });

// Start server
const PORT = parseInt(process.env.PORT ?? '4999', 10);
fastify.listen({ port: PORT, host: '127.0.0.1' }, (err) => {
  if (err) {
    console.error('[server] startup error:', err.message);
    process.exit(1);
  }
  console.log(`[server] ObservAgent listening on port ${PORT}`);
  // Start JSONL cost watcher — discovers ~/.claude/projects/ automatically
  startJsonlWatcher(db).catch(e => console.error('[cost] watcher startup error:', e.message));
});
