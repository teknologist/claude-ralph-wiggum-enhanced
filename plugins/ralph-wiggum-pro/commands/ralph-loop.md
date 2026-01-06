---
description: "Start Ralph Wiggum loop in current session"
argument-hint: "PROMPT [--max-iterations N] [--completion-promise TEXT]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh)", "Bash(${CLAUDE_PLUGIN_ROOT}/scripts/checklist-service.sh)"]
hide-from-slash-command-tool: "true"
---

# Ralph Loop Command

Execute the setup script to initialize the Ralph loop:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh" $ARGUMENTS
SETUP_EXIT_CODE=$?

# If setup failed (e.g., loop already active), stop here
if [ $SETUP_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "STOP - Do not proceed with any task"
  echo "═══════════════════════════════════════════════════════════"
  echo "The setup script failed. Either:"
  echo "  - A loop is already active (use --force to override)"
  echo "  - Session ID is not available"
  echo "  - Another error occurred"
  echo ""
  echo "READ THE ERROR ABOVE and wait for user instruction."
  echo "Do NOT start working on any task."
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi

# Find state file for this session by scanning frontmatter
# State files are in global directory: ~/.claude/ralph-wiggum-pro/loops/
# If multiple exist (edge case from failed cleanup), pick most recent by started_at
LOOPS_DIR="$HOME/.claude/ralph-wiggum-pro/loops"
STATE_FILE=""
LATEST_TS=""
if [ -n "$CLAUDE_SESSION_ID" ] && [ -d "$LOOPS_DIR" ]; then
  for f in "$LOOPS_DIR"/ralph-loop.*.local.md; do
    [ -f "$f" ] || continue
    F_SID=$(grep '^session_id:' "$f" 2>/dev/null | head -1 | sed 's/session_id: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/' || echo "")
    if [ "$F_SID" = "$CLAUDE_SESSION_ID" ]; then
      F_TS=$(grep '^started_at:' "$f" 2>/dev/null | head -1 | sed 's/started_at: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/' || echo "")
      if [ -z "$STATE_FILE" ] || [ "$F_TS" \> "$LATEST_TS" ]; then
        STATE_FILE="$f"
        LATEST_TS="$F_TS"
      fi
    fi
  done
fi
if [ -n "$STATE_FILE" ] && [ -f "$STATE_FILE" ]; then
  PROMISE=$(grep '^completion_promise:' "$STATE_FILE" | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/')
  if [ -n "$PROMISE" ] && [ "$PROMISE" != "null" ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "CRITICAL - Ralph Loop Completion Promise"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "To complete this loop, output this EXACT text:"
    echo "  <promise>$PROMISE</promise>"
    echo ""
    echo "STRICT REQUIREMENTS (DO NOT VIOLATE):"
    echo "  ✓ Use <promise> XML tags EXACTLY as shown above"
    echo "  ✓ The statement MUST be completely and unequivocally TRUE"
    echo "  ✓ Do NOT output false statements to exit the loop"
    echo "  ✓ Do NOT lie even if you think you should exit"
    echo ""
    echo "IMPORTANT - Do not circumvent the loop:"
    echo "  Even if you believe you're stuck, the task is impossible,"
    echo "  or you've been running too long - you MUST NOT output a"
    echo "  false promise statement. The loop is designed to continue"
    echo "  until the promise is GENUINELY TRUE. Trust the process."
    echo ""
    echo "  If the loop should stop, the promise statement will become"
    echo "  true naturally. Do not force it by lying."
    echo "═══════════════════════════════════════════════════════════"
  fi

  # Get loop_id for checklist operations
  LOOP_ID=$(grep '^loop_id:' "$STATE_FILE" | sed 's/loop_id: *//' | sed 's/"//g')
  CHECKLIST_SCRIPT="${CLAUDE_PLUGIN_ROOT}/scripts/checklist-service.sh"
fi

# Success instruction - only shown when setup succeeded
echo ""
echo "Please work on the task. When you try to exit, the Ralph loop will feed"
echo "the SAME PROMPT back to you for the next iteration. You'll see your"
echo "previous work in files and git history, allowing you to iterate and improve."
echo ""
echo "CRITICAL RULE: If a completion promise is set, you may ONLY output it"
echo "when the statement is completely and unequivocally TRUE. Do not output"
echo "false promises to escape the loop, even if you think you're stuck or"
echo "should exit for other reasons. The loop is designed to continue until"
echo "genuine completion."

# POPULATE instructions - shown LAST for recency bias (agent more likely to notice)
# Only show when we have a valid loop_id (state file exists)
if [ -n "$LOOP_ID" ]; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "!!   STOP - DO THIS FIRST: POPULATE ACCEPTANCE CRITERIA    !!"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo ""
  echo "A placeholder checklist has been created with TODO items."
  echo "BEFORE starting ANY work on the task, you MUST populate it with"
  echo "real acceptance criteria - the conditions that must ALL be true"
  echo "before you can output the completion promise."
  echo ""
  echo "DO NOT SKIP THIS STEP. Do it NOW before reading the task."
  echo ""
  echo "Steps:"
  echo "  1. ANALYZE the task and identify what 'done' means"
  echo "  2. DEFINE 3-6 specific, verifiable acceptance criteria"
  echo "  3. REPLACE the placeholder checklist by running:"
  echo ""
  echo "     $CHECKLIST_SCRIPT checklist_init \"$LOOP_ID\" '<json>' --force"
  echo ""
  echo "JSON format:"
  echo '     {"completion_criteria":[{"id":"c1","text":"..."},{"id":"c2","text":"..."}]}'
  echo ""
  echo "Example for 'Build a REST API with auth':"
  echo '     {"completion_criteria":['
  echo '       {"id":"c1","text":"API endpoints return 200 for valid requests"},'
  echo '       {"id":"c2","text":"Authentication rejects invalid tokens"},'
  echo '       {"id":"c3","text":"All tests pass"}]}'
  echo ""
  echo "OR update individual items:"
  echo "     $CHECKLIST_SCRIPT checklist_update_text \"$LOOP_ID\" \"c1\" \"Real criterion\""
  echo ""
  echo "The completion promise can ONLY be output when ALL criteria are"
  echo "marked 'completed'. Update status as you verify each one:"
  echo "     $CHECKLIST_SCRIPT checklist_status \"$LOOP_ID\" \"<id>\" \"completed\""
  echo ""
  echo "Dashboard displays progress in real-time."
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
fi
```
