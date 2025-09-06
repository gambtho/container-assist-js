/**
 * Simple Scoring Functions - De-Enterprise Refactoring
 *
 * Replaces complex DeterministicScorer class with simple functions
 */

import { Result, Success } from '../../types/core.js';
import type { Logger } from 'pino';
import { ORCHESTRATOR_CONFIG } from '../../config/orchestrator-config.js';

/**
 * Simple candidate interface
 */
export interface Candidate<T> {
  id: string;
  data: T;
  generatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Simple scored candidate interface
 */
export interface ScoredCandidate<T> extends Candidate<T> {
  score: number;
  scoreBreakdown: Record<string, number>;
  rank: number;
}

/**
 * Simple scoring function
 */
export type ScoringFunction<T> = (candidate: Candidate<T>) => Promise<Record<string, number>>;

/**
 * Calculate weighted score from breakdown and weights
 */
export function calculateScore(
  scores: Record<string, number>,
  weights: Record<string, number>,
): number {
  let total = 0;
  let weightSum = 0;

  for (const [key, value] of Object.entries(scores)) {
    const weight = weights[key] || 0;
    total += value * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? Math.round(total / weightSum) : 0;
}

/**
 * Score and sort candidates - functional approach
 */
export async function scoreCandidates<T>(
  candidates: Candidate<T>[],
  scoreFn: ScoringFunction<T>,
  weights: Record<string, number>,
  logger?: Logger,
): Promise<Result<ScoredCandidate<T>[]>> {
  logger?.debug({ count: candidates.length }, 'Scoring candidates');

  const scored: ScoredCandidate<T>[] = [];

  for (const candidate of candidates) {
    try {
      const breakdown = await scoreFn(candidate);
      const score = calculateScore(breakdown, weights);

      scored.push({
        ...candidate,
        score,
        scoreBreakdown: breakdown,
        rank: 0, // Will be set after sorting
      });

      logger?.debug({
        candidateId: candidate.id,
        score,
        breakdown,
      }, 'Candidate scored');

      // Early stop if score is good enough
      if (score >= ORCHESTRATOR_CONFIG.EARLY_STOP_THRESHOLD) {
        logger?.debug({
          candidateId: candidate.id,
          score,
          threshold: ORCHESTRATOR_CONFIG.EARLY_STOP_THRESHOLD,
        }, 'Early stop triggered');
        break;
      }
    } catch (error) {
      logger?.error({
        candidateId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to score candidate');
    }
  }

  // Simple sort and rank
  scored.sort((a, b) => b.score - a.score);
  scored.forEach((c, i) => { c.rank = i + 1; });

  logger?.debug({
    winner: scored[0]?.id,
    topScore: scored[0]?.score,
    count: scored.length,
  }, 'Scoring completed');

  return Success(scored);
}

/**
 * Simple Dockerfile scoring function
 */
export const scoreDockerfileCandidates = (
  candidates: Candidate<string>[],
  scoreFn: ScoringFunction<string>,
  logger?: Logger,
) => scoreCandidates(candidates, scoreFn, ORCHESTRATOR_CONFIG.DOCKERFILE_WEIGHTS, logger);

/**
 * Simple K8s scoring function
 */
export const scoreK8sCandidates = (
  candidates: Candidate<string>[],
  scoreFn: ScoringFunction<string>,
  logger?: Logger,
) => scoreCandidates(candidates, scoreFn, ORCHESTRATOR_CONFIG.K8S_WEIGHTS, logger);
