#!/usr/bin/env tsx
/**
 * Release Automation Script for Container Kit MCP
 * Handles version bumping, changelog updates, git operations, and npm publishing
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';

const __dirname = dirname(fileURLToPath(import.meta.url);
const rootDir = join(__dirname, '..');

type ReleaseType = 'patch' | 'minor' | 'major' | 'custom';

interface ReleaseConfig {
  releaseType: ReleaseType;
  version?: string;
  skipTests?: boolean;
  skipValidation?: boolean;
  dryRun?: boolean;
  publishToNpm?: boolean;
}

class ReleaseManager {
  private currentVersion: string;
  private newVersion: string = '';
  
  constructor() {
    const packageJson = this.loadPackageJson();
    this.currentVersion = packageJson.version;
  }
  
  async release(config: ReleaseConfig): Promise<void> {
    console.log('🚀 Container Kit MCP Release Process');
    console.log('═'.repeat(50);
    console.log(`Current version: ${this.currentVersion}`);
    
    try {
      // Pre-flight checks
      await this.preflightChecks();
      
      // Get new version
      this.newVersion = await this.determineNewVersion(config);
      console.log(`Target version: ${this.newVersion}`);
      
      if (config.dryRun) {
        console.log('🧪 DRY RUN MODE - No changes will be made\n');
      }
      
      // Confirmation prompt
      if (!config.dryRun) {
        const confirmed = await this.confirmRelease();
        if (!confirmed) {
          console.log('❌ Release cancelled by user');
          return;
        }
      }
      
      // Execute release steps
      await this.validateCodebase(config);
      await this.updateVersion(config);
      await this.updateChangelog(config);
      await this.commitChanges(config);
      await this.createTag(config);
      await this.publishPackage(config);
      
      console.log('\n🎉 Release completed successfully!');
      this.printPostReleaseInstructions();
      
    } catch (error) {
      console.error('❌ Release failed:', error);
      throw error;
    }
  }
  
  private async preflightChecks(): Promise<void> {
    console.log('🔍 Running pre-flight checks...');
    
    // Check git status
    const gitStatus = this.runCommand('git status --porcelain', true);
    if (gitStatus && !gitStatus.includes('package.json')) {
      throw new Error('Working directory not clean. Commit or stash changes first.');
    }
    
    // Check current branch
    const currentBranch = this.runCommand('git branch --show-current', true).trim();
    console.log(`  ✓ Current branch: ${currentBranch}`);
    
    if (currentBranch !== 'main' && currentBranch !== 'master') {
      const proceed = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: `You're on branch '${currentBranch}', not main/master. Continue?`,
          default: false
        }
      ]);
      
      if (!proceed.confirmed) {
        throw new Error('Release cancelled - not on main branch');
      }
    }
    
    // Check npm credentials
    try {
      this.runCommand('npm whoami', true);
      console.log('  ✓ NPM credentials validated');
    } catch (error) {
      throw new Error('Not logged into npm. Run "npm login" first.');
    }
    
    // Check for required files
    const requiredFiles = ['package.json', 'README.md', 'LICENSE'];
    for (const file of requiredFiles) {
      if (!existsSync(join(rootDir, file))) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
    
    console.log('  ✓ Pre-flight checks passed');
  }
  
  private async determineNewVersion(config: ReleaseConfig): Promise<string> {
    if (config.releaseType === 'custom' && config.version) {
      if (!/^\d+\.\d+\.\d+(-.*)?$/.test(config.version)) {
        throw new Error('Invalid version format. Use semver format (e.g., 1.0.0)');
      }
      return config.version;
    }
    
    if (config.releaseType !== 'custom') {
      return this.bumpVersion(this.currentVersion, config.releaseType);
    }
    
    // Interactive version prompt
    const { version } = await inquirer.prompt([
      {
        type: 'input',
        name: 'version',
        message: 'Enter custom version:',
        validate: (input: string) => {
          return /^\d+\.\d+\.\d+(-.*)?$/.test(input) || 'Invalid version format';
        }
      }
    ]);
    
    return version;
  }
  
  private bumpVersion(version: string, type: 'patch' | 'minor' | 'major'): string {
    const parts = version.split('.').map(Number);
    const [major, minor, patch] = parts;
    
    switch (type) {
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'major':
        return `${major + 1}.0.0`;
      default:
        throw new Error(`Unknown release type: ${type}`);
    }
  }
  
  private async confirmRelease(): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `Ready to release v${this.newVersion}?`,
        default: false
      }
    ]);
    
    return confirmed;
  }
  
  private async validateCodebase(config: ReleaseConfig): Promise<void> {
    if (config.skipValidation) {
      console.log('⏭️  Skipping validation (--skip-validation)');
      return;
    }
    
    console.log('🔍 Validating codebase...');
    
    // Type checking
    console.log('  📝 Type checking...');
    this.runCommand('npm run typecheck', !config.dryRun);
    
    // Linting
    console.log('  🔧 Linting...');
    this.runCommand('npm run lint', !config.dryRun);
    
    // Testing
    if (!config.skipTests) {
      console.log('  🧪 Running tests...');
      this.runCommand('npm test', !config.dryRun);
    } else {
      console.log('  ⏭️  Skipping tests (--skip-tests)');
    }
    
    // Build validation
    console.log('  🔨 Building...');
    this.runCommand('npm run build', !config.dryRun);
    
    // Package validation
    console.log('  📦 Validating package...');
    if (!config.dryRun) {
      this.runCommand('tsx scripts/validate-package.ts', true);
    }
    
    console.log('  ✅ Validation completed');
  }
  
  private async updateVersion(config: ReleaseConfig): Promise<void> {
    console.log(`📝 Updating version to ${this.newVersion}...`);
    
    if (config.dryRun) {
      console.log('  🧪 [DRY RUN] Would update package.json version');
      return;
    }
    
    const packageJson = this.loadPackageJson();
    packageJson.version = this.newVersion;
    
    writeFileSync(
      join(rootDir, 'package.json'),
      JSON.stringify(packageJson, null, 2) + '\n'
    );
    
    console.log('  ✓ package.json updated');
  }
  
  private async updateChangelog(config: ReleaseConfig): Promise<void> {
    console.log('📝 Updating CHANGELOG.md...');
    
    const changelogPath = join(rootDir, 'CHANGELOG.md');
    const date = new Date().toISOString().split('T')[0];
    
    if (config.dryRun) {
      console.log('  🧪 [DRY RUN] Would update CHANGELOG.md');
      return;
    }
    
    if (!existsSync(changelogPath)) {
      // Create new changelog
      const initialChangelog = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [${this.newVersion}] - ${date}

### Added
- Initial release of Container Kit MCP Server
- TypeScript-first architecture with strict type safety
- 15 containerization workflow tools
- AI-powered Dockerfile and Kubernetes manifest generation
- Session management with workflow state persistence
- Docker and Kubernetes integration
- Command-line interface with comprehensive options
- Performance monitoring and validation tools

### Changed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Removed
- N/A (initial release)
`;
      
      writeFileSync(changelogPath, initialChangelog);
      
    } else {
      // Update existing changelog
      const changelog = readFileSync(changelogPath, 'utf-8');
      
      const newEntry = `## [${this.newVersion}] - ${date}

### Added
- 

### Changed
- 

### Fixed
- 

### Removed
- 

`;
      
      const updatedChangelog = changelog.replace(
        /# Changelog\n/,
        `# Changelog\n\n${newEntry}`
      );
      
      writeFileSync(changelogPath, updatedChangelog);
    }
    
    console.log('  ✓ CHANGELOG.md updated');
  }
  
  private async commitChanges(config: ReleaseConfig): Promise<void> {
    console.log('💾 Committing changes...');
    
    if (config.dryRun) {
      console.log('  🧪 [DRY RUN] Would commit changes');
      return;
    }
    
    this.runCommand('git add package.json CHANGELOG.md', true);
    this.runCommand(`git commit -m "chore: release v${this.newVersion}"`, true);
    
    console.log('  ✓ Changes committed');
  }
  
  private async createTag(config: ReleaseConfig): Promise<void> {
    console.log('🏷️  Creating git tag...');
    
    if (config.dryRun) {
      console.log('  🧪 [DRY RUN] Would create git tag');
      return;
    }
    
    this.runCommand(
      `git tag -a v${this.newVersion} -m "Release v${this.newVersion}"`,
      true
    );
    
    console.log('  ✓ Git tag created');
  }
  
  private async publishPackage(config: ReleaseConfig): Promise<void> {
    if (!config.publishToNpm) {
      console.log('⏭️  Skipping npm publish (not requested)');
      return;
    }
    
    console.log('📤 Publishing to npm...');
    
    if (config.dryRun) {
      console.log('  🧪 [DRY RUN] Would publish to npm');
      this.runCommand('npm pack --dry-run', true);
      return;
    }
    
    // Final package validation
    this.runCommand('npm pack --dry-run', true);
    
    // Publish
    this.runCommand('npm publish', true);
    
    console.log('  ✅ Package published to npm');
  }
  
  private printPostReleaseInstructions(): void {
    console.log('\n📋 Post-Release Instructions:');
    console.log('═'.repeat(40);
    console.log('1. Push commits to remote:');
    console.log('   git push origin main');
    console.log('2. Push tags to remote:');
    console.log('   git push origin --tags');
    console.log('3. Create GitHub release:');
    console.log(`   https://github.com/containerization-assist/container-kit-mcp/releases/new?tag=v${this.newVersion}`);
    console.log('4. Update documentation if needed');
    console.log('5. Announce the release');
  }
  
  private loadPackageJson(): any {
    const packagePath = join(rootDir, 'package.json');
    return JSON.parse(readFileSync(packagePath, 'utf-8');
  }
  
  private runCommand(command: string, throwOnError: boolean = false): string {
    try {
      return execSync(command, {
        encoding: 'utf-8',
        cwd: rootDir,
        stdio: throwOnError ? 'inherit' : 'pipe'
      }) as string;
    } catch (error) {
      if (throwOnError) {
        throw error;
      }
      return '';
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse CLI arguments
  const config: ReleaseConfig = {
    releaseType: 'patch', // default
    skipTests: args.includes('--skip-tests'),
    skipValidation: args.includes('--skip-validation'),
    dryRun: args.includes('--dry-run'),
    publishToNpm: args.includes('--publish')
  };
  
  // Parse release type
  if (args.includes('--major')) {
    config.releaseType = 'major';
  } else if (args.includes('--minor')) {
    config.releaseType = 'minor';
  } else if (args.includes('--patch')) {
    config.releaseType = 'patch';
  } else if (args.includes('--custom')) {
    config.releaseType = 'custom';
    const versionIndex = args.indexOf('--version');
    if (versionIndex !== -1 && args[versionIndex + 1]) {
      config.version = args[versionIndex + 1];
    }
  }
  
  // Interactive mode if no release type specified
  if (!args.some(arg => ['--major', '--minor', '--patch', '--custom'].includes(arg))) {
    const { releaseType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'releaseType',
        message: 'Select release type:',
        choices: [
          { name: 'Patch (bug fixes)', value: 'patch' },
          { name: 'Minor (new features)', value: 'minor' },
          { name: 'Major (breaking changes)', value: 'major' },
          { name: 'Custom version', value: 'custom' }
        ],
        default: 'patch'
      }
    ]);
    
    config.releaseType = releaseType;
  }
  
  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Container Kit MCP Release Script

Usage: npm run release [options]
       tsx scripts/release.ts [options]

Release Types:
  --patch          Patch release (default) - bug fixes
  --minor          Minor release - new features  
  --major          Major release - breaking changes
  --custom         Custom version (use with --version)
  --version X.Y.Z  Specify custom version

Options:
  --publish        Publish to npm after release
  --dry-run        Show what would be done without making changes
  --skip-tests     Skip running tests
  --skip-validation Skip validation steps
  -h, --help       Show this help

Examples:
  npm run release                    # Interactive patch release
  npm run release --minor --publish # Minor release and publish
  npm run release --custom --version 2.1.0-beta.1
  npm run release --dry-run          # Preview release process
`);
    process.exit(0);
  }
  
  const releaseManager = new ReleaseManager();
  
  try {
    await releaseManager.release(config);
    process.exit(0);
  } catch (error) {
    console.error('💥 Release failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ReleaseManager };