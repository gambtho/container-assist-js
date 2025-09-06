#!/usr/bin/env tsx
/**
 * MCP Inspector Test Suite Runner
 * Team Gamma - Testing Infrastructure
 */

import { MCPTestRunner } from './infrastructure/test-runner.js';
import { createBasicToolTests } from './suites/tool-validation/basic-tool-tests.js';
import { createSamplingValidationTests } from './suites/sampling-validation/sampling-tests.js';
import { createResourceManagementTests } from './suites/resource-management/resource-tests.js';
import { createLoadTestingTests } from './suites/load-testing/concurrent-tests.js';

async function main() {
  console.log('🧪 MCP Inspector Test Suite - Team Gamma');
  console.log('==========================================\n');

  const testRunner = new MCPTestRunner('./scripts/mcp-start-mock.sh');

  try {
    console.log('🔌 Initializing MCP client connection...');
    await testRunner.initialize();
    console.log('✅ Connected to MCP server\n');

    // Register all test suites
    const basicTests = createBasicToolTests(testRunner);
    const samplingTests = createSamplingValidationTests(testRunner);
    const resourceTests = createResourceManagementTests(testRunner);
    const loadTests = createLoadTestingTests(testRunner);

    // Register tests based on category filter
    const categoryArg = args.find(arg => arg.startsWith('--category='));
    const category = categoryArg?.split('=')[1];

    let testsToRegister = [];
    
    if (category) {
      console.log(`🎯 Filtering tests for category: ${category}\n`);
      switch (category) {
        case 'tool-validation':
          testsToRegister = basicTests;
          break;
        case 'sampling-validation':
          testsToRegister = samplingTests;
          break;
        case 'resource-management':
          testsToRegister = resourceTests;
          break;
        case 'load-testing':
          testsToRegister = loadTests;
          break;
        default:
          console.log(`❌ Unknown category: ${category}`);
          process.exit(1);
      }
    } else {
      testsToRegister = [...basicTests, ...samplingTests, ...resourceTests, ...loadTests];
    }

    testsToRegister.forEach(test => testRunner.register(test));
    console.log(`📋 Registered ${testsToRegister.length} test cases\n`);

    // Run all tests
    console.log('🚀 Running test suite...\n');
    const results = await testRunner.run();

    // Display results
    console.log('\n📊 Test Results Summary');
    console.log('=======================');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏱️  Total Duration: ${Math.round(results.totalDuration)}ms`);
    console.log(`⚡ Avg Response Time: ${Math.round(results.performance.avgResponseTime)}ms`);
    console.log(`🧠 Max Memory Usage: ${Math.round(results.performance.maxMemoryUsage / 1024)}KB`);
    console.log(`🔄 Total Operations: ${results.performance.totalOperations}`);

    if (results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.testName}: ${r.message}`);
        });
    }

    console.log('\n✨ Test suite completed!\n');

    // Exit with proper code
    process.exit(results.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('💥 Test suite failed to run:', error);
    process.exit(1);
  } finally {
    await testRunner.cleanup();
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
MCP Inspector Test Runner

Usage: tsx test/mcp-inspector/runner.ts [options]

Options:
  --help, -h           Show this help message
  --category <cat>     Run tests from specific category
  --tag <tag>          Run tests with specific tag  
  --pattern <regex>    Run tests matching name pattern
  --parallel           Run tests in parallel (for load testing)

Categories:
  - tool-validation     Basic tool functionality tests
  - sampling-validation Sampling algorithm tests (Team Beta integration)
  - resource-management Resource system tests (Team Alpha integration)
  - load-testing        Concurrent operation tests
  - integration-flows   End-to-end workflow tests (future)

Examples:
  tsx test/mcp-inspector/runner.ts
  tsx test/mcp-inspector/runner.ts --category tool-validation
  tsx test/mcp-inspector/runner.ts --tag basic
  tsx test/mcp-inspector/runner.ts --pattern "ping.*"
`);
  process.exit(0);
}

main().catch(console.error);