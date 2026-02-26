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
    )
  `);

  console.log('[db] initialized — WAL mode active');
  return db;
}
