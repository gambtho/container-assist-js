# Lint Management & Ratcheting System

This project uses a **lint ratcheting system** to steadily reduce technical debt by preventing increases in lint warnings while encouraging gradual improvement.

## 🎯 How It Works

- **Baseline**: Current count of acceptable warnings (stored in `reports/baseline-count.txt`)
- **Ratchet**: PRs cannot increase warnings above baseline  
- **Progress**: Warnings can be reduced, improving the baseline over time
- **Enforcement**: GitHub workflow fails PRs that violate the ratchet

## 📊 Current Status

```bash
# Check current lint status
./scripts/lint-metrics.sh
```

**Output explains:**
- Current warning count vs baseline
- Progress since baseline was set  
- Top warning types by frequency
- Reduction percentage achieved

## 🔧 Commands

### Check Status
```bash
./scripts/lint-metrics.sh              # Full status report
npm run validate:pr:fast               # Quick ratchet check
npm run validate:pr:fast --show-warnings  # Show top warning types
```

### Update Baseline
```bash
# After fixing warnings, set new baseline
./scripts/lint-metrics.sh --baseline

# Commit the improvement
git add reports/baseline-count.txt
git commit -m "chore: reduce lint baseline to $(cat reports/baseline-count.txt) warnings"
```

### Manual Override (Emergency)
```bash
# Set specific baseline (use sparingly)
echo "1000" > reports/baseline-count.txt

# Verify
cat reports/baseline-count.txt
```

## 📈 Improvement Strategy

### 1. Analyze Warning Types
```bash
./scripts/lint-metrics.sh
```
Look at the "Top 10 Warning Types" section to see what to focus on.

### 2. Auto-Fix What's Possible  
```bash
npm run lint:fix
```
This handles formatting, unused imports, and other mechanical fixes.

### 3. Target High-Impact Types
Focus on the most frequent warning types first:

**Common Warning Types & Fixes:**
- `@typescript-eslint/no-unsafe-assignment` → Add proper typing
- `@typescript-eslint/no-unsafe-member-access` → Add type guards  
- `@typescript-eslint/no-explicit-any` → Use specific types
- `@typescript-eslint/prefer-nullish-coalescing` → Use `??` instead of `||`
- `@typescript-eslint/no-unused-vars` → Remove unused variables or prefix with `_`

### 4. Iterative Improvement
```bash
# Fix some warnings
npm run lint:fix
# Manual fixes for complex cases

# Check progress  
./scripts/lint-metrics.sh

# When satisfied with reduction
./scripts/lint-metrics.sh --baseline
```

## 🚫 PR Quality Gates

Your PR **will fail** if:
- ❌ **Lint errors** exist (different from warnings)
- ❌ **Warning count increases** above baseline
- ❌ **TypeScript compilation fails**

Your PR **will pass** if:
- ✅ Warning count stays same or decreases
- ✅ No lint errors (only warnings allowed)
- ✅ TypeScript compiles successfully

## 📋 Best Practices

### For New Code
- Write lint-clean code from the start
- Use `npm run lint:fix` before committing
- Address warnings as you write, don't accumulate them

### For Existing Code  
- **Don't fix unrelated warnings** in feature PRs (scope creep)
- **Do fix warnings** in files you're already modifying
- **Create dedicated cleanup PRs** for large warning reduction efforts

### For Team Collaboration
- **Commit baseline changes** so everyone uses the same target
- **Document major cleanup efforts** in commit messages
- **Celebrate baseline reductions** in PR descriptions

## 🔍 Troubleshooting

### "Ratchet violation" in PR
```bash
# Check what increased
npm run validate:pr:fast

# See specific new warnings
git diff main -- # (look at files you changed)
npm run lint -- path/to/changed/file.ts
```

### Baseline seems wrong
```bash
# Check current baseline
cat reports/baseline-count.txt

# Check actual current count  
./scripts/lint-metrics.sh

# Reset if needed
./scripts/lint-metrics.sh --baseline
```

### Emergency baseline increase
```bash
# Only if absolutely necessary for urgent fixes
echo "1150" > reports/baseline-count.txt
git add reports/baseline-count.txt  
git commit -m "temp: increase lint baseline for urgent fix"

# Plan to reduce it again soon!
```

## 📊 Historical Progress

- **Original**: ~1294 warnings
- **Current**: 1086 warnings  
- **Reduction**: 208 warnings (16.1% improvement)
- **Target**: Continue steady reduction

The ratcheting system ensures we never go backwards while making forward progress sustainable and measurable! 🎯