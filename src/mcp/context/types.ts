/**
 * ToolContext Types - MCP-compatible type definitions
 *
 * Type definitions for the new ToolContext pattern that replaces
 * the internal MCP client approach with proper server/prompts and
 * client/sampling protocol compliance.
 */

/**
 * MCP-compatible text message structure
 * Based on actual MCP protocol format with content arrays
 */
export interface TextMessage {
  /** Message role in the conversation (system not supported by MCP) */
  role: 'user' | 'assistant';
  /** Content array with text objects (MCP format) */
  content: Array<{ type: 'text'; text: string }>;
  /** Allow additional properties for MCP compatibility */
  [key: string]: unknown;
}

/**
 * Sampling request following MCP client/sampling specification
 * Used to request AI responses from the MCP host
 */
export interface SamplingRequest {
  /** Messages array for the conversation context */
  messages: TextMessage[];
  /** Context inclusion strategy for the request */
  includeContext?: 'thisServer' | 'allServers' | 'none';
  /** Model preferences for the request */
  modelPreferences?: {
    /** Hints about the type of response needed */
    hints?: Array<{ name: string }>;
    /** Cost optimization priority (0-1) */
    costPriority?: number;
    /** Speed optimization priority (0-1) */
    speedPriority?: number;
    /** Intelligence/quality priority (0-1) */
    intelligencePriority?: number;
  };
  /** Stop sequences to end generation */
  stopSequences?: string[];
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Sampling response from MCP client/sampling
 * Based on actual MCP protocol response format
 */
export interface SamplingResponse {
  /** Response role (always 'assistant' for AI responses) */
  role: 'assistant';
  /** Response content array */
  content: Array<{ type: 'text'; text: string }>;
  /** Additional metadata about the response */
  metadata?: {
    /** Model used for generation */
    model?: string;
    /** Token usage statistics */
    usage?: {
      /** Input tokens consumed */
      inputTokens?: number;
      /** Output tokens generated */
      outputTokens?: number;
      /** Total tokens used */
      totalTokens?: number;
    };
    /** Generation finish reason */
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  };
}

/**
 * Prompt with metadata structure
 * Returned by server/prompts handlers
 */
export interface PromptWithMessages {
  /** Human-readable description of the prompt */
  description: string;
  /** Message array ready for sampling */
  messages: TextMessage[];
}

/**
 * Progress reporting function
 * Forwards progress updates through MCP notifications
 */
export type ProgressReporter = (
  /** Progress message or step name */
  message: string,
  /** Current progress value */
  progress?: number,
  /** Total progress value */
  total?: number,
) => Promise<void>;

/**
 * Main context object passed to tools
 * Provides AI sampling and prompt access through proper MCP protocols
 */
export interface ToolContext {
  /** AI sampling capabilities */
  sampling: {
    /**
     * Create a message using the MCP host's AI capabilities
     * Replaces direct AI service usage with proper MCP protocol
     */
    createMessage(request: SamplingRequest): Promise<SamplingResponse>;
  };

  /**
   * Get a prompt with arguments from the prompt registry
   * Uses proper MCP server/prompts protocol
   */
  getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptWithMessages>;

  /** Optional abort signal for cancellation */
  signal?: AbortSignal | undefined;

  /** Optional progress reporting function */
  progress?: ProgressReporter | undefined;
}

/**
 * Factory function signature for creating ToolContext instances
 * Used by the bridge implementation
 */
export type ToolContextFactory = (
  server: unknown, // MCP Server instance
  request: unknown, // MCP request object
  logger: unknown, // Logger instance
  signal?: AbortSignal,
  progress?: ProgressReporter,
) => ToolContext;

/**
 * Configuration for ToolContext creation
 */
export interface ToolContextConfig {
  /** Enable debug logging for context operations */
  debug?: boolean;
  /** Default timeout for sampling requests (ms) */
  defaultTimeout?: number;
  /** Default max tokens for sampling */
  defaultMaxTokens?: number;
  /** Default stop sequences */
  defaultStopSequences?: string[];
}
