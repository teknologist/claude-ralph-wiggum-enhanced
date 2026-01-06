#!/bin/bash

# Ralph Wiggum Stop Hook
# Prevents session exit when a ralph-loop is active for THIS session
# Feeds Claude's output back as input to continue the loop
# State file: ~/.claude/ralph-wiggum-pro/loops/ralph-loop.{session_id}.local.md

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Global paths
RALPH_BASE_DIR="$HOME/.claude/ralph-wiggum-pro"
LOOPS_DIR="$RALPH_BASE_DIR/loops"
LOGS_DIR="$RALPH_BASE_DIR/logs"
TRANSCRIPTS_DIR="$RALPH_BASE_DIR/transcripts"
DEBUG_LOG="$LOGS_DIR/debug.log"

# Ensure directories exist
mkdir -p "$LOOPS_DIR" "$LOGS_DIR" "$TRANSCRIPTS_DIR"

# Maximum debug log size (1MB)
MAX_DEBUG_LOG_SIZE=1048576

# Rotate debug log if it exceeds maximum size
rotate_debug_log_if_needed() {
  if [[ -f "$DEBUG_LOG" ]]; then
    local size
    size=$(stat -f%z "$DEBUG_LOG" 2>/dev/null || stat -c%s "$DEBUG_LOG" 2>/dev/null || { wc -c < "$DEBUG_LOG" 2>/dev/null; } || echo "0")
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
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] stop-hook: $msg" >> "$DEBUG_LOG"
}

# Log session helper function - logs errors instead of suppressing them
log_session() {
  local outcome="$1"
  local error_reason="${2:-}"
  if ! "$PLUGIN_ROOT/scripts/log-session.sh" "$RALPH_STATE_FILE" "$outcome" "$error_reason" 2>>"$DEBUG_LOG"; then
    debug_log "log_session FAILED: outcome=$outcome file=$RALPH_STATE_FILE"
  fi
}

# Basic sanity check for loop_id (only checks for obvious issues)
# loop_id is internally generated, not user input, so we don't need aggressive validation
sanity_check_loop_id() {
  local loop_id="$1"
  # Just check for empty and obvious path traversal
  if [[ -z "$loop_id" ]]; then
    debug_log "ERROR: loop_id is empty"
    return 1
  fi
  if [[ "$loop_id" == *".."* ]]; then
    debug_log "ERROR: loop_id contains path traversal sequence: $loop_id"
    return 1
  fi
  return 0
}

# Log iteration to transcript file
# Naming: {session_id}-{loop_id}-iterations.jsonl
log_iteration() {
  local session_id="$1"
  local loop_id="$2"
  local iteration="$3"
  local output="$4"

  # Basic sanity check only (loop_id is internally generated)
  if ! sanity_check_loop_id "$loop_id"; then
    return 1
  fi

  mkdir -p "$TRANSCRIPTS_DIR" 2>/dev/null || return 1

  local iterations_file="$TRANSCRIPTS_DIR/${session_id}-${loop_id}-iterations.jsonl"
  if ! jq -n -c \
    --argjson iteration "$iteration" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg output "$output" \
    '{iteration: $iteration, timestamp: $timestamp, output: $output}' \
    >> "$iterations_file" 2>>"$DEBUG_LOG"; then
    debug_log "WARNING: Failed to log iteration $iteration for loop $loop_id"
    return 1
  fi
  return 0
}

# Copy full transcript on completion
# Naming: {session_id}-{loop_id}-full.jsonl
copy_full_transcript() {
  local session_id="$1"
  local loop_id="$2"
  local transcript_path="$3"

  # Basic sanity check only (loop_id is internally generated)
  if ! sanity_check_loop_id "$loop_id"; then
    return 1
  fi

  mkdir -p "$TRANSCRIPTS_DIR" 2>/dev/null || return 1

  if [[ -f "$transcript_path" ]]; then
    local target_file="$TRANSCRIPTS_DIR/${session_id}-${loop_id}-full.jsonl"
    if ! cp "$transcript_path" "$target_file" 2>>"$DEBUG_LOG"; then
      debug_log "WARNING: Failed to copy full transcript to $target_file"
      return 1
    fi
    debug_log "Copied full transcript to $target_file"
  else
    debug_log "WARNING: Transcript file not found: $transcript_path"
    return 1
  fi
  return 0
}

# Read hook input from stdin (advanced stop hook API)
HOOK_INPUT=$(cat)

# Extract session ID and stop_hook_active from hook input
CURRENT_SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')
STOP_HOOK_ACTIVE=$(echo "$HOOK_INPUT" | jq -r '.stop_hook_active // false')

# Debug: Log session IDs and context
debug_log "=== STOP HOOK INVOKED ==="
debug_log "hook_input_session_id=$CURRENT_SESSION_ID"
debug_log "stop_hook_active=$STOP_HOOK_ACTIVE"
debug_log "CLAUDE_SESSION_ID_env=${CLAUDE_SESSION_ID:-not_set}"

# Check stop_hook_active to prevent infinite loops (per Claude Code docs)
# If Claude is already continuing due to a previous stop hook, allow exit
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  debug_log "EXIT: stop_hook_active=true - preventing infinite loop"
  exit 0
fi

if [[ -z "$CURRENT_SESSION_ID" ]]; then
  # No session ID available - allow exit (shouldn't happen)
  debug_log "EXIT: No session_id in hook input"
  exit 0
fi

# Security: Validate session ID format to prevent path traversal
if [[ ! "$CURRENT_SESSION_ID" =~ ^[a-zA-Z0-9._-]+$ ]] || [[ "$CURRENT_SESSION_ID" == *".."* ]]; then
  debug_log "EXIT: Invalid session_id format (security check): $CURRENT_SESSION_ID"
  exit 0
fi

# Direct state file lookup (no searching, no fallbacks)
# State file path: ~/.claude/ralph-wiggum-pro/loops/ralph-loop.{session_id}.local.md
RALPH_STATE_FILE="$LOOPS_DIR/ralph-loop.${CURRENT_SESSION_ID}.local.md"
debug_log "State file path: $RALPH_STATE_FILE"

if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  # Try fallback: check if CLAUDE_SESSION_ID env var has a different session ID
  # This handles cases where hook input session_id doesn't match the state file
  FALLBACK_SESSION_ID="${CLAUDE_SESSION_ID:-}"
  if [[ -n "$FALLBACK_SESSION_ID" ]] && [[ "$FALLBACK_SESSION_ID" != "$CURRENT_SESSION_ID" ]]; then
    # Validate fallback session ID format (same security check)
    if [[ "$FALLBACK_SESSION_ID" =~ ^[a-zA-Z0-9._-]+$ ]] && [[ "$FALLBACK_SESSION_ID" != *".."* ]]; then
      FALLBACK_STATE_FILE="$LOOPS_DIR/ralph-loop.${FALLBACK_SESSION_ID}.local.md"
      debug_log "Trying fallback session ID from env: $FALLBACK_SESSION_ID"
      debug_log "Fallback state file path: $FALLBACK_STATE_FILE"
      if [[ -f "$FALLBACK_STATE_FILE" ]]; then
        debug_log "SUCCESS: Found state file via env fallback"
        RALPH_STATE_FILE="$FALLBACK_STATE_FILE"
        # Update session ID to match the state file we're using
        CURRENT_SESSION_ID="$FALLBACK_SESSION_ID"
      fi
    fi
  fi
fi

if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  # No active loop for this session (even after fallback) - allow exit
  debug_log "EXIT: No state file found for session_id=$CURRENT_SESSION_ID (fallback also failed)"
  exit 0
fi

debug_log "Using state file: $RALPH_STATE_FILE"

# Parse markdown frontmatter (YAML between ---) and extract values
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$RALPH_STATE_FILE")
# Extract fields with empty string default if not found (grep exits 1 when no match)
# The || echo "" ensures script continues with set -e, and empty values are validated below
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//' || echo "")
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//' || echo "")
# Extract completion_promise and strip surrounding quotes if present
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
# Strip any remaining literal quotes (handles edge cases from $ARGUMENTS expansion)
COMPLETION_PROMISE="${COMPLETION_PROMISE#\"}"
COMPLETION_PROMISE="${COMPLETION_PROMISE%\"}"
COMPLETION_PROMISE="${COMPLETION_PROMISE#\'}"
COMPLETION_PROMISE="${COMPLETION_PROMISE%\'}"

# Extract loop_id and session_id for transcript logging
LOOP_ID=$(echo "$FRONTMATTER" | grep '^loop_id:' | sed 's/loop_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
SESSION_ID=$(echo "$FRONTMATTER" | grep '^session_id:' | sed 's/session_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
debug_log "loop_id=$LOOP_ID session_id=$SESSION_ID"

# Validate numeric fields before arithmetic operations
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "Ralph loop: State file corrupted" >&2
  echo "   File: $RALPH_STATE_FILE" >&2
  echo "   Problem: 'iteration' field is not a valid number (got: '$ITERATION')" >&2
  echo "" >&2
  echo "   This usually means the state file was manually edited or corrupted." >&2
  echo "   Ralph loop is stopping. Run /ralph-loop again to start fresh." >&2
  log_session "error" "Invalid iteration field: $ITERATION"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "Ralph loop: State file corrupted" >&2
  echo "   File: $RALPH_STATE_FILE" >&2
  echo "   Problem: 'max_iterations' field is not a valid number (got: '$MAX_ITERATIONS')" >&2
  echo "" >&2
  echo "   This usually means the state file was manually edited or corrupted." >&2
  echo "   Ralph loop is stopping. Run /ralph-loop again to start fresh." >&2
  log_session "error" "Invalid max_iterations field: $MAX_ITERATIONS"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Get transcript path from hook input (needed for max iterations check and later)
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

# Check if max iterations reached
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "Ralph loop: Max iterations ($MAX_ITERATIONS) reached."
  log_session "max_iterations"
  # Copy full transcript before removing state file
  [[ -n "$LOOP_ID" ]] && [[ -n "$SESSION_ID" ]] && copy_full_transcript "$SESSION_ID" "$LOOP_ID" "$TRANSCRIPT_PATH"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

if [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "Ralph loop: Transcript file not found" >&2
  echo "   Expected: $TRANSCRIPT_PATH" >&2
  echo "   This is unusual and may indicate a Claude Code internal issue." >&2
  echo "   Ralph loop is stopping." >&2
  log_session "error" "Transcript file not found"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Read last assistant message from transcript (JSONL format - one JSON per line)
# First check if there are any assistant messages
if ! grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  echo "Ralph loop: No assistant messages found in transcript" >&2
  echo "   Transcript: $TRANSCRIPT_PATH" >&2
  echo "   This is unusual and may indicate a transcript format issue" >&2
  echo "   Ralph loop is stopping." >&2
  log_session "error" "No assistant messages in transcript"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Extract last assistant message with explicit error handling
LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
if [[ -z "$LAST_LINE" ]]; then
  echo "Ralph loop: Failed to extract last assistant message" >&2
  echo "   Ralph loop is stopping." >&2
  log_session "error" "Failed to extract last assistant message"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Parse JSON with error handling
LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
  .message.content |
  map(select(.type == "text")) |
  map(.text) |
  join("\n")
' 2>&1)

# Check if jq succeeded
if [[ $? -ne 0 ]]; then
  echo "Ralph loop: Failed to parse assistant message JSON" >&2
  echo "   Error: $LAST_OUTPUT" >&2
  echo "   This may indicate a transcript format issue" >&2
  echo "   Ralph loop is stopping." >&2
  log_session "error" "Failed to parse assistant message JSON"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

if [[ -z "$LAST_OUTPUT" ]]; then
  echo "Ralph loop: Assistant message contained no text content" >&2
  echo "   Ralph loop is stopping." >&2
  log_session "error" "Assistant message contained no text content"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Check for completion promise (only if set)
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  # IMPORTANT: Check ALL assistant messages, not just the last one
  # This handles cases where Claude outputs the promise but then the final message
  # is a tool call with no text content
  # Using jq -s (slurp) to efficiently process all JSONL lines in one pass
  # Note: Transcript format is {"message":{"role":"assistant", "content":[...]}}
  # Role is inside message object, not at top level
  ALL_ASSISTANT_TEXT=$(jq -rs '
    [.[] | select(.message.role == "assistant") | .message.content[]? | select(.type == "text") | .text] | join("\n")
  ' "$TRANSCRIPT_PATH" 2>/dev/null || echo "")

  # Extract text from <promise> tags using Perl for multiline support
  # -0777 slurps entire input, s flag makes . match newlines
  # .*? is non-greedy (takes FIRST tag), whitespace normalized
  PROMISE_TEXT=$(echo "$ALL_ASSISTANT_TEXT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

  # Strip quotes from extracted promise text (for consistency with COMPLETION_PROMISE)
  PROMISE_TEXT="${PROMISE_TEXT//\"/}"
  PROMISE_TEXT="${PROMISE_TEXT//\'/}"

  # Use = for literal string comparison (not pattern matching)
  # == in [[ ]] does glob pattern matching which breaks with *, ?, [ characters
  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    debug_log "SUCCESS: Promise detected! promise_text='$PROMISE_TEXT' expected='$COMPLETION_PROMISE'"
    echo "Ralph loop: Detected <promise>$COMPLETION_PROMISE</promise>"
    # Log final iteration before success
    [[ -n "$LOOP_ID" ]] && [[ -n "$SESSION_ID" ]] && log_iteration "$SESSION_ID" "$LOOP_ID" "$ITERATION" "$LAST_OUTPUT"
    log_session "success"
    # Copy full transcript before removing state file
    [[ -n "$LOOP_ID" ]] && [[ -n "$SESSION_ID" ]] && copy_full_transcript "$SESSION_ID" "$LOOP_ID" "$TRANSCRIPT_PATH"
    rm "$RALPH_STATE_FILE"
    debug_log "State file deleted: $RALPH_STATE_FILE"
    exit 0
  fi
fi

# Not complete - continue loop with SAME PROMPT
NEXT_ITERATION=$((ITERATION + 1))

# Calculate elapsed time
STARTED_AT=$(echo "$FRONTMATTER" | grep '^started_at:' | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
ELAPSED_STR="unknown"
if [[ -n "$STARTED_AT" ]]; then
  # Try macOS date format first, then Linux
  START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" "+%s" 2>/dev/null || date -d "$STARTED_AT" "+%s" 2>/dev/null || echo "")
  if [[ -n "$START_EPOCH" ]]; then
    NOW_EPOCH=$(date "+%s")
    ELAPSED_SECS=$((NOW_EPOCH - START_EPOCH))
    ELAPSED_HOURS=$((ELAPSED_SECS / 3600))
    ELAPSED_MINS=$(((ELAPSED_SECS % 3600) / 60))
    ELAPSED_SEC=$((ELAPSED_SECS % 60))
    if [[ $ELAPSED_HOURS -gt 0 ]]; then
      ELAPSED_STR="${ELAPSED_HOURS}h ${ELAPSED_MINS}m"
    else
      ELAPSED_STR="${ELAPSED_MINS}m ${ELAPSED_SEC}s"
    fi
  fi
fi

# Extract prompt (everything after the closing ---)
# Skip first --- line, skip until second --- line, then print everything after
# Use i>=2 instead of i==2 to handle --- in prompt content
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$RALPH_STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "Ralph loop: State file corrupted or incomplete" >&2
  echo "   File: $RALPH_STATE_FILE" >&2
  echo "   Problem: No prompt text found" >&2
  echo "" >&2
  echo "   This usually means:" >&2
  echo "     - State file was manually edited" >&2
  echo "     - File was corrupted during writing" >&2
  echo "" >&2
  echo "   Ralph loop is stopping. Run /ralph-loop again to start fresh." >&2
  log_session "error" "No prompt text found in state file"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Update iteration in frontmatter (portable across macOS and Linux)
# Create temp file securely with mktemp, then atomically replace
TEMP_FILE=$(mktemp "${RALPH_STATE_FILE}.tmp.XXXXXX") || exit 1
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$RALPH_STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$RALPH_STATE_FILE"

# Source checklist service for checklist operations
CHECKLIST_SERVICE="$PLUGIN_ROOT/scripts/checklist-service.sh"
if [[ -f "$CHECKLIST_SERVICE" ]]; then
  # shellcheck source=/dev/null
  source "$CHECKLIST_SERVICE"
fi

# Check if checklist exists for this loop
CHECKLIST_INSTRUCTION=""
if [[ -n "$LOOP_ID" ]] && declare -f checklist_exists > /dev/null && checklist_exists "$LOOP_ID"; then
  CHECKLIST_SUMMARY=$(checklist_summary "$LOOP_ID" 2>/dev/null || echo "")
  CHECKLIST_INSTRUCTION="

CHECKLIST PROGRESS: $CHECKLIST_SUMMARY
To update checklist items:
  checklist_status \"$LOOP_ID\" \"<item_id>\" \"<status>\" [iteration]
  To add new items:
  checklist_add \"$LOOP_ID\" \"task|criteria\" \"<id>\" \"<text>\"

  Status values: pending | in_progress | completed"
fi

# Build system message with iteration count, elapsed time, completion promise, and checklist info
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="Ralph iteration $NEXT_ITERATION | Running for $ELAPSED_STR
TO COMPLETE: <promise>$COMPLETION_PROMISE</promise>
    (XML tags REQUIRED - do not output bare text)$CHECKLIST_INSTRUCTION"
else
  SYSTEM_MSG="Ralph iteration $NEXT_ITERATION | Running for $ELAPSED_STR | No completion promise - runs until max iterations$CHECKLIST_INSTRUCTION"
fi

# Log this iteration's output before continuing
[[ -n "$LOOP_ID" ]] && [[ -n "$SESSION_ID" ]] && log_iteration "$SESSION_ID" "$LOOP_ID" "$ITERATION" "$LAST_OUTPUT"

# Output JSON to block the stop and feed prompt back
# The "reason" field contains the prompt that will be sent back to Claude
debug_log "BLOCKING: iteration=$NEXT_ITERATION"
jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

# Exit 0 for successful hook execution
debug_log "Block JSON emitted, exiting"
exit 0
