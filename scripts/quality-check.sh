#!/bin/bash

set -euo pipefail

echo "Running quality checks..."

# TypeScript compilation
echo "✓ Checking TypeScript..."
npm run typecheck

# ESLint
echo "✓ Running ESLint..."
npm run lint

# Run tests
echo "✓ Running tests..."
npm test

# Check for Result<T> usage
echo "✓ Checking error handling patterns..."
echo "Checking for throw statements (should use Result<T> instead):"
grep -r "throw new Error" src/ --include="*.ts" | grep -v "test" || echo "  No problematic throw statements found"

echo "✅ All quality checks passed!"