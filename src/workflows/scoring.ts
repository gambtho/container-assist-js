/**
 * Simple Scoring Functions - De-Enterprise Refactoring
 *
 * Replaces DeterministicScorer (157 lines) with simple scoring functions (~40 lines).
 * Removes complex class-based scoring system, weights validation, and enterprise patterns.
 */

import type { Logger } from 'pino';

/**
 * Simple candidate interface
 */
export interface ScoredCandidate<T> {
  id: string;
  data: T;
  score: number;
  generatedAt?: number;
}

/**
 * Score Dockerfile candidates based on simple quality metrics
 */
export const scoreDockerfiles = (
  candidates: Array<{ id: string; data: any; generatedAt?: number }>,
  logger?: Logger,
): ScoredCandidate<any>[] => {
  logger?.debug('Scoring Dockerfile candidates');

  return candidates
    .map(candidate => {
      let score = 100; // Start with perfect score

      if (candidate.data?.content) {
        const content = candidate.data.content.toLowerCase();

        // Simple scoring rules
        if (content.includes('latest')) score -= 20; // Avoid latest tags
        if (content.includes('root')) score -= 15;   // Avoid running as root
        if (!content.includes('user')) score -= 10;  // Should have USER directive
        if (content.split('\n').length > 20) score -= 10; // Too many layers
        if (!content.includes('healthcheck')) score -= 10; // Missing health check
        if (content.includes('curl') && content.includes('wget')) score -= 5; // Unnecessary tools
      }

      return {
        id: candidate.id,
        data: candidate.data,
        score: Math.max(0, score),
        generatedAt: candidate.generatedAt || Date.now(),
      };
    })
    .sort((a, b) => b.score - a.score); // Highest score first
};

/**
 * Score K8s manifest candidates based on simple quality metrics
 */
export const scoreK8sManifests = (
  candidates: Array<{ id: string; data: any; generatedAt?: number }>,
  logger?: Logger,
): ScoredCandidate<any>[] => {
  logger?.debug('Scoring K8s manifest candidates');

  return candidates
    .map(candidate => {
      let score = 100; // Start with perfect score

      if (candidate.data?.manifest) {
        const manifest = candidate.data.manifest;

        // Simple scoring rules
        if (!manifest.spec?.replicas) score -= 20;           // Should specify replicas
        if (!manifest.spec?.template?.spec?.securityContext) score -= 15; // Security context missing
        if (!manifest.spec?.template?.spec?.resources) score -= 15;       // Resource limits missing
        if (!manifest.spec?.template?.spec?.livenessProbe) score -= 10;   // Health checks missing
        if (!manifest.spec?.template?.spec?.readinessProbe) score -= 10;  // Readiness probe missing
        if (manifest.spec?.template?.spec?.containers?.[0]?.securityContext?.runAsUser === 0) score -= 15; // Running as root
      }

      return {
        id: candidate.id,
        data: candidate.data,
        score: Math.max(0, score),
        generatedAt: candidate.generatedAt || Date.now(),
      };
    })
    .sort((a, b) => b.score - a.score); // Highest score first
};

/**
 * Generic scoring function - picks best candidate based on simple heuristics
 */
export const scoreGeneric = <T>(
  candidates: Array<{ id: string; data: T }>,
  scoreFn?: (data: T) => number,
): ScoredCandidate<T>[] => {
  return candidates
    .map(candidate => ({
      id: candidate.id,
      data: candidate.data,
      score: scoreFn ? scoreFn(candidate.data) : 75, // Default score
      generatedAt: Date.now(),
    }))
    .sort((a, b) => b.score - a.score);
};
