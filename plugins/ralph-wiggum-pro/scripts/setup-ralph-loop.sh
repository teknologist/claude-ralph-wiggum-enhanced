#!/bin/bash

# Ralph Loop Setup Script
# Creates session-specific state file for in-session Ralph loop
# State file: ~/.claude/ralph-wiggum-pro/loops/ralph-loop.{session_id}.local.md

set -euo pipefail

# Global paths for debug logging
RALPH_BASE_DIR="$HOME/.claude/ralph-wiggum-pro"
LOGS_DIR="$RALPH_BASE_DIR/logs"
DEBUG_LOG="$LOGS_DIR/debug.log"

# Ensure log directory exists
mkdir -p "$LOGS_DIR"

# Maximum debug log size (1MB)
MAX_DEBUG_LOG_SIZE=1048576

# Rotate debug log if it exceeds maximum size
rotate_debug_log_if_needed() {
  if [[ -f "$DEBUG_LOG" ]]; then
    local size
    size=$(stat -f%z "$DEBUG_LOG" 2>/dev/null || stat -c%s "$DEBUG_LOG" 2>/dev/null || { wc -c < "$DEBUG_LOG" 2>/dev/null; } || echo "0")
    if [[ "$size" -gt "$MAX_DEBUG_LOG_SIZE" ]]; then
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
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] setup-ralph-loop: $msg" >> "$DEBUG_LOG"
}

# Parse arguments
PROMPT_PARTS=()
MAX_ITERATIONS=0
COMPLETION_PROMISE="null"
PROMPT_FILE=""
FORCE_FLAG=false

# Save original arguments for fallback detection (handles multi-line input edge cases)
ORIGINAL_ARGS="$*"

# Parse options and positional arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
Ralph Loop - Interactive self-referential development loop

USAGE:
  /ralph-loop [PROMPT...] [OPTIONS]
  /ralph-loop --prompt-file <file> [OPTIONS]

ARGUMENTS:
  PROMPT...    Initial prompt to start the loop (can be multiple words without quotes)

OPTIONS:
  --prompt-file <file>           Read prompt from markdown file instead of inline
  --max-iterations <n>           Maximum iterations before auto-stop (default: unlimited)
  --completion-promise '<text>'  Promise phrase (USE QUOTES for multi-word)
  --force                        Auto-cancel existing loop in this session and start fresh
  -h, --help                     Show this help message

DESCRIPTION:
  Starts a Ralph Wiggum loop in your CURRENT session. The stop hook prevents
  exit and feeds your output back as input until completion or iteration limit.

  Each session gets its own loop - multiple terminals can run different loops
  on the same project simultaneously.

  To signal completion, you must output: <promise>YOUR_PHRASE</promise>

  Use this for:
  - Interactive iteration where you want to see progress
  - Tasks requiring self-correction and refinement
  - Learning how Ralph works

EXAMPLES:
  /ralph-loop Build a todo API --completion-promise 'DONE' --max-iterations 20
  /ralph-loop --prompt-file ./tasks/api-task.md --max-iterations 50
  /ralph-loop --max-iterations 10 Fix the auth bug
  /ralph-loop Refactor cache layer  (runs forever)
  /ralph-loop "New task" --force  (auto-cancel existing loop)

STOPPING:
  Only by reaching --max-iterations or detecting --completion-promise
  No manual stop - Ralph runs infinitely by default!

MONITORING:
  # List all active loops:
  /list-ralph-loops

  # View your session's state (replace <session_id> with your actual session ID):
  cat ~/.claude/ralph-wiggum-pro/loops/ralph-loop.<session_id>.local.md
HELP_EOF
      exit 0
      ;;
    --force|-f)
      FORCE_FLAG=true
      shift
      ;;
    --prompt-file)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --prompt-file requires a file path" >&2
        echo "" >&2
        echo "   Valid examples:" >&2
        echo "     --prompt-file ./tasks/my-task.md" >&2
        echo "     --prompt-file prompts/api-build.md" >&2
        exit 1
      fi
      if [[ ! -f "$2" ]]; then
        echo "Error: Prompt file not found: $2" >&2
        exit 1
      fi
      PROMPT_FILE="$2"
      shift 2
      ;;
    --max-iterations=*)
      # Handle --max-iterations=VALUE format
      MAX_ITERATIONS="${1#--max-iterations=}"
      if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
        echo "Error: --max-iterations must be a positive integer or 0, got: $MAX_ITERATIONS" >&2
        exit 1
      fi
      shift
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --max-iterations requires a number argument" >&2
        echo "" >&2
        echo "   Valid examples:" >&2
        echo "     --max-iterations 10" >&2
        echo "     --max-iterations 50" >&2
        echo "     --max-iterations 0  (unlimited)" >&2
        echo "" >&2
        echo "   You provided: --max-iterations (with no number)" >&2
        exit 1
      fi
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "Error: --max-iterations must be a positive integer or 0, got: $2" >&2
        echo "" >&2
        echo "   Valid examples:" >&2
        echo "     --max-iterations 10" >&2
        echo "     --max-iterations 50" >&2
        echo "     --max-iterations 0  (unlimited)" >&2
        echo "" >&2
        echo "   Invalid: decimals (10.5), negative numbers (-5), text" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-promise=*)
      # Handle --completion-promise=VALUE format
      COMPLETION_PROMISE="${1#--completion-promise=}"
      # Remove surrounding quotes if present
      COMPLETION_PROMISE="${COMPLETION_PROMISE#\"}"
      COMPLETION_PROMISE="${COMPLETION_PROMISE%\"}"
      COMPLETION_PROMISE="${COMPLETION_PROMISE#\'}"
      COMPLETION_PROMISE="${COMPLETION_PROMISE%\'}"
      shift
      ;;
    --completion-promise)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --completion-promise requires a text argument" >&2
        echo "" >&2
        echo "   Valid examples:" >&2
        echo "     --completion-promise 'DONE'" >&2
        echo "     --completion-promise 'TASK COMPLETE'" >&2
        echo "     --completion-promise 'All tests passing'" >&2
        echo "" >&2
        echo "   You provided: --completion-promise (with no text)" >&2
        echo "" >&2
        echo "   Note: Multi-word promises must be quoted!" >&2
        exit 1
      fi
      COMPLETION_PROMISE="$2"
      # Remove surrounding quotes if present (handles literal quotes from $ARGUMENTS expansion)
      COMPLETION_PROMISE="${COMPLETION_PROMISE#\"}"
      COMPLETION_PROMISE="${COMPLETION_PROMISE%\"}"
      COMPLETION_PROMISE="${COMPLETION_PROMISE#\'}"
      COMPLETION_PROMISE="${COMPLETION_PROMISE%\'}"
      shift 2
      ;;
    *)
      # Non-option argument - collect all as prompt parts
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

# Join all prompt parts with spaces (for inline prompts)
# Handle empty array case (when only --prompt-file is used)
if [[ ${#PROMPT_PARTS[@]} -gt 0 ]]; then
  PROMPT="${PROMPT_PARTS[*]}"
else
  PROMPT=""
fi

# If --prompt-file was specified, read prompt from file
if [[ -n "$PROMPT_FILE" ]]; then
  PROMPT=$(cat "$PROMPT_FILE")
fi

# Validate prompt is non-empty
if [[ -z "$PROMPT" ]]; then
  echo "Error: No prompt provided" >&2
  echo "" >&2
  echo "   Ralph needs a task description to work on." >&2
  echo "" >&2
  echo "   Examples:" >&2
  echo "     /ralph-loop Build a REST API for todos" >&2
  echo "     /ralph-loop --prompt-file ./tasks/my-task.md" >&2
  echo "     /ralph-loop Fix the auth bug --max-iterations 20" >&2
  echo "" >&2
  echo "   For all options: /ralph-loop --help" >&2
  exit 1
fi

# Fallback: Extract options from original args if they weren't parsed
# This handles edge cases where multi-line input causes argument parsing issues
if [[ $MAX_ITERATIONS -eq 0 ]]; then
  # Try --max-iterations=VALUE format
  if [[ "$ORIGINAL_ARGS" =~ --max-iterations=([0-9]+) ]]; then
    MAX_ITERATIONS="${BASH_REMATCH[1]}"
  # Try --max-iterations VALUE format
  elif [[ "$ORIGINAL_ARGS" =~ --max-iterations[[:space:]]+([0-9]+) ]]; then
    MAX_ITERATIONS="${BASH_REMATCH[1]}"
  fi
fi

if [[ "$COMPLETION_PROMISE" == "null" ]]; then
  # Try --completion-promise="quoted value" format (double quotes, supports multi-word)
  if [[ "$ORIGINAL_ARGS" =~ --completion-promise=\"([^\"]+)\" ]]; then
    COMPLETION_PROMISE="${BASH_REMATCH[1]}"
  # Try --completion-promise='quoted value' format (single quotes, supports multi-word)
  elif [[ "$ORIGINAL_ARGS" =~ --completion-promise=\'([^\']+)\' ]]; then
    COMPLETION_PROMISE="${BASH_REMATCH[1]}"
  # Try --completion-promise=VALUE format (unquoted single word)
  elif [[ "$ORIGINAL_ARGS" =~ --completion-promise=([^[:space:]\"\']+) ]]; then
    COMPLETION_PROMISE="${BASH_REMATCH[1]}"
  # Try --completion-promise "quoted value" format (space + double quotes)
  elif [[ "$ORIGINAL_ARGS" =~ --completion-promise[[:space:]]+\"([^\"]+)\" ]]; then
    COMPLETION_PROMISE="${BASH_REMATCH[1]}"
  # Try --completion-promise 'quoted value' format (space + single quotes)
  elif [[ "$ORIGINAL_ARGS" =~ --completion-promise[[:space:]]+\'([^\']+)\' ]]; then
    COMPLETION_PROMISE="${BASH_REMATCH[1]}"
  # Try --completion-promise VALUE format (space + unquoted single word)
  elif [[ "$ORIGINAL_ARGS" =~ --completion-promise[[:space:]]+([^[:space:]\"\']+) ]]; then
    COMPLETION_PROMISE="${BASH_REMATCH[1]}"
  fi
  # Strip any remaining quotes from extracted value
  if [[ "$COMPLETION_PROMISE" != "null" ]]; then
    COMPLETION_PROMISE="${COMPLETION_PROMISE#\"}"
    COMPLETION_PROMISE="${COMPLETION_PROMISE%\"}"
    COMPLETION_PROMISE="${COMPLETION_PROMISE#\'}"
    COMPLETION_PROMISE="${COMPLETION_PROMISE%\'}"
  fi
fi

# Check for --force in original args
if [[ "$ORIGINAL_ARGS" =~ --force ]] || [[ "$ORIGINAL_ARGS" =~ -f[[:space:]] ]]; then
  FORCE_FLAG=true
fi

# Helper function to clean up whitespace in prompt text
# Normalizes multiple spaces to single space and strips leading/trailing whitespace
_cleanup_whitespace() {
  local text="$1"
  echo "$text" | sed 's/  */ /g' | sed 's/^ //;s/ $//'
}

# Helper function to remove option patterns from prompt
# Handles all formats: --opt=value, --opt "value", --opt 'value', --opt value
_remove_option_from_prompt() {
  local prompt="$1"
  local option_name="$2"

  # Build patterns for all formats
  # 1. --option="value" (double quoted)
  prompt=$(echo "$prompt" | sed -E "s/[[:space:]]*${option_name}=\"[^\"]*\"[[:space:]]*/ /g")
  # 2. --option='value' (single quoted)
  prompt=$(echo "$prompt" | sed -E "s/[[:space:]]*${option_name}='[^']*'[[:space:]]*/ /g")
  # 3. --option=value (unquoted, no spaces)
  prompt=$(echo "$prompt" | sed -E "s/[[:space:]]*${option_name}=[^[:space:]\"]+[[:space:]]*/ /g")
  # 4. --option "value" (space + double quoted)
  prompt=$(echo "$prompt" | sed -E "s/[[:space:]]*${option_name}[[:space:]]+\"[^\"]*\"[[:space:]]*/ /g")
  # 5. --option 'value' (space + single quoted)
  prompt=$(echo "$prompt" | sed -E "s/[[:space:]]*${option_name}[[:space:]]+'[^']+'[[:space:]]*/ /g")
  # 6. --option value (space + unquoted)
  prompt=$(echo "$prompt" | sed -E "s/[[:space:]]*${option_name}[[:space:]]+[^[:space:]\"]+[[:space:]]*/ /g")

  _cleanup_whitespace "$prompt"
}

# Helper function to extract option value from prompt text
# Returns the value or empty string if not found
_extract_option_from_prompt() {
  local prompt="$1"
  local option_name="$2"
  local value=""

  # Try all formats in order of specificity
  if [[ "$prompt" =~ ${option_name}=\"([^\"]+)\" ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ${option_name}=\'([^\']+)\' ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ${option_name}=([^[:space:]\"\']+) ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ${option_name}[[:space:]]+\"([^\"]+)\" ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ${option_name}[[:space:]]+\'([^\']+)\' ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$prompt" =~ ${option_name}[[:space:]]+([^[:space:]\"\']+) ]]; then
    value="${BASH_REMATCH[1]}"
  fi

  echo "$value"
}

# Also check the prompt text itself for embedded options (secondary fallback)
# and clean up any options that ended up in the prompt text
if [[ "$PROMPT" =~ --max-iterations[=[:space:]]+[0-9]+ ]]; then
  # Extract if not already set
  if [[ $MAX_ITERATIONS -eq 0 ]]; then
    EXTRACTED=$(_extract_option_from_prompt "$PROMPT" "--max-iterations")
    if [[ "$EXTRACTED" =~ ^[0-9]+$ ]]; then
      MAX_ITERATIONS="$EXTRACTED"
    fi
  fi
  # Remove from prompt using helper function
  PROMPT=$(_remove_option_from_prompt "$PROMPT" "--max-iterations")
fi

if [[ "$PROMPT" =~ --completion-promise ]]; then
  # Try various formats to extract the promise value
  if [[ "$COMPLETION_PROMISE" == "null" ]]; then
    COMPLETION_PROMISE=$(_extract_option_from_prompt "$PROMPT" "--completion-promise")
  fi
  # Remove from prompt using helper function
  PROMPT=$(_remove_option_from_prompt "$PROMPT" "--completion-promise")
fi

# Remove --force from prompt if present
PROMPT=$(echo "$PROMPT" | sed -E 's/[[:space:]]*--force[[:space:]]*/ /g' | sed -E 's/[[:space:]]*-f[[:space:]]*/ /g')
PROMPT=$(_cleanup_whitespace "$PROMPT")

# Get session ID from PPID-based file (written by session-start-hook.sh)
# This is the authoritative source - survives /clear and doesn't rely on env vars
# PPID identifies the Claude Code process, which is stable across /clear
debug_log "=== SETUP-RALPH-LOOP INVOKED ==="
debug_log "PPID=$PPID"

SESSIONS_DIR="$RALPH_BASE_DIR/sessions"

# Find session ID by walking up the process tree to find Claude Code
# The hook writes to ppid_{CLAUDE_CODE_PID}.id, but this script's $PPID
# is a shell subprocess, not Claude Code. We walk up until we find a match.
find_session_from_process_tree() {
  local current_pid=$$
  local max_depth=10
  local depth=0

  while [[ $depth -lt $max_depth ]] && [[ "$current_pid" -gt 1 ]]; do
    local session_file="$SESSIONS_DIR/ppid_$current_pid.id"
    if [[ -f "$session_file" ]]; then
      cat "$session_file"
      return 0
    fi
    # Get parent PID (works on macOS and Linux)
    current_pid=$(ps -o ppid= -p "$current_pid" 2>/dev/null | tr -d ' ')
    [[ -z "$current_pid" ]] && break
    ((depth++))
  done
  return 1
}

# Try process tree walk first, then env var fallback
if SESSION_ID=$(find_session_from_process_tree); then
  debug_log "Read session ID from process tree: $SESSION_ID"
else
  SESSION_ID="${CLAUDE_SESSION_ID:-}"
  debug_log "WARNING: No PPID file in process tree, falling back to env var: $SESSION_ID"
fi

debug_log "Final SESSION_ID=$SESSION_ID"

# FAIL LOUDLY: Session ID is required - no fallbacks
if [[ -z "$SESSION_ID" ]]; then
  echo "Error: CLAUDE_SESSION_ID not set" >&2
  echo "" >&2
  echo "   Ralph loops require a valid Claude Code session ID." >&2
  echo "   This can happen if:" >&2
  echo "     - The plugin was just installed (restart Claude Code)" >&2
  echo "     - The SessionStart hook failed" >&2
  echo "" >&2
  echo "   Try: Restart Claude Code to reinitialize the session." >&2
  exit 1
fi

# Create global directories (RALPH_BASE_DIR and LOGS_DIR defined at top for debug logging)
LOOPS_DIR="$RALPH_BASE_DIR/loops"
TRANSCRIPTS_DIR="$RALPH_BASE_DIR/transcripts"
mkdir -p "$LOOPS_DIR" "$LOGS_DIR" "$TRANSCRIPTS_DIR"

# State file path: one per session (keyed by session_id)
STATE_FILE="$LOOPS_DIR/ralph-loop.${SESSION_ID}.local.md"

# Check if a loop already exists for this session
if [[ -f "$STATE_FILE" ]]; then
  # Extract existing loop info
  EXISTING_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
  EXISTING_DESCRIPTION=$(echo "$EXISTING_FRONTMATTER" | grep '^description:' | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
  EXISTING_ITERATION=$(echo "$EXISTING_FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//' || echo "?")
  EXISTING_LOOP_ID=$(echo "$EXISTING_FRONTMATTER" | grep '^loop_id:' | sed 's/loop_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")

  if [[ "$FORCE_FLAG" == "true" ]]; then
    # Auto-cancel the existing loop
    echo "Cancelling existing loop: $EXISTING_DESCRIPTION (iteration $EXISTING_ITERATION)"

    # Log cancellation
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    "$SCRIPT_DIR/log-session.sh" "$STATE_FILE" "cancelled" "" 2>/dev/null || true

    # Delete state file
    rm -f "$STATE_FILE"
    echo "Previous loop cancelled."
    echo ""
  else
    # Fail with helpful message
    echo "Error: A loop is already active in this session." >&2
    echo "" >&2
    echo "   Current: \"$EXISTING_DESCRIPTION\" (iteration $EXISTING_ITERATION)" >&2
    echo "" >&2
    echo "   Options:" >&2
    echo "     - Cancel and start fresh: /ralph-loop \"new task\" --force" >&2
    echo "     - Cancel manually: /cancel-ralph" >&2
    echo "     - Continue existing: just keep working (exit will loop)" >&2
    exit 1
  fi
fi

# Generate 8-char loop_id for transcript uniqueness (32 bits of entropy)
LOOP_ID="$(head -c 8 /dev/urandom | xxd -p 2>/dev/null | head -c 8)"
if [[ -z "$LOOP_ID" ]]; then
  # Fallback for systems without xxd (part of vim, not coreutils)
  LOOP_ID="$(od -An -tx1 -N4 /dev/urandom | tr -d ' \n' | head -c 8)"
fi

# Generate description from first 60 chars of prompt
DESCRIPTION=$(echo "$PROMPT" | tr '\n' ' ' | head -c 60)
if [[ ${#PROMPT} -gt 60 ]]; then
  DESCRIPTION="${DESCRIPTION}..."
fi

# Quote completion promise for YAML if it contains special chars or is not null
if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  COMPLETION_PROMISE_YAML="\"$COMPLETION_PROMISE\""
else
  COMPLETION_PROMISE_YAML="null"
fi

PROJECT_PATH="$(pwd)"

# Create state file atomically (write to temp, then rename)
# This prevents partial files if interrupted
TEMP_STATE_FILE="$(mktemp)"
cat > "$TEMP_STATE_FILE" <<EOF
---
session_id: "$SESSION_ID"
loop_id: "$LOOP_ID"
project: "$PROJECT_PATH"
description: "$DESCRIPTION"
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: $COMPLETION_PROMISE_YAML
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---

$PROMPT
EOF
mv "$TEMP_STATE_FILE" "$STATE_FILE"

# Log session start to history
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPLETION_PROMISE_LOG=""
if [[ "$COMPLETION_PROMISE" != "null" ]]; then
  COMPLETION_PROMISE_LOG="$COMPLETION_PROMISE"
fi

"$SCRIPT_DIR/log-session.sh" --start \
  --loop-id "$LOOP_ID" \
  --session-id "$SESSION_ID" \
  --project "$PROJECT_PATH" \
  --task "$PROMPT" \
  --state-file "$STATE_FILE" \
  --max-iterations "$MAX_ITERATIONS" \
  --completion-promise "$COMPLETION_PROMISE_LOG" 2>/dev/null || true

# Output setup message
cat <<EOF
Ralph loop activated in this session!

Loop ID: $LOOP_ID
Description: $DESCRIPTION
Iteration: 1
Max iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "unlimited"; fi)
Completion promise: $(if [[ "$COMPLETION_PROMISE" != "null" ]]; then echo "${COMPLETION_PROMISE//\"/} (ONLY output when TRUE - do not lie!)"; else echo "none (runs forever)"; fi)

The stop hook is now active. When you try to exit, the SAME PROMPT will be
fed back to you. You'll see your previous work in files, creating a
self-referential loop where you iteratively improve on the same task.

To monitor this loop: cat $STATE_FILE
To list all loops:    /list-ralph-loops
To cancel this loop:  /cancel-ralph

WARNING: This loop cannot be stopped manually! It will run infinitely
    unless you set --max-iterations or --completion-promise.

EOF

# Output the initial prompt if provided
if [[ -n "$PROMPT" ]]; then
  echo ""
  echo "$PROMPT"
fi
