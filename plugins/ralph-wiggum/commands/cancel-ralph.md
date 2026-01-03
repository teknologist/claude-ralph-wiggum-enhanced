---
description: "Cancel active Ralph Wiggum loop(s)"
allowed-tools: ["Bash", "AskUserQuestion"]
hide-from-slash-command-tool: "true"
---

# Cancel Ralph

First, list all active Ralph loops in this project:

```!
found=0
for f in .claude/ralph-loop.*.local.md 2>/dev/null; do
  if [[ -f "$f" ]]; then
    found=1
    SESSION=$(basename "$f" | sed 's/ralph-loop\.\(.*\)\.local\.md/\1/')
    DESC=$(grep '^description:' "$f" 2>/dev/null | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/' || echo "No description")
    ITER=$(grep '^iteration:' "$f" 2>/dev/null | sed 's/iteration: *//' || echo "?")
    MAX=$(grep '^max_iterations:' "$f" 2>/dev/null | sed 's/max_iterations: *//' || echo "0")
    STARTED=$(grep '^started_at:' "$f" 2>/dev/null | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/' || echo "unknown")
    echo "LOOP_FOUND"
    echo "SESSION=$SESSION"
    echo "DESC=$DESC"
    echo "ITER=$ITER"
    echo "MAX=$MAX"
    echo "STARTED=$STARTED"
    echo "FILE=$f"
    echo "---"
  fi
done
if [[ $found -eq 0 ]]; then
  echo "NO_LOOPS_FOUND"
fi
```

Based on the output above:

## If NO_LOOPS_FOUND
Say: "No active Ralph loops found in this project."

## If exactly ONE loop found
1. Show the loop details (session ID truncated to 8 chars, description, iteration count)
2. Delete the state file using Bash: `rm <FILE>`
3. Report: "Cancelled Ralph loop: <description> (was at iteration <ITER>)"

## If MULTIPLE loops found
1. Show a summary of all loops with their session IDs (truncated) and descriptions
2. Use AskUserQuestion to ask which loop(s) to cancel:
   - Create options based on the loops found, using format: "Session <id>: <description>"
   - Include an "All loops" option
   - Use multiSelect: true to allow canceling multiple loops
3. After user selection, delete the selected state file(s)
4. Report which loops were cancelled

Example AskUserQuestion format:
```
{
  "question": "Which Ralph loop(s) do you want to cancel?",
  "header": "Cancel loops",
  "options": [
    {"label": "All loops", "description": "Cancel all active Ralph loops"},
    {"label": "abc12345: Build REST API...", "description": "Iteration 5, running since ..."},
    {"label": "xyz78901: Fix auth bug...", "description": "Iteration 12, running since ..."}
  ],
  "multiSelect": true
}
```
