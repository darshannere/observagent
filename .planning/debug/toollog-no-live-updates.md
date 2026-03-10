---
status: resolved
trigger: "toollog-no-live-updates"
created: 2026-03-08T00:00:00Z
updated: 2026-03-09T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — GET /api/events returns events ORDER BY timestamp DESC (newest-first, index 0 = newest). hydrateEvents() loads this into the store. appendEvent() appends to the END of the array (index n = newest live event). The virtualizer renders index 0 at top and index n at bottom. After hydration, live events appear at the BOTTOM of the list (after all hydrated events including the oldest). The user is watching the TOP of the list (where newest hydrated events are). The auto-scroll only triggers if distFromBottom <= 150. Since the user is at the top with 200 items below, the auto-scroll never fires. Live events silently accumulate below all hydrated events, invisible to the user. After reload, events are re-fetched DESC from DB — the live events are now the newest and appear at the TOP.
test: CONFIRMED via code reading
expecting: Fix: change GET /api/events ORDER to ASC (so hydrated array matches append order); or prepend live events instead of appending.
next_action: Apply fix — change REST API query to ascending order and wrap in subquery to still get the most recent 200 events

## Symptoms

expected: New tool call events appear in ToolLog in real time via SSE without reloading
actual: ToolLog never updates live — must reload page to see new events
errors: No SSE disconnect errors. Clean console except recharts sizing warning (unrelated). No JS errors.
reproduction: Start the app, run a Claude Code agent, watch ToolLog — events never appear. Reload → events now visible.
started: From the start / always been broken in current React version

## Eliminated

- hypothesis: ToolLog.tsx useMemo missing `events` in dependency array
  evidence: Line 40 of ToolLog.tsx: `[allEvents, activeSessionFilter, activeAgentFilter, timeFilter, tick]` — allEvents IS in deps
  timestamp: 2026-03-08T00:00:00Z

- hypothesis: appendEvent mutates array instead of replacing
  evidence: Line 210 of useObservStore.ts: `set((s) => ({ events: [...s.events, event] }))` — correctly spreads new array
  timestamp: 2026-03-08T00:00:00Z

- hypothesis: SSE not connected / useSSE not mounted
  evidence: useSSE(isReplay) is called in LiveDashboard.tsx line 22; it opens EventSource at '/events'; user confirms no disconnect errors
  timestamp: 2026-03-08T00:00:00Z

- hypothesis: Events written to different store slice than ToolLog reads
  evidence: ToolLog reads `useObservStore((s) => s.events)` (line 14), appendEvent writes to `s.events` (line 210). Same slice.
  timestamp: 2026-03-08T00:00:00Z

## Evidence

- timestamp: 2026-03-08T00:00:00Z
  checked: useSSE.ts line 175-188 — PreToolUse handling
  found: toToolEvent() returns null if msg.hook_type !== 'PreToolUse'. Then appendEvent is only called if toToolEvent returns non-null.
  implication: If SSE messages arrive as type='tool_use' or any other type, they'd be silently dropped. But the guard is on hook_type, not type.

- timestamp: 2026-03-08T00:00:00Z
  checked: toToolEvent() line 56-75 in useSSE.ts
  found: Returns null if msg.hook_type !== 'PreToolUse'. Also returns null if sessionId is missing/empty.
  implication: Events with no session_id AND no sessionId in the SSE payload would be silently dropped.

- timestamp: 2026-03-08T00:00:00Z
  checked: useSSE.ts event handler structure — all if-blocks use `return` after handling
  found: The onmessage handler checks type fields in order: connected, agent_spawn, agent_update, cost_update, health_update, then hook_type checks. All blocks return early.
  implication: A message with hook_type=PreToolUse AND type set to something recognized (e.g. agent_update) would be consumed by the earlier block and never reach the hook_type check. But this is unlikely to be the issue.

- timestamp: 2026-03-08T00:00:00Z
  checked: LiveDashboard.tsx hydration useEffect (lines 35-110)
  found: On mount, fetch('/api/events') is called and store.hydrateEvents(data) is called. hydrateEvents REPLACES entire events array (line 229: `set({ events })`).
  implication: CRITICAL — hydrateEvents runs AFTER SSE connects. If SSE appends an event first, then hydrateEvents fires and WIPES IT. But this is a timing issue, not the always-broken symptom described. However, the reverse is also true: events hydrated first, then SSE append works correctly. This doesn't explain why live events never appear.

- timestamp: 2026-03-08T00:00:00Z
  checked: ToolLog conditional rendering in LiveDashboard.tsx lines 182-193
  found: `activeTab === 'log' ? <ToolLog /> : ...` — ToolLog only mounts when 'log' tab is active. When switching tabs, ToolLog unmounts. When switching back, it remounts fresh. This doesn't affect Zustand subscriptions (Zustand is external to React tree), so this is NOT the issue.
  implication: Not the cause.

- timestamp: 2026-03-08T00:00:00Z
  checked: ToolLog.tsx line 14 — Zustand selector
  found: `const allEvents = useObservStore((s) => s.events)` — subscribes to events array. Zustand uses reference equality for re-renders. appendEvent creates new array reference, so ToolLog WILL re-render on each append.
  implication: The Zustand subscription is correct and WILL trigger re-renders when events are appended.

- timestamp: 2026-03-08T00:00:00Z
  checked: EventSource URL in useSSE.ts line 93
  found: Vite proxy IS configured for /events. Proxy is not the issue.
  implication: Eliminated.

- timestamp: 2026-03-08T00:00:00Z
  checked: GET /api/events SQL query ORDER clause in routes/api.js line 18
  found: `ORDER BY e.timestamp DESC LIMIT 200` — returns newest events FIRST (index 0 = newest).
  implication: After hydrateEvents(), events[0] = newest, events[199] = oldest. Virtualizer renders index 0 at TOP of list.

- timestamp: 2026-03-08T00:00:00Z
  checked: appendEvent in useObservStore.ts line 210
  found: `set((s) => ({ events: [...s.events, event] }))` — appends to END. So live SSE events land at index n (AFTER all hydrated events, including the 200th/oldest).
  implication: CRITICAL — Live events appear at the very bottom of a 200-item list that the user never scrolls to, because newest hydrated events are at the top.

- timestamp: 2026-03-08T00:00:00Z
  checked: ToolLog auto-scroll logic (lines 57-71)
  found: Auto-scroll to index n-1 only fires if distFromBottom <= 150px. User viewing top of list has large distFromBottom (200 items × ~28px = ~5600px below). Auto-scroll never fires.
  implication: Live events pile up silently at the bottom. After reload, they're the newest in DB so they appear at the TOP.

## Resolution

root_cause: GET /api/events returns events ORDER BY timestamp DESC (newest-first). After hydrateEvents(), the events array has [newest, ..., oldest]. appendEvent() appends live SSE events to the END of this array, placing them AFTER the oldest hydrated event (at index 200+). The virtualizer renders index 0 at top, so live events are far below the visible area. Users watching the top of the log never see live events. After reload, hydrateEvents re-fetches with the live events now the most recent, so they appear at the top.
fix: |
  1. routes/api.js — Wrapped stmtAll in a subquery: inner SELECT fetches 200 most-recent events
     (DESC), outer SELECT re-sorts them ASC. Hydrated array now matches appendEvent order
     (oldest at index 0, newest at end). Live SSE events append right after the last hydrated
     event — continuously visible at the bottom of the list.
  2. frontend/src/components/log/ToolLog.tsx — Auto-scroll now fires on initial hydration
     (wasEmpty flag) so the user lands at the live edge (bottom) on first load, not at the top
     of 200 old events. Subsequent live events auto-scroll as before (when near bottom).
  3. Rebuilt frontend bundle (public/dist/assets/index-sjA439EB.js).
verification: "User confirmed — live events now appear in ToolLog without reloading (2026-03-09)"
files_changed:
  - routes/api.js
  - frontend/src/components/log/ToolLog.tsx
  - public/dist/assets/index-sjA439EB.js
  - public/dist/index.html
