#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

/**
 * Package Structure Validator for Container Kit MCP
 * Validates that the package is ready for NPM publishing
 */
class PackageStructureValidator {
  
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  
  async validate() {
    console.log('🔍 Validating Container Kit MCP package structure...\n');
    
    this.validatePackageJson();
    this.validateDistStructure();
    this.validateToolExports();
    this.validateBinaryStructure();
    this.validateTypeDefinitions();
    this.validateRequiredFiles();
    
    this.printResults();
    
    return this.errors.length === 0;
  }
  
  validatePackageJson() {
    console.log('📋 Validating package.json...');
    
    const packageJsonPath = join(rootDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
      this.errors.push('package.json not found');
      return;
    }
    
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    
    // Required fields
    const requiredFields = ['name', 'version', 'description', 'type', 'main', 'exports', 'bin', 'files'];
    for (const field of requiredFields) {
      if (!packageJson[field]) {
        this.errors.push(`package.json missing required field: ${field}`);
      }
    }
    
    // Validate version format (semver)
    const semverPattern = /^\d+\.\d+\.\d+(-[\w\.\-]+)?(\+[\w\.\-]+)?$/;
    if (!semverPattern.test(packageJson.version)) {
      this.errors.push(`Invalid version format: ${packageJson.version}`);
    }
    
    // Validate exports structure
    if (packageJson.exports) {
      const expectedExports = [
        '.', 
        './tools/start-workflow', 
        './tools/workflow-status',
        './tools/analyze-repository', 
        './tools/generate-dockerfile',
        './tools/build-image', 
        './tools/scan-image', 
        './tools/tag-image',
        './tools/push-image', 
        './tools/generate-k8s-manifests',
        './tools/prepare-cluster', 
        './tools/deploy-application',
        './tools/verify-deployment', 
        './tools/list-tools',
        './tools/ping', 
        './tools/server-status'
      ];
      
      for (const exportPath of expectedExports) {
        if (!packageJson.exports[exportPath]) {
          this.errors.push(`Missing export for: ${exportPath}`);
        }
      }
    }
    
    // Validate binary paths
    if (packageJson.bin) {
      for (const [binName, binPath] of Object.entries(packageJson.bin)) {
        const fullPath = join(rootDir, binPath);
        if (!existsSync(fullPath)) {
          this.errors.push(`Binary ${binName} path does not exist: ${binPath}`);
        }
      }
    }
    
    // Validate files list
    const requiredFiles = ['dist/', 'README.md', 'LICENSE'];
    if (packageJson.files) {
      for (const file of requiredFiles) {
        if (!packageJson.files.includes(file)) {
          this.warnings.push(`Consider including ${file} in files list`);
        }
      }
    }
    
    console.log('   ✅ package.json structure validated');
  }
  
  validateDistStructure() {
    console.log('📂 Validating dist/ directory structure...');
    
    if (!existsSync(distDir)) {
      this.errors.push('dist/ directory not found. Run npm run build first.');
      return;
    }
    
    // Required dist structure
    const requiredPaths = [
      'index.js',
      'index.d.ts',
      'bin/server.js',
      'service/tools/handlers/',
      'infrastructure/ai/prompts/templates/'
    ];
    
    for (const path of requiredPaths) {
      const fullPath = join(distDir, path);
      if (!existsSync(fullPath)) {
        this.errors.push(`Missing required dist file/directory: ${path}`);
      }
    }
    
    console.log('   ✅ Distribution structure validated');
  }
  
  validateToolExports() {
    console.log('🛠️  Validating tool exports...');
    
    const toolsDir = join(distDir, 'service/tools/handlers');
    if (!existsSync(toolsDir)) {
      this.errors.push('Tools handlers directory not found in dist');
      return;
    }
    
    // Check that we have handler files
    const expectedHandlers = [
      'analyze-enhanced.js',
      'dockerfile-generation-enhanced.js', 
      'build-image-enhanced.js',
      'scan-image-enhanced.js',
      'tag-push-enhanced.js',
      'k8s-generation-enhanced.js',
      'k8s-enhanced.js',
      'orchestration-enhanced.js',
      'workflow.js',
      'utility.js'
    ];
    
    for (const handler of expectedHandlers) {
      const handlerPath = join(toolsDir, handler);
      if (!existsSync(handlerPath)) {
        this.errors.push(`Missing tool handler: ${handler}`);
      } else {
        // Check that handler exports something
        try {
          const content = readFileSync(handlerPath, 'utf8');
          if (!content.includes('export')) {
            this.warnings.push(`Handler ${handler} might not export anything`);
          }
        } catch (error) {
          this.warnings.push(`Could not validate exports in ${handler}: ${error.message}`);
        }
      }
    }
    
    console.log('   ✅ Tool exports validated');
  }
  
  validateBinaryStructure() {
    console.log('🔧 Validating binary structure...');
    
    const serverBin = join(distDir, 'bin/server.js');
    if (!existsSync(serverBin)) {
      this.errors.push('Binary server.js not found in dist/bin/');
      return;
    }
    
    // Check shebang
    const content = readFileSync(serverBin, 'utf8');
    const lines = content.split('\n');
    if (!lines[0].startsWith('#!/usr/bin/env node')) {
      this.warnings.push('Binary missing Node.js shebang line');
    }
    
    // Check that it imports from relative paths (not absolute src paths)
    if (content.includes("from './src/")) {
      this.errors.push('Binary still contains absolute src/ imports - build may have failed');
    }
    
    console.log('   ✅ Binary structure validated');
  }
  
  validateTypeDefinitions() {
    console.log('📝 Validating type definitions...');
    
    const indexDts = join(distDir, 'index.d.ts');
    if (!existsSync(indexDts)) {
      this.errors.push('Main type definitions index.d.ts not found');
      return;
    }
    
    // Check that it contains expected exports
    const content = readFileSync(indexDts, 'utf8');
    const expectedExports = [
      'ToolResult',
      'ToolHandler', 
      'analyzeRepositoryHandler',
      'generateDockerfileHandler',
      'Dependencies',
      'ToolRegistry'
    ];
    
    for (const exportName of expectedExports) {
      if (!content.includes(exportName)) {
        this.warnings.push(`Type definition missing export: ${exportName}`);
      }
    }
    
    console.log('   ✅ Type definitions validated');
  }
  
  validateRequiredFiles() {
    console.log('📄 Validating required files...');
    
    const requiredFiles = [
      { name: 'README.md', required: true },
      { name: 'LICENSE', required: true },
      { name: 'CHANGELOG.md', required: false }
    ];
    
    for (const { name, required } of requiredFiles) {
      const filePath = join(rootDir, name);
      if (!existsSync(filePath)) {
        if (required) {
          this.errors.push(`Required file missing: ${name}`);
        } else {
          this.warnings.push(`Optional file missing: ${name}`);
        }
      } else {
        // Check file is not empty
        const content = readFileSync(filePath, 'utf8');
        if (content.trim().length === 0) {
          this.warnings.push(`File ${name} is empty`);
        }
      }
    }
    
    console.log('   ✅ Required files validated');
  }
  
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('PACKAGE STRUCTURE VALIDATION RESULTS');
    console.log('='.repeat(60));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('\n🎉 PERFECT! Package structure validation passed with no issues.');
      console.log('\n✅ Ready for NPM publishing!');
      return;
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS (must be fixed):');
      this.errors.forEach(error => console.log(`   • ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (should be addressed):');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    if (this.errors.length === 0) {
      console.log('\n✅ Package structure validation PASSED');
      console.log(`   ${this.warnings.length} warnings (non-blocking)`);
    } else {
      console.log('\n❌ Package structure validation FAILED');
      console.log(`   ${this.errors.length} errors, ${this.warnings.length} warnings`);
    }
    
    console.log('\n📦 Package Information:');
    console.log(`   Name: container-kit-mcp`);
    console.log(`   Version: 2.0.0-beta.1`);
    console.log(`   Distribution: ${this.getDistSize()}`);
    console.log(`   Tools: 15 (all categories)`);
  }
  
  getDistSize() {
    try {
      const files = this.getAllFiles(distDir);
      const totalSize = files.reduce((size, file) => {
        return size + statSync(file).size;
      }, 0);
      
      return this.formatBytes(totalSize);
    } catch (error) {
      return 'Unknown';
    }
  }
  
  getAllFiles(dir) {
    const files = [];
    
    const processDir = (currentDir) => {
      const items = readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = join(currentDir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          processDir(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    };
    
    if (existsSync(dir)) {
      processDir(dir);
    }
    
    return files;
  }
  
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Run validation
const validator = new PackageStructureValidator();
const isValid = await validator.validate();

if (!isValid) {
  process.exit(1);
}