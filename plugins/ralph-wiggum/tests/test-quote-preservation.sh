#!/bin/bash
# Test: Internal quote preservation in completion promises
# Tests that quotes INSIDE promises are preserved, only surrounding quotes stripped

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/../hooks/stop-hook.sh"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

TESTS_RUN=0
TESTS_PASSED=0

pass() {
  echo -e "  ${GREEN}PASS${NC}: $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC}: $1"
  if [[ -n "${2:-}" ]]; then
    echo "  $2"
  fi
}

run_test() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo ""
  echo "Test $TESTS_RUN: $1"
}

echo "=== Testing Quote Preservation in stop-hook.sh ==="
echo "Verifies that internal quotes are preserved, only surrounding quotes stripped"

# Create temp directory for test
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# Create .claude directory
mkdir -p "$TEST_DIR/.claude"
cd "$TEST_DIR"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

create_transcript() {
  local text="${1:-I will work on this task now.}"
  cat > "$TEST_DIR/transcript.jsonl" <<EOF
{"role":"user","message":{"content":[{"type":"text","text":"Start the task"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"$text"}]}}
EOF
}

create_state_file() {
  local session_id="$1"
  local iteration="${2:-1}"
  local max_iterations="${3:-10}"
  local completion_promise="${4:-DONE}"
  local started_at="${5:-2024-01-15T10:00:00Z}"

  cat > "$TEST_DIR/.claude/ralph-loop.${session_id}.local.md" <<EOF
---
active: true
session_id: "$session_id"
description: "Test task"
iteration: $iteration
max_iterations: $max_iterations
completion_promise: "${completion_promise}"
started_at: "$started_at"
---

Build a REST API for todos.
EOF
}

# ============================================================================
# INTERNAL QUOTE PRESERVATION TESTS
# ============================================================================

run_test 'Promise with double quotes inside ("passing") is preserved'
create_state_file "test-quotes-1" 1 10 'All tests "passing"'
create_transcript 'The codebase is clean. <promise>All tests "passing"</promise>'

OUTPUT=$(echo "{\"session_id\":\"test-quotes-1\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")
EXIT_CODE=$?

# With old global quote stripping: <promise>All tests "passing"</promise>
# After ${PROMISE_TEXT//"/}: All tests passing (quotes lost!)
# After ${PROMISE_TEXT#""} etc: All tests "passing" (quotes preserved!)

if [[ $EXIT_CODE -eq 0 ]]; then
  # Check if loop stopped (promise detected)
  if [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-quotes-1.local.md" ]]; then
    pass "Loop stopped - promise with internal quotes detected correctly"
  else
    fail "Loop did not stop - promise not detected" "State file still exists"
    exit 1
  fi
else
  fail "Hook exited with error" "Exit code: $EXIT_CODE, Output: $OUTPUT"
  exit 1
fi

run_test 'Promise with single quotes inside (It'"'"'s) is preserved'
create_state_file "test-quotes-2" 1 10 "It'"'"'s working"
create_transcript "Great progress! <promise>It'"'"'s working</promise>"

OUTPUT=$(echo "{\"session_id\":\"test-quotes-2\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  if [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-quotes-2.local.md.md" ]]; then
    pass "Loop stopped - promise with single quotes preserved"
  else
    fail "Loop did not stop with single quotes" "State file still exists"
    exit 1
  fi
else
  fail "Hook error with single quotes" "Exit: $EXIT_CODE, Output: $OUTPUT"
  exit 1
fi

run_test 'Promise with mixed quotes ("Test'"'"'s) is preserved'
create_state_file "test-quotes-3" 1 10 'Test results: "passing" and it'"'"'s fast'
create_transcript 'Done! <promise>Test results: "passing" and it'"'"'s fast</promise>'

OUTPUT=$(echo "{\"session_id\":\"test-quotes-3\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  if [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-quotes-3.local.md" ]]; then
    pass "Loop stopped - promise with mixed quotes preserved"
  else
    fail "Loop did not stop with mixed quotes" "State file still exists"
    exit 1
  fi
else
  fail "Hook error with mixed quotes" "Exit: $EXIT_CODE"
  exit 1
fi

run_test 'Promise with escaped quotes in YAML is handled'
create_state_file "test-quotes-4" 1 10 'Build "succeeded" - all systems go'
create_transcript 'Final check: <promise>Build "succeeded" - all systems go</promise>'

OUTPUT=$(echo "{\"session_id\":\"test-quotes-4\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  if [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-quotes-4.local.md" ]]; then
    pass "Promise with escaped quotes in JSON detected correctly"
  else
    fail "Promise with escaped quotes not detected"
    exit 1
  fi
else
  fail "Hook error with escaped quotes"
  exit 1
fi

# ============================================================================
# SURROUNDING QUOTE STRIPPING TESTS
# ============================================================================

run_test 'Surrounding double quotes stripped but internal preserved'
create_state_file "test-strip-1" 1 10 '"Test passing"'  # YAML has: "Test passing"
create_transcript 'Done! <promise>Test passing</promise>'

OUTPUT=$(echo "{\"session_id\":\"test-strip-1\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")

# The state file has "\"Test passing\"" in YAML
# After sed extraction: "Test passing" (with quotes)
# After #pattern stripping: Test passing (surrounding quotes removed)
# Internal quotes: none in this case, but pattern should only remove surrounding

if [[ $EXIT_CODE -eq 0 ]] && [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-strip-1.local.md" ]]; then
  pass "Loop stopped - surrounding quotes stripped correctly"
else
  fail "Surrounding quote stripping failed"
  exit 1
fi

run_test 'Surrounding single quotes stripped but internal preserved'
create_state_file "test-strip-2" 1 10 "'All good'"  # YAML has: 'All good'
create_transcript 'Done! <promise>All good</promise>'

OUTPUT=$(echo "{\"session_id\":\"test-strip-2\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")

if [[ $EXIT_CODE -eq 0 ]] && [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-strip-2.local.md" ]]; then
  pass "Loop stopped - single quotes stripped correctly"
else
  fail "Single quote stripping failed"
  exit 1
fi

# ============================================================================
# NEGATIVE TEST - Quotes that should NOT be detected
# ============================================================================

run_test 'Text with quotes but wrong promise does not match'
create_state_file "test-no-match-1" 1 10 'Test "passing"'
create_transcript 'Progress: Tests are "passing" but not done. Promise: All complete'

OUTPUT=$(echo "{\"session_id\":\"test-no-match-1\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]] && [[ -f "$TEST_DIR/.claude/ralph-loop.test-no-match-1.local.md" ]]; then
  # State file should still exist (loop not stopped)
  # Read the output JSON to verify it blocks
  if echo "$OUTPUT" | grep -q '"decision": "block"'; then
    pass "Loop correctly blocked when promise not in tags"
  else
    fail "Block decision not in output"
    exit 1
  fi
else
  fail "Loop stopped when it shouldn't have"
  exit 1
fi

# ============================================================================
# EDGE CASE: Promise with only internal quotes no surrounding
# ============================================================================

run_test 'Promise with only internal quotes, no surrounding quotes'
create_state_file "test-edge-1" 1 10 'All tests "passing"'
create_transcript 'Done! <promise>All tests "passing"</promise>'

# In state file: completion_promise: "All tests \"passing\""
# After sed extraction: All tests "passing" (no surrounding quotes to strip)
# Should work with both old and new code, but tests mechanism

OUTPUT=$(echo "{\"session_id\":\"test-edge-1\",\"transcript_path\":\"$TEST_DIR/transcript.jsonl\"}" | "$HOOK_SCRIPT")
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]] && [[ ! -f "$TEST_DIR/.claude/ralph-loop.test-edge-1.local.md" ]]; then
  pass "Edge case handled - internal quotes without surrounding"
else
  fail "Edge case failed"
  exit 1
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
if [[ $TESTS_PASSED -eq $TESTS_RUN ]]; then
  echo -e "${GREEN}All $TESTS_PASSED tests passed!${NC}"
  echo ""
  echo "These tests verify that:"
  echo "  1. Internal quotes in promises are preserved"
  echo "  2. Only surrounding quotes are stripped"
  echo "  3. Complex quotes (mixed, escaped) work correctly"
  echo ""
  echo "OLD CODE would fail these tests because:"
  echo "  - Global stripping // would remove ALL quotes"
  echo "  - Promise 'All tests \"passing\"' becomes 'All tests passing'"
  echo "  - Comparison fails because text doesn't match"
  exit 0
else
  echo -e "${RED}Some tests failed: $TESTS_PASSED/$TESTS_RUN passed${NC}"
  echo ""
  echo "If these tests failed, check:"
  echo "  - Quote stripping mechanism in stop-hook.sh"
  echo "  - Use # and % patterns (surrounding only), not // (global)"
  exit 1
fi
