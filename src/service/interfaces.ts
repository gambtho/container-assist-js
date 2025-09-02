/**
 * Service layer interfaces - now using consolidated domain types
 * This file now primarily re-exports domain types and adds service-specific configurations
 */

// Import consolidated domain types
import type {
  // Core types
  Logger,
  Result,
  ProgressData,
  ProgressEmitter,

  // Docker types
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  DockerImage,
  DockerPushResult,
  DockerTagResult,

  // Build types
  BuildOptions,
  BuildResult,
  BuildConfiguration,
  BuildProgress,
  BuildContext,
  BuildCache,
  BuildStage,
  BuildMetrics,
  BuildError,

  // Scanning types
  ScannerType,
  ScannerConfig,
  SeverityLevel,
  Vulnerability,
  VulnerabilitySummary,
  ScanOptions,
  ScanResult,
  ScanProgress,
  SecurityPolicy,

  // Session types
  Session,
  WorkflowState,
  AnalysisResult,
  WorkflowStepType,

  // Service interfaces (abstraction layer)
  IRepositoryAnalyzer,
  IDockerService,
  IBuildService,
  IScanningService,
  ISessionStore,
  IWorkflowManager,
  IAIService,
  IKubernetesService,
  IFileSystem,
  ICommandExecutor,
  IEventPublisher,
  IConfiguration,
  IMetricsService,
  ICacheService,
  IRegistryService,
  BaseService,

  // Events
  DomainEvent,
  EventTypeName,
  EventHandler,
  IEventBus,

  // Kubernetes types
  KubernetesResource,
  KubernetesManifest,
  KubernetesDeploymentResult,

  // Base Image types
  BaseImageRecommendation,
  ValidationResult

} from '../domain/types/index.js'

// Import additional types for AI integration
import type { AIRequest, AIResponse } from '../infrastructure/ai/mcp-sampler.js'
import type { ZodSchema } from 'zod'

// Re-export only essential types that are commonly used by services
// NOTE: Most types should be imported directly from domain layer
export type {
  // Core types frequently used in service layer
  Result,
  Logger,
  ProgressEmitter,
  
  // Service abstraction interfaces (these ARE part of domain but commonly used here)
  IRepositoryAnalyzer,
  IDockerService,
  ISessionStore,
  IWorkflowManager,
  IAIService,
  IEventPublisher,
  
  // Session and workflow types commonly used in service coordination
  Session,
  WorkflowState,
  AnalysisResult
}

// Configuration types - unified in the main config module
export type { ApplicationConfig } from '../config/index.js'
// DependenciesConfig is deprecated - use ApplicationConfig instead
export type { ApplicationConfig as DependenciesConfig } from '../config/index.js'

// Workflow step parameters (service-specific)
export interface StepParams {
  [key: string]: unknown
}

// Workflow step result (service-specific)
export interface StepResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  nextStep?: string
  metadata?: {
    duration?: number
    retryCount?: number
    warnings?: string[]
  }
}

// Tool-related types are now defined in service/tools/tool-types.ts
// Import from there when needed to avoid duplication
export type { 
  ToolContext,
  ToolHandler,
  ToolDescriptor,
  MCPToolCallRequest,
  MCPToolCallResponse,
  IToolRegistry
} from './tools/tool-types.js'

// AI-specific types are defined in infrastructure layer
// Re-export only if needed by service consumers
export type { AIRequest, AIResponse } from '../infrastructure/ai/mcp-sampler.js'

// Kubernetes-specific service configurations
export interface ClusterConfig {
  context?: string
  namespace?: string
  kubeconfig?: string
}

export interface HealthStatus {
  component: string
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown'
  message?: string
  details?: Record<string, any>
  lastCheck: string
  checkDuration: number
}

// Service information for status reporting
export interface ServiceInfo {
  name: string
  version: string
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping'
  uptime: number
  dependencies: Array<{
    name: string
    status: HealthStatus
  }>
  metrics?: {
    requestsPerSecond: number
    errorRate: number
    responseTimeMs: number
    memoryUsageMB: number
    cpuUsagePercent: number
  }
}

