---
phase: 14-health-and-latency-charts
verified: 2026-03-10T10:00:00Z
status: human_needed
score: 9/9 must-haves verified
re_verification: false
human_verification:
  - test: "Open Health tab in browser and confirm all three widgets render"
    expected: "Stalled Agents section shows green 'All agents healthy' card (or agent cards if any are stalled). Error Rate section shows a skeleton (loading) or chart or 'No active session yet.' message. Latency by Tool section shows same states."
    why_human: "Visual rendering and correct conditional display of all three widgets cannot be confirmed programmatically."
  - test: "Switch to Cost tab then back to Health tab after 30 seconds"
    expected: "Tab badge 'Health (N)' reflects a live count without requiring the Health tab to be active. Network tab shows new /api/insights/stalled-agents requests firing on 30s interval regardless of active tab."
    why_human: "Cross-tab badge liveness requires runtime observation of network requests."
  - test: "Verify spike dots on Error Rate chart"
    expected: "When error_rate > 0 for a bucket, a filled red circle appears on the area chart line at that point. Buckets with error_rate === 0 show no dot."
    why_human: "SVG rendering of conditional dot prop requires visual browser verification."
---

# Phase 14: Health and Latency Charts Verification Report

**Phase Goal:** Users can assess agent health, identify error spikes, understand tool latency profiles, and spot stalled agents — all from the Insights panel
**Verified:** 2026-03-10T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Health tab no longer shows 'coming in next release' stub | VERIFIED | No match for "coming in next release" or "Placeholder for error rate" in InsightsPanel.tsx |
| 2 | Stalled agents list renders with one card per stalled agent showing name, idle duration, and start time | VERIFIED | Lines 545–565: stalledAgents.map renders displayName, idleLabel (Xm Ys), startTime per agent |
| 3 | When no agents are stalled, Health tab shows 'All agents healthy' with green tint | VERIFIED | Lines 539–542: green-950/30 background + green-400 text "All agents healthy" |
| 4 | Tab label reads 'Health (N)' when N > 0 stalled agents, plain 'Health' when none | VERIFIED | Line 214: conditional template literal `Health (${stalledCount})` |
| 5 | Badge count updates on all tabs (not just when Health tab is visible) | VERIFIED | Lines 109–123: empty-deps useEffect (`[]`) fires always-on 30s poll |
| 6 | User can see an error rate timeline chart (Y-axis as error % 0–100) | VERIFIED | Lines 606–639: AreaChart with `tickFormatter v => v.toFixed(1)%` and `domain=[0,'auto']` |
| 7 | Spike buckets (error_rate > 0) show a red dot on the area chart line | VERIFIED | Lines 630–634: inline dot prop returns `<circle fill="#ef4444">` when error_rate > 0, explicit null otherwise |
| 8 | User can see a per-tool-type latency chart with p50 (green) and p95 (yellow) grouped bars | VERIFIED | Lines 675–693: BarChart with `Bar dataKey="p50_ms" fill="#4ade80"` and `Bar dataKey="p95_ms" fill="#facc15"` |
| 9 | Both error-rate and latency-by-tool charts poll every 30s while Health tab is visible, stop otherwise | VERIFIED | Lines 126–157: `useEffect` gated on `activeTab !== 'Health' \|\| !latestSessionId`, shared 30s interval, clearInterval on cleanup |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/components/insights/InsightsPanel.tsx` | Health tab widgets: stalled agents + error rate chart + latency chart | VERIFIED | 703 lines; contains StalledAgent interface, all state vars, both useEffects, and all three widget render blocks |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| InsightsPanel.tsx | `/api/insights/stalled-agents` | empty-deps useEffect | WIRED | Line 112: `fetch('/api/insights/stalled-agents')` inside effect at line 109 with `[]` dep array (line 123) |
| `stalledAgents.length` | tab label badge | `stalledCount` derived from array length when `stalledStatus === 'ok'` | WIRED | Line 99: `stalledCount = stalledStatus === 'ok' ? stalledAgents.length : 0`; line 214 renders badge |
| InsightsPanel.tsx | `/api/insights/error-rate` | tab-gated useEffect with `[activeTab, latestSessionId]` deps | WIRED | Line 133: `fetch('/api/insights/error-rate?session_id=...')` inside effect at line 126–157 |
| InsightsPanel.tsx | `/api/insights/latency-by-tool` | same tab-gated useEffect | WIRED | Line 145: `fetch('/api/insights/latency-by-tool?session_id=...')` in same effect |
| raw API response `{errors, total}` | chart dataKey `error_rate` | inline transform `errors/total*100` | WIRED | Lines 136–139: `error_rate: d.total > 0 ? (d.errors / d.total) * 100 : 0` |
| spikeDot function | dot prop on Area element | inline function on dot prop | WIRED | Lines 630–634: dot prop is an inline function returning `<circle>` or `null` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| INSG-05 | 14-02-PLAN.md | User can see error rate timeline with visual spike highlighting | SATISFIED | AreaChart at lines 606–639 with conditional red dot at error_rate > 0 |
| INSG-06 | 14-02-PLAN.md | User can see per-tool-type latency chart (p50/p95 bars) | SATISFIED | BarChart at lines 673–697 with p50 green and p95 yellow bars |
| INSG-07 | 14-01-PLAN.md | User can identify stalled agents directly from the Insights panel | SATISFIED | Stalled agents widget at lines 516–568 + always-on badge poll (line 109, empty deps) |

No orphaned requirements found. REQUIREMENTS.md marks INSG-05, INSG-06, INSG-07 as assigned to Phase 12 + Phase 14 with status Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stub text, placeholder comments, TODO/FIXME annotations, or empty return implementations found in InsightsPanel.tsx.

The chunk size warning from Vite (`703.81 kB > 500 kB`) is pre-existing (recharts is large) and is not a blocker for this phase's goal.

### Human Verification Required

#### 1. All Three Health Tab Widgets Render

**Test:** Open the app in a browser, navigate to the Insights panel, click the Health tab.
**Expected:** Three distinct sections display in order: "Stalled Agents" (green card or agent cards), "Error Rate" (chart or empty/loading state), "Latency by Tool" (chart or empty/loading state). No stub text visible.
**Why human:** Visual rendering of conditional JSX branches cannot be confirmed by static analysis.

#### 2. Cross-Tab Badge Liveness

**Test:** Switch to the Cost or Activity tab. Wait 30 seconds. Observe the Health tab label (and the browser Network panel).
**Expected:** The Health tab label shows "Health" or "Health (N)" — the count updates even while the Cost/Activity tab is active. New `/api/insights/stalled-agents` requests fire every ~30 seconds regardless of which tab is shown.
**Why human:** The always-on poll is structurally correct (empty-deps useEffect confirmed), but runtime badge update behavior requires browser observation.

#### 3. Spike Dots on Error Rate Chart

**Test:** With an active session that has had some tool errors, navigate to Health > Error Rate.
**Expected:** Buckets where errors occurred show a filled red circle on the area chart line. Buckets with zero errors show no dot.
**Why human:** The `dot` prop function returns correct JSX (confirmed), but recharts SVG rendering requires visual verification to confirm circles appear at the right data points.

### Gaps Summary

No gaps. All nine must-have truths are verified against the actual codebase. All three requirements (INSG-05, INSG-06, INSG-07) are satisfied. TypeScript type check passes clean. Vite production build succeeds. The four expected commits (17367af, 9bcd959, bc0054d, 6774263) all exist in git history.

Three items require human browser verification to fully confirm the phase goal — these are visual/runtime behaviors that static analysis cannot validate.

---

_Verified: 2026-03-10T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
