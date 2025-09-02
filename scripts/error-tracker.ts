#!/usr/bin/env node
/**
 * TypeScript Error Tracker
 * Monitors, categorizes, and tracks TypeScript compilation errors across teams
 */

import { exec } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  category: string;
  team: string;
  severity: 'error' | 'warning';
}

interface ErrorReport {
  timestamp: string;
  totalErrors: number;
  totalWarnings: number;
  errorsByTeam: Record<string, number>;
  errorsByCategory: Record<string, number>;
  errors: TypeScriptError[];
  trendData: {
    changeFromPrevious: number;
    percentageChange: number;
  };
}

class TypeScriptErrorTracker {
  private readonly outputDir = './reports/error-tracking';
  
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

  private categorizeError(message: string, code: string): string {
    // Result<T> related errors
    if (message.includes('Result<') || message.includes('Success') || message.includes('Failure')) {
      return 'result-monad';
    }
    
    // Type assignment/compatibility errors
    if (code.startsWith('TS2322') || code.startsWith('TS2345') || code.startsWith('TS2344')) {
      return 'type-assignment';
    }
    
    // Generic constraint errors
    if (code.startsWith('TS2344') || message.includes('not assignable to constraint')) {
      return 'generic-constraints';
    }
    
    // Import/module resolution errors
    if (code.startsWith('TS2307') || code.startsWith('TS2305') || message.includes('Cannot find module')) {
      return 'module-resolution';
    }
    
    // Interface/property errors
    if (code.startsWith('TS2339') || message.includes('Property') && message.includes('does not exist')) {
      return 'property-access';
    }
    
    // Function signature errors
    if (code.startsWith('TS2554') || code.startsWith('TS2555')) {
      return 'function-signature';
    }
    
    // Optional property errors (exactOptionalPropertyTypes)
    if (message.includes('undefined') && message.includes('not assignable')) {
      return 'optional-properties';
    }
    
    return 'other';
  }

  private assignTeam(filePath: string): string {
    // Team A: Core Infrastructure & Types
    if (filePath.includes('/shared/') || filePath.includes('/domain/types/')) {
      return 'team-a-core';
    }
    
    // Team B: Application Layer & Tools
    if (filePath.includes('/application/tools/') || 
        filePath.includes('/application/workflow/') || 
        filePath.includes('/application/errors/')) {
      return 'team-b-application';
    }
    
    // Team C: Infrastructure & External Clients
    if (filePath.includes('/infrastructure/') || filePath.includes('/services/')) {
      return 'team-c-infrastructure';
    }
    
    // Team D: Platform & Entry Points
    if (filePath.includes('apps/') || filePath.includes('/application/resources/')) {
      return 'team-d-platform';
    }
    
    return 'unassigned';
  }

  private parseTypeScriptOutput(output: string): TypeScriptError[] {
    const errors: TypeScriptError[] = [];
    const lines = output.split('\\n').filter(line => line.trim());
    
    for (const line of lines) {
      // Match TypeScript error format: file(line,column): error TSxxxx: message
      const errorMatch = line.match(/^(.+)\\((\\d+),(\\d+)\\):\\s*(error|warning)\\s+TS(\\d+):\\s*(.+)$/);
      
      if (errorMatch) {
        const [, file, lineNum, column, severity, code, message] = errorMatch;
        const category = this.categorizeError(message, `TS${code}`);
        const team = this.assignTeam(file);
        
        errors.push({
          file: file.replace(process.cwd(), ''),
          line: parseInt(lineNum, 10),
          column: parseInt(column, 10),
          code: `TS${code}`,
          message: message.trim(),
          category,
          team,
          severity: severity as 'error' | 'warning'
        });
      }
    }
    
    return errors;
  }

  private async getPreviousReport(): Promise<ErrorReport | null> {
    try {
      const files = await readFile(join(this.outputDir, 'latest.json'), 'utf-8');
      return JSON.parse(files);
    } catch {
      return null;
    }
  }

  private calculateTrend(currentCount: number, previousReport: ErrorReport | null): { changeFromPrevious: number; percentageChange: number } {
    if (!previousReport) {
      return { changeFromPrevious: 0, percentageChange: 0 };
    }
    
    const changeFromPrevious = currentCount - previousReport.totalErrors;
    const percentageChange = previousReport.totalErrors > 0 
      ? (changeFromPrevious / previousReport.totalErrors) * 100 
      : 0;
    
    return { changeFromPrevious, percentageChange };
  }

  public async generateReport(): Promise<ErrorReport> {
    console.log('🔍 Running TypeScript compilation to gather errors...');
    
    try {
      // Run TypeScript compiler and capture output
      await execAsync('npm run typecheck');
      console.log('✅ No TypeScript errors found!');
      
      const previousReport = await this.getPreviousReport();
      const trendData = this.calculateTrend(0, previousReport);
      
      return {
        timestamp: new Date().toISOString(),
        totalErrors: 0,
        totalWarnings: 0,
        errorsByTeam: {},
        errorsByCategory: {},
        errors: [],
        trendData
      };
    } catch (error: any) {
      // TypeScript errors are expected, capture them from stderr
      const output = error.stderr || error.stdout || '';
      const errors = this.parseTypeScriptOutput(output);
      
      // Categorize and count errors
      const errorsByTeam: Record<string, number> = {};
      const errorsByCategory: Record<string, number> = {};
      let totalErrors = 0;
      let totalWarnings = 0;
      
      for (const err of errors) {
        errorsByTeam[err.team] = (errorsByTeam[err.team] || 0) + 1;
        errorsByCategory[err.category] = (errorsByCategory[err.category] || 0) + 1;
        
        if (err.severity === 'error') {
          totalErrors++;
        } else {
          totalWarnings++;
        }
      }
      
      const previousReport = await this.getPreviousReport();
      const trendData = this.calculateTrend(totalErrors, previousReport);
      
      return {
        timestamp: new Date().toISOString(),
        totalErrors,
        totalWarnings,
        errorsByTeam,
        errorsByCategory,
        errors,
        trendData
      };
    }
  }

  public async saveReport(report: ErrorReport): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `error-report-${timestamp}.json`;
    
    // Save timestamped report
    await writeFile(
      join(this.outputDir, filename),
      JSON.stringify(report, null, 2)
    );
    
    // Save as latest for trend analysis
    await writeFile(
      join(this.outputDir, 'latest.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`📊 Error report saved: ${filename}`);
  }

  public printSummary(report: ErrorReport): void {
    console.log('\\n' + '='.repeat(60));
    console.log('📊 TYPESCRIPT ERROR TRACKING REPORT');
    console.log('='.repeat(60));
    
    console.log(`🕒 Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`❌ Total Errors: ${report.totalErrors}`);
    console.log(`⚠️  Total Warnings: ${report.totalWarnings}`);
    
    if (report.trendData.changeFromPrevious !== 0) {
      const arrow = report.trendData.changeFromPrevious > 0 ? '↗️' : '↘️';
      const sign = report.trendData.changeFromPrevious > 0 ? '+' : '';
      console.log(`📈 Change: ${arrow} ${sign}${report.trendData.changeFromPrevious} (${report.trendData.percentageChange.toFixed(1)}%)`);
    }
    
    console.log('\\n📋 ERRORS BY TEAM:');
    for (const [team, count] of Object.entries(report.errorsByTeam).sort((a, b) => b[1] - a[1])) {
      const teamName = team.replace('-', ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      console.log(`  ${teamName}: ${count} errors`);
    }
    
    console.log('\\n🏷️  ERRORS BY CATEGORY:');
    for (const [category, count] of Object.entries(report.errorsByCategory).sort((a, b) => b[1] - a[1])) {
      const categoryName = category.replace('-', ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      console.log(`  ${categoryName}: ${count} errors`);
    }
    
    // Alert for significant increases
    if (report.trendData.percentageChange > 10) {
      console.log('\\n🚨 ALERT: Error count increased by >10% since last run!');
    } else if (report.trendData.changeFromPrevious < -10) {
      console.log('\\n🎉 PROGRESS: Significant error reduction since last run!');
    }
    
    console.log('\\n' + '='.repeat(60));
  }

  public async checkForRegressions(report: ErrorReport): Promise<boolean> {
    // Alert threshold: more than 10% increase in errors
    if (report.trendData.percentageChange > 10) {
      console.log('\\n🚨 REGRESSION DETECTED!');
      console.log(`Error count increased by ${report.trendData.percentageChange.toFixed(1)}%`);
      console.log('Consider reverting recent changes or implementing fixes immediately.');
      return true;
    }
    
    return false;
  }
}

// Main execution
async function main() {
  const tracker = new TypeScriptErrorTracker();
  
  try {
    const report = await tracker.generateReport();
    await tracker.saveReport(report);
    tracker.printSummary(report);
    
    const hasRegression = await tracker.checkForRegressions(report);
    
    // Exit with error code if regression detected (for CI/CD integration)
    process.exit(hasRegression ? 1 : 0);
    
  } catch (error) {
    console.error('Error tracking failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}