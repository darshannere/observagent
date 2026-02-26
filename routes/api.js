export async function apiRoutes(fastify, options) {
  const { db } = options;

  // Prepared once at registration time — reused for all requests
  const stmtAll = db.prepare(
    `SELECT id, tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status
     FROM events
     ORDER BY timestamp DESC
     LIMIT 200`
  );
  const stmtBySession = db.prepare(
    `SELECT id, tool_name, hook_type, session_id, tool_call_id, timestamp, duration_ms, exit_status
     FROM events
     WHERE session_id = ?
     ORDER BY timestamp ASC
     LIMIT 500`
  );

  fastify.get('/api/events', (request, reply) => {
    const { session_id } = request.query;
    const rows = session_id ? stmtBySession.all(session_id) : stmtAll.all();
    reply.send(rows);
  });
}
