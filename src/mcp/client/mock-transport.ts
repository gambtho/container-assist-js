/**
 * Mock Transport Implementation
 *
 * Provides a mock transport for testing MCP client functionality
 * without spawning real processes or making network connections.
 */

import { Success, Failure, type Result } from '@types';
import type { MCPTransport, TransportConfig } from './transport';

/**
 * Request/response recording
 */
export interface MockRequest {
  method: string;
  params: any;
  timestamp: number;
}

export interface MockResponse {
  value?: any;
  error?: string;
  delay?: number;
}

/**
 * Mock transport configuration
 */
export interface MockTransportConfig extends TransportConfig {
  /** Auto-connect on construction */
  autoConnect?: boolean;
  /** Simulate connection failure */
  failConnection?: boolean;
  /** Default delay for all responses in ms */
  defaultDelay?: number;
}

/**
 * Mock Transport for Testing
 *
 * Provides a fully controllable transport implementation for testing
 * client behavior without external dependencies.
 */
export class MockTransport implements MCPTransport {
  private connected = false;
  private responses = new Map<string, MockResponse>();
  private requests: MockRequest[] = [];
  private notificationHandler?: (method: string, params: any) => void;
  private errorHandler?: (error: Error) => void;
  private config: MockTransportConfig;

  constructor(config: MockTransportConfig = {}) {
    this.config = config;
    if (config.autoConnect) {
      this.connected = true;
    }
  }

  /**
   * Mock connection establishment
   */
  async connect(): Promise<Result<void>> {
    if (this.config.failConnection) {
      const error = 'Mock connection failed';
      if (this.errorHandler) {
        this.errorHandler(new Error(error));
      }
      return Failure(error);
    }

    await this.delay(this.config.defaultDelay || 0);
    this.connected = true;
    return Success(undefined);
  }

  /**
   * Mock connection close
   */
  async close(): Promise<void> {
    await this.delay(this.config.defaultDelay || 0);
    this.connected = false;
    this.requests = [];
  }

  /**
   * Mock request handling
   */
  async request<T = any>(method: string, params: any): Promise<Result<T>> {
    if (!this.connected) {
      return Failure('Transport not connected');
    }

    // Record the request
    this.requests.push({
      method,
      params,
      timestamp: Date.now(),
    });

    // Get configured response
    const response = this.responses.get(method);

    // Apply delay if configured
    const delay = response?.delay || this.config.defaultDelay || 0;
    if (delay > 0) {
      await this.delay(delay);
    }

    // Return configured response or default
    if (response) {
      if (response.error) {
        if (this.errorHandler) {
          this.errorHandler(new Error(response.error));
        }
        return Failure(response.error);
      }
      return Success(response.value as T);
    }

    // Default responses for common methods
    return this.getDefaultResponse(method, params);
  }

  /**
   * Set up notification handler
   */
  onNotification(handler: (method: string, params: any) => void): void {
    this.notificationHandler = handler;
  }

  /**
   * Set up error handler
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
   * Get mock capabilities
   */
  getCapabilities(): Record<string, any> {
    return {
      transport: 'mock',
      testing: true,
      completion: true,
      prompts: true,
      resources: true,
      sampling: true,
    };
  }

  // Test helper methods

  /**
   * Configure a response for a specific method
   */
  setResponse(method: string, response: MockResponse): void {
    this.responses.set(method, response);
  }

  /**
   * Configure multiple responses
   */
  setResponses(responses: Record<string, MockResponse>): void {
    Object.entries(responses).forEach(([method, response]) => {
      this.responses.set(method, response);
    });
  }

  /**
   * Get all recorded requests
   */
  getRequests(): MockRequest[] {
    return [...this.requests];
  }

  /**
   * Get requests for a specific method
   */
  getRequestsForMethod(method: string): MockRequest[] {
    return this.requests.filter((r) => r.method === method);
  }

  /**
   * Clear all recorded requests
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Clear all configured responses
   */
  clearResponses(): void {
    this.responses.clear();
  }

  /**
   * Reset the mock to initial state
   */
  reset(): void {
    this.connected = this.config.autoConnect || false;
    this.clearRequests();
    this.clearResponses();
  }

  /**
   * Simulate a notification from server
   */
  simulateNotification(method: string, params: any): void {
    if (this.notificationHandler) {
      this.notificationHandler(method, params);
    }
  }

  /**
   * Simulate an error
   */
  simulateError(error: Error): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  /**
   * Force connection state (for testing edge cases)
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  // Private helper methods

  /**
   * Provide default responses for common MCP methods
   */
  private getDefaultResponse<T>(method: string, params: any): Result<T> {
    switch (method) {
      case 'completion/complete':
        return Success({
          completion: {
            values: [`Mock completion for: ${params.argument?.prompt || 'test'}`],
          },
        } as any);

      case 'prompts/get':
        return Success({
          name: params.name,
          description: 'Mock prompt',
          arguments: [],
        } as any);

      case 'prompts/list':
        return Success({
          prompts: [{ name: 'test-prompt', description: 'Test prompt' }],
        } as any);

      case 'resources/list':
        return Success({
          resources: [{ uri: 'test://resource', name: 'Test Resource' }],
        } as any);

      case 'resources/read':
        return Success({
          uri: params.uri,
          contents: [{ text: `Mock content for ${params.uri}` }],
        } as any);

      case 'tools/list':
        return Success({
          tools: [{ name: 'test-tool', description: 'Test tool' }],
        } as any);

      case 'tools/call':
        return Success({
          result: `Mock result for tool: ${params.name}`,
        } as any);

      default:
        return Success({} as any);
    }
  }

  /**
   * Helper to create delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
