# ObservAgent

## What This Is

ObservAgent is a real-time observability platform for Claude Code that surfaces what every agent is doing, how much it costs, and whether it's healthy — all on a single live dashboard. It targets both top-level Claude Code sessions and sub-agents spawned via the Task tool, giving developers a clear view into the otherwise opaque hierarchy of agentic workflows like GSD.

## Core Value

See exactly which agent is doing what, how much it costs, and whether it's healthy — in real time, without changing any agent code.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Live dashboard shows agent tree (parent → child hierarchy from Task tool spawns)
- [ ] Real-time token usage per agent and per session
- [ ] Running cost estimate in dollars per agent/session
- [ ] Health indicators: failing agents, context-near-limit agents, stuck agents
- [ ] Zero instrumentation burden: hooks-based setup, no agent code changes required
- [ ] JSONL session file parsing for token and cost data
- [ ] Open source, runs locally, easy for others to set up

### Out of Scope

- Multi-user SaaS / cloud hosting — local-first for v1
- Support for non-Claude-Code AI frameworks — Claude Code specific for v1
- Mobile dashboard — web only

## Context

- Claude Code exposes two instrumentation surfaces:
  1. **Hooks** (PreToolUse/PostToolUse/etc.) — shell commands that fire on every tool event; used for real-time "what is happening now" data
  2. **Session JSONL files** (`~/.claude/projects/`) — full conversation transcripts including API response metadata with token counts; used for cost/token data
- Agent hierarchy comes from tracking Task tool spawns and correlating session IDs
- User has prior art: AgentWatch (Python/FastAPI/SQLite/vanilla JS) — this is the Node-stack Claude Code-specific evolution
- Target users: Claude Code power users, GSD users, anyone running multi-agent workflows

## Constraints

- **Stack**: Node.js backend (Express or Fastify) — user preference
- **Deployment**: Local-first, must work out of the box on macOS/Linux
- **Integration**: Zero-code setup using Claude Code hooks — no agent modification required
- **Open source**: Public GitHub repo, clean DX for contributors

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node backend over Python | User preference; JS end-to-end consistency | — Pending |
| Hooks + JSONL as data sources | Only two zero-code instrumentation surfaces Claude Code exposes | — Pending |
| Local-first v1 | Ship fast, validate core value before multi-user complexity | — Pending |

---
*Last updated: 2026-02-26 after initialization*
