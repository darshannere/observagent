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

// Lazily initialized prepared statement — created once startJsonlWatcher(db) is called
let upsertStmt = null;

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

    if (usageRecords.length === 0) return; // Skip files with no final usage records

    const agg = aggregateSessionCost(usageRecords);

    // sessionId: use override for subagent files, otherwise derive from filename
    const sessionId = sessionIdOverride || basename(filePath, '.jsonl');

    // Lazy init of prepared statement (db is available at this point)
    if (!upsertStmt) {
      upsertStmt = db.prepare(`
        INSERT INTO session_cost
          (session_id, agent_id, model, input_tokens, output_tokens, cache_read_tokens,
           cache_write_5m, cache_write_1h, total_cost_usd, last_event_ts, updated_at)
        VALUES
          (@session_id, @agent_id, @model, @input_tokens, @output_tokens, @cache_read_tokens,
           @cache_write_5m, @cache_write_1h, @total_cost_usd, @last_event_ts, @updated_at)
        ON CONFLICT(session_id, agent_id) DO UPDATE SET
          model             = excluded.model,
          input_tokens      = excluded.input_tokens,
          output_tokens     = excluded.output_tokens,
          cache_read_tokens = excluded.cache_read_tokens,
          cache_write_5m    = excluded.cache_write_5m,
          cache_write_1h    = excluded.cache_write_1h,
          total_cost_usd    = excluded.total_cost_usd,
          last_event_ts     = excluded.last_event_ts,
          updated_at        = excluded.updated_at
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
 * watchFile(filePath, db)
 * Sets up an individual fs.watch on a JSONL file with debounced re-parse on change.
 */
function watchFile(filePath, db) {
  if (fileWatchers.has(filePath)) return; // Already watching

  const watcher = watch(filePath, () => {
    debounceReparse(filePath, fp => processFile(fp, db));
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
  }

  // Set up recursive directory watch for new JSONL files created during active sessions
  watch(PROJECTS_DIR, { recursive: true }, (event, filename) => {
    if (!filename?.endsWith('.jsonl')) return;

    const fullPath = join(PROJECTS_DIR, filename);
    if (!fileWatchers.has(fullPath)) {
      setTimeout(async () => {
        await processFile(fullPath, db).catch(() => {});
        watchFile(fullPath, db);
      }, 200); // 200ms delay: new file may not be readable at rename-event time
    }
  });

  console.log(`[cost] JSONL watcher started — watching ${PROJECTS_DIR}`);
}
