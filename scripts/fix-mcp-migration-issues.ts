#!/usr/bin/env npx tsx
/**
 * Fix common MCP migration issues
 * - Replace ToolContext with MCPToolContext
 * - Replace dockerClient with dockerService
 * - Fix onProgress usage patterns
 * - Remove unused imports
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface FixOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Fix all migration issues in a file
 */
async function fixMigrationIssues(filePath: string, options: FixOptions = {}): Promise<void> {
  const { dryRun = false, verbose = false } = options;
  
  if (verbose) {
    console.log(`🔧 Fixing: ${filePath}`);
  }

  let content = await fs.readFile(filePath, 'utf-8');
  let modified = false;

  // Fix 1: Replace remaining ToolContext with MCPToolContext
  if (content.includes('ToolContext') && !content.includes('MCPToolContext')) {
    content = content.replace(/ToolContext/g, 'MCPToolContext');
    modified = true;
    if (verbose) console.log('  ✓ Fixed ToolContext references');
  }

  // Fix 2: Replace dockerClient with dockerService
  if (content.includes('dockerClient')) {
    content = content.replace(/dockerClient/g, 'dockerService');
    modified = true;
    if (verbose) console.log('  ✓ Fixed dockerClient references');
  }

  // Fix 3: Remove onProgress from context destructuring if present
  const onProgressPattern = /, onProgress/g;
  if (content.match(onProgressPattern)) {
    content = content.replace(onProgressPattern, '');
    modified = true;
    if (verbose) console.log('  ✓ Fixed onProgress destructuring');
  }

  // Fix 4: Remove unused import lines that cause errors
  const unusedImportPatterns = [
    /import .* from .*ToolHandler.*/g,
    /import .* from .*ToolContext.*/g,
    /import \{ ToolHandler \}.*$/gm,
    /import \{ ToolContext \}.*$/gm,
    /import \{ Result, Success, Failure \}.*$/gm
  ];

  for (const pattern of unusedImportPatterns) {
    if (content.match(pattern)) {
      content = content.replace(pattern, '');
      modified = true;
      if (verbose) console.log('  ✓ Removed unused imports');
    }
  }

  // Fix 5: Fix any remaining ToolHandler type references
  if (content.includes('ToolHandler<')) {
    content = content.replace(/ToolHandler</g, 'MCPToolDescriptor<');
    modified = true;
    if (verbose) console.log('  ✓ Fixed ToolHandler type references');
  }

  // Fix 6: Fix execute method references to handler
  const executePattern = /execute\s*\(/g;
  if (content.match(executePattern)) {
    content = content.replace(executePattern, 'handler(');
    modified = true;
    if (verbose) console.log('  ✓ Fixed execute method calls');
  }

  // Fix 7: Add missing default exports if missing
  if (content.includes('MCPToolDescriptor') && !content.includes('export default')) {
    // Find the tool descriptor variable name
    const toolDescriptorMatch = content.match(/const (\w+): MCPToolDescriptor/);
    if (toolDescriptorMatch) {
      const toolName = toolDescriptorMatch[1];
      content += `\n\n// Export for MCP registry\nexport default ${toolName};\n`;
      modified = true;
      if (verbose) console.log('  ✓ Added default export');
    }
  }

  if (!modified) {
    if (verbose) console.log('  ⏭️  No changes needed');
    return;
  }

  if (dryRun) {
    console.log(`🔍 DRY RUN - Would fix: ${filePath}`);
    return;
  }

  await fs.writeFile(filePath, content, 'utf-8');
  if (verbose) {
    console.log(`✅ Fixed: ${filePath}`);
  }
}

/**
 * Find all TypeScript files in tools directory
 */
async function findToolFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && !['node_modules', '__tests__', '.git'].includes(entry.name)) {
      files.push(...await findToolFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Fix all migration issues in tools directory
 */
async function fixAllMigrationIssues(toolsDir: string, options: FixOptions = {}): Promise<void> {
  const { dryRun = false, verbose = false } = options;
  
  console.log(`🔧 Fixing MCP migration issues in: ${toolsDir}`);
  
  try {
    const toolFiles = await findToolFiles(toolsDir);
    console.log(`🔍 Found ${toolFiles.length} files to process`);

    let processed = 0;
    let errors = 0;

    for (const filePath of toolFiles) {
      try {
        await fixMigrationIssues(filePath, options);
        processed++;
      } catch (error) {
        console.error(`❌ Error fixing ${filePath}:`, error);
        errors++;
      }
    }

    console.log(`\n📊 Fix Summary:`);
    console.log(`  ✅ Processed: ${processed}`);
    console.log(`  ❌ Errors: ${errors}`);

    if (dryRun) {
      console.log(`\n🔍 This was a DRY RUN - no files were modified`);
    }

  } catch (error) {
    console.error('❌ Failed to fix migration issues:', error);
    process.exit(1);
  }
}

/**
 * CLI Interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (options.help) {
    console.log(`
MCP Migration Issues Fix Tool

Usage:
  npx tsx scripts/fix-mcp-migration-issues.ts [options] [directory]

Options:
  --dry-run    Show what would be fixed without modifying files
  --verbose    Show detailed processing information  
  --help       Show this help message

Examples:
  # Fix all migration issues (dry run)
  npx tsx scripts/fix-mcp-migration-issues.ts --dry-run src/application/tools

  # Fix all migration issues with verbose output
  npx tsx scripts/fix-mcp-migration-issues.ts --verbose src/application/tools
`);
    return;
  }

  const targetDir = args.find(arg => !arg.startsWith('--')) || 'src/application/tools';

  try {
    await fixAllMigrationIssues(targetDir, options);
    console.log('✅ Migration fix complete');
  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  }
}

// Run if called directly (ES module check)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { fixMigrationIssues, fixAllMigrationIssues };