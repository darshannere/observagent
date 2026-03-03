import { addClient, removeClient } from '../lib/sseClients.js';

export async function sseRoutes(fastify, options) {
  fastify.get('/events', function (request, reply) {
    reply.raw.setHeader('X-Accel-Buffering', 'no')
    addClient(reply);

    request.socket.on('close', () => {
      removeClient(reply);
    });

    // Send initial connected confirmation so browser knows the stream is live
    reply.sse({ data: JSON.stringify({ type: 'connected', ts: Date.now() }) });

    // fastify-sse-v2 keeps the connection open until the client disconnects.
    // Do NOT return or call reply.send() — that would close the stream.
  });
}
