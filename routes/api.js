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

  const stmtSessionCost = db.prepare(`
    SELECT session_id, model, input_tokens, output_tokens,
           cache_read_tokens, cache_write_5m, cache_write_1h,
           total_cost_usd, last_event_ts
    FROM session_cost
    ORDER BY updated_at DESC
    LIMIT 50
  `);

  const stmtTodayCost = db.prepare(`
    SELECT COALESCE(SUM(total_cost_usd), 0) as total
    FROM session_cost
    WHERE date(last_event_ts) = date('now')
  `);

  const stmtAgents = db.prepare(`
    SELECT agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts
    FROM agent_nodes
    ORDER BY spawned_at ASC
  `);

  const stmtGetConfig = db.prepare(
    `SELECT value FROM observagent_config WHERE key = ?`
  );

  const stmtSetConfig = db.prepare(`
    INSERT OR REPLACE INTO observagent_config (key, value) VALUES (?, ?)
  `);

  // Filtered session list with is_live and has_errors
  const stmtSessions = db.prepare(`
    SELECT
      sc.session_id,
      sc.project_name,
      sc.model,
      sc.total_cost_usd,
      sc.last_event_ts,
      COALESCE(e.has_errors, 0) AS has_errors,
      CASE WHEN COALESCE(live.max_ts, 0) > ? THEN 1 ELSE 0 END AS is_live
    FROM session_cost sc
    LEFT JOIN (
      SELECT session_id,
             MAX(CASE WHEN exit_status IS NOT NULL AND exit_status != 0 THEN 1 ELSE 0 END) AS has_errors
      FROM events
      GROUP BY session_id
    ) e ON sc.session_id = e.session_id
    LEFT JOIN (
      SELECT session_id, MAX(timestamp) AS max_ts
      FROM events
      GROUP BY session_id
    ) live ON sc.session_id = live.session_id
    WHERE sc.agent_id = ''
      AND (? = '' OR sc.project_name LIKE '%' || ? || '%')
      AND (? = '' OR sc.last_event_ts >= ?)
      AND (? = '' OR sc.last_event_ts <= ?)
      AND (? = '' OR sc.model = ?)
      AND (? = 0   OR sc.total_cost_usd >= ?)
      AND (? = 0   OR sc.total_cost_usd <= ?)
      AND (? = 0   OR COALESCE(e.has_errors, 0) = 1)
    ORDER BY sc.last_event_ts DESC
  `);

  // Session metadata for export
  const stmtSessionById = db.prepare(`
    SELECT session_id, project_name, model, total_cost_usd, last_event_ts
    FROM session_cost WHERE session_id = ? AND agent_id = ''
  `);

  // PostToolUse-only events for export (complete tool calls with duration + exit_status)
  const stmtExportEvents = db.prepare(`
    SELECT tool_name, timestamp, duration_ms, exit_status
    FROM events
    WHERE session_id = ? AND hook_type = 'PostToolUse'
    ORDER BY timestamp ASC
  `);

  fastify.get('/api/agents', (request, reply) => {
    reply.send(stmtAgents.all());
  });

  fastify.get('/api/events', (request, reply) => {
    const { session_id } = request.query;
    const rows = session_id ? stmtBySession.all(session_id) : stmtAll.all();
    reply.send(rows);
  });

  fastify.get('/api/cost', (request, reply) => {
    const sessions = stmtSessionCost.all();
    const todayRow = stmtTodayCost.get();
    reply.send({
      sessions,
      todayTotal: todayRow.total,
    });
  });

  fastify.get('/api/config', (request, reply) => {
    const budgetRow  = stmtGetConfig.get('budget_threshold_usd');
    const ctxRow     = stmtGetConfig.get('ctx_fill_threshold_pct');
    reply.send({
      budget_threshold_usd:   budgetRow  ? JSON.parse(budgetRow.value)  : null,
      ctx_fill_threshold_pct: ctxRow     ? JSON.parse(ctxRow.value)     : null,
    });
  });

  fastify.post('/api/config', (request, reply) => {
    const { budget_threshold_usd, ctx_fill_threshold_pct } = request.body ?? {};
    if (budget_threshold_usd !== undefined) {
      // Accept null to clear threshold
      if (budget_threshold_usd === null) {
        db.prepare(`DELETE FROM observagent_config WHERE key = 'budget_threshold_usd'`).run();
      } else {
        stmtSetConfig.run('budget_threshold_usd', JSON.stringify(Number(budget_threshold_usd)));
      }
    }
    if (ctx_fill_threshold_pct !== undefined) {
      if (ctx_fill_threshold_pct === null) {
        db.prepare(`DELETE FROM observagent_config WHERE key = 'ctx_fill_threshold_pct'`).run();
      } else {
        stmtSetConfig.run('ctx_fill_threshold_pct', JSON.stringify(Number(ctx_fill_threshold_pct)));
      }
    }
    reply.send({ ok: true });
  });

  fastify.get('/api/sessions', (request, reply) => {
    const {
      project    = '',
      date_from  = '',
      date_to    = '',
      model      = '',
      cost_min   = '',
      cost_max   = '',
      has_errors = '0',
    } = request.query;

    const liveThresholdMs = Date.now() - 10 * 60 * 1000; // sessions active in last 10 min
    const costMinNum  = cost_min === '' ? 0 : Number(cost_min);
    const costMaxNum  = cost_max === '' ? 0 : Number(cost_max);
    const hasErrorsNum = Number(has_errors) || 0;

    const rows = stmtSessions.all(
      liveThresholdMs,        // is_live threshold
      project, project,       // project LIKE filter (check + value)
      date_from, date_from,   // date_from filter (check + value)
      date_to, date_to,       // date_to filter (check + value)
      model, model,           // model filter (check + value)
      costMinNum, costMinNum, // cost_min filter (check + value)
      costMaxNum, costMaxNum, // cost_max filter (check + value)
      hasErrorsNum            // has_errors filter (single param, 0 = no filter)
    );
    reply.send(rows);
  });

  fastify.get('/api/sessions/:id/export', (request, reply) => {
    const { id } = request.params;
    const session = stmtSessionById.get(id);
    if (!session) return reply.code(404).send({ error: 'Session not found' });
    const events = stmtExportEvents.all(id);
    reply.send({ session, events });
  });
}
