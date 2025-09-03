/**
 * Tool System Type Definitions
 */

import { z } from 'zod';
import type { Logger } from 'pino';
// import type { Server, Tool } from '@modelcontextprotocol/sdk/types';
// Server not exported from SDK, Tool unused
import type { AnalysisResult, WorkflowState } from '../../contracts/types/index.js';
import type { SessionService } from '../session/manager.js';
import type { WorkflowOrchestrator } from '../workflow/orchestrator.js';
import type { WorkflowManager } from '../workflow/manager.js';
import type { DockerService } from '../../services/docker.js';
import type { KubernetesService } from '../../services/kubernetes.js';
import type { EnhancedAIService } from '../../infrastructure/enhanced-ai-service.js';
import type { ProgressEmitter, EventPublisher, DependenciesConfig } from '../interfaces.js';
import type { ProgressCallback } from '../workflow/types.js';
import type { MCPSampler } from '../../infrastructure/ai/ai-types.js';
import type { StructuredSampler } from '../../infrastructure/ai/structured-sampler.js';
import type { ContentValidator } from '../../infrastructure/ai/content-validator.js';

/**
 * Context provided to tool handlers (Modernized)
 */
export interface ToolContext {
  // Core services
  logger: Logger;
  sessionService: SessionService;
  dockerService: DockerService;
  kubernetesService?: KubernetesService;
  aiService?: EnhancedAIService;

  // Workflow management
  workflowOrchestrator: WorkflowOrchestrator;
  workflowManager: WorkflowManager;

  // Event handling - modern pattern
  onProgress?: ProgressCallback;
  eventPublisher: EventPublisher;

  // AI components (for tools that need direct access)
  mcpSampler?: MCPSampler;

  // Configuration and control
  config: DependenciesConfig;
  signal?: AbortSignal;
  sessionId?: string;

  // Legacy compatibility (to be removed in future)
  progressEmitter?: ProgressEmitter; // @deprecated - Use onProgress callback
  structuredSampler?: StructuredSampler; // @deprecated - Use aiService
  contentValidator?: ContentValidator; // @deprecated - Use aiService
}

/**
 * MCP SDK compatible tool context
 */
export interface MCPToolContext {
  // MCP-specific
  server: unknown; // Server type not exported from SDK
  progressToken?: string;

  // Core services
  logger: Logger;
  sessionService: SessionService;
  dockerService: DockerService;
  kubernetesService?: KubernetesService;
  aiService?: EnhancedAIService;

  // Workflow management
  workflowOrchestrator: WorkflowOrchestrator;
  workflowManager: WorkflowManager;

  // Event handling
  eventPublisher: EventPublisher;
  progressEmitter: ProgressEmitter; // Still used in MCP context

  // AI components
  mcpSampler?: MCPSampler;

  // Configuration and control
  config: DependenciesConfig;
  signal?: AbortSignal;
  sessionId?: string;

  // Performance monitoring
  logPerformanceMetrics?: (operation: string, duration: number, metadata?: unknown) => void;

  // Legacy (for compatibility)
  structuredSampler?: StructuredSampler; // @deprecated
  contentValidator?: ContentValidator; // @deprecated
}

/**
 * Tool handler definition (Legacy)
 */
export interface ToolHandler<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: 'workflow' | 'orchestration' | 'utility';
  inputSchema: z.ZodType<TInput> | z.ZodEffects<any, TInput, any> | z.ZodObject<any>;
  outputSchema: z.ZodType<TOutput> | z.ZodEffects<any, TOutput, any> | z.ZodObject<any>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
  chainHint?: {
    nextTool: string;
    reason: string;
    paramMapper?: (output: TOutput) => Record<string, unknown>;
  };
  timeout?: number;
}

/**
 * Tool registration descriptor - same as ToolHandler for consistency (Legacy)
 */
export interface ToolDescriptor<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: 'workflow' | 'orchestration' | 'utility';
  inputSchema: z.ZodType<TInput> | z.ZodEffects<any, TInput, any> | z.ZodObject<any>;
  outputSchema: z.ZodType<TOutput> | z.ZodEffects<any, TOutput, any> | z.ZodObject<any>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
  chainHint?: {
    nextTool: string;
    reason: string;
    paramMapper?: (output: TOutput) => Record<string, unknown>;
  };
  timeout?: number;
}

/**
 * MCP SDK compatible tool handler
 */
export interface MCPToolHandler<TInput, TOutput> {
  (params: TInput, context: MCPToolContext): Promise<TOutput>;
}

/**
 * Enhanced tool descriptor for MCP SDK compatibility
 */
export interface MCPToolDescriptor<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: 'workflow' | 'orchestration' | 'utility';
  inputSchema: z.ZodType<TInput> | z.ZodEffects<any, TInput, any> | z.ZodObject<any>;
  outputSchema: z.ZodType<TOutput> | z.ZodEffects<any, TOutput, any> | z.ZodObject<any>;
  handler: MCPToolHandler<TInput, TOutput>;
  chainHint?: {
    nextTool: string;
    reason: string;
    paramMapper?: (output: TOutput) => Record<string, unknown>;
  };
  timeout?: number;
}

/**
 * MCP Tool Call Request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP Tool Call Response
 */
export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
    };
  }>;
  isError?: boolean;
}

/**
 * Tool registry interface
 */
export interface ToolRegistry {
  register<TInput, TOutput>(descriptor: ToolDescriptor<TInput, TOutput>): void;
  handleToolCall(request: MCPToolCallRequest): Promise<MCPToolCallResponse>;
  listTools(): Array<{
    name: string;
    description: string;
    inputSchema: unknown;
  }>;
  getToolByName(name: string): ToolDescriptor | undefined;
}

/**
 * Progress update for tool execution
 */
export interface ToolProgress {
  toolName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Tool Parameter Type Definitions
// ============================================================================

/**
 * Repository Analysis Tool Parameters
 */
export interface AnalyzeRepositoryParams {
  repoPath: string;
  sessionId?: string;
  depth?: 'shallow' | 'deep';
  includeTests?: boolean;
}

export interface AnalyzeRepositoryResult {
  success: boolean;
  sessionId: string;
  language: string;
  languageVersion?: string;
  framework?: string;
  frameworkVersion?: string;
  buildSystem?: {
    type: string;
    buildFile: string;
    buildCommand?: string;
    testCommand?: string;
  };
  dependencies: Array<{
    name: string;
    version?: string;
    type?: 'runtime' | 'dev' | 'test';
  }>;
  ports: number[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasKubernetes: boolean;
  metadata?: Record<string, any>;
  recommendations?: {
    baseImage?: string;
    buildStrategy?: string;
    securityNotes?: string[];
  };
}

/**
 * Dockerfile Generation Tool Parameters
 */
export interface GenerateDockerfileParams {
  sessionId: string;
  analysis?: AnalysisResult;
  language?: string;
  framework?: string;
  baseImage?: string;
  optimizations?: string[];
  multistage?: boolean;
}

export interface GenerateDockerfileResult {
  success: boolean;
  sessionId: string;
  dockerfile: string;
  explanation: string;
  recommendations?: string[];
}

/**
 * Build Image Tool Parameters
 */
export interface BuildImageParams {
  sessionId: string;
  tag: string;
  context?: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
  target?: string;
  labels?: Record<string, string>;
}

export interface BuildImageResult {
  success: boolean;
  sessionId: string;
  imageId: string;
  tag: string;
  size?: number;
  buildTime?: number;
  warnings?: string[];
}

/**
 * Scan Image Tool Parameters
 */
export interface ScanImageParams {
  sessionId: string;
  imageTag: string;
  scanner?: 'trivy' | 'grype';
  severity?: string[];
  ignoreUnfixed?: boolean;
  format?: 'json' | 'table';
}

export interface ScanImageResult {
  success: boolean;
  sessionId: string;
  imageTag: string;
  vulnerabilities: Array<{
    id: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    package: string;
    version: string;
    fixedVersion?: string;
    title: string;
    description: string;
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Tag Image Tool Parameters
 */
export interface TagImageParams {
  sessionId: string;
  sourceTag: string;
  targetTag: string;
}

export interface TagImageResult {
  success: boolean;
  sessionId: string;
  sourceTag: string;
  targetTag: string;
}

/**
 * Push Image Tool Parameters
 */
export interface PushImageParams {
  sessionId: string;
  tag: string;
  registry?: string;
  username?: string;
  password?: string;
}

export interface PushImageResult {
  success: boolean;
  sessionId: string;
  tag: string;
  registry?: string;
  digest?: string;
}

/**
 * Generate K8s Manifests Tool Parameters
 */
export interface GenerateK8sManifestsParams {
  sessionId: string;
  imageTag: string;
  appName?: string;
  namespace?: string;
  replicas?: number;
  ports?: number[];
  envVars?: Record<string, string>;
  resources?: {
    requests?: { cpu?: string; memory?: string };
    limits?: { cpu?: string; memory?: string };
  };
}

export interface GenerateK8sManifestsResult {
  success: boolean;
  sessionId: string;
  manifests: Array<{
    apiVersion: string;
    kind: string;
    metadata: {
      name: string;
      namespace?: string;
      labels?: Record<string, string>;
    };
    spec?: unknown;
  }>;
  files: Array<{
    name: string;
    content: string;
  }>;
}

/**
 * Prepare Cluster Tool Parameters
 */
export interface PrepareClusterParams {
  sessionId: string;
  namespace?: string;
  context?: string;
  createNamespace?: boolean;
}

export interface PrepareClusterResult {
  success: boolean;
  sessionId: string;
  cluster: {
    name: string;
    version: string;
    nodes: number;
    ready: boolean;
    context: string;
  };
  namespace: string;
  ready: boolean;
}

/**
 * Deploy Application Tool Parameters
 */
export interface DeployApplicationParams {
  sessionId: string;
  manifests?: Array<{
    apiVersion: string;
    kind: string;
    metadata: unknown;
    spec?: unknown;
  }>;
  namespace?: string;
  wait?: boolean;
  timeout?: number;
}

export interface DeployApplicationResult {
  success: boolean;
  sessionId: string;
  deployedResources: Array<{
    kind: string;
    name: string;
    namespace: string;
    status: string;
  }>;
  services?: string[];
  endpoints?: string[];
}

/**
 * Verify Deployment Tool Parameters
 */
export interface VerifyDeploymentParams {
  sessionId: string;
  namespace?: string;
  timeout?: number;
}

export interface VerifyDeploymentResult {
  success: boolean;
  sessionId: string;
  status: 'healthy' | 'degraded' | 'failed';
  pods: Array<{
    name: string;
    status: string;
    ready: boolean;
    restarts: number;
  }>;
  services: Array<{
    name: string;
    type: string;
    clusterIP?: string;
    externalIP?: string;
    ports: number[];
  }>;
  endpoints?: string[];
}

/**
 * Start Workflow Tool Parameters
 */
export interface StartWorkflowParams {
  sessionId: string;
  workflowType: 'containerization' | 'deployment' | 'full';
  repoPath?: string;
  config?: Record<string, any>;
}

export interface StartWorkflowResult {
  success: boolean;
  sessionId: string;
  workflowId: string;
  type: string;
  status: WorkflowState;
  nextStep?: string;
}

/**
 * Workflow Status Tool Parameters
 */
export interface WorkflowStatusParams {
  sessionId?: string;
  workflowId?: string;
}

export interface WorkflowStatusResult {
  success: boolean;
  sessionId?: string;
  workflowId?: string;
  status: WorkflowState;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  progress: number;
  estimatedTimeRemaining?: number;
}

/**
 * Utility Tool Parameters
 */
export interface PingParams {
  message?: string;
}

export interface PingResult {
  success: boolean;
  message: string;
  timestamp: string;
  serverStatus: 'healthy' | 'degraded';
}

export interface ListToolsParams {
  category?: 'workflow' | 'orchestration' | 'utility';
}

export interface ListToolsResult {
  success: boolean;
  tools: Array<{
    name: string;
    description: string;
    category: string;
    inputSchema: unknown;
  }>;
  count: number;
}

export interface ServerStatusParams {
  includeMetrics?: boolean;
}

export interface ServerStatusResult {
  success: boolean;
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  uptime: number;
  services: Record<string, boolean>;
  metrics?: Record<string, any>;
}
