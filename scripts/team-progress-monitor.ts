#!/usr/bin/env node
/**
 * Team Progress Monitor
 * Tracks team-specific error reduction and cross-team dependencies
 */

import { exec } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface TeamMetrics {
  name: string;
  errorCount: number;
  warningCount: number;
  filesWithErrors: string[];
  topErrorCategories: Record<string, number>;
  trend: {
    changeFromPrevious: number;
    percentageChange: number;
  };
  blockers: string[];
  dependsOn: string[];
}

interface CrossTeamDependency {
  fromTeam: string;
  toTeam: string;
  errorCount: number;
  blockingIssues: string[];
  description: string;
}

interface TeamProgressReport {
  timestamp: string;
  overallProgress: {
    totalErrors: number;
    totalReduction: number;
    percentageReduction: number;
  };
  teams: TeamMetrics[];
  crossTeamDependencies: CrossTeamDependency[];
  recommendations: string[];
  alerts: string[];
}

class TeamProgressMonitor {
  private readonly outputDir = './reports/team-progress';
  
  private readonly teamConfig = {
    'team-a-core': {
      name: 'Team A: Core Infrastructure & Types',
      patterns: ['/shared/', '/domain/types/', '/errors/result'],
      priority: 'CRITICAL',
      dependsOn: [],
      dependencies: ['team-b-application', 'team-c-infrastructure', 'team-d-platform']
    },
    'team-b-application': {
      name: 'Team B: Application Layer & Tools',
      patterns: ['/application/tools/', '/application/workflow/', '/application/errors/'],
      priority: 'HIGH',
      dependsOn: ['team-a-core'],
      dependencies: ['team-c-infrastructure']
    },
    'team-c-infrastructure': {
      name: 'Team C: Infrastructure & External Clients',
      patterns: ['/infrastructure/', '/services/'],
      priority: 'HIGH',
      dependsOn: ['team-a-core'],
      dependencies: ['team-d-platform']
    },
    'team-d-platform': {
      name: 'Team D: Platform & Entry Points',
      patterns: ['apps/', '/application/resources/'],
      priority: 'MEDIUM',
      dependsOn: ['team-a-core', 'team-b-application', 'team-c-infrastructure'],
      dependencies: []
    }
  };

  constructor() {
    this.ensureOutputDir();
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  private assignTeamToFile(filePath: string): string {
    for (const [teamId, config] of Object.entries(this.teamConfig)) {
      if (config.patterns.some(pattern => filePath.includes(pattern))) {
        return teamId;
      }
    }
    return 'unassigned';
  }

  private categorizeError(message: string, code: string): string {
    if (message.includes('Result<') || message.includes('Success') || message.includes('Failure')) {
      return 'result-monad';
    }
    if (code.startsWith('TS2322') || code.startsWith('TS2345')) {
      return 'type-assignment';
    }
    if (code.startsWith('TS2307') || message.includes('Cannot find module')) {
      return 'module-resolution';
    }
    if (code.startsWith('TS2339')) {
      return 'property-access';
    }
    if (message.includes('undefined') && message.includes('not assignable')) {
      return 'optional-properties';
    }
    return 'other';
  }

  private async parseTypeScriptErrors(): Promise<{ team: string; file: string; category: string; severity: string }[]> {
    const errors: { team: string; file: string; category: string; severity: string }[] = [];
    
    try {
      await execAsync('npm run typecheck');
      return []; // No errors
    } catch (error: any) {
      const output = error.stderr || error.stdout || '';
      const lines = output.split('\\n').filter(line => line.trim());
      
      for (const line of lines) {
        const errorMatch = line.match(/^(.+)\\((\\d+),(\\d+)\\):\\s*(error|warning)\\s+TS(\\d+):\\s*(.+)$/);
        
        if (errorMatch) {
          const [, file, , , severity, code, message] = errorMatch;
          const team = this.assignTeamToFile(file);
          const category = this.categorizeError(message, `TS${code}`);
          
          errors.push({
            team,
            file: file.replace(process.cwd(), ''),
            category,
            severity
          });
        }
      }
    }
    
    return errors;
  }

  private async getPreviousReport(): Promise<TeamProgressReport | null> {
    try {
      const content = await readFile(join(this.outputDir, 'latest.json'), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private calculateTeamTrend(currentCount: number, teamId: string, previousReport: TeamProgressReport | null): { changeFromPrevious: number; percentageChange: number } {
    if (!previousReport) {
      return { changeFromPrevious: 0, percentageChange: 0 };
    }
    
    const previousTeam = previousReport.teams.find(t => t.name === this.teamConfig[teamId as keyof typeof this.teamConfig].name);
    if (!previousTeam) {
      return { changeFromPrevious: 0, percentageChange: 0 };
    }
    
    const changeFromPrevious = currentCount - previousTeam.errorCount;
    const percentageChange = previousTeam.errorCount > 0 
      ? (changeFromPrevious / previousTeam.errorCount) * 100 
      : 0;
    
    return { changeFromPrevious, percentageChange };
  }

  private identifyBlockers(teamId: string, teamErrors: any[], allErrors: any[]): string[] {
    const blockers: string[] = [];
    const config = this.teamConfig[teamId as keyof typeof this.teamConfig];
    
    // Check if dependencies have critical errors that block this team
    for (const dependency of config.dependsOn) {
      const depConfig = this.teamConfig[dependency as keyof typeof this.teamConfig];
      const depErrors = allErrors.filter(e => e.team === dependency);
      
      // Critical blocking conditions
      const hasResultMonadErrors = depErrors.some(e => e.category === 'result-monad');
      const hasModuleResolutionErrors = depErrors.some(e => e.category === 'module-resolution');
      
      if (hasResultMonadErrors) {
        blockers.push(`${depConfig.name} has Result<T> monad errors blocking type definitions`);
      }
      
      if (hasModuleResolutionErrors) {
        blockers.push(`${depConfig.name} has module resolution errors blocking imports`);
      }
      
      if (depErrors.length > 20) {
        blockers.push(`${depConfig.name} has ${depErrors.length} errors requiring immediate attention`);
      }
    }
    
    return blockers;
  }

  private identifyCrossTeamDependencies(allErrors: any[]): CrossTeamDependency[] {
    const dependencies: CrossTeamDependency[] = [];
    
    // Team A → All teams (Result<T> and core types)
    const teamAErrors = allErrors.filter(e => e.team === 'team-a-core' && e.category === 'result-monad');
    if (teamAErrors.length > 0) {
      dependencies.push({
        fromTeam: 'Team A: Core Infrastructure',
        toTeam: 'All Teams',
        errorCount: teamAErrors.length,
        blockingIssues: ['Result<T> timestamp property missing', 'Generic type constraints'],
        description: 'Core type definitions must be fixed before other teams can resolve their errors'
      });
    }
    
    // Team C → Team D (Service interfaces)
    const teamCServiceErrors = allErrors.filter(e => 
      e.team === 'team-c-infrastructure' && 
      (e.category === 'property-access' || e.category === 'type-assignment')
    );
    if (teamCServiceErrors.length > 0) {
      dependencies.push({
        fromTeam: 'Team C: Infrastructure',
        toTeam: 'Team D: Platform',
        errorCount: teamCServiceErrors.length,
        blockingIssues: ['SessionService interface mismatches', 'AI client configuration types'],
        description: 'Service layer interfaces must be stabilized for platform integration'
      });
    }
    
    return dependencies;
  }

  private generateRecommendations(teams: TeamMetrics[], dependencies: CrossTeamDependency[]): string[] {
    const recommendations: string[] = [];
    
    // Team A priority recommendations
    const teamA = teams.find(t => t.name.includes('Team A'));
    if (teamA && teamA.errorCount > 0) {
      recommendations.push('🚨 PRIORITY: Team A must fix Result<T> monad errors immediately - all teams blocked');
      
      if (teamA.topErrorCategories['result-monad'] > 0) {
        recommendations.push('• Add timestamp property to Result<T> interface in src/shared/result.ts');
      }
      
      if (teamA.topErrorCategories['generic-constraints'] > 0) {
        recommendations.push('• Fix generic type constraints with exactOptionalPropertyTypes');
      }
    }
    
    // Team coordination recommendations
    const blockedTeams = teams.filter(t => t.blockers.length > 0);
    if (blockedTeams.length > 0) {
      recommendations.push(`📋 COORDINATION: ${blockedTeams.length} teams have blockers requiring cross-team resolution`);
    }
    
    // Progress recommendations
    const stagnantTeams = teams.filter(t => Math.abs(t.trend.changeFromPrevious) < 2 && t.errorCount > 10);
    if (stagnantTeams.length > 0) {
      recommendations.push(`⚠️ ATTENTION: Teams with minimal progress may need additional support or different approach`);
    }
    
    return recommendations;
  }

  private generateAlerts(teams: TeamMetrics[], dependencies: CrossTeamDependency[]): string[] {
    const alerts: string[] = [];
    
    // Error increase alerts
    for (const team of teams) {
      if (team.trend.percentageChange > 15) {
        alerts.push(`🚨 ${team.name}: Error count increased by ${team.trend.percentageChange.toFixed(1)}%`);
      }
    }
    
    // Critical blocking alerts
    const criticalDependencies = dependencies.filter(d => d.errorCount > 10);
    for (const dep of criticalDependencies) {
      alerts.push(`🚫 BLOCKING: ${dep.fromTeam} has ${dep.errorCount} errors blocking ${dep.toTeam}`);
    }
    
    // Milestone alerts
    const totalErrors = teams.reduce((sum, t) => sum + t.errorCount, 0);
    if (totalErrors > 200) {
      alerts.push('📈 HIGH: Total error count exceeds 200 - consider parallel team escalation');
    } else if (totalErrors < 50) {
      alerts.push('🎯 MILESTONE: Under 50 errors - prepare for final integration testing');
    }
    
    return alerts;
  }

  public async generateReport(): Promise<TeamProgressReport> {
    console.log('📊 Analyzing team progress and dependencies...');
    
    const allErrors = await this.parseTypeScriptErrors();
    const previousReport = await this.getPreviousReport();
    
    const teams: TeamMetrics[] = [];
    
    // Process each team
    for (const [teamId, config] of Object.entries(this.teamConfig)) {
      const teamErrors = allErrors.filter(e => e.team === teamId);
      const errorCount = teamErrors.filter(e => e.severity === 'error').length;
      const warningCount = teamErrors.filter(e => e.severity === 'warning').length;
      
      // Top error categories
      const topErrorCategories: Record<string, number> = {};
      for (const error of teamErrors) {
        topErrorCategories[error.category] = (topErrorCategories[error.category] || 0) + 1;
      }
      
      // Files with errors
      const filesWithErrors = [...new Set(teamErrors.map(e => e.file))];
      
      // Calculate trend
      const trend = this.calculateTeamTrend(errorCount, teamId, previousReport);
      
      // Identify blockers
      const blockers = this.identifyBlockers(teamId, teamErrors, allErrors);
      
      teams.push({
        name: config.name,
        errorCount,
        warningCount,
        filesWithErrors,
        topErrorCategories,
        trend,
        blockers,
        dependsOn: config.dependsOn.map(dep => this.teamConfig[dep as keyof typeof this.teamConfig].name)
      });
    }
    
    // Calculate overall progress
    const totalErrors = teams.reduce((sum, t) => sum + t.errorCount, 0);
    const previousTotal = previousReport?.overallProgress.totalErrors || totalErrors;
    const totalReduction = previousTotal - totalErrors;
    const percentageReduction = previousTotal > 0 ? (totalReduction / previousTotal) * 100 : 0;
    
    const crossTeamDependencies = this.identifyCrossTeamDependencies(allErrors);
    const recommendations = this.generateRecommendations(teams, crossTeamDependencies);
    const alerts = this.generateAlerts(teams, crossTeamDependencies);
    
    return {
      timestamp: new Date().toISOString(),
      overallProgress: {
        totalErrors,
        totalReduction,
        percentageReduction
      },
      teams: teams.sort((a, b) => b.errorCount - a.errorCount), // Sort by error count desc
      crossTeamDependencies,
      recommendations,
      alerts
    };
  }

  public async saveReport(report: TeamProgressReport): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `team-progress-${timestamp}.json`;
    
    await writeFile(
      join(this.outputDir, filename),
      JSON.stringify(report, null, 2)
    );
    
    await writeFile(
      join(this.outputDir, 'latest.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`📊 Team progress report saved: ${filename}`);
  }

  public printSummary(report: TeamProgressReport): void {
    console.log('\\n' + '='.repeat(70));
    console.log('👥 TEAM PROGRESS MONITORING REPORT');
    console.log('='.repeat(70));
    
    console.log(`🕒 Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
    console.log(`🎯 Total Errors: ${report.overallProgress.totalErrors}`);
    
    if (report.overallProgress.totalReduction !== 0) {
      const arrow = report.overallProgress.totalReduction > 0 ? '📉' : '📈';
      const sign = report.overallProgress.totalReduction > 0 ? '-' : '+';
      console.log(`${arrow} Progress: ${sign}${Math.abs(report.overallProgress.totalReduction)} errors (${report.overallProgress.percentageReduction.toFixed(1)}%)`);
    }
    
    // Team breakdown
    console.log('\\n👥 TEAM BREAKDOWN:');
    for (const team of report.teams) {
      const trendIndicator = team.trend.changeFromPrevious < 0 ? '📉' : team.trend.changeFromPrevious > 0 ? '📈' : '➡️';
      const priority = team.name.includes('Team A') ? '🚨' : '📋';
      
      console.log(`\\n${priority} ${team.name}:`);
      console.log(`  Errors: ${team.errorCount} | Warnings: ${team.warningCount} | Files: ${team.filesWithErrors.length}`);
      
      if (team.trend.changeFromPrevious !== 0) {
        const sign = team.trend.changeFromPrevious > 0 ? '+' : '';
        console.log(`  Trend: ${trendIndicator} ${sign}${team.trend.changeFromPrevious} (${team.trend.percentageChange.toFixed(1)}%)`);
      }
      
      if (Object.keys(team.topErrorCategories).length > 0) {
        const topCategories = Object.entries(team.topErrorCategories)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        console.log(`  Top Issues: ${topCategories.map(([cat, count]) => `${cat}(${count})`).join(', ')}`);
      }
      
      if (team.blockers.length > 0) {
        console.log(`  🚫 Blockers: ${team.blockers.length}`);
        team.blockers.forEach(blocker => console.log(`    • ${blocker}`));
      }
    }
    
    // Cross-team dependencies
    if (report.crossTeamDependencies.length > 0) {
      console.log('\\n🔗 CROSS-TEAM DEPENDENCIES:');
      for (const dep of report.crossTeamDependencies) {
        console.log(`  ${dep.fromTeam} → ${dep.toTeam}: ${dep.errorCount} blocking errors`);
        console.log(`    💬 ${dep.description}`);
      }
    }
    
    // Alerts
    if (report.alerts.length > 0) {
      console.log('\\n🚨 ALERTS:');
      for (const alert of report.alerts) {
        console.log(`  ${alert}`);
      }
    }
    
    // Recommendations
    if (report.recommendations.length > 0) {
      console.log('\\n💡 RECOMMENDATIONS:');
      for (const rec of report.recommendations) {
        console.log(`  ${rec}`);
      }
    }
    
    console.log('\\n' + '='.repeat(70));
  }
}

// Main execution
async function main() {
  const monitor = new TeamProgressMonitor();
  
  try {
    const report = await monitor.generateReport();
    await monitor.saveReport(report);
    monitor.printSummary(report);
    
    // Exit with warning code if there are critical alerts
    const hasCriticalAlerts = report.alerts.some(alert => alert.includes('🚨') || alert.includes('🚫'));
    process.exit(hasCriticalAlerts ? 2 : 0);
    
  } catch (error) {
    console.error('Team progress monitoring failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === new URL(import.meta.url).href) {
  main();
}