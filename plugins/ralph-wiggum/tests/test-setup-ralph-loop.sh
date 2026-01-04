#!/bin/bash
# Test: setup-ralph-loop.sh - Comprehensive test suite
# Tests state file creation, argument parsing, edge cases, and error handling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPT="$SCRIPT_DIR/../scripts/setup-ralph-loop.sh"

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

echo "=== Testing setup-ralph-loop.sh ==="
echo "Comprehensive test suite for Ralph loop initialization"

# Create temp directory for test
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT
cd "$TEST_DIR"
mkdir -p .claude

# ============================================================================
# HAPPY PATH TESTS - BASIC FUNCTIONALITY
# ============================================================================

run_test "Basic inline prompt creates session-specific state file"
export CLAUDE_SESSION_ID="test-session-basic-123"
"$SETUP_SCRIPT" "Build a REST API" --max-iterations 10 > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if [[ -f "$STATE_FILE" ]]; then
  pass "State file created at $STATE_FILE"
else
  fail "State file not created"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "State file contains all required YAML frontmatter fields"
export CLAUDE_SESSION_ID="test-session-fields"
"$SETUP_SCRIPT" "Test task" --max-iterations 5 --completion-promise "DONE" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
MISSING_FIELDS=""
grep -q '^active:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS active"
grep -q '^session_id:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS session_id"
grep -q '^description:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS description"
grep -q '^iteration:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS iteration"
grep -q '^max_iterations:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS max_iterations"
grep -q '^completion_promise:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS completion_promise"
grep -q '^started_at:' "$STATE_FILE" || MISSING_FIELDS="$MISSING_FIELDS started_at"

if [[ -z "$MISSING_FIELDS" ]]; then
  pass "All required fields present in frontmatter"
else
  fail "Missing fields:$MISSING_FIELDS"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Iteration starts at 1"
export CLAUDE_SESSION_ID="test-iteration-start"
"$SETUP_SCRIPT" "Test task" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q '^iteration: 1$' "$STATE_FILE"; then
  pass "Iteration correctly starts at 1"
else
  fail "Iteration should start at 1"
  grep 'iteration' "$STATE_FILE"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Prompt content appears after frontmatter"
export CLAUDE_SESSION_ID="test-prompt-content"
"$SETUP_SCRIPT" "Build a TODO application with React" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
# Content should appear after the closing ---
if tail -n +8 "$STATE_FILE" | grep -q "Build a TODO application with React"; then
  pass "Prompt content present after frontmatter"
else
  fail "Prompt content not found after frontmatter"
  cat "$STATE_FILE"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# --prompt-file OPTION TESTS
# ============================================================================

run_test "--prompt-file reads prompt from markdown file"
PROMPT_FILE="$TEST_DIR/test-prompt.md"
cat > "$PROMPT_FILE" <<'EOF'
# Build Todo API

## Requirements
- CRUD operations
- Input validation
- Unit tests

## Success Criteria
All tests passing
EOF

export CLAUDE_SESSION_ID="test-prompt-file"
"$SETUP_SCRIPT" --prompt-file "$PROMPT_FILE" --completion-promise "DONE" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q '## Requirements' "$STATE_FILE" && grep -q 'CRUD operations' "$STATE_FILE"; then
  pass "Prompt content loaded from file"
else
  fail "Prompt content not loaded correctly"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--prompt-file with non-existent file fails gracefully"
export CLAUDE_SESSION_ID="test-missing-file"
ERROR_OUTPUT=$("$SETUP_SCRIPT" --prompt-file "/nonexistent/path.md" 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -q "not found"; then
  pass "Proper error for missing file"
else
  fail "Should error on missing file" "Output: $ERROR_OUTPUT"
  exit 1
fi

run_test "--prompt-file with empty file fails"
EMPTY_FILE="$TEST_DIR/empty-prompt.md"
touch "$EMPTY_FILE"

export CLAUDE_SESSION_ID="test-empty-file"
ERROR_OUTPUT=$("$SETUP_SCRIPT" --prompt-file "$EMPTY_FILE" 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "no prompt\|empty"; then
  pass "Proper error for empty prompt file"
else
  # If it doesn't explicitly error, check if state file was NOT created
  if [[ ! -f ".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md" ]]; then
    pass "No state file created for empty prompt"
  else
    fail "Should error or reject empty prompt file" "Output: $ERROR_OUTPUT"
    exit 1
  fi
fi

run_test "--prompt-file without argument fails"
export CLAUDE_SESSION_ID="test-no-file-arg"
ERROR_OUTPUT=$("$SETUP_SCRIPT" --prompt-file 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "requires\|error\|missing"; then
  pass "Proper error when --prompt-file has no argument"
else
  fail "Should error when --prompt-file has no argument" "Output: $ERROR_OUTPUT"
  exit 1
fi

# ============================================================================
# --max-iterations OPTION TESTS
# ============================================================================

run_test "--max-iterations 0 means unlimited"
export CLAUDE_SESSION_ID="test-max-zero"
"$SETUP_SCRIPT" "Test task" --max-iterations 0 > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q '^max_iterations: 0$' "$STATE_FILE"; then
  pass "max_iterations 0 stored correctly (unlimited)"
else
  fail "max_iterations 0 not stored correctly"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--max-iterations with large number"
export CLAUDE_SESSION_ID="test-max-large"
"$SETUP_SCRIPT" "Test task" --max-iterations 9999 > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q '^max_iterations: 9999$' "$STATE_FILE"; then
  pass "Large max_iterations stored correctly"
else
  fail "Large max_iterations not stored"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--max-iterations without argument fails"
export CLAUDE_SESSION_ID="test-max-no-arg"
ERROR_OUTPUT=$("$SETUP_SCRIPT" "Test task" --max-iterations 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "requires\|error\|number"; then
  pass "Proper error when --max-iterations has no argument"
else
  fail "Should error when --max-iterations missing argument" "Output: $ERROR_OUTPUT"
  exit 1
fi

run_test "--max-iterations with non-numeric value fails"
export CLAUDE_SESSION_ID="test-max-nonnumeric"
ERROR_OUTPUT=$("$SETUP_SCRIPT" "Test task" --max-iterations abc 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "integer\|number\|invalid"; then
  pass "Proper error for non-numeric --max-iterations"
else
  fail "Should error for non-numeric value" "Output: $ERROR_OUTPUT"
  exit 1
fi

run_test "--max-iterations with negative value fails"
export CLAUDE_SESSION_ID="test-max-negative"
ERROR_OUTPUT=$("$SETUP_SCRIPT" "Test task" --max-iterations -5 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "positive\|invalid\|integer"; then
  pass "Proper error for negative --max-iterations"
else
  fail "Should error for negative value" "Output: $ERROR_OUTPUT"
  exit 1
fi

run_test "--max-iterations with decimal fails"
export CLAUDE_SESSION_ID="test-max-decimal"
ERROR_OUTPUT=$("$SETUP_SCRIPT" "Test task" --max-iterations 10.5 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "integer\|invalid\|number"; then
  pass "Proper error for decimal --max-iterations"
else
  fail "Should error for decimal value" "Output: $ERROR_OUTPUT"
  exit 1
fi

# ============================================================================
# --completion-promise OPTION TESTS
# ============================================================================

run_test "--completion-promise single word"
export CLAUDE_SESSION_ID="test-promise-single"
"$SETUP_SCRIPT" "Test task" --completion-promise "DONE" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'completion_promise: "DONE"' "$STATE_FILE"; then
  pass "Single word promise stored correctly"
else
  fail "Single word promise not stored"
  grep 'completion_promise' "$STATE_FILE" || echo "Field not found"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--completion-promise multi-word (quoted)"
export CLAUDE_SESSION_ID="test-promise-multi"
"$SETUP_SCRIPT" "Test task" --completion-promise "ALL TESTS PASS" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'completion_promise: "ALL TESTS PASS"' "$STATE_FILE"; then
  pass "Multi-word promise stored correctly"
else
  fail "Multi-word promise not stored correctly"
  grep 'completion_promise' "$STATE_FILE" || echo "Field not found"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--completion-promise with special YAML characters"
export CLAUDE_SESSION_ID="test-promise-special"
"$SETUP_SCRIPT" "Test task" --completion-promise "Done: 100%" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'completion_promise:.*Done.*100%' "$STATE_FILE"; then
  pass "Promise with special chars stored"
else
  fail "Promise with special chars not stored"
  grep 'completion_promise' "$STATE_FILE" || echo "Field not found"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--completion-promise without argument fails"
export CLAUDE_SESSION_ID="test-promise-no-arg"
ERROR_OUTPUT=$("$SETUP_SCRIPT" "Test task" --completion-promise 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "requires\|error\|text"; then
  pass "Proper error when --completion-promise has no argument"
else
  fail "Should error when --completion-promise missing argument" "Output: $ERROR_OUTPUT"
  exit 1
fi

run_test "No completion promise results in null"
export CLAUDE_SESSION_ID="test-no-promise"
"$SETUP_SCRIPT" "Test task" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'completion_promise: null' "$STATE_FILE"; then
  pass "No promise correctly stored as null"
else
  fail "Missing promise should be null"
  grep 'completion_promise' "$STATE_FILE" || echo "Field not found"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# DESCRIPTION TRUNCATION TESTS
# ============================================================================

run_test "Short prompt description not truncated"
export CLAUDE_SESSION_ID="test-desc-short"
"$SETUP_SCRIPT" "Short task" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
DESC=$(grep '^description:' "$STATE_FILE" | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/')
if [[ "$DESC" == *"Short task"* ]] && [[ "$DESC" != *"..."* ]]; then
  pass "Short description not truncated"
else
  fail "Short description incorrectly handled: '$DESC'"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Long prompt description truncated to ~60 chars with ellipsis"
export CLAUDE_SESSION_ID="test-desc-long"
LONG_PROMPT="This is a very long prompt that exceeds sixty characters and should be truncated in the description field with an ellipsis"
"$SETUP_SCRIPT" "$LONG_PROMPT" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
DESC=$(grep '^description:' "$STATE_FILE" | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/')
if [[ ${#DESC} -le 65 ]] && [[ "$DESC" == *"..."* ]]; then
  pass "Long description truncated to ${#DESC} chars with ellipsis"
else
  fail "Description not truncated correctly: '$DESC' (${#DESC} chars)"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Multiline prompt description flattened"
export CLAUDE_SESSION_ID="test-desc-multiline"
MULTILINE_PROMPT=$'Line one\nLine two\nLine three'
"$SETUP_SCRIPT" "$MULTILINE_PROMPT" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
DESC=$(grep '^description:' "$STATE_FILE" | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/')
# Description should be on a single line
if [[ $(echo "$DESC" | wc -l) -eq 1 ]]; then
  pass "Multiline prompt flattened to single line description"
else
  fail "Description should be single line"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# SESSION ID TESTS
# ============================================================================

run_test "Multiple sessions create separate state files"
export CLAUDE_SESSION_ID="session-alpha"
"$SETUP_SCRIPT" "Task for alpha" > /dev/null

export CLAUDE_SESSION_ID="session-beta"
"$SETUP_SCRIPT" "Task for beta" > /dev/null

export CLAUDE_SESSION_ID="session-gamma"
"$SETUP_SCRIPT" "Task for gamma" > /dev/null

if [[ -f ".claude/ralph-loop.session-alpha.local.md" ]] && \
   [[ -f ".claude/ralph-loop.session-beta.local.md" ]] && \
   [[ -f ".claude/ralph-loop.session-gamma.local.md" ]]; then
  pass "Each session has its own state file"
else
  fail "State files not properly separated"
  ls -la .claude/
  exit 1
fi

# Verify content isolation
if grep -q "Task for alpha" ".claude/ralph-loop.session-alpha.local.md" && \
   grep -q "Task for beta" ".claude/ralph-loop.session-beta.local.md" && \
   grep -q "Task for gamma" ".claude/ralph-loop.session-gamma.local.md"; then
  pass "Each state file has correct isolated content"
else
  fail "State file content mixed up"
  exit 1
fi
rm -f .claude/ralph-loop.session-*.local.md

run_test "CLAUDE_SESSION_ID not set uses fallback"
unset CLAUDE_SESSION_ID
OUTPUT=$("$SETUP_SCRIPT" "Test without session ID" 2>&1) || true

# Should either use a fallback or warn
if ls .claude/ralph-loop.*.local.md 1>/dev/null 2>&1; then
  pass "Fallback session ID used when CLAUDE_SESSION_ID not set"
  rm -f .claude/ralph-loop.*.local.md
elif echo "$OUTPUT" | grep -qi "warning\|session"; then
  pass "Warning issued when CLAUDE_SESSION_ID not set"
else
  fail "Should handle missing CLAUDE_SESSION_ID" "Output: $OUTPUT"
  exit 1
fi

# ============================================================================
# NO PROMPT PROVIDED TESTS
# ============================================================================

run_test "No prompt provided fails"
export CLAUDE_SESSION_ID="test-no-prompt"
ERROR_OUTPUT=$("$SETUP_SCRIPT" 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "no prompt\|error\|required"; then
  pass "Proper error when no prompt provided"
else
  fail "Should error when no prompt provided" "Output: $ERROR_OUTPUT"
  exit 1
fi

run_test "Only options without prompt fails"
export CLAUDE_SESSION_ID="test-only-options"
ERROR_OUTPUT=$("$SETUP_SCRIPT" --max-iterations 10 2>&1 || true)
if echo "$ERROR_OUTPUT" | grep -qi "no prompt\|error\|required"; then
  pass "Proper error when only options provided"
else
  fail "Should error when only options provided" "Output: $ERROR_OUTPUT"
  exit 1
fi

# ============================================================================
# --help OPTION TEST
# ============================================================================

run_test "--help and -h both show usage information"
HELP_LONG=$("$SETUP_SCRIPT" --help 2>&1 || true)
HELP_SHORT=$("$SETUP_SCRIPT" -h 2>&1 || true)
if echo "$HELP_LONG" | grep -qi "usage\|ralph\|options\|--max-iterations" && \
   echo "$HELP_SHORT" | grep -qi "usage\|ralph\|options"; then
  pass "Both --help and -h show usage information"
else
  fail "--help or -h missing usage info" "Long: $HELP_LONG | Short: $HELP_SHORT"
  exit 1
fi

# ============================================================================
# TIMESTAMP TESTS
# ============================================================================

run_test "started_at timestamp is in ISO 8601 format"
export CLAUDE_SESSION_ID="test-timestamp"
"$SETUP_SCRIPT" "Test task" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
TIMESTAMP=$(grep '^started_at:' "$STATE_FILE" | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/')
# ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
if [[ "$TIMESTAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  pass "Timestamp in ISO 8601 format: $TIMESTAMP"
else
  fail "Timestamp not in expected format: '$TIMESTAMP'"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# SPECIAL CHARACTERS IN PROMPT TESTS
# ============================================================================

run_test "Prompt with YAML special characters (colons)"
export CLAUDE_SESSION_ID="test-yaml-colon"
"$SETUP_SCRIPT" "Task: Build API: REST endpoints" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q "Task: Build API" "$STATE_FILE"; then
  pass "Prompt with colons handled correctly"
else
  fail "Prompt with colons not stored correctly"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Prompt with quotes"
export CLAUDE_SESSION_ID="test-quotes"
"$SETUP_SCRIPT" 'Build a "todo" application' > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'todo' "$STATE_FILE"; then
  pass "Prompt with quotes handled"
else
  fail "Prompt with quotes not stored"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Prompt with markdown formatting"
export CLAUDE_SESSION_ID="test-markdown"
PROMPT_FILE="$TEST_DIR/markdown-prompt.md"
cat > "$PROMPT_FILE" <<'EOF'
# Build API

## Requirements
- **Bold text**
- *Italic text*
- `Code blocks`

```javascript
const x = 1;
```
EOF

"$SETUP_SCRIPT" --prompt-file "$PROMPT_FILE" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q '# Build API' "$STATE_FILE" && grep -q 'const x = 1' "$STATE_FILE"; then
  pass "Markdown formatting preserved"
else
  fail "Markdown formatting not preserved"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# ARGUMENT ORDER TESTS
# ============================================================================

run_test "Options can come before prompt"
export CLAUDE_SESSION_ID="test-order-1"
"$SETUP_SCRIPT" --max-iterations 10 "My task here" > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'max_iterations: 10' "$STATE_FILE" && grep -q 'My task here' "$STATE_FILE"; then
  pass "Options before prompt works"
else
  fail "Options before prompt failed"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Options can come after prompt"
export CLAUDE_SESSION_ID="test-order-2"
"$SETUP_SCRIPT" "My task here" --max-iterations 20 > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'max_iterations: 20' "$STATE_FILE" && grep -q 'My task here' "$STATE_FILE"; then
  pass "Options after prompt works"
else
  fail "Options after prompt failed"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "Multiple words prompt without quotes"
export CLAUDE_SESSION_ID="test-multiword"
"$SETUP_SCRIPT" Build a REST API for users --max-iterations 5 > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'Build a REST API for users' "$STATE_FILE"; then
  pass "Multiple word prompt captured correctly"
else
  fail "Multiple word prompt not captured"
  cat "$STATE_FILE"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# ARGUMENT FALLBACK TESTS (would have caught word-splitting bug)
# ============================================================================

run_test "--max-iterations=VALUE format (equals sign syntax)"
export CLAUDE_SESSION_ID="test-equals-syntax"
"$SETUP_SCRIPT" "Test task" --max-iterations=25 > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'max_iterations: 25' "$STATE_FILE"; then
  pass "--max-iterations=VALUE format works"
else
  fail "--max-iterations=VALUE format not handled"
  grep 'max_iterations' "$STATE_FILE" || echo "Field not found"
  exit 1
fi
rm -f "$STATE_FILE"

run_test "--completion-promise=VALUE format (equals sign syntax)"
export CLAUDE_SESSION_ID="test-promise-equals"
"$SETUP_SCRIPT" "Test task" --completion-promise=DONE > /dev/null

STATE_FILE=".claude/ralph-loop.${CLAUDE_SESSION_ID}.local.md"
if grep -q 'completion_promise: "DONE"' "$STATE_FILE"; then
  pass "--completion-promise=VALUE format works"
else
  fail "--completion-promise=VALUE format not handled"
  grep 'completion_promise' "$STATE_FILE" || echo "Field not found"
  exit 1
fi
rm -f "$STATE_FILE"

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
# All tests passed if we got here (failures cause early exit)
echo -e "${GREEN}All $TESTS_RUN tests passed! ($TESTS_PASSED assertions)${NC}"
