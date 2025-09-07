/**
 * Orchestrator Configuration Constants
 *
 * Simple, centralized configuration for the orchestrator
 */

/**
 * Main orchestrator configuration
 */
export const ORCHESTRATOR_CONFIG = {
  // Sampling configuration
  DEFAULT_CANDIDATES: 3,
  MAX_CANDIDATES: 5,
  EARLY_STOP_THRESHOLD: 90,
  TIEBREAK_MARGIN: 5,

  // Scoring weights for Dockerfile evaluation (sum to 100)
  DOCKERFILE_WEIGHTS: {
    staticLint: 30,
    imageSize: 30,
    buildTime: 25,
    warnings: 15,
  },

  // Scoring weights for K8s manifest evaluation (sum to 100)
  K8S_WEIGHTS: {
    validation: 40,
    security: 30,
    resources: 20,
    probes: 10,
  },

  // Security scan thresholds
  SCAN_THRESHOLDS: {
    critical: 0,
    high: 2,
    medium: 10,
  },

  // Build size limits
  BUILD_SIZE_LIMITS: {
    sanityFactor: 1.25, // Build should not be more than 25% larger than best candidate
    rejectFactor: 2.5, // Reject if more than 2.5x larger
  },

  // Verification timeouts
  VERIFY_TIMEOUTS: {
    readySeconds: 300, // 5 minutes for container to be ready
    totalSeconds: 600, // 10 minutes total timeout
  },

  STAGES: {
    analysis: {
      maxRetries: 2,
      timeoutSeconds: 60,
    },
    dockerfile: {
      maxRetries: 3,
      timeoutSeconds: 120,
    },
    build: {
      maxRetries: 1,
      timeoutSeconds: 300,
    },
    scan: {
      maxRetries: 2,
      timeoutSeconds: 180,
    },
    k8s: {
      maxRetries: 2,
      timeoutSeconds: 90,
    },
    deploy: {
      maxRetries: 1,
      timeoutSeconds: 300,
    },
    verify: {
      maxRetries: 3,
      timeoutSeconds: 600,
    },
  },
} as const;

export type OrchestratorConfig = typeof ORCHESTRATOR_CONFIG;

/**
 * Helper to get stage configuration
 */
export function getStageConfig(
  stage: keyof typeof ORCHESTRATOR_CONFIG.STAGES,
): (typeof ORCHESTRATOR_CONFIG.STAGES)[keyof typeof ORCHESTRATOR_CONFIG.STAGES] {
  return ORCHESTRATOR_CONFIG.STAGES[stage];
}

/**
 * Helper to validate scoring weights sum to 100
 */
export function validateScoringWeights(weights: Record<string, number>): boolean {
  const sum = Object.values(weights).reduce((acc, val) => acc + val, 0);
  return Math.abs(sum - 100) < 0.01; // Allow for floating point precision
}
