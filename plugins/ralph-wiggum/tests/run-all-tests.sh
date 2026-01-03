#!/bin/bash
# Run all Ralph Wiggum plugin tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Ralph Wiggum Plugin - Test Suite                     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

FAILED=0
PASSED=0

run_test() {
  local test_script="$1"
  local test_name=$(basename "$test_script" .sh)

  echo -e "${CYAN}Running: $test_name${NC}"
  echo "────────────────────────────────────────────────────────────"

  if bash "$test_script"; then
    echo ""
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}FAILED: $test_name${NC}"
    echo ""
    FAILED=$((FAILED + 1))
  fi
}

# Run individual test suites
run_test "$SCRIPT_DIR/test-session-start-hook.sh"
run_test "$SCRIPT_DIR/test-setup-ralph-loop.sh"
run_test "$SCRIPT_DIR/test-stop-hook-isolation.sh"
run_test "$SCRIPT_DIR/test-list-ralph-loops.sh"

# Summary
echo "════════════════════════════════════════════════════════════"
echo ""
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}All tests passed! ($PASSED test suites)${NC}"
  exit 0
else
  echo -e "${RED}$FAILED test suite(s) failed, $PASSED passed${NC}"
  exit 1
fi
