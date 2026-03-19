# Phase 15: Foundation + Static Data Layer - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Two utilities and two API endpoints that form the data foundation for all v2.5 DX features:
- `lib/state.js` — read/write a JSON state file at a platform-aware path
- `lib/changelog.json` — bundled changelog data served locally
- `/api/changelog` endpoint — returns the changelog array
- `/api/meta` endpoint — returns `{version, first_run}`

This phase is pure infrastructure. It unblocks phases 16–20.

</domain>

<decisions>
## Implementation Decisions

### Changelog data structure
- **Flat array** of release entries, sorted newest-first
- Each entry has exactly three fields:
  - `version` (string, e.g. `"2.5.0"`)
  - `date` (string, ISO 8601, e.g. `"2026-03-19"`)
  - `highlights` (string[], e.g. `["Improved init output", "New doctor command"]`)
- **No** breaking_changes, security flags, or affected_features — kept minimal

### Changelog updates
- `lib/changelog.json` is a **committed JSON file** in the repo
- Updated **manually** before each npm release — no build-time generation
- Maintainers add new entries at the top of the array

### State file schema
- `state.json` has a single field: `first_run` (boolean)
- `first_run = true` until the user visits the dashboard for the first time
- After first visit, `first_run` is set to `false` and written back to disk
- Same `first_run` flag works for both first-use and post-upgrade "What's New" triggers

### /api/meta response shape
- Returns exactly: `{ version: string, first_run: boolean }`
- `version` comes from `package.json` (read at server startup)
- `first_run` comes from reading `state.json` — `true` if file doesn't exist yet
- No additional fields (no `update_available`, no `latest_version`)

### Platform path resolution (state.js)
- Use `path.join(os.homedir(), '.local', 'share', 'observagent', 'state.json')` on macOS/Linux
- On Windows: `path.join(process.env.APPDATA || os.homedir(), 'observagent', 'state.json')`
- Create the directory if it doesn't exist (mkdirp)
- State file is **never** bundled — created at runtime on first write

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Infrastructure
- `lib/state.js` — state persistence utility (to be created)
- `lib/changelog.json` — bundled changelog data (to be created)
- `routes/api.js` — existing API route file where new endpoints are added
- `.planning/codebase/STACK.md` — Node.js ESM, Fastify, SQLite stack context
- `.planning/codebase/STRUCTURE.md` — lib/ directory structure

### Prior Phase Context
- `.planning/phases/06-cli-and-zero-config-setup/06-CONTEXT.md` — CLI conventions, dark theme
- `.planning/STATE.md` — research notes: changelog bundled locally, state at ~/.local/share/observagent/

</canonical_refs>

<codebase_context>
## Existing Code Insights

### Reusable Assets
- `lib/cmd-start.js` — already reads `package.json` for version; reuse same approach
- `os.homedir()` pattern — used elsewhere in codebase for path resolution
- `routes/api.js` — existing GET endpoints pattern to follow for /api/changelog and /api/meta

### Established Patterns
- ESM modules in `lib/` — all new files use `import`/`export`
- Fastify route handlers return plain JS objects (auto-serialized to JSON)
- `better-sqlite3` for DB, but state.json is file-based (not DB)

### Integration Points
- `/api/changelog` and `/api/meta` — added to `routes/api.js`
- Phase 16 (`update` command) reads `lib/changelog.json` directly (synchronous)
- Phase 17 (`/api/changelog`, `/api/meta`) reads via HTTP endpoints
- Phase 18 (empty states) reads `first_run` from `/api/meta`
- Phase 20 (onboarding) reads `first_run` from `/api/meta` and writes `false` after first visit

</codebase_context>

<specifics>
## Specific Ideas

- "Changelog should work offline — no npm registry fetch on dashboard load"
- "state.json should never throw if the file doesn't exist yet — create it silently"

</specifics>

<deferred>
## Deferred Ideas

- `last_version_seen` tracking in state (could enable per-version What's New triggers in future) — not needed for v2.5
- Changelog generation from git tags / conventional commits — manual updates preferred for simplicity

</deferred>

---

*Phase: 15-foundation-static-data-layer*
*Context gathered: 2026-03-19*
