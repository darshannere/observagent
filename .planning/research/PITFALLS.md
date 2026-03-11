# Domain Pitfalls

**Domain:** Developer Experience — Adding onboarding, version checks, update mechanisms, and in-app guidance to an existing local CLI + React dashboard (ObservAgent v2.5)
**Researched:** 2026-03-11
**Confidence:** HIGH — Pitfalls derived from direct codebase inspection (bin/cli.js, lib/cmd-start.js, frontend/src/App.tsx, frontend/src/components/ui/tooltip.tsx), verified npm/npx bug tracker research, and web source cross-referencing.

---

## Critical Pitfalls

These mistakes cause broken features, poor first impressions, or rewrites.

---

### Pitfall 1: Version Check Blocks or Slows CLI Startup

**What goes wrong:**
The version check for `npx observagent start` fetches the latest version from `https://registry.npmjs.org/@darshannere/observagent` synchronously or in a way that adds perceptible latency to startup. If the registry is unreachable (offline developer, VPN, corporate proxy, or the npm outage that occurred January 29, 2026), the CLI either hangs waiting for the network call to time out or crashes with an unhandled fetch rejection, blocking the user from starting their session.

**Why it happens:**
The simplest version check implementation is `await fetch('https://registry.npmjs.org/...')` placed before `runStart()` in the start command handler. This feels natural but makes the critical startup path dependent on an external network call with unpredictable latency (typically 200–800ms on a good connection, 3000ms+ on timeout).

**Consequences:**
- Users on slow connections see 3–5 second delay before server starts
- Offline users get an error or hang instead of the app launching
- Corporate proxy users get silent failures if the proxy blocks registry access
- Trust erodes: "ObservAgent made my workflow slower"

**Prevention:**
- Use the `update-notifier` npm package, which spawns the registry check in an **unref'd child process** — it explicitly does not block the event loop or delay startup
- The check result is written to a cache file (`~/.config/configstore/<package-name>.json` by default) and read on the *next* invocation, never the current one — users always see the banner one run after the update is available, which is the correct trade-off
- Set `updateCheckInterval` to 1000 * 60 * 60 * 24 (24 hours) — checking on every run would still add network calls, even if async
- Never `await` the version check inline; it must fire-and-forget

**Detection (warning signs):**
- `time npx observagent start` shows >500ms before "ObservAgent already running" or server startup message
- Ctrl+C during startup hangs for 3+ seconds (network timeout accumulating)
- Any error output mentioning `registry.npmjs.org` before the server port line

**Phase to address:** CLI Version Check Banner phase

---

### Pitfall 2: npx Caching Serves Stale Version After `npx observagent update`

**What goes wrong:**
`npx observagent update` is meant to install the latest version. But `npx` aggressively caches packages. After running the update command, users who subsequently run `npx observagent start` may still invoke the old cached version because npx re-uses the cached binary rather than fetching the newly installed one. This is a documented, long-standing npx bug (open since 2020, unresolved as of 2026 per GitHub issue #2329 and #6179 on npm/cli).

**Why it happens:**
npx caches executables in `~/.npm/_npx/`. Once cached, it uses the cached version unless forced. The cache key is based on the package specifier, not the resolved version. Running `npm install -g @darshannere/observagent@latest` updates the global install, but subsequent `npx` invocations may still resolve to the cached npx version.

**Consequences:**
- User runs `npx observagent update`, sees success message, but `npx observagent --version` still shows old version
- User loses trust in the update command
- Version mismatch between what dashboard reports and what is actually running

**Prevention:**
- The `update` command should instruct users to run `npm install -g @darshannere/observagent@latest` rather than attempting to self-update via npx — this is the authoritative path when globally installed
- If the package is not globally installed (pure npx usage), the update command should output: `Run: npx --yes @darshannere/observagent@latest start` (the `--yes` / `-y` flag forces npx to skip the cache and re-fetch)
- Include a clear post-update verification step: `After updating, run: npx observagent --version to confirm`
- Do NOT silently run `npm install -g` as part of the update command — this modifies global state the user did not authorize and will fail without appropriate permissions

**Detection (warning signs):**
- `npx observagent --version` output doesn't change after running the update command
- Dashboard version badge shows a different version than CLI `--version` output
- Users report "update said it worked but nothing changed"

**Phase to address:** `npx observagent update` command phase

---

### Pitfall 3: Onboarding Walkthrough Re-Fires on Every Dashboard Load

**What goes wrong:**
The first-time onboarding walkthrough (step-by-step tour of the Live Dashboard) shows again on every page load because the "has completed onboarding" state is stored in React component state (lost on unmount), stored in a session-only store (Zustand without persistence), or stored in `sessionStorage` (cleared when the tab closes). Since ObservAgent is a local dev tool that users open and close frequently, the walkthrough fires every single session.

**Why it happens:**
Developers test the onboarding during development by resetting state manually, so the re-fire behavior is never noticed during development. The natural storage layer — the existing Zustand store (`useObservStore`) — has no persistence plugin configured. Writing to it feels complete but the data evaporates on every reload.

**Consequences:**
- Power users are interrupted by a tour they've already dismissed 10 times
- Users click "dismiss" reflexively and never see the actual content
- The onboarding tour becomes associated with frustration, not help

**Prevention:**
- Store the `onboardingCompleted` flag in `localStorage` keyed to the package version: `observagent_onboarding_v2.5` — this way the tour re-fires on major version upgrades but not on every reload
- Read the flag in a `useEffect` on mount before rendering the tour; default to `false` (show tour) only if the key is absent
- The version key must match `package.json` version to allow re-showing on major updates (users benefit from seeing what changed)
- Provide a persistent "Show tour again" link in the dashboard header for users who want to replay it

**Detection (warning signs):**
- Opening the dashboard in a new browser tab shows the tour (correct behavior only on first-ever use)
- Tour re-appears after refreshing the page
- `localStorage` inspection shows no `observagent_onboarding_*` key after completing the tour

**Phase to address:** First-time onboarding walkthrough phase

---

### Pitfall 4: Onboarding Tour Targets DOM Elements That May Not Exist Yet

**What goes wrong:**
The onboarding tour (using a library like React Joyride or driver.js) tries to highlight specific DOM elements — the AgentTree panel, the Insights tab button, the ToolLog container — but these elements are conditionally rendered or not yet visible when the tour starts. The tour either shows a highlight around an empty/wrong area or crashes with "target element not found," breaking the entire tour flow.

**Why it happens:**
The Live Dashboard fetches data on mount and conditionally renders panels (agents panel only renders if agents exist, Insights tab is behind a tab switcher). The tour library's step configuration uses CSS selectors (`.agent-tree`, `#insights-tab`) that are not guaranteed to be in the DOM when the tour step triggers.

**Consequences:**
- Tour steps appear in wrong positions or with no visible highlight
- Tour crashes mid-flow and leaves user stranded
- First impression of the onboarding feature is "broken"

**Prevention:**
- Add stable `data-tour="agent-tree"`, `data-tour="insights-tab"` etc. attributes to key dashboard elements — never use class or ID selectors for tour targeting (those can change during refactors)
- Delay tour start until after the initial data fetch resolves: check that the hydration fetch calls in `LiveDashboard.tsx` have completed before initializing the tour
- For steps that target conditionally-rendered elements: either always render the element (even if empty) when onboarding is active, or skip steps whose target is not in the DOM with a graceful fallback
- Test the tour specifically against the empty-state dashboard (no hooks configured, no data yet) since that is exactly the state a new user is in

**Detection (warning signs):**
- Tour step highlights an empty area of the page
- Console errors: "Target element not found" or highlight positioned at (0, 0)
- Tour works in dev environment (seeded data) but breaks for new users (empty DB)

**Phase to address:** First-time onboarding walkthrough phase

---

### Pitfall 5: Empty States Are Generic and Miss the Setup Path

**What goes wrong:**
The empty state when no agents or events exist shows a generic "No data yet" message with no actionable guidance. New users stare at a blank dashboard with no indication of why it's empty or what to do next. Since ObservAgent requires hook configuration in `~/.claude/settings.json`, users who haven't run `npx observagent init` will always see the empty state — and the empty state gives them no path forward.

**Why it happens:**
Empty states are added last as an afterthought. The developer assumes users have read the README. In practice, many users open the dashboard first (from the GitHub page or a link), see nothing, and assume the tool is broken.

**Consequences:**
- New users abandon before running a single agent session
- Support burden: users ask "why is my dashboard empty?" when the answer is "run init first"
- Dashboard feels broken, not "waiting for data"

**Prevention:**
- The empty state must distinguish two cases: (a) hooks not configured (detectable via `GET /api/config` — no hooks registered) and (b) hooks configured but no sessions yet
- Case (a): Show "Hooks not configured" with inline steps: `1. Run: npx observagent init  2. Restart Claude Code  3. Start a session` — never leave users without a CTA
- Case (b): Show "Waiting for your first session" with a brief reminder of what triggers data ("start any Claude Code session")
- The `/api/config` endpoint already exists and returns hook state — use it to detect which empty state to show
- Empty state guidance should be context-specific per panel: ToolLog empty ≠ AgentTree empty ≠ Insights empty

**Detection (warning signs):**
- New user with unconfigured hooks sees the exact same empty state as a user whose session hasn't started yet
- Empty state has no button, link, or CLI command
- Product walkthrough screenshots show a blank panel with no explanation

**Phase to address:** Empty state guidance phase

---

### Pitfall 6: Version Check Runs on Every CLI Invocation Including `--help` and `doctor`

**What goes wrong:**
The version check banner fires on every CLI command, including `npx observagent --help`, `npx observagent doctor`, and `npx observagent init`. For `--help`, users expect instant output; a 500ms pause before help text is jarring. For `doctor`, a version check failure (network error) pollutes the diagnostic output with an unrelated error, making the actual doctor output harder to read.

**Why it happens:**
The natural place to add the version check is at the top of `bin/cli.js`, before `program.parse()`. This runs it for all commands. The developer tests against `start` and doesn't notice the impact on `--help` or `doctor`.

**Consequences:**
- `--help` output feels slow, breaks the expectation of instant CLI help
- `doctor` output is polluted with version check noise, making diagnosis harder
- Version check errors on `doctor` create false positives in diagnostic output

**Prevention:**
- Scope the version check to the `start` command only — it is the long-running command where a one-time async notification fits naturally
- The `update-notifier` check-on-next-run model handles this correctly: the notification prints at the start of `observagent start`, but the network call happens in the background and is not shown until the next invocation
- Never print the version banner before `--help` output

**Detection (warning signs):**
- `time npx observagent --help` shows >300ms elapsed time
- `npx observagent doctor` output includes version-check errors at the top
- Any network error message appears before the primary command output

**Phase to address:** CLI Version Check Banner phase

---

## Moderate Pitfalls

Mistakes that degrade the feature but don't break it entirely.

---

### Pitfall 7: Tooltip z-index Collides With Dashboard Fixed Panels

**What goes wrong:**
ObservAgent's dashboard uses fixed-position panels (the sticky header, the agent detail side panel, and the modal-style AgentDetailPanel). The existing `tooltip.tsx` wraps content in a Radix `TooltipPrimitive.Portal` — which renders into `document.body` and sidesteps z-index stacking contexts. However, the chart containers inside the Insights panel and ToolLog panel may have their own stacking contexts (`transform`, `will-change`, `filter` CSS properties create new stacking contexts), causing portal-rendered tooltips to appear behind panel content.

**Why it happens:**
`portal` rendering into `document.body` generally solves z-index issues, but if the tooltip trigger is inside an element with `transform: translateZ(0)` or `will-change: transform` (common in animated chart libraries like Recharts), a new stacking context is created and the portal output may still appear behind it depending on document order.

**Prevention:**
- Test tooltips specifically inside Recharts components (the Insights panel charts already use Recharts): custom tooltip content in Recharts uses a different rendering path than Radix tooltips
- Use `z-index: 9999` on tooltip content className in `tooltip.tsx` — the current implementation uses `z-50` (Tailwind = z-index: 50) which is likely insufficient inside chart stacking contexts
- For chart-specific annotations (tooltips on data points), use Recharts' built-in `<Tooltip>` component rather than the Radix tooltip — mixing tooltip systems in the same chart causes event conflicts

**Detection (warning signs):**
- Tooltip appears behind the chart panel when triggered from a chart element
- Tooltip appears correctly for header icons but not for Insights panel elements
- Recharts built-in tooltip and a Radix tooltip appear simultaneously for the same hover target

**Phase to address:** Feature tooltips on charts and panels phase

---

### Pitfall 8: Tooltip Hover-Only Activation Breaks Keyboard Navigation

**What goes wrong:**
Feature tooltips that only activate on `mouseenter` are inaccessible to keyboard users and invisible on touch devices. The current `tooltip.tsx` delegates to Radix's `TooltipPrimitive`, which does support keyboard focus activation — but only if the trigger element is a natively focusable element (`<button>`, `<a>`) or has `tabIndex={0}`. Wrapping a non-interactive element like a `<div>` or an SVG icon in the tooltip trigger without adding `tabIndex` produces a hover-only tooltip.

**Prevention:**
- Every tooltip trigger wrapping a non-interactive element must include `tabIndex={0}` and `role="button"` (or use a `<button>` as the trigger)
- For chart annotation tooltips (e.g., a "?" icon next to a chart title), use `<button className="...">` not `<span>` or `<div>`
- The existing Radix `TooltipPrimitive` already handles `onFocus` → show and `onBlur` → hide if the trigger is focusable — this is free behavior, not extra work, but requires the trigger to be focusable

**Detection (warning signs):**
- Tab-navigating through the dashboard skips tooltip triggers
- Tooltip icon has no visible focus ring
- Screen reader announces element with no description

**Phase to address:** Feature tooltips phase

---

### Pitfall 9: Dashboard "What's New" Page Displays Stale Changelog

**What goes wrong:**
The "What's New" page hardcodes changelog content as JSX or a static string in the frontend bundle. When users install an older version of ObservAgent (e.g., v2.3 while v2.5 is current), they see the v2.3 changelog — correct. But if the page fetches changelog content from a remote URL (GitHub releases API, a CDN-hosted JSON file) to show "what's new in the latest version," and the fetch fails or returns cached data, users see changelog entries for a version they don't have installed yet, or see entries from a previous version.

**Why it happens:**
"What's New" pages often try to be clever by showing the current remote changelog rather than the installed version's changelog. This creates a version mismatch: the page says "new in v2.5" but the user is running v2.4. The opposite failure — fetching remote changelog and showing an error state — leaves the page blank with no changelog at all.

**Prevention:**
- The safest approach: bundle the changelog as a static asset in the npm package (a `CHANGELOG.json` file included in `package.json` files array), served by the local Fastify server at `/api/changelog`
- This guarantees: (a) the displayed changelog always matches the installed version, (b) works fully offline, (c) no remote dependency
- The version badge can still compare `current_installed_version` (from `/api/config`) with `latest_npm_version` (from the background version check cache) without the changelog page needing to be dynamic
- If showing a remote "latest changes" section is desired, gate it behind a "requires network" warning and show the local changelog as the primary content

**Detection (warning signs):**
- "What's New" page shows changelog entries for a version higher than `npx observagent --version` output
- Page is blank when the user is offline
- Changelog shows v2.4 content when the user is running v2.5

**Phase to address:** Dashboard "What's New" page phase

---

### Pitfall 10: Onboarding Walkthrough Skipped-State Ambiguity

**What goes wrong:**
Users click "skip" or press Escape to dismiss the tour early. The skip is stored as `completed: true` in localStorage, identical to finishing the full tour. When a future version wants to show "here's what's new" only to users who completed the original tour (to avoid re-triggering for skippers), there is no way to distinguish "skipped at step 2 of 6" from "completed all steps."

**Why it happens:**
Storing a boolean `completed` flag is the simplest implementation. The distinction between "dismissed" and "completed" is not obvious until you need it.

**Prevention:**
- Store three states: `{ status: 'not_started' | 'skipped' | 'completed', version: '2.5' }`
- "Skip" sets `status: 'skipped'`; finishing all steps sets `status: 'completed'`
- Version upgrades can target only `status: 'completed'` users for delta tours ("here's what changed in v2.6")
- The localStorage key schema: `observagent_onboarding` = JSON object with `status` and `version` fields

**Detection (warning signs):**
- After skipping the tour, there is no "Show tour again" path because the dismissed flag looks identical to completed
- New version tours re-show for users who never wanted them (because skippers look like completers)

**Phase to address:** First-time onboarding walkthrough phase

---

### Pitfall 11: Init Output Guidance Is Immediately Scrolled Off Screen

**What goes wrong:**
The improved `npx observagent init` output provides detailed post-install steps (restart Claude Code, start a session, etc.), but the guidance is printed at the end of the `init` output after potentially many lines of hook configuration status. On small terminals or terminals with limited scrollback, users miss the guidance entirely because they only see the last few lines.

**Why it happens:**
The natural structure is: "do things, then summarize." The summary at the bottom gets buried if the earlier output is verbose. Users close the terminal after the first "success" indication and never scroll up to see the guidance.

**Prevention:**
- Print the "next steps" guidance with a clear visual separator (`\n─────────────────\n`) immediately after the success indicator
- Consider printing it as the *first* block of output (before the detailed hook configuration log), not last — "here's what will happen, then here's what we did"
- The most important single line ("Restart Claude Code to activate hooks") must appear in the last 5 lines of output, guaranteed, even if the rest of the log is verbose
- Use chalk coloring to make the next-steps block visually distinct from the diagnostic output

**Detection (warning signs):**
- The post-init guidance is more than 15 terminal lines away from the final output line
- User needs to scroll up after `init` completes to find the "what to do next" instructions
- Users ask "how do I activate the hooks" after running init (they missed the guidance)

**Phase to address:** Improved `npx observagent init` output phase

---

## Minor Pitfalls

---

### Pitfall 12: Version Badge in Dashboard Shows "unknown" During First Load

**What goes wrong:**
The dashboard version badge fetches current version from `/api/config` on mount. There is a brief window (typically 200–500ms) while the fetch is in flight where the badge shows "unknown", "...", or `undefined`. If the fetch fails (server not ready), the badge is permanently stuck showing "unknown" with no retry.

**Prevention:**
- Default the badge to the version string embedded at build time (Vite exposes `import.meta.env.VITE_APP_VERSION` — set this at build time from `package.json`)
- The `/api/config` response is the authoritative source; use it to update the badge, but the build-time default prevents the flash
- Add a one-time retry on fetch failure (500ms delay); if it fails twice, show the build-time version with a tooltip "Could not verify server version"

**Phase to address:** Dashboard version badge phase

---

### Pitfall 13: `doctor` Command Overhaul Outputs False Positive When Port Is In Use by Another Process

**What goes wrong:**
The overhauled `doctor` command checks if the ObservAgent server is running by probing port 4999 (same logic as `cmd-start.js`). If a different process occupies port 4999, `doctor` reports "server running" when ObservAgent is not actually running. The user gets a false "all green" result.

**Prevention:**
- Port probe should be followed by an HTTP health check: `GET http://localhost:4999/api/config` — only a valid JSON response from ObservAgent's own endpoint confirms it is the actual running server
- `doctor` must not conflate "port in use" with "ObservAgent is running"
- The HTTP health check path is already used in the existing `cmd-start.js` indirectly; make it an explicit exported utility function

**Phase to address:** `doctor` command overhaul phase

---

### Pitfall 14: Tooltip Content for Charts Conflicts with Recharts' Built-In Tooltip

**What goes wrong:**
Adding Radix-based feature tooltips (the "?" explanation popovers) to chart titles or chart container headers while the Recharts `<Tooltip>` component is active inside the same chart creates two tooltip systems competing for the same mouse events. Hovering over a chart data point activates Recharts' built-in tooltip; hovering slightly outside but still within the chart container activates the Radix tooltip. The result is both tooltips visible simultaneously or one suppressing the other unpredictably.

**Prevention:**
- Feature explanation tooltips must be placed on elements **outside** the Recharts `<ResponsiveContainer>` — on the chart title `<h3>`, a `<button>` next to the title, or in the panel header row
- Never place a Radix tooltip trigger inside a Recharts chart component
- The Insights panel's current structure (title row above the `<ResponsiveContainer>`) already provides the correct placement zone

**Phase to address:** Feature tooltips on charts and panels phase

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| CLI version check banner | Blocking startup on network call | Use `update-notifier` fire-and-forget child process; never `await` version fetch |
| CLI version check banner | Banner fires on `--help` and `doctor` | Scope to `start` command only |
| `npx observagent update` command | npx cache serves old version after update | Instruct `npm install -g` or `npx --yes` with `@latest` tag; include verification step |
| `npx observagent init` output | Next-steps guidance scrolls off screen | Print critical next step in last 5 lines; use visual separator |
| `doctor` command overhaul | Port probe false positive for non-ObservAgent process on 4999 | Follow port probe with HTTP health check to `/api/config` |
| Empty state guidance | Generic "no data" message with no CTA | Distinguish hooks-not-configured vs. hooks-configured-but-no-sessions; use `/api/config` hook state |
| First-time onboarding walkthrough | Re-fires on every page load | Persist `{ status, version }` in `localStorage`; never in Zustand-only state |
| First-time onboarding walkthrough | Tour targets missing DOM elements | Add stable `data-tour="..."` attributes; delay tour start until hydration completes |
| First-time onboarding walkthrough | Skip vs. complete ambiguity | Store three-state `{ status: not_started/skipped/completed }` |
| Feature tooltips on charts | Tooltip behind chart stacking context | Use `z-[9999]` not `z-50`; place triggers outside Recharts container |
| Feature tooltips on charts | Hover-only, inaccessible to keyboard | Ensure all tooltip triggers are focusable elements or have `tabIndex={0}` |
| Feature tooltips on charts | Radix + Recharts tooltip conflict | Never place Radix trigger inside `<ResponsiveContainer>`; use chart title row |
| Dashboard version badge | Flash of "unknown" on first load | Embed build-time version via `VITE_APP_VERSION`; use as default before API responds |
| Dashboard "What's New" page | Stale or mismatched changelog | Bundle changelog as static asset served by local Fastify; never fetch remote changelog as primary source |

---

## Integration Gotchas

Common mistakes when wiring the v2.5 DX features into the existing ObservAgent codebase.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Version check + `cmd-start.js` | Adding `await fetch(registry)` before `runStart()` | Use `update-notifier` package — checks in child process, prints cached result from *previous* run |
| Onboarding + Zustand store (`useObservStore`) | Storing `onboardingCompleted` in Zustand without persistence | Use `localStorage` directly; Zustand store is in-memory only and resets on page load |
| Onboarding + LiveDashboard hydration | Starting tour before `fetch('/api/events')` and `fetch('/api/agents')` resolve | Gate tour start on hydration completion; use a `hydrated` boolean state flag |
| Tooltip + Recharts | Placing Radix `<TooltipTrigger>` inside `<AreaChart>` or `<BarChart>` | Place triggers in the chart header row, above the `<ResponsiveContainer>` |
| Tooltip + Tailwind z-index | Using `z-50` (Tailwind default) for tooltip content | Use `z-[9999]` for tooltip content to clear dashboard stacking contexts |
| Empty state + `/api/config` | Generic "no data" message regardless of hook status | Fetch `/api/config` and branch: hooks absent → show init instructions; hooks present → show "waiting for session" |
| Version badge + Vite build | Hardcoding version string in React component | Read from `import.meta.env.VITE_APP_VERSION` (set via `define` in `vite.config.ts`) |
| `update` command + npx cache | Running `npm install -g` silently as part of update | Print explicit instructions; do not silently mutate global npm state |
| `doctor` + port check | Treating port occupied = server running | Follow TCP port check with HTTP `GET /api/config` response validation |
| Init output + terminal scrollback | Verbose hook config log buries next-steps guidance | Print next-steps guidance in the last 5 lines; use `chalk` visual separator |

---

## Security Mistakes Specific to v2.5

| Mistake | Risk | Prevention |
|---------|------|------------|
| Fetching latest version from npm registry on every CLI invocation | Leaks user's IP address and tool usage frequency to npm/CDN logs on every command | Use `update-notifier`'s 24-hour cache; one network call per day maximum |
| Changelog page fetching from a remote URL | Establishes unexpected network call from local tool; could leak installed version info in User-Agent headers | Bundle changelog as local static file; only make remote calls for the already-accepted version-check notification |
| `npx observagent update` downloading and executing arbitrary npm packages | Standard supply chain risk amplified by the "update" framing | Instruct to use `npm install -g @darshannere/observagent@latest` directly so the user sees exactly what is being installed; no silent install |

---

## Sources

- **Direct codebase inspection — bin/cli.js** (HIGH confidence): Commander setup; all commands defined; no current version check or update command
- **Direct codebase inspection — lib/cmd-start.js** (HIGH confidence): Port probe logic confirmed; startup flow is synchronous before server launch; network call here would block
- **Direct codebase inspection — frontend/src/App.tsx** (HIGH confidence): Two routes (`/live`, `/history`); no onboarding route or version badge component exists yet; confirms v2.5 features are net-new
- **Direct codebase inspection — frontend/src/components/ui/tooltip.tsx** (HIGH confidence): Radix `TooltipPrimitive.Portal` confirmed; `z-50` class on content; `sideOffset=0` default — confirmed z-index risk with chart stacking contexts
- **Direct codebase inspection — frontend/src/pages/LiveDashboard.tsx** (HIGH confidence): Async fetch hydration pattern confirmed; tour must gate on hydration; no `data-tour` attributes present yet
- **npm/cli GitHub issues — npx caching** (HIGH confidence — multiple open issues): Issue #2329, #6179, #6804, #7838 confirm npx cache-serving-stale-version is a persistent unresolved problem; `--yes` flag workaround confirmed
- **update-notifier npm package** (HIGH confidence): Unref'd child process model confirmed; 24-hour interval default; cache-on-next-run model confirmed — correct pattern for non-blocking version checks
- **npm rate limiting** (MEDIUM confidence — official npm blog): HTTP 429 documented; anonymous requests rate-limited at lower threshold; relevant for users on shared CI/NAT IPs
- **Radix UI tooltip accessibility docs** (HIGH confidence via web): `onFocus` activation requires focusable trigger; portal rendering confirmed to sidestep most z-index stacking contexts but not all (transform/will-change boundaries)
- **Recharts + Radix tooltip conflict** (MEDIUM confidence — community pattern): Known interaction issue; prevention is placement outside `ResponsiveContainer`, not z-index
- **onboardjs.com comparison 2026, userguiding.com** (MEDIUM confidence): localStorage persistence as standard for first-time user detection; version-keyed storage pattern is community best practice
- **npm outage January 29, 2026** (HIGH confidence — getautonoma.com status): Real outage documented; confirms version checks must be resilient to registry unavailability

---

*Pitfalls research for: ObservAgent v2.5 Developer Experience — adding version checks, update command, onboarding walkthrough, empty states, feature tooltips, and changelog display to existing local CLI + React dashboard*
*Researched: 2026-03-11*
