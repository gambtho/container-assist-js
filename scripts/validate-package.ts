#!/usr/bin/env tsx
/**
 * Package Validation Script for Container Kit MCP
 * Validates build artifacts, exports, dependencies, and package integrity
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url);
const rootDir = join(__dirname, '..');

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

class PackageValidator {
  private errors: string[] = [];
  private warnings: string[] = [];
  private info: string[] = [];
  private startTime: number = Date.now();
  
  async validate(): Promise<ValidationResult> {
    console.log('🔍 Container Kit MCP Package Validation');
    console.log('═'.repeat(50);
    
    await this.checkBuildArtifacts();
    await this.checkTypeDefinitions();
    await this.checkModuleExports();
    await this.checkBinaryExecutable();
    await this.checkDependencies();
    await this.checkPackageJson();
    await this.runTests();
    await this.checkBundleSize();
    await this.validateDocumentation();
    await this.checkSecurityVulnerabilities();
    
    return {
      passed: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info
    };
  }
  
  private async checkBuildArtifacts(): Promise<void> {
    console.log('📦 Checking build artifacts...');
    
    const requiredFiles = [
      'dist/index.js',
      'dist/index.d.ts',
      'dist/bin/cli.js',
      'dist/service/tools/registry.js',
      'dist/service/tools/registry.d.ts',
      'dist/service/dependencies.js',
      'dist/service/dependencies.d.ts',
      'dist/service/config/config.js',
      'dist/infrastructure/core/logger.js',
      'dist/infrastructure/core/logger.d.ts'
    ];
    
    const missingFiles: string[] = [];
    const foundFiles: string[] = [];
    
    for (const file of requiredFiles) {
      const filePath = join(rootDir, file);
      if (!existsSync(filePath)) {
        missingFiles.push(file);
      } else {
        foundFiles.push(file);
        
        // Check file size (should not be empty)
        const stats = statSync(filePath);
        if (stats.size === 0) {
          this.warnings.push(`File is empty: ${file}`);
        }
      }
    }
    
    if (missingFiles.length > 0) {
      this.errors.push(`Missing required build files: ${missingFiles.join(', ')}`);
    } else {
      this.info.push(`✓ All ${requiredFiles.length} required files present`);
    }
    
    // Check for source maps
    const sourceMapFiles = foundFiles
      .filter(f => f.endsWith('.js'))
      .map(f => f + '.map')
      .filter(f => existsSync(join(rootDir, f));
    
    if (sourceMapFiles.length > 0) {
      this.info.push(`✓ ${sourceMapFiles.length} source maps generated`);
    }
  }
  
  private async checkTypeDefinitions(): Promise<void> {
    console.log('📝 Checking TypeScript definitions...');
    
    try {
      // Check TypeScript compilation without emitting files
      execSync('tsc --noEmit --project tsconfig.json', { 
        stdio: 'pipe',
        cwd: rootDir 
      });
      this.info.push('✓ TypeScript compilation successful');
    } catch (error) {
      this.errors.push('TypeScript compilation failed');
      
      if (error instanceof Error && 'stdout' in error) {
        const output = (error as any).stdout?.toString() || '';
        if (output) {
          this.errors.push(`TypeScript errors:\n${output}`);
        }
      }
    }
    
    // Check that .d.ts files exist for all .js files
    const jsFiles = this.findFiles(join(rootDir, 'dist'), '.js');
    const missingDts: string[] = [];
    
    for (const jsFile of jsFiles) {
      const dtsFile = jsFile.replace('.js', '.d.ts');
      if (!existsSync(dtsFile)) {
        missingDts.push(jsFile.replace(rootDir + '/', '');
      }
    }
    
    if (missingDts.length > 0) {
      this.warnings.push(`Missing .d.ts files for: ${missingDts.join(', ')}`);
    }
  }
  
  private async checkModuleExports(): Promise<void> {
    console.log('📤 Checking module exports...');
    
    try {
      // Test main export
      const mainModule = join(rootDir, 'dist/index.js');
      const mainExports = await import(mainModule);
      
      const expectedExports = [
        'ContainerKitMCPServer',
        'Config', 
        'Dependencies',
        'ToolRegistry'
      ];
      
      const missingExports: string[] = [];
      for (const exportName of expectedExports) {
        if (!(exportName in mainExports)) {
          missingExports.push(exportName);
        }
      }
      
      if (missingExports.length > 0) {
        this.errors.push(`Missing main exports: ${missingExports.join(', ')}`);
      } else {
        this.info.push('✓ All main exports present');
      }
      
      // Test that ContainerKitMCPServer can be instantiated
      const { ContainerKitMCPServer, Config } = mainExports;
      if (ContainerKitMCPServer && Config) {
        const testConfig = new Config({ nodeEnv: 'test' });
        const server = new ContainerKitMCPServer(testConfig);
        
        if (typeof server.start === 'function') {
          this.info.push('✓ Main server class instantiates correctly');
        } else {
          this.warnings.push('Server class missing start method');
        }
      }
      
    } catch (error) {
      this.errors.push(`Module export validation failed: ${error}`);
    }
  }
  
  private async checkBinaryExecutable(): Promise<void> {
    console.log('🔐 Checking binary executable...');
    
    const cliPath = join(rootDir, 'dist/bin/cli.js');
    
    if (!existsSync(cliPath)) {
      this.errors.push('CLI binary not found at dist/bin/cli.js');
      return;
    }
    
    try {
      // Check that CLI shows version
      const output = execSync(`node "${cliPath}" --version`, { 
        encoding: 'utf-8',
        cwd: rootDir,
        timeout: 5000
      });
      
      if (output.trim() === '2.0.0') {
        this.info.push('✓ CLI version command works');
      } else {
        this.warnings.push(`CLI version mismatch: expected 2.0.0, got ${output.trim()}`);
      }
      
      // Check that CLI shows help
      const helpOutput = execSync(`node "${cliPath}" --help`, {
        encoding: 'utf-8', 
        cwd: rootDir,
        timeout: 5000
      });
      
      if (helpOutput.includes('container-kit-mcp')) {
        this.info.push('✓ CLI help command works');
      } else {
        this.warnings.push('CLI help output missing expected content');
      }
      
    } catch (error) {
      this.errors.push('CLI binary failed to execute or timed out');
    }
  }
  
  private async checkDependencies(): Promise<void> {
    console.log('📚 Checking dependencies...');
    
    try {
      // Check for dependency issues
      execSync('npm ls --depth=0', { 
        stdio: 'pipe',
        cwd: rootDir 
      });
      this.info.push('✓ No dependency conflicts detected');
    } catch (error) {
      this.warnings.push('Some dependencies have issues (run "npm ls" for details)');
    }
    
    // Check for security vulnerabilities
    try {
      const auditOutput = execSync('npm audit --json', {
        encoding: 'utf-8',
        cwd: rootDir
      });
      
      const audit = JSON.parse(auditOutput);
      const { vulnerabilities } = audit;
      
      if (vulnerabilities && Object.keys(vulnerabilities).length > 0) {
        const critical = Object.values(vulnerabilities).filter((v: any) => 
          v.severity === 'critical'
        ).length;
        const high = Object.values(vulnerabilities).filter((v: any) => 
          v.severity === 'high'
        ).length;
        
        if (critical > 0 || high > 0) {
          this.errors.push(`Security vulnerabilities: ${critical} critical, ${high} high`);
        } else {
          this.warnings.push(`${Object.keys(vulnerabilities).length} low/moderate vulnerabilities`);
        }
      } else {
        this.info.push('✓ No security vulnerabilities detected');
      }
      
    } catch (error) {
      this.warnings.push('Could not check security vulnerabilities');
    }
  }
  
  private async checkPackageJson(): Promise<void> {
    console.log('📄 Validating package.json...');
    
    try {
      const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8');
      
      const requiredFields = ['name', 'version', 'description', 'main', 'types', 'bin'];
      const missingFields = requiredFields.filter(field => !(field in packageJson);
      
      if (missingFields.length > 0) {
        this.errors.push(`Missing package.json fields: ${missingFields.join(', ')}`);
      }
      
      // Check exports configuration
      if (!packageJson.exports) {
        this.warnings.push('No exports field in package.json');
      } else {
        const hasMainExport = '.' in packageJson.exports;
        if (!hasMainExport) {
          this.errors.push('Missing main export in package.json exports');
        }
      }
      
      // Check bin configuration
      if (!packageJson.bin) {
        this.errors.push('Missing bin field in package.json');
      } else {
        const binPath = packageJson.bin['container-kit-mcp'];
        if (!binPath || !existsSync(join(rootDir, binPath))) {
          this.errors.push('Binary path in package.json does not exist');
        }
      }
      
      // Check files field
      if (!packageJson.files || !Array.isArray(packageJson.files)) {
        this.warnings.push('Missing or invalid files field in package.json');
      } else if (!packageJson.files.includes('dist/**/*')) {
        this.warnings.push('dist directory not included in package files');
      }
      
      this.info.push('✓ package.json structure validated');
      
    } catch (error) {
      this.errors.push('Failed to parse or validate package.json');
    }
  }
  
  private async runTests(): Promise<void> {
    console.log('🧪 Running test suite...');
    
    try {
      execSync('npm test', { 
        stdio: 'pipe',
        cwd: rootDir,
        timeout: 60000 // 1 minute timeout
      });
      this.info.push('✓ All tests passed');
    } catch (error) {
      this.errors.push('Tests failed');
    }
  }
  
  private async checkBundleSize(): Promise<void> {
    console.log('📏 Checking bundle size...');
    
    const maxSize = 20 * 1024 * 1024; // 20MB
    const distSize = this.getDirectorySize(join(rootDir, 'dist');
    
    this.info.push(`Bundle size: ${this.formatBytes(distSize)}`);
    
    if (distSize > maxSize) {
      this.warnings.push(`Bundle size (${this.formatBytes(distSize)}) exceeds recommended maximum (${this.formatBytes(maxSize)})`);
    }
    
    // Check individual large files
    const largeFiles = this.findLargeFiles(join(rootDir, 'dist'), 1024 * 1024); // > 1MB
    if (largeFiles.length > 0) {
      this.warnings.push(`Large files detected: ${largeFiles.map(f => 
        `${f.path.replace(rootDir, '.')} (${this.formatBytes(f.size)})`
      ).join(', ')}`);
    }
  }
  
  private async validateDocumentation(): Promise<void> {
    console.log('📖 Validating documentation...');
    
    const requiredDocs = ['README.md', 'LICENSE', 'CHANGELOG.md'];
    const missingDocs: string[] = [];
    
    for (const doc of requiredDocs) {
      const docPath = join(rootDir, doc);
      if (!existsSync(docPath)) {
        missingDocs.push(doc);
      } else {
        // Check if file has content
        const content = readFileSync(docPath, 'utf-8');
        if (content.trim().length < 50) {
          this.warnings.push(`${doc} appears to be empty or very short`);
        }
      }
    }
    
    if (missingDocs.length > 0) {
      this.warnings.push(`Missing documentation: ${missingDocs.join(', ')}`);
    } else {
      this.info.push('✓ All required documentation present');
    }
  }
  
  private async checkSecurityVulnerabilities(): Promise<void> {
    console.log('🔒 Security validation...');
    
    // Check for common security issues in built files
    const jsFiles = this.findFiles(join(rootDir, 'dist'), '.js');
    const securityIssues: string[] = [];
    
    for (const jsFile of jsFiles) {
      const content = readFileSync(jsFile, 'utf-8');
      
      // Check for potential secret leaks
      const secretPatterns = [
        /password\s*[:=]\s*['"][^'"]+['"]/gi,
        /token\s*[:=]\s*['"][^'"]+['"]/gi,
        /key\s*[:=]\s*['"][^'"]+['"]/gi,
        /secret\s*[:=]\s*['"][^'"]+['"]/gi
      ];
      
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          securityIssues.push(`Potential secret in ${jsFile.replace(rootDir, '.')}`);
        }
      }
    }
    
    if (securityIssues.length > 0) {
      this.errors.push(`Security issues detected: ${securityIssues.join(', ')}`);
    } else {
      this.info.push('✓ No obvious security issues in built files');
    }
  }
  
  private findFiles(dir: string, extension: string): string[] {
    const files: string[] = [];
    
    if (!existsSync(dir)) return files;
    
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stats = statSync(entryPath);
      
      if (stats.isDirectory()) {
        files.push(...this.findFiles(entryPath, extension);
      } else if (entry.endsWith(extension)) {
        files.push(entryPath);
      }
    }
    
    return files;
  }
  
  private findLargeFiles(dir: string, sizeThreshold: number): Array<{path: string, size: number}> {
    const largeFiles: Array<{path: string, size: number}> = [];
    
    if (!existsSync(dir)) return largeFiles;
    
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const stats = statSync(entryPath);
      
      if (stats.isDirectory()) {
        largeFiles.push(...this.findLargeFiles(entryPath, sizeThreshold);
      } else if (stats.size > sizeThreshold) {
        largeFiles.push({ path: entryPath, size: stats.size });
      }
    }
    
    return largeFiles;
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
  const validator = new PackageValidator();
  
  try {
    const result = await validator.validate();
    
    const duration = Date.now() - validator['startTime'];
    
    console.log('\n📊 Validation Results');
    console.log('═'.repeat(50);
    console.log(`⏱️  Validation Time: ${duration}ms`);
    
    if (result.info.length > 0) {
      console.log('\n✅ Information:');
      result.info.forEach(info => console.log(`  ${info}`);
    }
    
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warn => console.log(`  • ${warn}`);
    }
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(err => console.log(`  • ${err}`);
    }
    
    console.log(`\n${result.passed ? '✅' : '❌'} Validation ${result.passed ? 'PASSED' : 'FAILED'}`);
    
    if (result.passed) {
      console.log('📦 Package is ready for publication!');
    } else {
      console.log('🚫 Package has issues that need to be resolved');
    }
    
    process.exit(result.passed ? 0 : 1);
    
  } catch (error) {
    console.error('💥 Validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PackageValidator };