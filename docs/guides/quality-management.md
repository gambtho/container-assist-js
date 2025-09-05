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
- ❌ Warning count exceeds the baseline (repo-wide) or the lint-staged threshold (750 for staged files)
- ❌ TypeScript compilation fails
- ❌ Tests fail
- ❌ Quality gates scripts fail

Your PR will **pass** if:
- ✅ Warnings are within thresholds (≤ baseline repo-wide; ≤ 750 for staged files via lint-staged)
- ✅ No lint errors (warnings allowed up to the threshold)
- ✅ TypeScript compiles
- ✅ All tests pass
- ✅ Quality gates are met

## Package.json Updates

The `package.json` has been updated with improved scripts:

### Build Scripts
- `build`: Standard build with test utils and declarations
- `build:fast`: Quick build skipping declarations
- `build:prod`: Production build with minification
- `build:dev`: Development build (skip declarations)
- `build:watch`: Watch mode for continuous building

### Quality Scripts
- `quality:check`: Full quality analysis using lint-metrics.sh
- `quality:gates`: Run quality gates (supports SKIP_TYPECHECK)
- `baseline:update`: Update quality baselines after improvements
- `baseline:report`: Quick baseline summary (top 20 lines)

### Bundle Management
- `bundle:size`: Analyze total bundle and CLI binary size
- `bundle:check`: Dry run npm pack to verify publishing
- `prepublishOnly`: Runs validation and prod build before publish
- `release`: Complete release process (validate, build, publish)

### Husky Integration
- `prepare`: Installs husky hooks automatically
- Pre-commit hook runs lint-staged and quality gates
- Quality-gates.json auto-staged when improved

## Commands Reference

### Quality Checks
```bash
npm run quality:check      # Full quality analysis
npm run quality:gates      # Run quality gates with optional SKIP_TYPECHECK
npm run validate           # Run lint, typecheck, and unit tests
npm run typecheck          # TypeScript compilation check
```

### Baseline Management
```bash
npm run baseline:report    # Quick summary (top 20 lines)
npm run baseline:update    # Set new baseline after improvements
# Note: baseline:check and baseline:lint commands have been removed
```

### Quick Fixes
```bash
npm run fix:all           # Auto-fix lint + format
npm run lint:fix          # Fix linting issues
npm run format            # Fix formatting
npm run format:check      # Check formatting without fixing
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
npm run baseline:update
# or
./scripts/lint-metrics.sh --baseline

# The quality-gates.json file will be automatically updated
# and staged if modified during pre-commit hooks

# Commit baseline
git add quality-gates.json
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
npm run quality:check
# or
./scripts/lint-metrics.sh

# Fix new warnings immediately
npm run fix:all
```

### Monthly
```bash
# Deep analysis
./scripts/lint-metrics.sh > reports/monthly-quality.txt

# Dependency audit (set to fail only on high severity)
npm audit --audit-level high

# Update baselines if improved
npm run baseline:update
```

## Troubleshooting

### "Ratchet Violation" Error
```bash
# See what increased
npm run quality:gates

# Fix warnings in changed files
npm run lint -- src/path/to/file.ts

# Auto-fix and retry
npm run fix:all

# Note: lint-staged enforces max 750 warnings
```

### Baseline Issues
```bash
# Reset baseline if corrupted
npm run baseline:update
# or
./scripts/lint-metrics.sh --baseline

# The baseline is now stored in quality-gates.json
# Manual override (emergency only) - edit quality-gates.json
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
This file is automatically maintained by the quality gates system and includes:
- Current baseline warning count
- Unused exports baseline
- Metrics history
- Quality gate thresholds

The file is automatically updated during pre-commit hooks when improvements are detected.

### Lint-staged Configuration
**File**: `package.json`
```json
"lint-staged": {
  "src/**/*.ts": [
    "eslint --fix --max-warnings 750",
    "prettier --write"
  ]
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
- **Current**: Check with `npm run baseline:report`
- **Reduction**: Progressive improvement tracked
- **Dead Code**: Tracked in quality-gates.json
- **Lint-staged Max**: 750 warnings enforced

### Current Health
Run `npm run quality:check` for current status:
- **TypeScript**: Check with `npm run typecheck`
- **ESLint Warnings**: Max 750 (enforced by lint-staged)
- **ESLint Errors**: Must be 0 to pass
- **Quality Gates**: Tracked in quality-gates.json

## Related Documentation
- [Testing Guide](./testing.md)
- [Development Workflow](../../README.md#development)
- [Main README](../../README.md)
- [Documentation Index](../README.md)