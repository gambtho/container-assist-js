/**
 * Simple Sampling Functions - De-Enterprise Refactoring
 *
 * Replaces abstract class inheritance with simple composition functions.
 * Follows the pattern: functions over classes, composition over inheritance.
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../types/core/index';
import {
  Candidate,
  ScoredCandidate,
  GenerationContext,
  SamplingConfig,
  DEFAULT_SAMPLING_CONFIG,
} from '../lib/sampling';
import { logSamplingEvent } from '../lib/logger';
import { ORCHESTRATOR_CONFIG } from '../config/orchestrator-config';

/**
 * Simple function type for generating candidates
 */
export type GeneratorFunction<T> = (
  context: GenerationContext,
  count: number,
  logger: Logger,
) => Promise<Result<Candidate<T>[]>>;

/**
 * Simple function type for scoring candidates
 */
export type ScorerFunction<T> = (
  candidates: Candidate<T>[],
  weights: Record<string, number>,
  logger: Logger,
) => Promise<Result<ScoredCandidate<T>[]>>;

/**
 * Simple function type for selecting winners
 */
export type SelectorFunction<T> = (
  scored: ScoredCandidate<T>[],
  count?: number,
) => Result<ScoredCandidate<T>[]>;

/**
 * Core sampling function that combines generation, scoring, and selection
 */
export type SamplingFunction<T> = (
  input: GenerationContext,
  count: number,
  logger: Logger,
) => Promise<Result<ScoredCandidate<T>>>;

/**
 * Utility functions extracted from base classes
 */
export const createCandidateId = (strategy: string, context: GenerationContext): string => {
  const timestamp = Date.now().toString(36);
  const hash = hashContext(context);
  return `${strategy}-${hash}-${timestamp}`;
};

export const hashContext = (context: GenerationContext): string => {
  const hashInput = JSON.stringify({
    sessionId: context.sessionId,
    repoPath: context.repoPath,
    requirements: context.requirements,
    constraints: context.constraints,
  });

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};

/**
 * Generic scoring function that replaces BaseCandidateScorer
 */
export const scoreCanidates = async <T>(
  candidates: Candidate<T>[],
  scoreFunction: (candidate: Candidate<T>) => Promise<Result<ScoredCandidate<T>>>,
  logger: Logger,
): Promise<Result<ScoredCandidate<T>[]>> => {
  try {
    const scored: ScoredCandidate<T>[] = [];

    for (const candidate of candidates) {
      const scoreResult = await scoreFunction(candidate);
      if (scoreResult.ok) {
        scored.push(scoreResult.value);
      } else {
        logger.warn(
          { candidateId: candidate.id, error: scoreResult.error },
          'Failed to score candidate',
        );
      }
    }

    // Rank candidates by score (highest first)
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((candidate, index) => {
      candidate.rank = index + 1;
    });

    return Success(scored);
  } catch (error) {
    return Failure(`Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Simple winner selection - highest score
 */
export const selectWinner = <T>(scored: ScoredCandidate<T>[]): Result<ScoredCandidate<T>> => {
  if (scored.length === 0) {
    return Failure('No candidates to select from');
  }

  const winner = scored.reduce((best, current) => (current.score > best.score ? current : best));
  return Success(winner);
};

/**
 * Select top N candidates
 */
export const selectTopN = <T>(
  scored: ScoredCandidate<T>[],
  count: number,
): Result<ScoredCandidate<T>[]> => {
  if (scored.length === 0) {
    return Failure('No candidates to select from');
  }

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, count);

  return Success(top);
};

/**
 * Check if early stop conditions are met based on score threshold
 */
const checkEarlyStop = <T>(
  scored: ScoredCandidate<T>[],
  logger: Logger,
): ScoredCandidate<T> | null => {
  const topCandidate = scored[0];
  if (!topCandidate) return null;

  if (topCandidate.score >= ORCHESTRATOR_CONFIG.EARLY_STOP_THRESHOLD) {
    logSamplingEvent(logger, 'early_stop/triggered', {
      candidateId: topCandidate.id,
      score: topCandidate.score,
      threshold: ORCHESTRATOR_CONFIG.EARLY_STOP_THRESHOLD,
      strategy: topCandidate.metadata.strategy,
    });
    return topCandidate;
  }
  return null;
};

/**
 * Deterministic tie-breaking selection with strategy preference
 */
const selectWithTieBreaking = <T>(
  scored: ScoredCandidate<T>[],
  logger: Logger,
): ScoredCandidate<T> => {
  if (scored.length === 0) {
    throw new Error('No candidates to select from');
  }

  const top = scored[0];
  const second = scored[1];

  // Should not happen due to the check above, but TypeScript needs this
  if (!top) {
    throw new Error('No top candidate available');
  }

  // If no second candidate or no tie, return top
  if (!second || Math.abs(top.score - second.score) > ORCHESTRATOR_CONFIG.TIEBREAK_MARGIN) {
    logSamplingEvent(logger, 'selection/clear_winner', {
      winnerId: top.id,
      score: top.score,
      margin: second ? top.score - second.score : 'no_competition',
    });
    return top;
  }

  // Tie detected - use deterministic tie-breaking
  logSamplingEvent(logger, 'tiebreak/detected', {
    candidates: [top.id, second.id],
    scores: [top.score, second.score],
    margin: Math.abs(top.score - second.score),
    threshold: ORCHESTRATOR_CONFIG.TIEBREAK_MARGIN,
  });

  // Deterministic strategy preference order (configurable)
  const strategyOrder = ['alpine-multistage', 'alpine-minimal', 'ubuntu-standard'];

  const topStrategyIndex = strategyOrder.indexOf(top.metadata.strategy);
  const secondStrategyIndex = strategyOrder.indexOf(second.metadata.strategy);

  let winner: ScoredCandidate<T>;
  let reason: string;

  // If both strategies are in the preference list, prefer the one with lower index (higher priority)
  if (topStrategyIndex !== -1 && secondStrategyIndex !== -1) {
    winner = topStrategyIndex < secondStrategyIndex ? top : second;
    reason = 'strategy_preference';
  }
  // If only one strategy is in the preference list, prefer it
  else if (topStrategyIndex !== -1) {
    winner = top;
    reason = 'strategy_known';
  } else if (secondStrategyIndex !== -1) {
    winner = second;
    reason = 'strategy_known';
  }
  // If neither strategy is in the list, fall back to other criteria
  else {
    // Prefer higher confidence
    const topConfidence = top.metadata.confidence || 0;
    const secondConfidence = second.metadata.confidence || 0;

    if (topConfidence !== secondConfidence) {
      winner = topConfidence > secondConfidence ? top : second;
      reason = 'confidence';
    } else {
      // Final fallback: lexicographic by ID for determinism
      winner = top.id < second.id ? top : second;
      reason = 'lexicographic';
    }
  }

  logSamplingEvent(logger, 'tiebreak/resolved', {
    winnerId: winner.id,
    loserId: winner === top ? second.id : top.id,
    reason,
    winnerStrategy: winner.metadata.strategy,
    winnerScore: winner.score,
  });

  return winner;
};

/**
 * Calculate weighted final score from breakdown
 */
export const calculateFinalScore = (
  scoreBreakdown: Record<string, number>,
  weights: Record<string, number>,
): number => {
  let finalScore = 0;
  let totalWeight = 0;

  for (const [criterion, score] of Object.entries(scoreBreakdown)) {
    const weight = weights[criterion] || 0;
    finalScore += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? finalScore / totalWeight : 0;
};

/**
 * Generic sampling orchestration function that replaces BaseSamplingOrchestrator
 */
export const runSampling = async <T>(
  context: GenerationContext,
  generator: GeneratorFunction<T>,
  scorer: ScorerFunction<T>,
  weights: Record<string, number>,
  logger: Logger,
  config: Partial<SamplingConfig> = {},
): Promise<Result<ScoredCandidate<T>>> => {
  const samplingConfig = { ...DEFAULT_SAMPLING_CONFIG, ...config };
  const candidateCount = samplingConfig.maxCandidates;

  try {
    // Log sampling start
    logSamplingEvent(logger, 'start', {
      sessionId: context.sessionId,
      maxCandidates: candidateCount,
      weights: Object.keys(weights).join(','),
    });

    // Generate candidates
    logSamplingEvent(logger, 'generation/start', { sessionId: context.sessionId });
    const generateResult = await generator(context, candidateCount, logger);

    if (!generateResult.ok) {
      logSamplingEvent(logger, 'generation/failure', {
        sessionId: context.sessionId,
        error: generateResult.error,
      });
      return Failure(`Generation failed: ${generateResult.error}`);
    }

    // Log candidate creation
    generateResult.value.forEach((candidate, index) => {
      logSamplingEvent(logger, 'candidate/created', {
        sessionId: context.sessionId,
        candidateId: candidate.id,
        strategy: candidate.metadata.strategy,
        index: index + 1,
        confidence: candidate.metadata.confidence,
      });
    });

    logSamplingEvent(logger, 'generation/end', {
      sessionId: context.sessionId,
      candidatesGenerated: generateResult.value.length,
    });

    // Score candidates
    logSamplingEvent(logger, 'scoring/start', { sessionId: context.sessionId });
    const scoreResult = await scorer(generateResult.value, weights, logger);

    if (!scoreResult.ok) {
      logSamplingEvent(logger, 'scoring/failure', {
        sessionId: context.sessionId,
        error: scoreResult.error,
      });
      return Failure(`Scoring failed: ${scoreResult.error}`);
    }

    // Log individual scores
    scoreResult.value.forEach((scored) => {
      logSamplingEvent(logger, 'candidate/scored', {
        sessionId: context.sessionId,
        candidateId: scored.id,
        score: scored.score,
        rank: scored.rank,
        scoreBreakdown: scored.scoreBreakdown,
      });
    });

    const topScore =
      scoreResult.value.length > 0 && scoreResult.value[0] ? scoreResult.value[0].score : 0;
    logSamplingEvent(logger, 'scoring/end', {
      sessionId: context.sessionId,
      topScore,
      averageScore:
        scoreResult.value.length > 0
          ? scoreResult.value.reduce((sum, c) => sum + c.score, 0) / scoreResult.value.length
          : 0,
    });

    // Check for early stop condition
    const earlyStopWinner = checkEarlyStop(scoreResult.value, logger);
    if (earlyStopWinner) {
      logSamplingEvent(logger, 'end', {
        sessionId: context.sessionId,
        success: true,
        winnerId: earlyStopWinner.id,
        candidatesProcessed: generateResult.value.length,
        earlyStop: true,
      });
      return Success(earlyStopWinner);
    }

    // Select winner with tie-breaking logic
    try {
      const winner = selectWithTieBreaking(scoreResult.value, logger);

      logSamplingEvent(logger, 'winner/selected', {
        sessionId: context.sessionId,
        winnerId: winner.id,
        winnerScore: winner.score,
        strategy: winner.metadata.strategy,
        margin:
          scoreResult.value.length > 1 && scoreResult.value[1]
            ? winner.score - scoreResult.value[1].score
            : 0,
      });

      logSamplingEvent(logger, 'end', {
        sessionId: context.sessionId,
        duration: Date.now() - new Date().getTime(), // Approximate duration
        success: true,
        winnerId: winner.id,
        candidatesProcessed: generateResult.value.length,
        earlyStop: false,
      });

      return Success(winner);
    } catch (error) {
      logSamplingEvent(logger, 'selection/failure', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown selection error',
      });
      return Failure(
        `Selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } catch (error) {
    const errorMessage = `Sampling failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

    logSamplingEvent(logger, 'failure', {
      sessionId: context.sessionId,
      error: errorMessage,
    });

    logger.error({ error, context }, errorMessage);
    return Failure(errorMessage);
  }
};

/**
 * Run sampling to get top N results
 */
export const runSamplingForTopN = async <T>(
  context: GenerationContext,
  generator: GeneratorFunction<T>,
  scorer: ScorerFunction<T>,
  weights: Record<string, number>,
  topN: number,
  logger: Logger,
  config: Partial<SamplingConfig> = {},
): Promise<Result<ScoredCandidate<T>[]>> => {
  const samplingConfig = { ...DEFAULT_SAMPLING_CONFIG, ...config };
  const candidateCount = Math.min(samplingConfig.maxCandidates, topN * 2); // Generate more to select from

  try {
    // Log multiple sampling start
    logSamplingEvent(logger, 'multiple/start', {
      sessionId: context.sessionId,
      requestedCount: topN,
      maxCandidates: candidateCount,
    });

    // Generate candidates
    const generateResult = await generator(context, candidateCount, logger);
    if (!generateResult.ok) {
      logSamplingEvent(logger, 'multiple/generation/failure', {
        sessionId: context.sessionId,
        error: generateResult.error,
      });
      return Failure(`Generation failed: ${generateResult.error}`);
    }

    // Score candidates
    const scoreResult = await scorer(generateResult.value, weights, logger);
    if (!scoreResult.ok) {
      logSamplingEvent(logger, 'multiple/scoring/failure', {
        sessionId: context.sessionId,
        error: scoreResult.error,
      });
      return Failure(`Scoring failed: ${scoreResult.error}`);
    }

    // Select top N
    const topResult = selectTopN(scoreResult.value, topN);
    if (!topResult.ok) {
      logSamplingEvent(logger, 'multiple/selection/failure', {
        sessionId: context.sessionId,
        error: topResult.error,
      });
      return topResult;
    }

    // Log top N selection results
    logSamplingEvent(logger, 'multiple/selected', {
      sessionId: context.sessionId,
      selectedCount: topResult.value.length,
      requestedCount: topN,
      topScore: topResult.value[0]?.score,
      lowestScore: topResult.value[topResult.value.length - 1]?.score,
      selectedStrategies: topResult.value.map((c) => c.metadata.strategy).join(','),
    });

    logSamplingEvent(logger, 'multiple/end', {
      sessionId: context.sessionId,
      success: true,
      resultsReturned: topResult.value.length,
    });

    return topResult;
  } catch (error) {
    const errorMessage = `Multiple sampling failed: ${error instanceof Error ? error.message : 'Unknown error'}`;

    logSamplingEvent(logger, 'multiple/failure', {
      sessionId: context.sessionId,
      error: errorMessage,
    });

    logger.error({ error, context }, errorMessage);
    return Failure(errorMessage);
  }
};
