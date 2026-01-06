#!/bin/bash

# Ralph Loop Cancel Script
# Cancels the active loop in the current session
# State file: ~/.claude/ralph-wiggum-pro/loops/ralph-loop.{session_id}.local.md

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Global paths
RALPH_BASE_DIR="$HOME/.claude/ralph-wiggum-pro"
LOOPS_DIR="$RALPH_BASE_DIR/loops"

# Get session ID from environment (set by SessionStart hook)
SESSION_ID="${CLAUDE_SESSION_ID:-}"

# FAIL LOUDLY: Session ID is required
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

# Direct state file lookup
STATE_FILE="$LOOPS_DIR/ralph-loop.${SESSION_ID}.local.md"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No active loop in this session."
  echo ""
  echo "   To start a new loop: /ralph-loop \"your task\""
  exit 0
fi

# Extract loop info for display
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
DESCRIPTION=$(echo "$FRONTMATTER" | grep '^description:' | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//' || echo "?")
LOOP_ID=$(echo "$FRONTMATTER" | grep '^loop_id:' | sed 's/loop_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "")

# Log the cancellation
"$SCRIPT_DIR/log-session.sh" "$STATE_FILE" "cancelled" "" 2>/dev/null || true

# Delete state file
rm -f "$STATE_FILE"

echo "Loop cancelled!"
echo ""
echo "   Loop ID: $LOOP_ID"
echo "   Description: $DESCRIPTION"
echo "   Iterations completed: $ITERATION"
echo ""
echo "   To start a new loop: /ralph-loop \"your task\""
