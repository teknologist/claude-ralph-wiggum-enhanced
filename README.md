# Ralph Wiggum Plugin

Implementation of the Ralph Wiggum technique for iterative, self-referential AI development loops in Claude Code.

> **Fork Notice**: This is a fork of the [official Anthropic Claude Code plugin](https://github.com/anthropics/claude-code-plugins). See [Enhancements](#enhancements-in-this-fork) below for additions made in this version.

## Enhancements in This Fork

This fork adds the following features on top of the original Anthropic plugin:

### v2.0.1 - Dashboard
- **Ralph Dashboard**: Web-based dashboard for monitoring and managing Ralph loops
  - View all active and archived loops in real-time
  - Cancel active loops directly from the browser
  - Track statistics: success rates, durations, iteration counts
  - Run with `bunx ralph-dashboard` or `npx ralph-dashboard`
  - Configurable port (`--port`) and host (`--host 0.0.0.0` for public access)
- **Active Loop Tracking**: Loops are now logged when they start (not just when they complete)
- **Remote Cancellation**: Cancel loops from the dashboard by deleting the state file

### v2.0.0 - Session Logging
- **Session Logging**: All loop sessions are automatically logged to `~/.claude/ralph-wiggum-logs/sessions.jsonl` with structured JSON data including project name, task, iterations, duration, outcome, and timestamps
- **`/ralph-stats` Command**: View historical loop session data with filtering by project, outcome, or count
- **Cancellation Logging**: Loop cancellations via `/cancel-ralph` are now logged to session history
- **Atomic Writes**: Log entries use atomic write pattern to prevent corruption
- **jq Dependency Check**: Clear error message if `jq` is not installed

### v1.x (Original Anthropic Features)
- Session isolation for multiple concurrent loops
- Progress tracking with elapsed time
- File-based prompts with `--prompt-file`
- Loop management commands (`/list-ralph-loops`, `/cancel-ralph`)
- Completion promise detection

---

## Features

- **Session Isolation**: Multiple Claude Code terminals can run independent Ralph loops on the same project
- **Progress Tracking**: Elapsed time display and iteration counting
- **File-based Prompts**: Load complex prompts from markdown files with `--prompt-file`
- **Loop Management**: List all active loops with `/list-ralph-loops`, cancel specific loops with `/cancel-ralph`
- **Session Logging**: All loop sessions are logged to `~/.claude/ralph-wiggum-logs/sessions.jsonl` with structured JSON data
- **Session Stats**: View historical loop data with `/ralph-stats` - filter by project, outcome, or time range

## What is Ralph?

Ralph is a development methodology based on continuous AI agent loops. As Geoffrey Huntley describes it: **"Ralph is a Bash loop"** - a simple `while true` that repeatedly feeds an AI agent a prompt file, allowing it to iteratively improve its work until completion.

The technique is named after Ralph Wiggum from The Simpsons, embodying the philosophy of persistent iteration despite setbacks.

### Core Concept

This plugin implements Ralph using a **Stop hook** that intercepts Claude's exit attempts:

```bash
# You run ONCE:
/ralph-loop "Your task description" --completion-promise "DONE"

# Then Claude Code automatically:
# 1. Works on the task
# 2. Tries to exit
# 3. Stop hook blocks exit
# 4. Stop hook feeds the SAME prompt back
# 5. Repeat until completion
```

The loop happens **inside your current session** - you don't need external bash loops. The Stop hook in `hooks/stop-hook.sh` creates the self-referential feedback loop by blocking normal session exit.

This creates a **self-referential feedback loop** where:
- The prompt never changes between iterations
- Claude's previous work persists in files
- Each iteration sees modified files and git history
- Claude autonomously improves by reading its own past work in files

## Quick Start

```bash
/ralph-loop "Build a REST API for todos. Requirements: CRUD operations, input validation, tests. Output <promise>COMPLETE</promise> when done." --completion-promise "COMPLETE" --max-iterations 50
```

Claude will:
- Implement the API iteratively
- Run tests and see failures
- Fix bugs based on test output
- Iterate until all requirements met
- Output the completion promise when done

## Commands

### /ralph-loop

Start a Ralph loop in your current session. Each session gets its own isolated loop - you can run multiple loops in different terminals on the same project.

**Usage:**
```bash
# Inline prompt
/ralph-loop "<prompt>" --max-iterations <n> --completion-promise "<text>"

# File-based prompt (for complex tasks)
/ralph-loop --prompt-file ./prompts/my-task.md --max-iterations 50 --completion-promise "DONE"
```

**Options:**
- `--prompt-file <path>` - Read prompt from a markdown file instead of inline
- `--max-iterations <n>` - Stop after N iterations (default: unlimited)
- `--completion-promise <text>` - Phrase that signals completion (use quotes for multi-word)

**Examples:**
```bash
# Simple inline prompt
/ralph-loop "Build a REST API for todos" --max-iterations 20

# Complex prompt from file
/ralph-loop --prompt-file ./tasks/api-spec.md --completion-promise "COMPLETE"

# Mixed: file prompt with options
/ralph-loop --prompt-file task.md --max-iterations 50 --completion-promise "ALL TESTS PASS"
```

### /list-ralph-loops

List all active Ralph loops across all sessions in the current project.

**Usage:**
```bash
/list-ralph-loops
```

Shows each loop's:
- Session ID (truncated)
- Task description
- Current iteration / max iterations
- Elapsed time since start

### /cancel-ralph

Cancel active Ralph loop(s). If multiple loops exist, you'll be prompted to select which to cancel.

**Usage:**
```bash
/cancel-ralph
```

**Behavior:**
- Single loop: Cancels immediately (after confirmation)
- Multiple loops: Shows list with descriptions, allows selecting one or all to cancel
- Logs the cancellation to session history

### /ralph-stats

View historical Ralph loop session data.

**Usage:**
```bash
/ralph-stats                        # Show last 10 sessions
/ralph-stats --last 20              # Show last 20 sessions
/ralph-stats --project my-api       # Filter by project name
/ralph-stats --outcome success      # Filter by outcome
/ralph-stats --all                  # Show all sessions
```

**Options:**
- `--last N`, `-n N` - Show last N sessions (default: 10)
- `--project NAME`, `-p NAME` - Filter by project name (partial match)
- `--outcome TYPE`, `-o TYPE` - Filter by outcome: `success`, `max_iterations`, `cancelled`, `error`
- `--all`, `-a` - Show all sessions

**Output:**
```
📊 Ralph Loop Session History
═════════════════════════════════════════════════════════════════════════════════════════════════════════

Project         Task                           Iters/Max  Duration  Promise      Outcome     Started              Ended
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
my-api          Build REST API for todos...    15/50      1h 15m    COMPLETE     ✅ success  2024-01-15 10:30     2024-01-15 11:45
my-api          Fix auth bug                   20/20      45m       FIXED        ⏹ max      2024-01-14 14:00     2024-01-14 14:45

═════════════════════════════════════════════════════════════════════════════════════════════════════════
Total: 2 sessions | ✅ 1 | ⏹ 1 | 🚫 0 | ❌ 0
```

**Log location:** `~/.claude/ralph-wiggum-logs/sessions.jsonl`

### Ralph Dashboard

View and manage your Ralph loops in a web browser.

**Installation:**
```bash
# Using bun (recommended)
bunx ralph-dashboard

# Using npm
npx ralph-dashboard
```

**Usage:**
```bash
# Start on localhost:3847
bunx ralph-dashboard

# Custom port
bunx ralph-dashboard --port 8080

# Public access (for remote monitoring)
bunx ralph-dashboard --host 0.0.0.0

# Both options
bunx ralph-dashboard -p 8080 -h 0.0.0.0
```

**Features:**
- Real-time view of active and archived loops
- Statistics: success rate, average duration, iteration counts
- Cancel active loops with one click
- Automatic refresh every 5 seconds

Open http://localhost:3847 in your browser to view the dashboard.

## Prompt Writing Best Practices

### 1. Clear Completion Criteria

❌ Bad: "Build a todo API and make it good."

✅ Good:
```markdown
Build a REST API for todos.

When complete:
- All CRUD endpoints working
- Input validation in place
- Tests passing (coverage > 80%)
- README with API docs
- Output: <promise>COMPLETE</promise>
```

### 2. Incremental Goals

❌ Bad: "Create a complete e-commerce platform."

✅ Good:
```markdown
Phase 1: User authentication (JWT, tests)
Phase 2: Product catalog (list/search, tests)
Phase 3: Shopping cart (add/remove, tests)

Output <promise>COMPLETE</promise> when all phases done.
```

### 3. Self-Correction

❌ Bad: "Write code for feature X."

✅ Good:
```markdown
Implement feature X following TDD:
1. Write failing tests
2. Implement feature
3. Run tests
4. If any fail, debug and fix
5. Refactor if needed
6. Repeat until all green
7. Output: <promise>COMPLETE</promise>
```

### 4. Escape Hatches

Always use `--max-iterations` as a safety net to prevent infinite loops on impossible tasks:

```bash
# Recommended: Always set a reasonable iteration limit
/ralph-loop "Try to implement feature X" --max-iterations 20

# In your prompt, include what to do if stuck:
# "After 15 iterations, if not complete:
#  - Document what's blocking progress
#  - List what was attempted
#  - Suggest alternative approaches"
```

**Note**: The `--completion-promise` uses exact string matching, so you cannot use it for multiple completion conditions (like "SUCCESS" vs "BLOCKED"). Always rely on `--max-iterations` as your primary safety mechanism.

## Philosophy

Ralph embodies several key principles:

### 1. Iteration > Perfection
Don't aim for perfect on first try. Let the loop refine the work.

### 2. Failures Are Data
"Deterministically bad" means failures are predictable and informative. Use them to tune prompts.

### 3. Operator Skill Matters
Success depends on writing good prompts, not just having a good model.

### 4. Persistence Wins
Keep trying until success. The loop handles retry logic automatically.

## When to Use Ralph

**Good for:**
- Well-defined tasks with clear success criteria
- Tasks requiring iteration and refinement (e.g., getting tests to pass)
- Greenfield projects where you can walk away
- Tasks with automatic verification (tests, linters)

**Not good for:**
- Tasks requiring human judgment or design decisions
- One-shot operations
- Tasks with unclear success criteria
- Production debugging (use targeted debugging instead)

## Real-World Results

- Successfully generated 6 repositories overnight in Y Combinator hackathon testing
- One $50k contract completed for $297 in API costs
- Created entire programming language ("cursed") over 3 months using this approach

## Learn More

- Original technique: https://ghuntley.com/ralph/
- Ralph Orchestrator: https://github.com/mikeyobrien/ralph-orchestrator

## For Help

Run `/help` in Claude Code for detailed command reference and examples.
