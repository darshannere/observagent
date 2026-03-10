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

  // Returns error counts per 5-minute bucket across all PostToolUse events.
  // 300000 = 5 minutes in ms. exit_status non-zero (and not NULL) indicates an error.
  // Optional session_id filter; empty string '' means global view (all sessions).
  const stmtErrorRate = db.prepare(`
    SELECT
      (timestamp / 300000) * 300000 AS bucket_ms,
      SUM(CASE WHEN exit_status IS NOT NULL AND exit_status != 0 THEN 1 ELSE 0 END) AS errors,
      COUNT(*) AS total
    FROM events
    WHERE hook_type = 'PostToolUse'
      AND (? = '' OR session_id = ?)
    GROUP BY bucket_ms
    ORDER BY bucket_ms ASC
  `);

  // Returns active agents whose last_activity_ts is more than 10 minutes ago.
  // idle_seconds is computed as (now - last_activity_ts) / 1000, cast to integer.
  const stmtStalledAgents = db.prepare(`
    SELECT
      agent_id,
      agent_type,
      last_activity_ts,
      CAST((? - last_activity_ts) / 1000 AS INTEGER) AS idle_seconds
    FROM agent_nodes
    WHERE state = 'active'
      AND last_activity_ts < ?
    ORDER BY last_activity_ts ASC
  `);

  // Returns p50 and p95 latency per tool_name for PostToolUse events with non-null duration_ms.
  // NTILE(100) is a SQLite 3.25+ window function that assigns percentile buckets (1-100)
  // within each tool_name partition ordered by duration_ms.
  // MAX(CASE WHEN pct <= 50) picks the highest duration_ms still within the 50th bucket → p50.
  // HAVING sample_count >= 2 excludes tools with only 1 sample (percentile math is meaningless).
  const stmtLatencyByTool = db.prepare(`
    WITH ranked AS (
      SELECT
        tool_name,
        duration_ms,
        NTILE(100) OVER (PARTITION BY tool_name ORDER BY duration_ms) AS pct
      FROM events
      WHERE hook_type = 'PostToolUse'
        AND duration_ms IS NOT NULL
        AND (? = '' OR session_id = ?)
    )
    SELECT
      tool_name,
      MAX(CASE WHEN pct <= 50 THEN duration_ms END) AS p50_ms,
      MAX(CASE WHEN pct <= 95 THEN duration_ms END) AS p95_ms,
      COUNT(*) AS sample_count
    FROM ranked
    GROUP BY tool_name
    HAVING sample_count >= 2
    ORDER BY p95_ms DESC
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

  fastify.get('/api/insights/error-rate', (request, reply) => {
    const { session_id = '' } = request.query;
    reply.send(stmtErrorRate.all(session_id, session_id));
  });

  fastify.get('/api/insights/stalled-agents', (request, reply) => {
    const nowMs = Date.now();
    const thresholdMs = nowMs - 10 * 60 * 1000; // 10 minutes ago
    reply.send(stmtStalledAgents.all(nowMs, thresholdMs));
  });

  fastify.get('/api/insights/latency-by-tool', (request, reply) => {
    const { session_id = '' } = request.query;
    reply.send(stmtLatencyByTool.all(session_id, session_id));
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
