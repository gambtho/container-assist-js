/**
 * Tests for SimplifiedResourceManager
 * Verifies direct resource registration without provider abstraction
 */

import { SimplifiedResourceManager } from '../simplified-resource-manager';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { ApplicationConfig } from '../../../config/index.js';
import type { SessionService } from '../../../services/session.js';
import type { DockerService } from '../../../services/docker.js';

// Type definitions for better test type safety
interface MockMcpServer {
  registerResource: jest.Mock;
}

interface ResourceHandlerResult {
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

type MockCall = [string, string, object, (...args: unknown[]) => Promise<ResourceHandlerResult>];

describe('SimplifiedResourceManager', () => {
  let resourceManager: SimplifiedResourceManager;
  let mockServer: McpServer;
  let mockConfig: ApplicationConfig;
  let mockSessionService: SessionService;
  let mockDockerService: DockerService;
  let mockLogger: Logger;

  let mockRegisterResource: jest.Mock;

  beforeEach(() => {
    // Create mock MCP server
    mockRegisterResource = jest.fn();
    mockServer = {
      registerResource: mockRegisterResource,
    } as unknown as MockMcpServer;

    // Create mock config
    mockConfig = {
      server: {
        host: 'localhost',
        port: 8080,
      },
      logging: {
        level: 'info',
      },
      features: {},
    } as ApplicationConfig;

    // Create mock session service
    mockSessionService = {
      list: jest.fn(),
    } as unknown as SessionService;

    // Create mock docker service
    mockDockerService = {
      getSystemInfo: jest.fn().mockResolvedValue({ version: '24.0.0', containers: 0 }),
    } as unknown as DockerService;

    // Create mock logger
    mockLogger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    resourceManager = new SimplifiedResourceManager(
      mockConfig,
      mockSessionService,
      mockDockerService,
      mockLogger,
    );
  });

  describe('registerWithServer', () => {
    it('should register all resources directly with MCP server', () => {
      resourceManager.registerWithServer(mockServer);

      // Verify all expected resources are registered (workflow has 2 resources)
      expect(mockRegisterResource).toHaveBeenCalledTimes(6); // workflow(2), session, docker, config, tools

      // Verify workflow resources
      const registerResource = mockRegisterResource;

      expect(registerResource).toHaveBeenCalledWith(
        'Current Workflow State',
        'workflow://current',
        expect.objectContaining({
          title: 'Current Workflow State',
          description: 'Active workflow state and progress information',
          mimeType: 'application/json',
        }),
        expect.any(Function) as (...args: unknown[]) => Promise<ResourceHandlerResult>,
      );

      expect(registerResource).toHaveBeenCalledWith(
        'Workflow History',
        'workflow://history',
        expect.objectContaining({
          title: 'Workflow History',
          description: 'Recent workflow execution history',
        }),
        expect.any(Function) as (...args: unknown[]) => Promise<ResourceHandlerResult>,
      );

      // Verify other resource types are registered
      expect(registerResource).toHaveBeenCalledWith(
        'Active Sessions',
        'session://active',
        expect.any(Object) as object,
        expect.any(Function) as (...args: unknown[]) => Promise<ResourceHandlerResult>,
      );

      expect(registerResource).toHaveBeenCalledWith(
        'Docker System Information',
        'docker://system',
        expect.any(Object) as object,
        expect.any(Function) as (...args: unknown[]) => Promise<ResourceHandlerResult>,
      );

      expect(registerResource).toHaveBeenCalledWith(
        'Current Server Configuration',
        'config://current',
        expect.any(Object) as object,
        expect.any(Function) as (...args: unknown[]) => Promise<ResourceHandlerResult>,
      );

      expect(registerResource).toHaveBeenCalledWith(
        'Tool Registry',
        'tools://registry',
        expect.any(Object) as object,
        expect.any(Function) as (...args: unknown[]) => Promise<ResourceHandlerResult>,
      );
    });

    it('should not register twice', () => {
      resourceManager.registerWithServer(mockServer);
      resourceManager.registerWithServer(mockServer);

      // Should only register once
      expect(mockRegisterResource).toHaveBeenCalledTimes(6);
      const loggerWarn = mockLogger.warn as jest.MockedFunction<Logger['warn']>;
      expect(loggerWarn).toHaveBeenCalledWith('Resources already registered with server');
    });

    it('should handle registration errors', () => {
      const mockErrorServer = {
        registerResource: jest.fn().mockImplementation(() => {
          throw new Error('Registration failed');
        }),
      } as unknown as McpServer;

      expect(() => {
        resourceManager.registerWithServer(mockErrorServer);
      }).toThrow('Registration failed');

      const loggerError = mockLogger.error as jest.MockedFunction<Logger['error']>;
      expect(loggerError).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) as Error }),
        'Failed to register resources',
      );
    });
  });

  describe('workflow resource handlers', () => {
    it('should handle workflow current resource with active sessions', async () => {
      const mockSession = {
        id: 'session-1',
        status: 'active',
        stage: 'build',
        progress: 50,
        workflow_state: { step: 'building' },
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T01:00:00Z',
        repo_path: '/path/to/repo',
      };

      (mockSessionService.list as jest.Mock).mockReturnValue([mockSession]);

      resourceManager.registerWithServer(mockServer);

      // Get the handler for workflow current
      const registerCalls = (mockServer.registerResource as jest.Mock).mock.calls as MockCall[];
      const workflowCurrentCall = registerCalls.find((call) => call[1] === 'workflow://current');
      if (!workflowCurrentCall) throw new Error('Workflow current call not found');
      const handler = workflowCurrentCall[3];

      const result = await handler();

      expect(result).toEqual({
        contents: [
          {
            uri: 'workflow://current',
            mimeType: 'application/json',
            text: expect.stringContaining('session-1') as string,
          },
        ],
      });

      const parsedContent = JSON.parse(result.contents[0].text) as {
        sessionId: string;
        status: string;
        stage: string;
        progress: number;
      };
      expect(parsedContent.sessionId).toBe('session-1');
      expect(parsedContent.status).toBe('active');
    });

    it('should handle workflow current resource with no active sessions', async () => {
      (mockSessionService.list as jest.Mock).mockReturnValue([]);

      resourceManager.registerWithServer(mockServer);

      const registerCalls = (mockServer.registerResource as jest.Mock).mock.calls as MockCall[];
      const workflowCurrentCall = registerCalls.find((call) => call[1] === 'workflow://current');
      if (!workflowCurrentCall) throw new Error('Workflow current call not found');
      const handler = workflowCurrentCall[3];

      const result = await handler();
      const parsedContent = JSON.parse(result.contents[0].text) as {
        status: string;
        message: string;
      };

      expect(parsedContent.status).toBe('no_active_workflow');
      expect(parsedContent.message).toBe('No active workflow sessions found');
    });
  });

  describe('configuration resource handler', () => {
    it('should return safe configuration without sensitive data', async () => {
      resourceManager.registerWithServer(mockServer);

      const registerCalls = (mockServer.registerResource as jest.Mock).mock.calls as MockCall[];
      const configCall = registerCalls.find((call) => call[1] === 'config://current');
      if (!configCall) throw new Error('Config call not found');
      const handler = configCall[3];

      const result = await handler();
      const parsedContent = JSON.parse(result.contents[0].text) as {
        server: { host: string; port: number };
        logging: { level: string };
        timestamp: string;
      };

      expect(parsedContent.server.host).toBe('localhost');
      expect(parsedContent.server.port).toBe(8080);
      expect(parsedContent.logging.level).toBe('info');
      expect(parsedContent).toHaveProperty('timestamp');

      // Ensure no sensitive data is exposed
      expect(parsedContent).not.toHaveProperty('secrets');
      expect(parsedContent).not.toHaveProperty('apiKeys');
    });
  });

  describe('docker resource handler', () => {
    it('should return docker system information', async () => {
      resourceManager.registerWithServer(mockServer);

      const registerCalls = (mockServer.registerResource as jest.Mock).mock.calls as MockCall[];
      const dockerCall = registerCalls.find((call) => call[1] === 'docker://system');
      if (!dockerCall) throw new Error('Docker call not found');
      const handler = dockerCall[3];

      const result = await handler();
      const parsedContent = JSON.parse(result.contents[0].text) as {
        version: string;
        containers: number;
        timestamp: string;
      };

      expect(parsedContent.version).toBe('24.0.0');
      expect(parsedContent.containers).toBe(0);
      expect(parsedContent).toHaveProperty('timestamp');
    });

    it('should handle docker service errors', async () => {
      (mockDockerService.getSystemInfo as jest.Mock).mockRejectedValue(
        new Error('Docker not available'),
      );

      resourceManager.registerWithServer(mockServer);

      const registerCalls = (mockServer.registerResource as jest.Mock).mock.calls as MockCall[];
      const dockerCall = registerCalls.find((call) => call[1] === 'docker://system');
      if (!dockerCall) throw new Error('Docker call not found');
      const handler = dockerCall[3];

      const result = await handler();
      const parsedContent = JSON.parse(result.contents[0].text) as {
        status: string;
        message: string;
      };

      expect(parsedContent.status).toBe('error');
      expect(parsedContent.message).toBe('Docker not available');
    });
  });

  describe('isResourcesRegistered', () => {
    it('should return false before registration', () => {
      expect(resourceManager.isResourcesRegistered()).toBe(false);
    });

    it('should return true after registration', () => {
      resourceManager.registerWithServer(mockServer);
      expect(resourceManager.isResourcesRegistered()).toBe(true);
    });
  });
});
