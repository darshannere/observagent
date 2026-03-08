import Database from 'better-sqlite3';

function addColumnIfNotExists(db, table, col, typeDef) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().find(c => c.name === col);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef}`);
}

export function initDb(path = './observagent.db') {
  const db = new Database(path);

  // WAL mode MUST be set before any DDL — mandatory from day one for concurrent agents
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL'); // safe with WAL, much faster than FULL

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name    TEXT    NOT NULL,
      hook_type    TEXT    NOT NULL,
      session_id   TEXT    NOT NULL,
      agent_id     TEXT,
      tool_call_id TEXT,
      timestamp    INTEGER NOT NULL,
      duration_ms  INTEGER,
      exit_status  INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_cost (
      session_id        TEXT    NOT NULL,
      agent_id          TEXT    NOT NULL DEFAULT '',
      model             TEXT    NOT NULL,
      input_tokens      INTEGER NOT NULL DEFAULT 0,
      output_tokens     INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_5m    INTEGER NOT NULL DEFAULT 0,
      cache_write_1h    INTEGER NOT NULL DEFAULT 0,
      total_cost_usd    REAL    NOT NULL DEFAULT 0.0,
      last_event_ts     TEXT,
      updated_at        INTEGER NOT NULL,
      PRIMARY KEY (session_id, agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_session_cost_ts ON session_cost(last_event_ts);

    CREATE TABLE IF NOT EXISTS observagent_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_nodes (
      agent_id          TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      agent_type        TEXT NOT NULL DEFAULT '',
      state             TEXT NOT NULL DEFAULT 'active',
      spawned_at        INTEGER NOT NULL,
      last_activity_ts  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_nodes_parent
      ON agent_nodes(parent_session_id);

    CREATE TABLE IF NOT EXISTS api_calls (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT    NOT NULL,
      timestamp_ms  INTEGER NOT NULL,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      UNIQUE (session_id, timestamp_ms)
    );
    CREATE INDEX IF NOT EXISTS idx_api_calls_session_ts
      ON api_calls(session_id, timestamp_ms);
  `);

  addColumnIfNotExists(db, 'session_cost', 'project_name', "TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_session_cost_project ON session_cost(project_name, last_event_ts DESC)`);
  console.log('[db] project_name column and index ready');

  addColumnIfNotExists(db, 'events', 'tool_summary', 'TEXT');
  console.log('[db] tool_summary column ready');

  addColumnIfNotExists(db, 'events', 'agent_id', 'TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id, timestamp DESC)`);
  console.log('[db] agent_id column and index ready');

  addColumnIfNotExists(db, 'agent_nodes', 'initial_prompt', 'TEXT');
  console.log('[db] initial_prompt column ready');

  addColumnIfNotExists(db, 'agent_nodes', 'transcript_path', 'TEXT');
  console.log('[db] transcript_path column ready');

  addColumnIfNotExists(db, 'api_calls', 'cache_read_tokens', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfNotExists(db, 'api_calls', 'cache_write_tokens', 'INTEGER NOT NULL DEFAULT 0');
  console.log('[db] cache token columns ready');

  db.prepare(`INSERT OR IGNORE INTO observagent_config (key, value) VALUES ('full_tool_input_enabled', '0')`).run();
  console.log('[db] full_tool_input_enabled config seeded (default: off)');

  console.log('[db] initialized — WAL mode active');
  console.log('[db] session_cost and observagent_config tables ready');
  console.log('[db] agent_nodes table ready');
  console.log('[db] api_calls table ready');
  return db;
}
