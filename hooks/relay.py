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


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)

        # Extract metadata only — never forward tool_input or tool_response
        # (those may contain sensitive file paths, commands, or file contents)
        event = {
            "tool_name": payload.get("tool_name", ""),
            "hook_type": payload.get("hook_event_name", ""),
            "session_id": payload.get("session_id", ""),
            "tool_call_id": payload.get("tool_use_id", ""),
        }

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
