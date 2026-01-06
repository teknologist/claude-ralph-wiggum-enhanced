---
description: "Show Ralph Wiggum loop session history and statistics"
argument-hint: "[--last N] [--project NAME] [--outcome TYPE] [--active] [--all]"
allowed-tools: ["Bash"]
hide-from-slash-command-tool: "true"
---

# Ralph Stats

Show historical Ralph loop session data from `~/.claude/ralph-wiggum-pro/logs/sessions.jsonl`.

## Parse Arguments

The user may provide arguments. Parse them:
- `--last N` or `-n N`: Show last N sessions (default: 10)
- `--project NAME` or `-p NAME`: Filter by project name (partial match)
- `--outcome TYPE` or `-o TYPE`: Filter by outcome (success, max_iterations, cancelled, error)
- `--active` or `-a`: Show only active (running) loops
- `--all`: Show all sessions (overrides --last)

## Execute Query

```!
LOG_FILE="$HOME/.claude/ralph-wiggum-pro/logs/sessions.jsonl"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "NO_LOG_FILE"
  exit 0
fi

if [[ ! -s "$LOG_FILE" ]]; then
  echo "EMPTY_LOG_FILE"
  exit 0
fi

# Output raw JSONL for parsing
echo "LOG_DATA_START"
cat "$LOG_FILE"
echo ""
echo "LOG_DATA_END"
```

## Format and Display Results

Based on the output above:

### If NO_LOG_FILE or EMPTY_LOG_FILE
Say: "No Ralph loop history found. Run some loops first!"

### If LOG_DATA found
Parse the JSONL data between LOG_DATA_START and LOG_DATA_END. Each line is a JSON object.

**Important: The log now uses a two-entry format:**
- **Start entries** have `status: "active"` with fields: session_id, project, project_name, state_file_path, task, started_at, max_iterations, completion_promise
- **Completion entries** have `status: "completed"` with fields: session_id, outcome, ended_at, duration_seconds, iterations, error_reason

**Merging logic:**
1. Group all entries by `loop_id` (unique per loop invocation)
2. For each session:
   - Find the start entry (`status: "active"`) to get project, task, started_at, max_iterations, completion_promise
   - Find the completion entry (`status: "completed"`) to get outcome, ended_at, duration_seconds, iterations
   - If only start entry exists (no completion), the session is **currently active**
   - Merge fields from both entries into a unified session object

**Handling active sessions:**
- Sessions with only a start entry (no completion entry) are currently running
- Show them with status `🔄 active` instead of an outcome
- Calculate duration from started_at to now
- Show iterations as `?` (unknown until completion)

Apply any filters the user requested:
- If `--active` specified, show ONLY sessions that have no completion entry (still running)
- If `--project` specified, filter entries where `project_name` contains the value (case-insensitive)
- If `--outcome` specified, filter completed entries where `outcome` equals the value
- If `--all` NOT specified, limit to the last N entries (default 10)

Sort by `started_at` descending (most recent first), with active sessions at the top.

**Important: The log now includes checklist data.**
Each session entry may include:
- `has_checklist`: boolean - whether a checklist exists for this loop
- `checklist_progress`: string or null - format "X/Y tasks • A/B criteria"

When merging entries, include these fields from the start entry.

Display in this format:

```
📊 Ralph Loop Session History
═════════════════════════════════════════════════════════════════════════════════════════════════════════

Project         Task                           Iters/Max  Checklist           Promise      Status      Started
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
my-api          Working on feature X...        ?/50       3/5 • 1/2          DONE         🔄 active   2024-01-15 10:30
my-api          Build REST API for todos...    15/50      -                  COMPLETE     ✅ success  2024-01-15 10:30
my-api          Fix auth bug                   20/20      2/2 • 1/1          FIXED        ⏹ max      2024-01-14 14:00
frontend        Refactor cache layer           8/∞        -                  -            🚫 cancel  2024-01-13 09:15
my-api          Add rate limiting              3/10       -                  DONE         ❌ error    2024-01-12 16:20

═════════════════════════════════════════════════════════════════════════════════════════════════════════
Total: 5 sessions | 🔄 1 | ✅ 1 | ⏹ 1 | 🚫 1 | ❌ 1
```

**Formatting rules:**
- Project: First 15 chars, truncated with `...` if longer
- Task: First 22 chars, truncated with `...` if longer (reduced to make room for Checklist column)
- Iters/Max: Show as `X/Y` where Y is max_iterations, or `X/∞` if max_iterations is 0 (unlimited); for active loops show `?/Y`
- Checklist: Show `checklist_progress` value (first 18 chars), or `-` if null/empty
  - Format is typically "X/Y tasks • A/B criteria" but may be truncated
  - Only show if `has_checklist` is true, otherwise show `-`
- Duration: (removed from table to make room for Checklist - can be shown in detailed view if needed)
- Promise: Show `completion_promise` value (first 12 chars), or `-` if null/empty
- Status with emoji:
  - Active (no completion) → `🔄 active`
  - `success` → `✅ success`
  - `max_iterations` → `⏹ max`
  - `cancelled` → `🚫 cancel`
  - `error` → `❌ error`
- Started: Format `started_at` as `YYYY-MM-DD HH:MM` in local time

**Summary line:**
Count total sessions and breakdown by status type (including active count).

### If no sessions match filters
Say: "No sessions found matching your filters."

## Additional Help

If user runs `/ralph-wiggum-pro:ralph-stats --help` or `/ralph-wiggum-pro:ralph-stats -h`, show:

```
📊 Ralph Stats - View loop session history

USAGE:
  /ralph-wiggum-pro:ralph-stats [OPTIONS]

OPTIONS:
  --last N, -n N         Show last N sessions (default: 10)
  --project NAME, -p NAME  Filter by project name
  --outcome TYPE, -o TYPE  Filter by outcome (success, max_iterations, cancelled, error)
  --active, -a           Show only active (running) loops
  --all                  Show all sessions
  -h, --help             Show this help

EXAMPLES:
  /ralph-wiggum-pro:ralph-stats                          # Show last 10 sessions
  /ralph-wiggum-pro:ralph-stats --active                 # Show only running loops
  /ralph-wiggum-pro:ralph-stats --last 20                # Show last 20 sessions
  /ralph-wiggum-pro:ralph-stats --project my-api         # Filter by project
  /ralph-wiggum-pro:ralph-stats --outcome success        # Show only successful loops
  /ralph-wiggum-pro:ralph-stats --all --outcome error    # Show all error sessions

LOG LOCATION:
  ~/.claude/ralph-wiggum-pro/logs/sessions.jsonl

NOTE:
  The log uses a two-entry format:
  - Start entry: logged when loop begins (status: "active")
  - Completion entry: logged when loop ends (status: "completed")
  Sessions with only a start entry are currently running.
```
