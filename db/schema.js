import Database from 'better-sqlite3';

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
      tool_call_id TEXT,
      timestamp    INTEGER NOT NULL,
      duration_ms  INTEGER,
      exit_status  INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_cost (
      session_id        TEXT    PRIMARY KEY,
      model             TEXT    NOT NULL,
      input_tokens      INTEGER NOT NULL DEFAULT 0,
      output_tokens     INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_5m    INTEGER NOT NULL DEFAULT 0,
      cache_write_1h    INTEGER NOT NULL DEFAULT 0,
      total_cost_usd    REAL    NOT NULL DEFAULT 0.0,
      last_event_ts     TEXT,
      updated_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_cost_ts ON session_cost(last_event_ts);

    CREATE TABLE IF NOT EXISTS observagent_config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  console.log('[db] initialized — WAL mode active');
  console.log('[db] session_cost and observagent_config tables ready');
  return db;
}
