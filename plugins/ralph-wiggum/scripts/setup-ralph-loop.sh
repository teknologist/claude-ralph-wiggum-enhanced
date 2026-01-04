#!/bin/bash

# Ralph Loop Setup Script
# Creates session-specific state file for in-session Ralph loop

set -euo pipefail

# Parse arguments
PROMPT_PARTS=()
MAX_ITERATIONS=0
COMPLETION_PROMISE="null"
PROMPT_FILE=""

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

STOPPING:
  Only by reaching --max-iterations or detecting --completion-promise
  No manual stop - Ralph runs infinitely by default!

MONITORING:
  # List all active loops:
  /list-ralph-loops

  # View your session's state:
  cat .claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md
HELP_EOF
      exit 0
      ;;
    --prompt-file)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --prompt-file requires a file path" >&2
        echo "" >&2
        echo "   Valid examples:" >&2
        echo "     --prompt-file ./tasks/my-task.md" >&2
        echo "     --prompt-file prompts/api-build.md" >&2
        exit 1
      fi
      if [[ ! -f "$2" ]]; then
        echo "❌ Error: Prompt file not found: $2" >&2
        exit 1
      fi
      PROMPT_FILE="$2"
      shift 2
      ;;
    --max-iterations=*)
      # Handle --max-iterations=VALUE format
      MAX_ITERATIONS="${1#--max-iterations=}"
      if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
        echo "❌ Error: --max-iterations must be a positive integer or 0, got: $MAX_ITERATIONS" >&2
        exit 1
      fi
      shift
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --max-iterations requires a number argument" >&2
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
        echo "❌ Error: --max-iterations must be a positive integer or 0, got: $2" >&2
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
        echo "❌ Error: --completion-promise requires a text argument" >&2
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
  echo "❌ Error: No prompt provided" >&2
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

# Get session ID from environment (set by SessionStart hook via CLAUDE_ENV_FILE)
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

if [[ "$SESSION_ID" == "unknown" ]]; then
  echo "⚠️  Warning: Session ID not available. Loop may not be session-isolated." >&2
  echo "   This can happen if the plugin was just installed. Try restarting Claude Code." >&2
  # Generate a fallback unique ID
  SESSION_ID="fallback-$(date +%s)-$$"
fi

# Validate session ID format to prevent path traversal attacks
# Allow UUIDs, alphanumeric with hyphens/underscores/dots (but not .. for path traversal)
if [[ ! "$SESSION_ID" =~ ^[a-zA-Z0-9._-]+$ ]] || [[ "$SESSION_ID" == *".."* ]]; then
  echo "❌ Error: Invalid session ID format (security check)" >&2
  echo "   Session ID contains unsafe characters." >&2
  echo "   This should not happen with normal Claude Code operation." >&2
  exit 1
fi

# Create state file for stop hook (markdown with YAML frontmatter)
mkdir -p .claude

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

# Create session-specific state file
STATE_FILE=".claude/ralph-loop.${SESSION_ID}.local.md"
STATE_FILE_PATH="$(pwd)/$STATE_FILE"
PROJECT_PATH="$(pwd)"

cat > "$STATE_FILE" <<EOF
---
active: true
session_id: "$SESSION_ID"
description: "$DESCRIPTION"
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: $COMPLETION_PROMISE_YAML
started_at: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
---

$PROMPT
EOF

# Log session start to history
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPLETION_PROMISE_LOG=""
if [[ "$COMPLETION_PROMISE" != "null" ]]; then
  COMPLETION_PROMISE_LOG="$COMPLETION_PROMISE"
fi

"$SCRIPT_DIR/log-session.sh" --start \
  --session-id "$SESSION_ID" \
  --project "$PROJECT_PATH" \
  --task "$PROMPT" \
  --state-file "$STATE_FILE_PATH" \
  --max-iterations "$MAX_ITERATIONS" \
  --completion-promise "$COMPLETION_PROMISE_LOG" 2>/dev/null || true

# Output setup message
cat <<EOF
🔄 Ralph loop activated in this session!

Session ID: ${SESSION_ID:0:12}...
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

⚠️  WARNING: This loop cannot be stopped manually! It will run infinitely
    unless you set --max-iterations or --completion-promise.

🔄
EOF

# Output the initial prompt if provided
if [[ -n "$PROMPT" ]]; then
  echo ""
  echo "$PROMPT"
fi
