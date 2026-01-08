# Ralph Dashboard

[![CI](https://github.com/teknologist/claude-ralph-wiggum-pro/actions/workflows/ralph-dashboard-ci.yml/badge.svg)](https://github.com/teknologist/claude-ralph-wiggum-pro/actions/workflows/ralph-dashboard-ci.yml)
[![codecov](https://codecov.io/gh/teknologist/claude-ralph-wiggum-pro/graph/badge.svg?flag=ralph-dashboard)](https://codecov.io/gh/teknologist/claude-ralph-wiggum-pro)
![tests](https://img.shields.io/badge/tests-0_passing-brightgreen)
[![npm version](https://img.shields.io/npm/v/ralph-dashboard?color=blue)](https://www.npmjs.com/package/ralph-dashboard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

A web dashboard for monitoring and managing Ralph Wiggum loops.

## Features

- **View Active Loops**: See all currently running Ralph Wiggum loops in real-time
- **Loop History**: Browse archived loops with statistics and details
- **Cancel Loops**: Stop active loops directly from the dashboard
- **Delete History**: Permanently remove archived loops from history
- **Statistics**: Track success rates, durations, and iteration counts

## Installation

> **Note:** The dashboard will shortly be published to npm. Once available, you'll be able to run it with `bunx ralph-dashboard`.

**Running the Dashboard (for now):**

```bash
# Install dependencies
bun install

# Build and start
bun run build && bun run start

# Or run in development mode
bun run dev
```

### Options

```bash
# Custom port
bun run start -- --port 8080

# Public access (bind to all interfaces)
bun run start -- --host 0.0.0.0

# Both options
bun run start -- -p 8080 -h 0.0.0.0

# Show help
bun run start -- --help
```

Once running, open your browser to the displayed URL (default: http://localhost:3847).

## Development

### Prerequisites

- [Bun](https://bun.sh/) runtime

### Setup

```bash
# Install dependencies
bun install

# Start development server (frontend only)
bun run dev

# Start backend server
bun run dev:server

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage

# Run e2e tests
bun run test:e2e

# Run e2e tests in UI mode
bun run test:e2e:ui

# Type check
bun run typecheck

# Build for production
bun run build
```

### Project Structure

```
ralph-dashboard/
├── src/                    # Frontend React app
│   ├── components/         # React components
│   ├── hooks/              # React Query hooks
│   ├── lib/                # API client
│   └── __tests__/          # Frontend unit tests
├── server/                 # Backend Bun server
│   ├── api/                # API route handlers
│   ├── services/           # Business logic
│   └── __tests__/          # Backend unit tests
├── tests/
│   └── e2e/                # Playwright e2e tests
└── dist/                   # Production build
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| POST | `/api/sessions/:id/cancel` | Cancel an active session |
| POST | `/api/sessions/:id/archive` | Archive an orphaned session |
| DELETE | `/api/sessions/:id` | Permanently delete an archived session |
| GET | `/api/transcript/iterations/:loopId` | Get paginated iteration transcripts |
| GET | `/api/transcript/full/:loopId` | Get full transcript with user prompt |
| GET | `/api/transcript/check/:loopId` | Check if transcript exists |
| GET | `/api/checklist/:loopId` | Get checklist progress for a loop |

## Data Sources

The dashboard reads from the following files in `~/.claude/ralph-wiggum-pro/`:

| Directory | Purpose |
|-----------|---------|
| `loops/` | Active loop state files (frontmatter + prompt) |
| `logs/sessions.jsonl` | Session history (JSONL format) |
| `transcripts/` | Iteration and full transcript files |

## Requirements

- Ralph Wiggum Pro plugin must be installed and configured
- Sessions are logged to `~/.claude/ralph-wiggum-pro/logs/sessions.jsonl`
- State files stored in `~/.claude/ralph-wiggum-pro/loops/`

## License

MIT
