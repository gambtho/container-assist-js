/**
 * Core type definitions for the containerization assist system.
 * Provides Result type for error handling and tool system interfaces.
 */

import type { Logger } from 'pino';
import type { ToolContext } from '../mcp/context/types';

/**
 * Result type for functional error handling.
 * Use instead of throwing exceptions.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Create a success result */
export const Success = <T>(value: T): Result<T> => ({ ok: true, value });

/** Create a failure result */
export const Failure = <T>(error: string): Result<T> => ({ ok: false, error });

/** Type guard to check if result is a failure */
export const isFail = <T>(result: Result<T>): result is { ok: false; error: string } => !result.ok;

export type {
  ToolContext,
  TextMessage,
  SamplingRequest,
  SamplingResponse,
  PromptWithMessages,
  ProgressReporter,
} from '../mcp/context/types';

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

// ===== AI SERVICE TYPES =====

export interface AIService {
  isAvailable(): boolean;
  generateResponse(prompt: string, context?: Record<string, unknown>): Promise<Result<string>>;
  analyzeCode(code: string, language: string): Promise<Result<unknown>>;
  enhanceDockerfile(
    dockerfile: string,
    requirements?: Record<string, unknown>,
  ): Promise<Result<string>>;
  validateParameters?(params: Record<string, unknown>): Promise<Result<unknown>>;
  analyzeResults?(results: unknown): Promise<Result<unknown>>;
}
