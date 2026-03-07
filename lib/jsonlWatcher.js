import { createReadStream, watch } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { extractUsageRecords, aggregateSessionCost } from './costEngine.js';
import { broadcast } from './sseClients.js';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// Module-scope debounce map — key: filePath, value: timeout ID
const debounceMap = new Map();

// Module-scope file watchers — key: filePath, value: FSWatcher
const fileWatchers = new Map();

// Lazily initialized prepared statements — created once startJsonlWatcher(db) is called
let upsertStmt = null;
let insertApiCallStmt = null;

/**
 * parseJsonlFile(filePath)
 * Reads a JSONL file line by line, returning an array of parsed objects.
 * Malformed lines are silently skipped.
 */
async function parseJsonlFile(filePath) {
  const records = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // Malformed JSON line — skip silently
    }
  }

  return records;
}

/**
 * extractProjectName(rawRecords)
 * Extracts the human-readable project name from JSONL records using the cwd field.
 * Returns basename of the first cwd found, or 'unknown' if no cwd is present.
 */
function extractProjectName(rawRecords) {
  for (const r of rawRecords) {
    if (r.cwd && typeof r.cwd === 'string' && r.cwd.length > 1) {
      return basename(r.cwd); // e.g. '/Users/x/claude/observagent' -> 'observagent'
    }
  }
  return 'unknown';
}

/**
 * debounceReparse(filePath, handler)
 * Debounces file re-parse at 300ms per file.
 * Rapid JSONL writes during active sessions would thrash CPU without this.
 */
function debounceReparse(filePath, handler) {
  const existing = debounceMap.get(filePath);
  if (existing) clearTimeout(existing);

  const id = setTimeout(async () => {
    debounceMap.delete(filePath);
    await handler(filePath);
  }, 300);

  debounceMap.set(filePath, id);
}

/**
 * processFile(filePath, db, agentId, sessionIdOverride)
 * Core pipeline function:
 * 1. Parse JSONL file
 * 2. Extract usage records (with dedup rule)
 * 3. Aggregate session cost
 * 4. Upsert to SQLite session_cost table (keyed by session_id + agent_id)
 * 5. Broadcast cost_update SSE event (includes agentId)
 *
 * agentId: empty string for parent sessions, hex string for subagent files
 * sessionIdOverride: when set, overrides basename-derived sessionId (used for subagent files
 *   where the filename is agent-{hex}.jsonl but the session_id is the parent session directory)
 */
async function processFile(filePath, db, agentId = '', sessionIdOverride = null) {
  try {
    const rawRecords = await parseJsonlFile(filePath);
    const usageRecords = extractUsageRecords(rawRecords);

    // Insert per-API-call token records into api_calls table
    if (usageRecords.length > 0) {
      if (!insertApiCallStmt) {
        insertApiCallStmt = db.prepare(`
          INSERT OR IGNORE INTO api_calls
            (session_id, timestamp_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
          VALUES
            (@session_id, @timestamp_ms, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens)
        `);
      }
      for (const rec of usageRecords) {
        if (rec.sessionId && rec.timestamp) {
          insertApiCallStmt.run({
            session_id:         rec.sessionId,
            timestamp_ms:       new Date(rec.timestamp).getTime(),
            input_tokens:       rec.inputTokens,
            output_tokens:      rec.outputTokens,
            cache_read_tokens:  rec.cacheReadTokens,
            cache_write_tokens: rec.cacheWrite5m + rec.cacheWrite1h,
          });
        }
      }
    }

    if (usageRecords.length === 0) return; // Skip files with no final usage records

    const agg = aggregateSessionCost(usageRecords);
    const projectName = extractProjectName(rawRecords);

    // sessionId: use override for subagent files, otherwise derive from filename
    const sessionId = sessionIdOverride || basename(filePath, '.jsonl');

    // Lazy init of prepared statement (db is available at this point)
    if (!upsertStmt) {
      upsertStmt = db.prepare(`
        INSERT INTO session_cost
          (session_id, agent_id, model, input_tokens, output_tokens, cache_read_tokens,
           cache_write_5m, cache_write_1h, total_cost_usd, last_event_ts, updated_at, project_name)
        VALUES
          (@session_id, @agent_id, @model, @input_tokens, @output_tokens, @cache_read_tokens,
           @cache_write_5m, @cache_write_1h, @total_cost_usd, @last_event_ts, @updated_at, @project_name)
        ON CONFLICT(session_id, agent_id) DO UPDATE SET
          model             = excluded.model,
          input_tokens      = excluded.input_tokens,
          output_tokens     = excluded.output_tokens,
          cache_read_tokens = excluded.cache_read_tokens,
          cache_write_5m    = excluded.cache_write_5m,
          cache_write_1h    = excluded.cache_write_1h,
          total_cost_usd    = excluded.total_cost_usd,
          last_event_ts     = excluded.last_event_ts,
          updated_at        = excluded.updated_at,
          project_name      = excluded.project_name
      `);
    }

    upsertStmt.run({
      session_id:        sessionId,
      agent_id:          agentId,
      model:             agg.model,
      input_tokens:      agg.inputTokens,
      output_tokens:     agg.outputTokens,
      cache_read_tokens: agg.cacheReadTokens,
      cache_write_5m:    agg.cacheWrite5m,
      cache_write_1h:    agg.cacheWrite1h,
      total_cost_usd:    agg.totalCostUsd,
      last_event_ts:     agg.lastEventTs,
      updated_at:        Date.now(),
      project_name:      projectName,
    });

    broadcast({
      type:           'cost_update',
      sessionId,
      agentId,          // empty string for parent sessions, hex for subagents
      cost:           agg.totalCostUsd,
      tokens: {
        input:      agg.inputTokens,
        output:     agg.outputTokens,
        cacheRead:  agg.cacheReadTokens,
        cacheWrite: agg.cacheWrite5m + agg.cacheWrite1h,
      },
      contextFillPct: agg.contextFillPct,
      model:          agg.model,
      ts:             Date.now(),
    });
  } catch {
    // Errors in processFile are caught silently — cost tracking must never crash the server
  }
}

/**
 * watchFile(filePath, db, agentId, sessionIdOverride)
 * Sets up an individual fs.watch on a JSONL file with debounced re-parse on change.
 * agentId and sessionIdOverride are forwarded to processFile on each re-parse.
 */
function watchFile(filePath, db, agentId = '', sessionIdOverride = null) {
  if (fileWatchers.has(filePath)) return; // Already watching

  const watcher = watch(filePath, () => {
    debounceReparse(filePath, fp => processFile(fp, db, agentId, sessionIdOverride));
  });

  watcher.on('error', () => {
    fileWatchers.delete(filePath);
    watcher.close();
  });

  fileWatchers.set(filePath, watcher);
}

/**
 * startJsonlWatcher(db)
 * Exported entry point. Auto-discovers ~/.claude/projects/**\/*.jsonl, processes
 * existing files, and watches for new files and changes.
 *
 * If ~/.claude/projects/ does not exist, logs a message and returns gracefully.
 * Cost tracking should never prevent server startup.
 */
export async function startJsonlWatcher(db) {
  // Check if PROJECTS_DIR exists
  try {
    await stat(PROJECTS_DIR);
  } catch {
    console.log('[cost] ~/.claude/projects/ not found — cost tracking inactive');
    return;
  }

  // Discover all existing JSONL files in subdirectories
  let projectDirs;
  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    projectDirs = entries.filter(e => e.isDirectory()).map(e => join(PROJECTS_DIR, e.name));
  } catch {
    projectDirs = [];
  }

  for (const projectDir of projectDirs) {
    let files;
    try {
      files = await readdir(projectDir);
    } catch {
      continue;
    }

    for (const filename of files) {
      if (!filename.endsWith('.jsonl')) continue;
      const fullPath = join(projectDir, filename);
      await processFile(fullPath, db).catch(() => {});
      watchFile(fullPath, db);
    }

    // Scan session subdirectories for subagents/ folder
    let sessionDirs;
    try {
      const allEntries = await readdir(projectDir, { withFileTypes: true });
      sessionDirs = allEntries.filter(e => e.isDirectory()).map(e => join(projectDir, e.name));
    } catch {
      sessionDirs = [];
    }

    for (const sessionDir of sessionDirs) {
      const sessionId = basename(sessionDir); // Session ID = directory name
      const subagentsDir = join(sessionDir, 'subagents');
      let subFiles;
      try {
        subFiles = await readdir(subagentsDir);
      } catch {
        continue; // subagents/ doesn't exist yet — normal on startup
      }

      for (const f of subFiles.filter(f => f.endsWith('.jsonl'))) {
        // agentId = strip 'agent-' prefix from filename (e.g., 'agent-a2918dfba4e76fb6f.jsonl' -> 'a2918dfba4e76fb6f')
        const agentId = basename(f, '.jsonl').replace(/^agent-/, '');
        const fullPath = join(subagentsDir, f);
        await processFile(fullPath, db, agentId, sessionId).catch(() => {});
        watchFile(fullPath, db, agentId, sessionId);
      }
    }
  }

  console.log('[cost] subagent JSONL discovery complete');

  // Backfill project_name for sessions loaded before Phase 5
  try {
    const emptyRows = db.prepare("SELECT session_id FROM session_cost WHERE project_name = '' AND agent_id = ''").all();
    if (emptyRows.length > 0) {
      console.log(`[cost] backfilling project_name for ${emptyRows.length} sessions...`);
      const updateStmt = db.prepare("UPDATE session_cost SET project_name = ? WHERE session_id = ?");
      const dirEntries = await readdir(PROJECTS_DIR, { withFileTypes: true }).catch(() => []);
      const backfillProjectDirs = dirEntries.filter(e => e.isDirectory()).map(e => join(PROJECTS_DIR, e.name));
      for (const row of emptyRows) {
        let found = false;
        for (const dir of backfillProjectDirs) {
          const candidate = join(dir, row.session_id + '.jsonl');
          try {
            await stat(candidate);
            const recs = await parseJsonlFile(candidate);
            const pn = extractProjectName(recs);
            updateStmt.run(pn, row.session_id);
            found = true;
            break;
          } catch { continue; }
        }
        if (!found) updateStmt.run('unknown', row.session_id);
      }
      console.log('[cost] project_name backfill complete');
    }
  } catch {
    // Backfill errors must never crash the server
  }

  // Set up recursive directory watch for new JSONL files created during active sessions
  watch(PROJECTS_DIR, { recursive: true }, (event, filename) => {
    if (!filename?.endsWith('.jsonl')) return;

    const fullPath = join(PROJECTS_DIR, filename);
    if (fileWatchers.has(fullPath)) return;

    // Detect if this is a subagent JSONL: path contains /subagents/agent-
    const isSubagent = filename.includes('/subagents/agent-') || filename.includes('\\subagents\\agent-');

    setTimeout(async () => {
      let agentId = '';
      let sessionIdOverride = null;
      if (isSubagent) {
        // Extract agentId from filename and sessionId from parent directory name
        const parts = fullPath.split(/[/\\]/);
        const subagentsIdx = parts.lastIndexOf('subagents');
        if (subagentsIdx > 0) {
          sessionIdOverride = parts[subagentsIdx - 1]; // directory above subagents/
          const agentFile = parts[subagentsIdx + 1] || '';
          agentId = basename(agentFile, '.jsonl').replace(/^agent-/, '');
        }
      }
      await processFile(fullPath, db, agentId, sessionIdOverride).catch(() => {});
      watchFile(fullPath, db, agentId, sessionIdOverride);
    }, 200); // 200ms delay: new file may not be readable at rename-event time
  });

  console.log(`[cost] JSONL watcher started — watching ${PROJECTS_DIR}`);
}
