#!/bin/bash

# Part A Migration Validation Script
# Validates that all tools follow the standardized Golden Path pattern

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║        Part A Migration Validation Script              ║"
echo "║   Checking all tools use standardized patterns         ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Function to check and report
check() {
    local description=$1
    local command=$2
    local expected=$3
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    echo -n "Checking: $description... "
    
    result=$(eval "$command" 2>/dev/null || echo "0")
    
    if [ "$expected" = "zero" ]; then
        if [ "$result" = "0" ] || [ -z "$result" ]; then
            echo -e "${GREEN}✅ PASS${NC}"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            echo -e "${RED}❌ FAIL${NC} (found $result instances)"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        fi
    else
        if [ "$result" -ge "$expected" ]; then
            echo -e "${GREEN}✅ PASS${NC} ($result found, expected $expected+)"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            echo -e "${RED}❌ FAIL${NC} ($result found, expected $expected+)"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        fi
    fi
}

echo "═══════════════════════════════════════════════════════════"
echo "1. CHECKING HELPER USAGE"
echo "═══════════════════════════════════════════════════════════"

check "resolveSession usage in tools" \
    "grep -r 'resolveSession' src/tools/ --include='*.ts' | wc -l" \
    "10"

check "aiGenerate usage in AI tools" \
    "grep -r 'aiGenerate' src/tools/ --include='*.ts' | wc -l" \
    "2"

check "formatStandardResponse usage" \
    "grep -r 'formatStandardResponse' src/tools/ --include='*.ts' | wc -l" \
    "5"

check "wrapTool usage for all tools" \
    "grep -r 'wrapTool' src/tools/ --include='*.ts' | wc -l" \
    "10"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "2. CHECKING FOR OLD PATTERNS (should be zero)"
echo "═══════════════════════════════════════════════════════════"

check "No direct context.sampling calls" \
    "grep -r 'context.sampling' src/tools/ --include='*.ts' | wc -l" \
    "zero"

check "No createMessage calls" \
    "grep -r 'createMessage' src/tools/ --include='*.ts' | wc -l" \
    "zero"

check "No JSON.stringify in responses" \
    "grep -r 'return.*Success.*JSON.stringify' src/tools/ --include='*.ts' | wc -l" \
    "zero"

check "No required sessionId validations" \
    "grep -r '!params.sessionId\|sessionId.*required' src/tools/ --include='*.ts' | grep -v 'optional' | wc -l" \
    "zero"

check "No direct AI invocation" \
    "grep -r 'directAI\|invokeAI' src/tools/ --include='*.ts' | wc -l" \
    "zero"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "3. CHECKING SCHEMA PATTERNS"
echo "═══════════════════════════════════════════════════════════"

check "All sessionId parameters are optional" \
    "grep -r 'sessionId:.*z.string()' src/tools/*/schema.ts | grep -c '.optional()'" \
    "9"

check "No required sessionId in schemas" \
    "grep -r 'sessionId:.*z.string()\\.' src/tools/*/schema.ts | grep -v 'optional' | wc -l" \
    "zero"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "4. RUNNING AUTOMATED TESTS"
echo "═══════════════════════════════════════════════════════════"

echo -n "Running TypeScript compilation... "
if npm run typecheck --silent 2>/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ FAIL${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo -n "Running linter checks... "
if npm run lint --silent 2>/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (non-blocking)"
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo -n "Running unit tests... "
if npm test --silent 2>/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo -e "${RED}❌ FAIL${NC}"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "5. CHECKING DOCUMENTATION"
echo "═══════════════════════════════════════════════════════════"

check "Tool standardization guide exists" \
    "[ -f docs/tool-standardization-guide.md ] && echo '1' || echo '0'" \
    "1"

check "Development guide updated" \
    "grep -c 'standardized Golden Path pattern' docs/development.md" \
    "1"

check "Migration marked complete" \
    "grep -c 'Migration Status: ✅ COMPLETE' docs/tool-standardization-guide.md" \
    "1"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║                    VALIDATION SUMMARY                   ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Calculate percentage
if [ $TOTAL_CHECKS -gt 0 ]; then
    PERCENTAGE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
else
    PERCENTAGE=0
fi

echo "Total Checks: $TOTAL_CHECKS"
echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
echo "Success Rate: $PERCENTAGE%"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     🎉 ALL VALIDATIONS PASSED! 🎉                      ║${NC}"
    echo -e "${GREEN}║  Part A Migration is COMPLETE and VALIDATED            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║     ⚠️  VALIDATION FAILED                               ║${NC}"
    echo -e "${RED}║  $FAILED_CHECKS checks failed. Please review and fix.          ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi