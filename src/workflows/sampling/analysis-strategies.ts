/**
 * Analysis Strategies - Simple functional approach for repository analysis
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
import type {
  AnalysisStrategy,
  AnalysisContext,
  AnalysisVariant,
  AnalysisScoringCriteria,
  AnalysisScoreDetails,
} from './analysis-types';

// Enhanced analysis data interfaces
interface SecurityAnalysis {
  vulnerabilities: Array<{ type: string; severity: string; description: string }>;
  recommendations: string[];
}

interface PerformanceAnalysis {
  buildOptimizations: string[];
  runtimeOptimizations: string[];
}

interface ArchitectureAnalysis {
  style: string;
  components: Array<{ name: string; type: string }>;
  recommendations: string[];
}

interface DeploymentAnalysis {
  environments: string[];
  configurations: Array<{ name: string; value: string }>;
  recommendations: string[];
}

interface DependencyItem {
  name: string;
  version?: string;
  latestVersion?: string;
  type: string;
}

interface FrameworkItem {
  name: string;
  version?: string;
}

interface FileItem {
  path: string;
  type?: string;
  content?: string;
}

interface EnhancedAnalysis {
  dependencies?: DependencyItem[];
  frameworks?: FrameworkItem[];
  files?: FileItem[];
  patterns?: Record<string, unknown>;
  security?: SecurityAnalysis;
  performance?: PerformanceAnalysis;
  architecture?: ArchitectureAnalysis;
  deployment?: DeploymentAnalysis;
}
import {
  analyzeRepo,
  type AnalyzeRepoResult,
  type AnalyzeRepoParams as AnalyzeRepoConfig,
} from '@tools/analyze-repo';

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
  const typedBonus = bonus as {
    accuracy?: number;
    completeness?: number;
    relevance?: number;
    actionability?: number;
  };
  accuracy += typedBonus.accuracy || 0;
  completeness += typedBonus.completeness || 0;
  relevance += typedBonus.relevance || 0;
  actionability += typedBonus.actionability || 0;

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
      weaknesses: identifyWeaknesses(scores),
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

  if (
    variant.security &&
    'vulnerabilities' in variant.security &&
    Array.isArray(variant.security.vulnerabilities) &&
    variant.security.vulnerabilities.length === 0
  ) {
    strengths.push('No security vulnerabilities detected');
  }

  return strengths;
}

/**
 * Identify weaknesses in the analysis
 */
function identifyWeaknesses(scores: Record<string, number>): string[] {
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

  if (
    variant.security &&
    'vulnerabilities' in variant.security &&
    Array.isArray(variant.security.vulnerabilities) &&
    variant.security.vulnerabilities.length > 0
  ) {
    recommendations.push('Address identified security vulnerabilities before deployment');
  }

  if (!variant.deployment?.environments) {
    recommendations.push('Define deployment environments and configurations');
  }

  if (variant.perspective === 'performance' && !('performance' in variant)) {
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

      const baseAnalysis = result.value;
      const { recommendations: baseRecommendations, ...analysisData } = baseAnalysis;
      const variant: AnalysisVariant = {
        ...analysisData,
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
        filesAnalyzed: 0, // Will be set from actual file analysis
        generated: new Date(),
        recommendations: baseRecommendations
          ? [
              baseRecommendations.baseImage ? `Base image: ${baseRecommendations.baseImage}` : '',
              baseRecommendations.buildStrategy
                ? `Build strategy: ${baseRecommendations.buildStrategy}`
                : '',
              ...(baseRecommendations.securityNotes || []),
            ].filter(Boolean)
          : [],
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
      const baseAnalysis = result.value;
      const analysis: EnhancedAnalysis & typeof baseAnalysis = { ...baseAnalysis };

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
          (d) => d.version && d.latestVersion && d.version !== d.latestVersion,
        );
        if (outdated.length > 0) {
          analysis.security.recommendations.push(`Update ${outdated.length} outdated dependencies`);
        }
      }

      const {
        recommendations: baseRecommendations,
        files,
        security,
        deployment,
        ...analysisData
      } = analysis;
      const processedFiles = files?.map((file) => ({ ...file, type: file.type || 'unknown' }));
      const variant: AnalysisVariant = {
        ...analysisData,
        ...(processedFiles ? { files: processedFiles } : {}),
        ...(security ? { security: security as unknown as Record<string, unknown> } : {}),
        ...(deployment ? { deployment: deployment as unknown as Record<string, unknown> } : {}),
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
        recommendations: baseRecommendations
          ? [
              baseRecommendations.baseImage ? `Base image: ${baseRecommendations.baseImage}` : '',
              baseRecommendations.buildStrategy
                ? `Build strategy: ${baseRecommendations.buildStrategy}`
                : '',
              ...(baseRecommendations.securityNotes || []),
            ].filter(Boolean)
          : [],
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

      const baseAnalysis = result.value;
      const analysis: EnhancedAnalysis & typeof baseAnalysis = { ...baseAnalysis };

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

      if (analysis.frameworks?.some((f) => f.name === 'Node.js')) {
        analysis.performance.runtimeOptimizations.push('Use Alpine Linux for smaller image size');
        analysis.performance.runtimeOptimizations.push('Enable Node.js cluster mode');
      }

      const {
        recommendations: baseRecommendations,
        files,
        security,
        deployment,
        ...analysisData
      } = analysis;
      const processedFiles = files?.map((file) => ({ ...file, type: file.type || 'unknown' }));
      const variant: AnalysisVariant = {
        ...analysisData,
        ...(processedFiles ? { files: processedFiles } : {}),
        ...(security ? { security: security as unknown as Record<string, unknown> } : {}),
        ...(deployment ? { deployment: deployment as unknown as Record<string, unknown> } : {}),
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
        recommendations: baseRecommendations
          ? [
              baseRecommendations.baseImage ? `Base image: ${baseRecommendations.baseImage}` : '',
              baseRecommendations.buildStrategy
                ? `Build strategy: ${baseRecommendations.buildStrategy}`
                : '',
              ...(baseRecommendations.securityNotes || []),
            ].filter(Boolean)
          : [],
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

      const baseAnalysis = result.value;
      const analysis: EnhancedAnalysis & typeof baseAnalysis = { ...baseAnalysis };

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

      const {
        recommendations: baseRecommendations,
        files,
        security,
        deployment,
        ...analysisData
      } = analysis;
      const processedFiles = files?.map((file) => ({ ...file, type: file.type || 'unknown' }));
      const variant: AnalysisVariant = {
        ...analysisData,
        ...(processedFiles ? { files: processedFiles } : {}),
        ...(security ? { security: security as unknown as Record<string, unknown> } : {}),
        ...(deployment ? { deployment: deployment as unknown as Record<string, unknown> } : {}),
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
        recommendations: baseRecommendations
          ? [
              baseRecommendations.baseImage ? `Base image: ${baseRecommendations.baseImage}` : '',
              baseRecommendations.buildStrategy
                ? `Build strategy: ${baseRecommendations.buildStrategy}`
                : '',
              ...(baseRecommendations.securityNotes || []),
            ].filter(Boolean)
          : [],
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

      const baseAnalysis = result.value;
      const analysis: EnhancedAnalysis & typeof baseAnalysis = { ...baseAnalysis };

      // Enhance with deployment insights
      if (!analysis.deployment) {
        analysis.deployment = {
          environments: [],
          configurations: [],
          recommendations: [],
        };
      }

      // Add deployment recommendations
      if (!analysis.files?.some((f) => f.path.includes('Dockerfile'))) {
        analysis.deployment.recommendations.push('Create Dockerfile for containerization');
      }

      if (!analysis.files?.some((f) => f.path.includes('k8s') || f.path.includes('kubernetes'))) {
        analysis.deployment.recommendations.push('Add Kubernetes manifests for orchestration');
      }

      const {
        recommendations: baseRecommendations,
        files,
        security,
        deployment,
        ...analysisData
      } = analysis;
      const processedFiles = files?.map((file) => ({ ...file, type: file.type || 'unknown' }));
      const variant: AnalysisVariant = {
        ...analysisData,
        ...(processedFiles ? { files: processedFiles } : {}),
        ...(security ? { security: security as unknown as Record<string, unknown> } : {}),
        ...(deployment ? { deployment: deployment as unknown as Record<string, unknown> } : {}),
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
        recommendations: baseRecommendations
          ? [
              baseRecommendations.baseImage ? `Base image: ${baseRecommendations.baseImage}` : '',
              baseRecommendations.buildStrategy
                ? `Build strategy: ${baseRecommendations.buildStrategy}`
                : '',
              ...(baseRecommendations.securityNotes || []),
            ].filter(Boolean)
          : [],
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
 * Analysis strategies registry - simplified functional API
 */
export const analysisStrategies = {
  comprehensive: createComprehensiveStrategy,
  security: createSecurityStrategy,
  performance: createPerformanceStrategy,
  architecture: createArchitectureStrategy,
  deployment: createDeploymentStrategy,
} as const;

export type AnalysisStrategyName = keyof typeof analysisStrategies;

/**
 * Execute a single analysis strategy by name
 */
export async function executeAnalysisStrategy(
  strategyName: AnalysisStrategyName,
  context: AnalysisContext,
  logger: Logger,
): Promise<Result<AnalysisVariant>> {
  const strategyFactory = analysisStrategies[strategyName];
  if (!strategyFactory) {
    return Failure(`Unknown analysis strategy: ${strategyName}`);
  }

  const strategy = strategyFactory(logger);
  return strategy.analyzeRepository(context, logger);
}

/**
 * Execute multiple analysis strategies
 */
export async function executeMultipleAnalysisStrategies(
  strategyNames: AnalysisStrategyName[],
  context: AnalysisContext,
  logger: Logger,
): Promise<Result<AnalysisVariant[]>> {
  const variants: AnalysisVariant[] = [];
  const errors: string[] = [];

  for (const strategyName of strategyNames) {
    const result = await executeAnalysisStrategy(strategyName, context, logger);
    if (result.ok) {
      variants.push(result.value);
    } else {
      errors.push(`${strategyName}: ${result.error}`);
    }
  }

  if (variants.length === 0) {
    return Failure(`No variants generated. Errors: ${errors.join('; ')}`);
  }

  logger.info({ count: variants.length }, 'Analysis variants generated');
  return Success(variants);
}

/**
 * Get list of available analysis strategies
 */
export function getAvailableAnalysisStrategies(): AnalysisStrategyName[] {
  return Object.keys(analysisStrategies) as AnalysisStrategyName[];
}

/**
 * Strategy engine for backward compatibility
 */
export class AnalysisStrategyEngine {
  constructor(private logger: Logger) {}

  getAvailableStrategies(): string[] {
    return getAvailableAnalysisStrategies();
  }

  getStrategy(name: string): AnalysisStrategy | undefined {
    const strategyFactory = analysisStrategies[name as AnalysisStrategyName];
    return strategyFactory ? strategyFactory(this.logger) : undefined;
  }

  async generateVariants(
    context: AnalysisContext,
    strategyNames?: string[],
  ): Promise<Result<AnalysisVariant[]>> {
    const names = strategyNames || getAvailableAnalysisStrategies();
    return executeMultipleAnalysisStrategies(names as AnalysisStrategyName[], context, this.logger);
  }
}
