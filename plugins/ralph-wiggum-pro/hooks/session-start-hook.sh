#!/bin/bash

# Ralph Wiggum Session Start Hook
# Persists session ID as environment variable for session-bound loops

set -euo pipefail

# Global paths for debug logging and session tracking
RALPH_BASE_DIR="$HOME/.claude/ralph-wiggum-pro"
LOGS_DIR="$RALPH_BASE_DIR/logs"
SESSIONS_DIR="$RALPH_BASE_DIR/sessions"
DEBUG_LOG="$LOGS_DIR/debug.log"

# Ensure directories exist
mkdir -p "$LOGS_DIR" "$SESSIONS_DIR"

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
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] session-start-hook: $msg" >> "$DEBUG_LOG"
}

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract session ID
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

debug_log "=== SESSION START HOOK INVOKED ==="
debug_log "session_id=$SESSION_ID"
debug_log "CLAUDE_ENV_FILE=${CLAUDE_ENV_FILE:-not_set}"

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
# IMPORTANT: Replace (not append) to prevent stale values after /clear
if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  # Remove old CLAUDE_SESSION_ID if exists, then add new one (portable macOS/Linux)
  if [[ -f "$CLAUDE_ENV_FILE" ]] && grep -q '^export CLAUDE_SESSION_ID=' "$CLAUDE_ENV_FILE" 2>/dev/null; then
    # Use mktemp for atomic temp file (prevents race conditions)
    ENV_TEMP_FILE=$(mktemp "${CLAUDE_ENV_FILE}.XXXXXX") || {
      debug_log "WARNING: Failed to create temp file for env update"
      ENV_TEMP_FILE=""
    }
    if [[ -n "$ENV_TEMP_FILE" ]]; then
      # Trap ensures cleanup on interrupt/exit
      trap "rm -f \"$ENV_TEMP_FILE\" 2>/dev/null || true" EXIT
      if grep -v '^export CLAUDE_SESSION_ID=' "$CLAUDE_ENV_FILE" > "$ENV_TEMP_FILE" 2>/dev/null; then
        mv "$ENV_TEMP_FILE" "$CLAUDE_ENV_FILE"
        debug_log "Removed old CLAUDE_SESSION_ID from env file"
      else
        rm -f "$ENV_TEMP_FILE" 2>/dev/null || true
        debug_log "WARNING: Failed to remove old CLAUDE_SESSION_ID from env file"
      fi
      trap - EXIT  # Clear trap after successful operation
    fi
  fi
  echo "export CLAUDE_SESSION_ID=\"$SESSION_ID\"" >> "$CLAUDE_ENV_FILE"
  debug_log "Set CLAUDE_SESSION_ID=$SESSION_ID in env file"
fi

# Clean up stale PID files from dead processes
# This is more reliable than session-end-hook since processes can crash/kill -9
cleanup_stale_pid_files() {
  local max_files=100  # Limit cleanup scope
  local count=0
  for file in "$SESSIONS_DIR"/ppid_*.id; do
    [[ -f "$file" ]] || continue
    ((count++))
    [[ $count -gt $max_files ]] && break

    local pid="${file##*/ppid_}"
    pid="${pid%.id}"
    [[ "$pid" =~ ^[0-9]+$ ]] || continue

    # Check if process is still running
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$file" 2>/dev/null && debug_log "Cleaned up stale PID file: $file"
    fi
  done
}

# Proactively clean up stale PID files
cleanup_stale_pid_files

# Write session ID to PPID-based file for cross-hook/command communication
# This allows setup-ralph-loop.sh to get the correct session ID after /clear
# PPID identifies the Claude Code process that spawned this hook
if [[ ! "$PPID" =~ ^[0-9]+$ ]]; then
  debug_log "WARNING: PPID is not numeric: $PPID - skipping session file creation"
else
  SESSION_FILE="$SESSIONS_DIR/ppid_$PPID.id"
  # Use atomic write (temp file + mv) to prevent partial reads
  TEMP_SESSION_FILE=$(mktemp "${SESSION_FILE}.XXXXXX") || {
    debug_log "WARNING: Failed to create temp file for session ID"
    exit 0
  }
  echo "$SESSION_ID" > "$TEMP_SESSION_FILE"
  mv "$TEMP_SESSION_FILE" "$SESSION_FILE"
  debug_log "Wrote session ID to PPID file: $SESSION_FILE"
fi

exit 0
