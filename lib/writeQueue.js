export class WriteQueue {
  constructor(db) {
    this.db = db;
    this.queue = [];
    this.processing = false;

    // Prepare statement once — avoids re-parsing on every insert
    this.stmt = this.db.prepare(`
      INSERT INTO events (tool_name, hook_type, session_id, agent_id, tool_call_id, timestamp, duration_ms, exit_status, tool_summary)
      VALUES (@tool_name, @hook_type, @session_id, @agent_id, @tool_call_id, @timestamp, @duration_ms, @exit_status, @tool_summary)
    `);
  }

  enqueue(event) {
    this.queue.push(event);
    if (!this.processing) this._process();
  }

  _process() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    this.processing = true;
    const event = this.queue.shift();

    try {
      this.stmt.run(event);
      console.log('[db] write complete:', event.tool_name, event.hook_type);
    } catch (err) {
      console.error('[db] write error:', err.message);
    }

    // setImmediate yields to event loop — allows concurrent HTTP requests to be received
    // between writes, preventing write starvation while still serializing all DB operations
    setImmediate(() => this._process());
  }
}
