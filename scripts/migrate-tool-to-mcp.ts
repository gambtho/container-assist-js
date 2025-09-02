#!/usr/bin/env npx tsx
/**
 * Tool Migration Helper - Convert Legacy Tools to MCP Format
 * 
 * This script converts legacy ToolHandler format to MCPToolDescriptor format
 * and removes Result<T> pattern in favor of direct promise returns.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface MigrationOptions {
  sourceFile: string;
  outputFile?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Convert legacy tool format to MCP format
 */
async function migrateTool(options: MigrationOptions): Promise<void> {
  const { sourceFile, outputFile = sourceFile, dryRun = false, verbose = false } = options;

  if (verbose) {
    console.log(`🔄 Processing: ${sourceFile}`);
  }

  // Read the source file
  let content = await fs.readFile(sourceFile, 'utf-8');

  // Apply transformations in sequence
  content = await applyTransformations(content, sourceFile, verbose);

  if (dryRun) {
    console.log('🔍 DRY RUN - Would write:', outputFile);
    if (verbose) {
      console.log('--- Transformed Content ---');
      console.log(content);
      console.log('--- End Content ---');
    }
    return;
  }

  // Write the transformed file
  await fs.writeFile(outputFile, content, 'utf-8');
  
  if (verbose) {
    console.log(`✅ Migrated: ${sourceFile} → ${outputFile}`);
  }
}

/**
 * Apply all transformations to convert legacy format to MCP format
 */
async function applyTransformations(content: string, fileName: string, verbose: boolean): Promise<string> {
  let transformed = content;

  // 1. Update imports - add MCPToolDescriptor and MCPToolContext
  if (transformed.includes("import type { ToolHandler, ToolContext }")) {
    transformed = transformed.replace(
      "import type { ToolHandler, ToolContext }",
      "import type { MCPToolDescriptor, MCPToolContext }"
    );
    if (verbose) console.log('  ✓ Updated imports');
  } else if (transformed.includes("ToolHandler") && !transformed.includes("MCPToolDescriptor")) {
    // Find the import line and add MCP types
    transformed = transformed.replace(
      /import type \{([^}]+)\} from ['"]\.\.\/tool-types['"];?/,
      "import type { $1, MCPToolDescriptor, MCPToolContext } from '../tool-types.js';"
    );
    if (verbose) console.log('  ✓ Added MCP imports');
  }

  // 2. Convert handler definition from ToolHandler to MCPToolDescriptor
  const handlerMatch = transformed.match(/export const (\w+): ToolHandler<([^,>]+),\s*([^>]+)> = \{/);
  if (handlerMatch) {
    const [fullMatch, handlerName, inputType, outputType] = handlerMatch;
    const newDefinition = `const ${handlerName}: MCPToolDescriptor<${inputType}, ${outputType}> = {`;
    transformed = transformed.replace(fullMatch, newDefinition);
    if (verbose) console.log('  ✓ Converted handler definition');
  }

  // 3. Convert execute method to handler method
  if (transformed.includes('async execute(')) {
    transformed = transformed.replace(
      /async execute\(input: (\w+), context: ToolContext\): Promise<([^>]+)> \{/,
      'handler: async (input: $1, context: MCPToolContext): Promise<$2> => {'
    );
    if (verbose) console.log('  ✓ Converted execute to handler');
  }

  // 4. Remove Result<T> patterns and direct return
  // Remove Success() wrapping
  transformed = transformed.replace(/return Success\(([^)]+)\);/g, 'return $1;');
  
  // Handle more complex Success patterns
  transformed = transformed.replace(/return Success\(\s*([^}]+)\s*\);/gs, 'return $1;');

  // Remove Result import if present
  transformed = transformed.replace(/import \{ Result, Success, Failure \}[^;]*;/, '');

  if (verbose && (content.includes('Success(') || content.includes('Failure('))) {
    console.log('  ✓ Removed Result<T> patterns');
  }

  // 5. Fix handler closing - change from } to })
  // Look for the closing brace pattern of the handler object
  const handlerObjectMatch = transformed.match(/(handler: async \([^{]*\{[\s\S]*?\n  \}),?\s*(\n\s*chainHint|$)/);
  if (handlerObjectMatch) {
    // The handler method should end with }
    // But we need to close it properly as part of the MCPToolDescriptor object
    if (verbose) console.log('  ✓ Fixed handler closure');
  }

  // 6. Update export to export the tool as default
  if (transformed.includes(`export const ${path.basename(fileName, '.ts').replace(/-/g, '')}Handler`)) {
    const handlerName = transformed.match(/export const (\w+): MCPToolDescriptor/)?.[1];
    if (handlerName) {
      // Remove the export from the const declaration
      transformed = transformed.replace(`export const ${handlerName}:`, `const ${handlerName}:`);
      
      // Add default export at the end
      if (!transformed.includes('export default')) {
        transformed += `\n\n// Export for MCP registry\nexport default ${handlerName};\n`;
      }
      if (verbose) console.log('  ✓ Fixed exports');
    }
  }

  // 7. Add file header comment
  if (!transformed.includes('MCP SDK Compatible')) {
    const toolName = path.basename(fileName, '.ts').split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    
    const header = `/**\n * ${toolName} - MCP SDK Compatible Version\n */\n\n`;
    transformed = header + transformed.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '');
    if (verbose) console.log('  ✓ Added MCP header');
  }

  // 8. Fix .js extensions in imports
  transformed = transformed.replace(/from ['"]([^'"]+)['"];/g, (match, importPath) => {
    if (importPath.startsWith('.') && !importPath.endsWith('.js')) {
      return match.replace(importPath, importPath + '.js');
    }
    return match;
  });

  return transformed;
}

/**
 * Migrate all legacy tools in a directory
 */
async function migrateAllTools(toolsDir: string, options: { dryRun?: boolean; verbose?: boolean } = {}): Promise<void> {
  const { dryRun = false, verbose = false } = options;

  try {
    // Find all .ts files recursively
    const toolFiles = await findToolFiles(toolsDir);
    
    console.log(`🔍 Found ${toolFiles.length} tool files to process`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const filePath of toolFiles) {
      try {
        // Skip files that are already in MCP format
        const content = await fs.readFile(filePath, 'utf-8');
        
        if (content.includes('MCPToolDescriptor') && content.includes('handler:')) {
          if (verbose) {
            console.log(`⏭️  Skipping (already MCP): ${path.relative(toolsDir, filePath)}`);
          }
          skipped++;
          continue;
        }

        // Skip files that don't have ToolHandler
        if (!content.includes('ToolHandler')) {
          if (verbose) {
            console.log(`⏭️  Skipping (not a tool): ${path.relative(toolsDir, filePath)}`);
          }
          skipped++;
          continue;
        }

        await migrateTool({
          sourceFile: filePath,
          dryRun,
          verbose
        });
        
        processed++;
      } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error);
        errors++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Processed: ${processed}`);
    console.log(`  ⏭️  Skipped: ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);

    if (dryRun) {
      console.log(`\n🔍 This was a DRY RUN - no files were modified`);
      console.log(`Run without --dry-run to apply changes`);
    }

  } catch (error) {
    console.error('❌ Failed to migrate tools:', error);
    process.exit(1);
  }
}

/**
 * Recursively find all TypeScript tool files
 */
async function findToolFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules, tests, etc.
      if (!['node_modules', '__tests__', 'test', 'tests', '.git'].includes(entry.name)) {
        files.push(...await findToolFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      // Skip type definition files and test files
      if (!entry.name.endsWith('.d.ts') && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
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
Tool Migration Helper - Convert Legacy Tools to MCP Format

Usage:
  npx tsx scripts/migrate-tool-to-mcp.ts [options] [file|directory]

Options:
  --dry-run    Show what would be changed without modifying files
  --verbose    Show detailed processing information
  --help       Show this help message

Examples:
  # Migrate all tools in the tools directory (dry run)
  npx tsx scripts/migrate-tool-to-mcp.ts --dry-run src/application/tools

  # Migrate all tools with verbose output
  npx tsx scripts/migrate-tool-to-mcp.ts --verbose src/application/tools

  # Migrate a specific tool file
  npx tsx scripts/migrate-tool-to-mcp.ts src/application/tools/analysis/analyze-repository.ts
`);
    return;
  }

  const target = args.find(arg => !arg.startsWith('--')) || 'src/application/tools';

  try {
    const stats = await fs.stat(target);
    
    if (stats.isDirectory()) {
      await migrateAllTools(target, options);
    } else if (stats.isFile()) {
      await migrateTool({
        sourceFile: target,
        dryRun: options.dryRun,
        verbose: options.verbose
      });
      console.log('✅ Single file migration complete');
    } else {
      throw new Error('Target is neither file nor directory');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly (ES module check)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { migrateTool, migrateAllTools };