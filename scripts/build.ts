#!/usr/bin/env tsx
/**
 * Build script for Container Kit MCP
 * Handles TypeScript compilation, asset copying, and validation
 */

import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url);
const rootDir = join(__dirname, '..');

interface BuildOptions {
  clean?: boolean;
  watch?: boolean;
  validate?: boolean;
}

class BuildManager {
  private startTime: number = Date.now();
  
  constructor(private options: BuildOptions = {}) {}
  
  async build(): Promise<void> {
    console.log('🔨 Building Container Kit MCP Server...');
    console.log('═'.repeat(50);
    
    try {
      if (this.options.clean) {
        await this.clean();
      }
      
      await this.compileTypeScript();
      await this.copyAssets();
      await this.makeExecutable();
      
      if (this.options.validate) {
        await this.validateBuild();
      }
      
      await this.printBuildSummary();
      
    } catch (error) {
      console.error('❌ Build failed:', error);
      throw error;
    }
  }
  
  private async clean(): Promise<void> {
    console.log('🧹 Cleaning previous build...');
    
    const cleanDirs = ['dist', 'coverage', '.tsbuildinfo'];
    
    for (const dir of cleanDirs) {
      const dirPath = join(rootDir, dir);
      if (existsSync(dirPath)) {
        rmSync(dirPath, { recursive: true, force: true });
        console.log(`  ✓ Removed ${dir}`);
      }
    }
  }
  
  private async compileTypeScript(): Promise<void> {
    console.log('📝 Compiling TypeScript...');
    
    const tscCommand = this.options.watch 
      ? 'tsc --build tsconfig.build.json --watch --preserveWatchOutput'
      : 'tsc --build tsconfig.build.json';
    
    try {
      execSync(tscCommand, { 
        stdio: 'inherit',
        cwd: rootDir 
      });
      console.log('  ✓ TypeScript compilation successful');
    } catch (error) {
      throw new Error('TypeScript compilation failed');
    }
  }
  
  private async copyAssets(): Promise<void> {
    console.log('📋 Copying assets...');
    
    const assetCopies = [
      {
        src: 'src/infrastructure/ai/prompts/templates',
        dest: 'dist/infrastructure/ai/prompts/templates',
        required: false
      },
      {
        src: 'LICENSE',
        dest: 'dist/LICENSE',
        required: false
      },
      {
        src: 'README.md',
        dest: 'dist/README.md', 
        required: false
      },
      {
        src: 'CHANGELOG.md',
        dest: 'dist/CHANGELOG.md',
        required: false
      }
    ];
    
    for (const copy of assetCopies) {
      const srcPath = join(rootDir, copy.src);
      const destPath = join(rootDir, copy.dest);
      
      if (existsSync(srcPath)) {
        mkdirSync(dirname(destPath), { recursive: true });
        
        if (statSync(srcPath).isDirectory()) {
          this.copyDirectory(srcPath, destPath);
        } else {
          copyFileSync(srcPath, destPath);
        }
        
        console.log(`  ✓ Copied ${copy.src}`);
      } else if (copy.required) {
        throw new Error(`Required asset not found: ${copy.src}`);
      }
    }
  }
  
  private copyDirectory(src: string, dest: string): void {
    mkdirSync(dest, { recursive: true });
    
    const entries = readdirSync(src);
    for (const entry of entries) {
      const srcEntry = join(src, entry);
      const destEntry = join(dest, entry);
      
      if (statSync(srcEntry).isDirectory()) {
        this.copyDirectory(srcEntry, destEntry);
      } else {
        copyFileSync(srcEntry, destEntry);
      }
    }
  }
  
  private async makeExecutable(): Promise<void> {
    console.log('🔐 Setting executable permissions...');
    
    const cliPath = join(rootDir, 'dist/bin/cli.js');
    if (existsSync(cliPath)) {
      try {
        execSync(`chmod +x "${cliPath}"`, { cwd: rootDir });
        console.log('  ✓ CLI executable permissions set');
      } catch (error) {
        // Non-critical on Windows
        console.log('  ⚠️  Could not set executable permissions (Windows?)');
      }
    }
  }
  
  private async validateBuild(): Promise<void> {
    console.log('✅ Validating build...');
    
    const requiredFiles = [
      'dist/index.js',
      'dist/index.d.ts',
      'dist/bin/cli.js',
      'dist/service/tools/registry.js',
      'dist/service/tools/registry.d.ts',
      'dist/service/dependencies.js',
      'dist/service/config/config.js'
    ];
    
    const missingFiles: string[] = [];
    
    for (const file of requiredFiles) {
      const filePath = join(rootDir, file);
      if (!existsSync(filePath)) {
        missingFiles.push(file);
      }
    }
    
    if (missingFiles.length > 0) {
      throw new Error(`Missing required build files: ${missingFiles.join(', ')}`);
    }
    
    // Try to require the main module
    try {
      const mainModule = join(rootDir, 'dist/index.js');
      await import(mainModule);
      console.log('  ✓ Main module loads successfully');
    } catch (error) {
      throw new Error(`Main module failed to load: ${error}`);
    }
    
    console.log('  ✓ All required files present');
  }
  
  private async printBuildSummary(): Promise<void> {
    const buildTime = Date.now() - this.startTime;
    const distSize = this.getDirectorySize(join(rootDir, 'dist');
    
    console.log('\n✨ Build Summary');
    console.log('═'.repeat(30);
    console.log(`⏱️  Build Time: ${buildTime}ms`);
    console.log(`📦 Bundle Size: ${this.formatBytes(distSize)}`);
    console.log(`📁 Output Dir: ./dist`);
    
    // Count generated files
    const fileCount = this.countFiles(join(rootDir, 'dist');
    console.log(`📄 Generated Files: ${fileCount.total} (${fileCount.js} JS, ${fileCount.dts} .d.ts)`);
    
    console.log('\n✅ Build completed successfully!');
  }
  
  private getDirectorySize(dir: string): number {
    if (!existsSync(dir)) return 0;
    
    let totalSize = 0;
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stats = statSync(entryPath);
      
      if (stats.isDirectory()) {
        totalSize += this.getDirectorySize(entryPath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }
  
  private countFiles(dir: string): { total: number; js: number; dts: number } {
    if (!existsSync(dir)) return { total: 0, js: 0, dts: 0 };
    
    let total = 0;
    let js = 0;
    let dts = 0;
    
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stats = statSync(entryPath);
      
      if (stats.isDirectory()) {
        const subCounts = this.countFiles(entryPath);
        total += subCounts.total;
        js += subCounts.js;
        dts += subCounts.dts;
      } else {
        total++;
        const ext = extname(entry);
        if (ext === '.js') js++;
        else if (ext === '.d.ts') dts++;
      }
    }
    
    return { total, js, dts };
  }
  
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k);
    
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  const options: BuildOptions = {
    clean: args.includes('--clean') || args.includes('-c'),
    watch: args.includes('--watch') || args.includes('-w'),
    validate: args.includes('--validate') || args.includes('-v')
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Container Kit MCP Build Script

Usage: npm run build [options]
       tsx scripts/build.ts [options]

Options:
  -c, --clean      Clean before building
  -w, --watch      Watch mode (continuous build)
  -v, --validate   Validate build output
  -h, --help       Show this help

Examples:
  npm run build
  npm run build:watch
  tsx scripts/build.ts --clean --validate
`);
    process.exit(0);
  }
  
  const builder = new BuildManager(options);
  
  try {
    await builder.build();
    
    if (options.watch) {
      console.log('👀 Watching for changes...');
      // Watch mode will keep the process running
    }
    
  } catch (error) {
    console.error('💥 Build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { BuildManager };