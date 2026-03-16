# Hook Relay

**File:** `hooks/relay.py`
**Installed to:** `~/.claude/observagent/relay.py` by `observagent init`
**Language:** Python 3 (stdlib only — no `pip` dependencies)

---

## Purpose

`relay.py` is the bridge between Claude Code and the ObservAgent server. Claude Code calls it synchronously for every hook event by writing the full event payload to `stdin` as JSON. The relay extracts relevant fields, augments them with derived data, and fires a single HTTP POST to `/ingest`.

---

## Hard constraints

Every design decision in `relay.py` is driven by one requirement: **never block or affect Claude Code**.

| Constraint | Implementation |
|---|---|
| Never write to stdout or stderr | Any output would appear in the Claude Code UI |
| Always exit 0 | Non-zero exit can block or cancel the tool call |
| 500ms HTTP timeout | Prevents slowdown if the server is unresponsive |
| No retries, no buffering | Fire-and-forget — if the server is down, events are dropped |
| No `pip` dependencies | Must work on any machine with Python 3 installed |
| Swallow all exceptions | Network errors, JSON parse failures — everything is silent |

---

## Flow

```
Claude Code
    │
    │ stdin (JSON payload)
    ▼
relay.py
    │
    ├── Parse stdin
    ├── _derive_agent_id(payload)
    ├── _derive_exit_status(payload)        ← Bash only
    ├── _build_tool_summary(tool_name, tool_input)
    ├── Build event dict
    │
    │ POST http://localhost:4999/ingest
    │ timeout=0.5s
    │
    ▼ (fire-and-forget, all exceptions swallowed)
sys.exit(0)
```

---

## Agent ID derivation

`_derive_agent_id(payload)` returns the subagent hex ID or empty string:

1. `payload['agent_id']` if present (explicit from some hook environments).
2. Regex `agent-([A-Za-z0-9]+)\.jsonl$` applied to `payload.get('transcript_path')` or `payload.get('agent_transcript_path')`.
3. Empty string — top-level session event.

---

## Exit status derivation

`_derive_exit_status(payload)` — meaningful only for `PostToolUse`:

- For `tool_name == "Bash"`: returns `1` if `tool_response.stderr` is non-empty, `0` otherwise.
- For all other tools: returns `None`.

The stderr **content** is never forwarded to the server — only the binary "did stderr have content" flag.

---

## Tool summary building

`_build_tool_summary(tool_name, tool_input)` returns a short, safe summary string. It never includes file contents, `new_str`, `old_str`, or `new_content` — only identifiers and short inputs.

| Tool | Summary format |
|---|---|
| `Bash` | `command: {cmd[:200]}` |
| `Read`, `Write`, `Edit`, `MultiEdit` | `file_path: {path}` |
| `Grep`, `Glob` | `pattern: {pattern}` |
| `Task` | `description: {desc[:200]} \| subagent_type: {type}` |
| `WebFetch` | `url: {url[:200]}` |
| `WebSearch` | `query: {query[:200]}` |
| `TodoWrite` | `subject: {first_todo_content[:200]}` |
| `NotebookRead`, `NotebookEdit` | `notebook_path: {path}` |
| `LS` | `path: {path}` |
| `mcp__*` tools | First non-null of: `query`, `path`, `url`, `command`, `name`, `description` |
| All others | `None` (no summary) |

---

## Fields sent to `/ingest`

```python
event = {
    'tool_name':    payload.get('tool_name', ''),
    'hook_type':    payload.get('hook_type', ''),
    'session_id':   payload.get('session_id', ''),
    'agent_id':     _derive_agent_id(payload),
    'tool_call_id': payload.get('tool_call_id'),
    'exit_status':  _derive_exit_status(payload),
    'tool_summary': _build_tool_summary(tool_name, tool_input),
}

# Task PreToolUse only:
event['initial_prompt'] = description[:2000]

# SubagentStart / SubagentStop only:
event['agent_type'] = payload.get('agent_type', '')
event['agent_transcript_path'] = payload.get('agent_transcript_path', '')
```

---

## Updating relay.py

`relay.py` is shipped inside the npm package and installed to `~/.claude/observagent/relay.py` by `observagent init`. Running `observagent init` again after upgrading the package updates the installed copy.

If you need to test changes to `relay.py` locally, edit `~/.claude/observagent/relay.py` directly — Claude Code uses that copy. Re-run `observagent init` to reset it back to the package version.

---

## Testing relay.py manually

You can simulate a hook invocation by piping JSON to the script:

```bash
echo '{"tool_name":"Bash","hook_type":"PreToolUse","session_id":"test123","tool_input":{"command":"ls"}}' \
  | python3 ~/.claude/observagent/relay.py
```

The script will exit 0 silently. Check `POST /ingest` in the server logs to confirm receipt.
