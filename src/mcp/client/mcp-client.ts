/**
 * MCP SDK Client Implementation
 *
 * Implements full SDK client functionality for proper MCP integration
 * with completion handlers, resource management, and native sampling.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
import type { MCPTransport } from './transport';
import { SdkTransport } from './sdk-transport';

/**
 * MCP SDK Client Configuration
 */
export interface MCPClientConfig {
  serverCommand?: string;
  serverArgs?: string[];
  capabilities?: {
    completion?: boolean;
    prompts?: boolean;
    resources?: boolean;
    sampling?: boolean;
  };
  connectionTimeout?: number;
  retryAttempts?: number;
}

/**
 * Completion Request Parameters
 */
export interface CompletionRequest {
  ref: {
    type: 'ref/prompt';
    name: string;
  };
  argument: Record<string, unknown>;
  sampling?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    n?: number;
  };
}

/**
 * Completion Response
 */
export interface CompletionResponse {
  completion: {
    values: string[];
  };
}

/**
 * MCP SDK Client
 *
 * Provides full SDK client functionality with proper error handling,
 * connection management, and completion support.
 */
export class MCPClient {
  private logger: Logger;
  private transport: MCPTransport;
  private connected: boolean = false;

  /**
   * Create a new MCP client with a transport
   * @param logger Logger instance
   * @param transport Transport implementation
   */
  constructor(logger: Logger, transport: MCPTransport) {
    this.logger = logger;
    this.transport = transport;
  }

  /**
   * Factory method for creating a client with stdio transport (backward compatibility)
   * @param logger Logger instance
   * @param config Client configuration
   */
  static createWithStdio(logger: Logger, config: MCPClientConfig = {}): MCPClient {
    const transport = new SdkTransport({
      command: config.serverCommand || 'mcp-server',
      args: config.serverArgs || [],
      capabilities: {
        completion: true,
        prompts: true,
        resources: true,
        sampling: true,
        ...config.capabilities,
      },
      timeout: config.connectionTimeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      logger,
    });

    return new MCPClient(logger, transport);
  }

  /**
   * Initialize the SDK client connection
   */
  async initialize(): Promise<Result<void>> {
    if (this.connected) {
      return Success(undefined);
    }

    this.logger.info('Initializing MCP Client...');

    const connectResult = await this.transport.connect();
    if (!connectResult.ok) {
      this.logger.error({ error: connectResult.error }, 'Failed to initialize MCP Client');
      return connectResult;
    }

    this.connected = true;
    this.logger.info('MCP Client initialized successfully');
    return Success(undefined);
  }

  /**
   * Make a completion request using SDK's completion/complete method
   */
  async complete(prompt: string, context?: Record<string, unknown>): Promise<Result<string>> {
    if (!this.connected) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return initResult;
      }
    }

    const promptName = (context?.promptName as string) || 'default';

    this.logger.debug(
      {
        promptName,
        promptLength: prompt.length,
        contextKeys: Object.keys(context || {}),
      },
      'Making completion request',
    );

    const response = await this.transport.request<any>('completion/complete', {
      ref: {
        type: 'ref/prompt',
        name: promptName,
      },
      argument: {
        prompt,
        ...context,
      },
    });

    if (!response.ok) {
      this.logger.error(
        { error: response.error, prompt: prompt.substring(0, 100) },
        'Completion request failed',
      );
      return response;
    }

    if (!response.value?.completion?.values?.length) {
      return Failure('No completion values returned');
    }

    const firstValue = response.value.completion.values[0];
    if (!firstValue) {
      return Failure('No completion value returned');
    }
    return Success(firstValue);
  }

  /**
   * Get a prompt from the server
   */
  async getPrompt(name: string, args?: Record<string, unknown>): Promise<Result<any>> {
    if (!this.connected) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return initResult;
      }
    }

    return this.transport.request('prompts/get', {
      name,
      arguments: args || {},
    });
  }

  /**
   * List available resources
   */
  async listResources(): Promise<Result<any>> {
    if (!this.connected) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return initResult;
      }
    }

    return this.transport.request('resources/list', {});
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<Result<any>> {
    if (!this.connected) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return initResult;
      }
    }

    return this.transport.request('resources/read', { uri });
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected && this.transport.isConnected();
  }

  /**
   * Get client capabilities
   */
  getCapabilities(): Record<string, any> {
    return this.transport.getCapabilities?.() || {};
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    await this.transport.close();
    this.connected = false;
    this.logger.info('MCP Client disconnected');
  }

  /**
   * Make multiple completion requests for sampling
   */
  async completeBatch(
    prompt: string,
    count: number,
    context?: Record<string, unknown>,
  ): Promise<Result<string[]>> {
    if (!this.connected) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return Failure(initResult.error);
      }
    }

    const promptName = (context?.promptName as string) || 'default';

    // Make multiple completion requests
    const completionPromises = Array.from({ length: count }, async (_, i) => {
      const response = await this.transport.request<any>('completion/complete', {
        ref: {
          type: 'ref/prompt',
          name: promptName,
        },
        argument: {
          prompt,
          variant: i,
          ...context,
        },
      });

      if (!response.ok) {
        throw new Error(`Completion ${i} failed: ${response.error}`);
      }

      if (!response.value?.completion?.values?.length) {
        throw new Error(`No completion values returned for variant ${i}`);
      }

      return response.value.completion.values[0];
    });

    try {
      const results = await Promise.all(completionPromises);
      return Success(results.filter((r): r is string => r !== undefined));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Batch completion failed: ${message}`);
    }
  }

  /**
   * Test fallback for completion (only for tests)
   */
  async testFallbackComplete(prompt: string): Promise<Result<string>> {
    // This is only used in test environments when a real server is not available
    if (process.env.NODE_ENV !== 'test') {
      return Failure('Test fallback is only available in test environment');
    }

    // Simple test response generation
    const response = `Test response for: ${prompt.substring(0, 50)}...`;
    return Success(response);
  }
}
