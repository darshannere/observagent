import { broadcast } from '../lib/sseClients.js';

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
