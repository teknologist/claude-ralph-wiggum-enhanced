#!/bin/bash

# Ralph Wiggum Session Start Hook
# Persists session ID as environment variable for session-bound loops

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract session ID
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

if [[ -z "$SESSION_ID" ]]; then
  # No session ID available, skip
  exit 0
fi

# Persist session ID as environment variable using Claude's special CLAUDE_ENV_FILE
# This makes $CLAUDE_SESSION_ID available to all commands in this session
if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  echo "export CLAUDE_SESSION_ID=\"$SESSION_ID\"" >> "$CLAUDE_ENV_FILE"
fi

exit 0
