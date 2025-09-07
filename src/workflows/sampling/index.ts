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
  createSecurityFirstStrategy as SecurityFirstStrategy,
  createPerformanceStrategy as PerformanceStrategy,
  createSizeOptimizedStrategy as SizeOptimizedStrategy,
} from './strategy-engine';

// Scoring system
export {
  VariantScorer,
  DockerfileAnalyzer,
  DEFAULT_SCORING_CRITERIA,
  SCORING_PRESETS,
} from './scorer';

// Generation pipeline
export { VariantGenerationPipeline } from './generation-pipeline';

// Validation functions
export * from './validation';

// Main sampling service
export { SamplingService } from './sampling-service';
