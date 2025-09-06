import { Result, Success, Failure } from '../../types/core.js';
import type { Logger } from 'pino';
import {
  Candidate,
  ScoredCandidate,
  GenerationContext,
  CandidateGenerator,
  CandidateScorer,
  WinnerSelector,
  SamplingConfig,
  DEFAULT_SAMPLING_CONFIG,
} from '../../lib/sampling.js';
import { getTeamAlphaIntegration, ResourceManager, ProgressNotifier } from '../../infrastructure/team-alpha-integration.js';

// Base abstract classes for sampling implementation
export abstract class BaseCandidateGenerator<T> implements CandidateGenerator<T> {
  protected logger: Logger;
  protected resourceCache: ResourceManager;
  protected progressNotifier: ProgressNotifier;

  abstract readonly name: string;
  abstract readonly supportedTypes: string[];

  constructor(logger: Logger) {
    this.logger = logger;
    const teamAlphaIntegration = getTeamAlphaIntegration(logger);
    this.resourceCache = teamAlphaIntegration.getResourceManager();
    this.progressNotifier = teamAlphaIntegration.getProgressNotifier();
  }

  abstract generate(context: GenerationContext, count?: number): Promise<Result<Candidate<T>[]>>;
  abstract validate(candidate: Candidate<T>): Promise<Result<boolean>>;

  protected createCandidateId(strategy: string, context: GenerationContext): string {
    const timestamp = Date.now().toString(36);
    const hash = this.hashContext(context);
    return `${strategy}-${hash}-${timestamp}`;
  }

  protected hashContext(context: GenerationContext): string {
    const hashInput = JSON.stringify({
      sessionId: context.sessionId,
      repoPath: context.repoPath,
      requirements: context.requirements,
      constraints: context.constraints,
    });

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  protected notifyProgress(token: string, value: number, message?: string): void {
    this.progressNotifier.notifyProgress({
      token,
      value,
      ...(message && { message }),
    });
  }
}

export abstract class BaseCandidateScorer<T> implements CandidateScorer<T> {
  protected logger: Logger;
  protected _weights: Record<string, number>;

  abstract readonly name: string;

  constructor(logger: Logger, initialWeights: Record<string, number>) {
    this.logger = logger;
    this._weights = { ...initialWeights };
  }

  get weights(): Record<string, number> {
    return { ...this._weights };
  }

  updateWeights(weights: Record<string, number>): void {
    this._weights = { ...this._weights, ...weights };
    this.logger.debug({ weights: this._weights }, 'Updated scoring weights');
  }

  async score(candidates: Candidate<T>[]): Promise<Result<ScoredCandidate<T>[]>> {
    try {
      const scored: ScoredCandidate<T>[] = [];

      for (const candidate of candidates) {
        const scoreResult = await this.scoreCandidate(candidate);
        if (scoreResult.success) {
          scored.push(scoreResult.data);
        } else {
          this.logger.warn(
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
  }

  protected abstract scoreCandidate(candidate: Candidate<T>): Promise<Result<ScoredCandidate<T>>>;

  protected calculateFinalScore(scoreBreakdown: Record<string, number>): number {
    let finalScore = 0;
    let totalWeight = 0;

    for (const [criterion, score] of Object.entries(scoreBreakdown)) {
      const weight = this._weights[criterion] || 0;
      finalScore += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? finalScore / totalWeight : 0;
  }
}

export class HighestScoreWinnerSelector<T> implements WinnerSelector<T> {
  readonly strategy = 'highest-score';

  select(scored: ScoredCandidate<T>[]): Result<ScoredCandidate<T>> {
    if (scored.length === 0) {
      return Failure('No candidates to select from');
    }

    const winner = scored.reduce((best, current) => (current.score > best.score ? current : best));

    return Success(winner);
  }

  selectTop(scored: ScoredCandidate<T>[], count: number): Result<ScoredCandidate<T>[]> {
    if (scored.length === 0) {
      return Failure('No candidates to select from');
    }

    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, count);

    return Success(top);
  }
}

// Sampling orchestrator base class
export abstract class BaseSamplingOrchestrator<T> {
  protected logger: Logger;
  protected config: SamplingConfig;
  protected generator: CandidateGenerator<T>;
  protected scorer: CandidateScorer<T>;
  protected selector: WinnerSelector<T>;
  protected resourceCache: ResourceManager;

  constructor(
    logger: Logger,
    generator: CandidateGenerator<T>,
    scorer: CandidateScorer<T>,
    selector: WinnerSelector<T>,
    config: Partial<SamplingConfig> = {},
  ) {
    this.logger = logger;
    this.generator = generator;
    this.scorer = scorer;
    this.selector = selector;
    this.config = { ...DEFAULT_SAMPLING_CONFIG, ...config };
    
    // Initialize Team Alpha integration
    const teamAlphaIntegration = getTeamAlphaIntegration(logger);
    this.resourceCache = teamAlphaIntegration.getResourceManager();
  }

  async sample(context: GenerationContext, count?: number): Promise<Result<ScoredCandidate<T>>> {
    const candidateCount = Math.min(count || this.config.maxCandidates, this.config.maxCandidates);
    const progressToken = `sampling-${context.sessionId}-${Date.now()}`;

    try {
      // Check cache first
      const cacheKey = this.getCacheKey(context, candidateCount);
      const cached = await this.resourceCache.get(cacheKey);
      if (cached) {
        this.logger.debug({ cacheKey }, 'Returning cached sampling result');
        return Success(cached as ScoredCandidate<T>);
      }

      // Generate candidates
      this.notifyProgress(progressToken, 0, 'Generating candidates');
      const generateResult = await this.generator.generate(context, candidateCount);
      if (!generateResult.success) {
        return Failure(`Generation failed: ${generateResult.error}`);
      }

      this.notifyProgress(progressToken, 50, 'Scoring candidates');
      const scoreResult = await this.scorer.score(generateResult.data);
      if (!scoreResult.success) {
        return Failure(`Scoring failed: ${scoreResult.error}`);
      }

      // Select winner
      this.notifyProgress(progressToken, 90, 'Selecting winner');
      const winnerResult = this.selector.select(scoreResult.data);
      if (!winnerResult.success) {
        return Failure(`Selection failed: ${winnerResult.error}`);
      }

      // Cache result
      await this.resourceCache.set(cacheKey, winnerResult.data, this.config.cacheConfig.ttl);

      this.notifyProgress(progressToken, 100, 'Sampling complete');
      return winnerResult;
    } catch (error) {
      const errorMessage = `Sampling orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error, context }, errorMessage);
      return Failure(errorMessage);
    }
  }

  async sampleMultiple(
    context: GenerationContext,
    topN: number,
  ): Promise<Result<ScoredCandidate<T>[]>> {
    const candidateCount = Math.min(this.config.maxCandidates, topN * 2); // Generate more to select from

    try {
      const generateResult = await this.generator.generate(context, candidateCount);
      if (!generateResult.success) {
        return Failure(`Generation failed: ${generateResult.error}`);
      }

      const scoreResult = await this.scorer.score(generateResult.data);
      if (!scoreResult.success) {
        return Failure(`Scoring failed: ${scoreResult.error}`);
      }

      const topResult = this.selector.selectTop(scoreResult.data, topN);
      return topResult;
    } catch (error) {
      const errorMessage = `Multiple sampling failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error, context }, errorMessage);
      return Failure(errorMessage);
    }
  }

  private getCacheKey(context: GenerationContext, count: number): string {
    const hash = JSON.stringify({ context, count, generatorName: this.generator.name });
    return `sampling:${hash}`;
  }

  private notifyProgress(token: string, value: number, message?: string): void {
    const teamAlphaIntegration = getTeamAlphaIntegration(this.logger);
    const progressNotifier = teamAlphaIntegration.getProgressNotifier();
    progressNotifier.notifyProgress({
      token,
      value,
      ...(message && { message }),
    });
  }
}
