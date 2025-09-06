/**
 * Simple Tie-Breaking Logic for Candidate Selection
 *
 * Deterministic tie-breaking when scores are too close
 */

import type { Logger } from 'pino';
import { ORCHESTRATOR_CONFIG } from '../../config/orchestrator-config.js';
import { logSamplingEvent } from '../../lib/logger.js';
import type { ScoredCandidate } from '../scoring.js';

/**
 * Tie-breaking strategies
 */
export enum TiebreakStrategy {
  TIMESTAMP = 'timestamp',      // Prefer newer candidates
  FIRST = 'first',              // Prefer first candidate (stable)
  METADATA = 'metadata',        // Use metadata field for comparison
}

/**
 * Select the winning candidate with tie-breaking if needed
 */
export function selectWinner<T>(
  candidates: ScoredCandidate<T>[],
  logger: Logger,
  strategy: TiebreakStrategy = TiebreakStrategy.TIMESTAMP,
): ScoredCandidate<T> | null {
  if (candidates.length === 0) {
    logger.warn('No candidates provided for selection');
    return null;
  }

  if (candidates.length === 1) {
    const single = candidates[0]!;
    logSamplingEvent(logger, 'selected', {
      winnerId: single.id,
      reason: 'single-candidate',
      score: single.score,
    });
    return single;
  }

  const top = candidates[0]!;
  const second = candidates[1];

  if (!second) {
    // Only one candidate, return it
    logSamplingEvent(logger, 'selected', {
      winnerId: top.id,
      reason: 'single-candidate',
      score: top.score,
    });
    return top;
  }

  // Check if tie-breaking is needed based on configurable margin
  // If scores are within the margin, they're considered tied
  const scoreDiff = Math.abs(top.score - second.score);
  if (scoreDiff <= ORCHESTRATOR_CONFIG.TIEBREAK_MARGIN) {
    logSamplingEvent(logger, 'tiebreak/needed', {
      candidates: [top.id, second.id],
      scores: [top.score, second.score],
      difference: scoreDiff,
      margin: ORCHESTRATOR_CONFIG.TIEBREAK_MARGIN,
    });

    // Apply tie-breaking strategy
    const winner = applyTiebreaker(top, second, strategy, logger);

    logSamplingEvent(logger, 'tiebreak/resolved', {
      winnerId: winner.id,
      strategy,
      reason: `tiebreak-${strategy}`,
    });

    return winner;
  }

  // Clear winner, no tie-breaking needed
  logSamplingEvent(logger, 'selected', {
    winnerId: top.id,
    reason: 'highest-score',
    score: top.score,
    margin: scoreDiff,
  });

  return top;
}

/**
 * Apply the specified tie-breaking strategy
 */
function applyTiebreaker<T>(
  candidate1: ScoredCandidate<T>,
  candidate2: ScoredCandidate<T>,
  strategy: TiebreakStrategy,
  logger: Logger,
): ScoredCandidate<T> {
  switch (strategy) {
    case TiebreakStrategy.TIMESTAMP:
      return (candidate1.generatedAt || 0) >= (candidate2.generatedAt || 0) ? candidate1 : candidate2;

    case TiebreakStrategy.FIRST:
      // Always prefer the first candidate (stable selection)
      return candidate1;

    case TiebreakStrategy.METADATA: {
      // Simple metadata comparison - for simple scoring, just fall back to timestamp
      logger.debug('Metadata tie-breaking not supported in simple scoring, falling back to timestamp');
      return (candidate1.generatedAt || 0) >= (candidate2.generatedAt || 0) ? candidate1 : candidate2;
    }

    default:
      logger.warn({ strategy }, 'Unknown tie-breaking strategy, using timestamp');
      return (candidate1.generatedAt || 0) >= (candidate2.generatedAt || 0) ? candidate1 : candidate2;
  }
}

/**
 * Select top N candidates with optional tie-breaking
 */
export function selectTopCandidates<T>(
  candidates: ScoredCandidate<T>[],
  count: number,
  logger: Logger,
  allowTies: boolean = false,
): ScoredCandidate<T>[] {
  if (candidates.length <= count) {
    return candidates;
  }

  const selected: ScoredCandidate<T>[] = [];

  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    if (i === 0) {
      selected.push(candidate);
      continue;
    }

    const prevCandidate = candidates[i - 1];

    if (prevCandidate) {
      // Check if this candidate is tied with previous
      const scoreDiff = Math.abs(candidate.score - prevCandidate.score);
      const isTied = scoreDiff <= ORCHESTRATOR_CONFIG.TIEBREAK_MARGIN;

      if (isTied && !allowTies) {
        // Apply tie-breaking
        logSamplingEvent(logger, 'top-selection/tiebreak', {
          position: i + 1,
          candidates: [prevCandidate.id, candidate.id],
          scores: [prevCandidate.score, candidate.score],
        });
      }
    }

    selected.push(candidate);
  }

  const lastSelected = selected[selected.length - 1];
  logSamplingEvent(logger, 'top-selection/complete', {
    requested: count,
    selected: selected.length,
    topScore: selected[0]?.score,
    lowestScore: lastSelected?.score,
  });

  return selected;
}

/**
 * Check if candidates need tie-breaking
 */
export function needsTiebreaking<T>(
  candidates: ScoredCandidate<T>[],
  margin: number = ORCHESTRATOR_CONFIG.TIEBREAK_MARGIN,
): boolean {
  if (candidates.length < 2) return false;

  const scoreDiff = Math.abs(candidates[0]!.score - candidates[1]!.score);
  return scoreDiff <= margin;
}
