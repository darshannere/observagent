#!/usr/bin/env python3
"""
ObservAgent hook relay.
Invoked by Claude Code for every PreToolUse and PostToolUse hook event.

CRITICAL CONSTRAINTS (non-negotiable):
- NEVER write to stdout or stderr — any output appears in Claude Code UI
- ALWAYS exit with code 0 — non-zero exit can block or modify tool behavior
- 500ms timeout on HTTP POST — protects Claude session if server is hung
- No retries, no buffering — pure fire-and-forget
- Pure Python stdlib only — no pip install required
"""

import sys
import json
import urllib.request
import urllib.error

INGEST_URL = "http://localhost:4999/ingest"
TIMEOUT_SECONDS = 0.5  # 500ms hard limit — protects Claude session


def _derive_exit_status(payload):
    """
    Derive exit status from the PostToolUse hook payload.

    Claude Code 2.1.59 does not include an explicit exit_status, exit_code, or
    exitCode field in the PostToolUse hook payload (confirmed by live payload
    inspection). The top-level payload only contains: session_id, transcript_path,
    cwd, permission_mode, hook_event_name, tool_name, tool_use_id, tool_input,
    tool_response.

    For Bash tool calls: non-empty stderr reliably indicates a command error or
    non-zero exit (e.g., 'command not found', 'No such file or directory'). We
    derive exit_status = 1 when stderr is non-empty, 0 when empty.

    For all other tools: return None (no reliable failure signal available in
    the current payload schema). PreToolUse events also return None.

    Security: only the boolean result (0/1/None) is forwarded — stderr content
    is never included in the relay POST body.
    """
    if payload.get("hook_event_name") != "PostToolUse":
        return None

    tool_response = payload.get("tool_response", {})
    if not isinstance(tool_response, dict):
        return None

    tool_name = payload.get("tool_name", "")

    if tool_name == "Bash":
        # stderr being non-empty indicates a command error or non-zero exit.
        # Empty string (no error output) maps to exit_status 0 (success).
        stderr = tool_response.get("stderr", "")
        return 1 if (isinstance(stderr, str) and stderr.strip()) else 0

    # For non-Bash tools (Read, Write, Edit, etc.) there is no exit_status
    # equivalent in the current hook payload schema.
    return None


def _build_tool_summary(tool_name, tool_input):
    """
    Build a safe, pre-formatted summary string for a tool call.

    Only extracts non-sensitive metadata fields (command, file paths, patterns,
    queries, URLs). Never extracts content, new_str, old_str, or new_content.
    Returns None for tools with no meaningful summary field, or when tool_input
    is not a dict.
    """
    if not isinstance(tool_input, dict):
        return None
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if cmd: return "command: " + cmd[:200]
    elif tool_name in ("Read", "Write", "Edit", "MultiEdit"):
        path = tool_input.get("file_path", "")
        if path: return "file_path: " + path
    elif tool_name in ("Grep", "Glob"):
        pattern = tool_input.get("pattern", "")
        if pattern: return "pattern: " + pattern
    elif tool_name == "Task":
        desc = tool_input.get("description", "")
        sub = tool_input.get("subagent_type", "")
        parts = []
        if desc: parts.append("description: " + desc[:200])
        if sub: parts.append("subagent_type: " + sub)
        return " | ".join(parts) if parts else None
    elif tool_name == "WebFetch":
        url = tool_input.get("url", "")
        if url: return "url: " + url[:200]
    elif tool_name == "WebSearch":
        query = tool_input.get("query", "")
        if query: return "query: " + query[:200]
    elif tool_name == "TodoWrite":
        todos = tool_input.get("todos", [])
        if todos and isinstance(todos, list) and len(todos) > 0 and isinstance(todos[0], dict):
            subject = todos[0].get("content", todos[0].get("subject", ""))
            if subject: return "subject: " + subject[:200]
    elif tool_name in ("NotebookRead", "NotebookEdit"):
        path = tool_input.get("notebook_path", "")
        if path: return "notebook_path: " + path
    elif tool_name == "LS":
        path = tool_input.get("path", "")
        if path: return "path: " + path
    elif tool_name.startswith("mcp__"):
        for key in ("query", "path", "url", "command", "name", "description"):
            val = tool_input.get(key, "")
            if val and isinstance(val, str): return key + ": " + val[:200]
    return None


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)

        # Extract metadata only — never forward tool_input or tool_response
        # (those may contain sensitive file paths, commands, or file contents).
        # exit_status is derived from tool_response boolean signals (not content).
        event = {
            "tool_name":    payload.get("tool_name", ""),
            "hook_type":    payload.get("hook_event_name", ""),
            "session_id":   payload.get("session_id", ""),
            "tool_call_id": payload.get("tool_use_id", ""),
            "exit_status":  _derive_exit_status(payload),
        }

        tool_name_val = payload.get("tool_name", "")
        tool_input_val = payload.get("tool_input", {})
        event["tool_summary"] = _build_tool_summary(tool_name_val, tool_input_val)

        # Extract additional fields for SubagentStart/SubagentStop
        hook_event = payload.get("hook_event_name", "")
        if hook_event == "SubagentStart":
            event["agent_id"]   = payload.get("agent_id", "")
            event["agent_type"] = payload.get("agent_type", "")
        elif hook_event == "SubagentStop":
            event["agent_id"]              = payload.get("agent_id", "")
            event["agent_type"]            = payload.get("agent_type", "")
            event["agent_transcript_path"] = payload.get("agent_transcript_path", "")

        body = json.dumps(event).encode("utf-8")
        req = urllib.request.Request(
            INGEST_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        # 500ms timeout — urlopen blocks until server responds or timeout fires.
        # Connection refused (server down) returns almost immediately.
        # Hung server (accepts TCP but never responds) is caught by timeout.
        urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS)

    except Exception:
        # Silent fail: connection refused, timeout, JSON parse error, anything.
        # NEVER write to stdout or stderr here.
        pass

    # Always exit 0 — non-zero exit codes can cause Claude Code to
    # treat the hook as a failure and potentially block the tool call.
    sys.exit(0)


if __name__ == "__main__":
    main()
