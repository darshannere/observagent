# Design Spec: Dashboard Design System Unification
**Date:** 2026-03-14
**Approach:** B — CSS Tokens + Glassmorphic Cards
**Scope:** All frontend components across Live Dashboard and History pages

---

## Goal

Apply the landing page's design language (dark space theme, cyan `#00d4ff` + lime `#00ffb2` + amber `#ff7b2b` palette, Syne + JetBrains Mono fonts, glassmorphic panels) consistently across the entire ObservAgent dashboard application.

---

## Design Tokens

### Colors

The project uses Tailwind v4 with `@theme inline` inside `index.css` (no `tailwind.config.js` exists). All token changes go in `frontend/src/index.css`.

**Strategy:** Update the existing shadcn semantic token values inside `@theme inline` to match the new palette, so that all existing shadcn-using components (which reference `bg-background`, `border-border`, `text-muted-foreground`, etc.) automatically pick up the new look without markup changes. Additionally add new named tokens for the accent colors.

| CSS variable | New value | Usage |
|---|---|---|
| `--background` | `#030811` | Page background |
| `--card` | `#06101e` | Panel/card background |
| `--popover` | `#06101e` | Tooltip/popover background |
| `--foreground` | `#c8dae8` | Primary text |
| `--card-foreground` | `#c8dae8` | Card text |
| `--muted` | `#0a1828` | Muted surface (hover backgrounds) |
| `--muted-foreground` | `#3d5a7a` | Secondary labels |
| `--border` | `rgba(0,212,255,0.12)` | Panel borders |
| `--input` | `rgba(0,212,255,0.12)` | Input borders |
| `--ring` | `#00d4ff` | Focus ring |
| `--primary` | `#00ffb2` | Primary action (lime) |
| `--primary-foreground` | `#030811` | Text on lime bg |
| `--secondary` | `rgba(0,212,255,0.08)` | Secondary surface |
| `--secondary-foreground` | `#00d4ff` | Text on secondary |
| `--accent` | `rgba(0,212,255,0.06)` | Accent surface |
| `--accent-foreground` | `#00d4ff` | Text on accent |
| `--destructive` | `#ff4d4d` | Error |
| `--green` | `#00e887` | Success |
| `--yellow` | `#ff7b2b` | Warning / cost (repurposed) |

**New accent tokens** (added to `@theme inline`):

```css
--cyan:     #00d4ff;
--lime:     #00ffb2;
--amber:    #ff7b2b;
--dim:      #1e3a5a;
--card-bg:  rgba(3,12,28,0.75);
--glow-c:   rgba(0,212,255,0.4);
--glow-l:   rgba(0,255,178,0.4);
```

### Typography

| Role | Font | Weight | Usage |
|---|---|---|---|
| Display / metric values | Syne | 700–800 | Cost values, agent names, logo, stat tiles |
| Code / labels | JetBrains Mono | 400–500 | Tool names, IDs, timestamps, badges, tab labels |
| Body | Inter | 400–500 | Descriptions, inputs, general prose |

Add to `frontend/index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500&display=swap" rel="stylesheet"/>
```

In `index.css`, update the body font-family from the monospace stack to `'Inter', sans-serif`. Add `@layer utilities` entries:
```css
.font-display { font-family: 'Syne', sans-serif; }
.font-mono    { font-family: 'JetBrains Mono', monospace; }
```

---

## Component Designs

### Shared Panel Chrome

All panels use the same chrome. Add to `index.css` as `@layer components`:

```css
.panel {
  background: rgba(3,12,28,0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0,212,255,0.12);
  box-shadow: inset 0 1px 0 rgba(0,212,255,0.06);
  border-radius: 10px;
  overflow: hidden;
}
.panel-header {
  padding: 9px 14px;
  background: rgba(0,212,255,0.05);
  border-bottom: 1px solid rgba(0,212,255,0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```

Apply `.panel` + `.panel-header` to: AgentTree, CostPanel, HealthPanel, AgentDetailPanel, InsightsPanel, `card.tsx` Card component.

### TopBar (inline in `LiveDashboard.tsx` and `HistoryPage.tsx`)

There is no separate TopBar file. The nav/logo bar is rendered inline in both page files.

Changes in both files:
- Container: `bg-[rgba(3,8,17,0.9)] backdrop-blur-xl border-b border-cyan/15`
- Logo: pulsing lime dot (`bg-[#00ffb2] shadow-[0_0_8px_#00ffb2] animate-pulse`) + "Observ**Agent**" in `font-display` weight-800, "Agent" in `text-[#00ffb2]`
- "LIVE" badge: `bg-[rgba(0,255,178,0.08)] border border-[rgba(0,255,178,0.25)] text-[#00ffb2] font-mono text-[10px]` + pulsing lime dot
- Nav tabs (Live / History links): `font-mono text-[10px]`; active state = `text-[#00d4ff] bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.18)]`

### AgentTree (`AgentTree.tsx`)

- Active item: `bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.20)]`; item name `text-white`
- Hover: `hover:bg-[rgba(0,212,255,0.04)] hover:border-[rgba(0,212,255,0.12)]`
- Live agent indicator dot: `bg-[#00ffb2] shadow-[0_0_6px_#00ffb2] animate-pulse`
- Idle agent indicator dot: `bg-[#1e3a5a]` (no glow)
- Cost values: `text-[#ff7b2b]` (amber)
- Section labels (project name): `font-mono text-[9px] uppercase tracking-widest text-[#1e3a5a]`

### ToolLog (`ToolLog.tsx` + `ToolLogRow.tsx`)

- Row hover: `hover:bg-[rgba(0,212,255,0.03)]`
- Error rows: add `border-l-2 border-[rgba(255,77,77,0.5)] pl-[calc(...-2px)]` left accent
- Status dot — ok: `bg-[#00e887]`; err: `bg-[#ff4d4d] shadow-[0_0_5px_rgba(255,77,77,0.5)]`; running: `bg-[#00d4ff] animate-pulse`
- Tool name column: `text-[#00d4ff] font-mono`
- Message column: `text-[#1e3a5a] font-mono`
- Latency column: `text-[#1e3a5a] font-mono`

### Tab Bars

**Main panel tabs** (Log / Timeline / Insights in `LiveDashboard.tsx`):
- Active: `text-[#00d4ff] border-b-2 border-[#00d4ff]`
- Inactive: `text-[#3d5a7a]`

**Agent detail drawer tabs** (Prompt / Context / Calls / Tokens in `AgentDetailTabs.tsx`):
- Active: `text-[#00ffb2] border-b-2 border-[#00ffb2]`
- Inactive: `text-[#3d5a7a]`

### CostPanel (`CostPanel.tsx`)

- Session total value: `font-display font-bold text-[#ff7b2b]`
- Token counts: `font-display font-bold text-[#00d4ff]`
- Context fill progress bar: replace current bar color with gradient `from-[#00d4ff] to-[#00ffb2]` + `shadow-[0_0_8px_rgba(0,255,178,0.3)]`

### HealthPanel (`HealthPanel.tsx`)

- "Connected" / ok status: `text-[#00e887]`
- Latency / time values: `text-[#00d4ff]`
- Error count (> 0): `text-[#ff7b2b]`

### InsightsPanel — Recharts Colors (`InsightsPanel.tsx`)

Update the `TOOLTIP_STYLE` constant (currently `var(--popover)` / `var(--border)`) to:
```ts
const TOOLTIP_STYLE = {
  backgroundColor: '#06101e',
  border: '1px solid rgba(0,212,255,0.25)',
  borderRadius: '8px',
  color: '#c8dae8',
  fontSize: '11px',
  fontFamily: "'JetBrains Mono', monospace",
};
```

**Add** `<CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" vertical={false} />` to all charts that don't already have it.

Update `XAxis` and `YAxis` tick color: `tick={{ fill: '#3d5a7a', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}`

**Per-chart color changes:**

| Chart | Element | JSX Prop | New Value | fillOpacity |
|---|---|---|---|---|
| 7-day cost trend | `<Area>` | `stroke` + `fill` | `#00ffb2` | `0.20` |
| Cost by agent | `<Bar>` | `fill` | `#00d4ff` | — |
| Cost by model | `<Bar>` | `fill` | `#00d4ff` | — |
| Cost by session | `<Bar>` | `fill` | `#00d4ff` | — |
| Token burn: input | `<Area dataKey="input_tokens">` | `stroke` + `fill` | `#00d4ff` | `0.20` |
| Token burn: output | `<Area dataKey="output_tokens">` | `stroke` + `fill` | `#00ffb2` | `0.15` |
| Tool call activity | `<Bar>` | `fill` | `#00d4ff` | — |
| Error rate | `<Area>` | `stroke` + `fill` | `#ff4d4d` | `0.15` |
| Latency p50 | `<Bar dataKey="p50_ms">` | `fill` | `#00d4ff` | — |
| Latency p95 | `<Bar dataKey="p95_ms">` | `fill` | `#ff7b2b` | — |

### AgentDetailPanel + AgentDetailTabs (`AgentDetailPanel.tsx` + `AgentDetailTabs.tsx`)

**AgentDetailPanel.tsx:**
- Drawer container: `bg-[rgba(3,12,28,0.9)] border-l border-[rgba(0,212,255,0.18)]`
- Header: apply `.panel-header` chrome
- Agent icon tile: `bg-[rgba(0,212,255,0.12)] border border-[rgba(0,212,255,0.25)]`

**AgentDetailTabs.tsx:**
- Stat tiles: `bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.12)] rounded-lg`
- Cost stat value: `font-display font-bold text-[#ff7b2b]`
- p95 / latency stat: `font-display font-bold text-[#00ffb2]`
- ToolUseBlock: replace `bg-blue-950/40 text-blue-300` with `bg-[rgba(0,212,255,0.06)] text-[#00d4ff]`
- Turn bubbles: replace `bg-primary/10` / `bg-muted/30` with `bg-[rgba(0,255,178,0.06)]` / `bg-[rgba(0,212,255,0.04)]`
- Progress bar in context tab: same gradient as CostPanel (`from-[#00d4ff] to-[#00ffb2]`)

### HistoryPage (`HistoryPage.tsx`)

- Filter pills: active = `bg-[rgba(0,255,178,0.10)] border border-[rgba(0,255,178,0.25)] text-[#00ffb2]`; inactive = `border border-[rgba(255,255,255,0.07)] text-[#1e3a5a]`
- Session ID: `text-[#00d4ff] font-mono`
- Cost column: `text-[#ff7b2b] font-display font-bold`
- LIVE badge: `bg-[rgba(0,255,178,0.10)] border border-[rgba(0,255,178,0.25)] text-[#00ffb2]`
- Done badge: `border border-[rgba(255,255,255,0.07)] text-[#1e3a5a]`
- Error count (> 0): `text-[#ff4d4d]`
- Row hover: `hover:bg-[rgba(0,212,255,0.04)]`

### badge.tsx

The shadcn `badge.tsx` uses `cva` variants. Update the `default` variant to match lime primary style, and add a `live` variant:
- `default` variant: `bg-primary text-primary-foreground` (already works once `--primary` = lime)
- Add `live` variant: `bg-[rgba(0,255,178,0.10)] border border-[rgba(0,255,178,0.25)] text-[#00ffb2]`
- Add `cyan` variant: `bg-[rgba(0,212,255,0.10)] border border-[rgba(0,212,255,0.20)] text-[#00d4ff]`
- `destructive` variant: already uses `--destructive`, works after token update

Use the `live` variant for LIVE badges and `cyan` for info/metric badges throughout the app.

### TimelineWaterfall (`TimelineWaterfall.tsx`)

Audit for hardcoded color classes (`bg-blue-*`, `text-green-*`, `bg-red-*`, etc.) and replace with the new token equivalents:
- Blue tool bars → `bg-[#00d4ff]/70`
- Green success → `bg-[#00e887]`
- Red error → `bg-[#ff4d4d]`
- Yellow/orange warning → `bg-[#ff7b2b]`
- Background/grid lines → `border-[rgba(0,212,255,0.08)]`

---

## Implementation Phases

### Phase A — Token Layer (`index.css` + `index.html`)
1. Add Google Fonts `<link>` to `frontend/index.html`
2. Update `@theme inline` block in `index.css`: replace all OKLCH shadcn semantic token values + add new accent tokens
3. Update body font-family; add `.font-display` and `.font-mono` utilities
4. Add `.panel` and `.panel-header` to `@layer components`

### Phase B — Shared Chrome + TopBar
5. Apply `.panel` / `.panel-header` to `card.tsx`
6. Update nav/logo bar in `LiveDashboard.tsx` and `HistoryPage.tsx`

### Phase C — Component Updates
7. `AgentTree.tsx`: item styles, agent dot glow
8. `ToolLog.tsx` + `ToolLogRow.tsx`: status dots, tool column, error border, hover
9. `CostPanel.tsx`: metric fonts + colors, progress bar gradient
10. `HealthPanel.tsx`: status value colors
11. Main tab bar in `LiveDashboard.tsx`: active indicator
12. `AgentDetailPanel.tsx` + `AgentDetailTabs.tsx`: drawer chrome, stat tiles, tab active color, ToolUseBlock, turn bubbles, progress bar
13. `HistoryPage.tsx`: filter pills, columns, badges, row hover
14. `badge.tsx`: add `live` and `cyan` variants

### Phase D — Charts + Timeline
15. `InsightsPanel.tsx`: update `TOOLTIP_STYLE`, add `CartesianGrid`, update all `XAxis`/`YAxis` ticks, update all chart colors per the table above
16. `TimelineWaterfall.tsx`: audit and replace hardcoded color classes

---

## Files Changed

| File | Change |
|---|---|
| `frontend/index.html` | Add Google Fonts `<link>` |
| `frontend/src/index.css` | Replace `@theme inline` tokens, update body font, add `.font-display`, `.font-mono`, `.panel`, `.panel-header` |
| `frontend/src/pages/LiveDashboard.tsx` | TopBar styles, main tab bar active state |
| `frontend/src/pages/HistoryPage.tsx` | TopBar styles, filter pills, row/badge styles |
| `frontend/src/components/agents/AgentTree.tsx` | Item styles, agent dot glow |
| `frontend/src/components/agents/AgentDetailPanel.tsx` | Drawer bg, header chrome |
| `frontend/src/components/agents/AgentDetailTabs.tsx` | Tab active color, stat tiles, ToolUseBlock, turn bubbles, progress bar |
| `frontend/src/components/log/ToolLog.tsx` | Row hover |
| `frontend/src/components/log/ToolLogRow.tsx` | Status dots, tool/message columns, error border |
| `frontend/src/components/insights/InsightsPanel.tsx` | `TOOLTIP_STYLE`, `CartesianGrid`, axis ticks, all chart colors |
| `frontend/src/components/cost/CostPanel.tsx` | Metric fonts + colors, progress bar |
| `frontend/src/components/health/HealthPanel.tsx` | Status value colors |
| `frontend/src/components/timeline/TimelineWaterfall.tsx` | Audit + replace hardcoded color classes |
| `frontend/src/components/ui/card.tsx` | Apply `.panel` / `.panel-header` chrome |
| `frontend/src/components/ui/badge.tsx` | Add `live` and `cyan` variants |

---

## Non-Goals

- No layout changes (column widths, panel positions, component structure)
- No new components or features
- No changes to server, API, or data layer
- No TypeScript type changes (except `badge.tsx` variant union)
