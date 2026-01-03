# Ralph Dashboard - Web App Plan

## Overview
A standalone Bun web app that displays a dashboard of Ralph Wiggum loops (active and archived) with statistics and management capabilities.

## Requirements Summary
- **Runtime**: Bun (also compatible with Node/npx)
- **Package**: Standalone npm package `ralph-dashboard`
- **Port**: 3847 (default), configurable via `--port`
- **Binding**: localhost by default, `--host 0.0.0.0` for public access
- **UI**: Anthropic/Claude branding colors (coral #E07A5F, cream #F5F0E6, dark #1A1A1A)
- **Launch**: `bunx ralph-dashboard` or `npx ralph-dashboard`

## Architecture

### Part 1: Plugin Modification (ralph-wiggum)
Modify the existing plugin to log loop starts and store project paths for remote cancellation.

**File: `plugins/ralph-wiggum/scripts/log-session.sh`**
- Add new status type: `active` (for start entries)
- Accept direct params for start events (before state file exists)
- Store `state_file_path` in log entry (absolute path to `.claude/ralph-loop.{SESSION_ID}.local.md`)

**File: `plugins/ralph-wiggum/scripts/setup-ralph-loop.sh`**
- Call `log-session.sh` with `status=active` immediately when loop starts
- Pass: session_id, project_path, state_file_path, task, started_at, max_iterations, completion_promise

**File: `plugins/ralph-wiggum/commands/ralph-stats.md`**
- Update to merge two entries per session (start + completion) by `session_id`
- Add `--active` filter to show only active loops
- Show active loops with 🔄 status instead of outcome
- Handle sessions that only have start entry (still active)

**Log Format Update** (`~/.claude/ralph-wiggum-logs/sessions.jsonl`):
```json
// Start entry (new) - includes state_file_path for remote cancellation
{
  "session_id": "abc123",
  "status": "active",
  "project": "/Users/eric/myproject",
  "project_name": "myproject",
  "state_file_path": "/Users/eric/myproject/.claude/ralph-loop.abc123.local.md",
  "task": "Implement feature X...",
  "started_at": "2024-01-15T10:00:00Z",
  "max_iterations": 10,
  "completion_promise": "Feature X is complete"
}

// Completion entry (existing format, matched by session_id)
{
  "session_id": "abc123",
  "status": "completed",
  "outcome": "success",
  "ended_at": "2024-01-15T10:15:00Z",
  "duration_seconds": 900,
  "iterations": 5
}
```

### Part 2: Dashboard Package (new)

React + Vite + Tailwind setup inspired by CCS UI pattern. Located at **repository root**: `/ralph-dashboard/`

```
ralph-dashboard/
├── package.json          # name: ralph-dashboard, bin: ralph-dashboard
├── tsconfig.json
├── vite.config.ts        # Vite config with build output to dist/
├── vitest.config.ts      # Vitest config with coverage thresholds
├── tailwind.config.ts    # Tailwind with Claude colors
├── index.html            # Vite entry HTML
├── .github/workflows/
│   └── ci.yml            # Test + build + artifact upload (at repo root)
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Main app component
│   ├── index.css         # Tailwind imports + custom styles
│   ├── components/       # Reusable UI components
│   │   ├── Header.tsx
│   │   ├── StatsBar.tsx
│   │   ├── SessionTable.tsx
│   │   ├── SessionRow.tsx
│   │   ├── SessionDetail.tsx
│   │   └── ConfirmModal.tsx
│   ├── hooks/
│   │   ├── useSessions.ts    # React Query hook for fetching sessions
│   │   └── useCancelLoop.ts  # Mutation hook for cancellation
│   ├── lib/
│   │   └── api.ts            # API client functions
│   └── __tests__/        # Frontend unit tests
│       ├── useSessions.test.ts
│       ├── useCancelLoop.test.ts
│       ├── SessionTable.test.tsx
│       ├── SessionRow.test.tsx
│       └── ConfirmModal.test.tsx
├── server/               # Backend (runs in Bun)
│   ├── index.ts          # CLI entry point, arg parsing
│   ├── server.ts         # Bun.serve HTTP server
│   ├── api/
│   │   ├── sessions.ts   # GET /api/sessions
│   │   └── cancel.ts     # POST /api/sessions/:id/cancel
│   ├── services/
│   │   ├── log-parser.ts # Parse JSONL, merge start+end entries
│   │   └── loop-manager.ts # Delete state files for cancellation
│   └── __tests__/        # Backend unit tests
│       ├── log-parser.test.ts
│       ├── loop-manager.test.ts
│       ├── sessions.test.ts
│       └── cancel.test.ts
├── tests/
│   └── e2e/              # End-to-end tests
│       ├── dashboard.test.ts
│       ├── cancel-loop.test.ts
│       ├── empty-state.test.ts
│       └── polling.test.ts
├── dist/                 # Pre-built frontend (via CI artifact)
└── README.md
```

### How bunx Works
1. `npm publish` includes pre-built `dist/` folder
2. `bunx ralph-dashboard` runs `server/index.ts`
3. Server serves static files from `dist/` + API endpoints
4. Dev mode: `bun run dev` starts Vite dev server + API proxy

### Components

#### Backend (server/)

**CLI Entry (`server/index.ts`)**
```typescript
// Parse args: --port 3847, --host localhost
// Start Bun.serve, print URL
```

**Log Parser Service (`server/services/log-parser.ts`)**
- Read `~/.claude/ralph-wiggum-logs/sessions.jsonl`
- Group entries by session_id
- Merge start (active) + end entries into unified session objects
- Sessions with only start entry = active loops
- Return: `Session[]` with status: 'active' | 'completed' | 'cancelled' | 'error'

**Loop Manager Service (`server/services/loop-manager.ts`)**
- `cancelLoop(session: Session): void` - delete state file using `state_file_path` from log

**API Endpoints (`server/api/`)**
- `GET /api/sessions` - List all sessions (active first, then by date)
- `GET /api/sessions/:id` - Get single session with full details
- `POST /api/sessions/:id/cancel` - Cancel active loop (deletes state file)

#### Frontend (src/)

**App.tsx** - Main layout with Header, StatsBar, SessionTable

**Components:**
- `Header.tsx` - "Ralph Dashboard" title with Claude branding
- `StatsBar.tsx` - Total loops, active count, avg duration, success rate
- `SessionTable.tsx` - Tabbed table (Active | Archived) with sortable columns
- `SessionRow.tsx` - Expandable row showing: Project, Task, Status, Duration, Iterations
- `SessionDetail.tsx` - Expanded view with full task, completion promise, cancel button
- `ConfirmModal.tsx` - Confirmation dialog for cancel action

**Hooks:**
- `useSessions()` - React Query with 5s polling for active sessions
- `useCancelLoop()` - Mutation that calls cancel API + invalidates sessions

**Color Palette (Anthropic/Claude via Tailwind)**:
```typescript
// tailwind.config.ts
colors: {
  claude: {
    coral: '#E07A5F',      // Primary accent
    'coral-dark': '#DA7756', // Hover state
    cream: '#FAF9F6',      // Background
    dark: '#1A1A1A',       // Text
  }
}
```

## Implementation Order

### Phase 1: Plugin Changes (ralph-wiggum)
1. Update `log-session.sh` to support `active` status and accept direct params
2. Modify `setup-ralph-loop.sh` to log on loop start with `state_file_path`
3. Update `ralph-stats.md` to merge entries by session_id and show active loops
4. Test: Start a loop, verify JSONL has active entry; run `/ralph-stats --active`

### Phase 2: Dashboard Setup
1. Initialize package with Vite + React + TypeScript + Tailwind
2. Configure Tailwind with Claude color palette
3. Set up package.json with bin entry pointing to `server/index.ts`

### Phase 3: Backend
1. Implement `server/services/log-parser.ts` - JSONL parsing and session merging
2. Implement `server/services/loop-manager.ts` - state file deletion
3. Implement `server/api/sessions.ts` and `server/api/cancel.ts`
4. Implement `server/server.ts` - Bun.serve with static + API routing
5. Implement `server/index.ts` - CLI arg parsing (--port, --host)

### Phase 4: Frontend
1. Create `App.tsx` with basic layout
2. Implement `useSessions` hook with React Query polling
3. Build components: Header, StatsBar, SessionTable, SessionRow
4. Add SessionDetail expansion and ConfirmModal
5. Wire up cancel functionality with `useCancelLoop`

### Phase 5: Testing
1. Write backend unit tests (log-parser, loop-manager, API endpoints)
2. Write frontend unit tests (hooks, components)
3. Write E2E tests (dashboard flow, cancel loop, empty states)
4. Ensure 80%+ code coverage

### Phase 6: CI/CD & Package
1. Create `.github/workflows/ci.yml` (test + build + artifact)
2. Configure Codecov integration
3. Build frontend (`bun run build`)
4. Test artifact download and local run
5. Publish to npm (`npm publish`)
6. Add README with usage instructions

## Key Files to Modify

**Existing (ralph-wiggum plugin)**:
- `plugins/ralph-wiggum/scripts/setup-ralph-loop.sh` - Log on start with state_file_path
- `plugins/ralph-wiggum/scripts/log-session.sh` - Support active status, direct params
- `plugins/ralph-wiggum/commands/ralph-stats.md` - Merge entries by session_id, add --active filter

**New (ralph-dashboard package)**:
```
ralph-dashboard/
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── index.html
├── .github/workflows/ci.yml  # At repo root
├── src/
│   ├── main.tsx, App.tsx, index.css
│   ├── components/*.tsx (6 files)
│   ├── hooks/*.ts (2 files)
│   ├── lib/api.ts
│   └── __tests__/*.test.ts(x) (5 files)
├── server/
│   ├── index.ts, server.ts
│   ├── api/*.ts (2 files)
│   ├── services/*.ts (2 files)
│   └── __tests__/*.test.ts (4 files)
└── tests/e2e/*.test.ts (4 files)
```

**Total: ~35 files** (13 source + 13 tests + 9 config/workflow)

## Testing Strategy

### Unit Tests (Vitest)
**Backend (`server/__tests__/`):**
- `log-parser.test.ts` - Parse JSONL, merge entries, handle edge cases (corrupted data, missing fields)
- `loop-manager.test.ts` - State file deletion, file not found handling
- `sessions.test.ts` - API endpoint responses, filtering, sorting
- `cancel.test.ts` - Cancel endpoint, error handling

**Frontend (`src/__tests__/`):**
- `useSessions.test.ts` - Hook behavior, polling, error states
- `useCancelLoop.test.ts` - Mutation, cache invalidation
- `SessionTable.test.tsx` - Rendering, tab switching, sorting
- `SessionRow.test.tsx` - Expansion, data display
- `ConfirmModal.test.tsx` - Open/close, confirm/cancel actions

### End-to-End Tests (Vitest + Testing Library)
**`tests/e2e/`:**
- `dashboard.test.ts` - Full flow: load sessions, expand row, view details
- `cancel-loop.test.ts` - Cancel active loop, verify UI updates
- `empty-state.test.ts` - No sessions, error states
- `polling.test.ts` - Auto-refresh when active loops exist

### Test Configuration
```typescript
// vitest.config.ts
export default {
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80
      }
    }
  }
}
```

## GitHub Actions CI/CD

### `.github/workflows/ci.yml`
```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run typecheck
      - run: bun run lint
      - run: bun run test:coverage
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run build
      - uses: actions/upload-artifact@v4
        with:
          name: ralph-dashboard-bundle
          path: |
            dist/
            server/
            package.json
            README.md
```

### Distribution Methods

**1. npm (primary):**
```bash
bunx ralph-dashboard          # or npx ralph-dashboard
bunx ralph-dashboard --port 8080 --host 0.0.0.0
```

**2. GitHub Artifact (manual):**
1. Go to Actions → Latest successful run → Artifacts
2. Download `ralph-dashboard-bundle.zip`
3. Extract and run: `bun server/index.ts`

## Non-Goals (Keep Simple)
- No authentication (as specified)
- No database (JSONL is the source of truth)
- No React Router (single page is sufficient)
- No WebSocket (polling is sufficient for this use case)
- Minimal dependencies (React, React Query, Tailwind only)
