import { Result } from '../types/core.js';

// Core sampling types
export interface Candidate<T> {
  id: string;
  content: T;
  metadata: CandidateMetadata;
  generatedAt: Date;
}

export interface CandidateMetadata {
  strategy: string;
  source: string;
  confidence: number;
  estimatedBuildTime?: number;
  estimatedSize?: number;
  securityRating?: number;
}

export interface ScoredCandidate<T> extends Candidate<T> {
  score: number;
  scoreBreakdown: Record<string, number>;
  rank: number;
}

export interface GenerationContext {
  sessionId: string;
  repoPath?: string;
  requirements?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  previousAttempts?: string[];
}

// Core sampling interfaces
export interface CandidateGenerator<T> {
  readonly name: string;
  readonly supportedTypes: string[];
  generate(context: GenerationContext, count?: number): Promise<Result<Candidate<T>[]>>;
  validate(candidate: Candidate<T>): Promise<Result<boolean>>;
}

export interface CandidateScorer<T> {
  readonly name: string;
  readonly weights: Record<string, number>;
  score(candidates: Candidate<T>[]): Promise<Result<ScoredCandidate<T>[]>>;
  updateWeights(weights: Record<string, number>): void;
}

export interface WinnerSelector<T> {
  readonly strategy: string;
  select(scored: ScoredCandidate<T>[]): Result<ScoredCandidate<T>>;
  selectTop(scored: ScoredCandidate<T>[], count: number): Result<ScoredCandidate<T>[]>;
}

// Sampling configuration
export interface SamplingConfig {
  maxCandidates: number;
  defaultWeights: Record<string, number>;
  timeout: number;
  cacheConfig: {
    ttl: number;
    maxSize: number;
  };
  validation: {
    enabled: boolean;
    failFast: boolean;
  };
}

// Scoring criteria definitions
export interface ScoringCriteria {
  buildTime: number;
  imageSize: number;
  security: number;
  bestPractices: number;
  maintenance: number;
  performance: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringCriteria = {
  buildTime: 0.2,
  imageSize: 0.15,
  security: 0.3,
  bestPractices: 0.15,
  maintenance: 0.1,
  performance: 0.1,
};

export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  maxCandidates: 5,
  defaultWeights: DEFAULT_SCORING_WEIGHTS,
  timeout: 30000, // 30 seconds
  cacheConfig: {
    ttl: 3600000, // 1 hour
    maxSize: 100,
  },
  validation: {
    enabled: true,
    failFast: false,
  },
};
