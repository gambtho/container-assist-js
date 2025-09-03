/**
 * Service layer interfaces - now using consolidated domain types
 * This file now primarily re-exports domain types and adds service-specific configurations
 */

// Import consolidated domain types
import type {
  // Core types
  Result,
  ProgressEmitter,

  // Session types
  Session,
  WorkflowState,
  AnalysisResult,

  // Service interfaces (essential only)
  SessionStore,
  EventPublisher
} from '../contracts/types/index.js';

// Import Logger from pino
import type { Logger } from 'pino';

// Import additional types for AI integration (if needed)
// import type { AIRequest, AIResponse } from '../infrastructure/ai/mcp-sampler.js'

// Re-export only essential types that are commonly used by services
export type {
  // Core types frequently used in service layer
  Result,
  Logger,
  ProgressEmitter,

  // Essential service interfaces (multi-implementation only)
  SessionStore,
  EventPublisher,

  // Session and workflow types commonly used in service coordination
  Session,
  WorkflowState,
  AnalysisResult
};

// Configuration types - unified in the main config module
export type { ApplicationConfig } from '../config/index.js';
// DependenciesConfig is deprecated - use ApplicationConfig instead
export type { ApplicationConfig as DependenciesConfig } from '../config/index.js';

// Workflow step parameters (service-specific)
export interface StepParams {
  [key: string]: unknown;
}

// Workflow step result (service-specific)
export interface StepResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  nextStep?: string;
  metadata?: {
    duration?: number;
    retryCount?: number;
    warnings?: string[];
  };
}

// Tool-related types are now defined in service/tools/tool-types.ts
// Import from there when needed to avoid duplication
export type {
  ToolContext,
  ToolHandler,
  ToolDescriptor,
  MCPToolCallRequest,
  MCPToolCallResponse,
  ToolRegistry
} from './tools/tool-types';

// Additional service types needed by factories
// These are already imported and re-exported above, no need for aliases

// Import MCPSampler for AI integration
export type {
  MCPSampler,
  MCPSampleResponse,
  MCPSampleError
} from '../infrastructure/ai/mcp-sampler.js';

// Service aggregation types for dependency injection
export interface AIServices {
  // Empty interface maintained for backward compatibility
  // Services now use EnhancedAIService directly
}

export interface InfrastructureServices {
  // Note: Services use concrete classes, not interfaces
  eventPublisher?: EventPublisher;
}

export interface SessionServices {
  sessionStore?: SessionStore;
  // Note: WorkflowManager uses concrete WorkflowOrchestrator class
}

// Kubernetes-specific service configurations
export interface ClusterConfig {
  context?: string;
  namespace?: string;
  kubeconfig?: string;
}

export interface HealthStatus {
  component: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  message?: string;
  details?: Record<string, any>;
  lastCheck: string;
  checkDuration: number;
}

// Service information for status reporting
export interface ServiceInfo {
  name: string;
  version: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  uptime: number;
  dependencies: Array<{
    name: string;
    status: HealthStatus;
  }>;
  metrics?: {
    requestsPerSecond: number;
    errorRate: number;
    responseTimeMs: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
  };
}
