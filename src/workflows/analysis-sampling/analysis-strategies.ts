/**
 * Analysis Strategies - Different perspectives for repository analysis
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../types/core';
import type {
  AnalysisStrategy,
  AnalysisContext,
  AnalysisVariant,
  AnalysisScoringCriteria,
  AnalysisScoreDetails,
  FileAnalysisMetadata,
} from './types';
import {
  analyzeRepo,
  type AnalyzeRepoResult,
  type AnalyzeRepoConfig,
} from '../../tools/analyze-repo';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Base strategy with common analysis functionality
 */
abstract class BaseAnalysisStrategy implements AnalysisStrategy {
  abstract name: string;
  abstract description: string;
  abstract perspective:
    | 'comprehensive'
    | 'security'
    | 'performance'
    | 'architecture'
    | 'deployment';

  constructor(protected logger: Logger) {}

  abstract analyzeRepository(
    context: AnalysisContext,
    logger: Logger,
  ): Promise<Result<AnalysisVariant>>;

  /**
   * Common scoring logic with strategy-specific adjustments
   */
  async scoreAnalysis(
    variant: AnalysisVariant,
    criteria: AnalysisScoringCriteria,
    logger: Logger,
  ): Promise<Result<AnalysisScoreDetails>> {
    try {
      const scores = await this.computeScores(variant);

      const total =
        scores.accuracy * criteria.accuracy.weight +
        scores.completeness * criteria.completeness.weight +
        scores.relevance * criteria.relevance.weight +
        scores.actionability * criteria.actionability.weight;

      const scoreDetails: AnalysisScoreDetails = {
        total: Math.round(total),
        breakdown: scores,
        strengths: this.identifyStrengths(variant, scores),
        weaknesses: this.identifyWeaknesses(variant, scores),
        recommendations: this.generateRecommendations(variant, scores),
        confidence: variant.confidence,
      };

      logger.debug(
        {
          variant: variant.id,
          total: scoreDetails.total,
          breakdown: scores,
        },
        'Analysis variant scored',
      );

      return Success(scoreDetails);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, variant: variant.id }, 'Analysis scoring failed');
      return Failure(`Failed to score analysis variant: ${message}`);
    }
  }

  /**
   * Core analysis function that calls the base analyze-repo tool
   */
  protected async performBaseAnalysis(
    context: AnalysisContext,
  ): Promise<Result<AnalyzeRepoResult>> {
    const config: AnalyzeRepoConfig = {
      sessionId: `analysis-${Date.now()}`, // Generate session ID for analysis
      repoPath: context.repoPath,
    };

    if (context.depth !== undefined) {
      config.depth = context.depth;
    }

    if (context.includeTests !== undefined) {
      config.includeTests = context.includeTests;
    }

    return await analyzeRepo(config, this.logger);
  }

  /**
   * Enhanced file system analysis with perspective-specific focus
   */
  protected async analyzeFileSystem(
    repoPath: string,
    patterns: string[] = [],
  ): Promise<FileAnalysisMetadata[]> {
    const results: FileAnalysisMetadata[] = [];

    try {
      const files = await this.collectFiles(repoPath, patterns);

      for (const filePath of files) {
        try {
          const stats = await fs.stat(filePath);
          const relativePath = path.relative(repoPath, filePath);
          const ext = path.extname(filePath);

          const metadata: FileAnalysisMetadata = {
            path: relativePath,
            size: stats.size,
            language: this.detectLanguage(ext),
            importance: this.assessFileImportance(relativePath, ext),
            analysisDepth: this.determineAnalysisDepth(stats.size, ext),
            insights: [],
            risks: [],
          };

          // Add perspective-specific insights
          await this.addPerspectiveInsights(filePath, metadata);

          results.push(metadata);
        } catch (error) {
          // Skip files we can't access
          continue;
        }
      }
    } catch (error) {
      this.logger.warn({ error, repoPath }, 'Failed to analyze file system');
    }

    return results.slice(0, 100); // Limit to prevent overwhelming analysis
  }

  protected async collectFiles(repoPath: string, _patterns: string[]): Promise<string[]> {
    const files: string[] = [];
    const seen = new Set<string>();

    const traverse = async (dir: string, depth = 0): Promise<void> => {
      if (depth > 3) return; // Limit recursion depth

      try {
        const entries = await fs.readdir(dir);

        for (const entry of entries) {
          if (entry.startsWith('.') && entry !== '.env' && entry !== '.dockerignore') continue;
          if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build')
            continue;

          const fullPath = path.join(dir, entry);
          if (seen.has(fullPath)) continue;
          seen.add(fullPath);

          try {
            const stats = await fs.stat(fullPath);

            if (stats.isDirectory()) {
              await traverse(fullPath, depth + 1);
            } else if (stats.size < 1024 * 1024) {
              // Skip files > 1MB
              files.push(fullPath);
            }
          } catch (error) {
            // Skip inaccessible files
            continue;
          }
        }
      } catch (error) {
        // Skip inaccessible directories
        return;
      }
    };

    await traverse(repoPath);
    return files;
  }

  protected detectLanguage(extension: string): string {
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
      '.sh': 'shell',
      '.bash': 'shell',
      '.md': 'markdown',
      '.dockerfile': 'dockerfile',
      '': 'dockerfile',
    };

    return langMap[extension] || 'unknown';
  }

  protected assessFileImportance(
    filePath: string,
    ext: string,
  ): 'critical' | 'important' | 'useful' | 'optional' {
    const fileName = path.basename(filePath).toLowerCase();

    // Critical files for containerization
    if (fileName.includes('docker') || fileName === 'dockerfile') return 'critical';
    if (['package.json', 'requirements.txt', 'pom.xml', 'cargo.toml', 'go.mod'].includes(fileName))
      return 'critical';
    if (['config', 'env'].some((k) => fileName.includes(k))) return 'important';

    // Important source files
    if (['.ts', '.js', '.py', '.java', '.go', '.rs'].includes(ext)) return 'important';

    // Configuration files
    if (['.json', '.yaml', '.yml', '.toml', '.xml'].includes(ext)) return 'useful';

    return 'optional';
  }

  protected determineAnalysisDepth(
    size: number,
    _ext: string,
  ): 'full' | 'partial' | 'metadata-only' {
    if (size > 100000) return 'metadata-only'; // > 100KB
    if (size > 10000) return 'partial'; // > 10KB
    return 'full';
  }

  protected async addPerspectiveInsights(
    filePath: string,
    metadata: FileAnalysisMetadata,
  ): Promise<void> {
    // Base implementation - strategies can override
    const fileName = path.basename(filePath);

    if (fileName.includes('test') || fileName.includes('spec')) {
      metadata.insights.push('Contains test files');
    }

    if (fileName.includes('config')) {
      metadata.insights.push('Configuration file detected');
    }
  }

  // Abstract scoring methods that strategies must implement
  protected abstract computeScores(variant: AnalysisVariant): Promise<{
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
  }>;

  protected abstract identifyStrengths(variant: AnalysisVariant, scores: any): string[];
  protected abstract identifyWeaknesses(variant: AnalysisVariant, scores: any): string[];
  protected abstract generateRecommendations(variant: AnalysisVariant, scores: any): string[];
}

/**
 * Comprehensive analysis strategy - provides broad, detailed analysis
 */
export class ComprehensiveAnalysisStrategy extends BaseAnalysisStrategy {
  name = 'comprehensive-analysis';
  description = 'Provides broad, detailed analysis covering all aspects of the repository';
  perspective = 'comprehensive' as const;

  async analyzeRepository(
    context: AnalysisContext,
    _logger: Logger,
  ): Promise<Result<AnalysisVariant>> {
    try {
      const startTime = Date.now();

      // Perform base analysis
      const baseResult = await this.performBaseAnalysis(context);
      if (!baseResult.ok) {
        return Failure(`Base analysis failed: ${baseResult.error}`);
      }

      const baseAnalysis = baseResult.value;

      // Enhanced file system analysis
      const fileMetadata = await this.analyzeFileSystem(context.repoPath);

      // Generate comprehensive insights
      const insights = {
        keyFindings: this.generateKeyFindings(baseAnalysis, fileMetadata),
        riskAssessments: this.generateRiskAssessments(baseAnalysis, fileMetadata),
        optimizationOpportunities: this.generateOptimizations(baseAnalysis, fileMetadata),
        architecturalPatterns: this.identifyArchitecturalPatterns(baseAnalysis, fileMetadata),
        deploymentReadiness: this.assessDeploymentReadiness(baseAnalysis, fileMetadata),
      };

      const variant: AnalysisVariant = {
        ...baseAnalysis,
        id: `comprehensive-${Date.now()}`,
        strategy: this.name,
        perspective: this.perspective,
        insights,
        confidence: this.calculateConfidence(baseAnalysis, fileMetadata),
        completeness: this.calculateCompleteness(baseAnalysis, fileMetadata),
        analysisTime: Date.now() - startTime,
        filesAnalyzed: fileMetadata.length,
        generated: new Date(),
      };

      this.logger.info(
        { variant: variant.id, filesAnalyzed: fileMetadata.length },
        'Comprehensive analysis completed',
      );
      return Success(variant);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Comprehensive analysis failed: ${message}`);
    }
  }

  protected async computeScores(variant: AnalysisVariant): Promise<{
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
  }> {
    return {
      accuracy: Math.min(100, variant.confidence + 10), // Comprehensive tends to be accurate
      completeness: Math.min(100, variant.completeness + 20), // Highest completeness
      relevance: Math.min(100, 75 + variant.insights.keyFindings.length * 2),
      actionability: Math.min(100, 60 + variant.insights.optimizationOpportunities.length * 3),
    };
  }

  protected identifyStrengths(variant: AnalysisVariant, _scores: any): string[] {
    const strengths = ['Comprehensive coverage', 'Detailed findings'];
    if (variant.insights.keyFindings.length > 5) strengths.push('Rich insights');
    return strengths;
  }

  protected identifyWeaknesses(variant: AnalysisVariant, _scores: any): string[] {
    const weaknesses = [];
    if (variant.analysisTime > 30000) weaknesses.push('Analysis took significant time');
    return weaknesses;
  }

  protected generateRecommendations(variant: AnalysisVariant, _scores: any): string[] {
    const recommendations = [];
    if (variant.insights.optimizationOpportunities.length < 3)
      recommendations.push('Identify more optimization opportunities');
    return recommendations;
  }

  private generateKeyFindings(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const findings = [];

    findings.push(
      `Repository uses ${analysis.language}${analysis.framework ? ` with ${analysis.framework}` : ''}`,
    );
    findings.push(`Contains ${files.length} analyzed files`);

    if (analysis.hasDockerfile) findings.push('Already has Dockerfile');
    if (analysis.hasKubernetes) findings.push('Already has Kubernetes configuration');
    if (analysis.buildSystem) findings.push(`Build system: ${analysis.buildSystem.type}`);

    const criticalFiles = files.filter((f) => f.importance === 'critical').length;
    findings.push(`${criticalFiles} critical files identified`);

    return findings;
  }

  private generateRiskAssessments(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const risks = [];

    if (!analysis.hasDockerfile) risks.push('No existing containerization');
    if (analysis.dependencies.length > 50)
      risks.push('High dependency count may increase image size');
    if (files.some((f) => f.path.includes('.env')))
      risks.push('Environment files present - ensure secrets are handled properly');

    const largeFiles = files.filter((f) => f.size > 100000).length;
    if (largeFiles > 5) risks.push('Multiple large files detected');

    return risks;
  }

  private generateOptimizations(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const optimizations = [];

    if (!analysis.hasDockerfile) optimizations.push('Add Dockerfile for containerization');
    if (analysis.language === 'javascript' && !files.some((f) => f.path === '.dockerignore')) {
      optimizations.push('Add .dockerignore to exclude node_modules');
    }

    if (files.some((f) => f.path.includes('test'))) {
      optimizations.push('Consider multi-stage build to exclude test files from production');
    }

    return optimizations;
  }

  private identifyArchitecturalPatterns(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const patterns = [];

    if (files.some((f) => f.path.includes('microservice')))
      patterns.push('Microservices architecture detected');
    if (files.some((f) => f.path.includes('config/') || f.path.includes('configs/')))
      patterns.push('Configuration management pattern');
    if (analysis.framework) patterns.push(`${analysis.framework} framework pattern`);

    return patterns;
  }

  private assessDeploymentReadiness(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const readiness = [];

    if (analysis.hasDockerfile) readiness.push('Has existing Docker configuration');
    if (analysis.hasKubernetes) readiness.push('Kubernetes-ready');
    if (analysis.buildSystem) readiness.push('Build system configured');
    if (files.some((f) => f.path.includes('health')))
      readiness.push('Health check endpoints detected');

    return readiness;
  }

  private calculateConfidence(analysis: AnalyzeRepoResult, files: FileAnalysisMetadata[]): number {
    let confidence = 50;

    if (analysis.language && analysis.language !== 'unknown') confidence += 20;
    if (analysis.framework) confidence += 15;
    if (analysis.buildSystem) confidence += 10;
    if (files.length > 10) confidence += 5;

    return Math.min(100, confidence);
  }

  private calculateCompleteness(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): number {
    let completeness = 60;

    if (files.length > 20) completeness += 20;
    if (analysis.dependencies.length > 0) completeness += 10;
    if (analysis.ports.length > 0) completeness += 5;
    if (analysis.recommendations) completeness += 5;

    return Math.min(100, completeness);
  }
}

/**
 * Security-focused analysis strategy
 */
export class SecurityFocusedAnalysisStrategy extends BaseAnalysisStrategy {
  name = 'security-focused-analysis';
  description = 'Focuses on security vulnerabilities, secrets, and hardening opportunities';
  perspective = 'security' as const;

  async analyzeRepository(
    context: AnalysisContext,
    _logger: Logger,
  ): Promise<Result<AnalysisVariant>> {
    try {
      const startTime = Date.now();

      const baseResult = await this.performBaseAnalysis(context);
      if (!baseResult.ok) {
        return Failure(`Base analysis failed: ${baseResult.error}`);
      }

      const baseAnalysis = baseResult.value;
      const fileMetadata = await this.analyzeFileSystem(context.repoPath, [
        '**/config/**',
        '**/secrets/**',
        '**/.env*',
        '**/auth*',
        '**/security*',
      ]);

      const insights = {
        keyFindings: this.generateSecurityFindings(baseAnalysis, fileMetadata),
        riskAssessments: this.generateSecurityRisks(baseAnalysis, fileMetadata),
        optimizationOpportunities: this.generateSecurityOptimizations(baseAnalysis, fileMetadata),
        architecturalPatterns: this.identifySecurityPatterns(baseAnalysis, fileMetadata),
        deploymentReadiness: this.assessSecurityReadiness(baseAnalysis, fileMetadata),
      };

      const variant: AnalysisVariant = {
        ...baseAnalysis,
        id: `security-${Date.now()}`,
        strategy: this.name,
        perspective: this.perspective,
        insights,
        confidence: this.calculateSecurityConfidence(baseAnalysis, fileMetadata),
        completeness: this.calculateSecurityCompleteness(baseAnalysis, fileMetadata),
        analysisTime: Date.now() - startTime,
        filesAnalyzed: fileMetadata.length,
        generated: new Date(),
      };

      return Success(variant);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Security analysis failed: ${message}`);
    }
  }

  protected override async addPerspectiveInsights(
    filePath: string,
    metadata: FileAnalysisMetadata,
  ): Promise<void> {
    const fileName = path.basename(filePath).toLowerCase();
    const content = await this.readFileContent(filePath, metadata.analysisDepth);

    // Security-specific insights
    if (fileName.includes('env') || fileName.includes('secret')) {
      metadata.insights.push('Potential secrets file');
      metadata.risks.push('May contain sensitive information');
    }

    if (content && this.containsSensitiveData(content)) {
      metadata.risks.push('Contains potential sensitive data');
    }

    if (fileName.includes('auth') || fileName.includes('security')) {
      metadata.insights.push('Security-related file');
    }
  }

  private async readFileContent(
    filePath: string,
    depth: 'full' | 'partial' | 'metadata-only',
  ): Promise<string | null> {
    if (depth === 'metadata-only') return null;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return depth === 'partial' ? content.slice(0, 1000) : content;
    } catch (error) {
      return null;
    }
  }

  private containsSensitiveData(content: string): boolean {
    const sensitivePatterns = [
      /password\s*[=:]\s*["'][^"']+["']/i,
      /api[_-]?key\s*[=:]\s*["'][^"']+["']/i,
      /secret\s*[=:]\s*["'][^"']+["']/i,
      /token\s*[=:]\s*["'][^"']+["']/i,
      /-----BEGIN\s+(PRIVATE|RSA|DSA|EC)\s+KEY-----/i,
    ];

    return sensitivePatterns.some((pattern) => pattern.test(content));
  }

  protected async computeScores(variant: AnalysisVariant): Promise<{
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
  }> {
    const securityRiskCount = variant.insights.riskAssessments.length;
    const securityInsightCount = variant.insights.keyFindings.filter((f) =>
      f.toLowerCase().includes('security'),
    ).length;

    return {
      accuracy: Math.min(100, 70 + securityInsightCount * 5),
      completeness: Math.min(100, 60 + securityRiskCount * 3),
      relevance: Math.min(100, 85 + securityInsightCount * 2), // High relevance for security
      actionability: Math.min(100, 70 + variant.insights.optimizationOpportunities.length * 4),
    };
  }

  protected identifyStrengths(variant: AnalysisVariant, _scores: any): string[] {
    const strengths = ['Security-focused analysis', 'Risk identification'];
    if (variant.insights.riskAssessments.length > 3)
      strengths.push('Comprehensive risk assessment');
    return strengths;
  }

  protected identifyWeaknesses(variant: AnalysisVariant, _scores: any): string[] {
    const weaknesses = [];
    if (variant.insights.riskAssessments.length < 2)
      weaknesses.push('Limited security risks identified');
    return weaknesses;
  }

  protected generateRecommendations(variant: AnalysisVariant, _scores: any): string[] {
    const recommendations = [];
    if (variant.insights.riskAssessments.length > 5)
      recommendations.push('Prioritize high-impact security issues');
    recommendations.push('Implement security scanning in CI/CD pipeline');
    return recommendations;
  }

  private generateSecurityFindings(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const findings = [];

    const secretFiles = files.filter(
      (f) => f.path.includes('env') || f.path.includes('secret'),
    ).length;
    if (secretFiles > 0) findings.push(`${secretFiles} potential secret files found`);

    const securityFiles = files.filter(
      (f) => f.path.includes('auth') || f.path.includes('security'),
    ).length;
    if (securityFiles > 0) findings.push(`${securityFiles} security-related files detected`);

    if (!analysis.hasDockerfile) findings.push('No existing container security configuration');

    return findings;
  }

  private generateSecurityRisks(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const risks = [];

    if (files.some((f) => f.risks.some((r) => r.includes('sensitive')))) {
      risks.push('Potential secrets in source code');
    }

    if (analysis.dependencies.some((d) => d.name.includes('express') && !d.version)) {
      risks.push('Unpinned dependencies may introduce vulnerabilities');
    }

    if (!files.some((f) => f.path.includes('security') || f.path.includes('auth'))) {
      risks.push('No explicit security implementation detected');
    }

    return risks;
  }

  private generateSecurityOptimizations(
    _analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const optimizations = [];

    optimizations.push('Use non-root user in Docker container');
    optimizations.push('Implement secrets management solution');

    if (files.some((f) => f.path.includes('.env'))) {
      optimizations.push('Use .dockerignore to exclude .env files');
    }

    optimizations.push('Add security scanning to build pipeline');

    return optimizations;
  }

  private identifySecurityPatterns(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const patterns = [];

    if (files.some((f) => f.path.includes('middleware')))
      patterns.push('Middleware security pattern');
    if (files.some((f) => f.path.includes('jwt') || f.path.includes('token')))
      patterns.push('Token-based authentication');
    if (analysis.framework === 'express') patterns.push('Express.js security considerations');

    return patterns;
  }

  private assessSecurityReadiness(
    _analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const readiness = [];

    if (files.some((f) => f.path.includes('auth'))) readiness.push('Authentication system present');
    if (!files.some((f) => f.path.includes('.env')))
      readiness.push('No obvious secret files in repository');

    readiness.push('Requires security hardening for production deployment');

    return readiness;
  }

  private calculateSecurityConfidence(
    _analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): number {
    let confidence = 40;

    const securityFiles = files.filter(
      (f) => f.path.includes('security') || f.path.includes('auth') || f.path.includes('crypto'),
    ).length;

    confidence += securityFiles * 10;
    confidence += files.filter((f) => f.risks.length > 0).length * 5;

    return Math.min(100, confidence);
  }

  private calculateSecurityCompleteness(
    _analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): number {
    let completeness = 30;

    if (files.some((f) => f.path.includes('auth'))) completeness += 25;
    if (files.some((f) => f.path.includes('security'))) completeness += 20;
    if (files.some((f) => f.risks.length > 0)) completeness += 15;

    return Math.min(100, completeness);
  }
}

/**
 * Performance-focused analysis strategy
 */
export class PerformanceFocusedAnalysisStrategy extends BaseAnalysisStrategy {
  name = 'performance-focused-analysis';
  description =
    'Focuses on performance bottlenecks, optimization opportunities, and resource efficiency';
  perspective = 'performance' as const;

  async analyzeRepository(
    context: AnalysisContext,
    _logger: Logger,
  ): Promise<Result<AnalysisVariant>> {
    try {
      const startTime = Date.now();

      const baseResult = await this.performBaseAnalysis(context);
      if (!baseResult.ok) {
        return Failure(`Base analysis failed: ${baseResult.error}`);
      }

      const baseAnalysis = baseResult.value;
      const fileMetadata = await this.analyzeFileSystem(context.repoPath, [
        '**/perf*',
        '**/benchmark*',
        '**/cache*',
        '**/optimization*',
      ]);

      const insights = {
        keyFindings: this.generatePerformanceFindings(baseAnalysis, fileMetadata),
        riskAssessments: this.generatePerformanceRisks(baseAnalysis, fileMetadata),
        optimizationOpportunities: this.generatePerformanceOptimizations(
          baseAnalysis,
          fileMetadata,
        ),
        architecturalPatterns: this.identifyPerformancePatterns(baseAnalysis, fileMetadata),
        deploymentReadiness: this.assessPerformanceReadiness(baseAnalysis, fileMetadata),
      };

      const variant: AnalysisVariant = {
        ...baseAnalysis,
        id: `performance-${Date.now()}`,
        strategy: this.name,
        perspective: this.perspective,
        insights,
        confidence: this.calculatePerformanceConfidence(baseAnalysis, fileMetadata),
        completeness: this.calculatePerformanceCompleteness(baseAnalysis, fileMetadata),
        analysisTime: Date.now() - startTime,
        filesAnalyzed: fileMetadata.length,
        generated: new Date(),
      };

      return Success(variant);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Performance analysis failed: ${message}`);
    }
  }

  protected async computeScores(variant: AnalysisVariant): Promise<{
    accuracy: number;
    completeness: number;
    relevance: number;
    actionability: number;
  }> {
    const perfOptimizations = variant.insights.optimizationOpportunities.length;
    const perfRisks = variant.insights.riskAssessments.filter((r) =>
      r.includes('performance'),
    ).length;

    return {
      accuracy: Math.min(100, 65 + perfRisks * 5),
      completeness: Math.min(100, 50 + perfOptimizations * 4),
      relevance: Math.min(100, 80 + perfOptimizations * 3),
      actionability: Math.min(100, 75 + perfOptimizations * 5),
    };
  }

  protected identifyStrengths(variant: AnalysisVariant, _scores: any): string[] {
    const strengths = ['Performance-focused insights', 'Optimization opportunities'];
    if (variant.insights.optimizationOpportunities.length > 4)
      strengths.push('Rich optimization suggestions');
    return strengths;
  }

  protected identifyWeaknesses(variant: AnalysisVariant, _scores: any): string[] {
    const weaknesses = [];
    if (variant.insights.optimizationOpportunities.length < 2)
      weaknesses.push('Limited optimization opportunities identified');
    return weaknesses;
  }

  protected generateRecommendations(_variant: AnalysisVariant, _scores: any): string[] {
    const recommendations = [];
    recommendations.push('Implement performance monitoring');
    recommendations.push('Consider caching strategies for production');
    return recommendations;
  }

  private generatePerformanceFindings(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const findings = [];

    const largeFiles = files.filter((f) => f.size > 50000).length;
    if (largeFiles > 0) findings.push(`${largeFiles} large files may impact build performance`);

    if (analysis.dependencies.length > 30) {
      findings.push('High dependency count may impact startup time');
    }

    if (files.some((f) => f.path.includes('cache'))) {
      findings.push('Caching mechanism detected');
    }

    return findings;
  }

  private generatePerformanceRisks(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const risks = [];

    if (analysis.dependencies.length > 100) {
      risks.push('Excessive dependencies may cause slow startup and large image size');
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 10 * 1024 * 1024) {
      // > 10MB
      risks.push('Large codebase may result in slow Docker builds');
    }

    if (
      !files.some(
        (f) => f.path.includes('cache') || f.path.includes('redis') || f.path.includes('memcache'),
      )
    ) {
      risks.push('No caching layer detected - may impact performance');
    }

    return risks;
  }

  private generatePerformanceOptimizations(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const optimizations = [];

    optimizations.push('Use multi-stage Docker build to reduce final image size');
    optimizations.push('Implement Docker layer caching for faster builds');

    if (analysis.language === 'javascript') {
      optimizations.push('Consider using npm ci instead of npm install for reproducible builds');
    }

    if (files.filter((f) => f.path.includes('test')).length > 10) {
      optimizations.push('Exclude test files from production Docker image');
    }

    optimizations.push('Add resource limits to prevent container resource exhaustion');

    return optimizations;
  }

  private identifyPerformancePatterns(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const patterns = [];

    if (files.some((f) => f.path.includes('worker') || f.path.includes('queue'))) {
      patterns.push('Background processing pattern detected');
    }

    if (files.some((f) => f.path.includes('cache'))) {
      patterns.push('Caching pattern implementation');
    }

    if (analysis.framework === 'express') {
      patterns.push('Express.js performance considerations');
    }

    return patterns;
  }

  private assessPerformanceReadiness(
    _analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): string[] {
    const readiness = [];

    if (files.some((f) => f.path.includes('health'))) {
      readiness.push('Health check endpoints for monitoring');
    }

    if (files.some((f) => f.path.includes('metrics') || f.path.includes('monitoring'))) {
      readiness.push('Performance monitoring capabilities');
    }

    readiness.push('Requires performance testing and optimization for production load');

    return readiness;
  }

  private calculatePerformanceConfidence(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): number {
    let confidence = 45;

    if (files.some((f) => f.path.includes('performance') || f.path.includes('perf')))
      confidence += 15;
    if (files.some((f) => f.path.includes('benchmark'))) confidence += 10;
    if (analysis.buildSystem) confidence += 10;

    return Math.min(100, confidence);
  }

  private calculatePerformanceCompleteness(
    analysis: AnalyzeRepoResult,
    files: FileAnalysisMetadata[],
  ): number {
    let completeness = 40;

    if (files.some((f) => f.path.includes('cache'))) completeness += 20;
    if (files.some((f) => f.path.includes('optimization'))) completeness += 15;
    if (analysis.dependencies.length > 0) completeness += 10;

    return Math.min(100, completeness);
  }
}

/**
 * Strategy engine for managing analysis strategies
 */
export class AnalysisStrategyEngine {
  private strategies: Map<string, AnalysisStrategy> = new Map();

  constructor(private logger: Logger) {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies(): void {
    const strategies = [
      new ComprehensiveAnalysisStrategy(this.logger),
      new SecurityFocusedAnalysisStrategy(this.logger),
      new PerformanceFocusedAnalysisStrategy(this.logger),
    ];

    strategies.forEach((strategy) => {
      this.strategies.set(strategy.name, strategy);
    });

    this.logger.info({ count: strategies.length }, 'Analysis strategies registered');
  }

  /**
   * Register a custom analysis strategy
   */
  registerStrategy(strategy: AnalysisStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info({ strategy: strategy.name }, 'Custom analysis strategy registered');
  }

  /**
   * Get available strategy names
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get strategy by name
   */
  getStrategy(name: string): AnalysisStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Generate analysis variants using specified strategies
   */
  async generateAnalysisVariants(
    context: AnalysisContext,
    strategyNames?: string[],
  ): Promise<Result<AnalysisVariant[]>> {
    const selectedStrategies = strategyNames || this.getAvailableStrategies();
    const variants: AnalysisVariant[] = [];
    const errors: string[] = [];

    for (const strategyName of selectedStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (!strategy) {
        errors.push(`Unknown strategy: ${strategyName}`);
        continue;
      }

      try {
        const result = await strategy.analyzeRepository(context, this.logger);
        if (result.ok) {
          variants.push(result.value);
        } else {
          errors.push(`${strategyName}: ${result.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${strategyName}: ${message}`);
      }
    }

    if (variants.length === 0) {
      return Failure(`No analysis variants generated. Errors: ${errors.join('; ')}`);
    }

    if (errors.length > 0) {
      this.logger.warn({ errors }, 'Some analysis strategies failed');
    }

    this.logger.info(
      {
        variantCount: variants.length,
        strategies: variants.map((v) => v.strategy),
      },
      'Analysis variants generated successfully',
    );

    return Success(variants);
  }
}
