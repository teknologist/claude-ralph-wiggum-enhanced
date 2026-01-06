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
SESSIONS_DIR="$RALPH_BASE_DIR/sessions"
DEBUG_LOG="$LOGS_DIR/debug.log"

# Ensure directories exist
mkdir -p "$LOOPS_DIR" "$LOGS_DIR" "$SESSIONS_DIR"

# Maximum debug log size (1MB)
MAX_DEBUG_LOG_SIZE=1048576

# Rotate debug log if it exceeds maximum size
rotate_debug_log_if_needed() {
  if [[ -f "$DEBUG_LOG" ]]; then
    local size
    # Use wc -c which works on both macOS and Linux; trim all whitespace
    # Command wrapped to ensure fallback is evaluated even with set -e
    size=$( { wc -c < "$DEBUG_LOG" 2>/dev/null | tr -d '[:space:]'; } || echo "0" )
    if [[ "$size" -gt "$MAX_DEBUG_LOG_SIZE" ]]; then
      # Keep last 5000 lines (approximately 500KB)
      local tmp_file
      tmp_file=$(mktemp "${DEBUG_LOG}.XXXXXX") || return 0
      if tail -n 5000 "$DEBUG_LOG" > "$tmp_file" 2>/dev/null; then
        mv "$tmp_file" "$DEBUG_LOG" 2>/dev/null || rm -f "$tmp_file" 2>/dev/null
      else
        rm -f "$tmp_file" 2>/dev/null || true
      fi
    fi
  fi
}

# Debug logging helper (with auto-rotation)
debug_log() {
  local msg="$1"
  rotate_debug_log_if_needed
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

# Security: Validate session ID format to prevent path traversal
if [[ ! "$SESSION_ID" =~ ^[a-zA-Z0-9._-]+$ ]] || [[ "$SESSION_ID" == *".."* ]]; then
  debug_log "EXIT: Invalid session_id format (security check): $SESSION_ID"
  exit 0
fi

# Clear CLAUDE_SESSION_ID from CLAUDE_ENV_FILE to prevent stale values
# This ensures the next session-start-hook sets a fresh value after /clear
# NOTE: This runs ALWAYS on session end, regardless of whether there's an active loop
if [[ -n "${CLAUDE_ENV_FILE:-}" ]] && [[ -f "$CLAUDE_ENV_FILE" ]]; then
  # Remove any existing CLAUDE_SESSION_ID export lines (portable macOS/Linux)
  if grep -q '^export CLAUDE_SESSION_ID=' "$CLAUDE_ENV_FILE" 2>/dev/null; then
    # Use mktemp for atomic temp file (prevents race conditions)
    ENV_TEMP_FILE=$(mktemp "${CLAUDE_ENV_FILE}.XXXXXX") || {
      debug_log "WARNING: Failed to create temp file for env cleanup"
      ENV_TEMP_FILE=""
    }
    if [[ -n "$ENV_TEMP_FILE" ]]; then
      # Trap ensures cleanup on interrupt/exit
      trap "rm -f \"$ENV_TEMP_FILE\" 2>/dev/null || true" EXIT
      if grep -v '^export CLAUDE_SESSION_ID=' "$CLAUDE_ENV_FILE" > "$ENV_TEMP_FILE" 2>/dev/null; then
        mv "$ENV_TEMP_FILE" "$CLAUDE_ENV_FILE"
        debug_log "Cleared CLAUDE_SESSION_ID from env file"
      else
        rm -f "$ENV_TEMP_FILE" 2>/dev/null || true
        debug_log "WARNING: Failed to clear CLAUDE_SESSION_ID from env file"
      fi
      trap - EXIT  # Clear trap after successful operation
    fi
  fi
fi

# Clean up PPID-based session file
# This file was created by session-start-hook to track session ID per Claude Code process
if [[ "$PPID" =~ ^[0-9]+$ ]]; then
  SESSION_FILE="$SESSIONS_DIR/ppid_$PPID.id"
  if [[ -f "$SESSION_FILE" ]]; then
    rm -f "$SESSION_FILE"
    debug_log "Cleaned up PPID session file: $SESSION_FILE"
  fi
else
  debug_log "WARNING: PPID is not numeric: $PPID - skipping session file cleanup"
fi

# Direct state file lookup
STATE_FILE="$LOOPS_DIR/ralph-loop.${SESSION_ID}.local.md"
debug_log "State file path: $STATE_FILE"

if [[ ! -f "$STATE_FILE" ]]; then
  # No active loop for this session - env cleanup done, exit
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
