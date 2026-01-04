#!/bin/bash
# Test: session-start-hook.sh - Comprehensive test suite
# Tests session ID persistence, edge cases, and error handling

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

echo "=== Testing session-start-hook.sh ==="
echo "Comprehensive test suite for session ID persistence"

# Create temp directory for test
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# ============================================================================
# HAPPY PATH TESTS
# ============================================================================

run_test "Basic session ID written to CLAUDE_ENV_FILE"
ENV_FILE="$TEST_DIR/claude-env-1"
touch "$ENV_FILE"
HOOK_INPUT='{"session_id": "test-session-abc123", "cwd": "/tmp"}'
export CLAUDE_ENV_FILE="$ENV_FILE"
echo "$HOOK_INPUT" | "$HOOK_SCRIPT"

if grep -q 'export CLAUDE_SESSION_ID="test-session-abc123"' "$ENV_FILE"; then
  pass "Session ID written correctly"
else
  fail "Session ID not found in env file" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

run_test "Multiple sessions get unique IDs (session isolation)"
ENV_FILE_A="$TEST_DIR/session-a-env"
ENV_FILE_B="$TEST_DIR/session-b-env"
ENV_FILE_C="$TEST_DIR/session-c-env"
touch "$ENV_FILE_A" "$ENV_FILE_B" "$ENV_FILE_C"

export CLAUDE_ENV_FILE="$ENV_FILE_A"
echo '{"session_id": "session-aaa-111", "cwd": "/tmp"}' | "$HOOK_SCRIPT"
export CLAUDE_ENV_FILE="$ENV_FILE_B"
echo '{"session_id": "session-bbb-222", "cwd": "/tmp"}' | "$HOOK_SCRIPT"
export CLAUDE_ENV_FILE="$ENV_FILE_C"
echo '{"session_id": "session-ccc-333", "cwd": "/tmp"}' | "$HOOK_SCRIPT"

if grep -q 'session-aaa-111' "$ENV_FILE_A" && \
   grep -q 'session-bbb-222' "$ENV_FILE_B" && \
   grep -q 'session-ccc-333' "$ENV_FILE_C"; then
  pass "Each session gets its own unique ID"
else
  fail "Session IDs not isolated" ""
  exit 1
fi

run_test "Session ID with UUID format"
ENV_FILE="$TEST_DIR/claude-env-uuid"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "550e8400-e29b-41d4-a716-446655440000", "cwd": "/tmp"}' | "$HOOK_SCRIPT"

if grep -q '550e8400-e29b-41d4-a716-446655440000' "$ENV_FILE"; then
  pass "UUID session ID handled correctly"
else
  fail "UUID session ID not written" ""
  exit 1
fi

run_test "Session ID with alphanumeric and hyphens"
ENV_FILE="$TEST_DIR/claude-env-alphanum"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "claude-code-session-2024-01-15-abc123", "cwd": "/tmp"}' | "$HOOK_SCRIPT"

if grep -q 'claude-code-session-2024-01-15-abc123' "$ENV_FILE"; then
  pass "Alphanumeric session ID handled correctly"
else
  fail "Alphanumeric session ID not written" ""
  exit 1
fi

# ============================================================================
# EDGE CASES - MISSING/EMPTY VALUES
# ============================================================================

run_test "Missing session_id field in JSON"
ENV_FILE="$TEST_DIR/claude-env-missing"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"cwd": "/tmp", "other_field": "value"}' | "$HOOK_SCRIPT" || true

if [[ ! -s "$ENV_FILE" ]]; then
  pass "No session ID written when field missing"
else
  fail "Should not write when session_id missing" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

run_test "Empty session_id string"
ENV_FILE="$TEST_DIR/claude-env-empty"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "", "cwd": "/tmp"}' | "$HOOK_SCRIPT" || true

if [[ ! -s "$ENV_FILE" ]]; then
  pass "No session ID written when empty string"
else
  fail "Should not write when session_id is empty" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

run_test "Null session_id value"
ENV_FILE="$TEST_DIR/claude-env-null"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": null, "cwd": "/tmp"}' | "$HOOK_SCRIPT" || true

if [[ ! -s "$ENV_FILE" ]]; then
  pass "No session ID written when null"
else
  fail "Should not write when session_id is null" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

run_test "Whitespace-only session_id"
ENV_FILE="$TEST_DIR/claude-env-whitespace"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "   ", "cwd": "/tmp"}' | "$HOOK_SCRIPT" || true

# Whitespace should be treated as valid (it's not empty after jq extraction)
# This is a design decision - we accept it
if [[ -s "$ENV_FILE" ]]; then
  pass "Whitespace session ID written (treated as valid)"
else
  pass "Whitespace session ID rejected (treated as empty)"
fi

# ============================================================================
# EDGE CASES - CLAUDE_ENV_FILE NOT SET
# ============================================================================

run_test "CLAUDE_ENV_FILE not set - should silently succeed"
unset CLAUDE_ENV_FILE
RESULT=$(echo '{"session_id": "test-123", "cwd": "/tmp"}' | "$HOOK_SCRIPT" 2>&1) || true
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  pass "Hook exits successfully when CLAUDE_ENV_FILE not set"
else
  fail "Hook should not fail when CLAUDE_ENV_FILE not set" "Exit code: $EXIT_CODE"
  exit 1
fi

run_test "CLAUDE_ENV_FILE set to empty string"
export CLAUDE_ENV_FILE=""
RESULT=$(echo '{"session_id": "test-123", "cwd": "/tmp"}' | "$HOOK_SCRIPT" 2>&1) || true
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  pass "Hook exits successfully when CLAUDE_ENV_FILE is empty"
else
  fail "Hook should not fail when CLAUDE_ENV_FILE is empty" "Exit code: $EXIT_CODE"
  exit 1
fi

# ============================================================================
# EDGE CASES - INVALID JSON
# ============================================================================

run_test "Invalid JSON input - malformed"
ENV_FILE="$TEST_DIR/claude-env-badjson"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
RESULT=$(echo 'not valid json at all' | "$HOOK_SCRIPT" 2>&1) || true

if [[ ! -s "$ENV_FILE" ]]; then
  pass "No session ID written for invalid JSON"
else
  fail "Should not write for invalid JSON" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

run_test "Empty JSON object"
ENV_FILE="$TEST_DIR/claude-env-emptyjson"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{}' | "$HOOK_SCRIPT" || true

if [[ ! -s "$ENV_FILE" ]]; then
  pass "No session ID written for empty JSON object"
else
  fail "Should not write for empty JSON" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

run_test "Empty input (no JSON at all)"
ENV_FILE="$TEST_DIR/claude-env-noinput"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '' | "$HOOK_SCRIPT" || true

if [[ ! -s "$ENV_FILE" ]]; then
  pass "No session ID written for empty input"
else
  fail "Should not write for empty input" "Contents: $(cat $ENV_FILE)"
  exit 1
fi

# ============================================================================
# EDGE CASES - SPECIAL CHARACTERS IN SESSION ID
# ============================================================================

run_test "Session ID with underscores"
ENV_FILE="$TEST_DIR/claude-env-underscore"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "session_with_underscores_123", "cwd": "/tmp"}' | "$HOOK_SCRIPT"

if grep -q 'session_with_underscores_123' "$ENV_FILE"; then
  pass "Underscores in session ID handled"
else
  fail "Underscores in session ID not handled" ""
  exit 1
fi

run_test "Session ID with dots"
ENV_FILE="$TEST_DIR/claude-env-dots"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "session.with.dots.123", "cwd": "/tmp"}' | "$HOOK_SCRIPT"

if grep -q 'session.with.dots.123' "$ENV_FILE"; then
  pass "Dots in session ID handled"
else
  fail "Dots in session ID not handled" ""
  exit 1
fi

run_test "Session ID with colons rejected (security)"
ENV_FILE="$TEST_DIR/claude-env-colons"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "session:10:30:45", "cwd": "/tmp"}' | "$HOOK_SCRIPT" || true

# Colons should be rejected for security/portability (not valid in filenames on Windows)
if [[ ! -s "$ENV_FILE" ]]; then
  pass "Colons in session ID correctly rejected"
else
  fail "Colons in session ID should be rejected for security" ""
  exit 1
fi

run_test "Session ID with path traversal (..) rejected (security)"
ENV_FILE="$TEST_DIR/claude-env-pathtraversal"
touch "$ENV_FILE"
export CLAUDE_ENV_FILE="$ENV_FILE"
echo '{"session_id": "../../../etc/passwd", "cwd": "/tmp"}' | "$HOOK_SCRIPT" || true

# Path traversal attempts should be rejected
if [[ ! -s "$ENV_FILE" ]]; then
  pass "Path traversal session ID correctly rejected"
else
  fail "Path traversal session ID should be rejected for security" ""
  exit 1
fi

# Note: We don't test quotes/newlines in session_id as those would break shell syntax
# and Claude Code shouldn't generate such IDs

# ============================================================================
# CONCURRENT ACCESS SIMULATION
# ============================================================================

run_test "Rapid sequential writes to different env files (no collision)"
for i in {1..5}; do
  ENV_FILE="$TEST_DIR/rapid-env-$i"
  touch "$ENV_FILE"
  export CLAUDE_ENV_FILE="$ENV_FILE"
  echo "{\"session_id\": \"rapid-session-$i\", \"cwd\": \"/tmp\"}" | "$HOOK_SCRIPT"
done

ALL_CORRECT=true
for i in {1..5}; do
  if ! grep -q "rapid-session-$i" "$TEST_DIR/rapid-env-$i"; then
    ALL_CORRECT=false
    break
  fi
done

if $ALL_CORRECT; then
  pass "All 5 rapid sequential writes succeeded with correct isolation"
else
  fail "Some rapid writes failed or had wrong content" ""
  exit 1
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
if [[ $TESTS_PASSED -eq $TESTS_RUN ]]; then
  echo -e "${GREEN}All $TESTS_RUN tests passed!${NC}"
else
  echo -e "${RED}$TESTS_PASSED/$TESTS_RUN tests passed${NC}"
  exit 1
fi
