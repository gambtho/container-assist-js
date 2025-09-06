import { Result, Success, Failure } from '../types/core.js';
import type { Logger } from 'pino';
import { ScoredCandidate, SamplingConfig } from '../lib/sampling.js';
import { BaseSamplingOrchestrator, HighestScoreWinnerSelector } from './sampling/base.js';
import { K8sManifestGenerator, K8sContext, K8sManifestSet } from './sampling/k8s/generators.js';
import {
  K8sManifestScorer,
  ProductionK8sScorer,
  DevelopmentK8sScorer,
} from './sampling/k8s/scorers.js';

export interface K8sSamplingOptions {
  environment?: 'production' | 'development' | 'staging';
  maxCandidates?: number;
  customWeights?: Record<string, number>;
  enableValidation?: boolean;
  prioritizeHighAvailability?: boolean;
  includePersistentVolume?: boolean;
}

export class K8sManifestSamplingOrchestrator extends BaseSamplingOrchestrator<K8sManifestSet> {
  constructor(
    logger: Logger,
    options: K8sSamplingOptions = {},
    config: Partial<SamplingConfig> = {},
  ) {
    const generator = new K8sManifestGenerator(logger);
    const scorer = K8sManifestSamplingOrchestrator.createScorer(logger, options);
    const selector = new HighestScoreWinnerSelector<K8sManifestSet>();

    const mergedConfig: Partial<SamplingConfig> = {
      maxCandidates: options.maxCandidates || 3,
      validation: {
        enabled: options.enableValidation ?? true,
        failFast: false,
      },
      ...config,
    };

    super(logger, generator, scorer, selector, mergedConfig);
  }

  private static createScorer(
    logger: Logger,
    options: K8sSamplingOptions,
  ): K8sManifestScorer | ProductionK8sScorer | DevelopmentK8sScorer {
    const environment = options.environment || 'production';

    switch (environment) {
      case 'production': {
        const prodScorer = new ProductionK8sScorer(logger);
        if (options.customWeights) {
          prodScorer.updateWeights(options.customWeights);
        }
        return prodScorer;
      }

      case 'development': {
        const devScorer = new DevelopmentK8sScorer(logger);
        if (options.customWeights) {
          devScorer.updateWeights(options.customWeights);
        }
        return devScorer;
      }

      case 'staging':
      default: {
        const defaultScorer = new K8sManifestScorer(logger);
        if (options.customWeights) {
          defaultScorer.updateWeights(options.customWeights);
        }
        return defaultScorer;
      }
    }
  }

  async generateBestK8sManifests(
    context: K8sContext,
  ): Promise<Result<ScoredCandidate<K8sManifestSet>>> {
    this.logger.info({ sessionId: context.sessionId }, 'Starting K8s manifest sampling');

    const result = await this.sample(context);

    if (result.success) {
      this.logger.info({
        sessionId: context.sessionId,
        winnerId: result.data.id,
        winnerScore: result.data.score,
        strategy: result.data.metadata.strategy,
      }, 'K8s manifest sampling completed successfully');
    } else {
      this.logger.error({
        sessionId: context.sessionId,
        error: result.error,
      }, 'K8s manifest sampling failed');
    }

    return result;
  }

  async generateMultipleK8sManifests(
    context: K8sContext,
    count: number,
  ): Promise<Result<ScoredCandidate<K8sManifestSet>[]>> {
    this.logger.info(
      { sessionId: context.sessionId, count },
      'Starting multiple K8s manifest sampling',
    );

    const result = await this.sampleMultiple(context, count);

    if (result.success) {
      this.logger.info({
        sessionId: context.sessionId,
        generatedCount: result.data.length,
        topScore: result.data[0]?.score,
      }, 'Multiple K8s manifest sampling completed successfully');
    } else {
      this.logger.error({
        sessionId: context.sessionId,
        error: result.error,
      }, 'Multiple K8s manifest sampling failed');
    }

    return result;
  }

  // Convenience method for validating K8s manifests
  async validateK8sManifests(manifests: K8sManifestSet): Promise<Result<boolean>> {
    try {
      const tempCandidate = {
        id: 'temp-validation',
        content: manifests,
        metadata: {
          strategy: 'validation',
          source: 'user-provided',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      return await this.generator.validate(tempCandidate);
    } catch (error) {
      return Failure(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Method to score user-provided K8s manifests
  async scoreK8sManifests(manifests: K8sManifestSet): Promise<Result<ScoredCandidate<K8sManifestSet>>> {
    try {
      const tempCandidate = {
        id: 'temp-scoring',
        content: manifests,
        metadata: {
          strategy: 'user-provided',
          source: 'scoring-request',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      const scoreResult = await this.scorer.score([tempCandidate]);
      if (!scoreResult.success) {
        return Failure(scoreResult.error);
      }

      return Success(scoreResult.data[0]);
    } catch (error) {
      return Failure(`Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Generate manifests optimized for specific deployment patterns
  async generateForDeploymentPattern(
    context: K8sContext,
    pattern: 'stateless' | 'stateful' | 'microservice' | 'high-availability',
  ): Promise<Result<ScoredCandidate<K8sManifestSet>>> {
    // Enhance context based on pattern
    const enhancedContext = this.enhanceContextForPattern(context, pattern);

    this.logger.info({
      sessionId: context.sessionId,
      pattern,
    }, 'Generating K8s manifests for specific deployment pattern');

    return this.generateBestK8sManifests(enhancedContext);
  }

  private enhanceContextForPattern(context: K8sContext, pattern: string): K8sContext {
    const enhanced = { ...context };

    switch (pattern) {
      case 'stateless':
        enhanced.replicas = Math.max(enhanced.replicas || 2, 2);
        enhanced.enableHPA = true;
        break;

      case 'stateful':
        enhanced.replicas = Math.max(enhanced.replicas || 3, 3);
        enhanced.persistentVolume = enhanced.persistentVolume || {
          size: '1Gi',
          storageClass: 'standard',
          accessMode: 'ReadWriteOnce',
        };
        break;

      case 'microservice':
        enhanced.replicas = enhanced.replicas || 2;
        enhanced.serviceType = enhanced.serviceType || 'ClusterIP';
        enhanced.cpuRequest = enhanced.cpuRequest || '100m';
        enhanced.memoryRequest = enhanced.memoryRequest || '128Mi';
        break;

      case 'high-availability':
        enhanced.replicas = Math.max(enhanced.replicas || 3, 3);
        enhanced.enableHPA = true;
        enhanced.cpuRequest = enhanced.cpuRequest || '200m';
        enhanced.memoryRequest = enhanced.memoryRequest || '256Mi';
        enhanced.cpuLimit = enhanced.cpuLimit || '1000m';
        enhanced.memoryLimit = enhanced.memoryLimit || '1Gi';
        break;
    }

    return enhanced;
  }

  // Utility method to extract specific manifest types
  extractManifestsByType(
    manifests: K8sManifestSet,
    types: Array<'deployment' | 'service' | 'configMap' | 'ingress' | 'hpa' | 'pvc'>,
  ): Partial<K8sManifestSet> {
    const extracted: Partial<K8sManifestSet> = {};

    for (const type of types) {
      if (manifests[type]) {
        extracted[type] = manifests[type];
      }
    }

    return extracted;
  }

  // Generate YAML representation of manifests
  async generateYAML(manifests: K8sManifestSet): Promise<Result<string>> {
    try {
      // This would typically use js-yaml library, but for now return JSON representation
      const manifestArray = [];

      if (manifests.deployment) manifestArray.push(manifests.deployment);
      if (manifests.service) manifestArray.push(manifests.service);
      if (manifests.configMap) manifestArray.push(manifests.configMap);
      if (manifests.ingress) manifestArray.push(manifests.ingress);
      if (manifests.hpa) manifestArray.push(manifests.hpa);
      if (manifests.pvc) manifestArray.push(manifests.pvc);

      // Convert to YAML-like format (simplified)
      const yamlContent = manifestArray
        .map(manifest => JSON.stringify(manifest, null, 2))
        .join('\n---\n');

      return Success(yamlContent);
    } catch (error) {
      return Failure(`YAML generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Factory function for easy instantiation
export const createK8sSampler = (
  logger: Logger,
  options: K8sSamplingOptions = {},
): K8sManifestSamplingOrchestrator => {
  return new K8sManifestSamplingOrchestrator(logger, options);
};

// Type exports for external use
export type { K8sContext, K8sSamplingOptions, K8sManifestSet };
