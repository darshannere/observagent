# Feature Landscape

**Domain:** Developer Experience — CLI onboarding, dashboard onboarding, version management
**Project:** ObservAgent v2.5 Developer Experience milestone
**Researched:** 2026-03-11
**Scope:** NEW features only. Existing features (CLI init/start/doctor, React dashboard, agent tree, tool log, insights panel, session history) are already shipped as of v2.1.

---

## Table Stakes

Features users expect from any developer tool at this maturity. Missing = product feels broken or abandoned.

| Feature | Why Expected | Complexity | Dependencies on Existing |
|---------|--------------|------------|--------------------------|
| Post-init printed guidance (next steps) | Every CLI tool prints what to do after setup — Vite, create-react-app, Prisma all do this. Silent init feels incomplete. | Low | `npx observagent init` (existing) |
| Empty states in dashboard panels | Empty charts with no message = broken UI. Users cannot distinguish "no data yet" from a bug. | Low | React panel components (existing), Zustand store (existing) |
| Version check on CLI startup | npm, Homebrew, and every major CLI tool notifies users of outdated versions. Absence implies the tool is unmaintained. | Low | `update-notifier` npm package (new dep, low risk) |
| Dashboard version badge | Users need to know what version they are running. Standard in every developer tool footer or header. | Low | New `GET /api/version` endpoint (trivial — reads package.json) |
| Doctor command with actionable fixes | React Native CLI, Expo, npm doctor, Homebrew all list failures with exact fix commands. Showing errors without fixes frustrates users. | Medium | `npx observagent doctor` (existing) |

---

## Differentiators

Features that make ObservAgent's DX stand out. Not universally expected, but high-value for the target users (Claude Code power users, GSD users running multi-agent workflows).

| Feature | Value Proposition | Complexity | Dependencies on Existing |
|---------|-------------------|------------|--------------------------|
| Hook activation detection with inline fix instructions | ObservAgent's only real failure mode is hooks not wiring. Detecting this proactively (not just during doctor) and printing the exact `settings.json` block removes the #1 setup failure. | Medium | Doctor command logic (new hook validation shared with doctor overhaul) |
| Dashboard first-run walkthrough via contextual empty states | Not a blocking modal tour (anti-pattern for dev tools). Each panel explains its own purpose until real data arrives, then self-dismisses. Costs nothing to ignore, helps new users immediately. | Medium | React panel components (existing); new `EmptyState` component |
| `npx observagent update` with inline changelog | No other local dev tool does this. Users get the update command and see what changed in one step. Removes the "what changed?" friction between versions. | Medium | CHANGELOG.md in repo, npm registry API (public, no auth), `update-notifier` logic |
| Dashboard "What's New" page or modal | Keeps power users informed without requiring a GitHub visit. Triggered from the version badge. Auto-shows on first dashboard load after an update using localStorage version tracking. | Low-Medium | Dashboard version badge (depends on), Fastify static route or CHANGELOG endpoint |
| Feature tooltips on charts and panels | p50/p95, context fill %, stalled agents — these metrics need 1-2 sentence explanations. shadcn/ui Tooltip and Recharts ChartTooltipContent are already in the stack; this is additive configuration. | Low | shadcn/ui `Tooltip` (existing in stack), Recharts `ChartTooltipContent` (existing in stack) |

---

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Blocking modal product tour | Dev tool users dismiss these immediately. Interactive walkthroughs requiring "next" clicks are the #1 onboarding anti-pattern per UserOnboard and UX research. Users want to explore at their own pace. | Contextual empty states that disappear as data arrives |
| Demo / fake data mode for empty dashboard | Adds synthetic data to an observability tool — users cannot tell what is real. Grafana and Datadog specifically avoid pre-populating with demo data. | Descriptive empty states with clear setup steps |
| Interactive setup wizard prompts in CLI | `npx observagent init` is already zero-config. Adding interactive prompts (project name, config choices) adds friction to a tool that currently requires zero setup. | Post-init guidance text is sufficient |
| Persistent update badge in dashboard UI | Nagging update banners on every page view are noise. The standard (update-notifier pattern) is to notify once at CLI startup per session. | CLI startup banner (one-time per session only) |
| Dedicated `/whats-new` app route | Adds navigation complexity. Better delivered as a modal triggered from the version badge. | Version badge in header opens a shadcn Sheet or Dialog |
| Telemetry or analytics for onboarding tracking | ObservAgent is local-first and privacy-preserving. Any remote analytics conflicts with the core value proposition. | Never. Out of scope permanently. |
| Separate onboarding "getting started" page in the dashboard | Adds a page the user must navigate away from. Contextual help at point of confusion is more effective than a separate docs page. | Empty states + tooltips inline in each panel |

---

## Feature Breakdown by Question Domain

### 1. Post-Init Output — CLI

**Pattern from research:** Vite, create-react-app, and Prisma all use the same structure — colored success confirmation, then numbered next steps, then a single URL or command to start. Keep it under 10 lines. CLIG.dev guidance: give the single next action, not a wall of text.

**What to print after `npx observagent init`:**

```
  ObservAgent initialized.

  Next steps:
    1. Start the server      npx observagent start
    2. Open the dashboard    http://localhost:3000
    3. Run Claude Code       Hooks are configured. Your next session will be tracked automatically.

  Verify setup:              npx observagent doctor
  Docs:                      https://github.com/darshannere/observagent
```

**Implementation:** `chalk` for color (likely already in dependency tree), `boxen` for bordered box if desired. Both are standard sindresorhus packages. `boxen` is the same library used by `update-notifier` for its banner output.

**Confidence:** HIGH — pattern is consistent across all researched CLI tools.

---

### 2. Doctor Command Overhaul

**Pattern from research:** React Native CLI doctor, Expo doctor, and npm doctor use a checklist format with pass/fail symbols. React Native doctor adds automatic fix prompts ("Press F to fix all"). Homebrew doctor gives plain-English explanations with the command to run. The key principle: never list a failure without the exact fix command or the exact config block to paste.

**Recommended output format for `npx observagent doctor`:**

```
  ObservAgent Doctor

    OK   Server reachable at localhost:3000
    OK   Database: ~/.observagent/events.db (2.4 MB)
    FAIL Claude Code hooks not configured

         Add to ~/.claude/settings.json:
         {
           "hooks": {
             "PreToolUse":  [{"command": "npx observagent hook pre"}],
             "PostToolUse": [{"command": "npx observagent hook post"}]
           }
         }

         Or run: npx observagent init --hooks-only
```

**Hook activation detection:** On each CLI startup (`npx observagent start`), run a lightweight hook check — read `~/.claude/settings.json` and verify the hooks entries exist. If not, print a one-liner warning before starting: "Warning: Claude Code hooks not configured. Run 'npx observagent doctor' for setup instructions."

**Confidence:** HIGH — Expo/React Native doctor pattern is well-documented and directly applicable.

---

### 3. Empty States in Dashboard

**Pattern from research:** IBM Carbon Design System and UserOnboard identify three empty state categories:
- Informational: explains why the panel is empty
- Action-oriented: tells the user what to do
- Celebratory: acknowledges first data arriving

For ObservAgent, action-oriented is the right category. Users are developers who want to know what step to take, not be motivated. The "celebratory" state is unnecessary for a dev tool.

**Anti-pattern to avoid:** "No data yet" with nothing else. Users cannot tell if something is broken or they just need to wait.

**ObservAgent-specific empty states by panel:**

| Panel | Heading | Subtext |
|-------|---------|---------|
| Agent Tree | "No active sessions" | "Start Claude Code — ObservAgent detects sessions automatically via hooks." |
| Tool Log | "No tool calls yet" | "Tool calls appear here in real time during an active Claude Code session." |
| Cost / Activity / Health charts | "No data for this period" | "Run a Claude Code session to populate these charts." |
| Session History | "No past sessions" | "Your completed sessions will appear here after your first run." |

**Implementation:** One shared `EmptyState` component accepting `heading` and `subtext` props. Wrap each panel's data render with a conditional: if data array is empty, render `EmptyState`; otherwise render the panel. No backend changes. The component self-dismisses when Zustand store data changes from empty to populated.

**Confidence:** HIGH — established UX pattern with multiple 2025 sources, simple implementation.

---

### 4. Feature Tooltips on Charts and Panels

**Pattern from research:** Two distinct use cases require different implementations.

**Case A — Metric label explainers (the primary use case for ObservAgent):**
Add a `?` icon or `i` badge next to metric labels using shadcn/ui `<Tooltip>` with `<TooltipProvider>` wrapping the panel. Trigger on hover. Keep copy to 1-2 sentences.

Metrics that need tooltips (p-values and domain-specific terms only — cost in $ does not need one):

| Metric | Tooltip text |
|--------|-------------|
| p50 latency | "50th percentile — half of tool calls complete faster than this value." |
| p95 latency | "95th percentile — the slowest 5% of tool calls." |
| Context fill % | "How full Claude's context window is (0–100%). High values may cause the agent to forget earlier context." |
| Stalled agent | "An agent with no tool calls in the last 10 minutes." |
| Error rate | "Number of tool calls that returned an error per minute." |
| Cache hit rate | "Proportion of token requests served from Claude's prompt cache, reducing cost." |

**Case B — Recharts chart hover tooltips (already partially implemented):**
Extend existing Recharts `<Tooltip>` via shadcn `ChartTooltipContent` with `formatter` prop to add units: `ms` for latency, `$` for cost, `calls/min` for activity. The `formatter` function receives `(value, name, item, index)` and returns custom JSX.

**Principle from research:** Only tooltip metrics that are not self-explanatory. Over-tooltipping every element is noise. The rule: if a developer unfamiliar with the metric would need to Google it, tooltip it. If the label is self-explanatory ("Total Cost"), skip it.

**Confidence:** HIGH — shadcn/ui Tooltip and Recharts ChartTooltipContent are already in the stack. This is additive configuration, not new infrastructure.

---

### 5. CLI Version Check Banner

**Pattern from research:** `update-notifier` by sindresorhus (~60M weekly downloads on npm) is the de-facto standard. Used by npm, create-react-app, Vite CLI, Angular CLI, and hundreds of others.

**Key implementation characteristics:**
- Version check runs async in an unref'd child process — zero startup performance impact
- Result is cached, surfaced on the next run after a new version is found
- Default check interval: 24 hours (configurable)
- Users can opt-out via `NO_UPDATE_NOTIFIER=1` environment variable

**What the banner looks like when an update is available (boxen output):**
```
   ╭──────────────────────────────────────────╮
   │                                          │
   │   Update available 2.4.0 → 2.5.0        │
   │   Run: npx observagent update            │
   │                                          │
   ╰──────────────────────────────────────────╯
```

**Where to invoke:** At the entry point of `init`, `start`, and `doctor` commands — whichever runs first. The `update-notifier` call is a one-liner: `updateNotifier({pkg}).notify()`.

**Package:** `update-notifier` — ESM, actively maintained, production-proven.

**Confidence:** HIGH — standard npm package, extensively documented, zero implementation risk.

---

### 6. `npx observagent update` Command

**What it does:** Surfaces what has changed between the installed version and the latest, then offers to update. Removes the "what changed?" and "how do I update?" friction in one command.

**No direct precedent in the CLI tool ecosystem** — most tools just say "run npm install -g". This is a differentiator.

**Implementation approach:**
1. Fetch current version from local `package.json`
2. Fetch latest version from npm registry: `https://registry.npmjs.org/observagent/latest` (public, no auth)
3. If already at latest: print "You are up to date (v2.5.0)"
4. If behind: parse `CHANGELOG.md` entries between current and latest version headers, print them, then prompt "Update now? [Y/n]"
5. On confirm: run `npm install -g observagent@latest` via `child_process.execSync`

**CHANGELOG.md parsing:** Read between version headers using regex: `## v2.5.0` down to `## v2.4.0`. Extract lines between matches. No external parser needed — CHANGELOG.md must use consistent header format (requirement: document the format convention in the repo).

**Edge case:** If the user installed via `npx` (not globally), the install command should use `npm install -g` and notify the user this will install a global binary.

**Confidence:** MEDIUM — pattern is novel for CLIs, implementation is straightforward. Changelog parsing is custom but the regex approach is simple. Requires consistent CHANGELOG.md formatting discipline going forward.

---

### 7. Dashboard Version Badge and "What's New"

**Pattern from research:** Standard in SaaS developer tools (Vercel changelog, GitHub changelog). Version in header or footer; clicking it opens a release notes view. The localStorage pattern for auto-showing on version change is well-documented in React.

**Recommended implementation:**

**Step 1 — Version badge in dashboard header:**
- Add `GET /api/version` endpoint to Fastify — reads `package.json` version, returns `{ version: "2.5.0" }`
- Display `v2.5.0` as a small clickable badge in the top-right of the dashboard header
- Badge links to / opens "What's New"

**Step 2 — "What's New" content:**

| Approach | Complexity | Recommendation |
|----------|------------|----------------|
| Static JSON file served by Fastify (`/api/changelog`) listing last 3 releases | Low | Recommended for v2.5 |
| Parse CHANGELOG.md at runtime and serve via API | Low-Medium | Alternative |
| Hardcoded in a React component | Low but fragile | Avoid — requires code changes per release |

Serve a `changelog.json` file that the release process updates. Format:
```json
[
  { "version": "2.5.0", "date": "2026-03-15", "highlights": ["Empty state guidance in all panels", "CLI version check banner", "..."] }
]
```

**Step 3 — Auto-show after update:**
On dashboard load, compare `localStorage.getItem('observagent_seen_version')` to the version from `/api/version`. If different, open the "What's New" modal automatically. Store the new version on modal close. This is a standard React + localStorage pattern with multiple documented implementations.

**UI component:** shadcn/ui `Sheet` (slide-in from right) or `Dialog` (centered modal) — both already available in the stack. Sheet is less disruptive for a changelog display.

**Confidence:** HIGH for badge + manual open. MEDIUM for auto-show on version change (requires version propagation from backend, correct localStorage key management, and graceful handling of first install where localStorage key is absent).

---

## Feature Dependencies

```
Post-init guidance
  └── npx observagent init (existing)
  └── chalk, boxen (new deps — low risk, standard packages)

Doctor overhaul
  └── npx observagent doctor (existing)
  └── Hook validation logic (new — shared with hook activation detection)

Hook activation detection
  └── Doctor overhaul (shares hook validation logic)
  └── npx observagent start entrypoint (existing)

Empty states
  └── React panel components (existing)
  └── Zustand store data arrays (existing — check for empty)
  └── New EmptyState component (new — 30 lines of code)

Feature tooltips
  └── shadcn/ui Tooltip + TooltipProvider (existing in stack)
  └── Recharts ChartTooltipContent formatter (existing in stack)

CLI version check banner
  └── update-notifier npm package (new dep)
  └── npx observagent init/start/doctor entrypoints (existing)

npx observagent update command
  └── CLI version check logic (shared with banner)
  └── CHANGELOG.md (must maintain consistent format in repo)
  └── npm registry API (public, no auth needed)

Dashboard version badge
  └── New GET /api/version endpoint (trivial — 5 lines in routes/api.js)
  └── Dashboard header component (existing)

Dashboard "What's New" modal
  └── Dashboard version badge (depends on — badge is the trigger)
  └── changelog.json static file served by Fastify OR CHANGELOG.md parsed at runtime
  └── shadcn/ui Sheet or Dialog (existing in stack)
  └── localStorage for version tracking (browser API — no new dep)
```

---

## MVP Phase Ordering Recommendation

**Phase 1 — High impact, low complexity (build first):**
1. Post-init output guidance — text-only change to init command, chalk/boxen are one-liners
2. Empty states — one `EmptyState` component, conditional renders in each panel
3. CLI version check banner — `updateNotifier({pkg}).notify()` is a single line
4. Dashboard version badge — new `/api/version` endpoint + badge in header

**Phase 2 — Medium complexity, high visibility:**
5. Doctor command overhaul with actionable fixes + hook activation detection
6. Feature tooltips on metric labels and Recharts charts
7. Dashboard "What's New" modal triggered from version badge

**Phase 3 — Differentiators requiring more build time:**
8. `npx observagent update` command with inline changelog

**Defer to future milestone:**
- Full interactive step-by-step onboarding beyond empty states — diminishing returns for CLI-first power users
- Telemetry for tracking which panels confuse users — conflicts with local-first values permanently

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Post-init guidance format | HIGH | Vite, Prisma, create-react-app all use the same numbered next-steps pattern |
| Doctor output format | HIGH | React Native doctor, npm doctor, Expo doctor patterns well-documented |
| Empty states UX | HIGH | IBM Carbon Design System, UserOnboard, multiple 2025 sources agree |
| Feature tooltips | HIGH | shadcn/ui Tooltip and Recharts ChartTooltipContent already in stack — additive config |
| CLI version check (update-notifier) | HIGH | 60M weekly downloads, production-proven, one-liner integration |
| npx observagent update | MEDIUM | Novel feature for CLIs; implementation is straightforward but changelog parsing requires format discipline |
| Dashboard version badge | HIGH | Trivial backend endpoint + standard React component |
| Dashboard "What's New" auto-show | MEDIUM | localStorage pattern is standard; version propagation and first-install edge case need care |

---

## Sources

- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/) — authoritative CLI UX reference, responsiveness and feedback principles
- [update-notifier (sindresorhus)](https://github.com/sindresorhus/update-notifier) — de-facto CLI version check library, background check pattern
- [shadcn/ui Charts — Tooltip](https://ui.shadcn.com/charts/tooltip) — existing stack chart tooltip documentation
- [Empty States Pattern — IBM Carbon Design System](https://carbondesignsystem.com/patterns/empty-states-pattern/) — authoritative empty state categories and patterns
- [Empty State UX examples — Eleken](https://www.eleken.co/blog-posts/empty-state-ux) — practical empty state design patterns
- [Meet Doctor — React Native CLI](https://reactnative.dev/blog/2019/11/18/react-native-doctor) — doctor command UX pattern with actionable fixes
- [Expo Doctor](https://docs.expo.dev/develop/tools/) — expo doctor diagnostic format
- [npm doctor](https://docs.npmjs.com/cli/v7/commands/npm-doctor/) — checkmark/fail format reference
- [Tooltip Best Practices — userpilot](https://userpilot.com/blog/tooltip-best-practices/) — tooltip UX guidance and when to use them
- [SaaS Onboarding Best Practices 2025 — Flowjam](https://www.flowjam.com/blog/saas-onboarding-best-practices-2025-guide-checklist) — onboarding patterns and anti-patterns
- [How to show popup only once — Barcelona Code School](https://barcelonacodeschool.com/how-to-show-popup-only-once-with-react-and-localstorage/) — localStorage version tracking pattern
- [boxen (sindresorhus)](https://github.com/sindresorhus/boxen) — terminal box formatting used by update-notifier
- [chalk](https://www.npmjs.com/package/chalk) — terminal text coloring for init output
- [Vercel Changelog](https://vercel.com/changelog) — reference for in-product changelog pattern
- [Designing better tooltips — LogRocket](https://blog.logrocket.com/ux-design/designing-better-tooltips-improved-ux/) — tooltip UX principles

---

---

# Historical Research — v2.0 Agent Intelligence (2026-03-02)

*Preserved for reference. All features below are shipped in v2.0 and v2.1.*

**Domain:** AI agent observability UX — v2.0 Agent Intelligence milestone
**Researched:** 2026-03-02
**Confidence:** MEDIUM-HIGH — Based on direct codebase inspection of v1.0 (all source files, schema, hook relay), milestone context, and training knowledge of observability UX patterns from Datadog, Grafana, LangSmith, Helicone, W&B Weave (web search and WebFetch unavailable; training knowledge applied with explicit confidence flags per domain).

---

## Milestone Scope (v2.0)

This document covers **v2.0 Agent Intelligence** features added to an existing working system. The existing system (v1.0) already provides:

- Agent tree panel with hierarchical display, inline cost, stuck detection
- Tool call log panel (session-grouped, live + history, latency, error highlight)
- Timeline waterfall view (tabbed with tool log — same panel, shared column)
- Cost panel (session cost, today cost, 4 token types, context fill bar)
- Health panel (hook signal, tool calls, error rate)
- Session history page (filter by project/date/cost/model/errors, export)

**Known v1.0 deficiencies the milestone addresses:**
- Agent panel shows hex IDs (e.g., `abc12345`) instead of human-readable names
- Agent panel has no active count badge in the panel header
- Agent panel has no expandable per-agent detail (prompt, context %, token breakdown, call history)
- Agent panel does not show the current tool an agent is running in real-time
- Tool log shows only tool name (`Bash`, `Read`) without the actual command, file path, or task description
- Context fill % bar is broken or showing ~10% discrepancy vs Claude Code's own display
- Timeline and Tool Log share one column with tab switching — structurally redundant; both are call-oriented views
- Session history lacks time-range filters (date_from / date_to) on the history page

**Critical architectural constraint discovered in codebase inspection:**
`hooks/relay.py` intentionally strips `tool_input` and `tool_response` from every event before forwarding (see relay.py line 70-71 comment: "never forward tool_input or tool_response — those may contain sensitive file paths, commands, or file contents"). Tool log enrichment therefore requires **modifying relay.py to selectively forward safe metadata fields** (not raw content) per tool type. This is a v2.0 prerequisite that was not needed in v1.0.

---

## Feature Landscape (v2.0)

### Table Stakes (Users Expect These)

Features that any developer-grade observability tool provides for agent hierarchies. Missing these makes the product feel amateur compared to LangSmith, Datadog APM, or W&B Weave.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Human-readable agent names | LangSmith, Datadog, W&B all show meaningful names in trace trees. "abc12345" tells the user nothing. Users immediately ask "which agent is this?" | LOW | Use `agent_type` from SubagentStart payload (already in `agent_nodes` table). For top-level sessions, derive from project path or session index ("Main Session", "Session 2"). No schema changes needed. |
| Active agent count badge in panel header | Grafana, Datadog show live count in panel title. "AGENT TREE (3 active)" tells the user state without reading the tree. Standard pattern for monitoring dashboards. | LOW | Count agents where `state='active'` from the in-memory `agentTree.agents` map. Update on every `agent_spawn`, `agent_update`, `renderAgentTree()`. Pure frontend change — no backend needed. |
| Per-agent detail view (expandable or side panel) | Helicone, LangSmith show per-trace details on click. The current design does click-to-filter-log but shows no details. Users need context fill %, prompt, token breakdown per agent. | MEDIUM | Clicking an agent row opens a detail drawer below it (accordion expand) or replaces the bottom-right panel content. Show: initial prompt (from JSONL `system` or first `user` entry), context %, input/output/cache tokens, last N tool calls. Requires JSONL parsing for prompt; token data already in `session_cost` table. |
| Real-time current tool indicator per agent | Datadog APM shows the current span per service in the service map. During active runs, "what is this agent doing right now?" is the primary question. | LOW | Use the in-progress tool call state already tracked in `inProgressTimers`. Cross-reference `session_id` to the agent row. Show tool name as a small chip on the agent row that appears/disappears with PreToolUse/PostToolUse. Frontend-only, no backend change. |
| Correct context window fill % | Context fill is the single most time-sensitive health metric. Wrong values (currently ~10% off) destroy trust. Users rely on this for "should I let this run?" decisions. | MEDIUM | Root cause: `remaining_percentage` from `StatusLine` hook feeds the bar, but the `statusLine` hook fires at different cadence than PostToolUse. Fix: compare raw token sum from `session_cost` against known model context window sizes directly. `session_cost` already has `input_tokens` + `cache_read_tokens` + `cache_write_5m`. Use that sum / model_context_max. Source: `lib/pricingConfig.js` already has model map — add context window sizes there. |
| Date/time range filters in session history | The history page already has date_from/date_to SQL filters wired in the backend (`/api/sessions` route). The frontend history.html is missing UI for them. Users notice the absent filter immediately when browsing large session lists. | LOW | Add date pickers (HTML `<input type="date">`) to history.html filter bar. The backend `/api/sessions` already accepts `date_from` and `date_to` params. Pure frontend change. |

### Differentiators (v2.0)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Enriched tool log entries (command/path/task visible) | No competitor shows actual shell command, file path, or task description inline in the log without clicking into a full detail view. "Bash — npm install" is 10x more useful than "Bash". GSD users need to see which file is being read, which command ran, which task was spawned. | HIGH | Requires relay.py modification to extract per-tool metadata from `tool_input` before discarding it. Safe fields per tool type: Bash → `command` (first 120 chars), Read/Write/Edit → `file_path` (filename only, not full path for privacy), Task → `description` (first 80 chars), Glob/Grep → `pattern`. Must add `tool_input_summary` column to `events` table. |
| Agent-first dashboard layout (agents prominent, not a narrow sidebar) | Current layout: agent tree is a 240px fixed sidebar. For GSD runs with 4-6 parallel agents, this is the most important panel, not a sidebar. Professional tools (Datadog service map, W&B run comparison) give agent-level views prominence. | MEDIUM | Restructure grid: make agent panel the dominant left region. Does not require backend changes; CSS grid + layout refactor only. |
| Collapsible agent tree with subtree fold | When running 6+ sub-agents, seeing all detail simultaneously is noise. Datadog's service dependency map and LangSmith's trace tree both support collapse/expand. Folding completed agents reduces visual clutter. | MEDIUM | Add `<details>` element per agent group. Track collapsed state in JS. Show "N tools" summary when collapsed. Completed agents auto-collapse after a configurable delay. No backend changes. |
| Per-agent context fill % inline in tree | No competitor shows context window fill at the agent level in the hierarchy tree. For multi-agent GSD runs, knowing that sub-agent 3 is at 87% context while others are at 20% is actionable for intervention. | MEDIUM | Show a mini progress bar or % label per agent row in the tree. |
| Tool log time filters (show last 5 min / 15 min / all) | LangSmith, Grafana, and Datadog all have time window selectors on their log views. In a long GSD run with hundreds of tool calls, users want "show me what happened in the last 5 minutes" without scrolling. | LOW | Add time filter buttons above the tool log panel. Filter in-memory from the existing `agentSections` Map — no API call needed. |

### Anti-Features (v2.0)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full tool_input forwarding in relay.py | "I want to see the complete Bash command / file contents in the log" | relay.py security constraint is load-bearing. Even safe-looking fields like `file_path` can reveal sensitive project structure. Full forwarding violates the security model established in v1.0. | Forward only pre-specified safe metadata per tool type. Never forward tool_response. |
| D3.js / vis.js agent tree visualization | "Make the tree look like a real graph with curved edges" | Adds a large library dependency and a build step for a case (multi-level nested tasks) that doesn't occur in Claude Code's 2-level parent→child hierarchy. | The indented HTML tree is the right structure. Add expand/collapse and richer row content. |
| Moving tool log to a separate page | "The tool log is getting crowded — it should be its own page" | The live tool log is the primary evidence pane. Separating it from the agent tree removes the click-to-filter interaction. | Keep log in the main panel. Improve it with time filters, enriched entries, and better session grouping. |
| Storing full tool inputs in SQLite | "Store the complete Bash command so I can search it later" | SQL full-text search on shell commands is not the right data model. Storage grows unbounded with large file contents. | Store a 120-char summary of safe metadata per tool type. |
| Alerting webhooks (Slack/Discord for stuck agents) | "Notify me on Slack when an agent is stuck for 60s" | Adds external network dependency, secret management, and conflicts with local-first architecture. | In-dashboard toast plus prominent stuck indicator. |
| Agent playback / re-run | "Replay this agent's tool sequence to reproduce a bug" | This is evaluation tooling, not observability. Different product category. | Session export (already in v1.0) gives the user raw JSONL to import into any eval tool. |

*v2.0 research preserved for historical reference. All shipped features documented in PROJECT.md.*
