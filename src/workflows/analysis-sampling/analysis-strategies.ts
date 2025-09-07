/**
 * Analysis Strategies - Simple functional approach for repository analysis
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../core/types';
import type {
  AnalysisStrategy,
  AnalysisContext,
  AnalysisVariant,
  AnalysisScoringCriteria,
  AnalysisScoreDetails,
} from './types';
import {
  analyzeRepo,
  type AnalyzeRepoResult,
  type AnalyzeRepoConfig,
} from '../../tools/analyze-repo';

/**
 * Perform base repository analysis
 */
async function performBaseAnalysis(
  context: AnalysisContext,
  logger: Logger,
): Promise<Result<AnalyzeRepoResult>> {
  const config: AnalyzeRepoConfig = {
    sessionId: `analysis-${Date.now()}`,
    repoPath: context.repoPath,
  };

  if (context.depth !== undefined) {
    config.depth = context.depth;
  }

  if (context.includeTests !== undefined) {
    config.includeTests = context.includeTests;
  }

  return analyzeRepo(config, logger);
}

/**
 * Compute scores for an analysis variant
 */
function computeScores(variant: AnalysisVariant): {
  accuracy: number;
  completeness: number;
  relevance: number;
  actionability: number;
} {
  // Base scores from variant metadata
  let accuracy = 70;
  let completeness = 70;
  let relevance = 70;
  let actionability = 70;

  // Adjust based on detection counts (variant extends AnalyzeRepoResult)
  const dependencies = variant.dependencies;
  const frameworks = variant.frameworks;
  const patterns = variant.patterns;
  const security = variant.security;
  const deployment = variant.deployment;

  if (dependencies && dependencies.length > 0) {
    accuracy += Math.min(10, dependencies.length * 2);
    completeness += 5;
  }

  if (frameworks && frameworks.length > 0) {
    accuracy += 10;
    relevance += 10;
  }

  if (patterns && Object.keys(patterns).length > 0) {
    completeness += 10;
    relevance += 5;
  }

  if (security?.vulnerabilities) {
    actionability += 15;
    relevance += 10;
  }

  if (deployment?.environments) {
    completeness += 10;
    actionability += 10;
  }

  // Adjust for perspective-specific focus
  const perspectiveBonus = {
    comprehensive: { completeness: 10, accuracy: 5 },
    security: { actionability: 15, relevance: 10 },
    performance: { actionability: 10, relevance: 10 },
    architecture: { accuracy: 10, completeness: 10 },
    deployment: { actionability: 15, completeness: 5 },
  };

  const bonus = perspectiveBonus[variant.perspective] || {};
  accuracy += (bonus as any).accuracy || 0;
  completeness += (bonus as any).completeness || 0;
  relevance += (bonus as any).relevance || 0;
  actionability += (bonus as any).actionability || 0;

  // Normalize to 0-100 scale
  return {
    accuracy: Math.min(100, accuracy),
    completeness: Math.min(100, completeness),
    relevance: Math.min(100, relevance),
    actionability: Math.min(100, actionability),
  };
}

/**
 * Score an analysis variant
 */
export async function scoreAnalysis(
  variant: AnalysisVariant,
  criteria: AnalysisScoringCriteria,
  logger: Logger,
): Promise<Result<AnalysisScoreDetails>> {
  try {
    const scores = computeScores(variant);

    const total =
      scores.accuracy * criteria.accuracy.weight +
      scores.completeness * criteria.completeness.weight +
      scores.relevance * criteria.relevance.weight +
      scores.actionability * criteria.actionability.weight;

    const scoreDetails: AnalysisScoreDetails = {
      total: Math.round(total),
      breakdown: scores,
      strengths: identifyStrengths(variant, scores),
      weaknesses: identifyWeaknesses(variant, scores),
      recommendations: generateRecommendations(variant, scores),
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
 * Identify strengths in the analysis
 */
function identifyStrengths(variant: AnalysisVariant, scores: Record<string, number>): string[] {
  const strengths: string[] = [];

  if ((scores.accuracy ?? 0) >= 80) {
    strengths.push('High accuracy in technology detection');
  }
  if ((scores.completeness ?? 0) >= 80) {
    strengths.push('Comprehensive coverage of repository structure');
  }
  if ((scores.relevance ?? 0) >= 80) {
    strengths.push(`Strong focus on ${variant.perspective} aspects`);
  }
  if ((scores.actionability ?? 0) >= 80) {
    strengths.push('Clear actionable recommendations provided');
  }

  if (variant.security?.vulnerabilities?.length === 0) {
    strengths.push('No security vulnerabilities detected');
  }

  return strengths;
}

/**
 * Identify weaknesses in the analysis
 */
function identifyWeaknesses(_variant: AnalysisVariant, scores: Record<string, number>): string[] {
  const weaknesses: string[] = [];

  if ((scores.accuracy ?? 100) < 60) {
    weaknesses.push('Low confidence in technology detection');
  }
  if ((scores.completeness ?? 100) < 60) {
    weaknesses.push('Incomplete analysis coverage');
  }
  if ((scores.relevance ?? 100) < 60) {
    weaknesses.push('Limited relevance to specified perspective');
  }
  if ((scores.actionability ?? 100) < 60) {
    weaknesses.push('Lacks actionable recommendations');
  }

  return weaknesses;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  variant: AnalysisVariant,
  scores: Record<string, number>,
): string[] {
  const recommendations: string[] = [];

  if ((scores.completeness ?? 100) < 70) {
    recommendations.push('Consider deeper analysis with increased depth parameter');
  }

  if (variant.security?.vulnerabilities?.length > 0) {
    recommendations.push('Address identified security vulnerabilities before deployment');
  }

  if (!variant.deployment?.environments) {
    recommendations.push('Define deployment environments and configurations');
  }

  if (variant.perspective === 'performance' && !(variant as any).performance) {
    recommendations.push('Add performance metrics and monitoring');
  }

  return recommendations;
}

/**
 * Create comprehensive analysis strategy
 */
export function createComprehensiveStrategy(logger: Logger): AnalysisStrategy {
  return {
    name: 'comprehensive',
    description: 'Full repository analysis covering all aspects',
    perspective: 'comprehensive',

    async analyzeRepository(context: AnalysisContext): Promise<Result<AnalysisVariant>> {
      logger.info({ repoPath: context.repoPath }, 'Starting comprehensive analysis');

      const result = await performBaseAnalysis(context, logger);
      if (!result.ok) return result;

      const variant: AnalysisVariant = {
        ...(result.value as any),
        id: `comprehensive-${Date.now()}`,
        strategy: 'comprehensive',
        perspective: 'comprehensive',
        insights: {
          keyFindings: [],
          riskAssessments: [],
          optimizationOpportunities: [],
          architecturalPatterns: [],
          deploymentReadiness: [],
        },
        confidence: 85,
        completeness: 90,
        analysisTime: 0,
        filesAnalyzed: (result.value as any).files?.length || 0,
        generated: new Date(),
      };

      return Success(variant);
    },

    scoreAnalysis: (variant, criteria) => scoreAnalysis(variant, criteria, logger),
  };
}

/**
 * Create security-focused analysis strategy
 */
export function createSecurityStrategy(logger: Logger): AnalysisStrategy {
  return {
    name: 'security',
    description: 'Security-focused analysis with vulnerability detection',
    perspective: 'security',

    async analyzeRepository(context: AnalysisContext): Promise<Result<AnalysisVariant>> {
      logger.info({ repoPath: context.repoPath }, 'Starting security analysis');

      const result = await performBaseAnalysis(context, logger);
      if (!result.ok) return result;

      // Enhance with security-specific checks
      const analysis = { ...(result.value as any) };

      // Check for common security issues
      if (!analysis.security) {
        analysis.security = {
          vulnerabilities: [],
          recommendations: [],
        };
      }

      // Add security-specific checks
      if (analysis.dependencies) {
        const outdated = analysis.dependencies.filter(
          (d: any) => d.version && d.latestVersion && d.version !== d.latestVersion,
        );
        if (outdated.length > 0) {
          analysis.security.recommendations.push(`Update ${outdated.length} outdated dependencies`);
        }
      }

      const variant: AnalysisVariant = {
        ...analysis,
        id: `security-${Date.now()}`,
        strategy: 'security',
        perspective: 'security',
        insights: {
          keyFindings: [],
          riskAssessments: analysis.security?.recommendations || [],
          optimizationOpportunities: [],
          architecturalPatterns: [],
          deploymentReadiness: [],
        },
        confidence: 90,
        completeness: 85,
        analysisTime: 0,
        filesAnalyzed: analysis.files?.length || 0,
        generated: new Date(),
      };

      return Success(variant);
    },

    scoreAnalysis: (variant, criteria) => scoreAnalysis(variant, criteria, logger),
  };
}

/**
 * Create performance-focused analysis strategy
 */
export function createPerformanceStrategy(logger: Logger): AnalysisStrategy {
  return {
    name: 'performance',
    description: 'Performance optimization analysis',
    perspective: 'performance',

    async analyzeRepository(context: AnalysisContext): Promise<Result<AnalysisVariant>> {
      logger.info({ repoPath: context.repoPath }, 'Starting performance analysis');

      const result = await performBaseAnalysis(context, logger);
      if (!result.ok) return result;

      const analysis = { ...(result.value as any) };

      // Add performance-specific insights
      if (!analysis.performance) {
        analysis.performance = {
          buildOptimizations: [],
          runtimeOptimizations: [],
        };
      }

      // Check for performance patterns
      if (analysis.patterns?.caching) {
        analysis.performance.buildOptimizations.push('Implement Docker layer caching');
      }

      if (analysis.frameworks?.some((f: any) => f.name === 'Node.js')) {
        analysis.performance.runtimeOptimizations.push('Use Alpine Linux for smaller image size');
        analysis.performance.runtimeOptimizations.push('Enable Node.js cluster mode');
      }

      const variant: AnalysisVariant = {
        ...analysis,
        id: `performance-${Date.now()}`,
        strategy: 'performance',
        perspective: 'performance',
        insights: {
          keyFindings: [],
          riskAssessments: [],
          optimizationOpportunities: [
            ...(analysis.performance?.buildOptimizations || []),
            ...(analysis.performance?.runtimeOptimizations || []),
          ],
          architecturalPatterns: [],
          deploymentReadiness: [],
        },
        confidence: 80,
        completeness: 75,
        analysisTime: 0,
        filesAnalyzed: analysis.files?.length || 0,
        generated: new Date(),
      };

      return Success(variant);
    },

    scoreAnalysis: (variant, criteria) => scoreAnalysis(variant, criteria, logger),
  };
}

/**
 * Create architecture-focused analysis strategy
 */
export function createArchitectureStrategy(logger: Logger): AnalysisStrategy {
  return {
    name: 'architecture',
    description: 'Architecture and structure analysis',
    perspective: 'architecture',

    async analyzeRepository(context: AnalysisContext): Promise<Result<AnalysisVariant>> {
      logger.info({ repoPath: context.repoPath }, 'Starting architecture analysis');

      const result = await performBaseAnalysis(context, logger);
      if (!result.ok) return result;

      const analysis = { ...(result.value as any) };

      // Enhance with architecture insights
      if (!analysis.architecture) {
        analysis.architecture = {
          style: 'unknown',
          components: [],
          recommendations: [],
        };
      }

      // Detect architecture patterns
      if (analysis.patterns?.microservices) {
        analysis.architecture.style = 'microservices';
        analysis.architecture.recommendations.push('Use Docker Compose for local development');
      } else if (analysis.patterns?.monolith) {
        analysis.architecture.style = 'monolithic';
        analysis.architecture.recommendations.push('Consider modular structure for containers');
      }

      const variant: AnalysisVariant = {
        ...analysis,
        id: `architecture-${Date.now()}`,
        strategy: 'architecture',
        perspective: 'architecture',
        insights: {
          keyFindings: [],
          riskAssessments: [],
          optimizationOpportunities: [],
          architecturalPatterns: analysis.architecture?.recommendations || [],
          deploymentReadiness: [],
        },
        confidence: 85,
        completeness: 80,
        analysisTime: 0,
        filesAnalyzed: analysis.files?.length || 0,
        generated: new Date(),
      };

      return Success(variant);
    },

    scoreAnalysis: (variant, criteria) => scoreAnalysis(variant, criteria, logger),
  };
}

/**
 * Create deployment-focused analysis strategy
 */
export function createDeploymentStrategy(logger: Logger): AnalysisStrategy {
  return {
    name: 'deployment',
    description: 'Deployment readiness and configuration analysis',
    perspective: 'deployment',

    async analyzeRepository(context: AnalysisContext): Promise<Result<AnalysisVariant>> {
      logger.info({ repoPath: context.repoPath }, 'Starting deployment analysis');

      const result = await performBaseAnalysis(context, logger);
      if (!result.ok) return result;

      const analysis = { ...(result.value as any) };

      // Enhance with deployment insights
      if (!analysis.deployment) {
        analysis.deployment = {
          environments: [],
          configurations: [],
          recommendations: [],
        };
      }

      // Add deployment recommendations
      if (!analysis.files?.some((f: any) => f.path.includes('Dockerfile'))) {
        analysis.deployment.recommendations.push('Create Dockerfile for containerization');
      }

      if (
        !analysis.files?.some((f: any) => f.path.includes('k8s') || f.path.includes('kubernetes'))
      ) {
        analysis.deployment.recommendations.push('Add Kubernetes manifests for orchestration');
      }

      const variant: AnalysisVariant = {
        ...analysis,
        id: `deployment-${Date.now()}`,
        strategy: 'deployment',
        perspective: 'deployment',
        insights: {
          keyFindings: [],
          riskAssessments: [],
          optimizationOpportunities: [],
          architecturalPatterns: [],
          deploymentReadiness: analysis.deployment?.recommendations || [],
        },
        confidence: 85,
        completeness: 85,
        analysisTime: 0,
        filesAnalyzed: analysis.files?.length || 0,
        generated: new Date(),
      };

      return Success(variant);
    },

    scoreAnalysis: (variant, criteria) => scoreAnalysis(variant, criteria, logger),
  };
}

/**
 * Get all available strategies
 */
export function getAllStrategies(logger: Logger): AnalysisStrategy[] {
  return [
    createComprehensiveStrategy(logger),
    createSecurityStrategy(logger),
    createPerformanceStrategy(logger),
    createArchitectureStrategy(logger),
    createDeploymentStrategy(logger),
  ];
}

/**
 * Get strategy by name
 */
export function getStrategyByName(name: string, logger: Logger): AnalysisStrategy | undefined {
  const strategies = getAllStrategies(logger);
  return strategies.find((s) => s.name === name);
}

/**
 * Get strategies by perspective
 */
export function getStrategiesByPerspective(
  perspective: AnalysisVariant['perspective'],
  logger: Logger,
): AnalysisStrategy[] {
  const strategies = getAllStrategies(logger);
  return strategies.filter((s) => s.perspective === perspective);
}

/**
 * Strategy engine for backward compatibility
 */
export class AnalysisStrategyEngine {
  private strategies: Map<string, AnalysisStrategy> = new Map();

  constructor(private logger: Logger) {
    const strategies = getAllStrategies(logger);
    strategies.forEach((s) => this.strategies.set(s.name, s));
  }

  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  getStrategy(name: string): AnalysisStrategy | undefined {
    return this.strategies.get(name);
  }

  async generateVariants(
    context: AnalysisContext,
    strategyNames?: string[],
  ): Promise<Result<AnalysisVariant[]>> {
    const selectedStrategies = strategyNames
      ? (strategyNames
          .map((name) => this.strategies.get(name))
          .filter(Boolean) as AnalysisStrategy[])
      : Array.from(this.strategies.values());

    const variants: AnalysisVariant[] = [];
    const errors: string[] = [];

    for (const strategy of selectedStrategies) {
      try {
        const result = await strategy.analyzeRepository(context, this.logger);
        if (result.ok) {
          variants.push(result.value);
        } else {
          errors.push(`${strategy.name}: ${result.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${strategy.name}: ${message}`);
      }
    }

    if (variants.length === 0) {
      return Failure(`No variants generated. Errors: ${errors.join('; ')}`);
    }

    this.logger.info({ count: variants.length }, 'Analysis variants generated');
    return Success(variants);
  }
}
