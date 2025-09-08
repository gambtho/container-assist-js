/**
 * Sampling Module - Entry point for all sampling operations
 *
 * This module provides a unified interface for all sampling operations.
 * Use Sampler for all sampling needs.
 */

// Primary export - use this for all new code
export { Sampler } from './sampler';

// Export all types
export type {
  SamplingConfig,
  SamplingResult,
  SamplingContext,
  SamplingQuality,
  SamplingStrategy,
  TransportMode,
  SamplerCapabilities,
  StrategySamplingConfig,
  DiversitySamplingConfig,
  DockerfileSamplingResult,
  SamplingFeatureFlags,
} from './types';

// Export the interface type with a different name to avoid conflict
export type { Sampler as SamplerInterface } from './types';

export { DEFAULT_SAMPLING_FEATURES } from './types';

// Note: mcp-sampling.ts is internal and not exported
