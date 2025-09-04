/**
 * Infrastructure Layer - Consolidated exports
 * Organized into 3 logical groups: external, ai, and core
 */

// External system integrations
export * from './external/index';

// AI/ML services
export * from './ai/factory';
export * from './ai/mcp-sampler';
export * from './ai/mock-sampler';
// Skip repository-analyzer to avoid duplicate export

// Explicit exports to resolve naming conflicts
export type {
  SecurityIssue as StructuredSamplerSecurityIssue,
  ValidationResult as StructuredSamplerValidationResult,
} from './ai/structured-sampler';
export type {
  SecurityIssue as ContentValidatorSecurityIssue,
  ValidationResult as ContentValidatorValidationResult,
} from './ai/content-validator';

// Export the main classes from these modules
export { StructuredSampler } from './ai/structured-sampler';
export { ContentValidator } from './ai/content-validator';

// Core infrastructure services
// (Currently no core services - removed obsolete directory)
