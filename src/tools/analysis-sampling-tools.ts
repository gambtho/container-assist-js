/**
 * Analysis Sampling MCP Tools
 *
 * Provides MCP tools for repository analysis sampling functionality:
 * - Generate optimal repository analysis using multiple strategies
 * - Compare analysis variants
 * - Validate analysis results
 * - Get available analysis strategies
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../core/types';
import type {
  AnalysisContext,
  AnalysisVariant,
  AnalysisScoringCriteria,
} from '../workflows/analysis-sampling/types';
import { AnalysisSamplingService } from '../workflows/analysis-sampling/analysis-sampling-service';

// Tool configuration interfaces
export interface AnalysisSamplingToolConfig {
  sessionId: string;
  repoPath: string;
  language: string;
  framework?: string;
  dependencies?: Array<{ name: string; version?: string; type: string }>;
  ports?: number[];
  depth?: number;
  includeTests?: boolean;
  securityFocus?: boolean;
  performanceFocus?: boolean;
  strategies?: string[];
  criteria?: {
    accuracy?: { weight: number; minScore: number };
    completeness?: { weight: number; minScore: number };
    relevance?: { weight: number; minScore: number };
    actionability?: { weight: number; minScore: number };
  };
}

export interface AnalysisCompareToolConfig {
  sessionId: string;
  variants: Array<{
    strategy: string;
    analysis: {
      language: string;
      framework?: string;
      dependencies: Array<{ name: string; version?: string; type: string }>;
      recommendations: string[];
      securityIssues?: string[];
      performanceIssues?: string[];
    };
    metadata: {
      confidence: number;
      executionTime: number;
      timestamp: string;
    };
  }>;
  criteria?: {
    accuracy?: { weight: number; minScore: number };
    completeness?: { weight: number; minScore: number };
    relevance?: { weight: number; minScore: number };
    actionability?: { weight: number; minScore: number };
  };
}

export interface AnalysisValidateToolConfig {
  sessionId: string;
  variant: {
    strategy: string;
    analysis: {
      language: string;
      framework?: string;
      dependencies: Array<{ name: string; version?: string; type: string }>;
      recommendations: string[];
      securityIssues?: string[];
      performanceIssues?: string[];
    };
    metadata: {
      confidence: number;
      executionTime: number;
      timestamp: string;
    };
  };
}

export interface AnalysisStrategiesToolConfig {
  sessionId: string;
  includeDescription?: boolean;
}

/**
 * Repository Analysis Sampling Tool
 * Generates optimal repository analysis using multiple strategies
 */
export async function analysisSamplingTool(
  config: AnalysisSamplingToolConfig,
  logger: Logger,
): Promise<
  Result<{
    sessionId: string;
    bestAnalysis: {
      strategy: string;
      language: string;
      framework?: string;
      dependencies: Array<{ name: string; version?: string; type: string }>;
      recommendations: string[];
      securityIssues?: string[];
      performanceIssues?: string[];
      score: number;
    };
    allAnalyses: Array<{
      strategy: string;
      score: number;
      confidence: number;
    }>;
    metadata: {
      totalVariants: number;
      executionTime: number;
      strategies: string[];
    };
  }>
> {
  try {
    logger.info(
      { sessionId: config.sessionId, repoPath: config.repoPath },
      'Starting analysis sampling',
    );

    // Build analysis context
    const context: AnalysisContext = {
      repoPath: config.repoPath,
      ...(config.framework && { framework: config.framework }),
      ...(config.dependencies && { dependencies: config.dependencies }),
      ...(config.ports && { ports: config.ports }),
      ...(config.depth !== undefined && { depth: config.depth }),
      ...(config.includeTests !== undefined && { includeTests: config.includeTests }),
      ...(config.securityFocus !== undefined && { securityFocus: config.securityFocus }),
      ...(config.performanceFocus !== undefined && { performanceFocus: config.performanceFocus }),
    };

    // Build scoring criteria
    const criteria: AnalysisScoringCriteria = {
      accuracy: config.criteria?.accuracy || { weight: 0.3, minScore: 0.6 },
      completeness: config.criteria?.completeness || { weight: 0.25, minScore: 0.5 },
      relevance: config.criteria?.relevance || { weight: 0.25, minScore: 0.5 },
      actionability: config.criteria?.actionability || { weight: 0.2, minScore: 0.4 },
    };

    // Build sampling configuration
    const samplingConfig = {
      ...(config.strategies && { strategies: config.strategies }),
    };

    // Create sampling service and generate analysis
    const samplingService = new AnalysisSamplingService(logger);
    const result = await samplingService.generateBestAnalysis(context, criteria, samplingConfig);

    if (!result.ok) {
      return result;
    }

    const sampling = result.value;

    // Format response
    const response = {
      sessionId: config.sessionId,
      bestAnalysis: {
        strategy: sampling.bestVariant.strategy,
        language: sampling.bestVariant.language,
        ...(sampling.bestVariant.framework && {
          framework: sampling.bestVariant.framework,
        }),
        dependencies: sampling.bestVariant.dependencies,
        recommendations: sampling.bestVariant.insights.keyFindings.concat(
          sampling.bestVariant.insights.deploymentReadiness,
        ),
        ...(sampling.bestVariant.recommendations?.securityNotes && {
          securityIssues: sampling.bestVariant.recommendations.securityNotes,
        }),
        score: sampling.bestVariant.score.total,
      },
      allAnalyses: sampling.variants.map((variant) => ({
        strategy: variant.strategy,
        score: variant.score.total,
        confidence: variant.confidence,
      })),
      metadata: sampling.metadata,
    };

    logger.info(
      {
        sessionId: config.sessionId,
        bestStrategy: response.bestAnalysis.strategy,
        totalVariants: response.metadata.totalVariants,
      },
      'Analysis sampling completed successfully',
    );

    return Success(response);
  } catch (error) {
    logger.error({ error, config }, 'Analysis sampling failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Analysis Comparison Tool
 * Compares multiple analysis variants and provides recommendations
 */
export async function analysisCompareTool(
  config: AnalysisCompareToolConfig,
  logger: Logger,
): Promise<
  Result<{
    sessionId: string;
    variants: Array<{
      strategy: string;
      score: number;
      strengths: string[];
      weaknesses: string[];
      recommendation: 'recommended' | 'acceptable' | 'not-recommended';
    }>;
    summary: {
      bestStrategy: string;
      worstStrategy: string;
      averageScore: number;
      recommendedCount: number;
    };
  }>
> {
  try {
    logger.info(
      { sessionId: config.sessionId, variantCount: config.variants.length },
      'Starting analysis comparison',
    );

    // Convert config variants to internal format
    const variants: AnalysisVariant[] = config.variants.map((v, index) => ({
      id: `variant-${index}`,
      strategy: v.strategy,
      perspective: 'comprehensive' as const,
      insights: {
        keyFindings: [],
        riskAssessments: [],
        optimizationOpportunities: [],
        architecturalPatterns: [],
        deploymentReadiness: [],
      },
      confidence: v.metadata?.confidence ?? 0.5,
      completeness: 0.8,
      analysisTime: v.metadata?.executionTime ?? 0,
      filesAnalyzed: 10,
      generated: new Date(v.metadata?.timestamp ?? Date.now()),
      // From AnalyzeRepoResult
      ok: true,
      sessionId: config.sessionId,
      language: v.analysis.language,
      ...(v.analysis.framework && { framework: v.analysis.framework }),
      dependencies: v.analysis.dependencies,
      ports: [],
      hasDockerfile: false,
      hasDockerCompose: false,
      hasKubernetes: false,
      recommendations: {
        ...(v.analysis.securityIssues && { securityNotes: v.analysis.securityIssues }),
      },
      metadata: {
        repoPath: '',
        depth: 1,
        includeTests: false,
        timestamp: v.metadata?.timestamp ?? new Date().toISOString(),
      },
    }));

    // Build scoring criteria
    const criteria: AnalysisScoringCriteria = {
      accuracy: config.criteria?.accuracy || { weight: 0.3, minScore: 0.6 },
      completeness: config.criteria?.completeness || { weight: 0.25, minScore: 0.5 },
      relevance: config.criteria?.relevance || { weight: 0.25, minScore: 0.5 },
      actionability: config.criteria?.actionability || { weight: 0.2, minScore: 0.4 },
    };

    // Create sampling service and compare variants
    const samplingService = new AnalysisSamplingService(logger);
    const result = await samplingService.compareAnalysisVariants(variants, criteria);

    if (!result.ok) {
      return result;
    }

    const comparison = result.value;

    const response = {
      sessionId: config.sessionId,
      variants: comparison.variants,
      summary: comparison.summary,
    };

    logger.info(
      {
        sessionId: config.sessionId,
        bestStrategy: comparison.summary.bestStrategy,
        recommendedCount: comparison.summary.recommendedCount,
      },
      'Analysis comparison completed successfully',
    );

    return Success(response);
  } catch (error) {
    logger.error({ error, config }, 'Analysis comparison failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Analysis Validation Tool
 * Validates an analysis variant for correctness and completeness
 */
export async function analysisValidateTool(
  config: AnalysisValidateToolConfig,
  logger: Logger,
): Promise<
  Result<{
    sessionId: string;
    strategy: string;
    isValid: boolean;
    issues: string[];
    score?: number;
    recommendations?: string[];
  }>
> {
  try {
    logger.info(
      { sessionId: config.sessionId, strategy: config.variant.strategy },
      'Starting analysis validation',
    );

    // Convert config variant to internal format
    const variant: AnalysisVariant = {
      id: 'validation-variant',
      strategy: config.variant.strategy,
      perspective: 'comprehensive' as const,
      insights: {
        keyFindings: [],
        riskAssessments: [],
        optimizationOpportunities: [],
        architecturalPatterns: [],
        deploymentReadiness: [],
      },
      confidence: config.variant.metadata.confidence,
      completeness: 0.8,
      analysisTime: config.variant.metadata.executionTime,
      filesAnalyzed: 10,
      generated: new Date(config.variant.metadata.timestamp),
      // From AnalyzeRepoResult
      sessionId: config.sessionId,
      language: config.variant.analysis.language,
      ...(config.variant.analysis.framework && { framework: config.variant.analysis.framework }),
      dependencies: config.variant.analysis.dependencies,
      ports: [],
      hasDockerfile: false,
      hasDockerCompose: false,
      hasKubernetes: false,
      recommendations: {
        ...(config.variant.analysis.securityIssues && {
          securityNotes: config.variant.analysis.securityIssues,
        }),
      },
      metadata: {
        repoPath: '',
        depth: 1,
        includeTests: false,
        timestamp: config.variant.metadata.timestamp,
      },
    };

    // Create sampling service and validate variant
    const samplingService = new AnalysisSamplingService(logger);
    const result = await samplingService.validateAnalysisVariant(variant);

    if (!result.ok) {
      return result;
    }

    const validation = result.value;

    const response = {
      sessionId: config.sessionId,
      strategy: config.variant.strategy,
      isValid: validation.isValid,
      issues: validation.issues,
      ...(validation.isValid && {
        score: variant.confidence,
        recommendations: config.variant.analysis.recommendations,
      }),
    };

    logger.info(
      {
        sessionId: config.sessionId,
        strategy: config.variant.strategy,
        isValid: validation.isValid,
        issueCount: validation.issues.length,
      },
      'Analysis validation completed',
    );

    return Success(response);
  } catch (error) {
    logger.error({ error, config }, 'Analysis validation failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Analysis Strategies Tool
 * Returns available analysis strategies and their descriptions
 */
export async function analysisStrategiesListTool(
  config: AnalysisStrategiesToolConfig,
  logger: Logger,
): Promise<
  Result<{
    sessionId: string;
    strategies: Array<{
      name: string;
      description?: string;
      focus: string;
      bestFor: string[];
    }>;
  }>
> {
  try {
    logger.debug({ sessionId: config.sessionId }, 'Listing analysis strategies');

    const samplingService = new AnalysisSamplingService(logger);
    const availableStrategies = samplingService.getAvailableStrategies();

    const strategies = availableStrategies.map((name) => {
      const strategy = {
        name,
        focus: '',
        bestFor: [] as string[],
        ...(config.includeDescription && { description: '' }),
      };

      // Add strategy-specific information
      switch (name) {
        case 'comprehensive':
          strategy.focus = 'Complete repository analysis';
          strategy.bestFor = [
            'Initial repository assessment',
            'Full feature discovery',
            'Architecture overview',
          ];
          if (config.includeDescription) {
            strategy.description =
              'Performs thorough analysis covering all aspects of the repository including dependencies, architecture, security, and deployment considerations';
          }
          break;

        case 'security-focused':
          strategy.focus = 'Security vulnerabilities and compliance';
          strategy.bestFor = ['Security audits', 'Compliance checks', 'Vulnerability assessment'];
          if (config.includeDescription) {
            strategy.description =
              'Focuses on identifying security issues, vulnerable dependencies, and compliance requirements';
          }
          break;

        case 'performance-focused':
          strategy.focus = 'Performance optimization opportunities';
          strategy.bestFor = [
            'Performance tuning',
            'Resource optimization',
            'Scalability planning',
          ];
          if (config.includeDescription) {
            strategy.description =
              'Identifies performance bottlenecks, resource usage patterns, and optimization opportunities';
          }
          break;

        default:
          strategy.focus = 'General analysis';
          strategy.bestFor = ['General purpose analysis'];
      }

      return strategy;
    });

    const response = {
      sessionId: config.sessionId,
      strategies,
    };

    logger.info(
      { sessionId: config.sessionId, strategyCount: strategies.length },
      'Analysis strategies listed successfully',
    );

    return Success(response);
  } catch (error) {
    logger.error({ error, config }, 'Analysis strategies listing failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

// Export tool instances
export const analysisSamplingTools = {
  'analysis-sampling': { execute: analysisSamplingTool },
  'analysis-compare': { execute: analysisCompareTool },
  'analysis-validate': { execute: analysisValidateTool },
  'analysis-strategies': { execute: analysisStrategiesListTool },
};
