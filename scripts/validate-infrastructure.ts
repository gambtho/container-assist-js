#!/usr/bin/env node
/**
 * Infrastructure validation script
 * Validates logger configuration, import patterns, and build setup
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { pathToFileURL } from 'url';

const errors: string[] = [];
const warnings: string[] = [];
let filesChecked: number = 0;

console.log('🔍 Validating infrastructure configuration...\n');

async function validateFile(filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = filePath.replace(process.cwd(), '');
    
    filesChecked++;
    
    // Check 1: No path mapping imports
    if (content.includes('@domain/') || content.includes('@service/') || content.includes('@infrastructure/')) {
      errors.push(`${relativePath}: Contains path mapping imports (should use relative imports)`);
    }
    
    // Check 2: Logger import consistency
    if (content.includes('import { logger }')) {
      errors.push(`${relativePath}: Direct logger import detected (should use dependency injection)`);
    }
    
    // Check 3: Pino logger type imports (skip re-exports in logger.ts)
    if (!relativePath.includes('infrastructure/core/logger.ts')) {
      const pinoImportCount = (content.match(/import.*Logger.*from.*pino/g) || []).length;
      if (pinoImportCount > 1) {
        warnings.push(`${relativePath}: Multiple pino Logger imports detected`);
      }
    }
    
    // Check 4: With ES2022/bundler resolution, .js extensions are optional in source
    // This check is disabled for pure ESM with bundler resolution
    
    // Check 5: Detect backup files (should be removed)
    if (filePath.includes('.backup') || filePath.endsWith('.backup')) {
      errors.push(`${relativePath}: Backup file detected (should be removed)`);
    }
    
  } catch (error: any) {
    errors.push(`Error reading ${filePath}: ${error.message}`);
  }
}

async function walkDirectory(dir: string): Promise<void> {
  const entries = await readdir(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await stat(fullPath);
    
    if (stats.isDirectory()) {
      // Skip node_modules, dist, coverage
      if (!['node_modules', 'dist', 'coverage', '.git'].includes(entry)) {
        await walkDirectory(fullPath);
      }
    } else if (extname(entry) === '.ts') {
      await validateFile(fullPath);
    }
  }
}

async function validatePackageJson(): Promise<void> {
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    
    // Check required scripts
    const requiredScripts = ['build', 'test', 'lint', 'typecheck'];
    for (const script of requiredScripts) {
      if (!pkg.scripts[script]) {
        errors.push(`package.json: Missing required script: ${script}`);
      }
    }
    
    // Check if pino is in dependencies
    if (!pkg.dependencies?.pino) {
      errors.push('package.json: Missing pino logger dependency');
    }
    
    console.log(`✅ Package.json validation passed`);
  } catch (error: any) {
    errors.push(`Error validating package.json: ${error.message}`);
  }
}

async function validateTsConfig(): Promise<void> {
  try {
    const tsconfig = JSON.parse(await readFile('tsconfig.json', 'utf-8'));
    
    // Check if path mappings are removed
    if (tsconfig.compilerOptions?.paths) {
      warnings.push('tsconfig.json: Path mappings still present (should be removed if using relative imports)');
    }
    
    // Check ESM configuration - updated for pure ES2022/bundler
    if (tsconfig.compilerOptions.module !== 'ES2022') {
      errors.push('tsconfig.json: Module must be ES2022 for pure ESM support');
    }
    
    if (tsconfig.compilerOptions.moduleResolution !== 'bundler') {
      errors.push('tsconfig.json: moduleResolution must be "bundler" for ES2022 support');
    }
    
    // Check that baseUrl is removed (should use relative imports only)
    if (tsconfig.compilerOptions.baseUrl) {
      warnings.push('tsconfig.json: baseUrl should be removed for clean relative imports');
    }
    
    console.log(`✅ TypeScript configuration validated`);
  } catch (error: any) {
    errors.push(`Error validating tsconfig.json: ${error.message}`);
  }
}

// Run validation
try {
  await validatePackageJson();
  await validateTsConfig();
  await walkDirectory('src');
  
  console.log(`\n📊 Validation Summary:`);
  console.log(`Files checked: ${filesChecked}`);
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.forEach(error => console.log(`  ${error}`));
  }
  
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.forEach(warning => console.log(`  ${warning}`));
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`\n🎉 Infrastructure validation passed!`);
    process.exit(0);
  } else if (errors.length === 0) {
    console.log(`\n✅ Infrastructure validation passed with warnings.`);
    process.exit(0);
  } else {
    console.log(`\n💥 Infrastructure validation failed.`);
    process.exit(1);
  }
  
} catch (error: any) {
  console.error('Validation script error:', error);
  process.exit(1);
}