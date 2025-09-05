#!/usr/bin/env node

/**
 * Test Environment Validation Script
 * Validates that the test infrastructure is properly configured
 * Part of Team Bravo's test infrastructure improvements
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 Validating Test Environment...\n');

let exitCode = 0;
const results = [];

/**
 * Check if a file exists and record result
 */
function checkFile(filePath, description) {
  const fullPath = join(rootDir, filePath);
  const exists = existsSync(fullPath);
  results.push({
    check: description,
    status: exists ? '✅' : '❌',
    details: exists ? `Found: ${filePath}` : `Missing: ${filePath}`
  });
  
  if (!exists) exitCode = 1;
  return exists;
}

/**
 * Run a command and check if it succeeds
 */
function checkCommand(command, description, expectedPattern = null) {
  try {
    const output = execSync(command, { 
      cwd: rootDir, 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    let success = true;
    let details = `Command executed successfully`;
    
    if (expectedPattern) {
      success = expectedPattern.test(output);
      details = success 
        ? `Pattern matched: ${expectedPattern.source}`
        : `Pattern not found: ${expectedPattern.source}`;
    }
    
    results.push({
      check: description,
      status: success ? '✅' : '❌',
      details
    });
    
    if (!success) exitCode = 1;
    return success;
  } catch (error) {
    results.push({
      check: description,
      status: '❌',
      details: `Command failed: ${error.message}`
    });
    exitCode = 1;
    return false;
  }
}

// === File Structure Checks ===
console.log('📁 Checking File Structure...');
checkFile('jest.config.js', 'Jest configuration exists');
checkFile('src/domain/types/errors/index.ts', 'Domain errors module exists');
checkFile('test/unit/environment.test.ts', 'Basic test file exists');

// === Configuration Checks ===
console.log('\n⚙️  Checking Configuration...');
checkCommand('node -e "console.log(process.versions.node)"', 'Node.js version', /\d+\.\d+\.\d+/);

// === Jest Functionality Checks ===
console.log('\n🧪 Checking Jest Functionality...');
checkCommand('npx jest --showConfig', 'Jest configuration loads');
checkCommand('npm run test:unit:quick', 'Quick unit tests pass', /Tests:.*passed/);

// === Module Resolution Checks ===  
console.log('\n📦 Checking Module Resolution...');
checkCommand('npm run typecheck', 'TypeScript compilation works');

// === Performance Checks ===
console.log('\n⚡ Checking Performance...');
const startTime = Date.now();
checkCommand('npm run test -- --testMatch="**/environment.test.ts"', 'Basic test performance');
const duration = Date.now() - startTime;
const performanceOk = duration < 10000; // Should complete within 10 seconds

results.push({
  check: 'Test execution performance',
  status: performanceOk ? '✅' : '⚠️',
  details: `Completed in ${duration}ms ${performanceOk ? '(Good)' : '(Slow)'}`
});

// === Report Results ===
console.log('\n📊 Validation Results:');
console.log('='.repeat(50));

results.forEach(result => {
  console.log(`${result.status} ${result.check}`);
  if (result.details && !result.details.startsWith('Found:')) {
    console.log(`   ${result.details}`);
  }
});

console.log('\n' + '='.repeat(50));
const passCount = results.filter(r => r.status === '✅').length;
const failCount = results.filter(r => r.status === '❌').length;
const warnCount = results.filter(r => r.status === '⚠️').length;

console.log(`📈 Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);

if (exitCode === 0) {
  console.log('🎉 Test environment is properly configured!');
} else {
  console.log('❌ Test environment needs attention. See failures above.');
}

process.exit(exitCode);