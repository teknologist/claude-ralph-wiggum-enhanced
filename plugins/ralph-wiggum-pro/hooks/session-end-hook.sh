#!/bin/bash

# Ralph Wiggum Session End Hook
# Cleans up when a Claude Code session ends (terminal closed)
# Logs abandoned loops and deletes state files

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Global paths
RALPH_BASE_DIR="$HOME/.claude/ralph-wiggum-pro"
LOOPS_DIR="$RALPH_BASE_DIR/loops"
LOGS_DIR="$RALPH_BASE_DIR/logs"
DEBUG_LOG="$LOGS_DIR/debug.log"

# Ensure directories exist
mkdir -p "$LOOPS_DIR" "$LOGS_DIR"

# Debug logging helper
debug_log() {
  local msg="$1"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] session-end-hook: $msg" >> "$DEBUG_LOG"
}

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract session ID from hook input
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

debug_log "=== SESSION END HOOK INVOKED ==="
debug_log "session_id=$SESSION_ID"

if [[ -z "$SESSION_ID" ]]; then
  # No session ID available - nothing to clean up
  debug_log "EXIT: No session_id in hook input"
  exit 0
fi

# Direct state file lookup
STATE_FILE="$LOOPS_DIR/ralph-loop.${SESSION_ID}.local.md"
debug_log "State file path: $STATE_FILE"

if [[ ! -f "$STATE_FILE" ]]; then
  # No active loop for this session - nothing to do
  debug_log "EXIT: No state file found - no active loop to clean up"
  exit 0
fi

debug_log "Found active loop state file - logging as abandoned"

# Log the session as abandoned
if ! "$PLUGIN_ROOT/scripts/log-session.sh" "$STATE_FILE" "abandoned" "Session ended" 2>>"$DEBUG_LOG"; then
  debug_log "WARNING: Failed to log session as abandoned"
fi

# Delete the state file
if rm -f "$STATE_FILE" 2>>"$DEBUG_LOG"; then
  debug_log "State file deleted: $STATE_FILE"
else
  debug_log "WARNING: Failed to delete state file: $STATE_FILE"
fi

exit 0
