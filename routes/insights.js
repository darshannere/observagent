export async function insightsRoutes(fastify, options) {
  const { db } = options;

  // Prepared once at registration time — reused for all requests

  // Returns up to 7 rows (one per calendar day) for the last 6 days + today.
  // Days with no activity are absent; the frontend fills the gaps.
  // agent_id = '' filters to session-level rows only (not sub-agent rows).
  const stmtCostDaily = db.prepare(`
    SELECT
      date(last_event_ts) AS day,
      SUM(total_cost_usd) AS cost_usd
    FROM session_cost
    WHERE agent_id = ''
      AND last_event_ts >= date('now', '-6 days')
    GROUP BY date(last_event_ts)
    ORDER BY day ASC
  `);

  // Returns cost totals grouped by agent_type across all sub-agent sessions.
  // Solo sessions (agent_id = '') are excluded — they have no agent_type and
  // are already covered by cost-daily. Falls back to 'solo' label for any
  // agent_nodes rows with an empty agent_type string.
  const stmtCostByAgent = db.prepare(`
    SELECT
      COALESCE(NULLIF(an.agent_type, ''), 'solo') AS agent_type,
      SUM(sc.total_cost_usd) AS cost_usd
    FROM session_cost sc
    LEFT JOIN agent_nodes an ON an.agent_id = sc.agent_id
    WHERE sc.agent_id != ''
    GROUP BY agent_type
    ORDER BY cost_usd DESC
  `);

  // Returns tool call counts bucketed per minute for a session.
  // (timestamp / 60000) * 60000 uses SQLite integer division to snap each
  // event timestamp to the start of its minute, expressed in milliseconds.
  const stmtActivity = db.prepare(`
    SELECT
      (timestamp / 60000) * 60000 AS bucket_ms,
      COUNT(*) AS tool_calls
    FROM events
    WHERE session_id = ?
      AND hook_type = 'PostToolUse'
    GROUP BY bucket_ms
    ORDER BY bucket_ms ASC
  `);

  // Returns input + output tokens per minute for a session.
  // cache_read_tokens and cache_write_tokens excluded — charts show billed input/output only.
  const stmtTokensOverTime = db.prepare(`
    SELECT
      (timestamp_ms / 60000) * 60000 AS bucket_ms,
      SUM(input_tokens)  AS input_tokens,
      SUM(output_tokens) AS output_tokens
    FROM api_calls
    WHERE session_id = ?
    GROUP BY bucket_ms
    ORDER BY bucket_ms ASC
  `);

  fastify.get('/api/insights/activity', (request, reply) => {
    const { session_id } = request.query;
    if (!session_id) return reply.code(400).send({ error: 'session_id required' });
    reply.send(stmtActivity.all(session_id));
  });

  fastify.get('/api/insights/tokens-over-time', (request, reply) => {
    const { session_id } = request.query;
    if (!session_id) return reply.code(400).send({ error: 'session_id required' });
    reply.send(stmtTokensOverTime.all(session_id));
  });

  fastify.get('/api/insights/cost-daily', (request, reply) => {
    reply.send(stmtCostDaily.all());
  });

  fastify.get('/api/insights/cost-by-agent', (request, reply) => {
    // session_id query param accepted but reserved for Phase 13 filtering
    // eslint-disable-next-line no-unused-vars
    const { session_id } = request.query;
    reply.send(stmtCostByAgent.all());
  });
}
