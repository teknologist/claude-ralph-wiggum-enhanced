#!/bin/bash

# Ralph Loop Setup Script
# Creates session-specific state file for in-session Ralph loop

set -euo pipefail

# Parse arguments
PROMPT_PARTS=()
MAX_ITERATIONS=0
COMPLETION_PROMISE="null"
PROMPT_FILE=""

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

# Get session ID from environment (set by SessionStart hook via CLAUDE_ENV_FILE)
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

if [[ "$SESSION_ID" == "unknown" ]]; then
  echo "⚠️  Warning: Session ID not available. Loop may not be session-isolated." >&2
  echo "   This can happen if the plugin was just installed. Try restarting Claude Code." >&2
  # Generate a fallback unique ID
  SESSION_ID="fallback-$(date +%s)-$$"
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
