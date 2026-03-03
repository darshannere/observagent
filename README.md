# ObservAgent

<p align="center">
  <strong>Zero-config observability for Claude Code agent sessions</strong><br>
  Track costs, monitor tool usage, analyze latency, and debug agent behavior in real-time.
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick%20Start-→-007AFF?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-features"><img src="https://img.shields.io/badge/Features-→-34C759?style=for-the-badge" alt="Features"></a>
  <a href="#-architecture"><img src="https://img.shields.io/badge/Architecture-→-FF9500?style=for-the-badge" alt="Architecture"></a>
  <a href="#-configuration"><img src="https://img.shields.io/badge/Configuration-→-5856D6?style=for-the-badge" alt="Configuration"></a>
</p>

---

## Why ObservAgent?

Claude Code sessions get expensive and opaque fast.

• Why did this run cost $3?
• Which tool is slowing everything down?
• Why did the agent silently fail?

Claude writes JSONL transcripts — but they’re not usable in real time.

**ObservAgent turns Claude Code into a live, debuggable system.**
No wrappers. No SDKs. No cloud. Just visibility.

ObservAgent gives you complete visibility into your Claude Code sessions without any code changes:

- **Cost Tracking** — Real-time token usage per model with automatic cost calculation (all Anthropic models supported)
- **Tool Monitoring** — See every tool call, its latency, and success/failure status
- **Latency Insights** — p50/p95 response times for all tools and models
- **Zero Integration** — Works via Claude Code hooks, no wrapper code required
- **Local & Private** — All data stays on your machine

---

## Quick Start

### 1. Install

```bash
npm install -g observagent
```

Or clone and run locally:

```bash
git clone https://github.com/darshannere/observagent.git
cd observagent
npm install
```

### 2. Configure Claude Code Hooks

Add the ObservAgent hook to your Claude Code configuration (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": "python3 /path/to/observagent/hooks/relay.py",
    "PostToolUse": "python3 /path/to/observagent/hooks/relay.py",
    "SubagentStart": "python3 /path/to/observagent/hooks/relay.py",
    "SubagentStop": "python3 /path/to/observagent/hooks/relay.py"
  }
}
```

> **Note**: Replace `/path/to/observagent` with your actual installation path.

### 3. Start ObservAgent

```bash
observagent start
```

This opens the dashboard at `http://localhost:4999`.

---

## Features

### Real-Time Session Monitoring

Every tool call streams instantly to the dashboard via Server-Sent Events (SSE). Watch your agent work live.

### Cost Analytics

Automatic cost calculation for all Anthropic models:
- Claude Sonnet 4.6 / 4.5 / 4.0
- Claude Opus 4.6 / 4.5 / 4.1
- Claude Haiku 4.5 / 3.5

Includes cache token tracking (5m and 1h ephemeral caches).

### Latency Insights

Track response times across all tools:
- Per-tool latency (p50, p95, max)
- Model-level performance
- Session duration metrics

### Error Monitoring

Track tool failures with exit status derived from stderr. Identify which commands or tools are causing issues.

### Multi-Session Support

Multiple concurrent Claude Code sessions are tracked independently with session-level cost aggregation.

---

## Architecture

```
┌─────────────────┐     HTTP POST      ┌─────────────────┐
│  Claude Code    │──────────────────► │   ObservAgent   │
│    (hooks)      │   relay.py         │    Server       │
└─────────────────┘                    │                 │
                                       │  ┌───────────┐  │
                                       │  │  SQLite   │  │
                                       │  │  Database │  │
                                       │  └───────────┘  │
                                       └────────┬────────┘
                                                │ SSE
                                                ▼
                                       ┌─────────────────┐
                                       │   Dashboard     │
                                       │  (real-time)    │
                                       └─────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `hooks/relay.py` | Fire-and-forget hook that POSTs tool events to the server |
| `server.js` | Fastify server handling ingestion, SSE streaming, and API |
| `lib/costEngine.js` | Token pricing and cost aggregation logic |
| `lib/jsonlWatcher.js` | Parses Claude Code JSONL files for detailed usage |
| `routes/` | Ingest, SSE, dashboard, and API endpoints |
| `public/` | Vanilla JS dashboard with Chart.js visualizations |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4999` | Server port |
| `OBSERVAGENT_DB_PATH` | `./observagent.db` | SQLite database path |

### Database Location

By default, the database is stored at:
- **macOS/Linux**: `~/.local/share/observagent/observagent.db`
- **Windows**: `%APPDATA%/observagent/observagent.db`

### Custom Hook Installation Path

If you move the installation directory, update your hook paths in `~/.claude/settings.json`.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ingest` | POST | Receive tool events from hooks |
| `/events` | GET | SSE stream of real-time events |
| `/api/sessions` | GET | List all sessions |
| `/api/sessions/:id` | GET | Session details with tool calls |
| `/api/costs` | GET | Aggregated cost data |
| `/` | GET | Dashboard UI |

---

## Screenshots

The dashboard provides:
- Live event feed with tool names, latency, and status
- Cost breakdown by model and session
- Latency histograms per tool
- Session history with search

---

## Requirements

- **Node.js** 18+
- **Python 3** (for hook relay)
- **Claude Code** (any recent version)

---

## Troubleshooting

### Hook Not Triggering

Ensure the path to `relay.py` is absolute in your `settings.json`. Claude Code expands `~` incorrectly in hooks.

### Server Won't Start

Check if port 4999 is available:
```bash
lsof -i :4999
```

### No Data Appearing

1. Verify the server is running: `observagent start`
2. Check hook is configured: `cat ~/.claude/settings.json | jq .hooks`
3. Test relay manually: `echo '{}' | python3 /path/to/hooks/relay.py`

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.
