// Core sampling types
interface Candidate<T> {
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

// Sampling configuration
interface SamplingConfig {
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
  [key: string]: number; // Allow index signature for compatibility
}

const DEFAULT_SCORING_WEIGHTS: ScoringCriteria = {
  buildTime: 0.2,
  imageSize: 0.15,
  security: 0.3,
  bestPractices: 0.15,
  maintenance: 0.1,
  performance: 0.1,
};
