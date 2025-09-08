/**
 * Core Types - TypeScript Structure
 *
 * All type definitions from src/types/* subdirectories
 * for easier imports and better IDE navigation.
 */

import type { Logger } from 'pino';
import type { PromptRegistry } from '@prompts/prompt-registry';
import type { SDKResourceManager } from '@resources/manager';
import type { ToolContext } from '@mcp/context/types';

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

// Re-export ToolContext types for easier imports
export type {
  ToolContext,
  TextMessage,
  SamplingRequest,
  SamplingResponse,
  PromptWithMessages,
  ProgressReporter,
} from '@mcp/context/types';

/**
 * MCP execution context for tools (legacy)
 * @deprecated Use ToolContext for new AI-enabled tools
 */
export interface MCPContext {
  /** Progress reporting token */
  progressToken?: string | number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Prompt registry access */
  promptRegistry?: PromptRegistry;
  /** Resource manager access */
  resourceManager?: SDKResourceManager;
  /** Session manager access */
  sessionManager?: SessionManager;
  /** Application dependencies */
  deps?: Record<string, unknown>;
  /** Additional context properties */
  [key: string]: unknown;
}

/**
 * Enhanced MCP context that includes both legacy and new AI capabilities
 * This allows gradual migration from MCPContext to ToolContext
 * @deprecated Use ToolContext directly for new implementations
 */
export interface EnhancedMCPContext extends MCPContext {
  /** New ToolContext for AI-enabled tools */
  toolContext?: import('@mcp/context/types').ToolContext;
}

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
   * @param context - Optional ToolContext for AI capabilities and progress reporting
   * @returns Promise resolving to Result with tool output or error
   */
  execute: (
    params: Record<string, unknown>,
    logger: Logger,
    context?: ToolContext,
  ) => Promise<Result<unknown>>;
}

// Tool-specific parameter types
export interface TagImageParams {
  imageName: string;
  sourceTag: string;
  targetTag: string;
  registry?: string;
}

export interface ToolExecution {
  toolName: string;
  params: Record<string, unknown>;
  result?: Result<unknown>;
  error?: Error;
  startTime: Date;
  endTime?: Date;
  duration?: number;
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
  getToolHistory?(sessionId: string): Promise<ToolExecution[]>;
  /** Gets current session state */
  getState?(sessionId: string): Promise<WorkflowState>;
  /** Records a tool execution in session history */
  addToolExecution?(sessionId: string, execution: ToolExecution): Promise<void>;
  /** Tracks tool execution start */
  trackToolStart?(sessionId: string, toolName: string): Promise<void>;
  /** Tracks tool execution completion */
  trackToolEnd?(sessionId: string, toolName: string, result: Result<unknown>): Promise<void>;
  /** Tracks tool execution errors */
  trackToolError?(sessionId: string, toolName: string, error: Error): Promise<void>;
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
  results?: Record<string, unknown>;
  /** Additional workflow metadata */
  metadata?: Record<string, unknown>;
  /** List of completed step names */
  completed_steps?: string[];
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Allow additional properties for extensibility */
  [key: string]: unknown;
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

// ===== AI SERVICE TYPES =====

export interface AIAnalysis {
  summary?: string;
  insights?: string[];
  recommendations: string[];
  issues?: Array<{
    type: 'security' | 'performance' | 'maintainability' | 'style';
    severity: 'low' | 'medium' | 'high';
    message: string;
    line?: number;
    suggestion?: string;
  }>;
  score?: number;
  metadata?: {
    confidence?: number;
    processingTime?: number;
    model?: string;
    [key: string]: unknown;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
}

export interface AIService {
  isAvailable(): boolean;
  generateResponse(prompt: string, context?: Record<string, unknown>): Promise<Result<string>>;
  analyzeCode(code: string, language: string): Promise<Result<AIAnalysis>>;
  enhanceDockerfile(
    dockerfile: string,
    requirements?: Record<string, unknown>,
  ): Promise<Result<string>>;
  validateParameters?(params: Record<string, unknown>): Promise<Result<ValidationResult>>;
  analyzeResults?(results: unknown): Promise<Result<AIAnalysis>>;
}

export interface ToolParameters {
  sessionId?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface MetricsCollector {
  recordToolExecution(toolName: string, duration: number, success: boolean): void;
  recordError(toolName: string, error: string): void;
  getMetrics(): Record<string, unknown>;
}
