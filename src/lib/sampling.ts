// Sampling types - keeping only what's exported and needed
export interface CandidateMetadata {
  strategy: string;
  source: string;
  confidence: number;
  estimatedBuildTime?: number;
  estimatedSize?: number;
  securityRating?: number;
}

export interface ScoringCriteria {
  buildTime: number;
  imageSize: number;
  security: number;
  bestPractices: number;
  maintenance: number;
  performance: number;
  [key: string]: number;
}
