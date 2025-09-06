import { Result, Success, Failure } from '../../../types/core.js';
import type { Logger } from 'pino';
import { Candidate, ScoredCandidate } from '../../../lib/sampling.js';
import { BaseCandidateScorer } from '../base.js';
import { K8sManifestSet } from './generators.js';

export interface K8sScoringCriteria {
  resourceEfficiency: number;
  security: number;
  scalability: number;
  reliability: number;
  deploymentSpeed: number;
  maintenance: number;
}

export const DEFAULT_K8S_SCORING_WEIGHTS: K8sScoringCriteria = {
  resourceEfficiency: 0.2,
  security: 0.25,
  scalability: 0.2,
  reliability: 0.15,
  deploymentSpeed: 0.1,
  maintenance: 0.1,
};

export class K8sManifestScorer extends BaseCandidateScorer<K8sManifestSet> {
  readonly name: string = 'k8s-manifest-scorer';

  constructor(logger: Logger, weights = DEFAULT_K8S_SCORING_WEIGHTS) {
    super(logger, weights);
  }

  protected async scoreCandidate(
    candidate: Candidate<K8sManifestSet>,
  ): Promise<Result<ScoredCandidate<K8sManifestSet>>> {
    try {
      const manifests = candidate.content;

      // Calculate scores for each criterion
      const scoreBreakdown = {
        resourceEfficiency: this.scoreResourceEfficiency(manifests),
        security: this.scoreSecurity(manifests, candidate.metadata.securityRating),
        scalability: this.scoreScalability(manifests),
        reliability: this.scoreReliability(manifests),
        deploymentSpeed: this.scoreDeploymentSpeed(candidate.metadata.estimatedDeployTime || 60),
        maintenance: this.scoreMaintenance(manifests),
      };

      const finalScore = this.calculateFinalScore(scoreBreakdown);

      const scoredCandidate: ScoredCandidate<K8sManifestSet> = {
        ...candidate,
        score: Math.round(finalScore * 100) / 100,
        scoreBreakdown,
        rank: 0,
      };

      return Success(scoredCandidate);

    } catch (error) {
      const errorMessage = `K8s scoring failed for candidate ${candidate.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ candidateId: candidate.id, error }, errorMessage);
      return Failure(errorMessage);
    }
  }

  private scoreResourceEfficiency(manifests: K8sManifestSet): number {
    let score = 60; // Base score

    const deployment = manifests.deployment as any;
    const containers = deployment?.spec?.template?.spec?.containers || [];

    // Check for resource requests and limits
    for (const container of containers) {
      const resources = container.resources || {};

      if (resources.requests && resources.limits) {
        score += 15; // Both requests and limits defined

        // Check if limits are reasonable (not too high)
        const cpuLimit = this.parseCpuValue(resources.limits.cpu || '1000m');
        const memoryLimit = this.parseMemoryValue(resources.limits.memory || '1Gi');

        if (cpuLimit <= 1000) score += 5; // <= 1 CPU
        if (memoryLimit <= 1024) score += 5; // <= 1GB memory

      } else if (resources.requests || resources.limits) {
        score += 8; // At least one defined
      }
    }

    // Check for HPA (auto-scaling)
    if (manifests.hpa) {
      score += 10;
    }

    // Penalize if too many replicas for basic apps
    const replicas = deployment?.spec?.replicas || 1;
    if (replicas > 5) {
      score -= 5; // Too many replicas might be wasteful
    }

    return Math.min(score, 100);
  }

  private scoreSecurity(manifests: K8sManifestSet, securityRating?: number): number {
    let score = 40; // Base score

    // Use provided security rating if available
    if (securityRating) {
      score = securityRating * 10;
    }

    const deployment = manifests.deployment as any;
    const podSpec = deployment?.spec?.template?.spec;
    const containers = podSpec?.containers || [];

    // Pod security context
    const podSecurityContext = podSpec?.securityContext || {};
    if (podSecurityContext.runAsNonRoot) score += 8;
    if (podSecurityContext.runAsUser && podSecurityContext.runAsUser !== 0) score += 5;
    if (podSecurityContext.fsGroup) score += 3;
    if (podSecurityContext.seccompProfile?.type === 'RuntimeDefault') score += 5;

    // Container security contexts
    for (const container of containers) {
      const securityContext = container.securityContext || {};

      if (securityContext.allowPrivilegeEscalation === false) score += 5;
      if (securityContext.readOnlyRootFilesystem) score += 5;
      if (securityContext.runAsNonRoot) score += 5;
      if (securityContext.capabilities?.drop?.includes('ALL')) score += 5;
    }

    // Service account configuration
    if (podSpec?.automountServiceAccountToken === false) score += 3;

    // Network policies (bonus if present)
    // Note: We don't generate NetworkPolicies in current strategies, but could check

    return Math.min(score, 100);
  }

  private scoreScalability(manifests: K8sManifestSet): number {
    let score = 50; // Base score

    const deployment = manifests.deployment as any;

    // Check for horizontal scaling setup
    if (manifests.hpa) {
      const hpa = manifests.hpa as any;
      score += 20;

      // Check for multiple metrics
      const metrics = hpa.spec?.metrics || [];
      if (metrics.length > 1) score += 10; // CPU + Memory metrics

      // Check for scaling behavior configuration
      if (hpa.spec?.behavior) score += 10;
    }

    // Check for multiple replicas
    const replicas = deployment?.spec?.replicas || 1;
    if (replicas >= 2) score += 10;
    if (replicas >= 3) score += 5;

    // Check for anti-affinity rules (spread across nodes)
    const affinity = deployment?.spec?.template?.spec?.affinity;
    if (affinity?.podAntiAffinity) {
      score += 15;

      // Required anti-affinity is better than preferred
      if (affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution) {
        score += 5;
      }
    }

    // Check for rolling update strategy
    const strategy = deployment?.spec?.strategy;
    if (strategy?.type === 'RollingUpdate') {
      score += 5;

      // Check for reasonable rolling update parameters
      const rollingUpdate = strategy.rollingUpdate || {};
      if (rollingUpdate.maxUnavailable === 0 || rollingUpdate.maxUnavailable === '0') {
        score += 5; // Zero downtime deployment
      }
    }

    return Math.min(score, 100);
  }

  private scoreReliability(manifests: K8sManifestSet): number {
    let score = 40; // Base score

    const deployment = manifests.deployment as any;
    const containers = deployment?.spec?.template?.spec?.containers || [];

    // Check for health checks
    for (const container of containers) {
      if (container.livenessProbe) {
        score += 15;

        // Check for reasonable probe configuration
        const liveness = container.livenessProbe;
        if (liveness.initialDelaySeconds >= 10) score += 3;
        if (liveness.timeoutSeconds <= 10) score += 2;
      }

      if (container.readinessProbe) {
        score += 15;

        // Check for reasonable probe configuration
        const readiness = container.readinessProbe;
        if (readiness.initialDelaySeconds >= 0) score += 3;
        if (readiness.periodSeconds <= 10) score += 2;
      }

      if (container.startupProbe) {
        score += 10; // Startup probe for better handling of slow-starting apps
      }
    }

    // Check for multiple replicas (redundancy)
    const replicas = deployment?.spec?.replicas || 1;
    if (replicas >= 2) score += 8;
    if (replicas >= 3) score += 7; // Odd number for consensus

    // Check for resource limits (prevents resource starvation)
    for (const container of containers) {
      if (container.resources?.limits) {
        score += 5;
      }
    }

    // Check for revision history limit (helps with rollbacks)
    if (deployment?.spec?.revisionHistoryLimit) {
      score += 3;
    }

    return Math.min(score, 100);
  }

  private scoreDeploymentSpeed(estimatedSeconds: number): number {
    // Score based on deployment time: faster is better
    // 0-30s = 100, 30-60s = 80, 60-120s = 60, 120s+ = 40
    if (estimatedSeconds <= 30) return 100;
    if (estimatedSeconds <= 60) return 100 - ((estimatedSeconds - 30) / 30) * 20;
    if (estimatedSeconds <= 120) return 80 - ((estimatedSeconds - 60) / 60) * 20;
    return Math.max(40 - ((estimatedSeconds - 120) / 120) * 20, 20);
  }

  private scoreMaintenance(manifests: K8sManifestSet): number {
    let score = 50; // Base score

    const deployment = manifests.deployment as any;

    // Check for labels and annotations
    const metadata = deployment?.metadata || {};
    if (metadata.labels && Object.keys(metadata.labels).length > 1) {
      score += 10; // Multiple labels for better organization
    }
    if (metadata.annotations && Object.keys(metadata.annotations).length > 0) {
      score += 5; // Annotations for metadata
    }

    // Check for consistent labeling
    const templateLabels = deployment?.spec?.template?.metadata?.labels || {};
    if (JSON.stringify(templateLabels) !== '{}') {
      score += 8; // Pod template has labels
    }

    // Check for ConfigMap usage (externalized configuration)
    if (manifests.configMap) {
      score += 15;
    }

    // Check for resource naming consistency
    const deploymentName = metadata.name;
    const serviceName = (manifests.service as any)?.metadata?.name;
    if (deploymentName === serviceName) {
      score += 10; // Consistent naming
    }

    // Check for environment-specific configuration
    const containers = deployment?.spec?.template?.spec?.containers || [];
    for (const container of containers) {
      if (container.env && container.env.length > 0) {
        score += 5; // Environment variables configured
      }
    }

    // Check for ingress (production-ready external access)
    if (manifests.ingress) {
      score += 12;
    }

    return Math.min(score, 100);
  }

  private parseCpuValue(cpu: string): number {
    // Convert CPU values to millicores
    if (cpu.endsWith('m')) {
      return parseInt(cpu.slice(0, -1));
    }
    return parseFloat(cpu) * 1000;
  }

  private parseMemoryValue(memory: string): number {
    // Convert memory values to MB
    const units: Record<string, number> = {
      'Ki': 1 / 1024,
      'Mi': 1,
      'Gi': 1024,
      'Ti': 1024 * 1024,
      'K': 1 / 1024,
      'M': 1,
      'G': 1024,
      'T': 1024 * 1024,
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memory.endsWith(unit)) {
        return parseFloat(memory.slice(0, -unit.length)) * multiplier;
      }
    }

    // Default to bytes -> MB conversion
    return parseFloat(memory) / (1024 * 1024);
  }
}

// Specialized scorers for different environments
export class ProductionK8sScorer extends K8sManifestScorer {
  override readonly name = 'production-k8s-scorer';

  constructor(logger: Logger) {
    // Production weights emphasize security, reliability, and scalability
    const productionWeights: K8sScoringCriteria = {
      resourceEfficiency: 0.15,
      security: 0.35,
      scalability: 0.25,
      reliability: 0.2,
      deploymentSpeed: 0.025,
      maintenance: 0.025,
    };

    super(logger, productionWeights);
  }
}

export class DevelopmentK8sScorer extends K8sManifestScorer {
  override readonly name = 'development-k8s-scorer';

  constructor(logger: Logger) {
    // Development weights emphasize deployment speed and maintenance
    const developmentWeights: K8sScoringCriteria = {
      resourceEfficiency: 0.1,
      security: 0.15,
      scalability: 0.1,
      reliability: 0.15,
      deploymentSpeed: 0.3,
      maintenance: 0.2,
    };

    super(logger, developmentWeights);
  }
}
