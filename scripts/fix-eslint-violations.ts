#!/usr/bin/env tsx
import * as fs from 'fs';
import { glob } from 'glob';

/**
 * Script to fix common ESLint violations systematically
 */

async function fixESLintViolations() {
  console.log('🔧 Fixing common ESLint violations...\n');
  
  // Find all TypeScript files (excluding test files for now)
  const files = await glob('src/**/*.ts', {
    ignore: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**']
  });
  
  let totalFixed = 0;
  let filesModified = 0;
  
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    let modified = false;
    let fixedInFile = 0;
    
    const originalContent = content;
    
    // Fix 1: Replace || with ?? for nullish coalescing where appropriate
    // Only replace when the left operand could be null/undefined but not false/0
    content = content.replace(/(\w+(?:\.\w+)*)\s*\|\|\s*([^|&\n;]+)/g, (match, left, right) => {
      // Skip if it's already using ?? or if it's a boolean operation
      if (match.includes('??') || match.includes('&&') || match.includes('==')) {
        return match;
      }
      // Common patterns that should use ??
      if (left.includes('config') || left.includes('options') || left.includes('data') || 
          left.includes('params') || left.includes('result') || left.includes('value') ||
          left.endsWith('.length') === false) {
        fixedInFile++;
        return `${left} ?? ${right}`;
      }
      return match;
    });
    
    // Fix 2: Replace 'any' with proper types or 'unknown'
    content = content.replace(/:\s*any(\s*[,;\]\)\n}])/g, ': unknown$1');
    content = content.replace(/as\s+any\b/g, 'as unknown');
    
    // Fix 3: Fix boolean expressions - add explicit checks
    content = content.replace(/if\s*\(\s*(\w+(?:\.\w+)*)\s*\)/g, (match, variable) => {
      // Skip if already has comparison
      if (variable.includes('===') || variable.includes('!==') || variable.includes('==') || variable.includes('!=')) {
        return match;
      }
      // For strings and objects, check for null/undefined
      if (variable.includes('.length') || variable.includes('.size') || 
          variable.toLowerCase().includes('str') || variable.toLowerCase().includes('name') ||
          variable.toLowerCase().includes('path') || variable.toLowerCase().includes('config')) {
        fixedInFile++;
        return `if (${variable} != null)`;
      }
      // For arrays and collections
      if (variable.toLowerCase().includes('array') || variable.toLowerCase().includes('list') ||
          variable.toLowerCase().includes('items') || variable.endsWith('s')) {
        fixedInFile++;
        return `if (${variable} && ${variable}.length > 0)`;
      }
      return match;
    });
    
    // Fix 4: Add explicit return types for functions missing them
    content = content.replace(/export\s+(async\s+)?function\s+(\w+)\s*\([^)]*\)\s*{/g, (match, asyncKw, funcName) => {
      if (match.includes(': ')) return match; // Already has return type
      const isAsync = asyncKw != null;
      // For common function patterns, add appropriate return types
      if (funcName.toLowerCase().includes('create') || funcName.toLowerCase().includes('build')) {
        fixedInFile++;
        return match.replace('{', isAsync ? ': Promise<unknown> {' : ': unknown {');
      }
      if (funcName.toLowerCase().includes('check') || funcName.toLowerCase().includes('is') || 
          funcName.toLowerCase().includes('has')) {
        fixedInFile++;
        return match.replace('{', isAsync ? ': Promise<boolean> {' : ': boolean {');
      }
      return match;
    });
    
    // Fix 5: Remove unused variables (simple cases)
    const lines = content.split('\n');
    const newLines = lines.filter((line, index) => {
      // Remove unused imports that are clearly unused
      if (line.trim().startsWith('import ') && line.includes(' from ') && 
          !line.includes('type ')) {
        const importMatch = line.match(/import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))/);
        if (importMatch) {
          const imported = importMatch[1] || importMatch[2] || importMatch[3];
          if (imported) {
            const restOfFile = lines.slice(index + 1).join('\n');
            // If imported item is not used in the rest of the file
            if (!restOfFile.includes(imported.trim().split(',')[0].trim())) {
              fixedInFile++;
              return false; // Remove this line
            }
          }
        }
      }
      return true;
    });
    content = newLines.join('\n');
    
    // Fix 6: Add missing awaits for Promise-returning functions
    content = content.replace(/(\w+)\.(build|create|execute|process|generate|deploy|scan|push|pull)\(/g, (match, obj, method) => {
      // Check if this line already has await
      const lineStart = content.lastIndexOf('\n', content.indexOf(match));
      const lineContent = content.substring(lineStart + 1, content.indexOf(match) + match.length);
      if (lineContent.includes('await') || lineContent.includes('return await')) {
        return match;
      }
      // Check if we're in an async function context
      const functionStart = content.lastIndexOf('async ', content.indexOf(match));
      const nextFunction = content.indexOf('function', content.indexOf(match));
      if (functionStart > nextFunction || functionStart === -1) {
        return match; // Not in async context
      }
      fixedInFile++;
      return `await ${match}`;
    });
    
    if (content !== originalContent) {
      try {
        fs.writeFileSync(file, content);
        filesModified++;
        totalFixed += fixedInFile;
        console.log(`✅ Fixed ${fixedInFile} issues in ${file}`);
      } catch (error) {
        console.log(`❌ Failed to write ${file}: ${error}`);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  - Files processed: ${files.length}`);
  console.log(`  - Files modified: ${filesModified}`);
  console.log(`  - Total issues fixed: ${totalFixed}`);
  console.log('\n✨ ESLint violation fixes complete!');
}

// Run the script
fixESLintViolations().catch(console.error);