# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains the **Ralph Wiggum** plugin for Claude Code - a self-referential iteration loop system that enables autonomous, iterative task execution.

## Structure

```
/plugins/ralph-wiggum    # Main plugin directory
/ralph-dashboard         # Web dashboard for monitoring loops
```

## Ralph Wiggum Plugin

Ralph Wiggum creates self-referential development loops where Claude's output is fed back as input, enabling iterative refinement until a task is complete.

### Key Components

```
plugins/ralph-wiggum/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── commands/                 # Slash commands
│   ├── ralph-loop.md        # Start a loop in current session
│   ├── list-ralph-loops.md  # List active loops
│   └── cancel-ralph.md      # Cancel active loop
├── hooks/
│   ├── hooks.json           # Hook configuration
│   ├── session-start-hook.sh # Persists session ID
│   └── stop-hook.sh         # Intercepts exit, feeds prompt back
├── scripts/
│   ├── setup-ralph-loop.sh  # Creates state file for loop
│   ├── list-ralph-loops.sh  # Lists active loops
│   ├── cancel-ralph.sh      # Cancels loop
│   └── log-session.sh       # Session history logging
└── tests/                   # Comprehensive test suite
```

### How It Works

1. User runs `/ralph-loop <prompt> --completion-promise "DONE"`
2. `setup-ralph-loop.sh` creates a session-specific state file
3. Claude works on the task and tries to exit
4. `stop-hook.sh` intercepts the exit, checks for completion promise
5. If promise not found, feeds the same prompt back to continue
6. Loop continues until promise detected or max iterations reached

### Session Isolation

Each Claude Code session gets its own loop via `CLAUDE_SESSION_ID`:
- State files: `.claude/ralph-loop.{session_id}.local.md`
- Multiple terminals can run different loops simultaneously
- No cross-session interference

### State File Format

```yaml
---
active: true
session_id: "abc123"
description: "Build a REST API..."
iteration: 5
max_iterations: 50
completion_promise: "TASK COMPLETE"
started_at: "2024-01-15T10:30:00Z"
---

The actual prompt text goes here...
```

## Ralph Dashboard

A web-based monitoring dashboard for Ralph Wiggum loops.

### Tech Stack
- **Backend**: Fastify + TypeScript
- **Frontend**: React + Vite + TailwindCSS
- **Testing**: Vitest (96%+ coverage)

### Running the Dashboard

```bash
cd ralph-dashboard
pnpm install
pnpm dev        # Development mode
pnpm build      # Production build
pnpm test       # Run tests
```

## Development Guidelines

### Testing

All plugin scripts have comprehensive tests:

```bash
cd plugins/ralph-wiggum/tests
./run-all-tests.sh
```

Test categories:
- Session isolation tests
- State file parsing tests
- Promise detection tests
- Security validation tests
- Error handling tests

### Security Considerations

- Session IDs are validated to prevent path traversal
- Only alphanumeric, dots, hyphens, and underscores allowed
- Path traversal patterns (`..`) are rejected

### Plugin Architecture Rules

- Use `${CLAUDE_PLUGIN_ROOT}` for all internal path references
- Manifest (`plugin.json`) MUST be in `.claude-plugin/` directory
- Use kebab-case for file and directory names

## Environment Variables

- `CLAUDE_SESSION_ID` - Set by session-start hook, identifies current session
- `CLAUDE_ENV_FILE` - Path to environment file for session persistence
