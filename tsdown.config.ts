import { defineConfig } from 'tsdown';
import { cp, chmod } from 'fs/promises';
import { existsSync } from 'fs';

const isTestBuild = process.env.BUILD_TEST_UTILS === 'true';

const mainEntries = {
  'src/index': 'src/index.ts',
  'apps/cli': 'apps/cli.ts',
  'apps/server': 'apps/server.ts',
  // Additional exports from package.json
  'service/tools/ops/registry': 'src/application/tools/ops/registry.ts',
  'domain/types/index': 'src/domain/types/index.ts',
  'service/config/config': 'src/config/index.ts'
};

const testEntries = {
  // Test utilities for integration scripts
  'test/utils/environment-detector': 'test/utils/environment-detector.ts',
  'test/utils/integration-test-utils': 'test/utils/integration-test-utils.ts',
  'test/utils/trivy-scanner-factory': 'test/utils/trivy-scanner-factory.ts'
};

export default defineConfig({
  // Entry points based on package.json exports and bin
  entry: isTestBuild ? { ...mainEntries, ...testEntries } : mainEntries,
  
  // Output configuration
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  
  // TypeScript declarations (generated separately for compatibility)
  dts: false,
  sourcemap: process.env.NODE_ENV === 'production',
  
  // Clean dist before building
  clean: true,
  
  // Enable code splitting for better performance
  splitting: true,
  
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
  
  
  // Keep function names for better debugging
  keepNames: true,
  
  // Don't minify by default (use --minify flag for production)
  minify: false,
});