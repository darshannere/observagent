const clients = new Set();

export function addClient(reply) {
  clients.add(reply);
  console.log('[sse] client connected, total:', clients.size);
}

export function removeClient(reply) {
  clients.delete(reply);
  console.log('[sse] client disconnected, total:', clients.size);
}

export function broadcast(data) {
  const payload = { data: JSON.stringify(data) };
  for (const reply of clients) {
    try {
      reply.sse(payload);
    } catch {
      // Client disconnected between check and send — remove stale entry
      clients.delete(reply);
    }
  }
}

export function clientCount() {
  return clients.size;
}
