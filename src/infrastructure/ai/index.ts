/**
 * AI Infrastructure - Public API
 * Clean, functional interface for AI operations
 */

// Request building
export {
  buildAIRequest,
  buildDockerfileRequest,
  buildAnalysisRequest,
  buildK8sRequest,
  buildKustomizationRequest,
  extractDockerfileVariables,
  type AIRequest,
  type RequestTemplate,
  type RequestOptions,
  type DockerfileVariables,
  type AnalysisVariables,
  type K8sVariables,
} from './requests.js';

// Sampling
export {
  createSampler,
  isSuccessResult,
  isErrorResult,
  getResultText,
  type SampleFunction,
  type SampleResult,
  type SamplerConfig,
} from './sampling.js';

// Error handling
export {
  recoverFromError,
  executeWithRecovery,
  retryWithBackoff,
  type ErrorHandler,
  type RecoveryResult,
} from './error-handlers.js';

// Caching (existing)
export { AIResponseCache, type CacheOptions, type CacheStats } from './response-cache.js';

// Structured processing
export { StructuredSampler } from './structured-sampler.js';

export { ContentValidator } from './content-validator.js';

// Types
export type { EnhancedAIConfig } from './types.js';
