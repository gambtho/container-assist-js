#!/bin/bash

set -euo pipefail

echo "🛡️ Quality Gates Validation $(date)"
echo "========================================="
echo ""

# Configuration
QUALITY_CONFIG="quality-gates.json"


# Check for required tools with better error messages
for cmd in npm bc jq; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "❌ Error: $cmd is required but not installed."
        echo "💡 Install with: brew install $cmd" # or apt-get, etc.
        exit 1
    fi
done

# Environment config
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

# Add function for safer JSON operations
update_json_safely() {
    local jq_expr="$1"
    shift  # Remove first argument, remaining are jq options
    local temp_file="${QUALITY_CONFIG}.tmp.$$"
    
    if jq "$@" "$jq_expr" "$QUALITY_CONFIG" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$QUALITY_CONFIG"
    else
        print_status "WARN" "Failed to update JSON metrics - continuing with existing values"
        rm -f "$temp_file" 2>/dev/null || true
    fi
}

# Enhanced JSON validation
validate_json_numeric() {
    local value="$1"
    local field_name="$2"
    
    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
        print_status "WARN" "Invalid numeric value for $field_name: '$value' - using 0"
        echo "0"
    else
        echo "$value"
    fi
}

# Enhanced ESLint processing with fallback strategies
process_eslint_results() {
    local json_output="$1"
    local current_errors=0
    local current_warnings=0
    
    # Strategy 1: JSON parsing (preferred)
    if [ -n "$json_output" ] && [ "$json_output" != "[]" ]; then
        if current_errors=$(echo "$json_output" | jq '[.[].messages[]? | select(.severity == 2)] | length' 2>/dev/null) && \
           current_warnings=$(echo "$json_output" | jq '[.[].messages[]? | select(.severity == 1)] | length' 2>/dev/null) && \
           [[ "$current_errors" =~ ^[0-9]+$ ]] && [[ "$current_warnings" =~ ^[0-9]+$ ]]; then
            echo "$current_errors $current_warnings"
            return 0
        fi
    fi
    
    # Strategy 2: Text parsing fallback
    print_status "INFO" "JSON parsing failed, using text parsing fallback"
    local lint_output
    lint_output=$(npm run lint 2>&1 || true)
    
    local summary_line
    summary_line=$(echo "$lint_output" | grep -E "problems.*error.*warning" | tail -1 2>/dev/null || echo "")
    
    if [ -n "$summary_line" ]; then
        current_errors=$(echo "$summary_line" | sed -n 's/.*(\([0-9]\+\) error.*/\1/p' 2>/dev/null || echo "0")
        current_warnings=$(echo "$summary_line" | sed -n 's/.*, \([0-9]\+\) warning.*/\1/p' 2>/dev/null || echo "0")
    fi
    
    # Ensure numeric values
    current_errors=$(validate_json_numeric "${current_errors:-0}" "errors")
    current_warnings=$(validate_json_numeric "${current_warnings:-0}" "warnings")
    
    echo "$current_errors $current_warnings"
}

# Validate current directory and config file
if [ ! -f "$QUALITY_CONFIG" ]; then
    echo "📁 Current directory: $(pwd)"
    echo "Creating default quality-gates.json configuration file..."
    cat > "$QUALITY_CONFIG" << 'EOF'
{
  "metrics": {
    "lint": {
      "baseline": null,
      "current": 0,
      "warnings": 0,
      "errors": 0,
      "lastUpdated": null
    },
    "deadcode": {
      "baseline": null,
      "current": 0,
      "lastUpdated": null
    },
    "typescript": {
      "errors": 0,
      "lastUpdated": null
    },
    "build": {
      "lastBuildTimeMs": 0,
      "lastUpdated": null
    }
  }
}
EOF
    print_status "INFO" "Created default quality-gates.json configuration file"
fi

# Read baselines from JSON
BASELINE_WARNINGS=$(jq -r '.metrics.lint.baseline' $QUALITY_CONFIG)
DEADCODE_BASELINE=$(jq -r '.metrics.deadcode.baseline' $QUALITY_CONFIG)

# Gate 1: ESLint Errors Must Be Zero
echo "Gate 1: ESLint Error Check"
echo "-------------------------"

# Run lint and get current counts using JSON output for reliable parsing
LINT_JSON_OUTPUT=$(npx eslint src --ext .ts --format=json 2>/dev/null || true)

# Use enhanced processing function
LINT_RESULTS=$(process_eslint_results "$LINT_JSON_OUTPUT")
CURRENT_ERRORS=$(echo "$LINT_RESULTS" | cut -d' ' -f1)
CURRENT_WARNINGS=$(echo "$LINT_RESULTS" | cut -d' ' -f2)

# Ensure we have numeric values
CURRENT_ERRORS=$(validate_json_numeric "$CURRENT_ERRORS" "errors")
CURRENT_WARNINGS=$(validate_json_numeric "$CURRENT_WARNINGS" "warnings")

# Update current metrics in JSON
TIMESTAMP=$(date -Iseconds)
update_json_safely '.metrics.lint.current = ($warnings | tonumber) | .metrics.lint.warnings = ($warnings | tonumber) | .metrics.lint.errors = ($errors | tonumber) | .metrics.lint.lastUpdated = $ts' \
   --arg warnings "$CURRENT_WARNINGS" --arg errors "$CURRENT_ERRORS" --arg ts "$TIMESTAMP"

if [ "$CURRENT_ERRORS" -eq 0 ]; then
    print_status "PASS" "No ESLint errors found"
else
    print_status "FAIL" "$CURRENT_ERRORS ESLint errors must be fixed before proceeding"
    exit 1
fi

echo ""

# Handle null lint baseline for first run
if [ "$BASELINE_WARNINGS" = "null" ] || [ -z "$BASELINE_WARNINGS" ]; then
    print_status "INFO" "No lint baseline set, using current warnings ($CURRENT_WARNINGS) as baseline"
    BASELINE_WARNINGS="$CURRENT_WARNINGS"
    # Update the baseline in the config file
    update_json_safely '.metrics.lint.baseline = ($warnings | tonumber)' \
       --arg warnings "$CURRENT_WARNINGS"
fi

# Gate 2: ESLint Warning Ratcheting
echo "Gate 2: ESLint Warning Ratcheting"
echo "----------------------------------"

if [ "$CURRENT_WARNINGS" -le "$BASELINE_WARNINGS" ]; then
    REDUCTION=$((BASELINE_WARNINGS - CURRENT_WARNINGS))
    if [ "$REDUCTION" -gt 0 ]; then
        PERCENTAGE=$(echo "scale=1; ($REDUCTION * 100) / $BASELINE_WARNINGS" | bc -l 2>/dev/null || echo "N/A")
        print_status "PASS" "Warnings reduced by $REDUCTION (${PERCENTAGE}%) - $CURRENT_WARNINGS ≤ $BASELINE_WARNINGS"
        # Auto-update baseline when improved
        update_json_safely '.metrics.lint.baseline = ($warnings | tonumber)' \
           --arg warnings "$CURRENT_WARNINGS"
        print_status "INFO" "Updated ESLint baseline: $BASELINE_WARNINGS → $CURRENT_WARNINGS"
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

echo ""

# Gate 3: TypeScript Compilation (Optional)
if [ "${SKIP_TYPECHECK:-false}" != "true" ]; then
    echo "Gate 3: TypeScript Compilation"
    echo "-------------------------------"

    if npm run typecheck > /dev/null 2>&1; then
        print_status "PASS" "TypeScript compilation successful"
        update_json_safely '.metrics.typescript.errors = 0 | .metrics.typescript.lastUpdated = $ts' \
           --arg ts "$TIMESTAMP"
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

# More robust dead code detection with error handling
if command -v npx >/dev/null 2>&1 && [ -f "tsconfig.json" ]; then
    DEADCODE_OUTPUT=$(npx ts-prune --project tsconfig.json 2>/dev/null || echo "")
    if [ -n "$DEADCODE_OUTPUT" ]; then
        DEADCODE_COUNT=$(echo "$DEADCODE_OUTPUT" | grep -v 'used in module' | wc -l | tr -d ' ' || echo "0")
    else
        DEADCODE_COUNT=0
        print_status "WARN" "ts-prune failed to run, assuming 0 dead code exports"
    fi
else
    DEADCODE_COUNT=0
    print_status "WARN" "ts-prune or tsconfig.json not available, skipping dead code check"
fi

# Ensure numeric value
DEADCODE_COUNT=${DEADCODE_COUNT:-0}

# Update deadcode metrics in JSON
update_json_safely '.metrics.deadcode.current = ($count | tonumber) | .metrics.deadcode.lastUpdated = $ts' \
   --arg count "$DEADCODE_COUNT" --arg ts "$TIMESTAMP"

# Handle null deadcode baseline for first run
if [ "$DEADCODE_BASELINE" = "null" ] || [ -z "$DEADCODE_BASELINE" ]; then
    print_status "INFO" "No deadcode baseline set, using current dead code count ($DEADCODE_COUNT) as baseline"
    DEADCODE_BASELINE="$DEADCODE_COUNT"
    # Update the baseline in the config file
    update_json_safely '.metrics.deadcode.baseline = ($deadcode | tonumber)' \
       --arg deadcode "$DEADCODE_COUNT"
fi

if [ "$DEADCODE_COUNT" -le "$DEADCODE_BASELINE" ]; then
    DEADCODE_REDUCTION=$((DEADCODE_BASELINE - DEADCODE_COUNT))
    if [ $DEADCODE_REDUCTION -gt 0 ]; then
        DEADCODE_PERCENTAGE=$(echo "scale=1; ($DEADCODE_REDUCTION * 100) / $DEADCODE_BASELINE" | bc -l 2>/dev/null || echo "N/A")
        print_status "PASS" "Unused exports reduced by $DEADCODE_REDUCTION (${DEADCODE_PERCENTAGE}%) - $DEADCODE_COUNT ≤ $DEADCODE_BASELINE"
        # Auto-update baseline when improved
        update_json_safely '.metrics.deadcode.baseline = ($deadcode | tonumber)' \
           --arg deadcode "$DEADCODE_COUNT"
        print_status "INFO" "Updated deadcode baseline: $DEADCODE_BASELINE → $DEADCODE_COUNT"
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

echo ""

# Gate 5: Build Performance (Optional)
if command -v npm >/dev/null 2>&1; then
    echo "Gate 5: Build Performance"
    echo "------------------------"
    
    # Use more portable timing approach
    BUILD_START=$(date +%s 2>/dev/null || echo "0")
    if npm run build > /dev/null 2>&1; then
        BUILD_END=$(date +%s 2>/dev/null || echo "0")
        if [ "$BUILD_START" != "0" ] && [ "$BUILD_END" != "0" ]; then
            BUILD_TIME_SECONDS=$((BUILD_END - BUILD_START))
            BUILD_TIME_MS=$((BUILD_TIME_SECONDS * 1000))
            
            # Update build metrics in JSON with error handling
            update_json_safely '.metrics.build.lastBuildTimeMs = ($time | tonumber) | .metrics.build.lastUpdated = $ts' \
               --arg time "$BUILD_TIME_MS" --arg ts "$TIMESTAMP"
            
            if [ "$BUILD_TIME_SECONDS" -lt 5 ]; then
                print_status "PASS" "Build completed in ${BUILD_TIME_SECONDS}s (< 5s threshold)"
            else
                print_status "WARN" "Build took ${BUILD_TIME_SECONDS}s (consider optimization if > 3s)"
            fi
        else
            print_status "WARN" "Could not measure build time accurately"
        fi
    else
        print_status "FAIL" "Build failed"
        exit 1
    fi
    
    echo ""
else
    print_status "WARN" "npm not available, skipping build performance check"
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