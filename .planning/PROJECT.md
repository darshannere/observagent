# ObservAgent

## What This Is

ObservAgent is a real-time observability platform for Claude Code that surfaces what every agent is doing, how much it costs, and whether it's healthy — all on a single live dashboard. It targets both top-level Claude Code sessions and sub-agents spawned via the Task tool, giving developers a clear view into the otherwise opaque hierarchy of agentic workflows like GSD.

## Core Value

See exactly which agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

---

## v1.0 Shipped ✅

**Shipped:** 2026-03-01
**Phases:** 7 complete (28 plans)
**Status:** Production-ready MVP

### Key Deliverables

- SQLite + SSE event pipeline with Claude Code hooks
- Live dashboard with error highlighting and latency display
- JSONL-based cost/token tracking with auto-discovery
- Multi-agent tree visualization with stuck-agent detection
- Session history with filtering, replay, and export
- CLI with `npx observagent init/start/doctor`
- Gantt timeline view and health panel

### Technical Notes

- Stack: Node.js (Fastify), SQLite (WAL), vanilla JS
- Auto-discovers JSONL files in `~/.claude/projects/`
- Subagent tracking via SubagentStart/SubagentStop hooks
- Real-time via SSE (no polling)

---

## Current Milestone: v2.0 Agent Intelligence

**Goal:** Make the agent hierarchy visible, understandable, and actionable — enrich tool logs with real detail, fix context calculation accuracy, and redesign the dashboard so active agents are front and center.

**Target features:**
- Collapsible agent tree with human-readable names, active count badge, real-time current tool
- Per-agent detail panel: initial prompt, context fill %, tool call history, token counts per call
- Tool log enrichment: actual command/file/pattern/task description per tool type
- Dashboard reorganization: agent hierarchy as primary view, time filters, active-first layout
- Context window calculation accuracy fix (resolve ~10% discrepancy vs Claude Code)
- Session history date/time range filters

---

## Context

- Claude Code exposes two instrumentation surfaces:
  1. **Hooks** (PreToolUse/PostToolUse/etc.) — shell commands that fire on every tool event; used for real-time "what is happening now" data
  2. **Session JSONL files** (`~/.claude/projects/`) — full conversation transcripts including API response metadata with token counts; used for cost/token data
- Agent hierarchy comes from tracking Task tool spawns and correlating session IDs
- User has prior art: AgentWatch (Python/FastAPI/SQLite/vanilla JS) — this is the Node-stack Claude Code-specific evolution
- Target users: Claude Code power users, GSD users, anyone running multi-agent workflows

## Constraints

- **Stack**: Node.js backend (Fastify) — ✅ complete
- **Deployment**: Local-first, must work out of the box on macOS/Linux — ✅ complete
- **Integration**: Zero-code setup using Claude Code hooks — ✅ complete

---

_Last updated: 2026-03-02 after v2.0 milestone started_
