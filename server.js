import Fastify from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { initDb } from './db/schema.js';
import { WriteQueue } from './lib/writeQueue.js';
import { ingestRoutes } from './routes/ingest.js';
import { sseRoutes } from './routes/sse.js';

const fastify = Fastify({ logger: false }); // manual stdout logging; Fastify's built-in logger is disabled

// Initialize database — WAL mode set inside initDb()
const db = initDb('./observagent.db');

// Single write queue instance — all writes serialized through one queue
// Multiple instances would defeat the single-writer pattern and produce BUSY errors
const writeQueue = new WriteQueue(db);

// Register SSE plugin before routes
fastify.register(FastifySSEPlugin);

// Register routes — pass writeQueue to ingest route via options
fastify.register(ingestRoutes, { writeQueue });
fastify.register(sseRoutes);

// Start server
fastify.listen({ port: 4999, host: '127.0.0.1' }, (err) => {
  if (err) {
    console.error('[server] startup error:', err.message);
    process.exit(1);
  }
  console.log('[server] ObservAgent listening on port 4999');
});
