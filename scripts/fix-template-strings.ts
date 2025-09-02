#!/usr/bin/env tsx
import * as fs from 'fs';
import { glob } from 'glob';

/**
 * Script to fix malformed template string syntax introduced by previous fixes
 */

async function fixTemplateStrings() {
  console.log('🔧 Fixing template string syntax errors...\n');
  
  // Find files with TypeScript compilation errors
  const problemFiles = [
    'src/application/tools/build/generate-dockerfile.ts',
    'src/application/tools/build/generate-dockerfile-ext.ts',
    'src/infrastructure/ai/structured-sampler.ts',
    'src/infrastructure/ai/repository-analyzer.ts',
    'src/infrastructure/ai/validators/prompt-validator.ts',
    'src/infrastructure/ai/recovery-strategies.ts',
    'src/infrastructure/ai/mock-sampler.ts'
  ];
  
  let totalFixed = 0;
  let filesModified = 0;
  
  for (const file of problemFiles) {
    if (!fs.existsSync(file)) {
      console.log(`⚠️  File not found: ${file}`);
      continue;
    }
    
    let content = fs.readFileSync(file, 'utf-8');
    let modified = false;
    let fixedInFile = 0;
    
    const originalContent = content;
    
    // Fix 1: Template string literals that got malformed
    // Replace double backticks with proper template syntax
    content = content.replace(/``([^`]*?)``/gs, '`$1`');
    
    // Fix 2: Fix malformed template strings in object literals
    // Pattern: property: ``template`` -> property: `template`
    content = content.replace(/(\w+):\s*``([^`]*?)``([,\n}])/gs, '$1: `$2`$3');
    
    // Fix 3: Fix template strings that got split incorrectly
    content = content.replace(/`,`\s*([^:]*?):\s*``/g, '`,\n  $1: `');
    
    // Fix 4: Fix unterminated template strings at end of properties
    content = content.replace(/`([^`\n]*?)$/gm, (match, content) => {
      if (!content.includes('`')) {
        return `\`${content}\``;
      }
      return match;
    });
    
    // Fix 5: Fix malformed template strings in the middle of files
    const lines = content.split('\n');
    let inTemplate = false;
    let templateStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Count backticks in line
      const backticks = (line.match(/`/g) || []).length;
      
      // If we find an odd number of backticks, we might have a broken template
      if (backticks % 2 === 1) {
        if (!inTemplate) {
          inTemplate = true;
          templateStart = i;
        } else {
          inTemplate = false;
          templateStart = -1;
        }
      }
      
      // Fix common malformed patterns
      if (line.includes('``#') || line.includes('``FROM') || line.includes('``RUN')) {
        lines[i] = line.replace(/``/g, '`');
        fixedInFile++;
      }
      
      // Fix lines with invalid characters (common pattern from automation)
      if (line.match(/^\s*[^\w\s`"'/.*#-]/)) {
        // Remove or fix invalid leading characters
        const cleaned = line.replace(/^[^\w\s`"'/.*#-]+/, '');
        if (cleaned.trim()) {
          lines[i] = cleaned;
          fixedInFile++;
        } else {
          // Remove empty corrupted lines
          lines.splice(i, 1);
          i--;
          fixedInFile++;
        }
      }
    }
    
    content = lines.join('\n');
    
    // Fix 6: Ensure proper object syntax
    content = content.replace(/}\s*,\s*`/g, '},\n  ');
    content = content.replace(/`\s*,\s*(\w+):/g, '`,\n  $1:');
    
    if (content !== originalContent) {
      try {
        fs.writeFileSync(file, content);
        filesModified++;
        totalFixed += fixedInFile;
        console.log(`✅ Fixed ${fixedInFile} template string issues in ${file}`);
      } catch (error) {
        console.log(`❌ Failed to write ${file}: ${error}`);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  - Files processed: ${problemFiles.length}`);
  console.log(`  - Files modified: ${filesModified}`);
  console.log(`  - Total template issues fixed: ${totalFixed}`);
  console.log('\n✨ Template string fixes complete!');
}

// Run the script
fixTemplateStrings().catch(console.error);