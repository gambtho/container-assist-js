#!/bin/bash
# Daily TypeScript Health Check
# Automated daily monitoring and reporting for TypeScript error recovery

set -e

echo "🔍 Daily TypeScript Health Check"
echo "================================"
echo "📅 Date: $(date)"
echo "🕒 Time: $(date +%T)"
echo ""

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to count errors by pattern
count_errors_by_pattern() {
    local pattern=$1
    local description=$2
    local count=$(npm run typecheck 2>&1 | grep -E "$pattern" | wc -l)
    echo "$description: $count errors"
    return $count
}

# Overall TypeScript error count
echo "📊 OVERALL STATUS:"
echo "=================="
ERROR_COUNT=$(npm run typecheck 2>&1 | grep "error TS" | wc -l || echo "0")

if [ "$ERROR_COUNT" -eq 0 ]; then
    print_status "$GREEN" "✅ Total TypeScript errors: $ERROR_COUNT"
    echo ""
    echo "🎉 CONGRATULATIONS! Zero TypeScript errors achieved!"
    echo "🚀 Ready for production deployment"
else
    print_status "$RED" "❌ Total TypeScript errors: $ERROR_COUNT"
fi

echo ""

# Team-specific error tracking
echo "👥 TEAM BREAKDOWN:"
echo "=================="

# Team A: Core Infrastructure & Types
TEAM_A_ERRORS=$(npm run typecheck 2>&1 | grep -E "(src/shared|src/domain/types|src/errors/result)" | wc -l || echo "0")
if [ "$TEAM_A_ERRORS" -eq 0 ]; then
    print_status "$GREEN" "✅ Team A (Core): $TEAM_A_ERRORS errors"
else
    print_status "$RED" "🚨 Team A (Core): $TEAM_A_ERRORS errors - BLOCKING OTHER TEAMS"
fi

# Team B: Application Layer & Tools
TEAM_B_ERRORS=$(npm run typecheck 2>&1 | grep -E "(src/application/tools|src/application/workflow|src/application/errors)" | wc -l || echo "0")
if [ "$TEAM_B_ERRORS" -eq 0 ]; then
    print_status "$GREEN" "✅ Team B (Application): $TEAM_B_ERRORS errors"
else
    print_status "$YELLOW" "⚠️  Team B (Application): $TEAM_B_ERRORS errors"
fi

# Team C: Infrastructure & External Clients  
TEAM_C_ERRORS=$(npm run typecheck 2>&1 | grep -E "(src/infrastructure|src/services)" | wc -l || echo "0")
if [ "$TEAM_C_ERRORS" -eq 0 ]; then
    print_status "$GREEN" "✅ Team C (Infrastructure): $TEAM_C_ERRORS errors"
else
    print_status "$YELLOW" "⚠️  Team C (Infrastructure): $TEAM_C_ERRORS errors"
fi

# Team D: Platform & Entry Points
TEAM_D_ERRORS=$(npm run typecheck 2>&1 | grep -E "(apps/|src/application/resources)" | wc -l || echo "0")
if [ "$TEAM_D_ERRORS" -eq 0 ]; then
    print_status "$GREEN" "✅ Team D (Platform): $TEAM_D_ERRORS errors"
else
    print_status "$YELLOW" "⚠️  Team D (Platform): $TEAM_D_ERRORS errors"
fi

echo ""

# Error categorization
echo "🏷️  ERROR CATEGORIES:"
echo "===================="

# Result<T> monad errors (highest priority)
RESULT_ERRORS=$(npm run typecheck 2>&1 | grep -i -E "(result<|success|failure)" | wc -l || echo "0")
if [ "$RESULT_ERRORS" -gt 0 ]; then
    print_status "$RED" "🚨 Result<T> monad: $RESULT_ERRORS errors (CRITICAL - blocks all teams)"
else
    print_status "$GREEN" "✅ Result<T> monad: $RESULT_ERRORS errors"
fi

# Type assignment errors
TYPE_ERRORS=$(npm run typecheck 2>&1 | grep -E "(TS2322|TS2345|not assignable)" | wc -l || echo "0")
echo "🔧 Type assignment: $TYPE_ERRORS errors"

# Module resolution errors
MODULE_ERRORS=$(npm run typecheck 2>&1 | grep -E "(TS2307|TS2305|Cannot find module)" | wc -l || echo "0")
echo "📦 Module resolution: $MODULE_ERRORS errors"

# Property access errors
PROPERTY_ERRORS=$(npm run typecheck 2>&1 | grep -E "(TS2339|Property.*does not exist)" | wc -l || echo "0")
echo "🏗️  Property access: $PROPERTY_ERRORS errors"

echo ""

# Quality Gates Status
echo "📋 QUALITY GATES:"
echo "================"

# ESLint
if npm run lint >/dev/null 2>&1; then
    print_status "$GREEN" "✅ ESLint: PASS"
else
    print_status "$RED" "❌ ESLint: FAIL"
fi

# TypeScript compilation
if npm run typecheck >/dev/null 2>&1; then
    print_status "$GREEN" "✅ TypeScript: PASS"
else
    print_status "$RED" "❌ TypeScript: FAIL"
fi

# Tests
if npm test >/dev/null 2>&1; then
    print_status "$GREEN" "✅ Tests: PASS"
else
    print_status "$RED" "❌ Tests: FAIL"
fi

# Infrastructure validation
if npx tsx scripts/validate-infrastructure.ts >/dev/null 2>&1; then
    print_status "$GREEN" "✅ Infrastructure: PASS"
else
    print_status "$RED" "❌ Infrastructure: FAIL"
fi

echo ""

# Trend analysis (if previous report exists)
echo "📈 TREND ANALYSIS:"
echo "=================="

REPORTS_DIR="./reports/daily-health"
mkdir -p "$REPORTS_DIR"

PREVIOUS_COUNT_FILE="$REPORTS_DIR/previous-error-count.txt"
CURRENT_DATE=$(date +%Y-%m-%d)

if [ -f "$PREVIOUS_COUNT_FILE" ]; then
    PREVIOUS_COUNT=$(cat "$PREVIOUS_COUNT_FILE")
    CHANGE=$((ERROR_COUNT - PREVIOUS_COUNT))
    
    if [ "$CHANGE" -eq 0 ]; then
        echo "➡️  No change from previous check ($PREVIOUS_COUNT errors)"
    elif [ "$CHANGE" -lt 0 ]; then
        ABS_CHANGE=$((CHANGE * -1))
        print_status "$GREEN" "📉 Improved: -$ABS_CHANGE errors from previous check"
        echo "🎯 Previous: $PREVIOUS_COUNT | Current: $ERROR_COUNT"
    else
        print_status "$RED" "📈 Regression: +$CHANGE errors from previous check"
        echo "⚠️  Previous: $PREVIOUS_COUNT | Current: $ERROR_COUNT"
        echo "🚨 ALERT: Error count increased - investigate recent changes"
    fi
else
    echo "📊 First run - establishing baseline"
fi

# Save current count for next comparison
echo "$ERROR_COUNT" > "$PREVIOUS_COUNT_FILE"

echo ""

# Priority recommendations
echo "💡 PRIORITY RECOMMENDATIONS:"
echo "==========================="

if [ "$ERROR_COUNT" -eq 0 ]; then
    echo "🏆 All TypeScript errors resolved!"
    echo "📋 Next steps:"
    echo "  • Run comprehensive integration tests"
    echo "  • Perform final quality gate validation"
    echo "  • Prepare for production deployment"
elif [ "$TEAM_A_ERRORS" -gt 0 ]; then
    echo "🚨 IMMEDIATE ACTION REQUIRED:"
    echo "  • Team A must fix Result<T> monad errors IMMEDIATELY"
    echo "  • All other teams are blocked until Team A completes"
    echo "  • Focus on: src/shared/result.ts timestamp property"
    echo "  • Focus on: generic type constraints and exactOptionalPropertyTypes"
elif [ "$ERROR_COUNT" -lt 50 ]; then
    echo "🎯 FINAL SPRINT:"
    echo "  • Under 50 errors - prepare for final integration testing"
    echo "  • Focus on remaining type assignment and property access errors"
    echo "  • Coordinate cross-team for final resolution"
elif [ "$ERROR_COUNT" -lt 100 ]; then
    echo "📋 GOOD PROGRESS:"
    echo "  • Continue team coordination and parallel execution"
    echo "  • Focus on high-impact categories (Result<T>, module resolution)"
    echo "  • Monitor for cross-team blockers"
else
    echo "⚠️  NEEDS ATTENTION:"
    echo "  • Consider additional resources or alternative approach"
    echo "  • Review team assignments and dependencies"
    echo "  • Check for systemic issues requiring architectural changes"
fi

echo ""

# Generate detailed report
echo "📊 GENERATING DETAILED REPORTS:"
echo "=============================="

# Run error tracker
if [ -f "scripts/error-tracker.ts" ]; then
    echo "🔍 Running detailed error analysis..."
    npx tsx scripts/error-tracker.ts >/dev/null 2>&1 || echo "⚠️  Error tracker failed"
    echo "✅ Error tracking report generated"
fi

# Run team progress monitor  
if [ -f "scripts/team-progress-monitor.ts" ]; then
    echo "👥 Running team progress analysis..."
    npx tsx scripts/team-progress-monitor.ts >/dev/null 2>&1 || echo "⚠️  Team progress monitor failed"
    echo "✅ Team progress report generated"
fi

echo ""

# Save daily summary
DAILY_SUMMARY="$REPORTS_DIR/daily-summary-$CURRENT_DATE.txt"
{
    echo "Daily Health Check Summary - $CURRENT_DATE"
    echo "==========================================="
    echo "Total Errors: $ERROR_COUNT"
    echo "Team A (Core): $TEAM_A_ERRORS"
    echo "Team B (Application): $TEAM_B_ERRORS" 
    echo "Team C (Infrastructure): $TEAM_C_ERRORS"
    echo "Team D (Platform): $TEAM_D_ERRORS"
    echo "Result<T> Errors: $RESULT_ERRORS"
} > "$DAILY_SUMMARY"

echo "📁 Daily summary saved: $DAILY_SUMMARY"

# Final status
echo ""
echo "🏁 HEALTH CHECK COMPLETE"
echo "======================="

if [ "$ERROR_COUNT" -eq 0 ]; then
    print_status "$GREEN" "🎉 STATUS: HEALTHY - Zero errors achieved!"
    exit 0
elif [ "$TEAM_A_ERRORS" -gt 0 ]; then
    print_status "$RED" "🚨 STATUS: CRITICAL - Team A blocking errors"
    exit 2
elif [ "$ERROR_COUNT" -lt 50 ]; then
    print_status "$YELLOW" "⚠️  STATUS: FINAL PHASE - Under 50 errors remaining"
    exit 1
else
    print_status "$YELLOW" "📋 STATUS: IN PROGRESS - $ERROR_COUNT errors remaining"
    exit 1
fi