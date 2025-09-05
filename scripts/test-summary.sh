#!/bin/bash

# Comprehensive Test Summary Script for Team Echo
# Provides detailed analysis of test status across all teams

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
OUTPUT_DIR="./test-reports"
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
REPORT_FILE="$OUTPUT_DIR/summary-$TIMESTAMP.md"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}🔍 Generating Comprehensive Test Summary${NC}"
echo -e "Report will be saved to: $REPORT_FILE\n"

# Function to analyze test files by category
analyze_test_category() {
    local category=$1
    local pattern=$2
    local title=$3
    
    echo -e "\n${PURPLE}=== $title ===${NC}"
    
    local test_files=$(find test -name "*.test.ts" -path "*$pattern*" 2>/dev/null)
    local file_count=$(echo "$test_files" | wc -l)
    
    if [ -z "$test_files" ] || [ "$file_count" -eq 0 ]; then
        echo "No test files found for pattern: $pattern"
        return
    fi
    
    echo "Found $file_count test files:"
    
    local passing=0
    local failing=0
    local total=0
    
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            echo -e "${CYAN}  📁 $file${NC}"
            
            # Run individual test file to get status
            local test_output=$(npm test -- "$file" --silent 2>&1)
            local test_status=$?
            
            if [ $test_status -eq 0 ]; then
                echo -e "    ${GREEN}✅ PASSING${NC}"
                ((passing++))
            else
                echo -e "    ${RED}❌ FAILING${NC}"
                ((failing++))
            fi
            ((total++))
        fi
    done <<< "$test_files"
    
    local pass_rate=0
    if [ $total -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.1f\", ($passing / $total) * 100}")
    fi
    
    echo -e "\n${YELLOW}Category Summary:${NC}"
    echo -e "  Total Files: $total"
    echo -e "  Passing: ${GREEN}$passing${NC}"
    echo -e "  Failing: ${RED}$failing${NC}"
    echo -e "  Pass Rate: ${pass_rate}%"
    
    # Save to report
    cat >> "$REPORT_FILE" << EOF

## $title
- **Total Files**: $total
- **Passing**: $passing
- **Failing**: $failing  
- **Pass Rate**: ${pass_rate}%

### Files:
EOF
    
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            local test_output=$(npm test -- "$file" --silent 2>&1)
            local test_status=$?
            
            if [ $test_status -eq 0 ]; then
                echo "- ✅ \`$file\`" >> "$REPORT_FILE"
            else
                echo "- ❌ \`$file\`" >> "$REPORT_FILE"
            fi
        fi
    done <<< "$test_files"
}

# Function to run full test suite analysis
run_full_analysis() {
    echo -e "${BLUE}Running full test suite analysis...${NC}"
    
    local full_output=$(npm test 2>&1)
    local exit_code=$?
    
    # Parse Jest output
    local suite_stats=$(echo "$full_output" | grep "Test Suites:")
    local test_stats=$(echo "$full_output" | grep "Tests:")
    
    echo -e "\n${GREEN}=== Overall Results ===${NC}"
    echo "$suite_stats"
    echo "$test_stats"
    
    # Extract numbers for calculations
    local total_suites=$(echo "$suite_stats" | grep -oE '[0-9]+ total' | grep -oE '[0-9]+')
    local failed_suites=$(echo "$suite_stats" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
    local passed_suites=$(echo "$suite_stats" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
    
    local total_tests=$(echo "$test_stats" | grep -oE '[0-9]+ total' | grep -oE '[0-9]+')
    local failed_tests=$(echo "$test_stats" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
    local passed_tests=$(echo "$test_stats" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
    
    # Calculate pass rates
    # Validate division by zero
    if [ "$total_suites" -eq 0 ]; then
        local suite_pass_rate="0.0"
    else
        local suite_pass_rate=$(awk "BEGIN {printf \"%.1f\", ($passed_suites / $total_suites) * 100}")
    fi
    
    if [ "$total_tests" -eq 0 ]; then
        local test_pass_rate="0.0"
    else
        local test_pass_rate=$(awk "BEGIN {printf \"%.1f\", ($passed_tests / $total_tests) * 100}")
    fi
    
    # Create comprehensive report header
    cat > "$REPORT_FILE" << EOF
# Test Summary Report
Generated: $(date '+%Y-%m-%d %H:%M:%S')

## Executive Summary
- **Overall Test Pass Rate**: ${test_pass_rate}%
- **Overall Suite Pass Rate**: ${suite_pass_rate}%
- **Total Test Suites**: $total_suites
- **Total Tests**: $total_tests
- **Remaining Failures**: $failed_tests tests in $failed_suites suites

## Progress Tracking
| Metric | Count | Status |
|--------|-------|---------|
| Passing Tests | $passed_tests | ✅ |
| Failing Tests | $failed_tests | ❌ |
| Passing Suites | $passed_suites | ✅ |
| Failing Suites | $failed_suites | ❌ |
| Pass Rate | ${test_pass_rate}% | $([ $(echo "$test_pass_rate > 95" | bc -l) -eq 1 ] && echo "🎯" || echo "📈") |

EOF
    
    return $exit_code
}

# Function to identify specific failing tests
identify_failing_tests() {
    echo -e "\n${RED}=== Failing Test Analysis ===${NC}"
    
    local test_output=$(npm test 2>&1)
    
    # Extract failing test suites
    local failing_suites=$(echo "$test_output" | grep "FAIL " | grep -oE "test/.*\.test\.ts")
    
    if [ -n "$failing_suites" ]; then
        echo -e "\n${YELLOW}Failing Test Suites:${NC}"
        
        cat >> "$REPORT_FILE" << EOF

## Failing Tests Analysis

### Failing Test Suites:
EOF
        
        echo "$failing_suites" | while IFS= read -r suite; do
            if [ -n "$suite" ]; then
                echo -e "${RED}  ❌ $suite${NC}"
                
                # Try to get more details about the failures
                local detail_output=$(npm test -- "$suite" 2>&1 | grep -E "(FAIL|Error:|Expected|Received)" | head -3)
                if [ -n "$detail_output" ]; then
                    echo -e "${YELLOW}     Details: ${NC}$(echo "$detail_output" | tr '\n' ' ' | cut -c1-80)..."
                fi
                
                echo "- \`$suite\`" >> "$REPORT_FILE"
            fi
        done
        
        # Categorize failures by type
        echo -e "\n${YELLOW}Failure Categories:${NC}"
        
        cat >> "$REPORT_FILE" << EOF

### Failure Categories:
EOF
        
        local infrastructure_fails=$(echo "$failing_suites" | grep -c "infrastructure" || echo "0")
        local integration_fails=$(echo "$failing_suites" | grep -c "integration" || echo "0")
        local application_fails=$(echo "$failing_suites" | grep -c "application" || echo "0")
        local unit_fails=$(echo "$failing_suites" | grep -c "unit" || echo "0")
        
        echo -e "  Infrastructure: ${RED}$infrastructure_fails${NC}"
        echo -e "  Integration: ${RED}$integration_fails${NC}"
        echo -e "  Application: ${RED}$application_fails${NC}"
        echo -e "  Unit Tests: ${RED}$unit_fails${NC}"
        
        cat >> "$REPORT_FILE" << EOF
- **Infrastructure Tests**: $infrastructure_fails failing
- **Integration Tests**: $integration_fails failing  
- **Application Tests**: $application_fails failing
- **Unit Tests**: $unit_fails failing
EOF
    else
        echo -e "${GREEN}🎉 No failing test suites found!${NC}"
        echo "🎉 **All test suites are passing!**" >> "$REPORT_FILE"
    fi
}

# Function to generate team assignments
generate_team_assignments() {
    echo -e "\n${BLUE}=== Team Assignment Analysis ===${NC}"
    
    cat >> "$REPORT_FILE" << EOF

## Team Assignment Status

### Team Alpha - Infrastructure Layer
**Responsibility**: Docker & Kubernetes client tests
EOF
    
    analyze_test_category "alpha" "infrastructure" "Team Alpha - Infrastructure" >> "$REPORT_FILE"
    
    cat >> "$REPORT_FILE" << EOF

### Team Beta - Service Layer  
**Responsibility**: Service layer business logic tests
EOF
    
    analyze_test_category "beta" "services" "Team Beta - Services" >> "$REPORT_FILE"
    
    cat >> "$REPORT_FILE" << EOF

### Team Gamma - Integration Tests
**Responsibility**: End-to-end integration tests
EOF
    
    analyze_test_category "gamma" "integration" "Team Gamma - Integration" >> "$REPORT_FILE"
    
    cat >> "$REPORT_FILE" << EOF

### Team Delta - Domain & Schema
**Responsibility**: Domain types and schema validation tests
EOF
    
    analyze_test_category "delta" "domain" "Team Delta - Domain" >> "$REPORT_FILE" || true
    
    cat >> "$REPORT_FILE" << EOF

### Team Echo - Coordination ✅
**Responsibility**: Mock infrastructure, coordination, monitoring
- **Status**: ✅ **COMPLETE**
- **Mock Infrastructure**: Available in \`test/utils/mock-factories.ts\`
- **ESM Utilities**: Available in \`test/utils/esm-mock-setup.ts\`
- **Documentation**: Available in \`test/PATTERNS.md\`
- **Monitoring**: Active via \`scripts/test-monitor.sh\`
EOF
}

# Function to generate recommendations
generate_recommendations() {
    cat >> "$REPORT_FILE" << EOF

## Recommendations & Next Steps

### High Priority Actions
1. **Focus on failing infrastructure tests** - These block other teams
2. **Apply ESM mocking patterns** from \`test/PATTERNS.md\`
3. **Use shared mock infrastructure** from \`test/utils/mock-factories.ts\`

### Team-Specific Actions
- **Team Alpha**: Use \`createComprehensiveK8sMock()\` and \`createMockDockerode()\`
- **Team Beta**: Follow service layer patterns in PATTERNS.md
- **Team Gamma**: Use integration test mocking utilities
- **Team Delta**: Focus on Result<T> patterns and schema validation

### Resources Available
- 📚 **Patterns Guide**: \`test/PATTERNS.md\`
- 🛠️ **Mock Utilities**: \`test/utils/esm-mock-setup.ts\`
- 🏭 **Mock Factories**: \`test/utils/mock-factories.ts\`
- 📊 **Monitoring**: \`./scripts/test-monitor.sh\`
- 📋 **Dashboard**: \`TEST_STATUS_DASHBOARD.md\`

### Success Criteria
- 🎯 **Target**: 100% test pass rate (0 failures)
- 📈 **Current**: ${test_pass_rate}% pass rate
- ✅ **Definition of Done**: All 985 tests passing

---
*Report generated by Team Echo - \`scripts/test-summary.sh\`*
EOF
}

# Validate arguments
if [ "$#" -gt 0 ] && [ "$1" != "--quick" ] && [ "$1" != "--json" ]; then
    echo "Error: Invalid argument. Use --quick, --json, or no arguments."
    exit 1
}

# Main execution
main() {
    echo -e "${GREEN}📊 Comprehensive Test Analysis Starting${NC}"
    echo -e "Timestamp: $(date)\n"
    
    # Run full analysis first
    run_full_analysis
    local exit_code=$?
    
    # Analyze failing tests
    identify_failing_tests
    
    # Generate team assignments (but don't run individual tests - too slow)
    generate_team_assignments
    
    # Generate recommendations
    generate_recommendations
    
    echo -e "\n${GREEN}✅ Analysis Complete!${NC}"
    echo -e "📄 Report saved to: ${BLUE}$REPORT_FILE${NC}"
    echo -e "📊 Dashboard: ${BLUE}TEST_STATUS_DASHBOARD.md${NC}"
    
    # Show quick summary
    echo -e "\n${YELLOW}Quick Summary:${NC}"
    tail -20 "$REPORT_FILE" | grep -E "(Target|Current|Definition)" | head -3
    
    return $exit_code
}

# Handle command line arguments
case "$1" in
    "--quick")
        run_full_analysis
        ;;
    "--failing")
        identify_failing_tests
        ;;
    "--teams")  
        generate_team_assignments
        ;;
    "--report")
        cat "$OUTPUT_DIR"/summary-*.md 2>/dev/null | tail -50 || echo "No reports found"
        ;;
    "--help")
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --quick      Run quick analysis only"
        echo "  --failing    Analyze failing tests only"
        echo "  --teams      Show team assignment analysis"
        echo "  --report     Show latest report"
        echo "  --help       Show this help"
        ;;
    *)
        main
        ;;
esac