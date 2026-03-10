---
phase: 12-insights-api-layer
verified: 2026-03-10T05:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 12: Insights API Layer Verification Report

**Phase Goal:** The backend exposes all time-series data endpoints that the frontend Insights charts will consume
**Verified:** 2026-03-10T05:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #  | Truth                                                                                              | Status     | Evidence                                                                             |
|----|-----------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------|
| 1  | GET /api/insights/cost-daily returns 7 days of aggregated cost data grouped by date                | VERIFIED   | Line 146 in insights.js; stmtCostDaily queries session_cost with 7-day window        |
| 2  | GET /api/insights/cost-by-agent returns cost totals bucketed by agent type                         | VERIFIED   | Line 150 in insights.js; stmtCostByAgent LEFT JOINs agent_nodes, groups by agent_type|
| 3  | GET /api/insights/activity returns tool call counts bucketed per minute for the current session    | VERIFIED   | Line 118 in insights.js; stmtActivity uses (timestamp/60000)*60000 integer bucketing |
| 4  | GET /api/insights/tokens-over-time returns input + output token counts per minute                  | VERIFIED   | Line 124 in insights.js; stmtTokensOverTime sums from api_calls per minute bucket    |
| 5  | GET /api/insights/error-rate returns error counts per time bucket with timestamps                  | VERIFIED   | Line 130 in insights.js; stmtErrorRate uses 300000ms (5-min) buckets on events table |
| 6  | GET /api/insights/latency-by-tool returns p50 and p95 latency per tool type                       | VERIFIED   | Line 141 in insights.js; stmtLatencyByTool uses NTILE(100) window function for p50/p95|
| 7  | GET /api/insights/stalled-agents returns active agents whose last activity exceeds 10 minutes      | VERIFIED   | Line 135 in insights.js; JS computes nowMs - 10*60*1000 threshold, passed as SQL param|

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact              | Expected                                                    | Status   | Details                                                                           |
|-----------------------|-------------------------------------------------------------|----------|-----------------------------------------------------------------------------------|
| `routes/insights.js`  | insightsRoutes export with all 7 GET endpoint handlers      | VERIFIED | 157 lines; all 7 fastify.get() calls confirmed; exports { insightsRoutes }        |
| `server.js`           | Import and registration of insightsRoutes with { db }       | VERIFIED | Line 9: import; Line 41: fastify.register(insightsRoutes, { db })                 |

### Key Link Verification

| From                          | To                   | Via                                              | Status   | Details                                                                             |
|-------------------------------|----------------------|--------------------------------------------------|----------|-------------------------------------------------------------------------------------|
| server.js                     | routes/insights.js   | fastify.register(insightsRoutes, { db })         | WIRED    | Import confirmed line 9; register confirmed line 41                                 |
| /api/insights/cost-daily      | session_cost table   | stmtCostDaily.all() — agent_id = ''             | WIRED    | Query references session_cost with agent_id filter; table confirmed in schema.js    |
| /api/insights/cost-by-agent   | session_cost + agent_nodes | LEFT JOIN agent_nodes ON agent_id              | WIRED    | Both tables exist in schema; join confirmed in stmtCostByAgent                      |
| /api/insights/activity        | events table         | GROUP BY (timestamp/60000)*60000, hook_type=PostToolUse | WIRED | events table confirmed; hook_type and timestamp columns confirmed in schema         |
| /api/insights/tokens-over-time| api_calls table      | GROUP BY (timestamp_ms/60000)*60000             | WIRED    | api_calls table confirmed; timestamp_ms, input_tokens, output_tokens in schema      |
| /api/insights/error-rate      | events table         | GROUP BY 5-min bucket, exit_status != 0          | WIRED    | exit_status column confirmed in schema; 300000ms bucket in query                    |
| /api/insights/latency-by-tool | events table         | NTILE(100) OVER (PARTITION BY tool_name ORDER BY duration_ms) | WIRED | duration_ms, tool_name in schema; NTILE CTE in stmtLatencyByTool             |
| /api/insights/stalled-agents  | agent_nodes table    | WHERE state='active' AND last_activity_ts < threshold | WIRED | agent_nodes confirmed; state, last_activity_ts columns confirmed in schema          |

### Requirements Coverage

| Requirement | Source Plans      | Description                                                      | Status    | Evidence                                                          |
|-------------|-------------------|------------------------------------------------------------------|-----------|-------------------------------------------------------------------|
| INSG-01     | 12-01             | User can see daily cost trend over past 7 days as area chart     | SATISFIED | /api/insights/cost-daily returns { day, cost_usd } per calendar day |
| INSG-02     | 12-01             | User can see cost breakdown by agent type as bar chart           | SATISFIED | /api/insights/cost-by-agent returns { agent_type, cost_usd }      |
| INSG-03     | 12-02             | User can see tool call activity timeline (calls per minute)      | SATISFIED | /api/insights/activity returns { bucket_ms, tool_calls } per minute |
| INSG-04     | 12-02             | User can see token consumption rate over time                    | SATISFIED | /api/insights/tokens-over-time returns { bucket_ms, input_tokens, output_tokens } |
| INSG-05     | 12-03             | User can see error rate timeline with visual spike highlighting  | SATISFIED | /api/insights/error-rate returns { bucket_ms, errors, total }     |
| INSG-06     | 12-03             | User can see per-tool-type latency chart (p50/p95)               | SATISFIED | /api/insights/latency-by-tool returns { tool_name, p50_ms, p95_ms, sample_count } |
| INSG-07     | 12-03             | User can identify stalled agents from Insights panel             | SATISFIED | /api/insights/stalled-agents returns { agent_id, agent_type, last_activity_ts, idle_seconds } |

All 7 INSG requirements (INSG-01 through INSG-07) declared across the three plans are accounted for. No orphaned requirements detected — REQUIREMENTS.md maps all 7 to Phase 12 (and Phase 13/14 for frontend rendering).

### Anti-Patterns Found

None. Scan of `routes/insights.js` found:
- No TODO/FIXME/HACK/PLACEHOLDER comments
- No empty return null / return {} / return [] stubs
- No console.log-only implementations
- No unimplemented handlers

All 7 handlers are substantive: each calls a prepared statement and sends the result.

### Human Verification Required

The following items are correct at the API layer but require a running server to fully confirm end-to-end behavior:

**1. cost-daily date arithmetic correctness**

Test: Run `curl http://localhost:4999/api/insights/cost-daily` when the DB has sessions spanning multiple days.
Expected: Returns an array where each `day` value is an ISO date string (e.g., "2026-03-10") and `cost_usd` is a positive number. At most 7 rows, none older than 7 days.
Why human: SQLite `date('now', '-6 days')` behavior and the agent_id='' filter can only be confirmed against live data.

**2. activity and tokens-over-time 400 guard**

Test: Run `curl http://localhost:4999/api/insights/activity` (no session_id param).
Expected: HTTP 400 with JSON body `{ "error": "session_id required" }`.
Why human: Fastify error serialization behavior confirms the exact status code is delivered to the client.

**3. latency-by-tool NTILE percentile accuracy**

Test: Run `curl http://localhost:4999/api/insights/latency-by-tool` when events exist with varied duration_ms values.
Expected: `p50_ms` <= `p95_ms` for every row; `sample_count` >= 2 for every row returned.
Why human: NTILE(100) approximation accuracy requires live data with sufficient row counts to validate.

**4. stalled-agents threshold timing**

Test: Ensure an agent in `agent_nodes` with `state='active'` and `last_activity_ts` older than 10 minutes appears in results.
Expected: Row returned with correct `idle_seconds` value matching approximately `(now - last_activity_ts) / 1000`.
Why human: The Date.now() threshold is computed at request time in JS — needs a live call to verify real values.

### Schema Column Alignment

All column names used in prepared statements were verified against `db/schema.js`:

| Column used in query        | Table         | Confirmed in schema |
|-----------------------------|---------------|---------------------|
| agent_id, total_cost_usd, last_event_ts | session_cost | Yes |
| agent_type                  | agent_nodes   | Yes                 |
| timestamp, hook_type, exit_status, duration_ms, tool_name, session_id | events | Yes |
| timestamp_ms, input_tokens, output_tokens | api_calls | Yes |
| state, last_activity_ts     | agent_nodes   | Yes                 |

### Commit Verification

All commits documented in SUMMARY files were confirmed to exist in git history:

| Commit   | Plan  | Description                                           | Files modified         |
|----------|-------|-------------------------------------------------------|------------------------|
| ca24edc  | 12-01 | Create routes/insights.js (cost-daily, cost-by-agent) | routes/insights.js     |
| f1fbab7  | 12-01 | Register insightsRoutes in server.js                  | server.js              |
| a8b4f96  | 12-02 | Add activity and tokens-over-time endpoints            | routes/insights.js     |
| a2e5fe2  | 12-03 | Add error-rate, stalled-agents, latency-by-tool        | routes/insights.js     |

### Summary

Phase 12 fully achieves its goal. All 7 `GET /api/insights/*` endpoints exist in `routes/insights.js`, are correctly wired into `server.js` via `fastify.register(insightsRoutes, { db })`, and contain substantive prepared-statement-backed implementations — no stubs, placeholders, or empty handlers. Every column referenced in each SQL query exists in the corresponding table in `db/schema.js`. All 7 INSG requirements are satisfied at the API layer. The module correctly exports `insightsRoutes` as confirmed by Node.js ES module import verification. Four items are flagged for human verification (live server behavioral checks) but all automated evidence is complete and consistent.

---

_Verified: 2026-03-10T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
