#!/bin/bash

# Fix session manager usage in all tools
# Replace createSessionManager with getSessionManager to use singleton pattern

echo "Fixing session manager usage in all tools..."

# Find all files that use createSessionManager in tools directory
FILES=$(grep -rl "createSessionManager" src/tools/)

for file in $FILES; do
  echo "Updating $file..."
  # Replace createSessionManager with getSessionManager
  sed -i 's/createSessionManager/getSessionManager/g' "$file"
done

# Also update the imports in src/lib/session.ts export
echo "Checking imports..."
grep -l "import { createSessionManager }" src/tools/*.ts | while read file; do
  echo "Fixing import in $file..."
  sed -i 's/import { createSessionManager }/import { getSessionManager }/g' "$file"
done

echo "Done! All tools now use the singleton session manager."
echo ""
echo "Files updated:"
grep -l "getSessionManager" src/tools/*.ts