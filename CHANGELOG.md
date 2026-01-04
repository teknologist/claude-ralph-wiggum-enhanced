# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
