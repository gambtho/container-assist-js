/**
 * Enhanced Repository Analysis Tool - Team Delta Implementation
 *
 * Extends the original analyze-repo tool with MCP resource publishing,
 * progress reporting, and structured output for large analysis results.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Logger } from 'pino';
import type {
  SamplingAwareTool,
  EnhancedToolContext,
  EnhancedToolResult,
  ResourceReference,
} from '../interfaces';
import type { Result } from '../../../types/core/index';
import type { MCPToolCallResponse } from '../../../types/tools';
import { Success, Failure } from '../../../types/core/index';

// Re-export original interfaces for compatibility
export type { AnalyzeRepoConfig, AnalyzeRepoResult } from '../../../tools/analyze-repo';

/**
 * Enhanced repository analysis result with resource links
 */
export interface EnhancedAnalyzeRepoResult extends EnhancedToolResult {
  // Core inline data (always small)
  summary: string;
  language: string;
  framework: string | undefined;
  hasDockerfile: boolean;
  hasKubernetes: boolean;

  // Resource references for large data
  resources?: {
    detailedAnalysis?: ResourceReference;
    dependencyGraph?: ResourceReference;
    recommendations?: ResourceReference;
    securityReport?: ResourceReference;
  };

  // Analysis metadata
  analysisMetadata: {
    filesScanned: number;
    dependenciesFound: number;
    portsDetected: number;
    analysisDepth: number;
  };
}

/**
 * Enhanced repository analysis tool with MCP capabilities
 */
export class EnhancedAnalyzeRepositoryTool implements SamplingAwareTool {
  readonly name = 'analyze-repository';
  readonly description =
    'Analyze repository structure with enhanced MCP resource publishing and progress reporting';
  readonly supportsSampling = false; // Analysis doesn't use sampling
  readonly supportsResources = true;
  readonly supportsDynamicConfig = true;

  readonly capabilities = {
    progressReporting: true,
    resourcePublishing: true,
    candidateGeneration: false,
    errorRecovery: true,
  };

  constructor(private logger: Logger) {}

  async execute(
    params: Record<string, unknown>,
    context: EnhancedToolContext,
  ): Promise<Result<MCPToolCallResponse>> {
    const startTime = Date.now();

    try {
      // Extract and validate parameters
      const config = this.extractConfig(params);
      if (!config.success) {
        return Failure(config.error);
      }

      const { sessionId, repoPath, depth = 3, includeTests = false } = config.data;

      // Set up progress reporting
      context.progressReporter.reportProgress('validate_path', 0, 'Starting repository analysis');

      // Validate repository path
      const validation = await this.validateRepositoryPath(repoPath);
      if (!validation.valid) {
        context.progressReporter.reportError(validation.error ?? 'Invalid repository path', false);
        return Failure(validation.error ?? 'Invalid repository path');
      }

      context.progressReporter.reportProgress('validate_path', 100, 'Repository path validated');

      // Perform enhanced analysis with progress reporting
      const analysisResult = await this.performEnhancedAnalysis(
        { sessionId, repoPath, depth, includeTests },
        context,
      );

      if (!analysisResult.success) {
        return analysisResult;
      }

      const executionTime = Date.now() - startTime;
      context.progressReporter.reportComplete(
        `Repository analysis completed in ${executionTime}ms`,
      );

      // Create MCP response with resource publishing
      return await this.createMCPResponse(analysisResult.data, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.progressReporter.reportError(errorMessage, true);

      this.logger.error(
        {
          sessionId: context.sessionId,
          error: errorMessage,
          executionTime: Date.now() - startTime,
        },
        'Enhanced repository analysis failed',
      );

      return Failure(errorMessage);
    }
  }

  private extractConfig(params: Record<string, unknown>): Result<{
    sessionId: string;
    repoPath: string;
    depth?: number;
    includeTests?: boolean;
  }> {
    if (!params.sessionId || typeof params.sessionId !== 'string') {
      return Failure('sessionId is required and must be a string');
    }

    if (!params.repoPath || typeof params.repoPath !== 'string') {
      return Failure('repoPath is required and must be a string');
    }

    return Success({
      sessionId: params.sessionId,
      repoPath: params.repoPath,
      depth: typeof params.depth === 'number' ? params.depth : 3,
      includeTests: typeof params.includeTests === 'boolean' ? params.includeTests : false,
    });
  }

  private async validateRepositoryPath(
    repoPath: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        return { valid: false, error: 'Path is not a directory' };
      }
      await fs.access(repoPath, fs.constants.R_OK);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Cannot access repository: ${String(error)}` };
    }
  }

  private async performEnhancedAnalysis(
    config: { sessionId: string; repoPath: string; depth: number; includeTests: boolean },
    context: EnhancedToolContext,
  ): Promise<Result<EnhancedAnalyzeRepoResult>> {
    const { sessionId, repoPath, depth, includeTests } = config;

    // Step 1: Language detection
    context.progressReporter.reportProgress('detect_language', 0, 'Detecting programming language');
    const languageInfo = await this.detectLanguage(repoPath);
    context.progressReporter.reportProgress(
      'detect_language',
      100,
      `Detected language: ${languageInfo.language}`,
    );

    // Step 2: Framework detection
    context.progressReporter.reportProgress('detect_framework', 0, 'Detecting framework');
    const frameworkInfo = await this.detectFramework(repoPath, languageInfo.language);
    const framework = frameworkInfo?.framework;
    context.progressReporter.reportProgress(
      'detect_framework',
      100,
      framework ? `Detected framework: ${framework}` : 'No framework detected',
    );

    // Step 3: Dependency analysis
    context.progressReporter.reportProgress('analyze_dependencies', 0, 'Analyzing dependencies');
    const dependencies = await this.analyzeDependencies(repoPath, languageInfo.language);
    context.progressReporter.reportProgress(
      'analyze_dependencies',
      100,
      `Found ${dependencies.length} dependencies`,
    );

    // Step 4: Structure analysis
    context.progressReporter.reportProgress('analyze_structure', 0, 'Analyzing project structure');
    const structureInfo = await this.analyzeProjectStructure(repoPath, depth, includeTests);
    context.progressReporter.reportProgress(
      'analyze_structure',
      100,
      `Scanned ${structureInfo.filesScanned} files`,
    );

    // Step 5: Generate recommendations
    context.progressReporter.reportProgress(
      'generate_recommendations',
      0,
      'Generating recommendations',
    );
    const recommendations = await this.generateEnhancedRecommendations(
      languageInfo,
      frameworkInfo,
      dependencies,
      structureInfo,
    );
    context.progressReporter.reportProgress(
      'generate_recommendations',
      100,
      'Recommendations generated',
    );

    // Create detailed analysis object for resource publishing
    const detailedAnalysis = {
      basic: {
        sessionId,
        language: languageInfo.language,
        languageVersion: languageInfo.version,
        framework,
        frameworkVersion: frameworkInfo?.version,
      },
      structure: structureInfo,
      dependencies: dependencies.map((dep) => ({
        name: dep.name,
        version: dep.version,
        type: dep.type,
        vulnerable: this.checkVulnerability(dep.name),
        size: this.estimatePackageSize(dep.name),
      })),
      security: {
        vulnerableDependencies: dependencies.filter((dep) => this.checkVulnerability(dep.name)),
        securityScore: this.calculateSecurityScore(dependencies, structureInfo),
        recommendations: recommendations.securityNotes,
      },
      dockerization: {
        hasDockerfile: structureInfo.hasDockerfile,
        hasDockerCompose: structureInfo.hasDockerCompose,
        recommendedBaseImage: recommendations.baseImage,
        buildStrategy: recommendations.buildStrategy,
        estimatedImageSize: this.estimateImageSize(languageInfo.language, dependencies.length),
      },
      kubernetes: {
        hasKubernetes: structureInfo.hasKubernetes,
        deploymentComplexity: this.assessDeploymentComplexity(structureInfo, dependencies),
        resourceRequirements: this.estimateResourceRequirements(languageInfo.language, framework),
      },
      metadata: {
        analysisTimestamp: new Date().toISOString(),
        analysisDepth: depth,
        includeTests,
        repoPath,
      },
    };

    // Build the enhanced result
    const enhancedResult: EnhancedAnalyzeRepoResult = {
      success: true,
      sessionId,
      summary: this.createAnalysisSummary(languageInfo, framework, dependencies, structureInfo),
      status: 'completed',
      language: languageInfo.language,
      framework: framework || undefined,
      hasDockerfile: structureInfo.hasDockerfile,
      hasKubernetes: structureInfo.hasKubernetes,
      analysisMetadata: {
        filesScanned: structureInfo.filesScanned,
        dependenciesFound: dependencies.length,
        portsDetected: structureInfo.ports.length,
        analysisDepth: 1,
      },
      executionTimeMs: 0, // Will be set by caller
    };

    // Publish detailed analysis as resource if it's large
    if (context.resourcePublisher) {
      try {
        const detailedResource = await context.resourcePublisher.publish(
          detailedAnalysis,
          'application/json',
          3600, // 1 hour TTL
        );

        const recommendationsResource = await context.resourcePublisher.publish(
          recommendations,
          'application/json',
          1800, // 30 minute TTL
        );

        enhancedResult.resources = {
          detailedAnalysis: detailedResource,
          recommendations: recommendationsResource,
        };

        // Publish dependency graph if complex
        if (dependencies.length > 20) {
          const dependencyGraph = this.createDependencyGraph(dependencies);
          const graphResource = await context.resourcePublisher.publish(
            dependencyGraph,
            'application/json',
          );
          enhancedResult.resources.dependencyGraph = graphResource;
        }

        // Publish security report if vulnerabilities found
        const vulnerabilities = dependencies.filter((dep) => this.checkVulnerability(dep.name));
        if (vulnerabilities.length > 0) {
          const securityReport = this.createSecurityReport(vulnerabilities, structureInfo);
          const securityResource = await context.resourcePublisher.publish(
            securityReport,
            'application/json',
          );
          enhancedResult.resources.securityReport = securityResource;
        }
      } catch (error) {
        this.logger.warn({ error }, 'Failed to publish analysis resources');
      }
    }

    return Success(enhancedResult);
  }

  private async createMCPResponse(
    result: EnhancedAnalyzeRepoResult,
    _context: EnhancedToolContext,
  ): Promise<Result<MCPToolCallResponse>> {
    try {
      const summary = `Repository Analysis Complete:
- Language: ${result.language}${result.framework ? ` (${result.framework})` : ''}
- Files scanned: ${result.analysisMetadata.filesScanned}
- Dependencies: ${result.analysisMetadata.dependenciesFound}
- Ports detected: ${result.analysisMetadata.portsDetected}
- Docker ready: ${result.hasDockerfile ? 'Yes' : 'No'}
- Kubernetes ready: ${result.hasKubernetes ? 'Yes' : 'No'}`;

      const content: MCPToolCallResponse['content'] = [
        {
          type: 'text',
          text: summary,
        },
      ];

      // Add resource references if available
      if (result.resources) {
        if (result.resources.detailedAnalysis) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.detailedAnalysis.uri,
              mimeType: result.resources.detailedAnalysis.mimeType,
              text: 'Detailed repository analysis with structure, dependencies, and metadata',
            },
          });
        }

        if (result.resources.recommendations) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.recommendations.uri,
              mimeType: result.resources.recommendations.mimeType,
              text: 'Containerization and deployment recommendations',
            },
          });
        }

        if (result.resources.dependencyGraph) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.dependencyGraph.uri,
              mimeType: result.resources.dependencyGraph.mimeType,
              text: 'Dependency graph and relationship analysis',
            },
          });
        }

        if (result.resources.securityReport) {
          content.push({
            type: 'resource',
            resource: {
              uri: result.resources.securityReport.uri,
              mimeType: result.resources.securityReport.mimeType,
              text: 'Security vulnerability report and remediation suggestions',
            },
          });
        }
      }

      return Success({ content });
    } catch (error) {
      return Failure(
        `Failed to create MCP response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Enhanced analysis helper methods
  private async detectLanguage(repoPath: string): Promise<{ language: string; version?: string }> {
    // Simplified implementation - in production would use more sophisticated detection
    const files = await fs.readdir(repoPath);

    if (files.includes('package.json')) {
      const packageContent = await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8');
      const packageData = JSON.parse(packageContent);
      return {
        language: files.some((f) => f.endsWith('.ts')) ? 'typescript' : 'javascript',
        version: packageData.engines?.node,
      };
    }

    if (files.includes('requirements.txt') || files.includes('setup.py')) {
      return { language: 'python' };
    }

    if (files.includes('go.mod')) {
      return { language: 'go' };
    }

    return { language: 'unknown' };
  }

  private async detectFramework(
    repoPath: string,
    language: string,
  ): Promise<{ framework?: string; version?: string }> {
    if (language === 'javascript' || language === 'typescript') {
      const packageJsonPath = path.join(repoPath, 'package.json');
      try {
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageData = JSON.parse(packageContent);
        const deps = { ...packageData.dependencies, ...packageData.devDependencies };

        if (deps.next) return { framework: 'nextjs', version: deps.next };
        if (deps.express) return { framework: 'express', version: deps.express };
        if (deps.react) return { framework: 'react', version: deps.react };
      } catch {
        // Package.json not found or invalid
      }
    }

    return {};
  }

  private async analyzeDependencies(
    repoPath: string,
    language: string,
  ): Promise<
    Array<{
      name: string;
      version?: string;
      type: string;
    }>
  > {
    const dependencies: Array<{ name: string; version?: string; type: string }> = [];

    if (language === 'javascript' || language === 'typescript') {
      const packageJsonPath = path.join(repoPath, 'package.json');
      try {
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageData = JSON.parse(packageContent);

        for (const [name, version] of Object.entries(packageData.dependencies ?? {})) {
          dependencies.push({ name, version: String(version), type: 'production' });
        }

        for (const [name, version] of Object.entries(packageData.devDependencies ?? {})) {
          dependencies.push({ name, version: String(version), type: 'development' });
        }
      } catch {
        // Package.json not found or invalid
      }
    }

    return dependencies;
  }

  private async analyzeProjectStructure(
    repoPath: string,
    _depth: number,
    includeTests: boolean,
  ): Promise<{
    filesScanned: number;
    hasDockerfile: boolean;
    hasDockerCompose: boolean;
    hasKubernetes: boolean;
    ports: number[];
    testFiles: number;
    configFiles: string[];
  }> {
    const files = await fs.readdir(repoPath);

    return {
      filesScanned: files.length,
      hasDockerfile: files.includes('Dockerfile'),
      hasDockerCompose:
        files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
      hasKubernetes: files.includes('k8s') || files.includes('kubernetes'),
      ports: [3000, 8080], // Simplified - would scan for actual ports
      testFiles: includeTests
        ? files.filter((f) => f.includes('test') || f.includes('spec')).length
        : 0,
      configFiles: files.filter((f) => f.endsWith('.config.js') || f.endsWith('.json')),
    };
  }

  private async generateEnhancedRecommendations(
    languageInfo: { language: string },
    _frameworkInfo: { framework?: string } | undefined,
    dependencies: Array<{ name: string }>,
    structureInfo: { hasDockerfile: boolean },
  ): Promise<{
    baseImage: string;
    buildStrategy: string;
    securityNotes: string[];
    optimizations: string[];
    nextSteps: string[];
  }> {
    const baseImages: Record<string, string> = {
      javascript: 'node:18-alpine',
      typescript: 'node:18-alpine',
      python: 'python:3.11-slim',
      java: 'openjdk:17-alpine',
      go: 'golang:1.21-alpine',
    };

    const securityNotes = [
      'Use multi-stage builds to minimize attack surface',
      'Run containers as non-root user',
      'Regularly scan images for vulnerabilities',
    ];

    const optimizations = [
      'Use .dockerignore to exclude unnecessary files',
      'Leverage Docker layer caching',
      'Use specific version tags instead of latest',
    ];

    const nextSteps = [
      structureInfo.hasDockerfile
        ? 'Review existing Dockerfile for optimizations'
        : 'Generate optimized Dockerfile',
      'Set up CI/CD pipeline for automated builds',
      'Configure security scanning in pipeline',
    ];

    return {
      baseImage: baseImages[languageInfo.language] ?? 'alpine:latest',
      buildStrategy: dependencies.length > 10 ? 'multi-stage' : 'single-stage',
      securityNotes,
      optimizations,
      nextSteps,
    };
  }

  // Utility methods
  private createAnalysisSummary(
    languageInfo: { language: string },
    framework: string | undefined,
    dependencies: Array<{ name: string }>,
    structureInfo: { filesScanned: number; hasDockerfile: boolean; hasKubernetes: boolean },
  ): string {
    return (
      `${languageInfo.language}${framework ? ` (${framework})` : ''} project with ${dependencies.length} dependencies. ` +
      `${structureInfo.filesScanned} files scanned. ` +
      `${structureInfo.hasDockerfile ? 'Docker ready' : 'Needs Dockerization'}. ` +
      `${structureInfo.hasKubernetes ? 'Kubernetes ready' : 'Needs K8s setup'}.`
    );
  }

  private checkVulnerability(packageName: string): boolean {
    // Simplified vulnerability check - would use actual vulnerability database
    const knownVulnerable = ['lodash', 'moment', 'request', 'node-sass'];
    return knownVulnerable.includes(packageName);
  }

  private estimatePackageSize(packageName: string): number {
    // Simplified size estimation - would use actual package data
    const sizes: Record<string, number> = {
      lodash: 1200000,
      react: 800000,
      express: 500000,
    };
    return sizes[packageName] ?? 100000;
  }

  private calculateSecurityScore(
    dependencies: Array<{ name: string }>,
    structureInfo: { hasDockerfile: boolean },
  ): number {
    const vulnerabilities = dependencies.filter((dep) => this.checkVulnerability(dep.name)).length;
    const baseScore = structureInfo.hasDockerfile ? 80 : 60;
    const penaltyPerVuln = 5;
    return Math.max(0, baseScore - vulnerabilities * penaltyPerVuln);
  }

  private estimateImageSize(language: string, dependencyCount: number): number {
    const baseSizes: Record<string, number> = {
      javascript: 100,
      typescript: 120,
      python: 80,
      go: 20,
    };
    const baseSize = baseSizes[language] ?? 100;
    return baseSize + dependencyCount * 5; // MB
  }

  private assessDeploymentComplexity(
    structureInfo: { configFiles: string[] },
    dependencies: Array<{ name: string }>,
  ): 'low' | 'medium' | 'high' {
    if (dependencies.length > 50 || structureInfo.configFiles.length > 10) {
      return 'high';
    }
    if (dependencies.length > 20 || structureInfo.configFiles.length > 5) {
      return 'medium';
    }
    return 'low';
  }

  private estimateResourceRequirements(
    language: string,
    _framework?: string,
  ): {
    cpu: string;
    memory: string;
  } {
    const requirements: Record<string, { cpu: string; memory: string }> = {
      javascript: { cpu: '100m', memory: '256Mi' },
      typescript: { cpu: '100m', memory: '256Mi' },
      python: { cpu: '100m', memory: '512Mi' },
      java: { cpu: '200m', memory: '1Gi' },
      go: { cpu: '50m', memory: '128Mi' },
    };

    return requirements[language] ?? { cpu: '100m', memory: '256Mi' };
  }

  private createDependencyGraph(dependencies: Array<{ name: string; type: string }>): {
    nodes: Array<{ id: string; type: string }>;
    edges: Array<{ from: string; to: string }>;
  } {
    return {
      nodes: dependencies.map((dep) => ({ id: dep.name, type: dep.type })),
      edges: [], // Simplified - would analyze actual dependency relationships
    };
  }

  private createSecurityReport(
    vulnerabilities: Array<{ name: string }>,
    _structureInfo: { hasDockerfile: boolean },
  ): {
    summary: string;
    vulnerabilities: Array<{ package: string; severity: string; description: string }>;
    recommendations: string[];
  } {
    return {
      summary: `Found ${vulnerabilities.length} vulnerable dependencies`,
      vulnerabilities: vulnerabilities.map((vuln) => ({
        package: vuln.name,
        severity: 'medium',
        description: `Package ${vuln.name} has known security vulnerabilities`,
      })),
      recommendations: [
        'Update vulnerable packages to latest versions',
        'Consider replacing deprecated packages',
        'Set up automated security scanning',
      ],
    };
  }
}

/**
 * Factory function for creating enhanced analyze-repository tool
 */
export function createEnhancedAnalyzeRepositoryTool(logger: Logger): EnhancedAnalyzeRepositoryTool {
  return new EnhancedAnalyzeRepositoryTool(logger);
}
