import { broadcast } from '../lib/sseClients.js';

// In-memory Map for PreToolUse/PostToolUse pairing — keyed by tool_call_id
// Declared at module scope so it persists across requests within the same process
const pendingCalls = new Map();

// In-memory Map for pending initial_prompt from Task tool — keyed by session_id
// Stores the last Task description seen per session until SubagentStart claims it
const pendingInitialPrompts = new Map();

// 5-minute TTL cleanup — scans every 60 seconds for stale entries
// Prevents unbounded growth if PostToolUse is never received (e.g., tool crash)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
  for (const [id, entry] of pendingCalls) {
    if (entry.startTs < cutoff) pendingCalls.delete(id);
  }
  // Clean up stale initial_prompt entries (older than 5 minutes)
  for (const [sessionId, entry] of pendingInitialPrompts) {
    if (entry.ts < cutoff) pendingInitialPrompts.delete(sessionId);
  }
}, 60_000); // scan every 60 seconds

export async function ingestRoutes(fastify, options) {
  const { writeQueue, db } = options;

  // Prepared statements for agent_nodes — called at registration time
  const upsertAgentNode = db.prepare(`
    INSERT INTO agent_nodes (agent_id, parent_session_id, agent_type, state, spawned_at, last_activity_ts, transcript_path)
    VALUES (@agent_id, @parent_session_id, @agent_type, @state, @spawned_at, @last_activity_ts, @transcript_path)
    ON CONFLICT(agent_id) DO UPDATE SET
      state            = excluded.state,
      last_activity_ts = excluded.last_activity_ts,
      transcript_path  = COALESCE(excluded.transcript_path, agent_nodes.transcript_path)
  `);
  const updateAgentState = db.prepare(
    `UPDATE agent_nodes SET state = @state, last_activity_ts = @last_activity_ts WHERE agent_id = @agent_id`
  );
  const updateAgentInitialPrompt = db.prepare(
    `UPDATE agent_nodes SET initial_prompt = @initial_prompt WHERE agent_id = @agent_id`
  );

  fastify.post('/ingest', async (request, reply) => {
    const raw = request.body;

    // Shape the event — relay.py sends 4 fields; server adds timestamp and nulls
    const event = {
      tool_name:    raw.tool_name    || '',
      hook_type:    raw.hook_type    || '',
      session_id:   raw.session_id   || '',
      agent_id:     raw.agent_id     || null,
      tool_call_id: raw.tool_call_id || null,
      timestamp:    Date.now(),
      duration_ms:  null,
      exit_status:  raw.exit_status ?? null,
      tool_summary: raw.tool_summary || null,
    };

    // full_tool_input_enabled toggle — API-controlled, default off
    // When enabled, raw tool_input JSON is logged to console for debugging (not stored in events table)
    const fullInputEnabled = db.prepare(`SELECT value FROM observagent_config WHERE key = 'full_tool_input_enabled'`).get()?.value === '1';
    if (fullInputEnabled && raw.tool_input) {
      console.log('[ingest] full_tool_input:', JSON.stringify(raw.tool_input));
    }

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

    // If this is a Task PreToolUse with initial_prompt, stash it for the next SubagentStart
    if (event.hook_type === 'PreToolUse' && raw.tool_name === 'Task' && raw.initial_prompt) {
      pendingInitialPrompts.set(event.session_id, { prompt: raw.initial_prompt, ts: event.timestamp });
    }

    // setImmediate guarantees the response flush happens in the current tick
    // before the queue write starts in the next tick
    setImmediate(() => {
      // SubagentStart: insert agent node + broadcast spawn event
      if (event.hook_type === 'SubagentStart') {
        const agentId   = raw.agent_id   || '';
        const agentType = raw.agent_type || '';
        if (agentId) {
          upsertAgentNode.run({
            agent_id:          agentId,
            parent_session_id: event.session_id,
            agent_type:        agentType,
            state:             'active',
            spawned_at:        event.timestamp,
            last_activity_ts:  event.timestamp,
            transcript_path:   raw.agent_transcript_path || null,
          });
          // Claim the pending initial_prompt for this session's new subagent
          const pending = pendingInitialPrompts.get(event.session_id);
          if (pending) {
            updateAgentInitialPrompt.run({ initial_prompt: pending.prompt, agent_id: agentId });
            pendingInitialPrompts.delete(event.session_id);
          }
          broadcast({ type: 'agent_spawn', agentId, agentType, parentSessionId: event.session_id, ts: event.timestamp });
        }
        return; // SubagentStart is not a tool call — do not insert into events table
      }

      // SubagentStop: update agent state + broadcast update event
      if (event.hook_type === 'SubagentStop') {
        const agentId = raw.agent_id || '';
        if (agentId) {
          updateAgentState.run({ state: 'completed', last_activity_ts: event.timestamp, agent_id: agentId });
          broadcast({ type: 'agent_update', agentId, state: 'completed', ts: event.timestamp });
        }
        return; // SubagentStop is not a tool call — do not insert into events table
      }

      // PreToolUse / PostToolUse — existing behavior unchanged
      writeQueue.enqueue(event);
      broadcast(event);
    });
  });
}
