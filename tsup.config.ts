import { defineConfig } from 'tsup';
import { cp, chmod } from 'fs/promises';
import { existsSync } from 'fs';

export default defineConfig({
  // Entry points based on package.json exports and bin
  entry: {
    'src/index': 'src/index.ts',
    'apps/cli': 'apps/cli.ts',
    'apps/server': 'apps/server.ts',
    // Additional exports from package.json
    'service/tools/ops/registry': 'src/application/tools/ops/registry.ts',
    'domain/types/index': 'src/domain/types/index.ts',
    'service/config/config': 'src/config/index.ts'
  },
  
  // Output configuration
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  
  // TypeScript declarations
  dts: true,
  sourcemap: true,
  
  // Clean dist before building
  clean: true,
  
  // Don't bundle node_modules dependencies
  splitting: false,
  
  // External dependencies (not bundled)
  external: [
    '@kubernetes/client-node',
    '@modelcontextprotocol/sdk',
    'commander',
    'dockerode',
    'execa',
    'js-yaml',
    'nanoid',
    'pino',
    'zod',
    'zod-to-json-schema'
  ],
  
  // We'll handle shebang in onSuccess hook instead
  // banner: {},
  
  // Post-build hooks
  async onSuccess() {
    const { readFile, writeFile } = await import('fs/promises');
    
    // Add shebang to CLI file
    const cliPath = 'dist/apps/cli.js';
    if (existsSync(cliPath)) {
      const content = await readFile(cliPath, 'utf-8');
      if (!content.startsWith('#!/usr/bin/env node')) {
        await writeFile(cliPath, `#!/usr/bin/env node\n${content}`);
      }
      // Make CLI executable
      await chmod(cliPath, 0o755)
        .catch((err) => console.warn('Warning: Could not make CLI executable:', err.message));
    }
    
    // Copy AI prompt templates if they exist
    const templatesSource = 'src/infrastructure/ai/prompts/templates';
    const templatesDest = 'dist/infrastructure/ai/prompts/templates';
    
    if (existsSync(templatesSource)) {
      await cp(templatesSource, templatesDest, { recursive: true })
        .catch((err) => console.warn('Warning: Could not copy templates:', err.message));
    }
    
    console.log('✅ Build complete with assets copied');
  },
  
  // Node.js shims
  shims: true,
  
  // Keep function names for better debugging
  keepNames: true,
  
  // Don't minify by default (use --minify flag for production)
  minify: false,
});