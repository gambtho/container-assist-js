/**
 * Core Types - TypeScript Structure
 *
 * All type definitions from src/types/* subdirectories
 * for easier imports and better IDE navigation.
 */

import type { Logger } from 'pino';
import type { MCPContext } from '../mcp/core/types';

// Re-export MCPContext for convenience
export type { MCPContext } from '../mcp/core/types';

// ===== RESULT TYPE SYSTEM =====

/**
 * Result type - simple discriminated union for error handling
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Create a success result
 */
export const Success = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * Create a failure result
 */
export const Failure = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * Type guard to check if result is a failure
 */
export const isFail = <T>(result: Result<T>): result is { ok: false; error: string } => !result.ok;

// ===== TOOL SYSTEM =====

/**
 * Tool definition for MCP server operations.
 */
export interface Tool {
  /** Unique tool identifier */
  name: string;
  /** Human-readable tool description */
  description?: string;
  /** JSON schema for parameter validation */
  schema?: Record<string, unknown>;
  /**
   * Executes the tool with provided parameters.
   * @param params - Tool-specific parameters
   * @param logger - Logger instance for tool execution
   * @param context - Optional MCP execution context
   * @returns Promise resolving to Result with tool output or error
   */
  execute: (
    params: Record<string, unknown>,
    logger: Logger,
    context?: MCPContext,
  ) => Promise<Result<any>>;
}

// Tool-specific parameter types
export interface TagImageParams {
  imageName: string;
  sourceTag: string;
  targetTag: string;
  registry?: string;
}

// ===== SESSION & WORKFLOW =====

/**
 * Manages workflow session state and tool execution history.
 */
export interface SessionManager {
  /**
   * Creates a new workflow session.
   * @param id - Unique session identifier
   * @returns Promise resolving to Result with created session state
   */
  createSession(id: string): Promise<Result<WorkflowState>>;

  /**
   * Retrieves an existing session by ID.
   * @param id - Session identifier to retrieve
   * @returns Promise resolving to Result with session state
   */
  getSession(id: string): Promise<Result<WorkflowState>>;

  /**
   * Updates session state with partial updates.
   * @param id - Session identifier to update
   * @param updates - Partial state updates to apply
   * @returns Promise resolving to Result with updated session state
   */
  updateSession(id: string, updates: Partial<WorkflowState>): Promise<Result<WorkflowState>>;

  /**
   * Deletes a session and its associated data.
   * @param id - Session identifier to delete
   * @returns Promise resolving to Result with deletion success status
   */
  deleteSession(id: string): Promise<Result<boolean>>;

  /** Retrieves tool execution history for a session */
  getToolHistory?(sessionId: string): Promise<any[]>;
  /** Gets current session state */
  getState?(sessionId: string): Promise<any>;
  /** Records a tool execution in session history */
  addToolExecution?(sessionId: string, execution: any): Promise<void>;
  /** Tracks tool execution start */
  trackToolStart?(sessionId: string, toolName: string): Promise<void>;
  /** Tracks tool execution completion */
  trackToolEnd?(sessionId: string, toolName: string, result: any): Promise<void>;
  /** Tracks tool execution errors */
  trackToolError?(sessionId: string, toolName: string, error: any): Promise<void>;
}

/**
 * Represents the state of a workflow execution session.
 */
export interface WorkflowState {
  /** Unique session identifier */
  sessionId: string;
  /** Currently executing workflow step */
  currentStep?: string;
  /** Overall workflow progress (0-100) */
  progress?: number;
  /** Results from completed workflow steps */
  results?: Record<string, any>;
  /** Additional workflow metadata */
  metadata?: Record<string, unknown>;
  /** List of completed step names */
  completed_steps?: string[];
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Allow additional properties for extensibility */
  [key: string]: any;
}

/**
 * Merges workflow state updates into existing state.
 * @param state - Current workflow state
 * @param updates - State updates to apply
 * @returns Merged workflow state
 */
export function updateWorkflowState(
  state: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return { ...state, ...updates };
}

// ===== DOCKER TYPES =====

export interface DockerConfig {
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  socketPath?: string;
}

// ===== KUBERNETES TYPES =====

export interface KubernetesConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

// ===== AI SERVICE TYPES =====

export interface AIService {
  isAvailable(): boolean;
  generateResponse(prompt: string, context?: Record<string, unknown>): Promise<Result<string>>;
  analyzeCode(code: string, language: string): Promise<Result<AIAnalysis>>;
  enhanceDockerfile(
    dockerfile: string,
    requirements?: Record<string, unknown>,
  ): Promise<Result<string>>;
  validateParameters?(params: any): Promise<Result<any>>;
  analyzeResults?(results: any): Promise<Result<any>>;
}

export interface ToolParameters {
  sessionId?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricsCollector {
  recordToolExecution(toolName: string, duration: number, success: boolean): void;
  recordError(toolName: string, error: string): void;
  getMetrics(): Record<string, any>;
}

export interface AIAnalysis {
  summary: string;
  recommendations: string[];
  issues: Array<{
    type: 'security' | 'performance' | 'maintainability' | 'style';
    severity: 'low' | 'medium' | 'high';
    message: string;
    line?: number;
    suggestion?: string;
  }>;
  metadata: {
    confidence: number;
    processingTime: number;
    model?: string;
  };
}

// ===== MOCK CONFIG TYPES =====

export interface MockConfig {
  enabled: boolean;
  scenarios?: Record<string, any>;
  delay?: number;
  failureRate?: number;
}
