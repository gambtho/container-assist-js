#!/bin/bash

set -euo pipefail

# Create reports directory if it doesn't exist
mkdir -p reports

echo "=== Code Quality Metrics $(date) ==="
echo ""

# ESLint Analysis  
echo "📋 ESLint Analysis"
echo "────────────────────"

# Run lint and capture output
npm run lint > reports/current-lint-output.txt 2>&1 || true

# Count warnings and errors more precisely from the summary line
if [ -f "reports/current-lint-output.txt" ]; then
    # Parse the final summary line like "✖ 794 problems (1 error, 793 warnings)"
    SUMMARY_LINE=$(grep -E "problems.*error.*warning" reports/current-lint-output.txt | tail -1 2>/dev/null || echo "")
    if [ -n "$SUMMARY_LINE" ]; then
        TOTAL_ERRORS=$(echo "$SUMMARY_LINE" | sed -n 's/.*(\([0-9]\+\) error.*/\1/p' 2>/dev/null || echo "0")
        TOTAL_WARNINGS=$(echo "$SUMMARY_LINE" | sed -n 's/.*, \([0-9]\+\) warning.*/\1/p' 2>/dev/null || echo "0")
        # Handle case where it says "0 errors"
        if [ -z "$TOTAL_ERRORS" ]; then
            TOTAL_ERRORS=0
        fi
        if [ -z "$TOTAL_WARNINGS" ]; then
            TOTAL_WARNINGS=0
        fi
    else
        # Fallback to counting individual lines
        TOTAL_WARNINGS=$(grep -c "warning" reports/current-lint-output.txt 2>/dev/null || echo "0")
        TOTAL_ERRORS=$(grep -c "error" reports/current-lint-output.txt 2>/dev/null || echo "0")
    fi
else
    TOTAL_WARNINGS=0
    TOTAL_ERRORS=0
fi

echo "Total warnings: $TOTAL_WARNINGS"
echo "Total errors: $TOTAL_ERRORS"
echo ""

echo "=== Top 10 Warning Types ==="
if [ -f "reports/current-lint-output.txt" ]; then
    # Extract and categorize warning types from ESLint rule names
    grep "warning" reports/current-lint-output.txt 2>/dev/null | \
        grep -o "@typescript-eslint/[a-zA-Z0-9-]*" | \
        sed 's/@typescript-eslint\///' | \
        sort | uniq -c | sort -rn | head -10 | \
        awk '{printf "%5d  %s\n", $1, $2}' || \
    grep "warning" reports/current-lint-output.txt 2>/dev/null | \
        sed -n 's/.*warning[[:space:]]*\([^[:space:]]*\).*/\1/p' | \
        sort | uniq -c | sort -rn | head -10 | \
        awk '{printf "%5d  %s\n", $1, $2}' || echo "No warnings found in lint output"
else
    echo "No lint output file found"
fi
echo ""

echo "=== Progress Tracking ==="
BASELINE_FILE="reports/baseline-count.txt"

if [ -f "$BASELINE_FILE" ]; then
    BASELINE=$(cat $BASELINE_FILE)
    REDUCTION=$((BASELINE - TOTAL_WARNINGS))
    if [ $BASELINE -gt 0 ]; then
        PERCENTAGE=$(echo "scale=1; ($REDUCTION * 100) / $BASELINE" | bc -l 2>/dev/null || echo "N/A")
    else
        PERCENTAGE="N/A"
    fi
    
    echo "Baseline: $BASELINE warnings"
    echo "Current: $TOTAL_WARNINGS warnings"
    
    if [ $REDUCTION -gt 0 ]; then
        echo "✅ Reduced by: $REDUCTION warnings ($PERCENTAGE%)"
    elif [ $REDUCTION -eq 0 ]; then
        echo "✅ Maintaining baseline (no increase)"
    else
        echo "❌ Increased by: $((-REDUCTION)) warnings"
    fi
else
    echo "Baseline: Not set (run with --baseline to set)"
    echo "To set baseline: ./scripts/lint-metrics.sh --baseline"
fi

# Save current count if --baseline flag is provided
if [ "${1:-}" == "--baseline" ]; then
    echo $TOTAL_WARNINGS > $BASELINE_FILE
    echo ""
    echo "✅ Baseline set to $TOTAL_WARNINGS warnings"
    echo "Saved to: $BASELINE_FILE"
fi

# Also save current snapshot for comparison
echo $TOTAL_WARNINGS > reports/current-count.txt

echo ""
echo "🧹 Deadcode Analysis"
echo "────────────────────"

# Run ts-prune to find unused exports
echo "Analyzing unused exports..."
DEADCODE_COUNT=$(npx ts-prune --project tsconfig.json 2>/dev/null | grep -v 'used in module' | wc -l | tr -d ' ' || echo "0")
echo "Total unused exports: $DEADCODE_COUNT"
echo ""

# Deadcode tracking
DEADCODE_BASELINE_FILE="reports/deadcode-baseline.txt"

if [ -f "$DEADCODE_BASELINE_FILE" ]; then
    DEADCODE_BASELINE=$(cat $DEADCODE_BASELINE_FILE)
    DEADCODE_REDUCTION=$((DEADCODE_BASELINE - DEADCODE_COUNT))
    if [ $DEADCODE_BASELINE -gt 0 ]; then
        DEADCODE_PERCENTAGE=$(echo "scale=1; ($DEADCODE_REDUCTION * 100) / $DEADCODE_BASELINE" | bc -l 2>/dev/null || echo "N/A")
    else
        DEADCODE_PERCENTAGE="N/A"
    fi
    
    echo "Deadcode Progress:"
    echo "  Baseline: $DEADCODE_BASELINE unused exports"
    echo "  Current: $DEADCODE_COUNT unused exports"
    
    if [ $DEADCODE_REDUCTION -gt 0 ]; then
        echo "  ✅ Reduced by: $DEADCODE_REDUCTION exports ($DEADCODE_PERCENTAGE%)"
    elif [ $DEADCODE_REDUCTION -eq 0 ]; then
        echo "  ✅ Maintaining baseline (no increase)"
    else
        echo "  ❌ Increased by: $((-DEADCODE_REDUCTION)) exports"
    fi
else
    echo "Deadcode baseline: Not set"
    echo "To set baseline: ./scripts/lint-metrics.sh --baseline"
fi

# Save deadcode baseline if --baseline flag is provided
if [ "${1:-}" == "--baseline" ]; then
    echo $DEADCODE_COUNT > $DEADCODE_BASELINE_FILE
    echo ""
    echo "✅ Deadcode baseline set to $DEADCODE_COUNT unused exports"
fi

# Show top files with unused exports
echo ""
echo "=== Top 5 Files with Unused Exports ==="
npx ts-prune --project tsconfig.json 2>/dev/null | grep -v 'used in module' | \
    cut -d':' -f1 | sort | uniq -c | sort -rn | head -5 | \
    awk '{printf "%3d unused exports: %s\n", $1, $2}' || echo "No unused exports found"

# Exit with error if there are lint errors (not warnings)
if [ "$TOTAL_ERRORS" -gt 0 ]; then
    echo ""
    echo "❌ Cannot proceed: $TOTAL_ERRORS lint errors must be fixed first"
    exit 1
fi

# Summary
echo ""
echo "📊 Summary"
echo "────────────"
echo "ESLint: $TOTAL_WARNINGS warnings, $TOTAL_ERRORS errors"
echo "Deadcode: $DEADCODE_COUNT unused exports"
echo ""
echo "To update baselines: ./scripts/lint-metrics.sh --baseline"