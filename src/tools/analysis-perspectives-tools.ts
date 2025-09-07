/**
 * Analysis Perspectives MCP Tools
 *
 * Provides MCP tools for enhanced repository analysis with different perspectives:
 * - Enhanced analysis with security, performance, or comprehensive focus
 * - List available analysis perspectives
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core';
import { analyzeRepo, type AnalyzeRepoConfig } from './analyze-repo';

export interface AnalysisPerspectivesToolConfig {
  sessionId: string;
  repoPath: string;
  perspective?: 'comprehensive' | 'security-focused' | 'performance-focused';
  depth?: number;
  includeTests?: boolean;
  securityFocus?: boolean;
  performanceFocus?: boolean;
}

export interface PerspectivesListToolConfig {
  sessionId: string;
  includeDetails?: boolean;
}

/**
 * Enhanced Analysis Tool
 * Analyzes repository with perspective-specific insights
 */
export async function enhancedAnalysisTool(
  config: AnalysisPerspectivesToolConfig,
  logger: Logger,
): Promise<
  Result<{
    sessionId: string;
    analysis: any;
    perspective?: string;
    enhancedRecommendations: string[];
    metadata: {
      executionTime: number;
      perspective: string;
      totalRecommendations: number;
    };
  }>
> {
  const startTime = Date.now();

  try {
    logger.info(
      { sessionId: config.sessionId, repoPath: config.repoPath, perspective: config.perspective },
      'Starting enhanced analysis with perspectives',
    );

    // Configure analysis with perspectives
    const analysisConfig: AnalyzeRepoConfig = {
      sessionId: config.sessionId,
      repoPath: config.repoPath,
      usePerspectives: true,
      ...(config.depth !== undefined && { depth: config.depth }),
      ...(config.includeTests !== undefined && { includeTests: config.includeTests }),
      ...(config.perspective && { perspective: config.perspective }),
      ...(config.securityFocus !== undefined && { securityFocus: config.securityFocus }),
      ...(config.performanceFocus !== undefined && { performanceFocus: config.performanceFocus }),
    };

    // Run analysis with perspective enhancement
    const result = await analyzeRepo(analysisConfig, logger);

    if (!result.ok) {
      return result;
    }

    const analysis = result.value;
    const executionTime = Date.now() - startTime;

    // Extract enhanced recommendations
    const enhancedRecommendations = analysis.recommendations?.securityNotes || [];

    const response = {
      sessionId: config.sessionId,
      analysis: {
        language: analysis.language,
        framework: analysis.framework,
        dependencies: analysis.dependencies.length,
        ports: analysis.ports,
        recommendations: analysis.recommendations || {},
      },
      enhancedRecommendations,
      metadata: {
        executionTime,
        perspective: config.perspective || 'auto-selected',
        totalRecommendations: enhancedRecommendations.length,
      },
    };

    logger.info(
      {
        sessionId: config.sessionId,
        perspective: response.metadata.perspective,
        recommendations: enhancedRecommendations.length,
        executionTime,
      },
      'Enhanced analysis completed successfully',
    );

    return Success(response);
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error({ error, config, executionTime }, 'Enhanced analysis failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Analysis Perspectives List Tool
 * Returns available analysis perspectives and their descriptions
 */
export async function perspectivesListTool(
  config: PerspectivesListToolConfig,
  logger: Logger,
): Promise<
  Result<{
    sessionId: string;
    perspectives: Array<{
      name: string;
      description: string;
      focus: string[];
      bestFor: string[];
      details?: string;
    }>;
  }>
> {
  try {
    logger.debug({ sessionId: config.sessionId }, 'Listing analysis perspectives');

    const perspectives = [
      {
        name: 'comprehensive',
        description: 'Complete repository analysis covering all aspects',
        focus: ['complete coverage', 'detailed analysis', 'thorough dependency review'],
        bestFor: [
          'Initial repository assessment',
          'Full feature discovery',
          'Architecture overview',
        ],
        ...(config.includeDetails && {
          details:
            'Performs thorough analysis including architecture patterns, deployment readiness, scalability considerations, and monitoring hooks',
        }),
      },
      {
        name: 'security-focused',
        description: 'Security-oriented analysis focusing on vulnerabilities and compliance',
        focus: ['security vulnerabilities', 'compliance requirements', 'access controls'],
        bestFor: ['Security audits', 'Compliance checks', 'Vulnerability assessment'],
        ...(config.includeDetails && {
          details:
            'Identifies vulnerable dependencies, hardcoded secrets, insecure configurations, privilege escalation risks, and network security issues',
        }),
      },
      {
        name: 'performance-focused',
        description: 'Performance-oriented analysis for optimization opportunities',
        focus: ['performance bottlenecks', 'resource optimization', 'scalability'],
        bestFor: ['Performance tuning', 'Resource optimization', 'Scalability planning'],
        ...(config.includeDetails && {
          details:
            'Analyzes resource usage patterns, caching opportunities, database optimization, memory management, and CPU intensive operations',
        }),
      },
    ];

    const response = {
      sessionId: config.sessionId,
      perspectives,
    };

    logger.info(
      { sessionId: config.sessionId, perspectiveCount: perspectives.length },
      'Analysis perspectives listed successfully',
    );

    return Success(response);
  } catch (error) {
    logger.error({ error, config }, 'Perspectives listing failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

// Export tool instances
export const analysisPerspectivesTools = {
  'enhanced-analysis': { execute: enhancedAnalysisTool },
  'perspectives-list': { execute: perspectivesListTool },
};
