# Changelog

All notable changes to the Ralph Wiggum plugin will be documented in this file.

## [Unreleased]

### Added

- **Session Isolation**: Each Claude Code terminal now gets its own independent Ralph loop
  - State files are now session-specific: `.claude/ralph-loop.{session_id}.local.md`
  - Multiple terminals can run different Ralph loops on the same project simultaneously
  - SessionStart hook captures session ID via `$CLAUDE_ENV_FILE`

- **`--prompt-file` option**: Load prompts from markdown files instead of inline strings
  ```bash
  /ralph-loop --prompt-file ./tasks/my-task.md --max-iterations 50
  ```

- **`/list-ralph-loops` command**: List all active Ralph loops across sessions
  - Shows session ID, task description, iteration count, and elapsed time
  - Helps identify which loops are running in multi-terminal setups

- **Task descriptions**: State files now include a description field (first 60 chars of prompt)
  - Makes it easy to identify what each loop is working on
  - Displayed in `/list-ralph-loops` and `/cancel-ralph`

- **Elapsed time tracking**: Shows how long each loop has been running
  - Displayed during each iteration: `Running for 5m 23s`
  - Shown in `/list-ralph-loops` output

### Changed

- **`/cancel-ralph` command**: Now supports multiple loops
  - Single loop: Cancels immediately with confirmation
  - Multiple loops: Prompts user to select which loop(s) to cancel
  - Includes "All loops" option for bulk cancellation

- **Stop hook improvements**:
  - Only blocks exit for the current session's loop (not all sessions)
  - Better error handling for corrupted state files
  - Clearer status messages with elapsed time

### Fixed

- Stop hook no longer triggers on unrelated Claude Code sessions in the same project
- State file validation prevents crashes on corrupted/manually-edited files

### Testing

- Comprehensive test suite with 105 tests across 4 test files:
  - `test-session-start-hook.sh`: 17 tests covering session ID persistence, edge cases, invalid input
  - `test-setup-ralph-loop.sh`: 35 tests covering argument parsing, validation, session isolation
  - `test-stop-hook-isolation.sh`: 27 tests covering termination conditions, error handling, JSON output
  - `test-list-ralph-loops.sh`: 26 tests covering loop listing, elapsed time, field parsing, edge cases

## [1.0.0] - Initial Release

### Added

- `/ralph-loop` command to start self-referential development loops
- `/cancel-ralph` command to stop active loops
- Stop hook implementation for session blocking
- `--max-iterations` option for safety limits
- `--completion-promise` option for automatic completion detection
- `-h/--help` flag with usage documentation
