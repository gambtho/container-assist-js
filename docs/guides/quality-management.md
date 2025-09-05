# Quality Management Guide

Comprehensive guide for maintaining code quality, managing technical debt, and using the quality gates system.

## Quick Status Check

```bash
# Current quality overview
npm run baseline:report

# Full quality analysis
npm run quality:check

# Check against baselines
./scripts/lint-metrics.sh
```

## Quality Gates System

### Overview
The project uses automated quality gates to prevent regression and encourage improvement:
- **Baseline Tracking**: Current acceptable warning count
- **Ratcheting**: PRs cannot increase warnings
- **Continuous Improvement**: Baselines update as quality improves

### Current Status
```bash
# Check current metrics
./scripts/lint-metrics.sh

# Output shows:
# - Warning count vs baseline
# - Unused exports tracking
# - Top warning types
# - Progress percentage
```

### PR Quality Gates
Your PR will **fail** if:
- ❌ Any ESLint errors exist
- ❌ Warning count exceeds baseline
- ❌ TypeScript compilation fails
- ❌ Tests fail

Your PR will **pass** if:
- ✅ Warnings stay same or decrease
- ✅ No lint errors (warnings allowed)
- ✅ TypeScript compiles
- ✅ All tests pass

## Commands Reference

### Quality Checks
```bash
npm run quality:check      # Full quality analysis
npm run quality:gates      # TypeScript + quality analysis
npm run validate:pr:fast   # Quick PR validation
npm run validate:pr        # Full validation with coverage
```

### Baseline Management
```bash
npm run baseline:check     # Compare current vs baseline
npm run baseline:report    # Quick summary (top 20 lines)
npm run baseline:lint      # Set new baseline after improvements
```

### Quick Fixes
```bash
npm run check:quick        # Fast type + lint check
npm run fix:all           # Auto-fix lint + format
npm run lint:fix          # Fix linting issues
npm run format            # Fix formatting
```

## Improvement Workflow

### 1. Analyze Current State
```bash
./scripts/lint-metrics.sh
```
Look for:
- Top warning types (focus on these)
- Files with most unused exports
- Current vs baseline comparison

### 2. Target High-Impact Issues
Common warnings and fixes:
- `@typescript-eslint/no-unsafe-assignment` → Add proper types
- `@typescript-eslint/no-explicit-any` → Replace with specific types
- `@typescript-eslint/no-unsafe-member-access` → Add type guards
- `prefer-nullish-coalescing` → Use `??` instead of `||`

### 3. Apply Fixes
```bash
# Auto-fix what's possible
npm run fix:all

# Manual fixes for complex issues
# Edit files...

# Verify improvements
npm run quality:check
```

### 4. Update Baseline
```bash
# After improvements
./scripts/lint-metrics.sh --baseline

# Commit baseline
git add reports/baseline-count.txt reports/deadcode-baseline.txt
git commit -m "chore: update quality baselines

- ESLint warnings: OLD → NEW
- Unused exports: OLD → NEW"
```

## Maintenance Procedures

### Daily
```bash
npm run baseline:report    # Quick health check
```

### Weekly
```bash
# Full assessment
./scripts/lint-metrics.sh

# Fix new warnings immediately
npm run fix:all
```

### Monthly
```bash
# Deep analysis
./scripts/lint-metrics.sh > reports/monthly-quality.txt

# Dependency audit
npm audit

# Update baselines if improved
npm run baseline:lint
```

## Troubleshooting

### "Ratchet Violation" Error
```bash
# See what increased
npm run validate:pr:fast

# Fix warnings in changed files
npm run lint -- path/to/file.ts

# Auto-fix and retry
npm run fix:all
```

### Baseline Issues
```bash
# Reset baseline if corrupted
./scripts/lint-metrics.sh --baseline

# Manual override (emergency only)
echo "1000" > reports/baseline-count.txt
```

### Script Failures
```bash
# Check script syntax
bash -n scripts/lint-metrics.sh

# Run with debug output
bash -x scripts/lint-metrics.sh
```

## Configuration

### Quality Gates Config
**File**: `quality-gates.json`
```json
{
  "gates": {
    "lint": {
      "maxWarnings": "baseline",
      "failOnIncrease": true
    },
    "deadcode": {
      "maxUnused": "baseline",
      "failOnIncrease": true
    },
    "typescript": {
      "maxErrors": 0
    }
  }
}
```

### ESLint Configuration
**File**: `.eslintrc.json`
- Extends: `@typescript-eslint/recommended`
- Custom rules for import paths
- Strict type checking enabled

## Best Practices

### For New Code
- Write lint-clean code from start
- Run `npm run lint:fix` before committing
- Don't accumulate warnings

### For Existing Code
- Fix warnings in files you're modifying
- Create dedicated cleanup PRs for large efforts
- Don't fix unrelated warnings in feature PRs

### For Teams
- Commit baseline updates for team
- Document major improvements
- Celebrate quality milestones

## Metrics & Progress

### Historical Progress
- **Initial**: ~1294 warnings
- **Current**: 700 warnings
- **Reduction**: 594 warnings (46% improvement)
- **Dead Code**: 234 unused exports (47% reduction from 441)

### Current Health
- ⚠️ **TypeScript**: 45 compilation errors
- ✅ **ESLint Warnings**: 700 (baseline enforced)
- ⚠️ **ESLint Errors**: 9 (must be fixed)
- ✅ **Infrastructure Layer**: 100% clean

## Related Documentation
- [Testing Guide](./testing.md)
- [Development Workflow](../../README.md#development)
- [Main README](../../README.md)
- [Documentation Index](../README.md)