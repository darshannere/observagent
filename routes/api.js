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
}
