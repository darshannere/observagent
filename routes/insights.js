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
