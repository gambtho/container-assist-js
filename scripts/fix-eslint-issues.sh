#!/bin/bash

echo "🔧 Fixing common ESLint issues..."

# Fix logical OR to nullish coalescing (|| to ??)
echo "📝 Replacing logical OR with nullish coalescing..."
find src -name "*.ts" -type f -exec sed -i 's/\([a-zA-Z_][a-zA-Z0-9_.]*\) || /\1 ?? /g' {} +

# Fix async functions without await
echo "🔄 Removing unnecessary async keywords..."
find src -name "*.ts" -type f -exec sed -i '/async.*{[^}]*}/s/async \([^{]*{[^}]*}\)/\1/g' {} +

# Fix string conditionals to explicit checks
echo "🔍 Adding explicit checks for string conditionals..."
find src -name "*.ts" -type f -exec sed -i 's/if (\([a-zA-Z_][a-zA-Z0-9_]*\))/if (\1 !== undefined \&\& \1 !== null)/g' {} +

echo "✨ Done! Running ESLint to check remaining issues..."
npm run lint 2>&1 | tail -10