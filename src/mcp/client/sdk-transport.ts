/**
 * SDK Transport Implementation
 *
 * Wraps the MCP SDK's StdioClientTransport to implement our transport interface,
 * handling stdio communication with MCP servers.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Logger } from 'pino';
import { z } from 'zod';
import { Success, Failure, type Result } from '@types';
import type { MCPTransport, TransportConfig } from './transport';

/**
 * SDK Transport Configuration
 */
export interface SdkTransportConfig extends TransportConfig {
  /** Command to spawn the MCP server */
  command: string;
  /** Arguments to pass to the server command */
  args?: string[];
  /** Client name for identification */
  clientName?: string;
  /** Client version */
  clientVersion?: string;
  /** MCP capabilities to advertise */
  capabilities?: {
    completion?: boolean;
    prompts?: boolean;
    resources?: boolean;
    sampling?: boolean;
  };
  /** Logger instance */
  logger?: Logger;
}

/**
 * SDK-based stdio transport implementation
 *
 * Uses the MCP SDK's StdioClientTransport to communicate with
 * MCP servers via stdin/stdout.
 */
export class SdkTransport implements MCPTransport {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connected = false;
  private notificationHandler?: (method: string, params: any) => void;
  private errorHandler?: (error: Error) => void;
  private readonly config: SdkTransportConfig;
  private readonly logger: Logger | undefined;

  constructor(config: SdkTransportConfig) {
    this.config = config;
    this.logger = config.logger;
  }

  /**
   * Connect to the MCP server via stdio
   */
  async connect(): Promise<Result<void>> {
    if (this.connected) {
      return Success(undefined);
    }

    try {
      this.logger?.info('Connecting SDK transport to MCP server...');

      // Create stdio transport
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args || [],
      });

      // Create SDK client
      this.client = new Client(
        {
          name: this.config.clientName || 'mcp-client',
          version: this.config.clientVersion || '1.0.0',
        },
        {
          capabilities: this.buildCapabilities(),
        },
      );

      // Set up event handlers if registered
      if (this.notificationHandler) {
        this.setupNotificationHandling();
      }

      // Connect with timeout
      const connectPromise = this.client.connect(this.transport);
      const timeout = this.config.timeout || 30000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), timeout),
      );

      await Promise.race([connectPromise, timeoutPromise]);

      this.connected = true;
      this.logger?.info('SDK transport connected successfully');

      return Success(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error({ error: message }, 'Failed to connect SDK transport');

      if (this.errorHandler) {
        this.errorHandler(error instanceof Error ? error : new Error(message));
      }

      return Failure(`Transport connection failed: ${message}`);
    }
  }

  /**
   * Close the connection and cleanup
   */
  async close(): Promise<void> {
    this.logger?.info('Closing SDK transport...');

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        this.logger?.warn({ error }, 'Error closing client');
      }
      this.client = undefined as any;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        this.logger?.warn({ error }, 'Error closing transport');
      }
      this.transport = undefined as any;
    }

    this.connected = false;
    this.logger?.info('SDK transport closed');
  }

  /**
   * Make a request to the MCP server
   */
  async request<T = any>(method: string, params: any, schema?: any): Promise<Result<T>> {
    if (!this.connected || !this.client) {
      return Failure('Transport not connected');
    }

    let lastError: Error | undefined;
    const retryAttempts = this.config.retryAttempts || 3;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        this.logger?.debug(
          { method, attempt, maxAttempts: retryAttempts },
          'Making SDK transport request',
        );

        const response = await this.client.request({ method, params }, schema || z.any());

        return Success(response as T);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger?.warn(
          {
            method,
            attempt,
            maxAttempts: retryAttempts,
            error: lastError.message,
          },
          'Request attempt failed',
        );

        if (attempt < retryAttempts) {
          await this.delay(this.config.retryDelay || 1000);

          // Check if we need to reconnect
          if (!this.connected) {
            const reconnectResult = await this.connect();
            if (!reconnectResult.ok) {
              return reconnectResult;
            }
          }
        }
      }
    }

    const errorMessage = lastError?.message || 'Unknown error';
    return Failure(`Request failed after ${retryAttempts} attempts: ${errorMessage}`);
  }

  /**
   * Register a notification handler
   */
  onNotification(handler: (method: string, params: any) => void): void {
    this.notificationHandler = handler;
    if (this.client) {
      this.setupNotificationHandling();
    }
  }

  /**
   * Register an error handler
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get transport capabilities
   */
  getCapabilities(): Record<string, any> {
    return {
      transport: 'stdio',
      ...this.config.capabilities,
    };
  }

  /**
   * Build MCP capabilities object
   */
  private buildCapabilities(): Record<string, any> {
    const caps: Record<string, any> = {};
    const capabilities = this.config.capabilities || {
      completion: true,
      prompts: true,
      resources: true,
      sampling: true,
    };

    if (capabilities.prompts) {
      caps.prompts = {};
    }
    if (capabilities.resources) {
      caps.resources = {};
    }
    if (capabilities.sampling) {
      caps.sampling = {};
    }

    return { capabilities: caps };
  }

  /**
   * Set up notification handling on the client
   */
  private setupNotificationHandling(): void {
    if (!this.client || !this.notificationHandler) {
      return;
    }

    // The SDK client doesn't expose a direct notification handler,
    // but we can intercept them through the transport if needed
    // For now, this is a placeholder for future implementation
    this.logger?.debug('Notification handling setup (placeholder)');
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
