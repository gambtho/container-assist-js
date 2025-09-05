# Maintenance Procedures

This document provides systematic procedures for maintaining code quality, preventing technical debt, and ensuring long-term codebase health.

---

## 📋 **Daily Quality Monitoring**

### Quick Health Check (2-3 minutes)
```bash
# Get current quality overview
npm run baseline:report

# Expected output should show:
# - ESLint warnings: stable or decreasing
# - Unused exports: stable or decreasing  
# - Build performance: <5s
```

### Warning Signs to Watch For:
- **❌ Lint warning increase**: New warnings introduced
- **❌ Build time regression**: Builds taking >5s consistently  
- **❌ Dead code accumulation**: Unused export count growing
- **❌ Test failures**: Any failing unit tests

### Daily Actions:
1. **Run quality check**: `npm run quality:check`
2. **Address any regressions**: Fix new warnings immediately
3. **Update baselines**: When improvements are made

---

## 📊 **Weekly Quality Review** 

### Comprehensive Analysis (15-20 minutes)
```bash
# Full quality assessment
./scripts/lint-metrics.sh

# Test all validation workflows  
npm run validate:pr:fast
npm run validate:pr:fast -- --show-warnings
```

### Review Checklist:
- [ ] **Lint Trends**: Are warnings decreasing over time?
- [ ] **Dead Code**: Are unused exports being cleaned up?
- [ ] **Top Issues**: What are the most common warning types?
- [ ] **Team Progress**: Are other teams improving quality metrics?
- [ ] **Baseline Health**: Do current baselines reflect actual progress?

### Weekly Actions:
1. **Identify Top Issues**: Focus on high-frequency warning types
2. **Plan Cleanup**: Target files with most unused exports  
3. **Update Baselines**: Commit improvements to baseline files
4. **Team Communication**: Share quality progress with team

---

## 🗓️ **Monthly System Health Assessment**

### Deep System Review (30-45 minutes)

#### 1. Quality Metrics Analysis
```bash
# Generate comprehensive report
./scripts/lint-metrics.sh > reports/monthly-quality-report.txt

# Analyze trends
git log --oneline --grep="baseline" --since="1 month ago"

# Check build performance
npm run bundle:size
```

#### 2. Dependency Health Check
```bash
# Check for outdated dependencies
npm outdated

# Security audit
npm audit

# Check for unused dependencies
npm run bundle:check
```

#### 3. Test Infrastructure Review
```bash
# Full test suite health
npm run test:coverage

# Integration test status  
npm run test:integration:auto

# Performance test baseline
npm run bundle:size
```

### Monthly Assessment Checklist:
- [ ] **Quality Trend Analysis**: Review 30-day quality metrics
- [ ] **Dependency Updates**: Plan security and feature updates
- [ ] **Performance Baseline**: Check for build/runtime regressions
- [ ] **Test Coverage**: Ensure coverage meets team standards
- [ ] **Dead Code Elimination**: Plan cleanup of accumulated unused exports
- [ ] **Tool Effectiveness**: Assess quality gate effectiveness

---

## 🚨 **Issue Response Procedures**

### Lint Ratchet Violations
**When PR validation fails due to increased warnings:**

```bash
# 1. Analyze the violation
./scripts/lint-metrics.sh

# 2. Identify new warnings
git diff HEAD~1 -- reports/current-lint-output.txt

# 3. Fix warnings with auto-fix first
npm run fix:all

# 4. Manually address remaining issues
npm run lint

# 5. Verify fixes
npm run validate:pr:fast
```

### Build Performance Regression
**When builds exceed 5s consistently:**

```bash
# 1. Measure current performance
time npm run build

# 2. Check for new dependencies
git diff HEAD~5 -- package.json

# 3. Analyze bundle size changes
npm run bundle:size

# 4. Review recent code changes
git log --oneline --since="1 week ago" -- tsdown.config.ts

# 5. Consider optimization strategies
# - Review entry points in tsdown.config.ts
# - Check for large file additions
# - Consider code splitting opportunities
```

### Dead Code Accumulation
**When unused exports exceed baseline significantly:**

```bash
# 1. Identify top offenders
./scripts/lint-metrics.sh | grep "unused exports:"

# 2. Start with highest count files
# Focus on src/domain/types/index.ts (usually highest)

# 3. Use automated tools
npx ts-prune --project tsconfig.json | grep "not used" | head -20

# 4. Safe removal process:
# - Remove unused exports
# - Run tests: npm run test:unit
# - Check build: npm run build
# - Update baseline: npm run baseline:lint
```

### Test Suite Failures
**When unit tests start failing:**

```bash
# 1. Run focused test suite
npm run test:unit:quick

# 2. Identify failing test categories
npm test -- --verbose --bail=false

# 3. Check for recent changes
git log --oneline --since="3 days ago" -- src/ test/

# 4. Run specific test files
npm test -- path/to/failing-test.test.ts

# 5. Check test environment
npm run validate:tests
```

---

## ⚙️ **Quality Gate Management**

### Baseline Update Process
**When quality improvements warrant new baselines:**

```bash
# 1. Verify improvements are real
./scripts/lint-metrics.sh

# 2. Ensure improvements are committed
git status  # Should show clean working directory

# 3. Set new baselines
npm run baseline:lint

# 4. Commit baseline changes
git add reports/baseline-count.txt reports/deadcode-baseline.txt
git commit -m "chore: update quality baselines after improvements

- ESLint warnings: [OLD] → [NEW]
- Unused exports: [OLD] → [NEW]"

# 5. Verify team can use new baselines
npm run validate:pr:fast
```

### Quality Gate Configuration
**Adjusting quality thresholds in quality-gates.json:**

1. **Lint Gates**: Modify warning thresholds
2. **Deadcode Gates**: Adjust unused export limits  
3. **Build Gates**: Update performance thresholds
4. **Test Gates**: Configure coverage requirements

```bash
# Test configuration changes
npm run quality:gates

# Validate all workflows still work
npm run validate:pr:fast
npm run validate:pr
```

---

## 🔧 **Troubleshooting Guide**

### Common Issues & Solutions

#### "Lint-metrics script parsing errors"
```bash
# Check script syntax
bash -n scripts/lint-metrics.sh

# Test with verbose output
bash -x scripts/lint-metrics.sh
```

#### "Validation hangs on quality check"
```bash
# Run with timeout
timeout 60 npm run quality:check

# Check for lint errors causing exit
npm run lint 2>&1 | grep "error" | wc -l
```

#### "Baseline files missing or corrupted"
```bash
# Regenerate baseline files
./scripts/lint-metrics.sh --baseline

# Verify file contents
cat reports/baseline-count.txt
cat reports/deadcode-baseline.txt
```

#### "PR validation inconsistent results"
```bash
# Clear cached lint output
rm -rf reports/current-lint-output.txt

# Force fresh analysis
npm run validate:pr:fast

# Check git status for uncommitted changes
git status
```

---

## 📈 **Quality Improvement Strategies**

### High-Impact Activities

#### 1. Focus on Top Warning Types
```bash
# Identify most frequent warnings
./scripts/lint-metrics.sh | head -20

# Target highest count warnings first:
# - @typescript-eslint/no-unsafe-assignment
# - @typescript-eslint/no-explicit-any
# - @typescript-eslint/no-unsafe-member-access
```

#### 2. Dead Code Cleanup Priority
```bash
# Start with files having most unused exports
./scripts/lint-metrics.sh | grep "unused exports:" | head -5

# Typical high-impact files:
# - src/domain/types/index.ts
# - src/infrastructure/index.ts
# - src/application/tools/schemas.ts
```

#### 3. Systematic Warning Reduction
1. **Auto-fix first**: `npm run fix:all`
2. **Type safety improvements**: Add proper type annotations
3. **Remove `any` types**: Replace with specific interfaces
4. **Clean up imports**: Remove unused imports
5. **Update baselines**: Commit improvements

### Team Coordination

#### Quality Improvement Sprints
- **Monthly focus**: Pick one warning type to eliminate
- **Team effort**: Coordinate across Teams Alpha-Delta  
- **Shared goals**: Reduce warnings by X% per month
- **Celebrate wins**: Acknowledge quality improvements

#### Best Practices
1. **Never increase warnings**: Use quality gates to prevent regression
2. **Fix immediately**: Address new warnings as they appear
3. **Clean as you go**: Remove unused code when refactoring
4. **Test thoroughly**: Ensure changes don't break functionality
5. **Document changes**: Update baselines after improvements

---

## 📚 **References & Resources**

### Quality Commands Quick Reference
```bash
# Daily checks
npm run baseline:report      # Quick quality summary
npm run quality:check        # Full quality analysis

# Development workflow  
npm run check:quick          # Fast pre-commit check
npm run fix:all             # Auto-fix + format

# PR preparation
npm run validate:pr:fast     # Quick PR validation
npm run validate:pr          # Full PR validation

# Baseline management
npm run baseline:lint        # Set new baseline
```

### Documentation Links
- **Team Echo Plan**: `TEAM_ECHO_IMPLEMENTATION_PLAN.md`
- **Quality Gates**: `QUALITY_GATES_IMPLEMENTATION.md`  
- **Lint Management**: `docs/LINT_MANAGEMENT.md`
- **Main Documentation**: `CLAUDE.md`

### Escalation Contacts
- **Build Issues**: Check `tsdown.config.ts` and build configuration
- **Test Failures**: Review test setup in `jest.config.js`
- **Quality Gates**: Modify `quality-gates.json` configuration
- **CI/CD Issues**: Check validation scripts in `scripts/` directory

---

*Maintenance Procedures v1.0 - Team Echo System Optimization*

**Last Updated**: Team Echo Implementation (Phase 2 Cleanup)
**Review Frequency**: Monthly
**Owner**: Team Echo (System Optimization)