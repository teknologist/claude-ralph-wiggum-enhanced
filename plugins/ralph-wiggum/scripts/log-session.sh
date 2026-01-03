#!/bin/bash

# Ralph Wiggum Session Logger
# Logs session data to ~/.claude/ralph-wiggum-logs/sessions.jsonl
#
# Usage (start entry - new):
#   log-session.sh --start --session-id ID --project PATH --task "TEXT" \
#                  --state-file PATH [--max-iterations N] [--completion-promise "TEXT"]
#
# Usage (completion entry - existing):
#   log-session.sh <state_file> <outcome> [error_reason]
#
# Log entry formats:
#   Start entry: session_id, status="active", project, project_name, state_file_path, task, started_at, max_iterations, completion_promise
#   Completion entry: session_id, status="completed", outcome, ended_at, duration_seconds, iterations

set -euo pipefail

# Check dependencies
if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed" >&2
  exit 1
fi

# Ensure log directory exists
LOG_DIR="$HOME/.claude/ralph-wiggum-logs"
LOG_FILE="$LOG_DIR/sessions.jsonl"
mkdir -p "$LOG_DIR"

# Detect mode based on first argument
if [[ "${1:-}" == "--start" ]]; then
  # === START ENTRY MODE ===
  shift

  SESSION_ID=""
  PROJECT_PATH=""
  TASK=""
  STATE_FILE_PATH=""
  MAX_ITERATIONS=0
  COMPLETION_PROMISE=""

  while [[ $# -gt 0 ]]; do
    case $1 in
      --session-id)
        SESSION_ID="$2"
        shift 2
        ;;
      --project)
        PROJECT_PATH="$2"
        shift 2
        ;;
      --task)
        TASK="$2"
        shift 2
        ;;
      --state-file)
        STATE_FILE_PATH="$2"
        shift 2
        ;;
      --max-iterations)
        MAX_ITERATIONS="$2"
        shift 2
        ;;
      --completion-promise)
        COMPLETION_PROMISE="$2"
        shift 2
        ;;
      *)
        echo "Unknown option for --start mode: $1" >&2
        exit 1
        ;;
    esac
  done

  # Validate required params
  if [[ -z "$SESSION_ID" ]] || [[ -z "$PROJECT_PATH" ]] || [[ -z "$TASK" ]] || [[ -z "$STATE_FILE_PATH" ]]; then
    echo "Usage: log-session.sh --start --session-id ID --project PATH --task TEXT --state-file PATH [--max-iterations N] [--completion-promise TEXT]" >&2
    exit 1
  fi

  # Get project name from path
  PROJECT_NAME=$(basename "$PROJECT_PATH")

  # Try to get project name from git remote if available
  if command -v git &>/dev/null; then
    pushd "$PROJECT_PATH" >/dev/null 2>&1 || true
    if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
      GIT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
      if [[ -n "$GIT_REMOTE" ]]; then
        PARSED_NAME=$(echo "$GIT_REMOTE" | sed -E 's/.*[\/:]([^\/]+)(\.git)?$/\1/' | sed 's/\.git$//')
        [[ -n "$PARSED_NAME" ]] && PROJECT_NAME="$PARSED_NAME"
      fi
    fi
    popd >/dev/null 2>&1 || true
  fi

  # Get current timestamp (UTC)
  STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Truncate task to 2000 chars
  TASK="${TASK:0:2000}"

  # Handle null/empty completion promise
  [[ -z "$COMPLETION_PROMISE" || "$COMPLETION_PROMISE" == "null" ]] && COMPLETION_PROMISE=""

  # Build JSON log entry
  TEMP_ENTRY=$(mktemp)
  trap "rm -f '$TEMP_ENTRY'" EXIT

  jq -n -c \
    --arg session_id "$SESSION_ID" \
    --arg status "active" \
    --arg project "$PROJECT_PATH" \
    --arg project_name "$PROJECT_NAME" \
    --arg state_file_path "$STATE_FILE_PATH" \
    --arg task "$TASK" \
    --arg started_at "$STARTED_AT" \
    --argjson max_iterations "$MAX_ITERATIONS" \
    --arg completion_promise "$COMPLETION_PROMISE" \
    '{
      session_id: $session_id,
      status: $status,
      project: $project,
      project_name: $project_name,
      state_file_path: $state_file_path,
      task: $task,
      started_at: $started_at,
      max_iterations: $max_iterations,
      completion_promise: (if $completion_promise == "" then null else $completion_promise end)
    }' > "$TEMP_ENTRY"

  echo "" >> "$TEMP_ENTRY"
  cat "$TEMP_ENTRY" >> "$LOG_FILE"

  echo "📝 Session started - logged to $LOG_FILE"

else
  # === COMPLETION ENTRY MODE (existing behavior) ===
  STATE_FILE="${1:-}"
  OUTCOME="${2:-}"
  ERROR_REASON="${3:-}"

  if [[ -z "$STATE_FILE" ]] || [[ -z "$OUTCOME" ]]; then
    echo "Usage: log-session.sh <state_file> <outcome> [error_reason]" >&2
    echo "   or: log-session.sh --start --session-id ID --project PATH --task TEXT --state-file PATH" >&2
    exit 1
  fi

  # Validate outcome
  case "$OUTCOME" in
    success|max_iterations|cancelled|error) ;;
    *)
      echo "Invalid outcome: $OUTCOME (must be: success, max_iterations, cancelled, error)" >&2
      exit 1
      ;;
  esac

  # Check if state file exists
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "State file not found: $STATE_FILE" >&2
    exit 1
  fi

  # Parse markdown frontmatter (YAML between ---) and extract values
  FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")

  SESSION_ID=$(echo "$FRONTMATTER" | grep '^session_id:' | sed 's/session_id: *//' | sed 's/^"\(.*\)"$/\1/')
  ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
  STARTED_AT=$(echo "$FRONTMATTER" | grep '^started_at:' | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/')

  # Get current timestamp for ended_at (UTC)
  ENDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  # Calculate duration in seconds
  DURATION_SECONDS=0
  if [[ -n "$STARTED_AT" ]]; then
    START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" "+%s" 2>/dev/null || date -d "$STARTED_AT" "+%s" 2>/dev/null || echo "")
    if [[ -n "$START_EPOCH" ]]; then
      END_EPOCH=$(date -u "+%s")
      DURATION_SECONDS=$((END_EPOCH - START_EPOCH))
    fi
  fi

  # Handle null/empty values for JSON
  [[ -z "$ERROR_REASON" ]] && ERROR_REASON=""

  # Build JSON log entry
  TEMP_ENTRY=$(mktemp)
  trap "rm -f '$TEMP_ENTRY'" EXIT

  jq -n -c \
    --arg session_id "$SESSION_ID" \
    --arg status "completed" \
    --arg outcome "$OUTCOME" \
    --arg ended_at "$ENDED_AT" \
    --argjson duration_seconds "$DURATION_SECONDS" \
    --argjson iterations "${ITERATION:-0}" \
    --arg error_reason "$ERROR_REASON" \
    '{
      session_id: $session_id,
      status: $status,
      outcome: $outcome,
      ended_at: $ended_at,
      duration_seconds: $duration_seconds,
      iterations: $iterations,
      error_reason: (if $error_reason == "" then null else $error_reason end)
    }' > "$TEMP_ENTRY"

  echo "" >> "$TEMP_ENTRY"
  cat "$TEMP_ENTRY" >> "$LOG_FILE"

  echo "📝 Session completed - logged to $LOG_FILE"
fi
