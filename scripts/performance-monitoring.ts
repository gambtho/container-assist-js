#!/usr/bin/env tsx

/**
 * Performance Monitoring and Baseline Management
 * 
 * This script monitors test performance and maintains baselines:
 * - Tracks test execution times
 * - Detects performance regressions
 * - Updates performance baselines
 * - Generates performance reports
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  testSuite: string;
  executionTime: number;
  memoryUsage: {
    peak: number;
    average: number;
    final: number;
  };
  cpuUsage: number;
  testCount: number;
  passRate: number;
  timestamp: string;
}

interface PerformanceBaseline {
  version: string;
  lastUpdated: string;
  metrics: Record<string, {
    executionTime: number;
    memoryPeak: number;
    testCount: number;
    baselineDate: string;
    samples: PerformanceMetrics[];
  }>;
}

interface PerformanceReport {
  timestamp: string;
  overallStatus: 'excellent' | 'good' | 'warning' | 'critical';
  summary: {
    totalTests: number;
    totalExecutionTime: number;
    regressionCount: number;
    improvementCount: number;
  };
  testSuites: Array<{
    name: string;
    status: 'excellent' | 'good' | 'warning' | 'critical';
    currentMetrics: PerformanceMetrics;
    baselineComparison: {
      executionTimeDelta: number;
      memoryDelta: number;
      isRegression: boolean;
      isImprovement: boolean;
    };
  }>;
  recommendations: string[];
}

class PerformanceMonitor {
  private projectRoot: string;
  private baselinePath: string;
  private reportPath: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.baselinePath = path.join(this.projectRoot, 'test/baselines/performance-baseline.json');
    this.reportPath = path.join(this.projectRoot, 'performance-report.json');
  }

  async runPerformanceMonitoring(): Promise<void> {
    console.log('📊 Running Performance Monitoring\n');

    const currentMetrics = await this.collectCurrentMetrics();
    const baseline = await this.loadBaseline();
    const report = await this.generatePerformanceReport(currentMetrics, baseline);
    
    await this.saveReport(report);
    await this.updateBaseline(currentMetrics, baseline);
    
    this.printSummary(report);
  }

  private async collectCurrentMetrics(): Promise<PerformanceMetrics[]> {
    console.log('🔍 Collecting performance metrics...');
    
    const testSuites = ['unit', 'integration', 'e2e'];
    const metrics: PerformanceMetrics[] = [];

    for (const suite of testSuites) {
      console.log(`  Running ${suite} tests...`);
      
      const startTime = performance.now();
      const startMemory = process.memoryUsage();
      
      try {
        const result = await this.runTestSuite(suite);
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        
        metrics.push({
          testSuite: suite,
          executionTime: Math.round(endTime - startTime),
          memoryUsage: {
            peak: Math.max(endMemory.heapUsed, startMemory.heapUsed),
            average: (endMemory.heapUsed + startMemory.heapUsed) / 2,
            final: endMemory.heapUsed
          },
          cpuUsage: await this.getCPUUsage(),
          testCount: result.testCount,
          passRate: result.passRate,
          timestamp: new Date().toISOString()
        });
        
        console.log(`    ✓ ${suite} completed in ${Math.round(endTime - startTime)}ms`);
      } catch (error) {
        console.log(`    ❌ ${suite} failed: ${error.message}`);
        
        // Add error metrics
        metrics.push({
          testSuite: suite,
          executionTime: -1,
          memoryUsage: { peak: 0, average: 0, final: 0 },
          cpuUsage: 0,
          testCount: 0,
          passRate: 0,
          timestamp: new Date().toISOString()
        });
      }
    }

    return metrics;
  }

  private async runTestSuite(suite: string): Promise<{ testCount: number; passRate: number }> {
    const command = `npm run test:${suite} -- --verbose --json`;
    
    try {
      const output = execSync(command, {
        cwd: this.projectRoot,
        encoding: 'utf8',
        timeout: 600000 // 10 minutes
      });
      
      // Parse Jest JSON output
      const lines = output.split('\n').filter(line => line.trim().startsWith('{'));
      
      if (lines.length > 0) {
        const result = JSON.parse(lines[lines.length - 1]);
        
        return {
          testCount: result.numTotalTests || 0,
          passRate: result.numTotalTests ? 
            (result.numPassedTests / result.numTotalTests) * 100 : 0
        };
      }
      
      return { testCount: 0, passRate: 0 };
    } catch (error) {
      throw new Error(`Test suite ${suite} execution failed: ${error.message}`);
    }
  }

  private async getCPUUsage(): Promise<number> {
    try {
      const usage = process.cpuUsage();
      return (usage.user + usage.system) / 1000000; // Convert to seconds
    } catch {
      return 0;
    }
  }

  private async loadBaseline(): Promise<PerformanceBaseline> {
    try {
      await fs.access(this.baselinePath);
      const content = await fs.readFile(this.baselinePath, 'utf8');
      return JSON.parse(content);
    } catch {
      // Create new baseline
      return {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        metrics: {}
      };
    }
  }

  private async generatePerformanceReport(
    currentMetrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<PerformanceReport> {
    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      overallStatus: 'excellent',
      summary: {
        totalTests: 0,
        totalExecutionTime: 0,
        regressionCount: 0,
        improvementCount: 0
      },
      testSuites: [],
      recommendations: []
    };

    for (const metrics of currentMetrics) {
      if (metrics.executionTime === -1) {
        // Test suite failed
        report.testSuites.push({
          name: metrics.testSuite,
          status: 'critical',
          currentMetrics: metrics,
          baselineComparison: {
            executionTimeDelta: 0,
            memoryDelta: 0,
            isRegression: true,
            isImprovement: false
          }
        });
        continue;
      }

      const baselineMetrics = baseline.metrics[metrics.testSuite];
      let status: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
      let executionTimeDelta = 0;
      let memoryDelta = 0;
      let isRegression = false;
      let isImprovement = false;

      if (baselineMetrics) {
        executionTimeDelta = metrics.executionTime - baselineMetrics.executionTime;
        memoryDelta = metrics.memoryUsage.peak - baselineMetrics.memoryPeak;
        
        const timeDeltaPercentage = (executionTimeDelta / baselineMetrics.executionTime) * 100;
        const memoryDeltaPercentage = (memoryDelta / baselineMetrics.memoryPeak) * 100;

        // Determine status based on performance changes
        if (timeDeltaPercentage > 20 || memoryDeltaPercentage > 30) {
          status = 'critical';
          isRegression = true;
        } else if (timeDeltaPercentage > 10 || memoryDeltaPercentage > 15) {
          status = 'warning';
          isRegression = true;
        } else if (timeDeltaPercentage < -5 && memoryDeltaPercentage < -10) {
          status = 'excellent';
          isImprovement = true;
        } else {
          status = 'good';
        }
      }

      report.testSuites.push({
        name: metrics.testSuite,
        status,
        currentMetrics: metrics,
        baselineComparison: {
          executionTimeDelta,
          memoryDelta,
          isRegression,
          isImprovement
        }
      });

      // Update summary
      report.summary.totalTests += metrics.testCount;
      report.summary.totalExecutionTime += metrics.executionTime;
      
      if (isRegression) {
        report.summary.regressionCount++;
      }
      if (isImprovement) {
        report.summary.improvementCount++;
      }
    }

    // Determine overall status
    const criticalCount = report.testSuites.filter(s => s.status === 'critical').length;
    const warningCount = report.testSuites.filter(s => s.status === 'warning').length;

    if (criticalCount > 0) {
      report.overallStatus = 'critical';
    } else if (warningCount > 0) {
      report.overallStatus = 'warning';
    } else if (report.summary.improvementCount > 0) {
      report.overallStatus = 'excellent';
    } else {
      report.overallStatus = 'good';
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  private generateRecommendations(report: PerformanceReport): string[] {
    const recommendations: string[] = [];

    // Check for critical performance issues
    const criticalSuites = report.testSuites.filter(s => s.status === 'critical');
    if (criticalSuites.length > 0) {
      recommendations.push(
        `Address critical performance issues in: ${criticalSuites.map(s => s.name).join(', ')}`
      );
    }

    // Check for memory usage
    const highMemorySuites = report.testSuites.filter(
      s => s.currentMetrics.memoryUsage.peak > 500 * 1024 * 1024 // > 500MB
    );
    if (highMemorySuites.length > 0) {
      recommendations.push(
        `Consider optimizing memory usage in: ${highMemorySuites.map(s => s.name).join(', ')}`
      );
    }

    // Check for slow test execution
    const slowSuites = report.testSuites.filter(
      s => s.currentMetrics.executionTime > 120000 // > 2 minutes
    );
    if (slowSuites.length > 0) {
      recommendations.push(
        `Consider optimizing test execution time in: ${slowSuites.map(s => s.name).join(', ')}`
      );
    }

    // Check for low pass rates
    const lowPassRateSuites = report.testSuites.filter(
      s => s.currentMetrics.passRate < 95
    );
    if (lowPassRateSuites.length > 0) {
      recommendations.push(
        `Investigate test failures in: ${lowPassRateSuites.map(s => s.name).join(', ')}`
      );
    }

    // Positive feedback for improvements
    const improvedSuites = report.testSuites.filter(s => s.baselineComparison.isImprovement);
    if (improvedSuites.length > 0) {
      recommendations.push(
        `🎉 Performance improvements detected in: ${improvedSuites.map(s => s.name).join(', ')}`
      );
    }

    return recommendations;
  }

  private async updateBaseline(
    currentMetrics: PerformanceMetrics[],
    baseline: PerformanceBaseline
  ): Promise<void> {
    console.log('📈 Updating performance baseline...');
    
    let updated = false;

    for (const metrics of currentMetrics) {
      if (metrics.executionTime === -1) continue; // Skip failed tests

      const existing = baseline.metrics[metrics.testSuite];
      
      // Update baseline if this is an improvement or first run
      if (!existing || 
          (metrics.executionTime < existing.executionTime * 0.9 && // 10% improvement
           metrics.memoryUsage.peak < existing.memoryPeak * 1.1)) { // Not significant memory increase
        
        if (!baseline.metrics[metrics.testSuite]) {
          baseline.metrics[metrics.testSuite] = {
            executionTime: metrics.executionTime,
            memoryPeak: metrics.memoryUsage.peak,
            testCount: metrics.testCount,
            baselineDate: new Date().toISOString(),
            samples: []
          };
        } else {
          baseline.metrics[metrics.testSuite].executionTime = metrics.executionTime;
          baseline.metrics[metrics.testSuite].memoryPeak = metrics.memoryUsage.peak;
          baseline.metrics[metrics.testSuite].testCount = metrics.testCount;
          baseline.metrics[metrics.testSuite].baselineDate = new Date().toISOString();
        }
        
        updated = true;
        console.log(`  ✓ Updated baseline for ${metrics.testSuite}`);
      }

      // Keep recent samples for trend analysis
      if (!baseline.metrics[metrics.testSuite]) {
        baseline.metrics[metrics.testSuite] = {
          executionTime: metrics.executionTime,
          memoryPeak: metrics.memoryUsage.peak,
          testCount: metrics.testCount,
          baselineDate: new Date().toISOString(),
          samples: []
        };
      }

      baseline.metrics[metrics.testSuite].samples.push(metrics);
      
      // Keep only last 10 samples
      if (baseline.metrics[metrics.testSuite].samples.length > 10) {
        baseline.metrics[metrics.testSuite].samples = 
          baseline.metrics[metrics.testSuite].samples.slice(-10);
      }
    }

    if (updated) {
      baseline.lastUpdated = new Date().toISOString();
      
      await fs.mkdir(path.dirname(this.baselinePath), { recursive: true });
      await fs.writeFile(this.baselinePath, JSON.stringify(baseline, null, 2));
      
      console.log(`  💾 Saved updated baseline to ${this.baselinePath}`);
    }
  }

  private async saveReport(report: PerformanceReport): Promise<void> {
    await fs.writeFile(this.reportPath, JSON.stringify(report, null, 2));
  }

  private printSummary(report: PerformanceReport): void {
    console.log('\n📊 Performance Monitoring Summary\n');
    console.log('='.repeat(50));

    const statusEmoji = {
      excellent: '🟢',
      good: '🟡',
      warning: '🟠',
      critical: '🔴'
    };

    console.log(`Overall Status: ${statusEmoji[report.overallStatus]} ${report.overallStatus.toUpperCase()}`);
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Total Execution Time: ${Math.round(report.summary.totalExecutionTime / 1000)}s`);
    console.log(`Performance Regressions: ${report.summary.regressionCount}`);
    console.log(`Performance Improvements: ${report.summary.improvementCount}`);

    console.log('\nTest Suite Performance:');
    console.log('='.repeat(50));

    for (const suite of report.testSuites) {
      const status = `${statusEmoji[suite.status]} ${suite.status}`;
      const time = suite.currentMetrics.executionTime === -1 ? 'FAILED' : 
        `${Math.round(suite.currentMetrics.executionTime / 1000)}s`;
      const memory = suite.currentMetrics.memoryUsage.peak === 0 ? 'N/A' :
        `${Math.round(suite.currentMetrics.memoryUsage.peak / 1024 / 1024)}MB`;
      const tests = suite.currentMetrics.testCount;
      const passRate = `${Math.round(suite.currentMetrics.passRate)}%`;

      console.log(`${suite.name.padEnd(15)} ${status.padEnd(15)} ${time.padEnd(10)} ${memory.padEnd(8)} ${tests.toString().padEnd(6)} ${passRate}`);

      if (suite.baselineComparison.isRegression) {
        const timeDelta = suite.baselineComparison.executionTimeDelta > 0 ? 
          `+${Math.round(suite.baselineComparison.executionTimeDelta / 1000)}s` :
          `${Math.round(suite.baselineComparison.executionTimeDelta / 1000)}s`;
        console.log(`                └─ Regression: ${timeDelta} vs baseline`);
      } else if (suite.baselineComparison.isImprovement) {
        const timeDelta = Math.abs(Math.round(suite.baselineComparison.executionTimeDelta / 1000));
        console.log(`                └─ Improvement: -${timeDelta}s vs baseline`);
      }
    }

    if (report.recommendations.length > 0) {
      console.log('\nRecommendations:');
      console.log('='.repeat(50));
      report.recommendations.forEach(rec => console.log(`• ${rec}`));
    }

    console.log(`\n📄 Full report saved to: ${this.reportPath}`);
  }
}

// CLI interface
async function main() {
  const monitor = new PerformanceMonitor();
  await monitor.runPerformanceMonitoring();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Performance monitoring failed:', error);
    process.exit(1);
  });
}

export { PerformanceMonitor, type PerformanceMetrics, type PerformanceReport };