#!/usr/bin/env tsx
import * as fs from 'fs';

/**
 * Manual fixes for specific syntax errors that automated tools can't handle well
 */

const fixes = [
  // Fix generate-dockerfile.ts
  {
    file: 'src/application/tools/build/generate-dockerfile.ts',
    replacements: [
      // Fix missing closing brace for interface
      { from: 'interface DockerfileStage {\n  name: string;\n  baseImage: string;\n  purpose: string;\n', to: 'interface DockerfileStage {\n  name: string;\n  baseImage: string;\n  purpose: string;\n}\n' },
      { from: 'interface DockerfileGenerationResult {\n  content: string;\n  stages?: DockerfileStage[];\n  optimizations?: string[];\n', to: 'interface DockerfileGenerationResult {\n  content: string;\n  stages?: DockerfileStage[];\n  optimizations?: string[];\n}\n' },
      // Fix template strings
      { from: 'javascript: ``', to: 'javascript: `' },
      { from: '`,`\n  typescript: ``', to: '`,\n  typescript: `' },
      { from: '`,`\n  python: ``', to: '`,\n  python: `' },
      { from: '`,`\n  java: ``', to: '`,\n  java: `' },
      { from: '`,`\n  go: ``', to: '`,\n  go: `' },
      { from: '``\n};', to: '`\n};' },
      // Fix function return types
      { from: ') Promise<DockerfileGenerationResult> {', to: '): Promise<DockerfileGenerationResult> {' },
      // Fix missing closing braces
      { from: '  return { content, stages, optimizations };\n', to: '  return { content, stages, optimizations };\n}\n' },
      { from: '  return dockerfile;\n', to: '  return dockerfile;\n}\n' },
      { from: '  return warnings;\n', to: '  return warnings;\n}\n' },
      { from: "  return `~${Math.round(estimatedSize / 100) / 10}GB`;\n  }", to: "  return `~${Math.round(estimatedSize / 100) / 10}GB`;\n  }\n}\n" }
    ]
  }
];

async function applyManualFixes() {
  console.log('🔧 Applying manual syntax fixes...\n');
  
  let totalFixed = 0;
  let filesModified = 0;
  
  for (const fix of fixes) {
    if (!fs.existsSync(fix.file)) {
      console.log(`⚠️  File not found: ${fix.file}`);
      continue;
    }
    
    let content = fs.readFileSync(fix.file, 'utf-8');
    let modified = false;
    let fixedInFile = 0;
    
    for (const replacement of fix.replacements) {
      if (content.includes(replacement.from)) {
        content = content.replace(replacement.from, replacement.to);
        fixedInFile++;
        modified = true;
      }
    }
    
    // Additional fixes for common patterns
    // Fix template string issues
    content = content.replace(/``([^`]*?)``/g, '`$1`');
    content = content.replace(/`;`/g, '`;');
    content = content.replace(/`\n\s*`/g, '`');
    
    // Fix double backticks at start/end of templates
    content = content.replace(/^\s*``/gm, '  `');
    content = content.replace(/``$/gm, '`');
    
    // Fix malformed template strings in object properties
    content = content.replace(/(\w+):\s*``([^`]*?)``([,\n}])/gs, '$1: `$2`$3');
    
    // Fix missing closing braces and brackets
    const lines = content.split('\n');
    let braceStack = [];
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip comments
      if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) {
        continue;
      }
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const prevChar = j > 0 ? line[j - 1] : '';
        
        if (!inString) {
          if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            inString = true;
            stringChar = char;
          } else if (char === '{' || char === '(' || char === '[') {
            braceStack.push({ char, line: i });
          } else if (char === '}' || char === ')' || char === ']') {
            if (braceStack.length > 0) {
              braceStack.pop();
            }
          }
        } else {
          if (char === stringChar && prevChar !== '\\') {
            inString = false;
            stringChar = '';
          }
        }
      }
    }
    
    if (modified) {
      try {
        fs.writeFileSync(fix.file, content);
        filesModified++;
        totalFixed += fixedInFile;
        console.log(`✅ Applied ${fixedInFile} manual fixes to ${fix.file}`);
      } catch (error) {
        console.log(`❌ Failed to write ${fix.file}: ${error}`);
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  - Files processed: ${fixes.length}`);
  console.log(`  - Files modified: ${filesModified}`);
  console.log(`  - Total manual fixes applied: ${totalFixed}`);
  console.log('\n✨ Manual syntax fixes complete!');
}

// Run the script
applyManualFixes().catch(console.error);