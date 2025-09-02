#!/usr/bin/env node
/**
 * Quality Gates Enforcement
 * Automated quality standards enforcement with strict failure thresholds
 */

import { exec } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface QualityGate {
  name: string;
  command: string;
  maxErrors: number;
  maxWarnings: number;
  blocking: boolean;
  timeout: number; // milliseconds
  description: string;
}

interface QualityResult {
  gate: string;
  passed: boolean;
  errors: number;
  warnings: number;
  executionTime: number;
  output: string;
  errorOutput: string;
}

interface QualityReport {
  timestamp: string;
  overallPassed: boolean;
  totalErrors: number;
  totalWarnings: number;
  executionTime: number;
  results: QualityResult[];
  blockedBy: string[];
}

class QualityGateEnforcer {
  private readonly gates: QualityGate[] = [
    {
      name: 'TypeScript Compilation',
      command: 'npm run typecheck',
      maxErrors: 0,
      maxWarnings: 0,
      blocking: true,
      timeout: 30000, // 30 seconds
      description: 'Ensures zero TypeScript compilation errors'
    },
    {
      name: 'ESLint Code Quality',
      command: 'npm run lint',
      maxErrors: 0,
      maxWarnings: 0,
      blocking: true,
      timeout: 15000, // 15 seconds
      description: 'Enforces code style and quality standards'
    },
    {
      name: 'Unit Tests',
      command: 'npm run test:unit',
      maxErrors: 0,
      maxWarnings: 0,
      blocking: true,
      timeout: 60000, // 60 seconds
      description: 'Validates unit test coverage and functionality'
    },
    {
      name: 'Integration Tests',
      command: 'npm run test:integration',
      maxErrors: 0,
      maxWarnings: 5, // Allow some warnings in integration tests
      blocking: true,
      timeout: 120000, // 2 minutes
      description: 'Validates system integration and workflows'
    },
    {
      name: 'Infrastructure Validation',
      command: 'npx tsx scripts/validate-infrastructure.ts',
      maxErrors: 0,
      maxWarnings: 3, // Allow minor warnings like path mappings
      blocking: true,
      timeout: 10000, // 10 seconds  
      description: 'Validates architecture boundaries and import patterns'
    },
    {
      name: 'Code Formatting',
      command: 'npm run format:check',
      maxErrors: 0,
      maxWarnings: 0,
      blocking: false, // Non-blocking, can be auto-fixed
      timeout: 5000, // 5 seconds
      description: 'Ensures consistent code formatting'
    }
  ];

  private readonly outputDir = './reports/quality-gates';

  constructor() {
    this.ensureOutputDir();
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // Directory already exists or other error
    }
  }

  private parseOutput(output: string, errorOutput: string): { errors: number; warnings: number } {
    let errors = 0;
    let warnings = 0;

    // Count TypeScript errors
    const tsErrors = (errorOutput.match(/error TS\\d+/g) || []).length;
    errors += tsErrors;

    // Count ESLint errors and warnings
    const eslintErrors = (output.match(/✖ \\d+ problems? \\((\\d+) errors?/g) || [])
      .reduce((sum, match) => {
        const errorCount = match.match(/\\((\\d+) errors?/)?.[1];
        return sum + (errorCount ? parseInt(errorCount, 10) : 0);
      }, 0);
    errors += eslintErrors;

    const eslintWarnings = (output.match(/✖ \\d+ problems? \\(\\d+ errors?, (\\d+) warnings?\\)/g) || [])
      .reduce((sum, match) => {
        const warningCount = match.match(/, (\\d+) warnings?/)?.[1];
        return sum + (warningCount ? parseInt(warningCount, 10) : 0);
      }, 0);
    warnings += eslintWarnings;

    // Count Jest test failures
    const testFailures = (output.match(/FAIL .+\\.test\\.ts/g) || []).length;
    errors += testFailures;

    // Count infrastructure validator errors/warnings
    if (output.includes('❌ Errors')) {
      const infraErrors = (output.match(/❌ Errors \\((\\d+)\\)/)?.[1]);
      errors += infraErrors ? parseInt(infraErrors, 10) : 0;
    }
    if (output.includes('⚠️  Warnings')) {
      const infraWarnings = (output.match(/⚠️  Warnings \\((\\d+)\\)/)?.[1]);
      warnings += infraWarnings ? parseInt(infraWarnings, 10) : 0;
    }

    return { errors, warnings };
  }

  private async executeGate(gate: QualityGate): Promise<QualityResult> {
    console.log(`\\n🔍 Running ${gate.name}...`);
    console.log(`📋 ${gate.description}`);
    console.log(`⏱️  Timeout: ${gate.timeout / 1000}s | Max Errors: ${gate.maxErrors} | Max Warnings: ${gate.maxWarnings}`);

    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(gate.command, { 
        timeout: gate.timeout,
        maxBuffer: 1024 * 1024 * 5 // 5MB buffer for large outputs
      });
      
      const executionTime = Date.now() - startTime;
      const { errors, warnings } = this.parseOutput(stdout, stderr);
      
      const passed = errors <= gate.maxErrors && warnings <= gate.maxWarnings;
      
      console.log(`${passed ? '✅' : '❌'} ${gate.name}: ${errors} errors, ${warnings} warnings (${executionTime}ms)`);
      
      return {
        gate: gate.name,
        passed,
        errors,
        warnings,
        executionTime,
        output: stdout,
        errorOutput: stderr
      };
      
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      // Handle timeout
      if (error.signal === 'SIGTERM' || error.killed) {
        console.log(`⏰ ${gate.name}: TIMEOUT after ${gate.timeout / 1000}s`);
        return {
          gate: gate.name,
          passed: false,
          errors: 1,
          warnings: 0,
          executionTime,
          output: error.stdout || '',
          errorOutput: `Command timed out after ${gate.timeout}ms`
        };
      }
      
      // Handle command failure
      const { errors, warnings } = this.parseOutput(error.stdout || '', error.stderr || '');
      const passed = errors <= gate.maxErrors && warnings <= gate.maxWarnings;
      
      console.log(`${passed ? '⚠️' : '❌'} ${gate.name}: ${errors} errors, ${warnings} warnings (${executionTime}ms)`);
      
      return {
        gate: gate.name,
        passed,
        errors,
        warnings,
        executionTime,
        output: error.stdout || '',
        errorOutput: error.stderr || error.message
      };
    }
  }

  public async runAllGates(): Promise<QualityReport> {
    console.log('🚪 Starting Quality Gates Enforcement');
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    const results: QualityResult[] = [];
    const blockedBy: string[] = [];
    
    let totalErrors = 0;
    let totalWarnings = 0;
    
    // Execute all gates
    for (const gate of this.gates) {
      const result = await this.executeGate(gate);
      results.push(result);
      
      totalErrors += result.errors;
      totalWarnings += result.warnings;
      
      // Check if this gate is blocking
      if (!result.passed && gate.blocking) {
        blockedBy.push(gate.name);
      }
    }
    
    const executionTime = Date.now() - startTime;
    const overallPassed = blockedBy.length === 0;
    
    const report: QualityReport = {
      timestamp: new Date().toISOString(),
      overallPassed,
      totalErrors,
      totalWarnings,
      executionTime,
      results,
      blockedBy
    };
    
    return report;
  }

  public async saveReport(report: QualityReport): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `quality-gates-${timestamp}.json`;
    
    await writeFile(
      join(this.outputDir, filename),
      JSON.stringify(report, null, 2)
    );
    
    // Save as latest
    await writeFile(
      join(this.outputDir, 'latest.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\\n📊 Quality gates report saved: ${filename}`);
  }

  public printSummary(report: QualityReport): void {
    console.log('\\n' + '='.repeat(60));
    console.log('🚪 QUALITY GATES ENFORCEMENT REPORT');
    console.log('='.repeat(60));
    
    console.log(`🕒 Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`⏱️  Total Execution Time: ${(report.executionTime / 1000).toFixed(2)}s`);
    console.log(`❌ Total Errors: ${report.totalErrors}`);
    console.log(`⚠️  Total Warnings: ${report.totalWarnings}`);
    console.log(`${report.overallPassed ? '✅' : '❌'} Overall Status: ${report.overallPassed ? 'PASSED' : 'FAILED'}`);
    
    if (report.blockedBy.length > 0) {
      console.log(`\\n🚫 BLOCKED BY:`);
      for (const gate of report.blockedBy) {
        console.log(`  • ${gate}`);
      }
    }
    
    console.log('\\n📋 GATE RESULTS:');
    for (const result of report.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const time = `${result.executionTime}ms`;
      console.log(`  ${status} ${result.gate}: ${result.errors}E/${result.warnings}W (${time})`);
      
      // Show first few lines of error output if failed
      if (!result.passed && result.errorOutput) {
        const errorLines = result.errorOutput.split('\\n').slice(0, 3);
        for (const line of errorLines) {
          if (line.trim()) {
            console.log(`    💬 ${line.trim()}`);
          }
        }
      }
    }
    
    console.log('\\n' + '='.repeat(60));
    
    if (!report.overallPassed) {
      console.log('🚨 QUALITY GATES FAILED - Review and fix issues before proceeding');
    } else {
      console.log('🎉 ALL QUALITY GATES PASSED - Ready for deployment');
    }
  }

  public async generateRecommendations(report: QualityReport): Promise<void> {
    if (report.overallPassed) {
      return;
    }
    
    console.log('\\n💡 RECOMMENDATIONS:');
    
    for (const result of report.results.filter(r => !r.passed)) {
      console.log(`\\n🔧 ${result.gate}:`);
      
      switch (result.gate) {
        case 'TypeScript Compilation':
          console.log('  • Run: npx tsx scripts/error-tracker.ts for detailed error analysis');
          console.log('  • Focus on Result<T> monad and type constraint issues');
          console.log('  • Check import paths are relative (no path mapping)');
          break;
          
        case 'ESLint Code Quality':
          console.log('  • Run: npm run lint:fix to auto-fix issues');
          console.log('  • Review ESLint output for import rule violations');
          break;
          
        case 'Unit Tests':
          console.log('  • Run: npm run test:unit -- --verbose for detailed failures');
          console.log('  • Check test environment and mock configurations');
          break;
          
        case 'Integration Tests':
          console.log('  • Run: npm run test:integration -- --verbose --runInBand');
          console.log('  • Check Docker/K8s service availability');
          console.log('  • Verify test data and fixtures');
          break;
          
        case 'Infrastructure Validation':
          console.log('  • Review import patterns and logger usage');
          console.log('  • Ensure no path mapping imports (@domain/, @service/)');
          console.log('  • Check for backup files that need cleanup');
          break;
          
        case 'Code Formatting':
          console.log('  • Run: npm run format to auto-fix formatting');
          break;
      }
    }
  }
}

// Main execution
async function main() {
  const enforcer = new QualityGateEnforcer();
  
  try {
    const report = await enforcer.runAllGates();
    await enforcer.saveReport(report);
    enforcer.printSummary(report);
    await enforcer.generateRecommendations(report);
    
    // Exit with appropriate code for CI/CD integration
    process.exit(report.overallPassed ? 0 : 1);
    
  } catch (error) {
    console.error('Quality gates enforcement failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === new URL(import.meta.url).href) {
  main();
}