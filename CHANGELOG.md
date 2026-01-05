# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.1] - 2026-01-05

### Added
- **Checklist Progress in Stats**: `ralph-stats` command now displays checklist progress in a new column (format: "X/Y tasks • A/B criteria")
- **Checklist in Iteration Messages**: Stop-hook now shows checklist summary in each iteration's system message

### Changed
- **Stats Table Layout**: Removed duration column from `ralph-stats` output to make room for checklist progress column
- **Task Column Width**: Reduced task display width from 30 to 22 characters in `ralph-stats` to accommodate new checklist column
- **Loop ID Validation**: Simplified validation in stop-hook from aggressive regex to basic sanity check (loop_id is internally generated, not user input)
- **E2E Test Organization**: Moved e2e tests from `ralph-dashboard/e2e/` to `ralph-dashboard/tests/e2e/` for better organization

## [2.1.0] - 2026-01-05

### Added
- **Transcript Capture and Display**: Complete transcript system for viewing loop iterations
  - Iteration-by-iteration output capture to `~/.claude/ralph-wiggum-pro-logs/transcripts/`
  - Timeline view with collapsible iteration cards in dashboard
  - Full transcript modal with search functionality
  - Export transcripts as Markdown with session metadata
  - Per-iteration duration tracking
  - Highlighted search terms across iterations
  - 422 comprehensive unit and E2E tests (96.96% coverage)
- **Error Boundaries**: React ErrorBoundary component for TranscriptTimeline and FullTranscriptModal to prevent dashboard crashes
- **Dashboard Components**:
  - TranscriptTimeline: Collapsible timeline with search, export, and "view full" actions
  - FullTranscriptModal: Modal for viewing complete transcript with search
  - ErrorBoundary: Class component for catching React rendering errors
- **API Endpoints**:
  - `/api/transcript/iterations/:loopId` - Get paginated iterations
  - `/api/transcript/full/:loopId` - Get full transcript with user prompt
  - `/api/transcript/check/:loopId` - Check transcript availability
- **React Query Hooks**:
  - `useTranscriptIterations` - Fetch iteration data
  - `useFullTranscript` - Fetch complete transcript
  - `useTranscriptAvailability` - Check if transcript exists
- **Bash Hook Security**: Added `validate_loop_id()` function with regex validation, path traversal prevention, and max length limit
- **E2E Tests**: Playwright tests for transcript timeline, modal, search, and export functionality

### Fixed
- **Critical: Bash hook silent failures**: Removed `|| true` patterns, added proper error checking and logging to transcript operations in stop-hook.sh
- **Critical: Empty catch blocks**: Added error logging to all catch blocks in transcript-service.ts
- **Critical: Duplicate type definitions**: Removed duplicate types from transcript.ts API file, imported from central types.ts
- **High Priority: E2E test timeouts**: Replaced hard-coded `waitForTimeout()` with explicit wait conditions for better reliability
- **High Priority: Missing error boundaries**: Wrapped TranscriptTimeline and FullTranscriptModal with ErrorBoundary components
- **Unit test mock lifecycle**: Fixed hooks.test.tsx error tests to use `mockImplementation` with rejections instead of `mockResolvedValueOnce` to properly handle React Query retries
- **Unit test ambiguous selectors**: Fixed SessionDetail.test.tsx to use `getAllByText` for elements appearing multiple times

### Changed
- Dashboard now displays iteration count in transcript timeline header
- Improved error messages for transcript loading failures
- Better mobile responsiveness for transcript timeline and modal
- Enhanced loading states with spinners for transcript data

## [2.0.19] - 2026-01-05

### Removed
- **Near-miss detection**: Removed misleading "ALMOST! You forgot the `<promise>` tags!" message from stop-hook - XML tags were being detected correctly but not displayed, making this warning inaccurate

## [2.0.18] - 2026-01-05

### Added
- **Stop-hook debug logging**: Comprehensive debug logging to `~/.claude/ralph-wiggum-pro-logs/debug.log` for diagnosing loop issues - logs session IDs, state file lookups, promise detection, and blocking decisions
- **Dashboard archive API**: New `/api/sessions/archive` endpoint for managing archived sessions
- **Dashboard archive hook**: `useArchiveLoop` React Query hook for archive operations

### Changed
- **Log session error handling**: `log_session()` function now logs errors to debug.log instead of silently suppressing them with `2>/dev/null || true`
- **Dashboard tests**: Added comprehensive test coverage for SessionCard, SessionDetail, SessionRow, StatusBadge, and API hooks

## [2.0.17] - 2026-01-05

### Fixed
- **Dashboard test mock lifecycle**: Fixed potential flaky tests in SessionTable by adding proper `beforeEach`/`afterEach` hooks for mock cleanup, ensuring mobile view mode mock is reset even if test fails
- **E2E test route interception**: Narrowed route patterns to specific endpoints (`**/api/sessions/*/cancel` and `**/api/sessions/*` with method checks) to prevent interference with parallel tests
- **Script error handling**: Added comprehensive error handling to `calc-coverage.mjs` script with helpful messages for file not found, invalid JSON, and other I/O errors
- **Bash script documentation**: Added clarifying comments in `stop-hook.sh` to explain `|| echo ""` and `|| true` patterns used for handling grep exit codes under `set -e`

### Changed
- **Dashboard test organization**: Refactored mobile behavior tests into nested describe block with proper lifecycle hooks
- **Documentation**: Updated test count badge in dashboard README to reflect 274 passing tests
- **Test references**: Added cross-references from unit tests to E2E tests that cover error handlers with alert() calls

## [2.0.16] - 2026-01-05

### Fixed
- **Stop-hook exit code 1 failures**: Added error handling to prevent `grep` commands from causing script termination under `set -euo pipefail` when they find no matching lines. Affects grep operations in `find_state_file_from_log`, field extraction (iteration, max_iterations, completion_promise), and started_at parsing.

## [2.0.15] - 2026-01-05

### Fixed
- **Critical: Empty lines in sessions.jsonl breaking stop-hook**: log-session.sh was writing blank lines between JSONL entries, causing jq error "Cannot index array with string 'session_id'" when stop-hook tried to query the log file
- **Stop-hook jq query**: Now filters empty lines before processing with grep to prevent jq errors on malformed JSONL data

### Changed
- **Dashboard tests**: Added 4 new tests (log-parser retry handling, loop-manager invalid path errors, StatsBar undefined duration, mobile viewport E2E)

## [2.0.14] - 2026-01-05

### Fixed
- **State file path resolution**: Stop-hook now queries session log for absolute state file path, fixing bug where completion wasn't logged when exiting from subdirectory (e.g., `ralph-dashboard/`)
- **Security**: Added path validation for state_file_path from log to prevent path traversal attacks
- **Security**: Temp file creation now uses `mktemp` for atomic file operations instead of PID-based naming

### Changed
- **Dashboard tests**: Refactored DOM queries to use Testing Library `within()` helper with proper null guards instead of non-null assertions
- **Dashboard tests**: Added 15 new tests for SessionCard covering expand/collapse, modal interactions, time calculations, and edge cases (now 36 tests total, 91.46% function coverage)
- **Dashboard**: Added `@testing-library/user-event` dependency for improved user interaction testing

## [2.0.13] - 2026-01-04

### Fixed
- **Documentation**: Updated README and help command to clarify that prompts must include `<promise>KEYWORD</promise>` instructions
- **Documentation**: Removed misleading "go back to step" language - Ralph naturally iterates without explicit loop instructions
- **Documentation**: Single-word `--completion-promise` values no longer shown with unnecessary quotes

## [2.0.12] - 2026-01-04

### Fixed
- **Duration calculation timezone bug**: `log-session.sh` now uses `-u` flag when parsing UTC timestamps, fixing incorrect durations (e.g., showing 1h 4m instead of 5m)
- **Dashboard modal padding**: Removed inconsistent `pb-safe` from ConfirmModal for consistent 24px padding on all sides

## [2.0.11] - 2026-01-04

### Fixed
- **Critical: Completion promise detection broken** - Stop hook used incorrect jq path `.role` instead of `.message.role` to find assistant messages in transcript, causing `<promise>` tags to never be detected and loops to run forever
- Updated test fixtures to use correct Claude Code transcript format `{"message":{"role":"assistant",...}}` instead of incorrect `{"role":"assistant","message":{...}}`

## [2.0.10] - 2026-01-04

### Added
- **Mobile responsive dashboard design**: Swipe left to delete, swipe right to cancel loops
- Dashboard progress bar visualization for loop iterations

### Fixed
- State file lookup in stop-hook now scans frontmatter for `session_id` match instead of relying on environment variable
- Fallback to most recent state file by `started_at` timestamp when multiple exist

## [2.0.8] - 2026-01-04

### Fixed
- **State file lookup in ralph-loop.md**: Fixed incorrect path pattern that used `${CLAUDE_SESSION_ID}` instead of scanning frontmatter for `session_id` match (consistent with stop-hook.sh)
- Added fallback to pick most recent state file by `started_at` timestamp if multiple exist (edge case from failed cleanup)

## [2.0.7] - 2026-01-04

### Added
- **Progress Bar Visualization**: Visual progress bar for loop iterations in dashboard
  - Color-coded: green (<50%), coral (50-69%), orange (70-89%), red (>=90%)
  - Pulse animation for active sessions
  - Two sizes: 'sm' for table rows, 'md' for detail view
  - Shows percentage and iteration count labels
  - 22 comprehensive tests for ProgressBar component
- Loop ID and Session ID display fields in SessionDetail component with truncate tooltips
- Atomic `--delete` flag for `log-session.sh` to delete state files immediately after logging
- Test for backward-compatible sessions (legacy `loop_id` fallback)

### Fixed
- **Dashboard bug**: Frontend used `session_id` instead of `loop_id` for cancel/delete API calls, causing "Loop not found" errors
- Renamed `sessionId` to `loopId` in server code for naming consistency

### Changed
- Error messages updated from "Session not found" to "Loop not found"
- Renamed `validateSessionId` to `validateLoopId` in server validation

## [2.0.6] - 2026-01-04

### Added
- **Unique Loop Identifiers (`loop_id`)**: Each `/ralph-loop` invocation now generates a unique UUID, fixing dashboard issues when loops are cancelled and restarted in the same session
- Backward compatibility for legacy log entries without `loop_id` (falls back to `session_id`)

### Changed
- State files now named with `loop_id` instead of `session_id` (`.claude/ralph-loop.{loop_id}.local.md`)
- Stop hook finds state files by scanning frontmatter for `session_id` match (cross-platform compatible)
- Dashboard groups sessions by `loop_id` instead of `session_id`

### Fixed
- Dashboard now correctly shows restarted loops as separate entries instead of incorrectly merging them
- Fixed macOS sed compatibility in stop-hook.sh (BSD/GNU compatible pattern matching)
- Fixed `log-session.sh` to handle older state files without `loop_id` field

## [2.0.5] - 2026-01-04

### Added
- Near-miss detection for completion promise: when Claude outputs the phrase without `<promise>` XML tags, the hook now shows a clear correction message instead of silently continuing
- Enhanced system message format with multi-line display and visual separators for better visibility

### Fixed
- Fixed timezone bug in `test-list-ralph-loops.sh` test 8 causing CI failures on Linux (epoch-based time calculation)

## [2.0.4] - 2026-01-04

### Changed
- Renamed plugin from `ralph-wiggum` to `ralph-wiggum-pro`
- Renamed plugin directory from `plugins/ralph-wiggum` to `plugins/ralph-wiggum-pro`
- Updated log directory from `~/.claude/ralph-wiggum-logs/` to `~/.claude/ralph-wiggum-pro-logs/`
- Updated GitHub repository to `teknologist/claude-ralph-wiggum-pro`

### Fixed
- Fixed failing unit tests in loop-manager.test.ts (test assertions didn't match implementation)
- Added plugin tests and E2E tests to CI workflow

## [2.1.0] - 2026-01-04

### Changed
- Refactored repository to focus exclusively on Ralph Wiggum plugin
- Removed all other plugins (external_plugins/, plugins/* except ralph-wiggum)
- Updated CLAUDE.md and README.md to reflect Ralph Wiggum focus

### Fixed
- Fixed critical quote stripping bug in stop-hook.sh (`\"\"` → `\"`)

### Added
- Comprehensive tests for promise detection and argument parsing
- Security validation for session IDs (path traversal prevention)

## [2.0.1] - 2026-01-03

### Added
- **Ralph Dashboard**: Web-based dashboard for monitoring and managing loops
  - Real-time view of active and archived loops
  - Cancel active loops from browser
  - Statistics: success rates, durations, iteration counts
  - Configurable port (`--port`) and host (`--host 0.0.0.0`)
- Active loop tracking (loops logged when they start, not just complete)
- Remote cancellation via dashboard
- Permanent delete for archived sessions
- CI coverage badges and automated test count updates
- Comprehensive unit and e2e tests (98% coverage)

### Fixed
- Improved completion promise parsing (checks all assistant messages, not just last)
- Dashboard reliability improvements
- CI workflow location moved to root .github/workflows

## [2.0.0] - 2026-01-02

### Added
- **Session Logging**: All loop sessions logged to `~/.claude/ralph-wiggum-pro-logs/sessions.jsonl`
- **`/ralph-stats` Command**: View historical loop data with filtering
- Cancellation logging to session history
- Atomic writes for log entries
- jq dependency check with clear error message
- Fork notice and enhancements section in README

## [1.1.0] - 2026-01-01

### Added
- **Multi-Session Support**: Multiple Claude Code terminals can run independent loops
- **Session-Scoped State Files**: `.claude/ralph-loop.{session_id}.local.md`
- **SessionStart Hook**: Persists `CLAUDE_SESSION_ID` to environment
- Confirmation prompts for `/cancel-ralph`
- Comprehensive test suite for session isolation

### Fixed
- Zsh glob expansion errors in `/list-ralph-loops`
- Zsh glob expansion errors in `/cancel-ralph`
- Renamed marketplace to avoid impersonating official Anthropic plugin

## [1.0.0] - Initial Fork

Initial fork from [Anthropic Claude Code Plugins](https://github.com/anthropics/claude-code-plugins).

### Features from Original
- Basic Ralph loop functionality with Stop hook mechanism
- Progress tracking with elapsed time
- File-based prompts with `--prompt-file`
- Loop management commands (`/list-ralph-loops`, `/cancel-ralph`)
- Completion promise detection
