> **⚠️ Work in Progress**: This plugin is under active development. Expect bugs and breaking changes.

## Installation

Install this plugin in Claude Code:

```bash
# First, add the marketplace (one-time setup)
/plugin marketplace add https://github.com/teknologist/claude-ralph-wiggum-pro.git

# Then install the plugin
/plugin install ralph-wiggum-pro@teknologist-plugins
```

---

# Ralph Wiggum Pro

Implementation of the Ralph Wiggum technique for iterative, self-referential AI development loops in Claude Code.

> **Based on**: This is an enhanced version of the [official ralph-wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum) from Anthropic. See [Enhancements](#enhancements-in-this-fork) below for additions made in this version.

## Enhancements in This Fork

This fork adds the following features on top of the original Anthropic plugin:

### v2.2.x - Robust Multi-Session Architecture (Latest)

**Core Architecture:**
- **Global Directory Consolidation**: All Ralph data stored under `~/.claude/ralph-wiggum-pro/`:
  - `loops/` - State files for active loops
  - `logs/` - Session logs (`sessions.jsonl`, `debug.log`)
  - `sessions/` - PPID session tracking files
  - `transcripts/` - Iteration and full transcript files
- **PPID-Based Session Tracking**: Reliable session identification using process tree walking:
  - Session ID stored in `ppid_$PID.id` files (keyed by Claude Code's PID)
  - Survives `/clear` commands within the same terminal
  - Automatically synchronized when Claude Code regenerates session IDs internally
- **Simplified State Management**: File existence = active loop (no more `active` field in frontmatter)
- **Automatic Cleanup**: SessionEnd hook removes state files when terminal closes

**Session ID Synchronization (v2.2.9):**
- Stop hook walks process tree to find existing PPID file
- Updates PPID file with current session ID when mismatch detected
- Ensures subsequent loops in the same session work correctly
- Uses atomic writes (`mktemp` + `mv`) for safe concurrent access

**Transcript System (v2.1.x):**
- Iteration-by-iteration output capture
- Timeline view with collapsible iterations in dashboard
- Full transcript modal with search functionality
- Export transcripts as Markdown

**Checklist System (v2.1.1):**
- Task and acceptance criteria tracking
- Progress display in dashboard and `/ralph-wiggum-pro:ralph-stats`
- Checklist summary in each iteration's system message

### v2.0.x - Dashboard & Session Logging

- **Ralph Dashboard**: Web-based dashboard for monitoring and managing Ralph loops
  - View all active and archived loops in real-time
  - Cancel active loops directly from the browser
  - Track statistics: success rates, durations, iteration counts
  - Run with `bunx ralph-dashboard` or `npx ralph-dashboard`
  - Configurable port (`--port`) and host (`--host 0.0.0.0` for public access)
- **Session Logging**: All loops logged to `~/.claude/ralph-wiggum-pro/logs/sessions.jsonl`
- **`/ralph-wiggum-pro:ralph-stats` Command**: View historical loop data with filtering by project, outcome, or count
- **Active Loop Tracking**: Loops logged when they start (not just when complete)
- **Remote Cancellation**: Cancel loops from dashboard
- **Atomic Writes**: All file operations use `mktemp` + `mv` pattern

### v1.1.0 - Session Isolation

- **Multi-Session Support**: Multiple Claude Code terminals can run independent Ralph loops
- **Session-Scoped State Files**: Each session gets isolated state files
- **Confirmation Prompts**: `/ralph-wiggum-pro:cancel-ralph` asks for confirmation before cancelling
- **Comprehensive Test Suite**: Tests for session isolation, state file parsing, security validation

---

## Features

- **Session Isolation**: Multiple Claude Code terminals can run independent Ralph loops on the same project
- **Progress Tracking**: Elapsed time display and iteration counting
- **File-based Prompts**: Load complex prompts from markdown files with `--prompt-file`
- **Loop Management**: List all active loops with `/ralph-wiggum-pro:list-ralph-loops`, cancel specific loops with `/ralph-wiggum-pro:cancel-ralph`
- **Session Logging**: All loop sessions are logged to `~/.claude/ralph-wiggum-pro/logs/sessions.jsonl` with structured JSON data
- **Session Stats**: View historical loop data with `/ralph-wiggum-pro:ralph-stats` - filter by project, outcome, or time range

## What is Ralph?

Ralph is a development methodology based on continuous AI agent loops. As Geoffrey Huntley describes it: **"Ralph is a Bash loop"** - a simple `while true` that repeatedly feeds an AI agent a prompt file, allowing it to iteratively improve its work until completion.

The technique is named after Ralph Wiggum from The Simpsons, embodying the philosophy of persistent iteration despite setbacks.

### Core Concept

This plugin implements Ralph using a **Stop hook** that intercepts Claude's exit attempts:

```bash
# You run ONCE:
/ralph-wiggum-pro:ralph-loop "Your task description. Output <promise>DONE</promise> when complete." --completion-promise DONE

# Then Claude Code automatically:
# 1. Works on the task
# 2. Tries to exit
# 3. Stop hook blocks exit (unless <promise>DONE</promise> was output)
# 4. Stop hook feeds the SAME prompt back
# 5. Repeat until completion
```

**Important**: Your prompt must instruct Claude to output `<promise>KEYWORD</promise>` when done. The `--completion-promise` option tells the stop hook what KEYWORD to look for inside those tags.

The loop happens **inside your current session** - you don't need external bash loops. The Stop hook in `hooks/stop-hook.sh` creates the self-referential feedback loop by blocking normal session exit.

This creates a **self-referential feedback loop** where:
- The prompt never changes between iterations
- Claude's previous work persists in files
- Each iteration sees modified files and git history
- Claude autonomously improves by reading its own past work in files

## Architecture

### Process Tree & Session ID Resolution

```
Claude Code (PID=35553)  ← session-start-hook writes to ppid_35553.id
├─ shell (PID=37816)     ← setup-ralph-loop's $PPID
│   └─ setup-ralph-loop (PID=37832)  ← walks UP tree to find ppid_35553.id
└─ shell (PID=38001)     ← stop-hook's $PPID (different!)
    └─ stop-hook (PID=38012)  ← also walks UP tree to find ppid_35553.id
```

Both `setup-ralph-loop.sh` and `stop-hook.sh` walk up the process tree to find the Claude Code PID and its corresponding session file. This ensures consistent session ID resolution regardless of shell nesting depth.

### Directory Structure

All Ralph data is stored under `~/.claude/ralph-wiggum-pro/`:

```
~/.claude/ralph-wiggum-pro/
├── loops/                    # Active loop state files
│   └── ralph-loop.{session_id}.local.md
├── logs/
│   ├── sessions.jsonl        # Session history (JSONL format)
│   └── debug.log             # Debug output (auto-rotates at 1MB)
├── sessions/                 # PPID-based session tracking
│   └── ppid_{pid}.id         # Contains session ID for Claude Code process
└── transcripts/              # Iteration transcripts
    ├── {loop_id}_iter_{n}.txt
    └── {loop_id}_full.txt
```

### State File Format

State files use YAML frontmatter followed by the prompt:

```yaml
---
session_id: "abc123"
loop_id: "xK9mZ"
description: "Build a REST API..."
iteration: 5
max_iterations: 50
completion_promise: "TASK COMPLETE"
started_at: "2024-01-15T10:30:00Z"
---

Your prompt text here...
```

### Session ID Synchronization

Claude Code may internally regenerate session IDs (e.g., after `/clear` or when conversation context changes). The stop hook handles this by:

1. Receiving the **current** session ID from Claude Code's hook JSON
2. Walking the process tree to find the **existing** PPID file
3. Updating that PPID file with the current session ID (atomic write)
4. Subsequent `/ralph-wiggum-pro:ralph-loop` commands then read the correct session ID

This ensures Ralph loops continue working even when session IDs change internally.

> **Note**: This PPID-based workaround is necessary because `CLAUDE_SESSION_ID` is only available to hooks, not to slash commands. There is an [open feature request](https://github.com/anthropics/claude-code/issues/1407) on the Claude Code GitHub repository asking for session IDs to be exposed to commands as well.

## Quick Start

```bash
/ralph-wiggum-pro:ralph-loop "Build a REST API for todos. Requirements: CRUD operations, input validation, tests. Output <promise>COMPLETE</promise> when done." --completion-promise COMPLETE --max-iterations 50
```

Claude will:
- Implement the API iteratively
- Run tests and see failures
- Fix bugs based on test output
- Iterate until all requirements met
- Output the completion promise when done

## Commands

### /ralph-wiggum-pro:ralph-loop

Start a Ralph loop in your current session. Each session gets its own isolated loop - you can run multiple loops in different terminals on the same project.

**Usage:**
```bash
# Inline prompt (must include <promise> instruction!)
/ralph-wiggum-pro:ralph-loop "<prompt with instruction to output <promise>KEYWORD</promise>>" --completion-promise KEYWORD

# File-based prompt (for complex tasks)
/ralph-wiggum-pro:ralph-loop --prompt-file ./prompts/my-task.md --max-iterations 50 --completion-promise DONE
```

**Options:**
- `--prompt-file <path>` - Read prompt from a markdown file instead of inline
- `--max-iterations <n>` - Stop after N iterations (default: unlimited)
- `--completion-promise <text>` - Keyword to detect inside `<promise>` tags (quotes optional for single words)

**Examples:**
```bash
# Simple inline prompt - note the <promise> instruction in the prompt
/ralph-wiggum-pro:ralph-loop "Build a REST API for todos. Output <promise>DONE</promise> when complete." --completion-promise DONE --max-iterations 20

# Complex prompt from file (file should contain <promise> instructions)
/ralph-wiggum-pro:ralph-loop --prompt-file ./tasks/api-spec.md --completion-promise COMPLETE

# Multi-word promise (requires quotes)
/ralph-wiggum-pro:ralph-loop --prompt-file task.md --max-iterations 50 --completion-promise "ALL TESTS PASS"
```

**Critical**: Your prompt (inline or in file) MUST instruct Claude to output `<promise>KEYWORD</promise>` when done. The stop hook looks for this exact XML tag pattern.

### /ralph-wiggum-pro:list-ralph-loops

List all active Ralph loops across all sessions in the current project.

**Usage:**
```bash
/ralph-wiggum-pro:list-ralph-loops
```

Shows each loop's:
- Session ID (truncated)
- Task description
- Current iteration / max iterations
- Elapsed time since start

### /ralph-wiggum-pro:cancel-ralph

Cancel active Ralph loop(s). If multiple loops exist, you'll be prompted to select which to cancel.

**Usage:**
```bash
/ralph-wiggum-pro:cancel-ralph
```

**Behavior:**
- Single loop: Cancels immediately (after confirmation)
- Multiple loops: Shows list with descriptions, allows selecting one or all to cancel
- Logs the cancellation to session history

### /ralph-wiggum-pro:ralph-stats

View historical Ralph loop session data.

**Usage:**
```bash
/ralph-wiggum-pro:ralph-stats                        # Show last 10 sessions
/ralph-wiggum-pro:ralph-stats --last 20              # Show last 20 sessions
/ralph-wiggum-pro:ralph-stats --project my-api       # Filter by project name
/ralph-wiggum-pro:ralph-stats --outcome success      # Filter by outcome
/ralph-wiggum-pro:ralph-stats --all                  # Show all sessions
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

**Log location:** `~/.claude/ralph-wiggum-pro/logs/sessions.jsonl`

### Ralph Dashboard

View and manage your Ralph loops in a web browser.

> **Note:** The dashboard will shortly be published to npm. Once available, you'll be able to run it with `bunx ralph-dashboard`.

**Running the Dashboard (for now):**

```bash
# Clone the repo and navigate to the dashboard directory
cd ralph-dashboard

# Install dependencies
bun install

# Build and start
bun run build && bun run start

# Or run in development mode
bun run dev
```

**Options:**
```bash
# Custom port
bun run start -- --port 8080

# Public access (for remote monitoring)
bun run start -- --host 0.0.0.0

# Both options
bun run start -- -p 8080 -h 0.0.0.0
```

**Features:**
- Real-time view of active and archived loops
- Statistics: success rate, average duration, iteration counts
- Cancel active loops with one click
- Automatic refresh every 5 seconds

Open http://localhost:3847 in your browser to view the dashboard.

## Prompt Writing Best Practices

**The key to successful Ralph loops is a clear, stepped workflow with explicit success criteria.**

### 1. Always Include Promise Instructions

Your prompt MUST tell Claude to output `<promise>KEYWORD</promise>` when done:

❌ Bad: "Build a todo API and make it good."

✅ Good:
```markdown
Build a REST API for todos.

Requirements:
- All CRUD endpoints working
- Input validation in place
- Tests passing (coverage > 80%)
- README with API docs

When ALL requirements are met, output: <promise>COMPLETE</promise>
```

### 2. Clear Stepped Workflow

Define explicit steps for Claude to follow. This is crucial for successful outcomes:

❌ Bad: "Create a complete e-commerce platform."

✅ Good:
```markdown
Build an e-commerce platform following these steps IN ORDER:

STEP 1: User Authentication
- Implement JWT auth with login/register
- Write tests for auth endpoints
- Verify tests pass before proceeding

STEP 2: Product Catalog
- Create product CRUD endpoints
- Implement search functionality
- Write and pass tests

STEP 3: Shopping Cart
- Implement add/remove/update cart
- Write and pass tests

WORKFLOW:
1. Complete each step fully before moving to next
2. Run tests after each implementation
3. Fix any failures before proceeding
4. When ALL steps complete and tests pass, output: <promise>COMPLETE</promise>
```

### 3. Self-Correction Through Iteration

Ralph naturally iterates - Claude sees its previous work and continues. No explicit "go back" instructions needed:

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
7. When all tests successfully pass, output: <promise>COMPLETE</promise>
```

### 4. Escape Hatches

Always use `--max-iterations` as a safety net to prevent infinite loops on impossible tasks:

```bash
# Recommended: Always set a reasonable iteration limit
/ralph-wiggum-pro:ralph-loop "Implement feature X. Output <promise>DONE</promise> when complete." --completion-promise DONE --max-iterations 20
```

In your prompt, you can also include fallback instructions:
```markdown
If after multiple iterations the task seems impossible:
- Document what's blocking progress
- List what was attempted
- Suggest alternative approaches
- Output: <promise>BLOCKED</promise>
```

**Note**: The `--completion-promise` looks for exact text inside `<promise>` tags. You cannot use multiple completion keywords - pick one and use `--max-iterations` as your primary safety mechanism.

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

Run `/ralph-wiggum-pro:help` in Claude Code for detailed command reference and examples.
