#!/usr/bin/env npx tsx
/**
 * Convert class-based tools to simple MCPToolDescriptor format
 * This fixes tools that use BaseMCPToolDescriptor classes
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

interface ConvertOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

/**
 * Convert a class-based tool to descriptor format
 */
async function convertClassTool(filePath: string, options: ConvertOptions = {}): Promise<void> {
  const { dryRun = false, verbose = false } = options;
  
  if (verbose) {
    console.log(`🔧 Converting: ${filePath}`);
  }

  let content = await fs.readFile(filePath, 'utf-8');
  
  // Check if this is a class-based tool that needs conversion
  if (!content.includes('BaseMCPToolDescriptor') && !content.includes('extends Base')) {
    if (verbose) console.log('  ⏭️  Not a class-based tool, skipping');
    return;
  }

  let modified = false;

  // 1. Remove BaseToolHandler import
  content = content.replace(/import \{ BaseToolHandler[^}]*\} from [^;]+;?\n?/g, '');
  content = content.replace(/import [^{]*BaseToolHandler[^}]*from [^;]+;?\n?/g, '');
  
  // 2. Add MCPToolDescriptor import if missing
  if (!content.includes('MCPToolDescriptor')) {
    content = content.replace(
      /import type \{([^}]+)\} from ['"][^'"]*tool-types['"];?/,
      "import type { $1, MCPToolDescriptor, MCPToolContext } from '../tool-types.js';"
    );
  }

  // 3. Convert class definition to const
  const classMatch = content.match(/export class (\w+) extends Base\w+<([^,>]+),\s*([^>]+)>/);
  if (classMatch) {
    const [fullMatch, className, inputType, outputType] = classMatch;
    
    // Extract the tool name from class name
    const toolName = className.replace(/Tool$/, '').toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2');
    
    // Replace class definition with descriptor
    const newDefinition = `const ${toolName}Tool: MCPToolDescriptor<${inputType}, ${outputType}> = {
  name: '${toolName}',
  description: '', // Will be filled from class
  category: 'workflow',
  inputSchema: undefined!, // Will be filled from class
  outputSchema: undefined!, // Will be filled from class`;
    
    content = content.replace(fullMatch, newDefinition);
    modified = true;
    
    if (verbose) console.log('  ✓ Converted class definition to descriptor');
  }

  // 4. Convert get inputSchema() to inputSchema property
  content = content.replace(/get inputSchema\(\) \{\s*return ([^;]+);\s*\}/s, 'inputSchema: $1,');
  
  // 5. Convert get outputSchema() to outputSchema property
  content = content.replace(/override get outputSchema\(\) \{\s*return ([^;]+);\s*\}/s, 'outputSchema: $1,');
  content = content.replace(/get outputSchema\(\) \{\s*return ([^;]+);\s*\}/s, 'outputSchema: $1,');

  // 6. Convert async handler method to handler property
  const handlerMatch = content.match(/async handler\(([^)]+)\): Promise<[^>]+> \{([\s\S]*?)\n  \}/);
  if (handlerMatch) {
    const [fullMatch, params, body] = handlerMatch;
    const newHandler = `handler: async (${params}, context: MCPToolContext): Promise<${outputType}> => {${body}
  }`;
    content = content.replace(fullMatch, newHandler);
    modified = true;
    
    if (verbose) console.log('  ✓ Converted handler method');
  }

  // 7. Convert chainHint getter to property
  const chainHintMatch = content.match(/override get chainHint\(\)[^{]*\{([\s\S]*?)\n  \}/);
  if (chainHintMatch) {
    const [fullMatch, body] = chainHintMatch;
    content = content.replace(fullMatch, `chainHint: {${body}
  }`);
    modified = true;
  }

  // 8. Replace this.logger with context.logger
  content = content.replace(/this\.logger/g, 'context.logger');
  
  // 9. Replace this.services with context
  content = content.replace(/this\.services\.session/g, 'context.sessionService');
  content = content.replace(/this\.services\.docker/g, 'context.dockerService');
  content = content.replace(/this\.services\.kubernetes/g, 'context.kubernetesService');
  content = content.replace(/this\.services\.ai/g, 'context.aiService');
  content = content.replace(/this\.services\.progress/g, 'context.progressEmitter');

  // 10. Remove class closing brace and add descriptor closing
  content = content.replace(/\n\s*\}\s*$/, '\n};\n');

  // 11. Add default export
  if (classMatch) {
    const toolName = classMatch[1].replace(/Tool$/, '').toLowerCase().replace(/([a-z])([A-Z])/g, '$1_$2');
    content += `\n// Export for MCP registry\nexport default ${toolName}Tool;\n`;
  }

  // 12. Fix any remaining 'this.' references
  content = content.replace(/this\./g, '');

  if (!modified && verbose) {
    console.log('  ⏭️  No changes made');
    return;
  }

  if (dryRun) {
    console.log(`🔍 DRY RUN - Would convert: ${filePath}`);
    return;
  }

  await fs.writeFile(filePath, content, 'utf-8');
  if (verbose) {
    console.log(`✅ Converted: ${filePath}`);
  }
}

/**
 * Convert all class-based tools in directory
 */
async function convertAllClassTools(dir: string, options: ConvertOptions = {}): Promise<void> {
  const { dryRun = false, verbose = false } = options;
  
  console.log(`🔧 Converting class-based tools in: ${dir}`);
  
  const files = [
    'src/application/tools/analysis/analyze-repository-v2.ts',
    'src/application/tools/build/build-image-v2.ts',
    'src/application/tools/build/generate-dockerfile-v2.ts',
    'src/application/tools/build/push-image-v2.ts',
    'src/application/tools/build/scan-image-v2.ts',
    'src/application/tools/build/tag-image-v2.ts'
  ];

  let processed = 0;
  let errors = 0;

  for (const filePath of files) {
    try {
      const exists = await fs.access(filePath).then(() => true, () => false);
      if (!exists) {
        if (verbose) console.log(`⏭️  Skipping non-existent: ${filePath}`);
        continue;
      }
      
      await convertClassTool(filePath, options);
      processed++;
    } catch (error) {
      console.error(`❌ Error converting ${filePath}:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Conversion Summary:`);
  console.log(`  ✅ Processed: ${processed}`);
  console.log(`  ❌ Errors: ${errors}`);

  if (dryRun) {
    console.log(`\n🔍 This was a DRY RUN - no files were modified`);
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
Class Tool to Descriptor Converter

Usage:
  npx tsx scripts/convert-class-tools-to-descriptors.ts [options]

Options:
  --dry-run    Show what would be converted without modifying files
  --verbose    Show detailed processing information  
  --help       Show this help message

Examples:
  # Convert all class tools (dry run)
  npx tsx scripts/convert-class-tools-to-descriptors.ts --dry-run

  # Convert all class tools with verbose output
  npx tsx scripts/convert-class-tools-to-descriptors.ts --verbose
`);
    return;
  }

  try {
    await convertAllClassTools('src/application/tools', options);
    console.log('✅ Class tool conversion complete');
  } catch (error) {
    console.error('❌ Conversion failed:', error);
    process.exit(1);
  }
}

// Run if called directly (ES module check)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main().catch(console.error);
}

export { convertClassTool, convertAllClassTools };