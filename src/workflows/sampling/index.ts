/**
 * Sampling Module - Public API exports
 */

// Core types
export type {
  SamplingConfig,
  SamplingOptions,
  SamplingResult,
  DockerfileContext,
  DockerfileVariant,
  ScoredVariant,
  SamplingStrategy,
  ScoringCriteria,
  ScoreDetails,
  SelectionConstraints,
} from './types';

// Strategy engine
export {
  StrategyEngine,
  SecurityFirstStrategy,
  PerformanceStrategy,
  SizeOptimizedStrategy,
} from './strategy-engine';

// Scoring system
export {
  VariantScorer,
  DockerfileAnalyzer,
  DEFAULT_SCORING_CRITERIA,
  SCORING_PRESETS,
} from './scorer';

// Generation pipeline
export { VariantGenerationPipeline, SamplingValidator } from './generation-pipeline';

// Main sampling service
export { SamplingService } from './sampling-service';
