#!/usr/bin/env tsx

/**
 * Test Maintenance and Automation Script
 * 
 * This script provides automated maintenance for the test suite:
 * - Updates test data fixtures
 * - Validates expected outputs
 * - Cleans up test artifacts
 * - Monitors test performance
 * - Updates baselines
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

interface TestMaintenanceConfig {
  fixtureUpdateInterval: number; // days
  performanceBaselineThreshold: number; // percentage
  cleanupRetentionDays: number;
  expectedOutputUpdateMode: 'auto' | 'manual' | 'prompt';
}

interface MaintenanceReport {
  timestamp: string;
  tasksExecuted: string[];
  warnings: string[];
  errors: string[];
  statistics: {
    fixturesUpdated: number;
    baselinesUpdated: number;
    artifactsCleanedUp: number;
    performanceTests: number;
  };
}

class TestMaintenanceManager {
  private config: TestMaintenanceConfig;
  private report: MaintenanceReport;
  private projectRoot: string;

  constructor(config?: Partial<TestMaintenanceConfig>) {
    this.projectRoot = process.cwd();
    this.config = {
      fixtureUpdateInterval: 30, // 30 days
      performanceBaselineThreshold: 10, // 10% deviation
      cleanupRetentionDays: 7,
      expectedOutputUpdateMode: 'prompt',
      ...config
    };
    
    this.report = {
      timestamp: new Date().toISOString(),
      tasksExecuted: [],
      warnings: [],
      errors: [],
      statistics: {
        fixturesUpdated: 0,
        baselinesUpdated: 0,
        artifactsCleanedUp: 0,
        performanceTests: 0
      }
    };
  }

  async runMaintenance(): Promise<void> {
    console.log('🔧 Starting Test Suite Maintenance\n');
    
    try {
      await this.cleanupTestArtifacts();
      await this.updateTestFixtures();
      await this.validateExpectedOutputs();
      await this.updatePerformanceBaselines();
      await this.validateTestConfiguration();
      await this.optimizeTestData();
      
      console.log('\n✅ Test maintenance completed successfully');
    } catch (error) {
      this.report.errors.push(`Maintenance failed: ${error.message}`);
      console.error('\n❌ Test maintenance failed:', error);
      throw error;
    } finally {
      await this.generateMaintenanceReport();
    }
  }

  private async cleanupTestArtifacts(): Promise<void> {
    console.log('🧹 Cleaning up test artifacts...');
    const startTime = performance.now();
    
    const cleanupDirs = [
      'coverage',
      'test-results',
      'test-logs',
      'test-artifacts',
      'screenshots',
      'performance-reports',
      '.nyc_output',
      'node_modules/.cache/jest'
    ];

    let cleanedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.cleanupRetentionDays);

    for (const dir of cleanupDirs) {
      const fullPath = path.join(this.projectRoot, dir);
      
      try {
        await fs.access(fullPath);
        const stats = await fs.stat(fullPath);
        
        if (stats.mtime < cutoffDate) {
          await fs.rm(fullPath, { recursive: true, force: true });
          console.log(`  ✓ Cleaned up ${dir} (${Math.round((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24))} days old)`);
          cleanedCount++;
        }
      } catch (error) {
        // Directory doesn't exist or access error - that's fine
      }
    }

    // Clean up temporary test files
    const tempPattern = /^(test-|temp-|\.tmp)/;
    try {
      const files = await fs.readdir(this.projectRoot);
      for (const file of files) {
        if (tempPattern.test(file)) {
          const filePath = path.join(this.projectRoot, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.rm(filePath, { recursive: true, force: true });
            console.log(`  ✓ Cleaned up temporary file: ${file}`);
            cleanedCount++;
          }
        }
      }
    } catch (error) {
      this.report.warnings.push(`Failed to clean temporary files: ${error.message}`);
    }

    this.report.statistics.artifactsCleanedUp = cleanedCount;
    this.report.tasksExecuted.push(`Cleanup (${cleanedCount} items, ${Math.round(performance.now() - startTime)}ms)`);
  }

  private async updateTestFixtures(): Promise<void> {
    console.log('📦 Updating test fixtures...');
    const startTime = performance.now();
    
    const fixturesDir = path.join(this.projectRoot, 'test/fixtures');
    let updatedCount = 0;

    // Update repository fixtures
    const repositoriesDir = path.join(fixturesDir, 'repositories');
    
    try {
      const repositories = await fs.readdir(repositoriesDir);
      
      for (const repoFile of repositories) {
        if (repoFile.endsWith('.ts')) {
          const repoPath = path.join(repositoriesDir, repoFile);
          const stats = await fs.stat(repoPath);
          
          const daysSinceUpdate = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysSinceUpdate > this.config.fixtureUpdateInterval) {
            await this.refreshRepositoryFixture(repoPath);
            updatedCount++;
          }
        }
      }
    } catch (error) {
      this.report.warnings.push(`Failed to update repository fixtures: ${error.message}`);
    }

    // Update package.json fixtures based on current ecosystem
    await this.updatePackageJsonFixtures();

    // Validate fixture integrity
    await this.validateFixtureIntegrity();

    this.report.statistics.fixturesUpdated = updatedCount;
    this.report.tasksExecuted.push(`Fixture Updates (${updatedCount} updated, ${Math.round(performance.now() - startTime)}ms)`);
  }

  private async refreshRepositoryFixture(fixturePath: string): Promise<void> {
    const fixtureContent = await fs.readFile(fixturePath, 'utf8');
    
    // Update dependency versions in the fixture
    const updatedContent = await this.updateDependencyVersions(fixtureContent);
    
    if (updatedContent !== fixtureContent) {
      await fs.writeFile(fixturePath, updatedContent);
      console.log(`  ✓ Updated ${path.basename(fixturePath)}`);
    }
  }

  private async updateDependencyVersions(content: string): Promise<string> {
    // Update common dependencies to latest versions
    const versionUpdates = {
      express: await this.getLatestVersion('express'),
      typescript: await this.getLatestVersion('typescript'),
      '@types/node': await this.getLatestVersion('@types/node'),
      jest: await this.getLatestVersion('jest')
    };

    let updatedContent = content;
    
    for (const [pkg, version] of Object.entries(versionUpdates)) {
      if (version) {
        // Update version in package.json-like structures
        const versionRegex = new RegExp(`"${pkg}":\\s*"[^"]*"`, 'g');
        updatedContent = updatedContent.replace(versionRegex, `"${pkg}": "${version}"`);
      }
    }

    return updatedContent;
  }

  private async getLatestVersion(packageName: string): Promise<string | null> {
    try {
      const result = execSync(`npm view ${packageName} version`, { encoding: 'utf8', timeout: 5000 });
      return result.trim();
    } catch {
      return null;
    }
  }

  private async updatePackageJsonFixtures(): Promise<void> {
    const packageJsonFiles = [
      'test/fixtures/node-express/package.json',
      'test/fixtures/mcp-server-architecture/package.json'
    ];

    for (const filePath of packageJsonFiles) {
      const fullPath = path.join(this.projectRoot, filePath);
      
      try {
        await fs.access(fullPath);
        const packageJson = JSON.parse(await fs.readFile(fullPath, 'utf8'));
        
        // Update to latest LTS versions
        if (packageJson.engines && packageJson.engines.node) {
          packageJson.engines.node = '>=20.0.0';
        }
        
        // Update common dev dependencies
        if (packageJson.devDependencies) {
          if (packageJson.devDependencies['@types/node']) {
            packageJson.devDependencies['@types/node'] = await this.getLatestVersion('@types/node') || packageJson.devDependencies['@types/node'];
          }
        }
        
        await fs.writeFile(fullPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(`  ✓ Updated ${filePath}`);
      } catch (error) {
        this.report.warnings.push(`Failed to update ${filePath}: ${error.message}`);
      }
    }
  }

  private async validateFixtureIntegrity(): Promise<void> {
    console.log('🔍 Validating fixture integrity...');
    
    const fixturesDir = path.join(this.projectRoot, 'test/fixtures');
    
    // Validate TypeScript fixtures compile
    try {
      const repositoriesPath = path.join(fixturesDir, 'repositories/index.ts');
      execSync(`npx tsc --noEmit ${repositoriesPath}`, { cwd: this.projectRoot, timeout: 10000 });
      console.log('  ✓ Repository fixtures compile successfully');
    } catch (error) {
      this.report.errors.push(`Fixture compilation failed: ${error.message}`);
    }

    // Validate JSON fixtures are valid
    const jsonFiles = await this.findFilesRecursive(fixturesDir, '.json');
    
    for (const jsonFile of jsonFiles) {
      try {
        JSON.parse(await fs.readFile(jsonFile, 'utf8'));
      } catch (error) {
        this.report.errors.push(`Invalid JSON fixture: ${path.relative(this.projectRoot, jsonFile)}`);
      }
    }
  }

  private async validateExpectedOutputs(): Promise<void> {
    console.log('🎯 Validating expected outputs...');
    const startTime = performance.now();
    
    const expectedOutputsDir = path.join(this.projectRoot, 'test/fixtures/expected-outputs');
    
    try {
      await fs.access(expectedOutputsDir);
      const outputFiles = await fs.readdir(expectedOutputsDir);
      
      for (const file of outputFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(expectedOutputsDir, file);
          
          try {
            const expectedOutput = JSON.parse(await fs.readFile(filePath, 'utf8'));
            
            // Validate structure
            if (!this.isValidExpectedOutput(expectedOutput)) {
              this.report.warnings.push(`Invalid expected output structure: ${file}`);
              continue;
            }
            
            // Update if in auto mode and data is stale
            if (this.config.expectedOutputUpdateMode === 'auto') {
              const stats = await fs.stat(filePath);
              const daysSinceUpdate = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
              
              if (daysSinceUpdate > 14) { // Update every 2 weeks
                await this.regenerateExpectedOutput(file);
              }
            }
            
            console.log(`  ✓ Validated ${file}`);
          } catch (error) {
            this.report.errors.push(`Failed to validate expected output ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.report.warnings.push(`Expected outputs directory not accessible: ${error.message}`);
    }

    this.report.tasksExecuted.push(`Expected Output Validation (${Math.round(performance.now() - startTime)}ms)`);
  }

  private isValidExpectedOutput(output: any): boolean {
    return output && 
           typeof output === 'object' &&
           output.dockerfile &&
           output.k8sManifests &&
           Array.isArray(output.k8sManifests);
  }

  private async regenerateExpectedOutput(filename: string): Promise<void> {
    console.log(`  🔄 Regenerating expected output for ${filename}...`);
    
    const repoName = filename.replace('.json', '');
    
    try {
      // Run the actual tool to generate fresh output
      const result = execSync(
        `echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"analyze_repository","arguments":{"repoPath":"test/fixtures/${repoName}"}},"id":1}' | node dist/apps/cli.js`,
        { cwd: this.projectRoot, encoding: 'utf8', timeout: 30000 }
      );
      
      // Parse the JSON-RPC response
      const response = JSON.parse(result.trim());
      
      if (response.result && !response.error) {
        const expectedOutputPath = path.join(this.projectRoot, 'test/fixtures/expected-outputs', filename);
        await fs.writeFile(expectedOutputPath, JSON.stringify(response.result, null, 2));
        console.log(`  ✓ Regenerated ${filename}`);
      } else {
        this.report.warnings.push(`Failed to regenerate ${filename}: Tool returned error`);
      }
    } catch (error) {
      this.report.warnings.push(`Failed to regenerate ${filename}: ${error.message}`);
    }
  }

  private async updatePerformanceBaselines(): Promise<void> {
    console.log('📊 Updating performance baselines...');
    const startTime = performance.now();
    
    const baselinePath = path.join(this.projectRoot, 'test/baselines/performance-baseline.json');
    let baseline: any = {};
    let updatedCount = 0;

    try {
      await fs.access(baselinePath);
      baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
    } catch {
      // No existing baseline, create new one
      baseline = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        metrics: {}
      };
    }

    // Run performance tests to get current metrics
    try {
      const performanceData = await this.runPerformanceBenchmarks();
      
      for (const [testName, metrics] of Object.entries(performanceData)) {
        const currentBaseline = baseline.metrics[testName];
        
        if (!currentBaseline || this.shouldUpdateBaseline(currentBaseline, metrics as any)) {
          baseline.metrics[testName] = {
            ...metrics,
            baselineDate: new Date().toISOString()
          };
          updatedCount++;
          console.log(`  ✓ Updated baseline for ${testName}`);
        }
      }

      baseline.lastUpdated = new Date().toISOString();
      
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));
      
    } catch (error) {
      this.report.warnings.push(`Performance baseline update failed: ${error.message}`);
    }

    this.report.statistics.baselinesUpdated = updatedCount;
    this.report.tasksExecuted.push(`Performance Baselines (${updatedCount} updated, ${Math.round(performance.now() - startTime)}ms)`);
  }

  private async runPerformanceBenchmarks(): Promise<Record<string, any>> {
    const benchmarks: Record<string, any> = {};
    
    // Check if CLI is built before running benchmarks
    const cliPath = path.join(this.projectRoot, 'dist/apps/cli.js');
    try {
      await fs.access(cliPath);
    } catch {
      this.report.warnings.push('CLI not built - skipping performance benchmarks');
      return benchmarks;
    }

    // Benchmark: Repository Analysis
    const analysisStart = performance.now();
    try {
      const result = execSync(
        `echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"analyze_repository","arguments":{"repoPath":"."}},"id":1}' | timeout 15s node dist/apps/cli.js`,
        { 
          cwd: this.projectRoot, 
          timeout: 20000, // Reduced timeout
          stdio: 'pipe', // Capture output
          encoding: 'utf8'
        }
      );
      
      // Check if we got a valid response
      if (result && (result.includes('"result"') || result.includes('"error"'))) {
        benchmarks.repositoryAnalysis = {
          executionTime: Math.round(performance.now() - analysisStart),
          timestamp: new Date().toISOString()
        };
      } else {
        this.report.warnings.push('Repository analysis benchmark produced unexpected output');
      }
    } catch (error) {
      this.report.warnings.push(`Repository analysis benchmark failed: ${error.message.split('\n')[0]}`);
    }

    // Benchmark: Dockerfile Generation (only if first benchmark succeeded)
    if (benchmarks.repositoryAnalysis) {
      const dockerfileStart = performance.now();
      try {
        const result = execSync(
          `echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"generate_dockerfile","arguments":{"repoPath":"."}},"id":2}' | timeout 15s node dist/apps/cli.js`,
          { 
            cwd: this.projectRoot, 
            timeout: 20000, // Reduced timeout
            stdio: 'pipe', // Capture output
            encoding: 'utf8'
          }
        );
        
        if (result && (result.includes('"result"') || result.includes('"error"'))) {
          benchmarks.dockerfileGeneration = {
            executionTime: Math.round(performance.now() - dockerfileStart),
            timestamp: new Date().toISOString()
          };
        } else {
          this.report.warnings.push('Dockerfile generation benchmark produced unexpected output');
        }
      } catch (error) {
        this.report.warnings.push(`Dockerfile generation benchmark failed: ${error.message.split('\n')[0]}`);
      }
    }

    this.report.statistics.performanceTests = Object.keys(benchmarks).length;
    return benchmarks;
  }

  private shouldUpdateBaseline(currentBaseline: any, newMetrics: any): boolean {
    if (!currentBaseline.executionTime || !newMetrics.executionTime) {
      return true;
    }
    
    const improvementPercentage = 
      (currentBaseline.executionTime - newMetrics.executionTime) / currentBaseline.executionTime * 100;
    
    return improvementPercentage > this.config.performanceBaselineThreshold;
  }

  private async validateTestConfiguration(): Promise<void> {
    console.log('⚙️  Validating test configuration...');
    
    // Validate Jest configuration
    const jestConfigPath = path.join(this.projectRoot, 'jest.config.js');
    
    try {
      await fs.access(jestConfigPath);
      
      // Check Jest config can be loaded
      const jestConfig = require(jestConfigPath);
      
      if (!jestConfig.projects || jestConfig.projects.length < 3) {
        this.report.warnings.push('Jest configuration may be missing test projects');
      }
      
      console.log('  ✓ Jest configuration valid');
    } catch (error) {
      this.report.errors.push(`Jest configuration invalid: ${error.message}`);
    }

    // Validate npm scripts
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const scripts = packageJson.scripts || {};
      
      const requiredScripts = [
        'test', 'test:unit', 'test:integration', 'test:e2e', 
        'test:coverage', 'test:ci'
      ];
      
      const missingScripts = requiredScripts.filter(script => !scripts[script]);
      
      if (missingScripts.length > 0) {
        this.report.warnings.push(`Missing npm scripts: ${missingScripts.join(', ')}`);
      } else {
        console.log('  ✓ All required npm scripts present');
      }
    } catch (error) {
      this.report.errors.push(`Package.json validation failed: ${error.message}`);
    }
  }

  private async optimizeTestData(): Promise<void> {
    console.log('🚀 Optimizing test data...');
    
    // Compress large fixture files
    const fixturesDir = path.join(this.projectRoot, 'test/fixtures');
    const largeFiles = await this.findLargeFiles(fixturesDir, 1024 * 1024); // Files > 1MB
    
    for (const file of largeFiles) {
      const stats = await fs.stat(file);
      console.log(`  ⚠️  Large test fixture: ${path.relative(this.projectRoot, file)} (${Math.round(stats.size / 1024)}KB)`);
      this.report.warnings.push(`Consider optimizing large fixture: ${path.relative(this.projectRoot, file)}`);
    }

    // Clean up duplicate test data
    await this.deduplicateTestData();
  }

  private async deduplicateTestData(): Promise<void> {
    // Find and report potential duplicate fixtures
    const fixturesDir = path.join(this.projectRoot, 'test/fixtures');
    const files = await this.findFilesRecursive(fixturesDir, '.ts', '.js', '.json');
    
    const fileHashes = new Map<string, string[]>();
    
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const hash = this.simpleHash(content);
        
        if (!fileHashes.has(hash)) {
          fileHashes.set(hash, []);
        }
        fileHashes.get(hash)!.push(file);
      } catch (error) {
        // Skip files that can't be read
      }
    }

    for (const [hash, duplicateFiles] of fileHashes) {
      if (duplicateFiles.length > 1) {
        console.log(`  ⚠️  Potential duplicate test data: ${duplicateFiles.map(f => path.relative(this.projectRoot, f)).join(', ')}`);
        this.report.warnings.push(`Consider deduplicating: ${duplicateFiles.map(f => path.relative(this.projectRoot, f)).join(', ')}`);
      }
    }
  }

  private async findFilesRecursive(dir: string, ...extensions: string[]): Promise<string[]> {
    const results: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          results.push(...await this.findFilesRecursive(fullPath, ...extensions));
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      // Directory not accessible
    }
    
    return results;
  }

  private async findLargeFiles(dir: string, sizeThreshold: number): Promise<string[]> {
    const largeFiles: string[] = [];
    
    try {
      const files = await this.findFilesRecursive(dir, '.json', '.ts', '.js');
      
      for (const file of files) {
        const stats = await fs.stat(file);
        if (stats.size > sizeThreshold) {
          largeFiles.push(file);
        }
      }
    } catch (error) {
      // Directory not accessible
    }
    
    return largeFiles;
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private async generateMaintenanceReport(): Promise<void> {
    const reportPath = path.join(this.projectRoot, 'test-maintenance-report.json');
    await fs.writeFile(reportPath, JSON.stringify(this.report, null, 2));
    
    console.log('\n📋 Maintenance Report Summary:');
    console.log(`  Tasks executed: ${this.report.tasksExecuted.length}`);
    console.log(`  Fixtures updated: ${this.report.statistics.fixturesUpdated}`);
    console.log(`  Baselines updated: ${this.report.statistics.baselinesUpdated}`);
    console.log(`  Artifacts cleaned: ${this.report.statistics.artifactsCleanedUp}`);
    console.log(`  Warnings: ${this.report.warnings.length}`);
    console.log(`  Errors: ${this.report.errors.length}`);
    
    if (this.report.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.report.warnings.forEach(warning => console.log(`  • ${warning}`));
    }
    
    if (this.report.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.report.errors.forEach(error => console.log(`  • ${error}`));
    }
    
    console.log(`\n📄 Full report saved to: ${reportPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: Partial<TestMaintenanceConfig> = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--fixture-interval':
        options.fixtureUpdateInterval = parseInt(value);
        break;
      case '--performance-threshold':
        options.performanceBaselineThreshold = parseFloat(value);
        break;
      case '--cleanup-retention':
        options.cleanupRetentionDays = parseInt(value);
        break;
      case '--output-mode':
        options.expectedOutputUpdateMode = value as 'auto' | 'manual' | 'prompt';
        break;
    }
  }
  
  const manager = new TestMaintenanceManager(options);
  await manager.runMaintenance();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Test maintenance failed:', error);
    process.exit(1);
  });
}

export { TestMaintenanceManager, type TestMaintenanceConfig, type MaintenanceReport };