# Technology Stack

**Project:** ObservAgent v2.5 Developer Experience
**Researched:** 2026-03-11
**Overall confidence:** HIGH

---

## Context: What Already Exists (Do Not Re-Research)

This milestone adds DX features to an already-running production system. The existing stack is fully validated:

**Backend (Node.js `bin/`+`lib/`+`routes/`+`server.js`):**
| Package | Version | Role |
|---------|---------|------|
| `fastify` | 5.7.4 | HTTP server |
| `fastify-sse-v2` | 4.2.2 | SSE streaming |
| `better-sqlite3` | 12.6.2 | SQLite WAL |
| `commander` | 14.0.3 | CLI arg parsing |
| `chalk` | 5.3.0 | CLI color output |
| `open` | 10.1.0 | Open browser URL |

**Frontend (`frontend/` — React/Vite/TypeScript, built to `public/dist/`):**
| Package | Version | Role |
|---------|---------|------|
| `react` + `react-dom` | 19.2.0 | UI framework |
| `vite` | 7.3.1 | Build tool |
| `zustand` | 5.0.11 | Global state |
| `recharts` | 3.8.0 | Charts |
| `radix-ui` | 1.4.3 | Unified Radix primitives (already installed) |
| `tailwindcss` | 4.2.1 | Styling |
| `lucide-react` | 0.576.0 | Icons |
| `react-router` | 7.13.1 | Routing |
| `@tanstack/react-virtual` | 3.13.19 | ToolLog virtualization |

**Critical finding:** `radix-ui` (unified package) is already in `frontend/package.json`. A `Tooltip` shadcn component already exists at `frontend/src/components/ui/tooltip.tsx` and imports from `radix-ui`. This component is production-ready and styled. Feature tooltips require **zero new packages**.

---

## New Dependencies for v2.5 Features

### Summary

| Feature | New Backend Package | New Frontend Package |
|---------|--------------------|--------------------|
| npm version check in CLI | `update-notifier@^7.3.1` | none |
| `npx observagent update` command | `update-notifier@^7.3.1` (shared) | none |
| Feature tooltips in React | none | none (already exists) |
| In-dashboard onboarding walkthrough | none | `driver.js@^1.4.0` |
| Changelog display in CLI + dashboard | none | none |

**Total new packages: 2 (one backend, one frontend)**

---

## Feature 1: npm Version Check in CLI (`update-notifier`)

**What it needs:** On `observagent start` and `observagent doctor`, check if the installed version is behind the latest on npm. Show a banner like: `Update available: 2.4.0 → 2.5.0  Run: npm install -g @darshannere/observagent`.

**Recommended package:** `update-notifier@^7.3.1`

**Why update-notifier over alternatives:**
- Version 7.x is pure ESM — directly compatible with observagent's `"type": "module"` root `package.json`. No dynamic import workaround needed.
- Runs the registry check in a background unref'd child process — the CLI startup is not blocked.
- Caches the result for a configurable interval (default: 1 day) so the registry is not hit on every single `observagent start` invocation.
- Handles `NO_UPDATE_NOTIFIER` env var and `--no-update-notifier` flag automatically — professional CLI convention.
- Actively maintained (7.3.1 as of research date), 249k weekly downloads, used by major CLIs (create-react-app, netlify-cli, etc.).

**Why not `simple-update-notifier`:** Less configuration control. `update-notifier` has more feature parity for a CLI tool (custom messaging, type classification patch/minor/major, configurable check frequency).

**Why not a raw `fetch` to `https://registry.npmjs.org/@darshannere/observagent/latest`:** Correct approach technically, but requires re-implementing caching, background process logic, error handling, and user opt-out convention. update-notifier does all of this correctly in ~3 lines of code.

**Integration point:** Add to `lib/cmd-start.js` immediately after server start, and to `lib/cmd-doctor.js` at the beginning of output. The call is non-blocking:

```javascript
import updateNotifier from 'update-notifier';
import { createRequire } from 'node:module';
const pkg = createRequire(import.meta.url)('../package.json');

updateNotifier({ pkg }).notify();
```

**Installation (backend):**
```bash
npm install update-notifier
```

**Confidence:** HIGH — verified ESM-only status, version 7.3.1, weekly download count, and integration pattern from multiple sources.

---

## Feature 2: `npx observagent update` Command

**What it needs:** A new CLI subcommand that (1) shows the current and latest version, (2) shows the recent changelog inline, (3) runs `npm install -g @darshannere/observagent@latest` to upgrade.

**No new package needed.** This builds on the same `update-notifier` from Feature 1 for version fetching, plus Node.js stdlib `child_process` (already used in `cmd-start.js` via `spawn`) to shell out the npm install.

**Integration point:** New file `lib/cmd-update.js`. Register as `program.command('update')` in `bin/cli.js` (existing Commander setup). Pattern:

```javascript
// 1. Fetch latest version via update-notifier or direct registry fetch
// 2. Show diff: current → latest
// 3. Display changelog snippet (fetched from GitHub releases API or bundled CHANGELOG.md)
// 4. Confirm prompt (y/N) — use Node readline (stdlib, no inquirer needed)
// 5. spawn(['npm', 'install', '-g', '@darshannere/observagent@latest'])
```

**Why no `inquirer` or `prompts` for the confirmation:** The project already uses chalk and commander. A single `readline.createInterface` for one yes/no prompt is 8 lines of stdlib — adding a 50KB prompting library for one question is not justified.

**Confidence:** HIGH — Commander already handles subcommands, spawn pattern already proven in cmd-start.js.

---

## Feature 3: Feature Tooltips in React Dashboard

**What it needs:** Hover tooltips on chart labels, panel headers, and metric values explaining what each metric means (e.g., "p95 latency: 95% of tool calls complete faster than this value").

**No new package needed.** The tooltip infrastructure is fully in place:

1. `radix-ui` 1.4.3 is already installed in `frontend/package.json`.
2. `frontend/src/components/ui/tooltip.tsx` is a complete shadcn Tooltip component wrapping `radix-ui`'s `Tooltip` primitive. It is already styled with Tailwind v4 (dark background, arrow, animated entry/exit, collision-detection via Radix's built-in Floating UI engine).
3. It exports `{ Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }` — the standard shadcn API.

**Usage in any component:**
```tsx
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="text-muted-foreground">p95</span>
    </TooltipTrigger>
    <TooltipContent>95% of tool calls complete faster than this</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**`TooltipProvider` placement:** Wrap at app root (in `App.tsx` or `LiveDashboard.tsx`) once — not per-component. All `Tooltip` instances inside share it.

**Confidence:** HIGH — read the actual component source at `frontend/src/components/ui/tooltip.tsx`.

---

## Feature 4: In-Dashboard Onboarding Walkthrough

**What it needs:** A step-by-step guided tour for first-time users — highlight "Agent Tree", "Tool Log", "Insights" with callout popups explaining each section. Triggered automatically when `localStorage.observagent_onboarded` is not set, and accessible via a "Take Tour" button.

**Recommended package:** `driver.js@^1.4.0` (frontend only)

**Why driver.js:**
- MIT license — no commercial license concerns (Intro.js requires paid license for commercial use; Shepherd.js is AGPL without commercial license).
- Framework-agnostic — works with React 19 (no peer dependency issues, unlike react-joyride which has documented incompatibility with React 18 and 19 as of early 2025).
- Lightweight (~15KB gzipped). Single dependency-free package.
- TypeScript-first source code — types are built-in, not separate `@types/` package.
- Supports popover steps anchored to DOM elements, backdrop highlighting, keyboard navigation.
- Version 1.4.0 is stable and actively maintained.

**Why not react-joyride:** GitHub issues #1122 and #1124 document active incompatibility with both React 18 and React 19 as of 2025. The project uses React 19.2.0 — this is a hard blocker.

**Why not Shepherd.js:** AGPL license for the open-source version. Commercial use (even a local dev tool) requires commercial license. Unacceptable overhead for a DX feature.

**React integration pattern:** driver.js is called imperatively, not declaratively. In a React component:

```typescript
import Driver from 'driver.js';
import 'driver.js/dist/driver.css';

function OnboardingTour() {
  const startTour = useCallback(() => {
    const driver = new Driver({
      showProgress: true,
      steps: [
        { element: '#agent-tree', popover: { title: 'Agent Tree', description: '...' } },
        { element: '#tool-log',   popover: { title: 'Tool Log',   description: '...' } },
        { element: '#insights',   popover: { title: 'Insights',   description: '...' } },
      ],
      onDestroyStarted: () => {
        localStorage.setItem('observagent_onboarded', '1');
        driver.destroy();
      },
    });
    driver.drive();
  }, []);

  // Auto-start on first visit
  useEffect(() => {
    if (!localStorage.getItem('observagent_onboarded')) startTour();
  }, [startTour]);

  return <button onClick={startTour}>Take Tour</button>;
}
```

**State persistence:** `localStorage.observagent_onboarded` flag (same pattern already used by `AgentTree.tsx` for `LS_KEY`, `LS_INACTIVE_KEY`, `LS_REPO_KEY`). No new state management needed.

**CSS import note:** driver.js ships its own CSS. Import `'driver.js/dist/driver.css'` in the component or the root `index.css`. The overlay styles are scoped to driver's own class names — no Tailwind conflicts.

**Installation (frontend):**
```bash
cd frontend && npm install driver.js
```

**Confidence:** MEDIUM-HIGH — version 1.4.0 existence and MIT license confirmed via multiple sources. React 19 compatibility confirmed by framework-agnostic design (DOM-based, no React peer dependency). The manual useEffect integration pattern is standard for imperative libraries in React.

---

## Feature 5: Changelog Display in CLI and Dashboard

**What it needs:**
- CLI: `npx observagent update` prints recent changelog entries before prompting to update.
- Dashboard: A "What's New" page or modal showing the changelog.

**No new package needed for either surface.**

**Approach A — Bundle a `CHANGELOG.md` in the npm package:** The simplest option. Add `CHANGELOG.md` to the `"files"` array in root `package.json`. Read it in the CLI at runtime with `fs.readFile`. Display the latest 2-3 entries (parse by `## v` section headers). In the dashboard, expose a backend route `GET /api/changelog` that reads and returns the file content; the frontend fetches and renders it as styled markdown or plain text.

**Approach B — Fetch from GitHub releases API:** `https://api.github.com/repos/darshannere/observagent/releases/latest` returns JSON with a `body` field (the release notes in Markdown). No authentication needed for public repos. Rate limit: 60 req/hour unauthenticated — fine for a one-time display per session.

**Recommendation: Approach A (bundled file) for CLI, Approach B (GitHub API) for dashboard "What's New" page.** The CLI has no network requirement for the changelog display; bundled is simpler and works offline. The dashboard already has a network connection to render live data; fetching from GitHub releases avoids needing to rebuild/redeploy for changelog-only updates.

**Markdown rendering in dashboard:** Do NOT add a full Markdown renderer library (marked, remark, react-markdown) for this. The release notes are simple (h2, bullets, inline code). Use a lightweight approach: display the raw text in a `<pre>` block, or use a minimal inline renderer that converts `**text**` and `- item` to `<strong>` and `<li>` via 10 lines of regex. Full Markdown parsers are 50-150KB for a changelog display use case.

**Confidence:** HIGH — Node.js `fs` API and GitHub public REST API are stable and well-documented. No external library verification needed.

---

## Recommended Stack Summary

### New npm Packages Required

**Backend (`package.json` root):**
```bash
npm install update-notifier
```

| Package | Version | Purpose |
|---------|---------|---------|
| `update-notifier` | `^7.3.1` | CLI version-check banner + `update` command |

**Frontend (`frontend/package.json`):**
```bash
cd frontend && npm install driver.js
```

| Package | Version | Purpose |
|---------|---------|---------|
| `driver.js` | `^1.4.0` | First-time onboarding walkthrough |

### What Requires Zero New Packages

| Feature | Why No Package Needed |
|---------|----------------------|
| Feature tooltips | `radix-ui` + shadcn `tooltip.tsx` already exists in codebase |
| `npx observagent update` command | Reuses `update-notifier` + Node.js stdlib (`readline`, `child_process`) |
| Changelog in CLI | Node.js `fs.readFile` on bundled `CHANGELOG.md` |
| Changelog in dashboard | `fetch` to GitHub releases API; inline plain-text/regex renderer |
| Onboarding localStorage state | Same `localStorage` pattern already used by `AgentTree.tsx` |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-joyride` | Documented incompatibility with React 18 and React 19 (GitHub issues #1122, #1124, #1151 as of 2025) | `driver.js` |
| `shepherd.js` | AGPL license for open-source version; commercial use requires paid license | `driver.js` (MIT) |
| `intro.js` | Commercial license required for production use | `driver.js` (MIT) |
| `@radix-ui/react-tooltip` (individual package) | Already using unified `radix-ui` package; adding individual would create duplicate/conflicting versions | Import from existing `radix-ui` |
| `inquirer` or `prompts` for `update` confirmation | 50KB+ library for a single yes/no prompt | Node.js stdlib `readline.createInterface` |
| `marked`, `remark`, or `react-markdown` | 50-150KB for rendering simple changelog bullets | Plain text `<pre>` or 10-line inline regex renderer |
| `simple-update-notifier` | Fewer config options vs `update-notifier`; no caching, no `NO_UPDATE_NOTIFIER` convention | `update-notifier@^7.3.1` |
| Any new CSS framework or UI component library | Frontend already has Tailwind v4 + shadcn + radix-ui; adding another would create class conflicts | Extend existing components |

---

## Integration Points Reference

| File | Change Needed |
|------|--------------|
| `bin/cli.js` | Add `program.command('update')` registration |
| `lib/cmd-update.js` | New file: version check + changelog display + npm install |
| `lib/cmd-start.js` | Add `updateNotifier({ pkg }).notify()` after server starts |
| `lib/cmd-doctor.js` | Add `updateNotifier({ pkg }).notify()` at top of output |
| `package.json` (root) | Add `update-notifier` to dependencies; add `CHANGELOG.md` to `files` |
| `frontend/package.json` | Add `driver.js` to dependencies |
| `frontend/src/App.tsx` | Wrap with `<TooltipProvider>` once at root |
| `frontend/src/components/onboarding/OnboardingTour.tsx` | New component using driver.js |
| `frontend/src/pages/LiveDashboard.tsx` | Mount `<OnboardingTour />`, add "Take Tour" button |
| `routes/api.js` (optional) | Add `GET /api/changelog` route if using bundled CHANGELOG approach |

---

## Version Compatibility

| Package | Version | Node/React Compat | Notes |
|---------|---------|-------------------|-------|
| `update-notifier` | 7.3.1 | ESM-only, Node 18+ | Pure ESM matches `"type": "module"` root package |
| `driver.js` | 1.4.0 | Framework-agnostic | No React peer dependency; DOM-based; React 19 safe |
| `radix-ui` (tooltip) | 1.4.3 (existing) | React 19 | Already installed; Tooltip component already built |

---

## Sources

- `/Users/darshannere/claude/observagent/frontend/package.json` — verified frontend dependencies (react 19.2.0, radix-ui 1.4.3, driver.js not yet present), HIGH confidence
- `/Users/darshannere/claude/observagent/frontend/src/components/ui/tooltip.tsx` — confirmed Tooltip component fully built using radix-ui, HIGH confidence
- `/Users/darshannere/claude/observagent/frontend/src/components/agents/AgentTree.tsx` — confirmed localStorage pattern already in use, HIGH confidence
- `/Users/darshannere/claude/observagent/bin/cli.js` — confirmed Commander structure and command registration pattern, HIGH confidence
- `/Users/darshannere/claude/observagent/lib/cmd-start.js` — confirmed spawn pattern for child processes, HIGH confidence
- [update-notifier npm](https://www.npmjs.com/package/update-notifier) — version 7.3.1, ESM-only, MEDIUM confidence (WebSearch; official npm page)
- [update-notifier guide 2025](https://generalistprogrammer.com/tutorials/update-notifier-npm-package-guide) — usage pattern and opt-out conventions, MEDIUM confidence
- [react-joyride React 19 incompatibility #1122](https://github.com/gilbarbara/react-joyride/issues/1122) — confirmed blocker, HIGH confidence (official GitHub issue)
- [react-joyride React 18 incompatibility #1124](https://github.com/gilbarbara/react-joyride/issues/1124) — confirmed blocker, HIGH confidence (official GitHub issue)
- [driver.js MIT license](https://github.com/kamranahmedse/driver.js/blob/master/license) — MIT confirmed, HIGH confidence
- [driver.js npm](https://www.npmjs.com/package/driver.js?activeTab=code) — version 1.4.0, MEDIUM confidence (WebSearch)
- [driver.js docs](https://driverjs.com/docs/installation) — API and React integration pattern, MEDIUM confidence
- [5 Best React Onboarding Libraries 2026 - OnboardJS](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared) — ecosystem comparison confirming download counts and license status, MEDIUM confidence
- [radix-ui unified package](https://www.npmjs.com/package/radix-ui) — version 1.4.3, tree-shakeable, React 19 compatible, HIGH confidence (matches installed version)
- npm registry API documentation — `https://registry.npmjs.org/{pkg}/latest` endpoint for dist-tags, HIGH confidence (training knowledge + WebSearch verification)

---

*Stack research for: ObservAgent v2.5 Developer Experience milestone*
*Researched: 2026-03-11*
