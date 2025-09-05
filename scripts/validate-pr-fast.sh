#!/bin/bash

set -Eeuo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Ensure we're in the right directory
if [ ! -f "package.json" ]; then
    print_status $RED "Error: Must be run from project root directory"
    exit 1
fi

print_header "Fast PR Validation - Key Quality Checks"

# Step 1: Quality Metrics Check (using improved lint-metrics.sh)
print_header "Code Quality Analysis"

print_status $BLUE "Running comprehensive quality metrics..."
set +e  # Temporarily disable exit on error
METRICS_OUTPUT=$(./scripts/lint-metrics.sh 2>&1)
METRICS_EXIT_CODE=$?
set -e  # Re-enable exit on error

# Extract metrics from our improved script output
CURRENT_WARNINGS=$(echo "$METRICS_OUTPUT" | grep "Total warnings:" | sed 's/Total warnings: //')
CURRENT_ERRORS=$(echo "$METRICS_OUTPUT" | grep "Total errors:" | sed 's/Total errors: //')
CURRENT_DEADCODE=$(echo "$METRICS_OUTPUT" | grep "Total unused exports:" | sed 's/Total unused exports: //')

print_status $BLUE "Current quality status:"
echo "  ESLint warnings: $CURRENT_WARNINGS"
echo "  ESLint errors: $CURRENT_ERRORS"
echo "  Unused exports: $CURRENT_DEADCODE"

# Check if there are lint errors (these always fail)
if [ "$CURRENT_ERRORS" -gt 0 ]; then
    print_status $RED "❌ LINT ERRORS FOUND - PR would fail"
    echo ""
    echo "Lint-metrics.sh detected $CURRENT_ERRORS errors"
    print_status $YELLOW "Fix these lint errors before creating your PR"
    exit 1
fi

# Check if lint-metrics script failed for other reasons (baseline violations)
if [ $METRICS_EXIT_CODE -ne 0 ]; then
    print_status $RED "❌ QUALITY GATES FAILED - PR would fail"
    echo ""
    echo "Quality metrics output:"
    echo "$METRICS_OUTPUT" | grep -E "(❌|✅|⚠️)"
    exit 1
fi

# Extract baseline status from metrics output
RATCHET_PASSED=true
if echo "$METRICS_OUTPUT" | grep -q "❌.*Increased by:"; then
    print_status $RED "❌ QUALITY RATCHET VIOLATION - PR would fail"
    echo "$METRICS_OUTPUT" | grep -A2 -B2 "❌.*Increased by:"
    RATCHET_PASSED=false
elif echo "$METRICS_OUTPUT" | grep -q "✅.*Reduced by:"; then
    print_status $GREEN "✅ QUALITY IMPROVEMENT DETECTED"
    echo "$METRICS_OUTPUT" | grep "✅.*Reduced by:"
else
    print_status $GREEN "✅ QUALITY BASELINE MAINTAINED"
fi

# Step 2: TypeScript check
print_header "TypeScript Compilation Check"
if npm run typecheck >/dev/null 2>&1; then
    print_status $GREEN "✅ TypeScript compilation passed"
else
    print_status $RED "❌ TypeScript compilation failed - PR would fail"
    echo ""
    echo "TypeScript errors:"
    npm run typecheck 2>&1 | head -10
    exit 1
fi

# Step 3: Quick test check (just ensure they can start)
print_header "Quick Test Validation"
print_status $YELLOW "Running basic test validation..."

# Try to run a single quick test to ensure test framework works
if NODE_OPTIONS='--experimental-vm-modules' npx jest --listTests --testMatch='**/unit/**/*.test.ts' >/dev/null 2>&1; then
    TEST_COUNT=$(NODE_OPTIONS='--experimental-vm-modules' npx jest --listTests --testMatch='**/unit/**/*.test.ts' 2>/dev/null | wc -l)
    print_status $GREEN "✅ Test framework working ($TEST_COUNT unit tests found)"
else
    print_status $RED "❌ Test framework issues - PR might fail"
    exit 1
fi

# Step 4: Show detailed quality metrics
if [ "${1:-}" = "--show-warnings" ] && [ "$CURRENT_WARNINGS" -gt 0 ]; then
    print_header "Detailed Quality Report"
    echo "Top Warning Types:"
    echo "$METRICS_OUTPUT" | sed -n '/=== Top 10 Warning Types ===/,/^$/p' | tail -n +2 | head -8 | sed 's/^/  /'
    echo ""
    echo "Top Deadcode Files:"
    echo "$METRICS_OUTPUT" | sed -n '/=== Top 5 Files with Unused Exports ===/,/^$/p' | tail -n +2 | head -5 | sed 's/^/  /'
fi

# Final summary
print_header "Fast Validation Summary"

if [ "$CURRENT_ERRORS" -eq 0 ] && [ "$RATCHET_PASSED" = true ]; then
    print_status $GREEN "✅ FAST PR VALIDATION PASSED"
    echo "  ✅ No lint errors ($CURRENT_ERRORS)"
    echo "  ✅ Quality ratchet maintained"
    echo "  ✅ TypeScript compiles"  
    echo "  ✅ Test framework ready"
    echo ""
    print_status $BLUE "📊 Quality Metrics:"
    echo "     ESLint warnings: $CURRENT_WARNINGS"
    echo "     Unused exports: $CURRENT_DEADCODE"
    echo ""
    if [ "$CURRENT_WARNINGS" -gt 0 ]; then
        print_status $BLUE "💡 Consider running full validation with: npm run validate:pr"
        echo "     (includes test coverage analysis)"
    fi
    print_status $GREEN "Your PR should pass quality checks!"
else
    print_status $RED "❌ FAST VALIDATION FAILED"
    echo ""
    print_status $YELLOW "Fix the issues above before creating/updating your PR"
    print_status $BLUE "💡 Run './scripts/lint-metrics.sh' for detailed quality report"
    exit 1
fi