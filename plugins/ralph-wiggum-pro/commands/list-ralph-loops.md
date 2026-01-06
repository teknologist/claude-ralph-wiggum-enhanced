---
description: "List all active Ralph Wiggum loops"
allowed-tools: ["Bash"]
hide-from-slash-command-tool: "true"
---

# List Ralph Loops

List all active Ralph loops:

```!
LOOPS_DIR="$HOME/.claude/ralph-wiggum-pro/loops"
found=0
# Use find to avoid shell glob expansion errors when no files exist
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if [[ -f "$f" ]]; then
    found=1
    SESSION=$(basename "$f" | sed 's/ralph-loop\.\(.*\)\.local\.md/\1/')
    DESC=$(grep '^description:' "$f" 2>/dev/null | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/' || echo "No description")
    ITER=$(grep '^iteration:' "$f" 2>/dev/null | sed 's/iteration: *//' || echo "?")
    MAX=$(grep '^max_iterations:' "$f" 2>/dev/null | sed 's/max_iterations: *//' || echo "0")
    STARTED=$(grep '^started_at:' "$f" 2>/dev/null | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/' || echo "unknown")
    PROJECT=$(grep '^project:' "$f" 2>/dev/null | sed 's/project: *//' | sed 's/^"\(.*\)"$/\1/' || echo "unknown")
    LOOP_ID=$(grep '^loop_id:' "$f" 2>/dev/null | sed 's/loop_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "?")

    # Calculate elapsed time
    if [[ "$STARTED" != "unknown" ]]; then
      START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED" "+%s" 2>/dev/null || date -d "$STARTED" "+%s" 2>/dev/null || echo "")
      if [[ -n "$START_EPOCH" ]]; then
        NOW_EPOCH=$(date "+%s")
        ELAPSED_SECS=$((NOW_EPOCH - START_EPOCH))
        ELAPSED_HOURS=$((ELAPSED_SECS / 3600))
        ELAPSED_MINS=$(((ELAPSED_SECS % 3600) / 60))
        if [[ $ELAPSED_HOURS -gt 0 ]]; then
          ELAPSED="${ELAPSED_HOURS}h ${ELAPSED_MINS}m"
        else
          ELAPSED="${ELAPSED_MINS}m"
        fi
      else
        ELAPSED="unknown"
      fi
    else
      ELAPSED="unknown"
    fi

    echo "LOOP_FOUND"
    echo "SESSION=$SESSION"
    echo "LOOP_ID=$LOOP_ID"
    echo "DESC=$DESC"
    echo "ITER=$ITER"
    echo "MAX=$MAX"
    echo "ELAPSED=$ELAPSED"
    echo "PROJECT=$PROJECT"
    echo "FILE=$f"
    echo "---"
  fi
done < <(find "$LOOPS_DIR" -maxdepth 1 -name 'ralph-loop.*.local.md' 2>/dev/null)
if [[ $found -eq 0 ]]; then
  echo "NO_LOOPS_FOUND"
fi
```

Based on the output above, format and display the results:

## If NO_LOOPS_FOUND
Say: "No active Ralph loops found."

## If loops are found
Display them in a clear table format:

```
Active Ralph Loops

Session: <first 8 chars of SESSION>...
Loop ID: <LOOP_ID>
Task:    <DESC>
Status:  Iteration <ITER>/<MAX or "unlimited"> | Running for <ELAPSED>
Project: <PROJECT>
File:    <FILE>

---

Session: <next session>
...

Total: <N> active loop(s)
```

Show iteration as "5/20" if MAX > 0, or "5/unlimited" if MAX is 0 (unlimited).

After displaying, remind the user:
- To cancel a loop: `/cancel-ralph`
- To start a new loop: `/ralph-loop`
