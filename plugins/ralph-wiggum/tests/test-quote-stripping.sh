#!/bin/bash
# Test: Quote stripping precision in setup-ralph-loop.sh
# Tests that command-line parsing strips only surrounding quotes, preserving internal quotes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPT="$SCRIPT_DIR/../scripts/setup-ralph-loop.sh"

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

echo "=== Testing Quote Stripping Precision in setup-ralph-loop.sh ==="
echo "Verifies that only surrounding quotes are stripped, internal quotes preserved"

# Create temp directory for test
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

cd "$TEST_DIR"

# Export a fake session ID to avoid warnings
export CLAUDE_SESSION_ID="test-session-$RANDOM"

# ============================================================================
# QUOTE STRIPPING TESTS
# ============================================================================

run_test "--completion-promise with internal double quotes"
# Command: --completion-promise 'All tests "passing"'
# Should be stored as: All tests "passing" (internal quotes kept)
# NOT as: All tests passing (old buggy behavior)

OUTPUT=$("$SETUP_SCRIPT" --completion-promise 'All tests "passing"' "test prompt" 2>&1 | tail -10)

# Check that state file was created
if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  # Read the completion_promise from the YAML frontmatter
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')

  # PROMISE should be: "All tests \"passing\"" (with surrounding YAML quotes)
  # Extract just the value (strip YAML quotes)
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  # VALUE should now be: All tests "passing" (internal quotes preserved)
  if echo "$VALUE" | grep -q 'All tests "passing"'; then
    pass "Internal double quotes preserved in promise"
  else
    fail "Internal quotes not preserved" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

# Clean up
rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

run_test "--completion-promise with internal single quotes"
OUTPUT=$("$SETUP_SCRIPT" --completion-promise "It's working" "test prompt" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  if echo "$VALUE" | grep -q "It's working"; then
    pass "Internal single quotes preserved in promise"
  else
    fail "Internal single quotes not preserved" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

run_test "--completion-promise with mixed internal quotes"
OUTPUT=$("$SETUP_SCRIPT" --completion-promise 'Results: "passing" and it'"'"'s fast' "test" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  if echo "$VALUE" | grep -q 'Results: "passing" and it'"'"'s fast'; then
    pass "Mixed internal quotes preserved"
  else
    fail "Mixed internal quotes not preserved" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

run_test "--completion-promise with JSON-like string"
OUTPUT=$("$SETUP_SCRIPT" --completion-promise '{"status": "pass", "tests": 42}' "test" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  if echo "$VALUE" | grep -q '\{"status": "pass", "tests": 42\}'; then
    pass "JSON-like string with quotes preserved"
  else
    fail "JSON quotes not preserved" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

# ============================================================================
# SURROUNDING QUOTE TESTS
# ============================================================================

run_test "Surrounding double quotes stripped"
OUTPUT=$("$SETUP_SCRIPT" --completion-promise '"DONE"' "test" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  # Should be DONE (surrounding quotes removed)
  if [[ "$VALUE" == "DONE" ]]; then
    pass "Surrounding double quotes stripped correctly"
  else
    fail "Surrounding quotes not stripped" "Got: $VALUE, expected: DONE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

run_test "Surrounding single quotes stripped"
OUTPUT=$("$SETUP_SCRIPT" --completion-promise "'Complete'" "test" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  if [[ "$VALUE" == "Complete" ]]; then
    pass "Surrounding single quotes stripped correctly"
  else
    fail "Surrounding single quotes not stripped" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

run_test "Double nested quotes (surrounding + internal)"
OUTPUT=$("$SETUP_SCRIPT" --completion-promise '"Test "passing" complete"' "test" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  # Should be: Test "passing" complete (outer quotes stripped, inner kept)
  if [[ "$VALUE" == 'Test "passing" complete' ]]; then
    pass "Surrounding quotes stripped, internal preserved (nested case)"
  else
    fail "Nested quote handling failed" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

# ============================================================================
# EDGE CASE: Multi-line promises with quotes
# ============================================================================

run_test "Multi-line option with internal quotes"
# Test --completion-promise=VALUE format
OUTPUT=$("$SETUP_SCRIPT" --completion-promise='Multi word "test" promise' "test" 2>&1 | tail -10)

if [[ -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" ]]; then
  PROMISE=$(grep '^completion_promise:' ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md" | sed 's/completion_promise: *//')
  VALUE=$(echo "$PROMISE" | sed 's/^"//' | sed 's/"$//')

  if echo "$VALUE" | grep -q 'Multi word "test" promise'; then
    pass "Multi-word format preserves internal quotes"
  else
    fail "Multi-word format failed" "Got: $VALUE"
    exit 1
  fi
else
  fail "State file not created"
  exit 1
fi

rm -f ".claude/ralph-loop.$CLAUDE_SESSION_ID.local.md"

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
  echo "  3. Complex nested quotes work correctly"
  echo ""
  echo "OLD CODE would fail because:"
  echo "  - Global stripping // would remove all quotes"
  echo "  - \"All tests passing\" when it should be \"All tests \"passing\"\""
  echo "  - This causes promise matching to fail"
  exit 0
else
  echo -e "${RED}Some tests failed: $TESTS_PASSED/$TESTS_RUN passed${NC}"
  echo ""
  echo "Tests failed because:"
  echo "  - Quote stripping may be using // (global) instead of #/% (surrounding only)"
  echo "  - Check parameter expansion in setup-ralph-loop.sh"
  exit 1
fi
