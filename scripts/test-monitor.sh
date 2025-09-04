#!/bin/bash

# Test Monitoring Script for Team Echo
# Continuously monitors test suite health and progress

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INTERVAL=${TEST_MONITOR_INTERVAL:-1800}  # Default 30 minutes
LOG_DIR="./test-logs"
DASHBOARD_FILE="TEST_STATUS_DASHBOARD.md"
SUMMARY_FILE="$LOG_DIR/test-summary.json"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to run tests and parse results
run_test_suite() {
    local timestamp=$(date '+%Y-%m-%d_%H-%M-%S')
    local log_file="$LOG_DIR/test-run-$timestamp.log"
    
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] Running test suite...${NC}"
    
    # Run tests and capture output
    npm test -- --json 2>&1 | tee "$log_file" > /dev/null
    
    # Extract summary from Jest JSON output
    local json_output=$(grep '^{' "$log_file" | tail -1)
    
    if [ -n "$json_output" ]; then
        echo "$json_output" > "$SUMMARY_FILE"
        
        # Parse results
        local total_suites=$(echo "$json_output" | grep -oE '"numTotalTestSuites":[0-9]+' | cut -d: -f2)
        local failed_suites=$(echo "$json_output" | grep -oE '"numFailedTestSuites":[0-9]+' | cut -d: -f2)
        local passed_suites=$(echo "$json_output" | grep -oE '"numPassedTestSuites":[0-9]+' | cut -d: -f2)
        
        local total_tests=$(echo "$json_output" | grep -oE '"numTotalTests":[0-9]+' | cut -d: -f2)
        local failed_tests=$(echo "$json_output" | grep -oE '"numFailedTests":[0-9]+' | cut -d: -f2)
        local passed_tests=$(echo "$json_output" | grep -oE '"numPassedTests":[0-9]+' | cut -d: -f2)
        
        # Calculate pass rates
        local suite_pass_rate=$(awk "BEGIN {printf \"%.1f\", ($passed_suites / $total_suites) * 100}")
        local test_pass_rate=$(awk "BEGIN {printf \"%.1f\", ($passed_tests / $total_tests) * 100}")
        
        # Display results
        echo -e "\n${BLUE}=== Test Results ===${NC}"
        echo -e "Test Suites: ${GREEN}$passed_suites passed${NC}, ${RED}$failed_suites failed${NC}, $total_suites total"
        echo -e "Tests:       ${GREEN}$passed_tests passed${NC}, ${RED}$failed_tests failed${NC}, $total_tests total"
        echo -e "Pass Rate:   Suites: ${suite_pass_rate}%, Tests: ${test_pass_rate}%"
        
        # Update dashboard
        update_dashboard "$timestamp" "$passed_suites" "$failed_suites" "$total_suites" \
                        "$passed_tests" "$failed_tests" "$total_tests" \
                        "$suite_pass_rate" "$test_pass_rate"
        
        # Log to progress file
        echo "$(date '+%Y-%m-%d %H:%M:%S'),${passed_tests},${failed_tests},${total_tests},${test_pass_rate}" >> "$LOG_DIR/progress.csv"
        
        return $failed_tests
    else
        echo -e "${RED}Failed to parse test results${NC}"
        return 1
    fi
}

# Function to update dashboard
update_dashboard() {
    local timestamp=$1
    local passed_suites=$2
    local failed_suites=$3
    local total_suites=$4
    local passed_tests=$5
    local failed_tests=$6
    local total_tests=$7
    local suite_pass_rate=$8
    local test_pass_rate=$9
    
    cat > "$DASHBOARD_FILE" << EOF
# Test Fix Status Dashboard
Last Updated: $(date '+%Y-%m-%d %H:%M:%S')

## Overall Progress
- **Total Test Suites**: $total_suites
- **Passing Suites**: $passed_suites (${suite_pass_rate}%)
- **Failing Suites**: $failed_suites
- **Total Tests**: $total_tests
- **Passing Tests**: $passed_tests (${test_pass_rate}%)
- **Failing Tests**: $failed_tests
- **Target**: 100% pass rate

## Progress Trend
\`\`\`
$(tail -5 "$LOG_DIR/progress.csv" 2>/dev/null | column -t -s,)
\`\`\`

## Test Categories Status
EOF

    # Analyze failing test categories
    if [ -f "$LOG_DIR/test-run-$timestamp.log" ]; then
        echo -e "\n### Failing Test Suites" >> "$DASHBOARD_FILE"
        grep "FAIL" "$LOG_DIR/test-run-$timestamp.log" | grep -E "test/.*\.test\.ts" | while read line; do
            echo "- $line" >> "$DASHBOARD_FILE"
        done
    fi
    
    # Add team assignment status
    cat >> "$DASHBOARD_FILE" << EOF

## Team Assignments

### Team Alpha - Infrastructure (Docker & K8s Clients)
- **Files**: \`kubernetes-client.test.ts\`, \`docker-client.test.ts\`
- **Status**: $(analyze_test_status "infrastructure")
- **Progress**: See individual test results above

### Team Beta - Service Layer
- **Files**: \`docker-service.test.ts\`, \`session-manager.test.ts\`
- **Status**: $(analyze_test_status "services")
- **Progress**: See individual test results above

### Team Gamma - Integration Tests
- **Files**: Integration test suites
- **Status**: $(analyze_test_status "integration")
- **Progress**: See individual test results above

### Team Delta - Domain & Schema
- **Files**: Domain and schema tests
- **Status**: $(analyze_test_status "domain")
- **Progress**: See individual test results above

### Team Echo - Coordination
- **Mock Infrastructure**: ✅ Complete
- **ESM Utilities**: ✅ Complete
- **Pattern Documentation**: ✅ Complete
- **Test Monitoring**: ✅ Active
- **Baseline Tests**: $passed_tests / $total_tests passing

## Recent Activity
$(tail -10 "$LOG_DIR/activity.log" 2>/dev/null || echo "No recent activity")

## Next Steps
1. Focus on test suites with highest failure counts
2. Apply patterns from \`test/PATTERNS.md\`
3. Use mocks from \`test/utils/mock-factories.ts\`
4. Check \`test/utils/esm-mock-setup.ts\` for ESM patterns

---
*Generated by test-monitor.sh - Updates every $((INTERVAL / 60)) minutes*
EOF
}

# Function to analyze test status by category
analyze_test_status() {
    local category=$1
    local log_file=$(ls -t "$LOG_DIR"/test-run-*.log 2>/dev/null | head -1)
    
    if [ -z "$log_file" ]; then
        echo "⏳ Pending"
        return
    fi
    
    case "$category" in
        "infrastructure")
            if grep -q "FAIL.*infrastructure" "$log_file"; then
                echo "❌ Failing"
            elif grep -q "PASS.*infrastructure" "$log_file"; then
                echo "✅ Passing"
            else
                echo "⏳ Pending"
            fi
            ;;
        "services")
            if grep -q "FAIL.*services" "$log_file"; then
                echo "❌ Failing"
            elif grep -q "PASS.*services" "$log_file"; then
                echo "✅ Passing"
            else
                echo "⏳ Pending"
            fi
            ;;
        "integration")
            if grep -q "FAIL.*integration" "$log_file"; then
                echo "❌ Failing"
            elif grep -q "PASS.*integration" "$log_file"; then
                echo "✅ Passing"
            else
                echo "⏳ Pending"
            fi
            ;;
        "domain")
            if grep -q "FAIL.*domain" "$log_file"; then
                echo "❌ Failing"
            elif grep -q "PASS.*domain" "$log_file"; then
                echo "✅ Passing"
            else
                echo "⏳ Pending"
            fi
            ;;
        *)
            echo "❓ Unknown"
            ;;
    esac
}

# Function to monitor specific test file
monitor_test_file() {
    local test_file=$1
    echo -e "${BLUE}Monitoring: $test_file${NC}"
    
    npm test -- "$test_file" --json 2>&1 | tee "$LOG_DIR/monitor-$(basename $test_file).log"
}

# Function to generate quick report
generate_quick_report() {
    echo -e "\n${BLUE}=== Quick Test Report ===${NC}"
    
    # Count test files
    local total_test_files=$(find test -name "*.test.ts" | wc -l)
    echo "Total test files: $total_test_files"
    
    # Show recent test runs
    echo -e "\nRecent test runs:"
    ls -lt "$LOG_DIR"/test-run-*.log 2>/dev/null | head -5 | while read line; do
        echo "  $line"
    done
    
    # Show progress trend
    if [ -f "$LOG_DIR/progress.csv" ]; then
        echo -e "\nProgress trend (last 5 runs):"
        tail -5 "$LOG_DIR/progress.csv" | column -t -s,
    fi
}

# Main monitoring loop
main() {
    echo -e "${GREEN}Starting Test Monitor for Team Echo${NC}"
    echo -e "Monitoring interval: $((INTERVAL / 60)) minutes"
    echo -e "Log directory: $LOG_DIR"
    echo -e "Dashboard: $DASHBOARD_FILE\n"
    
    # Initialize progress CSV if it doesn't exist
    if [ ! -f "$LOG_DIR/progress.csv" ]; then
        echo "Timestamp,Passed,Failed,Total,PassRate" > "$LOG_DIR/progress.csv"
    fi
    
    # Initialize activity log
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Test monitor started" >> "$LOG_DIR/activity.log"
    
    # Run initial test suite
    run_test_suite
    initial_failed=$?
    
    if [ "$1" == "--once" ]; then
        generate_quick_report
        exit $initial_failed
    fi
    
    # Continuous monitoring loop
    while true; do
        echo -e "\n${BLUE}Waiting $((INTERVAL / 60)) minutes until next run...${NC}"
        echo "Press Ctrl+C to stop monitoring"
        
        sleep "$INTERVAL"
        
        # Log activity
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running scheduled test suite" >> "$LOG_DIR/activity.log"
        
        # Run tests
        run_test_suite
        current_failed=$?
        
        # Check for improvement
        if [ $current_failed -lt $initial_failed ]; then
            echo -e "${GREEN}✅ Progress! Failures reduced from $initial_failed to $current_failed${NC}"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Progress: $initial_failed -> $current_failed failures" >> "$LOG_DIR/activity.log"
        elif [ $current_failed -gt $initial_failed ]; then
            echo -e "${RED}⚠️  Warning! Failures increased from $initial_failed to $current_failed${NC}"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] Regression: $initial_failed -> $current_failed failures" >> "$LOG_DIR/activity.log"
        fi
        
        initial_failed=$current_failed
        
        # Generate quick report every iteration
        generate_quick_report
    done
}

# Handle script arguments
case "$1" in
    "--once")
        main --once
        ;;
    "--monitor")
        shift
        monitor_test_file "$1"
        ;;
    "--report")
        generate_quick_report
        ;;
    "--dashboard")
        cat "$DASHBOARD_FILE" 2>/dev/null || echo "Dashboard not yet generated. Run tests first."
        ;;
    "--help")
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --once       Run tests once and exit"
        echo "  --monitor <file>  Monitor specific test file"
        echo "  --report     Generate quick report"
        echo "  --dashboard  Show current dashboard"
        echo "  --help       Show this help message"
        echo ""
        echo "Environment variables:"
        echo "  TEST_MONITOR_INTERVAL  Interval between test runs in seconds (default: 1800)"
        ;;
    *)
        main
        ;;
esac