---
description: "Cancel active Ralph Wiggum loop(s)"
allowed-tools: ["Bash", "AskUserQuestion"]
hide-from-slash-command-tool: "true"
---

# Cancel Ralph

First, list all active Ralph loops in this project:

```!
found=0
# Use find to avoid shell glob expansion errors in zsh
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
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
done < <(find .claude -maxdepth 1 -name 'ralph-loop.*.local.md' 2>/dev/null)
if [[ $found -eq 0 ]]; then
  echo "NO_LOOPS_FOUND"
fi
```

Based on the output above:

## If NO_LOOPS_FOUND
Say: "No active Ralph loops found in this project."

## If exactly ONE loop found
1. Show the loop details (session ID truncated to 8 chars, description, iteration count)
2. Use AskUserQuestion to confirm cancellation:
   ```
   {
     "question": "Cancel this Ralph loop?",
     "header": "Confirm",
     "options": [
       {"label": "Yes, cancel it", "description": "Stop the loop and delete its state file"},
       {"label": "No, keep it running", "description": "Leave the loop active"}
     ],
     "multiSelect": false
   }
   ```
3. If confirmed, delete the state file using Bash: `rm <FILE>`
4. Report: "Cancelled Ralph loop: <description> (was at iteration <ITER>)"
5. If not confirmed, say: "Loop not cancelled."

## If MULTIPLE loops found
1. Show a summary of all loops with their session IDs (truncated) and descriptions
2. Use AskUserQuestion to ask which loop(s) to cancel:
   - Create options based on the loops found, using format: "Session <id>: <description>"
   - Include an "All loops" option as first choice
   - Include a "None - keep all running" option as last choice
   - Use multiSelect: true to allow canceling multiple loops
3. If user selects "None", say: "No loops cancelled."
4. Otherwise, delete the selected state file(s)
5. Report which loops were cancelled

Example AskUserQuestion format for multiple loops:
```
{
  "question": "Which Ralph loop(s) do you want to cancel?",
  "header": "Cancel loops",
  "options": [
    {"label": "All loops", "description": "Cancel all active Ralph loops"},
    {"label": "abc12345: Build REST API...", "description": "Iteration 5, running since ..."},
    {"label": "xyz78901: Fix auth bug...", "description": "Iteration 12, running since ..."},
    {"label": "None - keep all running", "description": "Don't cancel any loops"}
  ],
  "multiSelect": true
}
```
