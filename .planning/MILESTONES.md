# Milestones

## v2.0 Agent Intelligence (Shipped: 2026-03-10)

**Phases completed:** 4 phases (8–11), 20 plans, 148 commits, 151 files changed
**Timeline:** 2026-03-02 → 2026-03-09 (8 days)

**Key accomplishments:**
- Tool log enrichment: Bash commands, file paths, search patterns, task descriptions now shown inline per tool call row (TOOL-01 through TOOL-05)
- Context window fill % calculation fixed — resolved ~10% discrepancy vs Claude Code by removing double-counted cache-write tokens (CALC-01)
- Full React migration: dashboard rebuilt in Vite + React 18 + Zustand + TanStack Virtual, feature-parity with v1.0, vanilla JS retired (ARCH-01)
- Collapsible agent tree with human-readable names (`gsd-executor [a1b2]`), active count badge, real-time current-tool display (AGNT-01 through AGNT-04)
- Per-agent tabbed detail panel: Prompt, Context (full JSONL conversation history), Calls, Tokens (AGNT-05 through AGNT-10)
- Dashboard reorganized with agent hierarchy as primary view, active-first layout, time filter strip, and Insights charts panel (DASH2-01 through DASH2-04)
- Session history date/time range picker and quick-filter buttons (FILT-01, FILT-02)

---

## v1.0 ObservAgent MVP (Shipped: 2026-03-01)

**Phases completed:** 7 phases, 28 plans

**Key accomplishments:**
- SQLite + SSE event pipeline with Claude Code hooks (real-time tool call capture)
- Live dashboard with error highlighting, latency display, 4-panel layout
- JSONL-based cost and token tracking with auto-discovery and budget alerts
- Multi-agent tree visualization with per-agent cost breakdown and stuck-agent detection
- Session history page with filtering, replay mode, and JSONL/CSV export
- CLI with `npx observagent init/start/doctor` commands for zero-config setup
- Gantt-style timeline view and health panel (hook status, error rate, uptime)

---

