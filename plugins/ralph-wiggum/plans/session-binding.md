# Plan: Session-Bound Ralph Wiggum Loops

## Problem

The ralph-wiggum plugin's Stop hook triggers on **all** Claude Code sessions running in the same project directory, not just the session that started the loop.

**Root Cause:** Single state file `.claude/ralph-loop.local.md` is shared across all sessions.

## Solution: Session-Specific State Files

Use **per-session state files** so multiple loops can run concurrently in the same project:

```
.claude/ralph-loop.{session_id}.local.md   # One per session
```

Each file includes a **task description** for identification in the cancel command.

## Desired Behavior

```
Terminal A: /ralph-loop "Build REST API"
  → Creates .claude/ralph-loop.abc123.local.md

Terminal B: /ralph-loop "Fix auth bug"
  → Creates .claude/ralph-loop.xyz789.local.md

Terminal A exits → Stop hook finds abc123 file → blocks ✓
Terminal B exits → Stop hook finds xyz789 file → blocks ✓

/cancel-ralph (from any terminal):
  → Lists: "1. Build REST API (abc123)", "2. Fix auth bug (xyz789)"
  → User selects which to cancel
```

## Implementation

### 1. Add SessionStart Hook (persist session ID as env var)

**New file:** `hooks/session-start-hook.sh`

Uses Claude Code's `$CLAUDE_ENV_FILE` to persist session ID as an environment variable that's available to all commands in the session:

```bash
#!/bin/bash
HOOK_INPUT=$(cat)
SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')

# Persist as env var using Claude's special CLAUDE_ENV_FILE
if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then
  echo "export CLAUDE_SESSION_ID=\"$SESSION_ID\"" >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

This makes `$CLAUDE_SESSION_ID` available to commands - no file-based workaround needed!

**Modify:** `hooks/hooks.json`
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-start-hook.sh"
      }]
    }],
    "Stop": [...]
  }
}
```

### 2. Modify setup-ralph-loop.sh

**File:** `scripts/setup-ralph-loop.sh`

Changes:
- Read session ID from `.claude/ralph-session-id.txt`
- **NEW: Support `--prompt-file <path>` to read prompt from markdown file**
- Generate task description (first 50 chars of prompt or truncated)
- Create session-specific file: `.claude/ralph-loop.{session_id}.local.md`
- Add `description:` field to YAML frontmatter

**New argument:**
```bash
--prompt-file <path>   # Read prompt from markdown file instead of inline string
```

**Usage examples:**
```bash
/ralph-loop "Build a REST API" --max-iterations 20           # Inline prompt
/ralph-loop --prompt-file ./prompts/api-task.md              # File-based prompt
/ralph-loop --prompt-file task.md --completion-promise DONE  # File + options
```

**Implementation:**
```bash
# New argument parsing
--prompt-file)
  if [[ -z "${2:-}" ]]; then
    echo "❌ Error: --prompt-file requires a file path" >&2
    exit 1
  fi
  if [[ ! -f "$2" ]]; then
    echo "❌ Error: Prompt file not found: $2" >&2
    exit 1
  fi
  PROMPT=$(cat "$2")
  shift 2
  ;;

# Session ID and description
SESSION_ID=$(cat .claude/ralph-session-id.txt 2>/dev/null || echo "unknown")
DESCRIPTION=$(echo "$PROMPT" | head -c 50 | tr '\n' ' ')
[[ ${#PROMPT} -gt 50 ]] && DESCRIPTION="${DESCRIPTION}..."

cat > ".claude/ralph-loop.${SESSION_ID}.local.md" <<EOF
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
```

### 3. Modify stop-hook.sh

**File:** `hooks/stop-hook.sh`

Changes:
- Get session ID from hook input
- Look for session-specific file: `.claude/ralph-loop.{session_id}.local.md`
- Only block if that specific file exists
- **Calculate and display elapsed time since loop started**

```bash
CURRENT_SESSION_ID=$(echo "$HOOK_INPUT" | jq -r '.session_id')
RALPH_STATE_FILE=".claude/ralph-loop.${CURRENT_SESSION_ID}.local.md"

if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  exit 0  # No loop for this session
fi

# Calculate elapsed time
STARTED_AT=$(echo "$FRONTMATTER" | grep '^started_at:' | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/')
if [[ -n "$STARTED_AT" ]]; then
  START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" "+%s" 2>/dev/null || date -d "$STARTED_AT" "+%s" 2>/dev/null)
  NOW_EPOCH=$(date "+%s")
  ELAPSED_SECS=$((NOW_EPOCH - START_EPOCH))
  ELAPSED_MIN=$((ELAPSED_SECS / 60))
  ELAPSED_SEC=$((ELAPSED_SECS % 60))
  ELAPSED_STR="${ELAPSED_MIN}m ${ELAPSED_SEC}s"
fi

# Include elapsed time in system message
SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION | Running for $ELAPSED_STR | ..."
```

### 4. Rewrite cancel-ralph.md

**File:** `commands/cancel-ralph.md`

New behavior:
1. List all `.claude/ralph-loop.*.local.md` files
2. Extract session_id and description from each
3. If multiple loops exist, use AskUserQuestion to let user select
4. Delete the selected file(s)

```markdown
---
description: "Cancel active Ralph Wiggum loop(s)"
allowed-tools: ["Bash", "AskUserQuestion"]
---

# Cancel Ralph

First, list all active Ralph loops:

```!
for f in .claude/ralph-loop.*.local.md 2>/dev/null; do
  if [[ -f "$f" ]]; then
    SESSION=$(basename "$f" | sed 's/ralph-loop\.\(.*\)\.local\.md/\1/')
    DESC=$(grep '^description:' "$f" | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/')
    ITER=$(grep '^iteration:' "$f" | sed 's/iteration: *//')
    echo "SESSION=$SESSION|DESC=$DESC|ITER=$ITER|FILE=$f"
  fi
done
```

Based on output:
- If no files found → "No active Ralph loops"
- If 1 loop → Delete it, confirm cancellation
- If multiple loops → Use AskUserQuestion to select which to cancel
```

### 5. Add list-ralph-loops.md command

**New file:** `commands/list-ralph-loops.md`

Lists all active Ralph loops with their session ID, description, iteration count, and start time.

```markdown
---
description: "List all active Ralph Wiggum loops"
allowed-tools: ["Bash"]
---

# List Ralph Loops

```!
found=0
for f in .claude/ralph-loop.*.local.md 2>/dev/null; do
  if [[ -f "$f" ]]; then
    found=1
    SESSION=$(basename "$f" | sed 's/ralph-loop\.\(.*\)\.local\.md/\1/')
    DESC=$(grep '^description:' "$f" | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/')
    ITER=$(grep '^iteration:' "$f" | sed 's/iteration: *//')
    MAX=$(grep '^max_iterations:' "$f" | sed 's/max_iterations: *//')
    STARTED=$(grep '^started_at:' "$f" | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/')
    echo "SESSION=$SESSION"
    echo "DESC=$DESC"
    echo "ITER=$ITER"
    echo "MAX=$MAX"
    echo "STARTED=$STARTED"
    echo "---"
  fi
done
if [[ $found -eq 0 ]]; then
  echo "NO_LOOPS"
fi
```

Format the output as a readable table showing:
- Session ID (truncated)
- Description
- Current iteration / max iterations
- Started at timestamp

If NO_LOOPS, say "No active Ralph loops found."
```

## Files to Modify

| File | Change |
|------|--------|
| `hooks/session-start-hook.sh` | **NEW** - Writes session ID on start |
| `hooks/hooks.json` | Add SessionStart hook |
| `scripts/setup-ralph-loop.sh` | Session-specific file + description field + --prompt-file |
| `hooks/stop-hook.sh` | Look for session-specific file only |
| `commands/cancel-ralph.md` | List loops, prompt for selection |
| `commands/list-ralph-loops.md` | **NEW** - List all active loops |

## Testing

1. Terminal A: `/ralph-loop "Build API"` → Creates `.claude/ralph-loop.abc123.local.md`
2. Terminal B: `/ralph-loop "Fix bug"` → Creates `.claude/ralph-loop.xyz789.local.md`
3. Exit Terminal B → Blocked by its own loop only
4. Exit Terminal A → Blocked by its own loop only
5. `/cancel-ralph` from Terminal C → Shows both, asks which to cancel
6. `/ralph-loop --prompt-file task.md` → Reads prompt from file
