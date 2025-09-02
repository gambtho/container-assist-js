#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

/**
 * Script to add .js extensions to all relative imports in TypeScript files
 * This is required for proper ES module resolution
 */

async function fixImportExtensions() {
  console.log('🔧 Starting import extension fixes...\n');
  
  // Find all TypeScript files
  const files = await glob('src/**/*.ts', {
    ignore: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**']
  });
  
  let totalFixed = 0;
  let filesModified = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let modified = false;
    let fixedInFile = 0;
    
    // Regular expression to match relative imports without .js extension
    // Matches: import ... from './path' or '../path' or '../../path' etc
    // But not: import ... from './path.js' or from 'package-name'
    const importRegex = /(import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)?(?:\s*,\s*(?:\{[^}]+\}|\w+))?\s+from\s+['"])(\.[^'"]+)(?<!\.js)(['"])/g;
    const exportRegex = /(export\s+(?:type\s+)?(?:\{[^}]+\}|\*)\s+from\s+['"])(\.[^'"]+)(?<!\.js)(['"])/g;
    
    let newContent = content;
    
    // Fix import statements
    newContent = newContent.replace(importRegex, (match, prefix, importPath, suffix) => {
      // Skip if it's already a .js file or external module
      if (importPath.endsWith('.json') || importPath.includes('node_modules')) {
        return match;
      }
      
      // Check if the path points to a directory with index.ts
      const absolutePath = path.resolve(path.dirname(file), importPath);
      const indexPath = path.join(absolutePath, 'index.ts');
      
      let fixedPath = importPath;
      if (fs.existsSync(indexPath)) {
        // Directory import - add /index.js
        fixedPath = `${importPath}/index.js`;
      } else if (fs.existsSync(`${absolutePath}.ts`) || fs.existsSync(`${absolutePath}.tsx`)) {
        // File import - add .js
        fixedPath = `${importPath}.js`;
      } else {
        // Default to adding .js
        fixedPath = `${importPath}.js`;
      }
      
      if (fixedPath !== importPath) {
        fixedInFile++;
        modified = true;
      }
      
      return `${prefix}${fixedPath}${suffix}`;
    });
    
    // Fix export statements
    newContent = newContent.replace(exportRegex, (match, prefix, exportPath, suffix) => {
      // Skip if it's already a .js file or external module
      if (exportPath.endsWith('.json') || exportPath.includes('node_modules')) {
        return match;
      }
      
      // Check if the path points to a directory with index.ts
      const absolutePath = path.resolve(path.dirname(file), exportPath);
      const indexPath = path.join(absolutePath, 'index.ts');
      
      let fixedPath = exportPath;
      if (fs.existsSync(indexPath)) {
        // Directory import - add /index.js
        fixedPath = `${exportPath}/index.js`;
      } else if (fs.existsSync(`${absolutePath}.ts`) || fs.existsSync(`${absolutePath}.tsx`)) {
        // File import - add .js
        fixedPath = `${exportPath}.js`;
      } else {
        // Default to adding .js
        fixedPath = `${exportPath}.js`;
      }
      
      if (fixedPath !== exportPath) {
        fixedInFile++;
        modified = true;
      }
      
      return `${prefix}${fixedPath}${suffix}`;
    });
    
    if (modified) {
      fs.writeFileSync(file, newContent);
      filesModified++;
      totalFixed += fixedInFile;
      console.log(`✅ Fixed ${fixedInFile} imports in ${file}`);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  - Files processed: ${files.length}`);
  console.log(`  - Files modified: ${filesModified}`);
  console.log(`  - Total imports fixed: ${totalFixed}`);
  console.log('\n✨ Import extension fixes complete!');
}

// Run the script
fixImportExtensions().catch(console.error);