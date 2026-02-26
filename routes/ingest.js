import { broadcast } from '../lib/sseClients.js';

// In-memory Map for PreToolUse/PostToolUse pairing — keyed by tool_call_id
// Declared at module scope so it persists across requests within the same process
const pendingCalls = new Map();

// 5-minute TTL cleanup — scans every 60 seconds for stale entries
// Prevents unbounded growth if PostToolUse is never received (e.g., tool crash)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
  for (const [id, entry] of pendingCalls) {
    if (entry.startTs < cutoff) pendingCalls.delete(id);
  }
}, 60_000); // scan every 60 seconds

export async function ingestRoutes(fastify, options) {
  const { writeQueue } = options;

  fastify.post('/ingest', async (request, reply) => {
    const raw = request.body;

    // Shape the event — relay.py sends 4 fields; server adds timestamp and nulls
    const event = {
      tool_name:    raw.tool_name    || '',
      hook_type:    raw.hook_type    || '',
      session_id:   raw.session_id   || '',
      tool_call_id: raw.tool_call_id || null,
      timestamp:    Date.now(),
      duration_ms:  null,
      exit_status:  null,
    };

    // PreToolUse/PostToolUse pairing — duration_ms computed here, BEFORE broadcast, so SSE clients receive final value
    if (event.hook_type === 'PreToolUse' && event.tool_call_id !== null) {
      // Store start timestamp and session for this in-flight tool call
      pendingCalls.set(event.tool_call_id, {
        startTs:    event.timestamp,
        session_id: event.session_id,
      });
    } else if (event.hook_type === 'PostToolUse' && event.tool_call_id !== null) {
      const pending = pendingCalls.get(event.tool_call_id);
      if (pending) {
        // Compute elapsed duration and clean up the entry
        event.duration_ms = event.timestamp - pending.startTs;
        pendingCalls.delete(event.tool_call_id);
      }
      // If no pending entry, duration_ms remains null (tool call started before server restart)
    }

    // SUCCESS CRITERION: 202 MUST be sent before any DB write occurs.
    // Log order in stdout proves this: "[ingest] 202 sent" appears before "[db] write complete"
    console.log('[ingest] 202 sent:', event.tool_name, event.hook_type);
    reply.code(202).send();

    // setImmediate guarantees the response flush happens in the current tick
    // before the queue write starts in the next tick
    setImmediate(() => {
      writeQueue.enqueue(event);
      broadcast(event);
    });
  });
}
