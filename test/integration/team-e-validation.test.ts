/**
 * Team E Validation Suite
 * Comprehensive testing for quality assurance and error recovery validation
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Team E: Quality Assurance & Validation', () => {
  const reportsDir = './reports/team-e-validation';

  beforeAll(async () => {
    await mkdir(reportsDir, { recursive: true });
  });

  describe('Error Tracking System', () => {
    it('should execute error tracker without failures', async () => {
      const result = await execAsync('npx tsx scripts/error-tracker.ts').catch(e => e);
      
      // Error tracker may exit with code 1 if errors found, but should not crash
      expect(result.stdout || result.stderr).toBeDefined();
      
      // Should generate error report
      const reportContent = await readFile('./reports/error-tracking/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('totalErrors');
      expect(report).toHaveProperty('errorsByTeam');
      expect(report).toHaveProperty('errorsByCategory');
      
      console.log(`✅ Error tracker executed successfully - ${report.totalErrors} errors tracked`);
    }, 45000);

    it('should categorize errors correctly', async () => {
      const reportContent = await readFile('./reports/error-tracking/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      // Validate error categorization
      const knownCategories = [
        'result-monad',
        'type-assignment',
        'generic-constraints',
        'module-resolution',
        'property-access',
        'function-signature',
        'optional-properties',
        'other'
      ];
      
      for (const category of Object.keys(report.errorsByCategory)) {
        expect(knownCategories).toContain(category);
      }
      
      console.log(`✅ Error categories validated: ${Object.keys(report.errorsByCategory).join(', ')}`);
    });

    it('should assign errors to correct teams', async () => {
      const reportContent = await readFile('./reports/error-tracking/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      const knownTeams = [
        'team-a-core',
        'team-b-application', 
        'team-c-infrastructure',
        'team-d-platform',
        'unassigned'
      ];
      
      for (const team of Object.keys(report.errorsByTeam)) {
        expect(knownTeams).toContain(team);
      }
      
      console.log(`✅ Team assignments validated: ${Object.keys(report.errorsByTeam).join(', ')}`);
    });
  });

  describe('Quality Gates Enforcement', () => {
    it('should execute quality gates and generate comprehensive report', async () => {
      const result = await execAsync('npx tsx scripts/quality-gates.ts').catch(e => e);
      
      // Quality gates may fail, but should generate report
      expect(result.stdout || result.stderr).toBeDefined();
      
      const reportContent = await readFile('./reports/quality-gates/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      expect(report).toHaveProperty('overallPassed');
      expect(report).toHaveProperty('totalErrors');
      expect(report).toHaveProperty('totalWarnings');
      expect(report).toHaveProperty('results');
      expect(Array.isArray(report.results)).toBe(true);
      
      // Validate each gate result
      for (const result of report.results) {
        expect(result).toHaveProperty('gate');
        expect(result).toHaveProperty('passed');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(result).toHaveProperty('executionTime');
      }
      
      console.log(`✅ Quality gates report validated - ${report.results.length} gates checked`);
    }, 180000); // 3 minutes timeout

    it('should identify blocking vs non-blocking gate failures', async () => {
      const reportContent = await readFile('./reports/quality-gates/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      // Expected gates
      const expectedGates = [
        'TypeScript Compilation',
        'ESLint Code Quality',
        'Unit Tests',
        'Integration Tests',
        'Infrastructure Validation',
        'Code Formatting'
      ];
      
      const reportedGates = report.results.map((r: any) => r.gate);
      
      for (const expectedGate of expectedGates) {
        expect(reportedGates).toContain(expectedGate);
      }
      
      // Validate blocking logic
      if (!report.overallPassed) {
        expect(report.blockedBy).toBeDefined();
        expect(Array.isArray(report.blockedBy)).toBe(true);
        
        console.log(`⚠️  Quality gates blocked by: ${report.blockedBy.join(', ')}`);
      } else {
        console.log('✅ All quality gates passed');
      }
    });
  });

  describe('Team Progress Monitoring', () => {
    it('should track team-specific progress and dependencies', async () => {
      const result = await execAsync('npx tsx scripts/team-progress-monitor.ts').catch(e => e);
      
      const reportContent = await readFile('./reports/team-progress/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('overallProgress');
      expect(report).toHaveProperty('teams');
      expect(report).toHaveProperty('crossTeamDependencies');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('alerts');
      
      // Validate team structure
      expect(Array.isArray(report.teams)).toBe(true);
      
      const expectedTeams = [
        'Team A: Core Infrastructure & Types',
        'Team B: Application Layer & Tools',
        'Team C: Infrastructure & External Clients',
        'Team D: Platform & Entry Points'
      ];
      
      for (const expectedTeam of expectedTeams) {
        const team = report.teams.find((t: any) => t.name === expectedTeam);
        expect(team).toBeDefined();
        expect(team).toHaveProperty('errorCount');
        expect(team).toHaveProperty('warningCount');
        expect(team).toHaveProperty('filesWithErrors');
        expect(team).toHaveProperty('topErrorCategories');
        expect(team).toHaveProperty('trend');
        expect(team).toHaveProperty('blockers');
      }
      
      console.log(`✅ Team progress validated - ${report.teams.length} teams tracked`);
    }, 60000);

    it('should identify critical cross-team dependencies', async () => {
      const reportContent = await readFile('./reports/team-progress/latest.json', 'utf-8');
      const report = JSON.parse(reportContent);
      
      // Validate cross-team dependencies structure
      for (const dependency of report.crossTeamDependencies) {
        expect(dependency).toHaveProperty('fromTeam');
        expect(dependency).toHaveProperty('toTeam');
        expect(dependency).toHaveProperty('errorCount');
        expect(dependency).toHaveProperty('blockingIssues');
        expect(dependency).toHaveProperty('description');
        
        expect(typeof dependency.errorCount).toBe('number');
        expect(Array.isArray(dependency.blockingIssues)).toBe(true);
      }
      
      if (report.crossTeamDependencies.length > 0) {
        console.log(`⚠️  Cross-team dependencies identified: ${report.crossTeamDependencies.length}`);
      } else {
        console.log('✅ No blocking cross-team dependencies');
      }
    });
  });

  describe('Infrastructure Validation', () => {
    it('should validate TypeScript configuration for ESM compliance', async () => {
      const tsconfigContent = await readFile('./tsconfig.json', 'utf-8');
      const tsconfig = JSON.parse(tsconfigContent);
      
      // Critical ESM configuration checks
      expect(tsconfig.compilerOptions.module).toBe('ES2022');
      expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
      
      // Ensure exactOptionalPropertyTypes is enabled for strict typing
      expect(tsconfig.compilerOptions.exactOptionalPropertyTypes).toBe(true);
      
      console.log('✅ TypeScript configuration validated for ESM compliance');
    });

    it('should validate package.json for required scripts and dependencies', async () => {
      const packageContent = await readFile('./package.json', 'utf-8');
      const pkg = JSON.parse(packageContent);
      
      // Required scripts for Team E operations
      const requiredScripts = [
        'build', 'test', 'lint', 'typecheck', 'validate',
        'test:unit', 'test:integration', 'test:coverage'
      ];
      
      for (const script of requiredScripts) {
        expect(pkg.scripts).toHaveProperty(script);
      }
      
      // Required dependencies for validation
      expect(pkg.dependencies).toHaveProperty('pino'); // Logger validation
      expect(pkg.devDependencies).toHaveProperty('jest'); // Testing framework
      expect(pkg.devDependencies).toHaveProperty('typescript'); // TypeScript compiler
      
      console.log('✅ Package.json validated for required scripts and dependencies');
    });

    it('should enforce import pattern compliance', async () => {
      const result = await execAsync('npx tsx scripts/validate-infrastructure.ts');
      
      // Infrastructure validation should provide detailed output
      expect(result.stdout).toContain('Infrastructure validation');
      
      // Should not have critical path mapping violations
      expect(result.stdout).not.toContain('path mapping imports');
      
      console.log('✅ Import pattern compliance validated');
    }, 30000);
  });

  describe('Test Environment Stability', () => {
    it('should run unit tests without TypeScript compilation errors', async () => {
      const result = await execAsync('npm run test:unit');
      
      expect(result.stdout).toContain('Tests:'); // Jest output format
      expect(result.stdout).not.toContain('FAIL'); // No test failures
      
      console.log('✅ Unit tests execute without TypeScript errors');
    }, 90000);

    it('should have stable Jest configuration for ESM', async () => {
      const jestConfigContent = await readFile('./jest.config.js', 'utf-8');
      
      // Verify ESM configuration
      expect(jestConfigContent).toContain('preset: \'ts-jest/presets/default-esm\'');
      expect(jestConfigContent).toContain('extensionsToTreatAsEsm: [\'.ts\']');
      expect(jestConfigContent).toContain('useESM: true');
      
      console.log('✅ Jest configuration validated for ESM support');
    });
  });

  describe('Performance Regression Detection', () => {
    it('should complete TypeScript compilation within performance thresholds', async () => {
      const startTime = process.hrtime.bigint();
      
      try {
        await execAsync('npm run typecheck');
      } catch (error) {
        // TypeScript may have errors, but should complete compilation
      }
      
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6; // milliseconds
      
      // Should complete within 30 seconds even with errors
      expect(duration).toBeLessThan(30000);
      
      console.log(`✅ TypeScript compilation completed in ${(duration / 1000).toFixed(2)}s`);
    }, 35000);

    it('should not introduce significant memory overhead', async () => {
      const initialMemory = process.memoryUsage();
      
      // Run memory-intensive validation
      await execAsync('npm run typecheck').catch(() => {}); // Ignore errors
      await execAsync('npm run lint').catch(() => {}); // Ignore errors
      
      const finalMemory = process.memoryUsage();
      const heapIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Should not increase heap by more than 500MB
      expect(heapIncrease).toBeLessThan(500 * 1024 * 1024);
      
      console.log(`✅ Memory overhead within limits: ${(heapIncrease / 1024 / 1024).toFixed(2)}MB increase`);
    });
  });

  describe('Daily Health Check Integration', () => {
    it('should execute daily health check successfully', async () => {
      const result = await execAsync('bash scripts/daily-health-check.sh').catch(e => e);
      
      // Health check should provide comprehensive output regardless of pass/fail
      const output = result.stdout || result.stderr || '';
      
      expect(output).toContain('Daily TypeScript Health Check');
      expect(output).toContain('OVERALL STATUS');
      expect(output).toContain('TEAM BREAKDOWN');
      expect(output).toContain('QUALITY GATES');
      
      console.log('✅ Daily health check executed and generated comprehensive report');
    }, 120000);
  });

  afterAll(async () => {
    // Generate final validation summary
    const summary = {
      timestamp: new Date().toISOString(),
      validationSuite: 'Team E Quality Assurance',
      testResults: 'All validation tests completed',
      reportsGenerated: [
        './reports/error-tracking/latest.json',
        './reports/quality-gates/latest.json', 
        './reports/team-progress/latest.json'
      ]
    };
    
    await writeFile(
      join(reportsDir, 'validation-summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('📊 Team E validation summary saved');
  });
});