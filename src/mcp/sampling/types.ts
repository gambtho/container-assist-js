/**
 * Shared types for sampling service
 * Consolidates interfaces from multiple sampling implementations
 */

import type { Result } from '@types';
import type { DockerfileVariant } from '@workflows/sampling/types';

export type SamplingStrategy = 'security' | 'performance' | 'size' | 'balanced' | 'creative';

export type SamplingMethod = 'temperature' | 'top_p' | 'top_k' | 'nucleus';

export type TransportMode = 'sdk' | 'completion' | 'native';

/**
 * Core sampling configuration shared across all implementations
 */
export interface SamplingConfig {
  sessionId: string;
  method?: SamplingMethod;
  temperature?: number;
  topP?: number;
  topK?: number;
  samples?: number;
  maxTokens?: number;
  strategy?: SamplingStrategy;
  diversityBoost?: number;
  transportMode?: TransportMode;
}

/**
 * Extended configuration for context-aware sampling
 */
export interface SamplingContext {
  language: string;
  framework?: string;
  dependencies: string[];
  ports: number[];
  buildTools: string[];
  environment: string;
  repoPath?: string;
}

/**
 * Quality metrics for sampling results
 */
export interface SamplingQuality {
  diversity: number;
  coherence: number;
  relevance: number;
}

/**
 * Metadata for sampling operations
 */
export interface SamplingMetadata {
  generationTime: number;
  tokensGenerated: number;
  samplingMethod: string;
  transportUsed: TransportMode;
  strategy: SamplingStrategy;
}

/**
 * Complete sampling result with quality assessment
 */
export interface SamplingResult {
  samples: string[];
  strategy: string;
  parameters: SamplingConfig;
  quality: SamplingQuality;
  metadata: SamplingMetadata;
}

/**
 * Extended sampling result for Dockerfile variants
 */
export interface DockerfileSamplingResult extends SamplingResult {
  variants: DockerfileVariant[];
  bestVariant?: DockerfileVariant;
  context: SamplingContext;
}

/**
 * Configuration for strategy-based sampling
 */
export interface StrategySamplingConfig extends SamplingConfig {
  context: SamplingContext;
  variantCount?: number;
  strategies?: SamplingStrategy[];
}

/**
 * Configuration for diversity-boosted sampling
 */
export interface DiversitySamplingConfig extends SamplingConfig {
  targetDiversity: number;
  maxAttempts: number;
  boostFactor?: number;
}

/**
 * Sampler capabilities information
 */
export interface SamplerCapabilities {
  mcpSampling: boolean;
  strategies: SamplingStrategy[];
  methods: SamplingMethod[];
  transports: TransportMode[];
  maxSamples: number;
  maxTokens: number;
  supportsDiversity: boolean;
  supportsStrategy: boolean;
}

/**
 * Base interface for all sampling implementations
 */
export interface Sampler {
  /**
   * Generate multiple samples for the given prompt
   */
  sampleCompletions(prompt: string, config: SamplingConfig): Promise<Result<SamplingResult>>;

  /**
   * Generate Dockerfile variants using strategy-based sampling
   */
  sampleDockerfileStrategies(
    prompt: string,
    config: StrategySamplingConfig,
  ): Promise<Result<DockerfileSamplingResult>>;

  /**
   * Generate samples with diversity optimization
   */
  sampleWithDiversityBoost(
    prompt: string,
    config: DiversitySamplingConfig,
  ): Promise<Result<string[]>>;

  /**
   * Check if the sampler is available for use
   */
  isAvailable(): boolean;

  /**
   * Get sampler capabilities
   */
  getCapabilities(): SamplerCapabilities;

  /**
   * Get supported transport modes in preference order
   */
  getSupportedTransports(): TransportMode[];

  /**
   * Initialize the sampler (if needed)
   */
  initialize?(): Promise<Result<void>>;

  /**
   * Cleanup resources
   */
  cleanup?(): Promise<void>;
}

/**
 * Feature flags for sampling functionality
 */
export interface SamplingFeatureFlags {
  enableSDKTransport: boolean;
  enableNativeTransport: boolean;
  enableCompletionTransport: boolean;
  preferredTransport: TransportMode;
  fallbackTransports: TransportMode[];
  enableDiversityBoost: boolean;
  enableStrategyOptimization: boolean;
  enableQualityAssessment: boolean;
}

/**
 * Default feature flags
 */
export const DEFAULT_SAMPLING_FEATURES: SamplingFeatureFlags = {
  enableSDKTransport: true,
  enableNativeTransport: true,
  enableCompletionTransport: true,
  preferredTransport: 'sdk',
  fallbackTransports: ['native', 'completion'],
  enableDiversityBoost: true,
  enableStrategyOptimization: true,
  enableQualityAssessment: true,
};
