#!/bin/bash
# Test: list-ralph-loops command - Comprehensive test suite
# Tests listing active loops, elapsed time calculation, edge cases

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# The list script extracted from the markdown command
# This is the core logic we're testing
# Uses find to avoid shell glob expansion errors in zsh when no files match
run_list_script() {
  local dir="$1"
  cd "$dir"

  found=0
  # Use find to avoid shell glob expansion errors when no files exist
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ -f "$f" ]]; then
      found=1
      SESSION=$(basename "$f" | sed 's/ralph-loop\.\(.*\)\.local\.md/\1/')
      DESC=$(grep '^description:' "$f" 2>/dev/null | sed 's/description: *//' | sed 's/^"\(.*\)"$/\1/' || echo "No description")
      ITER=$(grep '^iteration:' "$f" 2>/dev/null | sed 's/iteration: *//' || echo "?")
      MAX=$(grep '^max_iterations:' "$f" 2>/dev/null | sed 's/max_iterations: *//' || echo "0")
      STARTED=$(grep '^started_at:' "$f" 2>/dev/null | sed 's/started_at: *//' | sed 's/^"\(.*\)"$/\1/' || echo "unknown")

      # Calculate elapsed time
      if [[ "$STARTED" != "unknown" ]]; then
        START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED" "+%s" 2>/dev/null || date -d "$STARTED" "+%s" 2>/dev/null || echo "")
        if [[ -n "$START_EPOCH" ]]; then
          NOW_EPOCH=$(date "+%s")
          ELAPSED_SECS=$((NOW_EPOCH - START_EPOCH))
          ELAPSED_HOURS=$((ELAPSED_SECS / 3600))
          ELAPSED_MINS=$(((ELAPSED_SECS % 3600) / 60))
          if [[ $ELAPSED_HOURS -gt 0 ]]; then
            ELAPSED="${ELAPSED_HOURS}h ${ELAPSED_MINS}m"
          else
            ELAPSED="${ELAPSED_MINS}m"
          fi
        else
          ELAPSED="unknown"
        fi
      else
        ELAPSED="unknown"
      fi

      echo "LOOP_FOUND"
      echo "SESSION=$SESSION"
      echo "DESC=$DESC"
      echo "ITER=$ITER"
      echo "MAX=$MAX"
      echo "ELAPSED=$ELAPSED"
      echo "FILE=$f"
      echo "---"
    fi
  done < <(find .claude -maxdepth 1 -name 'ralph-loop.*.local.md' 2>/dev/null)
  if [[ $found -eq 0 ]]; then
    echo "NO_LOOPS_FOUND"
  fi
}

echo "=== Testing list-ralph-loops command ==="
echo "Comprehensive test suite for loop listing"

# Create temp directory for tests
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

# ============================================================================
# HAPPY PATH TESTS
# ============================================================================

run_test "No loops found - empty .claude directory"
mkdir -p "$TEST_DIR/project1/.claude"
OUTPUT=$(run_list_script "$TEST_DIR/project1")

if [[ "$OUTPUT" == "NO_LOOPS_FOUND" ]]; then
  pass "Reports no loops when directory is empty"
else
  fail "Should report NO_LOOPS_FOUND" "Got: $OUTPUT"
  exit 1
fi

run_test "No loops found - no .claude directory"
mkdir -p "$TEST_DIR/project2"
OUTPUT=$(run_list_script "$TEST_DIR/project2")

if [[ "$OUTPUT" == "NO_LOOPS_FOUND" ]]; then
  pass "Reports no loops when .claude doesn't exist"
else
  fail "Should report NO_LOOPS_FOUND" "Got: $OUTPUT"
  exit 1
fi

run_test "No loops found - .claude exists but no matching files (zsh glob safety)"
# This test specifically validates the fix for zsh glob expansion errors
# In zsh, `for f in pattern` throws "no matches found" if pattern doesn't match
# The find-based approach should handle this gracefully
mkdir -p "$TEST_DIR/project2b/.claude"
# Add some non-matching files to ensure glob pattern specificity
touch "$TEST_DIR/project2b/.claude/settings.json"
touch "$TEST_DIR/project2b/.claude/other-file.md"
OUTPUT=$(run_list_script "$TEST_DIR/project2b" 2>&1)

if [[ "$OUTPUT" == "NO_LOOPS_FOUND" ]]; then
  pass "No glob expansion error when no loops match"
else
  if echo "$OUTPUT" | grep -qi "no matches found\|parse error"; then
    fail "Glob expansion error occurred (zsh compatibility issue)" "Got: $OUTPUT"
  else
    fail "Should report NO_LOOPS_FOUND" "Got: $OUTPUT"
  fi
  exit 1
fi

run_test "Single loop found with all fields"
mkdir -p "$TEST_DIR/project3/.claude"
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$TEST_DIR/project3/.claude/ralph-loop.session-abc123.local.md" <<EOF
---
active: true
session_id: "session-abc123"
description: "Build a REST API"
iteration: 5
max_iterations: 20
started_at: "$STARTED_AT"
---

Build a REST API for user management.
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project3")

if echo "$OUTPUT" | grep -q "LOOP_FOUND" && \
   echo "$OUTPUT" | grep -q "SESSION=session-abc123" && \
   echo "$OUTPUT" | grep -q "DESC=Build a REST API" && \
   echo "$OUTPUT" | grep -q "ITER=5" && \
   echo "$OUTPUT" | grep -q "MAX=20"; then
  pass "Single loop parsed correctly"
else
  fail "Single loop not parsed correctly" "Got: $OUTPUT"
  exit 1
fi

run_test "Multiple loops found"
mkdir -p "$TEST_DIR/project4/.claude"

cat > "$TEST_DIR/project4/.claude/ralph-loop.session-aaa.local.md" <<EOF
---
active: true
session_id: "session-aaa"
description: "Task A"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

cat > "$TEST_DIR/project4/.claude/ralph-loop.session-bbb.local.md" <<EOF
---
active: true
session_id: "session-bbb"
description: "Task B"
iteration: 3
max_iterations: 0
started_at: "2024-01-15T11:00:00Z"
---
EOF

cat > "$TEST_DIR/project4/.claude/ralph-loop.session-ccc.local.md" <<EOF
---
active: true
session_id: "session-ccc"
description: "Task C"
iteration: 7
max_iterations: 50
started_at: "2024-01-15T12:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project4")
LOOP_COUNT=$(echo "$OUTPUT" | grep -c "LOOP_FOUND" || true)

if [[ "$LOOP_COUNT" -eq 3 ]]; then
  pass "All 3 loops found"
else
  fail "Expected 3 loops, found $LOOP_COUNT" "Got: $OUTPUT"
  exit 1
fi

run_test "Session ID extraction from filename"
mkdir -p "$TEST_DIR/project5/.claude"
cat > "$TEST_DIR/project5/.claude/ralph-loop.my-unique-session-id-12345.local.md" <<EOF
---
active: true
session_id: "my-unique-session-id-12345"
description: "Test"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project5")

if echo "$OUTPUT" | grep -q "SESSION=my-unique-session-id-12345"; then
  pass "Session ID extracted correctly from filename"
else
  fail "Session ID not extracted" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# ELAPSED TIME CALCULATION TESTS
# ============================================================================

run_test "Elapsed time - just started (0 minutes)"
mkdir -p "$TEST_DIR/project6/.claude"
# Use local time to match how the script parses (date -j treats input as local time)
NOW=$(date +%Y-%m-%dT%H:%M:%SZ)
cat > "$TEST_DIR/project6/.claude/ralph-loop.session-new.local.md" <<EOF
---
active: true
session_id: "session-new"
description: "Just started"
iteration: 1
max_iterations: 10
started_at: "$NOW"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project6")

if echo "$OUTPUT" | grep -q "ELAPSED=0m"; then
  pass "Elapsed time shows 0m for just-started loop"
else
  fail "Should show 0m elapsed" "Got: $OUTPUT"
  exit 1
fi

run_test "Elapsed time - hours and minutes format"
mkdir -p "$TEST_DIR/project7/.claude"
# Calculate 2h30m ago using epoch seconds (portable across macOS/Linux)
PAST_EPOCH=$(($(date +%s) - 2*3600 - 30*60))
if [[ "$(uname)" == "Darwin" ]]; then
  PAST=$(date -r $PAST_EPOCH +%Y-%m-%dT%H:%M:%SZ)
else
  PAST=$(date -d "@$PAST_EPOCH" +%Y-%m-%dT%H:%M:%SZ)
fi
cat > "$TEST_DIR/project7/.claude/ralph-loop.session-old.local.md" <<EOF
---
active: true
session_id: "session-old"
description: "Running for a while"
iteration: 15
max_iterations: 100
started_at: "$PAST"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project7")

if echo "$OUTPUT" | grep -qE "ELAPSED=2h [0-9]+m"; then
  pass "Elapsed time shows hours and minutes"
else
  fail "Should show ~2h Xm elapsed" "Got: $OUTPUT"
  exit 1
fi

run_test "Elapsed time - unknown when started_at missing"
mkdir -p "$TEST_DIR/project8/.claude"
cat > "$TEST_DIR/project8/.claude/ralph-loop.session-notime.local.md" <<EOF
---
active: true
session_id: "session-notime"
description: "No timestamp"
iteration: 1
max_iterations: 10
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project8")

if echo "$OUTPUT" | grep -q "ELAPSED=unknown"; then
  pass "Elapsed time shows unknown when started_at missing"
else
  fail "Should show unknown elapsed" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# MISSING FIELDS TESTS
# ============================================================================

run_test "Missing description field"
mkdir -p "$TEST_DIR/project9/.claude"
cat > "$TEST_DIR/project9/.claude/ralph-loop.session-nodesc.local.md" <<EOF
---
active: true
session_id: "session-nodesc"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project9")

if echo "$OUTPUT" | grep -q "DESC=No description"; then
  pass "Default description when field missing"
else
  fail "Should show 'No description'" "Got: $OUTPUT"
  exit 1
fi

run_test "Missing iteration field"
mkdir -p "$TEST_DIR/project10/.claude"
cat > "$TEST_DIR/project10/.claude/ralph-loop.session-noiter.local.md" <<EOF
---
active: true
session_id: "session-noiter"
description: "No iteration"
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project10")

if echo "$OUTPUT" | grep -q "ITER=?"; then
  pass "Shows ? when iteration missing"
else
  fail "Should show ITER=?" "Got: $OUTPUT"
  exit 1
fi

run_test "Missing max_iterations field"
mkdir -p "$TEST_DIR/project11/.claude"
cat > "$TEST_DIR/project11/.claude/ralph-loop.session-nomax.local.md" <<EOF
---
active: true
session_id: "session-nomax"
description: "No max"
iteration: 5
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project11")

if echo "$OUTPUT" | grep -q "MAX=0"; then
  pass "Defaults to 0 (unlimited) when max_iterations missing"
else
  fail "Should default to MAX=0" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# SPECIAL CHARACTERS IN DESCRIPTION
# ============================================================================

run_test "Description with special characters"
mkdir -p "$TEST_DIR/project12/.claude"
cat > "$TEST_DIR/project12/.claude/ralph-loop.session-special.local.md" <<EOF
---
active: true
session_id: "session-special"
description: "Build API & fix bugs (v2.0)"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project12")

if echo "$OUTPUT" | grep -q "DESC=Build API & fix bugs (v2.0)"; then
  pass "Special characters in description preserved"
else
  fail "Special characters not preserved" "Got: $OUTPUT"
  exit 1
fi

run_test "Description with colons"
mkdir -p "$TEST_DIR/project13/.claude"
cat > "$TEST_DIR/project13/.claude/ralph-loop.session-colon.local.md" <<EOF
---
active: true
session_id: "session-colon"
description: "Fix: memory leak in API"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project13")

if echo "$OUTPUT" | grep -q "DESC=Fix: memory leak in API"; then
  pass "Colons in description handled"
else
  fail "Colons in description not handled" "Got: $OUTPUT"
  exit 1
fi

run_test "Description with quotes stripped"
mkdir -p "$TEST_DIR/project14/.claude"
cat > "$TEST_DIR/project14/.claude/ralph-loop.session-quoted.local.md" <<EOF
---
active: true
session_id: "session-quoted"
description: "Quoted description here"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project14")

if echo "$OUTPUT" | grep -q "DESC=Quoted description here"; then
  pass "Quotes stripped from description"
else
  fail "Quotes not stripped" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# EDGE CASE: VARIOUS ITERATION/MAX VALUES
# ============================================================================

run_test "Iteration 0 (just started)"
mkdir -p "$TEST_DIR/project15/.claude"
cat > "$TEST_DIR/project15/.claude/ralph-loop.session-zero.local.md" <<EOF
---
active: true
session_id: "session-zero"
description: "Zero iteration"
iteration: 0
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project15")

if echo "$OUTPUT" | grep -q "ITER=0"; then
  pass "Iteration 0 reported correctly"
else
  fail "Should show ITER=0" "Got: $OUTPUT"
  exit 1
fi

run_test "Max iterations 0 (unlimited)"
mkdir -p "$TEST_DIR/project16/.claude"
cat > "$TEST_DIR/project16/.claude/ralph-loop.session-unlimited.local.md" <<EOF
---
active: true
session_id: "session-unlimited"
description: "Unlimited"
iteration: 100
max_iterations: 0
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project16")

if echo "$OUTPUT" | grep -q "MAX=0"; then
  pass "Unlimited (0) max iterations reported"
else
  fail "Should show MAX=0" "Got: $OUTPUT"
  exit 1
fi

run_test "Large iteration count"
mkdir -p "$TEST_DIR/project17/.claude"
cat > "$TEST_DIR/project17/.claude/ralph-loop.session-large.local.md" <<EOF
---
active: true
session_id: "session-large"
description: "Large count"
iteration: 9999
max_iterations: 10000
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project17")

if echo "$OUTPUT" | grep -q "ITER=9999" && echo "$OUTPUT" | grep -q "MAX=10000"; then
  pass "Large iteration counts handled"
else
  fail "Large counts not handled" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# FILE PATH OUTPUT
# ============================================================================

run_test "File path included in output"
mkdir -p "$TEST_DIR/project18/.claude"
cat > "$TEST_DIR/project18/.claude/ralph-loop.session-path.local.md" <<EOF
---
active: true
session_id: "session-path"
description: "Path test"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project18")

if echo "$OUTPUT" | grep -q "FILE=.claude/ralph-loop.session-path.local.md"; then
  pass "File path included in output"
else
  fail "File path not in output" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# CORRUPTED/MALFORMED STATE FILES
# ============================================================================

run_test "Empty state file"
mkdir -p "$TEST_DIR/project19/.claude"
touch "$TEST_DIR/project19/.claude/ralph-loop.session-empty.local.md"

OUTPUT=$(run_list_script "$TEST_DIR/project19")

if echo "$OUTPUT" | grep -q "LOOP_FOUND"; then
  if echo "$OUTPUT" | grep -q "SESSION=session-empty" && \
     echo "$OUTPUT" | grep -q "DESC=No description" && \
     echo "$OUTPUT" | grep -q "ITER=?"; then
    pass "Empty file handled with defaults"
  else
    fail "Empty file not handled gracefully" "Got: $OUTPUT"
    exit 1
  fi
else
  fail "Empty file should still be detected as loop" "Got: $OUTPUT"
  exit 1
fi

run_test "State file with only prompt (no frontmatter)"
mkdir -p "$TEST_DIR/project20/.claude"
cat > "$TEST_DIR/project20/.claude/ralph-loop.session-nofrontmatter.local.md" <<EOF
This is just a prompt without any YAML frontmatter.
Build something cool.
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project20")

if echo "$OUTPUT" | grep -q "LOOP_FOUND" && \
   echo "$OUTPUT" | grep -q "SESSION=session-nofrontmatter"; then
  pass "File without frontmatter still detected"
else
  fail "File without frontmatter should be detected" "Got: $OUTPUT"
  exit 1
fi

run_test "State file with malformed YAML"
mkdir -p "$TEST_DIR/project21/.claude"
cat > "$TEST_DIR/project21/.claude/ralph-loop.session-badfrontmatter.local.md" <<EOF
---
this is not: valid: yaml: at: all
iteration: [broken
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project21")

if echo "$OUTPUT" | grep -q "LOOP_FOUND" && \
   echo "$OUTPUT" | grep -q "SESSION=session-badfrontmatter"; then
  pass "Malformed YAML handled gracefully"
else
  fail "Malformed YAML should not crash script" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# UUID SESSION IDS
# ============================================================================

run_test "UUID session ID"
mkdir -p "$TEST_DIR/project22/.claude"
cat > "$TEST_DIR/project22/.claude/ralph-loop.550e8400-e29b-41d4-a716-446655440000.local.md" <<EOF
---
active: true
session_id: "550e8400-e29b-41d4-a716-446655440000"
description: "UUID test"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project22")

if echo "$OUTPUT" | grep -q "SESSION=550e8400-e29b-41d4-a716-446655440000"; then
  pass "UUID session ID extracted correctly"
else
  fail "UUID session ID not extracted" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# NON-RALPH FILES IGNORED
# ============================================================================

run_test "Non-ralph files in .claude directory ignored"
mkdir -p "$TEST_DIR/project23/.claude"
# Create various non-ralph files
touch "$TEST_DIR/project23/.claude/settings.json"
echo "some content" > "$TEST_DIR/project23/.claude/notes.md"
touch "$TEST_DIR/project23/.claude/ralph-loop.local.md.backup"

OUTPUT=$(run_list_script "$TEST_DIR/project23")

if [[ "$OUTPUT" == "NO_LOOPS_FOUND" ]]; then
  pass "Non-ralph files correctly ignored"
else
  fail "Non-ralph files should be ignored" "Got: $OUTPUT"
  exit 1
fi

run_test "Only .local.md files matched"
mkdir -p "$TEST_DIR/project24/.claude"
# Create similarly named but not matching files
cat > "$TEST_DIR/project24/.claude/ralph-loop.session123.md" <<EOF
---
description: "Should be ignored"
---
EOF
cat > "$TEST_DIR/project24/.claude/ralph-loop.session456.local.txt" <<EOF
---
description: "Should also be ignored"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project24")

if [[ "$OUTPUT" == "NO_LOOPS_FOUND" ]]; then
  pass "Only .local.md extension matched"
else
  fail "Should only match .local.md files" "Got: $OUTPUT"
  exit 1
fi

# ============================================================================
# OUTPUT FORMAT TESTS
# ============================================================================

run_test "Output has correct separator between loops"
mkdir -p "$TEST_DIR/project25/.claude"
cat > "$TEST_DIR/project25/.claude/ralph-loop.session-x.local.md" <<EOF
---
description: "X"
iteration: 1
max_iterations: 10
started_at: "2024-01-15T10:00:00Z"
---
EOF
cat > "$TEST_DIR/project25/.claude/ralph-loop.session-y.local.md" <<EOF
---
description: "Y"
iteration: 2
max_iterations: 20
started_at: "2024-01-15T11:00:00Z"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project25")
SEPARATOR_COUNT=$(echo "$OUTPUT" | grep -c "^---$" || true)

if [[ "$SEPARATOR_COUNT" -eq 2 ]]; then
  pass "Each loop ends with --- separator"
else
  fail "Expected 2 separators, found $SEPARATOR_COUNT" "Got: $OUTPUT"
  exit 1
fi

run_test "All required fields present in output"
mkdir -p "$TEST_DIR/project26/.claude"
NOW=$(date +%Y-%m-%dT%H:%M:%SZ)
cat > "$TEST_DIR/project26/.claude/ralph-loop.session-complete.local.md" <<EOF
---
active: true
session_id: "session-complete"
description: "Complete test"
iteration: 5
max_iterations: 25
started_at: "$NOW"
---
EOF

OUTPUT=$(run_list_script "$TEST_DIR/project26")

if echo "$OUTPUT" | grep -q "LOOP_FOUND" && \
   echo "$OUTPUT" | grep -q "SESSION=" && \
   echo "$OUTPUT" | grep -q "DESC=" && \
   echo "$OUTPUT" | grep -q "ITER=" && \
   echo "$OUTPUT" | grep -q "MAX=" && \
   echo "$OUTPUT" | grep -q "ELAPSED=" && \
   echo "$OUTPUT" | grep -q "FILE="; then
  pass "All required fields present in output"
else
  fail "Missing required fields" "Got: $OUTPUT"
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
