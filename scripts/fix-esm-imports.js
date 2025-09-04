#!/usr/bin/env node

/**
 * Post-build script to add .js extensions to relative imports in compiled JavaScript
 * This is needed because TypeScript with moduleResolution: "bundler" doesn't add them,
 * but Node.js ES modules require them.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Fix relative imports and exports to add .js extension
  const patterns = [
    // import ... from './something'
    /(\bimport\s+(?:[^'"]*\s+from\s+)?['"])(\.[^'"]+)(?<!\.js)(['"])/g,
    // export ... from './something'
    /(\bexport\s+(?:[^'"]*\s+from\s+)?['"])(\.[^'"]+)(?<!\.js)(['"])/g,
  ];

  for (const pattern of patterns) {
    content = content.replace(pattern, (match, before, importPath, after) => {
      // Skip if it's already a .js file or a directory import
      if (importPath.endsWith('.js') || importPath.endsWith('.json')) {
        return match;
      }
      modified = true;
      return `${before}${importPath}.js${after}`;
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${path.relative(process.cwd(), filePath)}`);
  }
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDirectory(filePath);
    } else if (file.endsWith('.js')) {
      fixImportsInFile(filePath);
    }
  }
}

// Fix all JavaScript files in dist directory
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  console.log('Fixing ESM imports in dist directory...');
  walkDirectory(distPath);
  console.log('ESM import fixes complete!');
} else {
  console.error('dist directory not found!');
  process.exit(1);
}