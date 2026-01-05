#!/bin/bash

# Ralph Wiggum Stop Hook
# Prevents session exit when a ralph-loop is active for THIS session
# Feeds Claude's output back as input to continue the loop

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Debug logging helper
DEBUG_LOG="$HOME/.claude/ralph-wiggum-pro-logs/debug.log"
debug_log() {
  local msg="$1"
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

# Transcript directory for storing iteration logs and full transcripts
TRANSCRIPT_DIR="$HOME/.claude/ralph-wiggum-pro-logs/transcripts"

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
log_iteration() {
  local loop_id="$1"
  local iteration="$2"
  local output="$3"

  # Basic sanity check only (loop_id is internally generated)
  if ! sanity_check_loop_id "$loop_id"; then
    return 1
  fi

  mkdir -p "$TRANSCRIPT_DIR" 2>/dev/null || return 1

  local iterations_file="$TRANSCRIPT_DIR/${loop_id}-iterations.jsonl"
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
copy_full_transcript() {
  local loop_id="$1"
  local transcript_path="$2"

  # Basic sanity check only (loop_id is internally generated)
  if ! sanity_check_loop_id "$loop_id"; then
    return 1
  fi

  mkdir -p "$TRANSCRIPT_DIR" 2>/dev/null || return 1

  if [[ -f "$transcript_path" ]]; then
    local target_file="$TRANSCRIPT_DIR/${loop_id}-full.jsonl"
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

# Extract session ID from hook input
CURRENT_SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty')

# Debug: Log session IDs and context
debug_log "=== STOP HOOK INVOKED ==="
debug_log "hook_input_session_id=$CURRENT_SESSION_ID"
debug_log "CLAUDE_SESSION_ID_env=${CLAUDE_SESSION_ID:-not_set}"
debug_log "cwd=$(pwd)"

if [[ -z "$CURRENT_SESSION_ID" ]]; then
  # No session ID available - allow exit (shouldn't happen)
  debug_log "EXIT: No session_id in hook input"
  exit 0
fi

# Validate session ID format to prevent path traversal attacks
# Allow UUIDs, alphanumeric with hyphens/underscores/dots (but not .. for path traversal)
if [[ ! "$CURRENT_SESSION_ID" =~ ^[a-zA-Z0-9._-]+$ ]] || [[ "$CURRENT_SESSION_ID" == *".."* ]]; then
  echo "⚠️  Ralph loop: Invalid session ID format (security check)" >&2
  echo "   Session ID contains unsafe characters: $CURRENT_SESSION_ID" >&2
  exit 0
fi

# Function to find state file path from session log
find_state_file_from_log() {
  local session_id="$1"
  local log_file="$HOME/.claude/ralph-wiggum-pro-logs/sessions.jsonl"

  [[ -f "$log_file" ]] || return 1

  # Find most recent entry for this session with state_file_path
  # Use jq to extract state_file_path from the matching entry
  # Filter out empty lines first to prevent jq errors on malformed JSONL
  # Note: || true prevents grep from exiting with 1 when no matches (due to set -e)
  # Empty state_path is handled by validation below
  local state_path
  state_path=$( (grep -v '^[[:space:]]*$' "$log_file" || true) | jq -rs --arg sid "$session_id" \
    'map(select(.session_id == $sid and .state_file_path)) | .[].state_file_path' \
    | tail -n 1)

  # Validate the returned path for security (prevent path traversal)
  # - Must be absolute path (starts with /)
  # - Must not contain .. sequences
  # - Must end with .local.md extension
  if [[ -z "$state_path" ]] || [[ "$state_path" == *".."* ]] || [[ ! "$state_path" =~ ^/.*\.local\.md$ ]]; then
    return 1
  fi

  [[ -f "$state_path" ]] || return 1
  echo "$state_path"
  return 0
}

# Find state file for THIS session
# First try: Query log file for absolute path (works from any directory)
RALPH_STATE_FILE=""
RALPH_STATE_FILE=$(find_state_file_from_log "$CURRENT_SESSION_ID" || echo "")
debug_log "find_state_file_from_log result: '${RALPH_STATE_FILE:-empty}'"

# Fallback: Use relative glob (for backward compatibility)
if [[ -z "$RALPH_STATE_FILE" ]]; then
  debug_log "Trying fallback glob in .claude/"
  for STATE_FILE in .claude/ralph-loop.*.local.md; do
    [[ -f "$STATE_FILE" ]] || continue
    # Check if this state file belongs to current session
    # Using grep + sed for cross-platform compatibility (BSD/GNU)
    FILE_SESSION_ID=$(grep '^session_id:' "$STATE_FILE" 2>/dev/null | head -1 | sed 's/session_id: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/' || echo "")
    debug_log "Checking $STATE_FILE: file_session_id=$FILE_SESSION_ID vs current=$CURRENT_SESSION_ID"
    if [[ "$FILE_SESSION_ID" == "$CURRENT_SESSION_ID" ]]; then
      RALPH_STATE_FILE="$STATE_FILE"
      debug_log "Matched! Using $STATE_FILE"
      break
    fi
  done
fi

if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  # No active loop for this session - allow exit
  # May happen if session was cancelled from dashboard or state file was manually deleted
  debug_log "EXIT: No state file found for session_id=$CURRENT_SESSION_ID"
  # List state files in .claude for debugging
  debug_log "State files in .claude/: $(ls .claude/ralph-loop.*.local.md 2>/dev/null | tr '\n' ' ' || echo 'none')"
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

# Extract loop_id for transcript logging
LOOP_ID=$(echo "$FRONTMATTER" | grep '^loop_id:' | sed 's/loop_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
debug_log "loop_id=$LOOP_ID"

# Validate numeric fields before arithmetic operations
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Ralph loop: State file corrupted" >&2
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
  echo "⚠️  Ralph loop: State file corrupted" >&2
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
  echo "🛑 Ralph loop: Max iterations ($MAX_ITERATIONS) reached."
  log_session "max_iterations"
  # Copy full transcript before removing state file
  [[ -n "$LOOP_ID" ]] && copy_full_transcript "$LOOP_ID" "$TRANSCRIPT_PATH"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

if [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "⚠️  Ralph loop: Transcript file not found" >&2
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
  echo "⚠️  Ralph loop: No assistant messages found in transcript" >&2
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
  echo "⚠️  Ralph loop: Failed to extract last assistant message" >&2
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
  echo "⚠️  Ralph loop: Failed to parse assistant message JSON" >&2
  echo "   Error: $LAST_OUTPUT" >&2
  echo "   This may indicate a transcript format issue" >&2
  echo "   Ralph loop is stopping." >&2
  log_session "error" "Failed to parse assistant message JSON"
  rm "$RALPH_STATE_FILE"
  exit 0
fi

if [[ -z "$LAST_OUTPUT" ]]; then
  echo "⚠️  Ralph loop: Assistant message contained no text content" >&2
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
    echo "✅ Ralph loop: Detected <promise>$COMPLETION_PROMISE</promise>"
    # Log final iteration before success
    [[ -n "$LOOP_ID" ]] && log_iteration "$LOOP_ID" "$ITERATION" "$LAST_OUTPUT"
    log_session "success"
    # Copy full transcript before removing state file
    [[ -n "$LOOP_ID" ]] && copy_full_transcript "$LOOP_ID" "$TRANSCRIPT_PATH"
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
  echo "⚠️  Ralph loop: State file corrupted or incomplete" >&2
  echo "   File: $RALPH_STATE_FILE" >&2
  echo "   Problem: No prompt text found" >&2
  echo "" >&2
  echo "   This usually means:" >&2
  echo "     • State file was manually edited" >&2
  echo "     • File was corrupted during writing" >&2
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

📋 CHECKLIST PROGRESS: $CHECKLIST_SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To update checklist items:
  checklist_status \"$LOOP_ID\" \"<item_id>\" \"<status>\" [iteration]
  To add new items:
  checklist_add \"$LOOP_ID\" \"task|criteria\" \"<id>\" \"<text>\"

  Status values: pending | in_progress | completed"
fi

# Build system message with iteration count, elapsed time, completion promise, and checklist info
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION | Running for $ELAPSED_STR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  TO COMPLETE: <promise>$COMPLETION_PROMISE</promise>
    (XML tags REQUIRED - do not output bare text)$CHECKLIST_INSTRUCTION"
else
  SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION | Running for $ELAPSED_STR | No completion promise - runs until max iterations$CHECKLIST_INSTRUCTION"
fi

# Log this iteration's output before continuing
[[ -n "$LOOP_ID" ]] && log_iteration "$LOOP_ID" "$ITERATION" "$LAST_OUTPUT"

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
