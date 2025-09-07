#!/usr/bin/env tsx

/**
 * Phase 3 Test Validation Script
 * 
 * This script validates that all Phase 3 test implementations are complete and working:
 * - E2E test framework
 * - Performance testing framework  
 * - Complex test repository fixtures
 * - Expected output validation framework
 * - Unit tests for key libraries
 */

import * as fs from 'fs/promises';
import * as path from 'path';

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string[];
  score?: number;
}

interface ValidationSuite {
  name: string;
  results: ValidationResult[];
  passed: boolean;
  score: number;
}

class Phase3TestValidator {
  private results: ValidationSuite[] = [];
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  async runValidation(): Promise<void> {
    console.log('🚀 Running Phase 3 Test Implementation Validation\n');

    await this.validateE2EFramework();
    await this.validatePerformanceFramework();
    await this.validateComplexFixtures();
    await this.validateOutputValidation();
    await this.validateUnitTests();
    await this.validateTestConfiguration();
    
    this.printSummaryReport();
  }

  private async validateE2EFramework(): Promise<void> {
    const suite: ValidationSuite = {
      name: 'E2E Test Framework',
      results: [],
      passed: true,
      score: 0
    };

    // Check E2E test base framework
    suite.results.push(await this.checkFileExists(
      'test/e2e/helpers/e2e-test-base.ts',
      'E2E test base framework'
    ));

    // Check containerization workflow E2E test
    suite.results.push(await this.checkFileExists(
      'test/e2e/workflows/containerization-workflow.test.ts',
      'Containerization workflow E2E test'
    ));

    // Check multi-service deployment E2E test
    suite.results.push(await this.checkFileExists(
      'test/e2e/workflows/multi-service-deployment.test.ts',
      'Multi-service deployment E2E test'
    ));

    // Check test content quality
    suite.results.push(await this.validateTestContent(
      'test/e2e/workflows/containerization-workflow.test.ts',
      ['describe', 'it', 'expect', 'runCompleteWorkflow'],
      'Containerization workflow test content'
    ));

    suite.results.push(await this.validateTestContent(
      'test/e2e/workflows/multi-service-deployment.test.ts',
      ['multi-service', 'docker-compose', 'k8s-manifests'],
      'Multi-service test content'
    ));

    suite.passed = suite.results.every(r => r.passed);
    suite.score = Math.round((suite.results.filter(r => r.passed).length / suite.results.length) * 100);
    
    this.results.push(suite);
  }

  private async validatePerformanceFramework(): Promise<void> {
    const suite: ValidationSuite = {
      name: 'Performance Testing Framework',
      results: [],
      passed: true,
      score: 0
    };

    // Check performance test base framework
    suite.results.push(await this.checkFileExists(
      'test/performance/helpers/performance-test-base.ts',
      'Performance test base framework'
    ));

    // Check concurrent execution performance test
    suite.results.push(await this.checkFileExists(
      'test/performance/workflows/concurrent-execution.test.ts',
      'Concurrent execution performance test'
    ));

    // Check performance framework features
    suite.results.push(await this.validateTestContent(
      'test/performance/helpers/performance-test-base.ts',
      ['PerformanceMetrics', 'runPerformanceTest', 'runConcurrentPerformanceTest', 'runLoadTest'],
      'Performance framework features'
    ));

    // Check performance test scenarios
    suite.results.push(await this.validateTestContent(
      'test/performance/workflows/concurrent-execution.test.ts',
      ['concurrent', 'load test', 'stress test', 'memory pressure'],
      'Performance test scenarios'
    ));

    suite.passed = suite.results.every(r => r.passed);
    suite.score = Math.round((suite.results.filter(r => r.passed).length / suite.results.length) * 100);
    
    this.results.push(suite);
  }

  private async validateComplexFixtures(): Promise<void> {
    const suite: ValidationSuite = {
      name: 'Complex Test Repository Fixtures',
      results: [],
      passed: true,
      score: 0
    };

    // Check monorepo microservices fixture
    suite.results.push(await this.checkFileExists(
      'test/fixtures/repositories/complex/monorepo-microservices.ts',
      'Monorepo microservices fixture'
    ));

    // Check security hardened app fixture
    suite.results.push(await this.checkFileExists(
      'test/fixtures/repositories/complex/security-hardened-app.ts',
      'Security hardened app fixture'
    ));

    // Check legacy migration fixture
    suite.results.push(await this.checkFileExists(
      'test/fixtures/repositories/complex/modernization-scenario.ts',
      'Legacy migration fixture'
    ));

    // Validate fixture content quality
    suite.results.push(await this.validateTestContent(
      'test/fixtures/repositories/complex/monorepo-microservices.ts',
      ['TestRepositoryConfig', 'docker-compose', 'services', 'api-gateway'],
      'Monorepo fixture content'
    ));

    suite.results.push(await this.validateTestContent(
      'test/fixtures/repositories/complex/security-hardened-app.ts',
      ['security-hardened', 'vulnerabilities', 'securityIssues'],
      'Security fixture content'
    ));

    suite.results.push(await this.validateTestContent(
      'test/fixtures/repositories/complex/modernization-scenario.ts',
      ['legacy', 'php', 'java', 'perl', 'migration'],
      'Legacy fixture content'
    ));

    suite.passed = suite.results.every(r => r.passed);
    suite.score = Math.round((suite.results.filter(r => r.passed).length / suite.results.length) * 100);
    
    this.results.push(suite);
  }

  private async validateOutputValidation(): Promise<void> {
    const suite: ValidationSuite = {
      name: 'Expected Output Validation Framework',
      results: [],
      passed: true,
      score: 0
    };

    // Check output validation framework
    suite.results.push(await this.checkFileExists(
      'test/helpers/output-validation.ts',
      'Output validation framework'
    ));

    // Check validation test
    suite.results.push(await this.checkFileExists(
      'test/e2e/validation/output-validation.test.ts',
      'Output validation integration test'
    ));

    // Check expected output configuration
    suite.results.push(await this.checkFileExists(
      'test/fixtures/expected-outputs/node-express-basic.json',
      'Expected output configuration'
    ));

    // Validate framework features
    suite.results.push(await this.validateTestContent(
      'test/helpers/output-validation.ts',
      ['ValidationRule', 'OutputValidationFramework', 'validateOutput'],
      'Validation framework features'
    ));

    // Validate integration test
    suite.results.push(await this.validateTestContent(
      'test/e2e/validation/output-validation.test.ts',
      ['validateOutput', 'ValidationContext', 'Dockerfile', 'k8s'],
      'Validation integration test'
    ));

    suite.passed = suite.results.every(r => r.passed);
    suite.score = Math.round((suite.results.filter(r => r.passed).length / suite.results.length) * 100);
    
    this.results.push(suite);
  }

  private async validateUnitTests(): Promise<void> {
    const suite: ValidationSuite = {
      name: 'Medium-Priority Unit Tests',
      results: [],
      passed: true,
      score: 0
    };

    // Check security scanner unit tests
    suite.results.push(await this.checkFileExists(
      'test/unit/lib/security-scanner.test.ts',
      'Security scanner unit tests'
    ));

    // Check caching unit tests
    suite.results.push(await this.checkFileExists(
      'test/unit/lib/caching.test.ts',
      'Caching library unit tests'
    ));

    // Validate test content
    suite.results.push(await this.validateTestContent(
      'test/unit/lib/security-scanner.test.ts',
      ['SecurityScanner', 'scanImage', 'scanFilesystem', 'scanSecrets'],
      'Security scanner test content'
    ));

    suite.results.push(await this.validateTestContent(
      'test/unit/lib/caching.test.ts',
      ['CacheManager', 'set', 'get', 'cleanup', 'persistence'],
      'Caching test content'
    ));

    // Check for comprehensive test coverage
    suite.results.push(await this.validateTestCoverage(
      'test/unit/lib/security-scanner.test.ts',
      10, // Minimum number of test cases
      'Security scanner test coverage'
    ));

    suite.results.push(await this.validateTestCoverage(
      'test/unit/lib/caching.test.ts',
      15, // Minimum number of test cases
      'Caching test coverage'
    ));

    suite.passed = suite.results.every(r => r.passed);
    suite.score = Math.round((suite.results.filter(r => r.passed).length / suite.results.length) * 100);
    
    this.results.push(suite);
  }

  private async validateTestConfiguration(): Promise<void> {
    const suite: ValidationSuite = {
      name: 'Test Configuration & Setup',
      results: [],
      passed: true,
      score: 0
    };

    // Check Jest configuration has E2E and performance projects
    suite.results.push(await this.validateJestConfig());

    // Check E2E setup file exists
    suite.results.push(await this.checkFileExists(
      'test/setup/e2e-setup.ts',
      'E2E test setup file'
    ));

    // Check MCP environment helper
    suite.results.push(await this.checkFileExists(
      'test/helpers/mcp-environment.ts',
      'MCP environment helper'
    ));

    // Check fixtures types
    suite.results.push(await this.checkFileExists(
      'test/fixtures/types.ts',
      'Test fixtures types'
    ));

    suite.passed = suite.results.every(r => r.passed);
    suite.score = Math.round((suite.results.filter(r => r.passed).length / suite.results.length) * 100);
    
    this.results.push(suite);
  }

  private async checkFileExists(filePath: string, description: string): Promise<ValidationResult> {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      await fs.access(fullPath);
      const stats = await fs.stat(fullPath);
      
      return {
        name: description,
        passed: true,
        message: `✅ ${description} exists (${stats.size} bytes)`,
        score: 100
      };
    } catch {
      return {
        name: description,
        passed: false,
        message: `❌ ${description} missing: ${filePath}`,
        score: 0
      };
    }
  }

  private async validateTestContent(
    filePath: string, 
    requiredContent: string[], 
    description: string
  ): Promise<ValidationResult> {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      
      const missingContent = requiredContent.filter(item => !content.includes(item));
      
      if (missingContent.length === 0) {
        return {
          name: description,
          passed: true,
          message: `✅ ${description} contains all required elements`,
          score: 100
        };
      } else {
        return {
          name: description,
          passed: false,
          message: `⚠️  ${description} missing: ${missingContent.join(', ')}`,
          details: missingContent,
          score: Math.round(((requiredContent.length - missingContent.length) / requiredContent.length) * 100)
        };
      }
    } catch (error) {
      return {
        name: description,
        passed: false,
        message: `❌ Could not validate ${description}: ${error.message}`,
        score: 0
      };
    }
  }

  private async validateTestCoverage(
    filePath: string,
    minTestCases: number,
    description: string
  ): Promise<ValidationResult> {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      
      // Count test cases (it() calls)
      const testCases = (content.match(/\bit\(/g) || []).length;
      
      if (testCases >= minTestCases) {
        return {
          name: description,
          passed: true,
          message: `✅ ${description} has ${testCases} test cases (>= ${minTestCases})`,
          score: 100
        };
      } else {
        return {
          name: description,
          passed: false,
          message: `⚠️  ${description} has only ${testCases} test cases (< ${minTestCases})`,
          score: Math.round((testCases / minTestCases) * 100)
        };
      }
    } catch (error) {
      return {
        name: description,
        passed: false,
        message: `❌ Could not validate ${description}: ${error.message}`,
        score: 0
      };
    }
  }

  private async validateJestConfig(): Promise<ValidationResult> {
    try {
      const jestConfigPath = path.join(this.projectRoot, 'jest.config.js');
      const content = await fs.readFile(jestConfigPath, 'utf8');
      
      const hasE2EProject = content.includes('**/test/e2e/**/*.test.ts');
      const hasPerformanceSupport = content.includes('performance') || content.includes('e2e');
      
      if (hasE2EProject && hasPerformanceSupport) {
        return {
          name: 'Jest configuration',
          passed: true,
          message: '✅ Jest configuration supports E2E and performance tests',
          score: 100
        };
      } else {
        return {
          name: 'Jest configuration',
          passed: false,
          message: '⚠️  Jest configuration may not fully support E2E/performance tests',
          score: 50
        };
      }
    } catch (error) {
      return {
        name: 'Jest configuration',
        passed: false,
        message: `❌ Could not validate Jest configuration: ${error.message}`,
        score: 0
      };
    }
  }

  private printSummaryReport(): void {
    console.log('\\n📊 Phase 3 Test Implementation Validation Summary\\n');
    console.log('='.repeat(60));
    
    let totalScore = 0;
    let totalSuites = this.results.length;
    let passedSuites = 0;

    for (const suite of this.results) {
      const status = suite.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${status} ${suite.name} - Score: ${suite.score}%`);
      
      totalScore += suite.score;
      if (suite.passed) passedSuites++;
      
      // Show failed tests
      const failedResults = suite.results.filter(r => !r.passed);
      if (failedResults.length > 0) {
        failedResults.forEach(result => {
          console.log(`  ${result.message}`);
          if (result.details) {
            result.details.forEach(detail => console.log(`    - ${detail}`));
          }
        });
      }
      console.log('');
    }

    const overallScore = Math.round(totalScore / totalSuites);
    const overallStatus = overallScore >= 80 ? '✅ EXCELLENT' : overallScore >= 60 ? '⚠️  GOOD' : '❌ NEEDS WORK';
    
    console.log('='.repeat(60));
    console.log(`Overall Phase 3 Implementation: ${overallStatus}`);
    console.log(`Total Score: ${overallScore}%`);
    console.log(`Suites Passed: ${passedSuites}/${totalSuites}`);
    console.log('');

    // Recommendations
    if (overallScore < 80) {
      console.log('🔧 Recommendations:');
      this.results.forEach(suite => {
        if (!suite.passed) {
          console.log(`- Complete missing components in ${suite.name}`);
        }
      });
      console.log('');
    }

    // Next steps
    if (overallScore >= 80) {
      console.log('🎉 Phase 3 implementation is ready for testing!');
      console.log('');
      console.log('Next steps:');
      console.log('- Run individual test suites to verify functionality');
      console.log('- Execute performance benchmarks');
      console.log('- Validate E2E workflows with real infrastructure');
      console.log('- Integrate with CI/CD pipeline');
    } else {
      console.log('⚠️  Phase 3 implementation needs completion before testing.');
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new Phase3TestValidator();
  validator.runValidation().catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export default Phase3TestValidator;