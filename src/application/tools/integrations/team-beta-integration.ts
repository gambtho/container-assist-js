/**
 * Team Beta Integration - Team Delta Implementation
 *
 * Integration adapter between Team Delta's enhanced tools and Team Beta's
 * sampling services, providing seamless candidate generation and scoring.
 */

import type { Logger } from 'pino';
import type { SamplingService, Candidate, ScoredCandidate, CandidateGenerator, SamplingConfig } from '../interfaces';
import type {
  CandidateGenerator as TeamBetaCandidateGenerator,
  CandidateScorer,
  WinnerSelector,
  GenerationContext,
  SamplingConfig as TeamBetaSamplingConfig,
} from '../../../lib/sampling';
import { Success, Failure, type Result } from '../../../types/core/index';

/**
 * Configuration for Team Beta integration
 */
export interface TeamBetaIntegrationConfig {
  sessionId: string;
  timeout: number;
  enableCaching: boolean;
  validationEnabled: boolean;
}

/**
 * Adapter to convert between Team Delta and Team Beta interfaces
 */
export class TeamBetaSamplingService implements SamplingService {
  constructor(
    private logger: Logger,
    private config: TeamBetaIntegrationConfig,
    private generator: TeamBetaCandidateGenerator<any>,
    private scorer: CandidateScorer<any>,
    private selector: WinnerSelector<any>,
  ) {}

  /**
   * Generate candidates using Team Beta's generator
   */
  async generateCandidates<T>(
    input: unknown,
    config: SamplingConfig,
    generator: CandidateGenerator<T>,
  ): Promise<Candidate<T>[]> {
    this.logger.debug({ input, config }, 'Generating candidates via Team Beta');

    // Convert Team Delta config to Team Beta config
    const teamBetaConfig = this.convertToTeamBetaConfig(config);

    // Create Team Beta generation context
    const context: GenerationContext = {
      sessionId: this.config.sessionId,
      repoPath: typeof input === 'object' && input && 'repoPath' in input
        ? String((input as any).repoPath)
        : undefined,
      requirements: typeof input === 'object' ? input as Record<string, unknown> : { input },
    };

    try {
      // Use Team Beta's generator
      const generateResult = await this.generator.generate(context, config.maxCandidates);

      if (!generateResult.ok) {
        const errorMsg = 'error' in generateResult ? generateResult.error : 'Unknown error';
        this.logger.error({ error: errorMsg }, 'Team Beta generation failed');
        return [];
      }

      // Convert Team Beta candidates to Team Delta format
      const candidates: Candidate<T>[] = generateResult.value.map(candidate => ({
        id: candidate.id,
        content: candidate.content as T,
        metadata: {
          strategy: candidate.metadata.strategy,
          source: candidate.metadata.source,
          confidence: candidate.metadata.confidence,
          teamBetaGenerated: true,
          generatedAt: candidate.generatedAt.toISOString(),
        },
        generatedAt: candidate.generatedAt,
      }));

      this.logger.debug({ count: candidates.length }, 'Generated candidates via Team Beta');
      return candidates;
    } catch (error) {
      this.logger.error({ error }, 'Error during Team Beta candidate generation');
      return [];
    }
  }

  /**
   * Score candidates using Team Beta's scorer
   */
  async scoreCandidates<T>(
    candidates: Candidate<T>[],
    weights: Record<string, number>,
  ): Promise<ScoredCandidate<T>[]> {
    this.logger.debug({ candidateCount: candidates.length, weights }, 'Scoring candidates via Team Beta');

    try {
      // Convert Team Delta candidates back to Team Beta format
      const teamBetaCandidates = candidates.map(candidate => ({
        id: candidate.id,
        content: candidate.content,
        metadata: {
          strategy: String(candidate.metadata.strategy || 'unknown'),
          source: String(candidate.metadata.source || 'team-delta'),
          confidence: Number(candidate.metadata.confidence || 0.5),
        },
        generatedAt: candidate.generatedAt,
      }));

      // Update scorer weights
      this.scorer.updateWeights(weights);

      // Use Team Beta's scorer
      const scoreResult = await this.scorer.score(teamBetaCandidates);

      if (!scoreResult.ok) {
        const errorMsg = 'error' in scoreResult ? scoreResult.error : 'Unknown error';
        this.logger.error({ error: errorMsg }, 'Team Beta scoring failed');
        return [];
      }

      // Convert scored candidates to Team Delta format
      const scoredCandidates: ScoredCandidate<T>[] = scoreResult.value.map(scored => ({
        id: scored.id,
        content: scored.content as T,
        metadata: {
          ...candidates.find(c => c.id === scored.id)?.metadata,
          teamBetaScored: true,
        },
        generatedAt: scored.generatedAt,
        score: scored.score,
        scores: scored.scoreBreakdown,
        reasoning: `Scored using Team Beta (rank: ${scored.rank})`,
      }));

      this.logger.debug({ count: scoredCandidates.length }, 'Scored candidates via Team Beta');
      return scoredCandidates;
    } catch (error) {
      this.logger.error({ error }, 'Error during Team Beta candidate scoring');
      return [];
    }
  }

  /**
   * Select winner using Team Beta's selector
   */
  selectWinner<T>(scored: ScoredCandidate<T>[]): ScoredCandidate<T> {
    this.logger.debug({ candidateCount: scored.length }, 'Selecting winner via Team Beta');

    if (scored.length === 0) {
      throw new Error('No scored candidates available for selection');
    }

    try {
      // Convert to Team Beta format for selection
      const teamBetaScored = scored.map(candidate => ({
        id: candidate.id,
        content: candidate.content,
        metadata: {
          strategy: String(candidate.metadata?.strategy || 'unknown'),
          source: String(candidate.metadata?.source || 'team-delta'),
          confidence: Number(candidate.metadata?.confidence || 0.5),
        },
        generatedAt: candidate.generatedAt,
        score: candidate.score,
        scoreBreakdown: candidate.scores,
        rank: 0, // Will be set by selector
      }));

      // Use Team Beta's selector
      const selectionResult = this.selector.select(teamBetaScored);

      if (!selectionResult.ok) {
        const errorMsg = 'error' in selectionResult ? selectionResult.error : 'Unknown error';
        this.logger.error({ error: errorMsg }, 'Team Beta selection failed');
        throw new Error(`Selection failed: ${errorMsg}`);
      }

      // Find corresponding Team Delta candidate
      const winner = scored.find(candidate => candidate.id === selectionResult.value.id);

      if (!winner) {
        throw new Error('Selected winner not found in original candidate list');
      }

      this.logger.info({
        winnerId: winner.id,
        score: winner.score,
      }, 'Selected winner via Team Beta');

      return winner;
    } catch (error) {
      this.logger.error({ error }, 'Error during Team Beta winner selection');
      throw error;
    }
  }

  /**
   * Convert Team Delta sampling config to Team Beta format
   */
  private convertToTeamBetaConfig(config: SamplingConfig): TeamBetaSamplingConfig {
    return {
      maxCandidates: config.maxCandidates,
      defaultWeights: config.scoringWeights,
      timeout: config.timeoutMs,
      cacheConfig: {
        ttl: 3600000, // 1 hour in ms
        maxSize: 100,
      },
      validation: {
        enabled: this.config.validationEnabled,
        failFast: false,
      },
    };
  }
}

/**
 * Integration service factory for creating Team Beta integrated sampling service
 */
export class TeamBetaIntegrationFactory {
  constructor(private logger: Logger) {}

  /**
   * Create a sampling service that integrates with Team Beta components
   */
  createSamplingService(
    sessionId: string,
    generator: TeamBetaCandidateGenerator<any>,
    scorer: CandidateScorer<any>,
    selector: WinnerSelector<any>,
    config?: Partial<TeamBetaIntegrationConfig>,
  ): SamplingService {
    const finalConfig: TeamBetaIntegrationConfig = {
      sessionId,
      timeout: 30000,
      enableCaching: true,
      validationEnabled: true,
      ...config,
    };

    return new TeamBetaSamplingService(
      this.logger,
      finalConfig,
      generator,
      scorer,
      selector,
    );
  }

  /**
   * Create a mock sampling service that falls back to Team Delta's mock implementation
   * when Team Beta components are not available
   */
  createMockSamplingService(sessionId: string): SamplingService {
    // Import and use the existing mock implementation
    const { createMockSamplingService } = require('../mocks/sampling-service.mock');

    const mockService = createMockSamplingService(this.logger);

    this.logger.info({ sessionId }, 'Created fallback mock sampling service for Team Beta integration');

    return mockService;
  }
}

/**
 * Factory function for creating Team Beta integration
 */
export function createTeamBetaIntegration(logger: Logger): TeamBetaIntegrationFactory {
  return new TeamBetaIntegrationFactory(logger);
}
