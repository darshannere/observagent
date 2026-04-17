// costEngine.js — pure computation module, no side effects
// All pricing rates are USD per million tokens

export const PRICING = {
  'claude-sonnet-4-6':          { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite5m: 3.75,  cacheWrite1h: 6.00  },
  'claude-opus-4-6':            { input: 5.00,  output: 25.00, cacheRead: 0.50,  cacheWrite5m: 6.25,  cacheWrite1h: 10.00 },
  'claude-haiku-4-5':           { input: 1.00,  output:  5.00, cacheRead: 0.10,  cacheWrite5m: 1.25,  cacheWrite1h: 2.00  },
  'claude-sonnet-4-5':          { input: 3.00,  output: 15.00, cacheRead: 0.30,  cacheWrite5m: 3.75,  cacheWrite1h: 6.00  },
  'claude-opus-4-5':            { input: 5.00,  output: 25.00, cacheRead: 0.50,  cacheWrite5m: 6.25,  cacheWrite1h: 10.00 },
  'claude-opus-4-1':            { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite5m: 18.75, cacheWrite1h: 30.00 },
  'claude-haiku-3-5':           { input: 0.80,  output:  4.00, cacheRead: 0.08,  cacheWrite5m: 1.00,  cacheWrite1h: 1.60  },
};

/**
 * lookupPricing(model)
 * Returns pricing rates for a model. Tries exact match first, then strips
 * date suffixes (e.g., 'claude-haiku-4-5-20251001' → 'claude-haiku-4-5')
 * to match the base model.
 *
 * For unknown Claude-family IDs, falls back to claude-sonnet-4-6 pricing.
 * For non-Claude unknown models, returns null so we don't apply arbitrary
 * Claude pricing to third-party model IDs.
 */
export function lookupPricing(model) {
  const modelName = typeof model === 'string' ? model : '';
  if (PRICING[modelName]) return PRICING[modelName];

  // Strip YYYYMMDD date suffix: 'claude-foo-4-5-20251001' → 'claude-foo-4-5'
  const stripped = modelName.replace(/-\d{8}$/, '');
  if (PRICING[stripped]) return PRICING[stripped];

  if (modelName.startsWith('claude-') || stripped.startsWith('claude-')) {
    return PRICING['claude-sonnet-4-6'];
  }

  return null;
}

export const CONTEXT_WINDOWS = {
  'claude-sonnet-4-6':           200_000,
  'claude-opus-4-6':             200_000,
  'claude-haiku-4-5':            200_000,
  'claude-sonnet-4-5':           200_000,
  'claude-opus-4-5':             200_000,
  'claude-opus-4-1':             200_000,
  'claude-haiku-3-5':            200_000,
  // 1M context models
  'claude-opus-4-7':             1_000_000,
  'claude-sonnet-4-7':           1_000_000,
  '_default':                     200_000,
};

/**
 * normalizeCacheWriteTokens(usage)
 * Handles both legacy flat cache_creation_input_tokens and newer
 * cache_creation ephemeral breakdown fields.
 *
 * Newer payloads often include BOTH:
 * - cache_creation_input_tokens (flat total)
 * - cache_creation.ephemeral_*_input_tokens (breakdown)
 *
 * In some records, the breakdown is all zeros while the flat total is non-zero.
 * To avoid silently dropping billed cache writes, preserve any remainder from
 * the flat total.
 */
function normalizeCacheWriteTokens(usage) {
  const flatWriteTotal = usage.cache_creation_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation;

  if (!cacheCreation || typeof cacheCreation !== 'object') {
    return {
      cacheWrite5m: flatWriteTotal,
      cacheWrite1h: 0,
    };
  }

  const hasBreakdown =
    Object.prototype.hasOwnProperty.call(cacheCreation, 'ephemeral_5m_input_tokens') ||
    Object.prototype.hasOwnProperty.call(cacheCreation, 'ephemeral_1h_input_tokens');

  if (!hasBreakdown) {
    return {
      cacheWrite5m: flatWriteTotal,
      cacheWrite1h: 0,
    };
  }

  let cacheWrite5m = cacheCreation.ephemeral_5m_input_tokens ?? 0;
  const cacheWrite1h = cacheCreation.ephemeral_1h_input_tokens ?? 0;

  const classifiedTotal = cacheWrite5m + cacheWrite1h;
  if (flatWriteTotal > classifiedTotal) {
    cacheWrite5m += flatWriteTotal - classifiedTotal;
  }

  return { cacheWrite5m, cacheWrite1h };
}

/**
 * extractUsageRecords(jsonlRecords)
 * Filters raw JSONL records to only assistant records with final usage data.
 * Dedup rule: Claude Code JSONL emits multiple assistant records per message ID
 * (streaming chunks). ALL have stop_reason: null, so we cannot use stop_reason to
 * identify the final record. Instead, dedup by message ID keeping only the LAST
 * occurrence — the final chunk has the highest (accurate) output_tokens count.
 *
 * @param {Array} jsonlRecords - raw parsed JSONL objects
 * @returns {Array} usage objects with shape:
 *   { messageId, model, sessionId, timestamp, inputTokens, outputTokens, cacheReadTokens, cacheWrite5m, cacheWrite1h }
 */
export function extractUsageRecords(jsonlRecords) {
  // Collect all assistant records with usage, keyed by message ID.
  // Later records overwrite earlier ones so we always keep the final (complete) record.
  const byMessageId = new Map();

  for (const record of jsonlRecords) {
    // Only assistant records with usage data
    if (record.type !== 'assistant') continue;

    const msg = record.message;
    if (!msg || !msg.usage) continue;

    const usage = msg.usage;

    const { cacheWrite5m, cacheWrite1h } = normalizeCacheWriteTokens(usage);

    const key = msg.id ?? `${record.sessionId}-${record.timestamp}`;
    byMessageId.set(key, {
      messageId:        msg.id ?? null,
      model:            msg.model ?? 'claude-sonnet-4-6',
      sessionId:        record.sessionId ?? null,
      timestamp:        record.timestamp ?? null,
      inputTokens:      usage.input_tokens ?? 0,
      outputTokens:     usage.output_tokens ?? 0,
      cacheReadTokens:  usage.cache_read_input_tokens ?? 0,
      cacheWrite5m,
      cacheWrite1h,
    });
  }

  const results = Array.from(byMessageId.values());

  return results;
}

/**
 * computeCost(record)
 * Returns total cost in USD for one usage record using model-specific pricing.
 * Returns 0 for unknown non-Claude model IDs.
 *
 * @param {{ model, inputTokens, outputTokens, cacheReadTokens, cacheWrite5m, cacheWrite1h }} record
 * @returns {number} cost in USD
 */
export function computeCost(record) {
  const rates = lookupPricing(record.model);
  if (!rates) return 0;

  const inputTokens = record.inputTokens ?? 0;
  const outputTokens = record.outputTokens ?? 0;
  const cacheRead = record.cacheReadTokens ?? 0;
  const cacheWrite5m = record.cacheWrite5m ?? 0;
  const cacheWrite1h = record.cacheWrite1h ?? 0;

  return (
    inputTokens * rates.input +
    outputTokens * rates.output +
    cacheRead * rates.cacheRead +
    cacheWrite5m * rates.cacheWrite5m +
    cacheWrite1h * rates.cacheWrite1h
  ) / 1_000_000;
}

// Claude Code reserves ~40K tokens as an autocompact buffer.
// Using the same effective window makes ObservAgent's % match Claude Code's display.
// Source: codelynx.dev confirms Claude Code uses an autocompact buffer before the full context limit.
const AUTOCOMPACT_BUFFER = 40_000;

/**
 * getContextFillPercent(model, lastUsage)
 * Returns integer 0-100 representing how full the context window is based on the
 * most recent usage record's total input tokens.
 *
 * Uses effectiveWindow = contextWindow - AUTOCOMPACT_BUFFER (40K) as the denominator
 * to match Claude Code's displayed context fill %. Claude Code reserves ~40K tokens
 * as an autocompact buffer, so it divides by ~160K on a 200K model rather than 200K.
 * This was causing ObservAgent to show ~10% lower values than Claude Code for the same session.
 *
 * @param {string} model - Claude model ID
 * @param {{ inputTokens, cacheReadTokens, cacheWrite5m, cacheWrite1h }} lastUsage
 * @returns {number} integer 0-100
 */
export function getContextFillPercent(model, lastUsage) {
  const totalInput = (lastUsage.inputTokens ?? 0)
    + (lastUsage.cacheReadTokens ?? 0)
    + (lastUsage.cacheWrite5m ?? 0)
    + (lastUsage.cacheWrite1h ?? 0);
  const stripped = model.replace(/-\d{8}$/, '');
  const contextWindow = CONTEXT_WINDOWS[model] ?? CONTEXT_WINDOWS[stripped] ?? CONTEXT_WINDOWS['_default'];
  const effectiveWindow = contextWindow - AUTOCOMPACT_BUFFER;
  return Math.min(100, Math.round((totalInput / effectiveWindow) * 100));
}

/**
 * aggregateSessionCost(usageRecords)
 * Sums all usage records for a session and returns aggregate cost data.
 * model is taken from the last record (most recently used model).
 * lastEventTs is the timestamp from the last record.
 *
 * @param {Array} usageRecords - array from extractUsageRecords()
 * @returns {{ model, inputTokens, outputTokens, cacheReadTokens, cacheWrite5m, cacheWrite1h, totalCostUsd, lastEventTs, contextFillPct }}
 */
export function aggregateSessionCost(usageRecords) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWrite5m = 0;
  let cacheWrite1h = 0;
  let totalCostUsd = 0;
  let lastEventTs = null;
  let model = 'claude-sonnet-4-6';

  for (const record of usageRecords) {
    inputTokens     += record.inputTokens;
    outputTokens    += record.outputTokens;
    cacheReadTokens += record.cacheReadTokens;
    cacheWrite5m    += record.cacheWrite5m;
    cacheWrite1h    += record.cacheWrite1h;
    totalCostUsd    += computeCost(record);
    lastEventTs      = record.timestamp; // last record wins (array is ordered)
    model            = record.model;
  }

  const lastRecord = usageRecords[usageRecords.length - 1];
  const contextFillPct = lastRecord
    ? getContextFillPercent(model, lastRecord)
    : 0;

  return {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWrite5m,
    cacheWrite1h,
    totalCostUsd,
    lastEventTs,
    contextFillPct,
  };
}
