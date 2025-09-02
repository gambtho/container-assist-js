#!/usr/bin/env node

/**
 * Script to fix common ESLint issues across the codebase
 * Focuses on the most common patterns that can be safely auto-fixed
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

interface FixResult {
  file: string;
  changes: number;
  errors: string[];
}

/**
 * Fix strict boolean expressions by adding explicit checks
 */
function fixStrictBooleanExpressions(content: string): { content: string; changes: number } {
  let changes = 0;
  let result = content;

  // Pattern 1: if (someString) -> if (someString !== undefined && someString !== '')
  result = result.replace(/if\s*\(([a-zA-Z_][a-zA-Z0-9_]*)\)/g, (match, varName) => {
    // Skip if it's already a boolean variable or function call
    if (varName.startsWith('is') || varName.startsWith('has') || varName.startsWith('should')) {
      return match;
    }
    changes++;
    return `if (${varName} !== undefined && ${varName} !== null)`;
  });

  // Pattern 2: someValue || defaultValue -> someValue ?? defaultValue
  result = result.replace(/([a-zA-Z_][a-zA-Z0-9_.]*)\s*\|\|\s*([^|&\n;]+)/g, (match, left, right) => {
    // Skip if it's in a comment
    if (match.includes('//') || match.includes('/*')) {
      return match;
    }
    changes++;
    return `${left} ?? ${right}`;
  });

  // Pattern 3: !someValue -> someValue === undefined || someValue === null
  result = result.replace(/if\s*\(\s*!([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g, (match, varName) => {
    if (varName.startsWith('is') || varName.startsWith('has') || varName.startsWith('should')) {
      return match;
    }
    changes++;
    return `if (${varName} === undefined || ${varName} === null)`;
  });

  // Pattern 4: while (someValue) -> while (someValue !== undefined && someValue !== null)
  result = result.replace(/while\s*\(([a-zA-Z_][a-zA-Z0-9_]*)\)/g, (match, varName) => {
    if (varName === 'true' || varName === 'false') {
      return match;
    }
    changes++;
    return `while (${varName} !== undefined && ${varName} !== null)`;
  });

  return { content: result, changes };
}

/**
 * Fix async functions without await
 */
function fixAsyncWithoutAwait(content: string): { content: string; changes: number } {
  let changes = 0;
  let result = content;

  // Remove async from functions that don't use await
  const asyncFunctionRegex = /async\s+(function\s+)?([a-zA-Z_][a-zA-Z0-9_]*)?[^{]*\{([^}]*)\}/g;
  
  result = result.replace(asyncFunctionRegex, (match, funcKeyword, funcName, body) => {
    // Check if body contains await
    if (!body.includes('await')) {
      changes++;
      return match.replace(/async\s+/, '');
    }
    return match;
  });

  // Arrow functions
  const asyncArrowRegex = /async\s*(\([^)]*\)|[a-zA-Z_][a-zA-Z0-9_]*)\s*=>\s*\{([^}]*)\}/g;
  
  result = result.replace(asyncArrowRegex, (match, params, body) => {
    if (!body.includes('await')) {
      changes++;
      return match.replace(/async\s*/, '');
    }
    return match;
  });

  return { content: result, changes };
}

/**
 * Process a single TypeScript file
 */
async function processFile(filePath: string): Promise<FixResult> {
  const result: FixResult = {
    file: filePath,
    changes: 0,
    errors: []
  };

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Apply fixes
    let newContent = content;
    
    const booleanFix = fixStrictBooleanExpressions(newContent);
    newContent = booleanFix.content;
    result.changes += booleanFix.changes;

    const asyncFix = fixAsyncWithoutAwait(newContent);
    newContent = asyncFix.content;
    result.changes += asyncFix.changes;

    // Only write if changes were made
    if (result.changes > 0) {
      await fs.writeFile(filePath, newContent);
    }
  } catch (error) {
    result.errors.push(`${error}`);
  }

  return result;
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Starting ESLint fixes...\n');

  // Find all TypeScript files
  const files = await glob('src/**/*.ts', {
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**']
  });

  console.log(`Found ${files.length} TypeScript files to process\n`);

  let totalChanges = 0;
  const errors: string[] = [];

  // Process files in batches
  const BATCH_SIZE = 10;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(processFile));

    for (const result of results) {
      if (result.changes > 0) {
        console.log(`✅ ${result.file}: ${result.changes} changes`);
        totalChanges += result.changes;
      }
      errors.push(...result.errors);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`- Total files processed: ${files.length}`);
  console.log(`- Total changes made: ${totalChanges}`);
  if (errors.length > 0) {
    console.log(`- Errors encountered: ${errors.length}`);
    errors.forEach(err => console.error(`  ❌ ${err}`));
  }

  console.log('\n✨ Done! Now run npm run lint to see remaining issues.');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}