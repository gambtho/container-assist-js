/**
 * MCP Transport Interface
 *
 * Defines the contract for transport implementations to enable
 * different communication mechanisms (stdio, HTTP, WebSocket, etc.)
 */

import type { Result } from '@types';

/**
 * Transport configuration options
 */
export interface TransportConfig {
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts for failed requests */
  retryAttempts?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
}

/**
 * MCP Transport Interface
 *
 * Abstracts the underlying transport mechanism from the client logic,
 * enabling different transport implementations without changing client code.
 */
export interface MCPTransport {
  /**
   * Establish connection to the MCP server
   */
  connect(): Promise<Result<void>>;

  /**
   * Close the connection and cleanup resources
   */
  close(): Promise<void>;

  /**
   * Send a request to the server and await response
   * @param method The MCP method to invoke
   * @param params Parameters for the method
   * @param schema Optional Zod schema for response validation
   */
  request<T = any>(method: string, params: any, schema?: any): Promise<Result<T>>;

  /**
   * Register a handler for server notifications
   * @param handler Callback for handling notifications
   */
  onNotification?(handler: (method: string, params: any) => void): void;

  /**
   * Register a handler for transport errors
   * @param handler Callback for handling errors
   */
  onError?(handler: (error: Error) => void): void;

  /**
   * Check if the transport is currently connected
   */
  isConnected(): boolean;

  /**
   * Get transport-specific capabilities or metadata
   */
  getCapabilities?(): Record<string, any>;
}

/**
 * Transport factory function type
 */
export type TransportFactory = (config: TransportConfig) => MCPTransport;

/**
 * Common transport events
 */
export enum TransportEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
}

/**
 * Base transport error class
 */
export class TransportError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}
