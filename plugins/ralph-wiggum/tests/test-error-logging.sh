#!/bin/bash
# Test: Error logging verification for session-start-hook.sh
# Tests that errors are logged to stderr, not silently ignored

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/../hooks/session-start-hook.sh"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
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

echo "=== Testing Error Logging in session-start-hook.sh ==="
echo "Verifies that errors are logged to stderr, not silently ignored"

# Create temp directory for test
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# ============================================================================
# ERROR LOGGING TESTS
# ============================================================================

run_test "Invalid session ID (path traversal) logs security warning to stderr"
ENV_FILE="$TEST_DIR/claude-env-security"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"

HOOK_INPUT='{"session_id": "../../../etc/passwd", "cwd": "/tmp"}'
OUTPUT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$OUTPUT" | grep -q "Invalid session ID format (security check)"; then
  pass "Security warning logged to stderr"
else
  fail "Security warning not found in stderr" "Output: $OUTPUT"
  exit 1
fi

if echo "$OUTPUT" | grep -q "Session ID contains unsafe characters:"; then
  pass "Session ID details logged"
else
  fail "Session ID details not logged" "Output: $OUTPUT"
  exit 1
fi

run_test "Session ID with colons logs security warning to stderr"
ENV_FILE="$TEST_DIR/claude-env-colon"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"

HOOK_INPUT='{"session_id": "session:10:30:45", "cwd": "/tmp"}'
OUTPUT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$OUTPUT" | grep -q "Invalid session ID format (security check)"; then
  pass "Security warning logged for colon-containing ID"
else
  fail "Security warning not found" "Output: $OUTPUT"
  exit 1
fi

run_test "Empty session ID logs skip message to stderr"
ENV_FILE="$TEST_DIR/claude-env-empty"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"

HOOK_INPUT='{"session_id": "", "cwd": "/tmp"}'
OUTPUT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$OUTPUT" | grep -q "No session ID provided"; then
  pass "Skip message logged for empty session ID"
else
  fail "Skip message not found" "Output: $OUTPUT"
  exit 1
fi

run_test "Missing session_id field logs skip message to stderr"
ENV_FILE="$TEST_DIR/claude-env-missing"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"

HOOK_INPUT='{"cwd": "/tmp"}'
OUTPUT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$OUTPUT" | grep -q "No session ID provided"; then
  pass "Skip message logged for missing session_id"
else
  fail "Skip message not found" "Output: $OUTPUT"
  exit 1
fi

run_test "Valid session ID produces no stderr output"
ENV_FILE="$TEST_DIR/claude-env-valid"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"

HOOK_INPUT='{"session_id": "valid-session-123", "cwd": "/tmp"}'
OUTPUT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

# Check that output is empty (no warnings)
if [[ -z "$OUTPUT" ]]; then
  pass "No stderr output for valid session ID"
else
  fail "Unexpected stderr output for valid session" "Output: $OUTPUT"
  exit 1
fi

# Verify session ID was still written despite empty stderr
if grep -q 'export CLAUDE_SESSION_ID="valid-session-123"' "$ENV_FILE"; then
  pass "Valid session ID written without errors"
else
  fail "Valid session ID not written"
  exit 1
fi

run_test "Whitespaces in session ID trigger security validation"
ENV_FILE="$TEST_DIR/claude-env-whitespace"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"

HOOK_INPUT='{"session_id": "   ", "cwd": "/tmp"}'
OUTPUT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

# Whitespace fails regex validation: ^[a-zA-Z0-9._-]+$
if echo "$OUTPUT" | grep -q "Invalid session ID format (security check)"; then
  pass "Whitespace-only session ID rejected by validation"
else
  fail "Whitespace case not handled correctly" "Output: $OUTPUT"
  exit 1
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
if [[ $TESTS_PASSED -eq $TESTS_RUN ]]; then
  echo -e "${GREEN}All $TESTS_PASSED tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed: $TESTS_PASSED/$TESTS_RUN passed${NC}"
  exit 1
fi
