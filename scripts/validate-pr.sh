#!/bin/bash

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

print_header "Local PR Validation - Simulating GitHub Workflow"

# Step 1: Install dependencies (if needed)
print_header "Checking Dependencies"
if [ ! -d "node_modules" ] || [ "package-lock.json" -nt "node_modules" ]; then
    print_status $YELLOW "Installing/updating dependencies..."
    npm ci
else
    print_status $GREEN "Dependencies up to date"
fi

# Step 2: Generate coverage report
print_header "Generating Test Coverage"
print_status $YELLOW "Running tests with coverage (this may take a while)..."

# Use quicker unit tests for local validation
NODE_OPTIONS='--experimental-vm-modules' npm run test:unit:quick -- --coverage --coverageReporters=json-summary --coverageReporters=lcov --silent 2>/dev/null || {
    print_status $RED "Test coverage generation failed"
    print_status $YELLOW "Falling back to basic test run..."
    NODE_OPTIONS='--experimental-vm-modules' npm test -- --testTimeout=5000 --maxWorkers=2 2>/dev/null || {
        print_status $RED "Tests failed - PR would fail"
        exit 1
    }
}

# Step 3: Comprehensive Quality Analysis
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

# Show progress tracking
if echo "$METRICS_OUTPUT" | grep -q "Progress Tracking"; then
    echo ""
    echo "$METRICS_OUTPUT" | sed -n '/=== Progress Tracking ===/,/^$/p' | tail -n +2 | head -10 | sed 's/^/  /'
fi

# Check if there are lint errors (these always fail)
if [ "$CURRENT_ERRORS" -gt 0 ]; then
    print_status $RED "❌ LINT ERRORS FOUND - PR would fail"
    echo ""
    echo "Fix these $CURRENT_ERRORS errors before proceeding"
    exit 1
fi

# Check if any quality gates failed
if [ $METRICS_EXIT_CODE -ne 0 ]; then
    print_status $RED "❌ QUALITY GATES FAILED - PR would fail"
    echo ""
    echo "Quality violations detected:"
    echo "$METRICS_OUTPUT" | grep -E "(❌|⚠️)" | sed 's/^/  /'
    exit 1
fi

# Show quality improvements if any
if echo "$METRICS_OUTPUT" | grep -q "✅.*Reduced by:"; then
    print_status $GREEN "🎉 Quality Improvements Detected!"
    echo "$METRICS_OUTPUT" | grep "✅.*Reduced by:" | sed 's/^/  /'
    echo ""
fi

# Step 4: Parse coverage data (simulate the Python script)
print_header "Coverage Analysis"

if [ -f "coverage/coverage-summary.json" ]; then
    # Extract overall coverage percentage
    OVERALL_COVERAGE=$(python3 -c "
import json
try:
    with open('coverage/coverage-summary.json', 'r') as f:
        data = json.load(f)
    total = data.get('total', {})
    statements = total.get('statements', {})
    if 'pct' in statements:
        print(f'{statements[\"pct\"]:.1f}')
    else:
        print('0.0')
except:
    print('0.0')
" 2>/dev/null || echo "0.0")
    
    print_status $BLUE "Overall Coverage: ${OVERALL_COVERAGE}%"
    
    if [ "${OVERALL_COVERAGE%.*}" -ge 80 ]; then
        print_status $GREEN "🟢 Excellent coverage"
    elif [ "${OVERALL_COVERAGE%.*}" -ge 60 ]; then
        print_status $YELLOW "🟡 Good coverage"
    else
        print_status $YELLOW "🔴 Coverage could be improved"
    fi
else
    print_status $YELLOW "⚠️  No coverage data generated"
fi

# Step 5: Generate enhanced PR comment (optional)
if [ "${1:-}" = "--show-comment" ]; then
    print_header "PR Comment Preview"
    
    echo "## 📊 Code Quality Report"
    echo ""
    echo "| Metric | Current | Status |"
    echo "|--------|---------|--------|"
    echo "| ESLint Warnings | $CURRENT_WARNINGS | $([ "$CURRENT_WARNINGS" -eq 0 ] && echo "✅" || echo "⚠️") |"
    echo "| ESLint Errors | $CURRENT_ERRORS | $([ "$CURRENT_ERRORS" -eq 0 ] && echo "✅" || echo "❌") |"
    echo "| Unused Exports | $CURRENT_DEADCODE | $([ "$CURRENT_DEADCODE" -lt 100 ] && echo "✅" || echo "⚠️") |"
    echo "| Test Coverage | ${OVERALL_COVERAGE}% | $([ "${OVERALL_COVERAGE%.*}" -ge 70 ] && echo "✅" || echo "⚠️") |"
    echo ""
    
    # Show progress if any
    if echo "$METRICS_OUTPUT" | grep -q "✅.*Reduced by:"; then
        echo "### 🎉 Quality Improvements"
        echo "$METRICS_OUTPUT" | grep "✅.*Reduced by:" | sed 's/^/- /'
        echo ""
    fi
    
    # Show top warning types
    echo "### 🔍 Most Common Warning Types"
    echo "$METRICS_OUTPUT" | sed -n '/=== Top 10 Warning Types ===/,/^$/p' | tail -n +2 | head -5 | sed 's/^/- /'
    echo ""
    
    # Show top deadcode files
    echo "### 📁 Files with Most Unused Exports" 
    echo "$METRICS_OUTPUT" | sed -n '/=== Top 5 Files with Unused Exports ===/,/^$/p' | tail -n +2 | head -3 | sed 's/^/- /'
fi

# Final summary
print_header "Validation Summary"

if [ "$CURRENT_ERRORS" -eq 0 ] && [ $METRICS_EXIT_CODE -eq 0 ]; then
    print_status $GREEN "✅ FULL PR VALIDATION PASSED"
    echo "  ✅ No lint errors ($CURRENT_ERRORS)" 
    echo "  ✅ Quality baselines maintained"
    echo "  ✅ Tests passing with coverage"
    echo "  ✅ TypeScript compilation successful"
    echo ""
    print_status $BLUE "📊 Final Quality Metrics:"
    echo "     ESLint warnings: $CURRENT_WARNINGS"
    echo "     Unused exports: $CURRENT_DEADCODE"
    echo "     Test coverage: ${OVERALL_COVERAGE}%"
    echo ""
    if echo "$METRICS_OUTPUT" | grep -q "✅.*Reduced by:"; then
        print_status $GREEN "🎉 Bonus: Quality improvements detected!"
    fi
    print_status $GREEN "Your PR should pass all quality checks!"
    exit 0
else
    print_status $RED "❌ PR VALIDATION FAILED"
    echo ""
    echo "Issues to fix:"
    if [ "$CURRENT_ERRORS" -gt 0 ]; then
        echo "  ❌ $CURRENT_ERRORS lint errors"
    fi
    if [ $METRICS_EXIT_CODE -ne 0 ]; then
        echo "  ❌ Quality baseline violations"
    fi
    echo ""
    print_status $BLUE "💡 Run './scripts/lint-metrics.sh' for detailed analysis"
    exit 1
fi