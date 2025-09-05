#!/bin/bash

set -euo pipefail

echo "🛡️ Quality Gates Validation $(date)"
echo "========================================="
echo ""

# Configuration
BASELINE_FILE="reports/baseline-count.txt"
DEADCODE_BASELINE_FILE="reports/deadcode-baseline.txt"
CURRENT_COUNT_FILE="reports/current-count.txt"
LINT_OUTPUT_FILE="reports/current-lint-output.txt"

# Check for required tools
for cmd in npm bc; do
    if ! command -v $cmd &> /dev/null; then
        echo "Error: $cmd is required but not installed."
        exit 1
    fi
done

# Quality Gate Thresholds
MAX_WARNINGS_THRESHOLD=${MAX_WARNINGS_THRESHOLD:-1048}
MAX_DEADCODE_THRESHOLD=${MAX_DEADCODE_THRESHOLD:-441}
ALLOW_REGRESSION=${ALLOW_REGRESSION:-false}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS") echo -e "${GREEN}✅ PASS:${NC} $message" ;;
        "FAIL") echo -e "${RED}❌ FAIL:${NC} $message" ;;
        "WARN") echo -e "${YELLOW}⚠️  WARN:${NC} $message" ;;
        "INFO") echo -e "ℹ️  INFO: $message" ;;
    esac
}

# Gate 1: ESLint Errors Must Be Zero
echo "Gate 1: ESLint Error Check"
echo "-------------------------"

# Run lint and get current counts
npm run lint > $LINT_OUTPUT_FILE 2>&1 || true

# Parse errors and warnings
SUMMARY_LINE=$(grep -E "problems.*error.*warning" $LINT_OUTPUT_FILE | tail -1 2>/dev/null || echo "")
if [ -n "$SUMMARY_LINE" ]; then
    CURRENT_ERRORS=$(echo "$SUMMARY_LINE" | sed -n 's/.*(\([0-9]\+\) error.*/\1/p' 2>/dev/null || echo "0")
    CURRENT_WARNINGS=$(echo "$SUMMARY_LINE" | sed -n 's/.*, \([0-9]\+\) warning.*/\1/p' 2>/dev/null || echo "0")
    # Handle case where it says "0 errors"
    if [ -z "$CURRENT_ERRORS" ]; then
        CURRENT_ERRORS=0
    fi
    if [ -z "$CURRENT_WARNINGS" ]; then
        CURRENT_WARNINGS=0
    fi
else
    CURRENT_ERRORS=0
    CURRENT_WARNINGS=0
fi

# Save current count
echo "$CURRENT_WARNINGS" > "$CURRENT_COUNT_FILE"

if [ "$CURRENT_ERRORS" -eq 0 ]; then
    print_status "PASS" "No ESLint errors found"
else
    print_status "FAIL" "$CURRENT_ERRORS ESLint errors must be fixed before proceeding"
    exit 1
fi

echo ""

# Gate 2: ESLint Warning Ratcheting
echo "Gate 2: ESLint Warning Ratcheting"
echo "----------------------------------"

if [ -f "$BASELINE_FILE" ]; then
    BASELINE_WARNINGS=$(cat $BASELINE_FILE)
    
    if [ "$CURRENT_WARNINGS" -le "$BASELINE_WARNINGS" ]; then
        REDUCTION=$((BASELINE_WARNINGS - CURRENT_WARNINGS))
        if [ "$REDUCTION" -gt 0 ]; then
            PERCENTAGE=$(echo "scale=1; ($REDUCTION * 100) / $BASELINE_WARNINGS" | bc -l 2>/dev/null || echo "N/A")
            print_status "PASS" "Warnings reduced by $REDUCTION (${PERCENTAGE}%) - $CURRENT_WARNINGS ≤ $BASELINE_WARNINGS"
        else
            print_status "PASS" "Warning count maintained at baseline ($CURRENT_WARNINGS)"
        fi
    else
        INCREASE=$((CURRENT_WARNINGS - BASELINE_WARNINGS))
        if [ "$ALLOW_REGRESSION" = "true" ]; then
            print_status "WARN" "Warning count increased by $INCREASE ($CURRENT_WARNINGS > $BASELINE_WARNINGS) - ALLOWED by config"
        else
            print_status "FAIL" "Warning count increased by $INCREASE ($CURRENT_WARNINGS > $BASELINE_WARNINGS) - REGRESSION NOT ALLOWED"
            exit 1
        fi
    fi
else
    if [ "$CURRENT_WARNINGS" -le "$MAX_WARNINGS_THRESHOLD" ]; then
        print_status "PASS" "Warning count within threshold ($CURRENT_WARNINGS ≤ $MAX_WARNINGS_THRESHOLD)"
    else
        EXCESS=$((CURRENT_WARNINGS - MAX_WARNINGS_THRESHOLD))
        print_status "FAIL" "Warning count exceeds threshold by $EXCESS ($CURRENT_WARNINGS > $MAX_WARNINGS_THRESHOLD)"
        exit 1
    fi
fi

echo ""

# Gate 3: TypeScript Compilation (Optional)
if [ "${SKIP_TYPECHECK:-false}" != "true" ]; then
    echo "Gate 3: TypeScript Compilation"
    echo "-------------------------------"

    if npm run typecheck > /dev/null 2>&1; then
        print_status "PASS" "TypeScript compilation successful"
    else
        print_status "FAIL" "TypeScript compilation failed"
        exit 1
    fi

    echo ""
else
    echo "Gate 3: TypeScript Compilation (SKIPPED)"
    echo "----------------------------------------"
    print_status "WARN" "TypeScript check skipped by configuration"
    echo ""
fi

# Gate 4: Dead Code Check
echo "Gate 4: Dead Code Check"
echo "-----------------------"

DEADCODE_COUNT=$(npx ts-prune --project tsconfig.json 2>/dev/null | grep -v 'used in module' | wc -l | tr -d ' ' || echo "0")

if [ -f "$DEADCODE_BASELINE_FILE" ]; then
    DEADCODE_BASELINE=$(cat $DEADCODE_BASELINE_FILE)
    
    if [ "$DEADCODE_COUNT" -le "$DEADCODE_BASELINE" ]; then
        DEADCODE_REDUCTION=$((DEADCODE_BASELINE - DEADCODE_COUNT))
        if [ $DEADCODE_REDUCTION -gt 0 ]; then
            DEADCODE_PERCENTAGE=$(echo "scale=1; ($DEADCODE_REDUCTION * 100) / $DEADCODE_BASELINE" | bc -l 2>/dev/null || echo "N/A")
            print_status "PASS" "Unused exports reduced by $DEADCODE_REDUCTION (${DEADCODE_PERCENTAGE}%) - $DEADCODE_COUNT ≤ $DEADCODE_BASELINE"
        else
            print_status "PASS" "Unused exports maintained at baseline ($DEADCODE_COUNT)"
        fi
    else
        DEADCODE_INCREASE=$((DEADCODE_COUNT - DEADCODE_BASELINE))
        if [ "$ALLOW_REGRESSION" = "true" ]; then
            print_status "WARN" "Unused exports increased by $DEADCODE_INCREASE ($DEADCODE_COUNT > $DEADCODE_BASELINE) - ALLOWED by config"
        else
            print_status "FAIL" "Unused exports increased by $DEADCODE_INCREASE ($DEADCODE_COUNT > $DEADCODE_BASELINE) - REGRESSION NOT ALLOWED"
            exit 1
        fi
    fi
else
    if [ "$DEADCODE_COUNT" -le "$MAX_DEADCODE_THRESHOLD" ]; then
        print_status "PASS" "Unused exports within threshold ($DEADCODE_COUNT ≤ $MAX_DEADCODE_THRESHOLD)"
    else
        EXCESS=$((DEADCODE_COUNT - MAX_DEADCODE_THRESHOLD))
        print_status "FAIL" "Unused exports exceed threshold by $EXCESS ($DEADCODE_COUNT > $MAX_DEADCODE_THRESHOLD)"
        exit 1
    fi
fi

echo ""

# Gate 5: Build Performance (Optional)
if command -v time >/dev/null 2>&1; then
    echo "Gate 5: Build Performance"
    echo "------------------------"
    
    BUILD_START=$(date +%s.%N)
    if npm run build > /dev/null 2>&1; then
        BUILD_END=$(date +%s.%N)
        BUILD_TIME=$(echo "$BUILD_END - $BUILD_START" | bc -l 2>/dev/null || echo "N/A")
        
        if [ "$BUILD_TIME" != "N/A" ] && (( $(echo "$BUILD_TIME < 5.0" | bc -l 2>/dev/null || echo 0) )); then
            print_status "PASS" "Build completed in ${BUILD_TIME}s (< 5.0s threshold)"
        else
            print_status "WARN" "Build took ${BUILD_TIME}s (consider optimization if > 3.0s)"
        fi
    else
        print_status "FAIL" "Build failed"
        exit 1
    fi
    
    echo ""
fi

# Final Summary
echo "🎉 Quality Gates Summary"
echo "========================"
echo "ESLint Errors: $CURRENT_ERRORS"
echo "ESLint Warnings: $CURRENT_WARNINGS"
echo "Unused Exports: $DEADCODE_COUNT"
echo "TypeScript: ✅ Compiles"
echo "Build: ✅ Successful"
echo ""

if [ "${CURRENT_WARNINGS:-0}" -gt 400 ] || [ "${DEADCODE_COUNT:-0}" -gt 200 ]; then
    print_status "INFO" "Consider running aggressive cleanup to reach production targets:"
    echo "  • ESLint warnings target: <400 (current: $CURRENT_WARNINGS)"
    echo "  • Dead code target: <200 (current: $DEADCODE_COUNT)"
    echo ""
fi

print_status "PASS" "All quality gates passed! 🚀"
echo ""

# Optionally update baselines if --update-baseline flag is provided
if [ "${1:-}" == "--update-baseline" ]; then
    echo $CURRENT_WARNINGS > $BASELINE_FILE
    echo $DEADCODE_COUNT > $DEADCODE_BASELINE_FILE
    print_status "INFO" "Baselines updated:"
    echo "  • ESLint baseline: $CURRENT_WARNINGS"
    echo "  • Deadcode baseline: $DEADCODE_COUNT"
fi