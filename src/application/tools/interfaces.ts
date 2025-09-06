/**
 * Enhanced MCP Tool Interfaces - Team Delta Implementation
 *
 * Defines sampling-aware tools, resource integration patterns, and progress event standardization
 * for the unified MCP implementation plan.
 */

import type { Logger } from 'pino';
import type { Result } from '../../types/core/index';
import type { MCPToolCallResponse } from '../../types/tools';

/**
 * MCP Resource Reference for large artifacts
 */
export interface ResourceReference {
  uri: string;
  mimeType: string;
  description: string;
  size?: number;
  ttl?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Resource publishing configuration
 */
export interface ResourceConfig {
  maxInlineSize: number; // Max size for inline content (bytes)
  defaultTTL: number; // Default TTL in seconds
  supportedMimeTypes: string[];
  enableCompression: boolean;
}

/**
 * Sampling configuration for candidate generation
 */
export interface SamplingConfig {
  maxCandidates: number;
  scoringWeights: Record<string, number>;
  timeoutMs: number;
  cachingEnabled: boolean;
  deterministicSeed?: string;
}

/**
 * Progress reporting interface for long-running operations
 */
export interface ProgressReporter {
  reportProgress(step: string, percentage: number, message?: string): void;
  reportComplete(summary: string): void;
  reportError(error: string, recoverable: boolean): void;
  reportSubtask(subtaskName: string, progress: number): void;
}

/**
 * Resource publisher for handling large outputs
 */
export interface ResourcePublisher {
  publish<T>(data: T, mimeType: string, ttl?: number): Promise<ResourceReference>;
  publishLarge<T>(data: T, mimeType: string): Promise<ResourceReference>;
  createReference(
    uri: string,
    description: string,
    metadata?: Record<string, unknown>,
  ): ResourceReference;
  cleanup(pattern?: string): Promise<void>;
}

/**
 * Enhanced tool interface that extends standard MCP tools with sampling and resource capabilities
 */
export interface SamplingAwareTool {
  readonly name: string;
  readonly description: string;
  readonly supportsSampling: boolean;
  readonly supportsResources: boolean;
  readonly supportsDynamicConfig: boolean;

  // Optional configurations
  readonly samplingConfig?: SamplingConfig;
  readonly resourceConfig?: ResourceConfig;

  // Tool capabilities metadata
  readonly capabilities: {
    progressReporting: boolean;
    resourcePublishing: boolean;
    candidateGeneration: boolean;
    errorRecovery: boolean;
  };

  // Enhanced execution method with MCP response format
  execute(
    params: Record<string, unknown>,
    context: EnhancedToolContext,
  ): Promise<Result<MCPToolCallResponse>>;
}

/**
 * Enhanced tool execution context with MCP resource and progress capabilities
 */
export interface EnhancedToolContext {
  logger: Logger;
  sessionId: string;
  progressReporter: ProgressReporter;
  resourcePublisher: ResourcePublisher;

  // MCP-specific context
  mcpServer?: unknown;
  progressToken?: string;

  // Optional utilities
  samplingService?: SamplingService;
  dynamicConfig?: Record<string, unknown>;

  // Control and monitoring
  signal?: AbortSignal;
  timeoutMs?: number;
  enableCaching?: boolean;
}

/**
 * Candidate generation and scoring service interface
 */
export interface SamplingService {
  generateCandidates<T>(
    input: unknown,
    config: SamplingConfig,
    generator: CandidateGenerator<T>,
  ): Promise<Candidate<T>[]>;

  scoreCandidates<T>(
    candidates: Candidate<T>[],
    weights: Record<string, number>,
  ): Promise<ScoredCandidate<T>[]>;

  selectWinner<T>(scored: ScoredCandidate<T>[]): ScoredCandidate<T>;
}

/**
 * Generic candidate for sampling
 */
export interface Candidate<T> {
  id: string;
  content: T;
  metadata: Record<string, unknown>;
  generatedAt: Date;
}

/**
 * Scored candidate with evaluation metrics
 */
export interface ScoredCandidate<T> extends Candidate<T> {
  score: number;
  scores: Record<string, number>;
  reasoning?: string;
}

/**
 * Candidate generator interface
 */
export interface CandidateGenerator<T> {
  generate(input: unknown, count: number): Promise<Candidate<T>[]>;
  validate(candidate: Candidate<T>): Promise<boolean>;
}

/**
 * Tool enhancement result with resource links and metadata
 */
export interface EnhancedToolResult {
  success: boolean;
  sessionId: string;

  // Core result data (small, always inline)
  summary: string;
  status: string;

  // Resource references for large data
  resources?: {
    [key: string]: ResourceReference;
  };

  // Sampling results (if applicable)
  sampling?: {
    candidatesGenerated: number;
    winnerSelected: boolean;
    winnerScore?: number;
    generationTimeMs: number;
  };

  // Progress and timing
  progress?: {
    totalSteps: number;
    completedSteps: number;
    currentStep?: string;
  };

  executionTimeMs: number;
  warnings?: string[];
  errors?: string[];
}

/**
 * Dynamic tool configuration interface
 */
export interface DynamicToolConfig {
  enabled: boolean;
  features: {
    sampling: boolean;
    resourcePublishing: boolean;
    progressReporting: boolean;
    errorRecovery: boolean;
    dynamicConfig: boolean;
    mcpIntegration: boolean;
  };
  limits: {
    maxExecutionTimeMs: number;
    maxResourceSizeMB: number;
    maxCandidates: number;
    maxConcurrentOperations: number;
    maxRetries: number;
  };
  sampling?: SamplingConfig;
  resources?: ResourceConfig;
  overrides?: Record<string, unknown> | undefined;
}

/**
 * Tool health status
 */
export interface ToolHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTimeMs?: number;
  errorRate?: number;
  features: {
    sampling: 'available' | 'degraded' | 'unavailable';
    resources: 'available' | 'degraded' | 'unavailable';
    progress: 'available' | 'degraded' | 'unavailable';
  };
  message?: string;
}

/**
 * Factory interface for creating enhanced tools
 */
export interface EnhancedToolFactory {
  createTool(name: string, logger: Logger): SamplingAwareTool | null;
  listTools(): string[];
  getToolHealth(name: string): Promise<ToolHealth>;
  updateDynamicConfig(name: string, config: Partial<DynamicToolConfig>): Promise<void>;
}

/**
 * Error recovery strategy
 */
export interface ErrorRecoveryStrategy {
  canRecover(error: Error): boolean;
  recover(error: Error, context: EnhancedToolContext): Promise<Result<unknown>>;
  maxRetries: number;
  backoffMs: number;
}

/**
 * Tool execution metrics for monitoring
 */
export interface ToolExecutionMetrics {
  toolName: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  success: boolean;
  samplingUsed: boolean;
  resourcesPublished: number;
  candidatesGenerated?: number;
  errorType?: string;
  resourceSizeMB?: number;
}
