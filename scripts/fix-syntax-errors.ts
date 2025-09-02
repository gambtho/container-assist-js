#!/usr/bin/env tsx
import * as fs from 'fs';
import { glob } from 'glob';

/**
 * Script to fix specific syntax errors introduced by previous automated fixes
 */

async function fixSyntaxErrors() {
  console.log('🔧 Fixing syntax errors...\n');
  
  // Find all TypeScript files
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
    
    // Fix 1: Fix incorrect await syntax
    content = content.replace(/this\.await\s+(\w+)/g, 'await this.$1');
    content = content.replace(/return this\.await\s+/g, 'return await this.');
    content = content.replace(/return\s+this\.await\s+/g, 'return await this.');
    
    // Fix 2: Fix unterminated string literals (common patterns)
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Count quotes in line - if odd number, likely unterminated
      const singleQuotes = (line.match(/'/g) || []).length;
      const doubleQuotes = (line.match(/"/g) || []).length;
      const backQuotes = (line.match(/`/g) || []).length;
      
      // Fix common unterminated string issues
      if (singleQuotes % 2 === 1 && !line.includes('don\'t') && !line.includes('can\'t')) {
        // Likely missing closing quote
        lines[i] = line + "'";
        fixedInFile++;
      } else if (doubleQuotes % 2 === 1) {
        // Likely missing closing quote  
        lines[i] = line + '"';
        fixedInFile++;
      } else if (backQuotes % 2 === 1) {
        // Likely missing closing backtick
        lines[i] = line + '`';
        fixedInFile++;
      }
      
      // Fix specific malformed patterns
      if (line.includes('?? null ?? null')) {
        lines[i] = line.replace('?? null ?? null', '?? null');
        fixedInFile++;
      }
      
      // Fix doubled operators
      if (line.includes('!= null ?? null')) {
        lines[i] = line.replace('!= null ?? null', '!= null');
        fixedInFile++;
      }
    }
    content = lines.join('\n');
    
    // Fix 3: Fix malformed conditional expressions
    content = content.replace(/if\s*\(\s*(\w+(?:\.\w+)*)\s*!!\s*\)/g, 'if ($1 != null)');
    content = content.replace(/if\s*\(\s*(\w+(?:\.\w+)*)\s*!!\s*null\s*\)/g, 'if ($1 != null)');
    
    // Fix 4: Fix double operators
    content = content.replace(/!!\s*null/g, '!= null');
    content = content.replace(/\?\?\s*null\s*\?\?\s*null/g, '?? null');
    
    // Fix 5: Fix malformed property access
    content = content.replace(/(\w+)\.(\w+)\.(\w+)!!(\w+)/g, '$1.$2.$3 != null && $1.$2.$3.$4');
    
    if (content !== originalContent) {
      try {
        fs.writeFileSync(file, content);
        filesModified++;
        totalFixed += fixedInFile;
        console.log(`✅ Fixed ${fixedInFile} syntax errors in ${file}`);
      } catch (error) {
        console.log(`❌ Failed to write ${file}: ${error}`);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  - Files processed: ${files.length}`);
  console.log(`  - Files modified: ${filesModified}`);
  console.log(`  - Total syntax errors fixed: ${totalFixed}`);
  console.log('\n✨ Syntax error fixes complete!');
}

// Run the script
fixSyntaxErrors().catch(console.error);