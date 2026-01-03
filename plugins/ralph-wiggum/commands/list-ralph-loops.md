---
description: "List all active Ralph Wiggum loops"
allowed-tools: ["Bash"]
hide-from-slash-command-tool: "true"
---

# List Ralph Loops

List all active Ralph loops in this project:

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
    echo "DESC=$DESC"
    echo "ITER=$ITER"
    echo "MAX=$MAX"
    echo "ELAPSED=$ELAPSED"
    echo "FILE=$f"
    echo "---"
  fi
done
if [[ $found -eq 0 ]]; then
  echo "NO_LOOPS_FOUND"
fi
```

Based on the output above, format and display the results:

## If NO_LOOPS_FOUND
Say: "No active Ralph loops found in this project."

## If loops are found
Display them in a clear table format:

```
📋 Active Ralph Loops
═══════════════════════════════════════════════════════════════

Session: <first 8 chars of SESSION>...
Task:    <DESC>
Status:  Iteration <ITER>/<MAX or "∞"> | Running for <ELAPSED>
File:    <FILE>

───────────────────────────────────────────────────────────────

Session: <next session>
...

═══════════════════════════════════════════════════════════════
Total: <N> active loop(s)
```

Show iteration as "5/20" if MAX > 0, or "5/∞" if MAX is 0 (unlimited).

After displaying, remind the user:
- To cancel a loop: `/cancel-ralph`
- To start a new loop: `/ralph-loop`
