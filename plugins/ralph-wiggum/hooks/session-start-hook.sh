#!/bin/bash

# Ralph Wiggum Session Start Hook
# Persists session ID as environment variable for session-bound loops

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract session ID
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

log_session() {
  local outcome="$1"
  local error_reason="${2:-}"
  if [[ -n "$error_reason" ]]; then
    echo "⚠️  Ralph loop session start: $outcome" >&2
    echo "   $error_reason" >&2
  fi
}

if [[ -z "$SESSION_ID" ]]; then
  # No session ID available, skip
  log_session "skipped" "No session ID provided"
  exit 0
fi

# Validate session ID format to prevent injection attacks
# Allow UUIDs, alphanumeric with hyphens/underscores/dots (but not .. for path traversal)
if [[ ! "$SESSION_ID" =~ ^[a-zA-Z0-9._-]+$ ]] || [[ "$SESSION_ID" == *".."* ]]; then
  # Invalid session ID format - skip with logging (security measure)
  echo "⚠️  Ralph loop session start: Invalid session ID format (security check)" >&2
  echo "   Session ID contains unsafe characters: $SESSION_ID" >&2
  log_session "skipped" "Invalid session ID format: $SESSION_ID"
  exit 0
fi

# Persist session ID as environment variable using Claude's special CLAUDE_ENV_FILE
# This makes $CLAUDE_SESSION_ID available to all commands in this session
if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  echo "export CLAUDE_SESSION_ID=\"$SESSION_ID\"" >> "$CLAUDE_ENV_FILE"
fi

exit 0
