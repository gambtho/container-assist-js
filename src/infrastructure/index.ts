/**
 * Infrastructure Layer - Consolidated exports
 * Organized into 3 logical groups: external, ai, and core
 */

// External system integrations
export * from './external/index';

// AI/ML services - unified API with explicit exports to avoid conflicts
export {
  // Request building
  buildAIRequest,
  buildDockerfileRequest,
  buildAnalysisRequest,
  buildK8sRequest,
  extractDockerfileVariables,

  // Sampling
  createSampler,
  isSuccessResult,
  isErrorResult,
  getResultText,

  // Error handling
  recoverFromError,
  executeWithRecovery,
  retryWithBackoff,

  // Structured processing
  StructuredSampler,
  ContentValidator,

  // Caching
  AIResponseCache,
} from './ai/index.js';

export type {
  AIRequest,
  RequestTemplate,
  RequestOptions,
  DockerfileVariables,
  AnalysisVariables,
  K8sVariables,
  SampleFunction,
  SampleResult,
  SamplerConfig,
  ErrorHandler,
  RecoveryResult,
  CacheOptions,
  CacheStats,
  EnhancedAIConfig as AIEnhancedConfig, // Rename to avoid conflict
} from './ai/index.js';
