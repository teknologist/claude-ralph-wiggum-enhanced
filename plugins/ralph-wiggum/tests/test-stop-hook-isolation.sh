#!/bin/bash
# Test: stop-hook.sh - Comprehensive test suite
# Tests session isolation, termination conditions, error handling, and edge cases

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/../hooks/stop-hook.sh"

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

echo "=== Testing stop-hook.sh ==="
echo "Comprehensive test suite for Ralph loop stop hook"

# Create temp directory for test
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# Create .claude directory
mkdir -p "$TEST_DIR/.claude"
cd "$TEST_DIR"

# Create a mock transcript file (JSONL format)
create_transcript() {
  local text="${1:-I will work on this task now.}"
  cat > "$TEST_DIR/transcript.jsonl" <<EOF
{"role":"user","message":{"content":[{"type":"text","text":"Start the task"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"$text"}]}}
EOF
}

# Create a state file for testing
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
completion_promise: "$completion_promise"
started_at: "$started_at"
---

Build a REST API for todos.
EOF
}

# ============================================================================
# SESSION ISOLATION TESTS
# ============================================================================

run_test "No loop for session → allows exit"
create_transcript

HOOK_INPUT=$(jq -n \
  --arg sid "session-no-loop-123" \
  --arg tp "$TEST_DIR/transcript.jsonl" \
  '{session_id: $sid, transcript_path: $tp, cwd: "."}')

RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ -z "$RESULT" || "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Exit allowed when no loop exists for session"
else
  fail "Should allow exit when no loop exists" "Result: $RESULT"
  exit 1
fi

run_test "Loop exists for THIS session → blocks exit"
SESSION_A="session-aaa-111"
create_state_file "$SESSION_A" 3 10 "DONE"
create_transcript

HOOK_INPUT=$(jq -n \
  --arg sid "$SESSION_A" \
  --arg tp "$TEST_DIR/transcript.jsonl" \
  '{session_id: $sid, transcript_path: $tp, cwd: "."}')

RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Exit blocked for session with active loop"
else
  fail "Should block exit for active loop" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION_A}.local.md"

run_test "Different session → allows exit (session isolation)"
SESSION_A="session-owner"
SESSION_B="session-other"
create_state_file "$SESSION_A" 3 10 "DONE"
create_transcript

HOOK_INPUT=$(jq -n \
  --arg sid "$SESSION_B" \
  --arg tp "$TEST_DIR/transcript.jsonl" \
  '{session_id: $sid, transcript_path: $tp, cwd: "."}')

RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ -z "$RESULT" || "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Session B not blocked by Session A's loop"
else
  fail "Session B should not be blocked by Session A's loop" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION_A}.local.md"

run_test "Multiple independent loops - each session blocked by own loop"
SESSION_A="session-alpha"
SESSION_B="session-beta"
SESSION_C="session-gamma"

create_state_file "$SESSION_A" 1 10 "DONE_A"
create_state_file "$SESSION_B" 5 20 "DONE_B"
create_state_file "$SESSION_C" 10 50 "DONE_C"
create_transcript

# Session A blocked by its loop
HOOK_INPUT_A=$(jq -n --arg sid "$SESSION_A" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT_A=$(echo "$HOOK_INPUT_A" | "$HOOK_SCRIPT" 2>&1)

# Session B blocked by its loop
HOOK_INPUT_B=$(jq -n --arg sid "$SESSION_B" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT_B=$(echo "$HOOK_INPUT_B" | "$HOOK_SCRIPT" 2>&1)

# Session C blocked by its loop
HOOK_INPUT_C=$(jq -n --arg sid "$SESSION_C" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT_C=$(echo "$HOOK_INPUT_C" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT_A" | grep -q '"decision": "block"' && \
   echo "$RESULT_B" | grep -q '"decision": "block"' && \
   echo "$RESULT_C" | grep -q '"decision": "block"'; then
  pass "All 3 sessions blocked by their own loops"
else
  fail "Each session should be blocked by its own loop"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.session-*.local.md"

# ============================================================================
# ITERATION COUNTER TESTS
# ============================================================================

run_test "Iteration counter increments on each loop"
SESSION="session-iter"
create_state_file "$SESSION" 5 100 "DONE"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
echo "$HOOK_INPUT" | "$HOOK_SCRIPT" > /dev/null 2>&1

ITER=$(grep '^iteration:' "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" | sed 's/iteration: *//')
if [[ "$ITER" -eq 6 ]]; then
  pass "Iteration incremented from 5 to 6"
else
  fail "Iteration should be 6, got $ITER"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "Iteration starts from 1 and increments correctly"
SESSION="session-iter-start"
create_state_file "$SESSION" 1 100 "DONE"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')

# Run 3 iterations
for i in 1 2 3; do
  echo "$HOOK_INPUT" | "$HOOK_SCRIPT" > /dev/null 2>&1
done

ITER=$(grep '^iteration:' "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" | sed 's/iteration: *//')
if [[ "$ITER" -eq 4 ]]; then
  pass "After 3 iterations, counter is 4"
else
  fail "After 3 iterations, counter should be 4, got $ITER"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

# ============================================================================
# MAX ITERATIONS TERMINATION TESTS
# ============================================================================

run_test "Max iterations reached → allows exit and deletes state"
SESSION="session-maxed"
create_state_file "$SESSION" 10 10 "DONE"  # iteration == max_iterations
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

# Should NOT block (allow exit)
if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Exit allowed when max iterations reached"
else
  fail "Should allow exit at max iterations" "Result: $RESULT"
  exit 1
fi

# State file should be deleted
if [[ ! -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" ]]; then
  pass "State file deleted after max iterations"
else
  fail "State file should be deleted"
  exit 1
fi

run_test "One before max iterations → still blocks"
SESSION="session-almost-max"
create_state_file "$SESSION" 9 10 "DONE"  # iteration < max_iterations
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Still blocks at iteration 9/10"
else
  fail "Should still block before max" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "max_iterations 0 means unlimited (never stops on count)"
SESSION="session-unlimited"
create_state_file "$SESSION" 9999 0 "DONE"  # max_iterations = 0 = unlimited
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Blocks even at iteration 9999 when max is 0 (unlimited)"
else
  fail "Should block with unlimited iterations" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

# ============================================================================
# COMPLETION PROMISE DETECTION TESTS
# ============================================================================

run_test "Completion promise detected → allows exit and deletes state"
SESSION="session-complete"
create_state_file "$SESSION" 5 100 "TASK COMPLETE"
# Create transcript with the promise in <promise> tags
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue working"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"I have finished the task. <promise>TASK COMPLETE</promise>"}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Exit allowed when completion promise detected"
else
  fail "Should allow exit when promise detected" "Result: $RESULT"
  exit 1
fi

if [[ ! -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" ]]; then
  pass "State file deleted after promise detected"
else
  fail "State file should be deleted"
  exit 1
fi

run_test "Promise text without <promise> tags → still blocks"
SESSION="session-no-tags"
create_state_file "$SESSION" 5 100 "DONE"
# Promise text present but NOT in tags
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"The task is DONE now."}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Still blocks when promise not in <promise> tags"
else
  fail "Should block without proper tags" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "Wrong promise text in tags → still blocks"
SESSION="session-wrong-promise"
create_state_file "$SESSION" 5 100 "CORRECT PROMISE"
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"<promise>WRONG PROMISE</promise>"}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Still blocks when promise text doesn't match"
else
  fail "Should block with wrong promise" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "No completion promise set (null) → runs until max iterations"
SESSION="session-no-promise"
# Create state file with null promise
cat > "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" <<EOF
---
active: true
session_id: "$SESSION"
description: "Test task"
iteration: 5
max_iterations: 100
completion_promise: null
started_at: "2024-01-15T10:00:00Z"
---

Build something.
EOF

cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"<promise>ANYTHING</promise>"}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Blocks even with promise tags when no promise set"
else
  fail "Should block when no promise is configured" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "Promise with special characters matches exactly"
SESSION="session-special-promise"
create_state_file "$SESSION" 5 100 "Done: 100% complete!"
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"<promise>Done: 100% complete!</promise>"}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Promise with special characters detected correctly"
else
  fail "Should detect promise with special chars" "Result: $RESULT"
  exit 1
fi

# ============================================================================
# MULTI-MESSAGE TRANSCRIPT TESTS (would have caught single-message bug)
# ============================================================================

run_test "Promise in earlier message, tool call in final → still detects promise"
SESSION="session-promise-then-tool"
create_state_file "$SESSION" 5 100 "TASK COMPLETE"
# Realistic scenario: Claude outputs promise, then makes a tool call
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue working"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"I have completed the task. <promise>TASK COMPLETE</promise>"}]}}
{"role":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_123","name":"Write","input":{"file_path":"/tmp/test.txt","content":"done"}}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Promise detected even when followed by tool call"
else
  fail "Should detect promise in earlier message" "Result: $RESULT"
  exit 1
fi

run_test "Promise in first message, more text in later messages → still detects"
SESSION="session-promise-first"
create_state_file "$SESSION" 5 100 "DONE"
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Start"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"<promise>DONE</promise> Task completed."}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"Here are the final results..."}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Promise in first message still detected"
else
  fail "Should detect promise in first message" "Result: $RESULT"
  exit 1
fi

run_test "Final message is tool-only (no text) → still finds promise in earlier message"
SESSION="session-tool-only-final"
create_state_file "$SESSION" 5 100 "COMPLETE"
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Continue"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"Task is <promise>COMPLETE</promise>"}]}}
{"role":"assistant","message":{"content":[{"type":"tool_use","id":"abc","name":"Bash","input":{"command":"echo done"}}]}}
{"role":"assistant","message":{"content":[{"type":"tool_result","tool_use_id":"abc","content":"done"}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Promise found despite tool-only final message"
else
  fail "Should find promise when final message has no text" "Result: $RESULT"
  exit 1
fi

# ============================================================================
# JQ FILTER UNIT TESTS (would have caught format mismatch bug)
# ============================================================================

run_test "jq filter extracts text from correct transcript format"
# This directly tests the jq filter logic that was buggy
# Transcript format: {"role":"assistant", "message":{"content":[...]}}
# NOT: {"message":{"role":"assistant", ...}}
TEST_TRANSCRIPT=$(cat <<'EOF'
{"role":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}
EOF
)

RESULT=$(echo "$TEST_TRANSCRIPT" | jq -rs '[.[] | select(.role == "assistant") | .message.content[]? | select(.type == "text") | .text] | join("\n")')

if [[ "$RESULT" == "Hello world" ]]; then
  pass "jq filter correctly extracts text from transcript format"
else
  fail "jq filter broken - got: '$RESULT'" ""
  exit 1
fi

run_test "jq filter handles mixed content (text + tool_use)"
TEST_TRANSCRIPT=$(cat <<'EOF'
{"role":"assistant","message":{"content":[{"type":"text","text":"First"},{"type":"tool_use","id":"x","name":"Bash","input":{}},{"type":"text","text":"Second"}]}}
EOF
)

RESULT=$(echo "$TEST_TRANSCRIPT" | jq -rs '[.[] | select(.role == "assistant") | .message.content[]? | select(.type == "text") | .text] | join("\n")')

if [[ "$RESULT" == $'First\nSecond' ]]; then
  pass "jq filter extracts all text blocks, skips tool_use"
else
  fail "jq filter failed with mixed content - got: '$RESULT'" ""
  exit 1
fi

# ============================================================================
# CORRUPTED STATE FILE TESTS
# ============================================================================

run_test "Corrupted iteration (non-numeric) → stops loop gracefully"
SESSION="session-corrupt-iter"
cat > "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" <<EOF
---
active: true
session_id: "$SESSION"
description: "Test task"
iteration: not_a_number
max_iterations: 10
completion_promise: "DONE"
started_at: "2024-01-15T10:00:00Z"
---

Build something.
EOF
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

# Should allow exit (stop gracefully)
if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Gracefully stops on corrupted iteration"
else
  fail "Should stop on corrupted state" "Result: $RESULT"
  exit 1
fi

run_test "Corrupted max_iterations (non-numeric) → stops loop gracefully"
SESSION="session-corrupt-max"
cat > "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" <<EOF
---
active: true
session_id: "$SESSION"
description: "Test task"
iteration: 5
max_iterations: abc
completion_promise: "DONE"
started_at: "2024-01-15T10:00:00Z"
---

Build something.
EOF
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Gracefully stops on corrupted max_iterations"
else
  fail "Should stop on corrupted state" "Result: $RESULT"
  exit 1
fi

run_test "Missing prompt in state file → stops loop gracefully"
SESSION="session-no-prompt"
cat > "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" <<EOF
---
active: true
session_id: "$SESSION"
description: "Test task"
iteration: 5
max_iterations: 10
completion_promise: "DONE"
started_at: "2024-01-15T10:00:00Z"
---
EOF
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Gracefully stops when no prompt in state file"
else
  fail "Should stop when prompt missing" "Result: $RESULT"
  exit 1
fi

# ============================================================================
# MISSING/INVALID HOOK INPUT TESTS
# ============================================================================

run_test "Missing session_id in hook input → allows exit"
SESSION="session-exists"
create_state_file "$SESSION" 5 100 "DONE"
create_transcript

HOOK_INPUT=$(jq -n --arg tp "$TEST_DIR/transcript.jsonl" '{transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Allows exit when session_id missing from hook input"
else
  fail "Should allow exit without session_id" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "Empty session_id in hook input → allows exit"
create_transcript

HOOK_INPUT=$(jq -n --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: "", transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Allows exit when session_id is empty"
else
  fail "Should allow exit with empty session_id" "Result: $RESULT"
  exit 1
fi

run_test "Missing transcript_path → stops loop gracefully"
SESSION="session-no-transcript"
create_state_file "$SESSION" 5 100 "DONE"

HOOK_INPUT=$(jq -n --arg sid "$SESSION" '{session_id: $sid, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

# Should handle gracefully
if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Handles missing transcript_path gracefully"
else
  fail "Should handle missing transcript" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" 2>/dev/null || true

run_test "Non-existent transcript file → stops loop gracefully"
SESSION="session-bad-transcript"
create_state_file "$SESSION" 5 100 "DONE"

HOOK_INPUT=$(jq -n --arg sid "$SESSION" '{session_id: $sid, transcript_path: "/nonexistent/transcript.jsonl", cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Handles non-existent transcript file gracefully"
else
  fail "Should handle missing transcript file" "Result: $RESULT"
  exit 1
fi

# ============================================================================
# TRANSCRIPT CONTENT EDGE CASES
# ============================================================================

run_test "Empty assistant message in transcript → stops gracefully"
SESSION="session-empty-msg"
create_state_file "$SESSION" 5 100 "DONE"
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Start"}]}}
{"role":"assistant","message":{"content":[]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Handles empty assistant message gracefully"
else
  fail "Should handle empty message" "Result: $RESULT"
  exit 1
fi

run_test "No assistant messages in transcript → stops gracefully"
SESSION="session-no-assistant"
create_state_file "$SESSION" 5 100 "DONE"
cat > "$TEST_DIR/transcript.jsonl" <<'EOF'
{"role":"user","message":{"content":[{"type":"text","text":"Start"}]}}
{"role":"user","message":{"content":[{"type":"text","text":"Continue"}]}}
EOF

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Handles no assistant messages gracefully"
else
  fail "Should handle missing assistant messages" "Result: $RESULT"
  exit 1
fi

# ============================================================================
# PROMPT WITH SPECIAL CONTENT TESTS
# ============================================================================

run_test "Prompt containing --- separators is preserved"
SESSION="session-separator"
cat > "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md" <<'EOF'
---
active: true
session_id: "session-separator"
description: "Test task"
iteration: 1
max_iterations: 100
completion_promise: "DONE"
started_at: "2024-01-15T10:00:00Z"
---

Build an API.

---

## Phase 2

More requirements here.

---

End of prompt.
EOF
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

# Should block and include the full prompt with --- separators
if echo "$RESULT" | grep -q '"decision": "block"' && echo "$RESULT" | grep -q "Phase 2"; then
  pass "Prompt with --- separators preserved correctly"
else
  fail "Should preserve prompt with separators" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

# ============================================================================
# SYSTEM MESSAGE CONTENT TESTS
# ============================================================================

run_test "System message includes iteration count"
SESSION="session-sysmsg"
create_state_file "$SESSION" 7 20 "DONE"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q "iteration 8"; then
  pass "System message shows next iteration (8)"
else
  fail "System message should show iteration count" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

run_test "System message includes completion promise info"
SESSION="session-promise-msg"
create_state_file "$SESSION" 5 20 "MY PROMISE"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q "MY PROMISE"; then
  pass "System message shows completion promise"
else
  fail "System message should show promise" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

# ============================================================================
# JSON OUTPUT FORMAT TESTS
# ============================================================================

run_test "Block response is valid JSON with required fields"
SESSION="session-json"
create_state_file "$SESSION" 3 10 "DONE"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

# Parse as JSON and check required fields
if echo "$RESULT" | jq -e '.decision == "block"' > /dev/null 2>&1 && \
   echo "$RESULT" | jq -e '.reason' > /dev/null 2>&1 && \
   echo "$RESULT" | jq -e '.systemMessage' > /dev/null 2>&1; then
  pass "Block response is valid JSON with decision, reason, systemMessage"
else
  fail "Block response should be valid JSON with required fields" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

# ============================================================================
# SESSION ID SECURITY VALIDATION TESTS
# ============================================================================

run_test "Session ID with path traversal (..) → allows exit (security)"
SESSION_ATTACK="../../../etc/passwd"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION_ATTACK" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

# Should allow exit (security check rejects malicious session ID)
if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Path traversal session ID rejected"
else
  fail "Should reject path traversal session ID" "Result: $RESULT"
  exit 1
fi

run_test "Session ID with colons → allows exit (security)"
SESSION_ATTACK="session:with:colons"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION_ATTACK" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Session ID with colons rejected"
else
  fail "Should reject session ID with colons" "Result: $RESULT"
  exit 1
fi

run_test "Session ID with slashes → allows exit (security)"
SESSION_ATTACK="session/with/slashes"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION_ATTACK" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Session ID with slashes rejected"
else
  fail "Should reject session ID with slashes" "Result: $RESULT"
  exit 1
fi

run_test "Session ID with spaces → allows exit (security)"
SESSION_ATTACK="session with spaces"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION_ATTACK" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1) || true

if [[ "$RESULT" != *'"decision": "block"'* ]]; then
  pass "Session ID with spaces rejected"
else
  fail "Should reject session ID with spaces" "Result: $RESULT"
  exit 1
fi

run_test "Valid session ID with dots and underscores → works normally"
SESSION="valid.session_id-123"
create_state_file "$SESSION" 3 10 "DONE"
create_transcript

HOOK_INPUT=$(jq -n --arg sid "$SESSION" --arg tp "$TEST_DIR/transcript.jsonl" '{session_id: $sid, transcript_path: $tp, cwd: "."}')
RESULT=$(echo "$HOOK_INPUT" | "$HOOK_SCRIPT" 2>&1)

if echo "$RESULT" | grep -q '"decision": "block"'; then
  pass "Valid session ID with dots/underscores accepted"
else
  fail "Should accept valid session ID" "Result: $RESULT"
  exit 1
fi
rm -f "$TEST_DIR/.claude/ralph-loop.${SESSION}.local.md"

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
# All tests passed if we got here (failures cause early exit)
echo -e "${GREEN}All $TESTS_RUN tests passed! ($TESTS_PASSED assertions)${NC}"
