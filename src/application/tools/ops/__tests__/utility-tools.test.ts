/**
 * Utility Tools (Ping & Server Status) - Unit Tests
 */

import { jest } from '@jest/globals';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('os', () => ({
  totalmem: jest.fn(),
  freemem: jest.fn(),
  uptime: jest.fn(),
  platform: jest.fn(),
  cpus: jest.fn(),
}));

// Import modules AFTER setting up mocks
const pingTool = (await import('../ping')).default;
const serverStatusTool = (await import('../server-status')).default;
const os = await import('os');

// Import types and utilities
import type { PingInput } from '../ping';
import type { ServerStatusInputType } from '../server-status';
import type { ToolContext } from '../../tool-types';
import { createMockToolContext, createMockLogger } from '../../__tests__/shared/test-utils';

const mockOs = os as jest.Mocked<typeof os>;

describe('utility tools', () => {
  let mockContext: ToolContext;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockContext = createMockToolContext({
      logger: mockLogger,
    });

    // Mock process properties
    Object.defineProperty(process, 'uptime', {
      value: jest.fn(() => 1234.56),
      configurable: true,
    });

    Object.defineProperty(process, 'pid', {
      value: 12345,
      configurable: true,
    });

    // Mock os functions
    mockOs.totalmem.mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB
    mockOs.freemem.mockReturnValue(2 * 1024 * 1024 * 1024); // 2GB free
  });

  describe('ping tool', () => {
    // Test data constants
    const _defaultPingExpectations = {
      success: true,
      message: 'pong: ping',
      timestampFormat: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    };

    describe('basic ping operations', () => {
      it('should respond to ping with default message', async () => {
        const input: PingInput = {};

        const result = await pingTool.handler(input, mockContext);

        expect(result).toMatchObject({
          success: true,
          message: 'pong: ping',
          timestamp: expect.any(String) as string,
          server: {
            name: 'container-kit-mcp',
            version: '2.0.0',
            uptime: 1234.56,
            pid: 12345,
          },
          capabilities: {
            tools: true,
            sampling: true,
            progress: true,
          },
        });

        // Validate timestamp format
        expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      });

      it('should respond to ping with custom message', async () => {
        const input: PingInput = {
          message: 'custom-ping-message',
        };

        const result = await pingTool.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toBe('pong: custom-ping-message');
        expect(result.server.name).toBe('container-kit-mcp');
      });

      it('should handle empty string message', async () => {
        const input: PingInput = {
          message: '',
        };

        const result = await pingTool.handler(input, mockContext);

        expect(result.message).toBe('pong: ');
        expect(result.success).toBe(true);
      });

      it('should handle long message', async () => {
        const longMessage = 'a'.repeat(1000);
        const input: PingInput = {
          message: longMessage,
        };

        const result = await pingTool.handler(input, mockContext);

        expect(result.message).toBe(`pong: ${longMessage}`);
        expect(result.success).toBe(true);
      });

      it('should handle special characters in message', async () => {
        const input: PingInput = {
          message: 'ping-with-special-chars!@#$%^&*()_+-={}[]|\\:";\'<>?,./',
        };

        const result = await pingTool.handler(input, mockContext);

        expect(result.message).toBe(
          'pong: ping-with-special-chars!@#$%^&*()_+-={}[]|\\:";\'<>?,./',
        );
        expect(result.success).toBe(true);
      });
    });

    describe('server information', () => {
      it('should provide accurate server information', async () => {
        const input: PingInput = { message: 'test' };

        const result = await pingTool.handler(input, mockContext);

        expect(result.server).toMatchObject({
          name: 'container-kit-mcp',
          version: '2.0.0',
          uptime: expect.any(Number) as number,
          pid: expect.any(Number) as number,
        });

        expect(result.server.uptime).toBeGreaterThan(0);
        expect(result.server.pid).toBeGreaterThan(0);
      });

      it('should provide capabilities information', async () => {
        const input: PingInput = { message: 'capabilities-test' };

        const result = await pingTool.handler(input, mockContext);

        expect(result.capabilities).toEqual({
          tools: true,
          sampling: true,
          progress: true,
        });
      });

      it('should generate consistent timestamp format', async () => {
        const input: PingInput = { message: 'timestamp-test' };

        const result = await pingTool.handler(input, mockContext);

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    describe('logging behavior', () => {
      it('should log ping request processing', async () => {
        const input: PingInput = { message: 'logging-test' };

        await pingTool.handler(input, mockContext);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { message: 'logging-test' },
          'Processing ping request',
        );
      });

      it('should log with default message when not provided', async () => {
        const input: PingInput = {};

        await pingTool.handler(input, mockContext);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { message: 'ping' },
          'Processing ping request',
        );
      });
    });

    describe('tool descriptor properties', () => {
      it('should have correct tool metadata', () => {
        expect(pingTool.name).toBe('ping');
        expect(pingTool.description).toBe('Test MCP server connectivity and health');
        expect(pingTool.category).toBe('utility');
        expect(pingTool.inputSchema).toBeDefined();
        expect(pingTool.outputSchema).toBeDefined();
      });

      it('should not have a chain hint (utility tool)', () => {
        expect(pingTool.chainHint).toBeUndefined();
      });
    });

    describe('input validation', () => {
      it('should accept empty input', () => {
        const input = {};

        const parsed = pingTool.inputSchema.parse(input);
        expect(parsed.message).toBe('ping'); // Default value
      });

      it('should accept valid message', () => {
        const input: PingInput = { message: 'test-message' };

        const parsed = pingTool.inputSchema.parse(input);
        expect(parsed.message).toBe('test-message');
      });
    });

    describe('output validation', () => {
      it('should produce schema-compliant output', async () => {
        const input: PingInput = { message: 'validation-test' };

        const result = await pingTool.handler(input, mockContext);

        // Validate output against schema
        expect(() => pingTool.outputSchema.parse(result)).not.toThrow();
      });
    });
  });

  describe('server-status tool', () => {
    describe('basic status operations', () => {
      it('should provide server status with basic information', async () => {
        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result).toMatchObject({
          success: true,
          version: '2.0.0',
          uptime: expect.any(Number) as number,
          memory: {
            used: expect.any(Number) as number,
            total: expect.any(Number) as number,
          },
          sessions: expect.any(Number) as number,
          tools: expect.any(Number) as number,
        });

        expect(result.uptime).toBeGreaterThan(0);
        expect(result.memory.total).toBeGreaterThan(result.memory.used);
        expect(result.memory.used).toBeGreaterThan(0);
      });

      it('should calculate memory usage correctly', async () => {
        mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB total
        mockOs.freemem.mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB free

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.memory.total).toBe(16 * 1024 * 1024 * 1024);
        expect(result.memory.used).toBe(12 * 1024 * 1024 * 1024); // total - free
      });

      it('should handle details parameter', async () => {
        const input: ServerStatusInputType = { details: true };

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.success).toBe(true);
        expect(result.version).toBe('2.0.0');
      });
    });

    describe('session service integration', () => {
      it('should get session count from session service', async () => {
        const mockSessionService = {
          getActiveCount: jest.fn().mockResolvedValue(42),
        };

        mockContext.sessionService =
          mockSessionService as unknown as typeof mockContext.sessionService;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.sessions).toBe(42);
        expect(mockSessionService.getActiveCount).toHaveBeenCalled();
      });

      it('should handle session service unavailable', async () => {
        mockContext.sessionService = undefined;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.sessions).toBe(0);
      });

      it('should handle session service errors', async () => {
        const mockSessionService = {
          getActiveCount: jest.fn().mockRejectedValue(new Error('Session service error')),
        };

        mockContext.sessionService =
          mockSessionService as unknown as typeof mockContext.sessionService;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.sessions).toBe(0);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { error: expect.any(Error) as Error },
          'Failed to get session count',
        );
      });
    });

    describe('tool counting', () => {
      it('should get tool count from server listTools method', async () => {
        const mockServer = {
          listTools: jest.fn().mockResolvedValue({
            tools: [{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }],
          }),
        };

        mockContext.server = mockServer;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.tools).toBe(3);
        expect(mockServer.listTools).toHaveBeenCalled();
      });

      it('should get tool count from server listTools (array format)', async () => {
        const mockServer = {
          listTools: jest.fn().mockResolvedValue([{ name: 'tool1' }, { name: 'tool2' }]),
        };

        mockContext.server = mockServer;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.tools).toBe(2);
      });

      it('should fallback to getRegisteredTools for tool count', async () => {
        mockContext.server = {}; // Server without listTools

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        // Should get count from the registry; avoid hardcoded totals
        expect(result.tools).toBeGreaterThan(0);
      });

      it('should handle tool counting errors', async () => {
        const mockServer = {
          listTools: jest.fn().mockRejectedValue(new Error('Tool listing error')),
        };

        mockContext.server = mockServer;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.tools).toBe(0);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          { error: expect.any(Error) as Error },
          'Failed to get dynamic tool count, defaulting to 0',
        );
      });

      it('should handle missing server', async () => {
        mockContext.server = undefined;

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        // Should get count from the registry when server is missing
        expect(typeof result.tools).toBe('number');
        expect(result.tools).toBeGreaterThan(0);
      });
    });

    describe('system information', () => {
      it('should provide accurate uptime', async () => {
        // Mock process.uptime to return specific value
        Object.defineProperty(process, 'uptime', {
          value: jest.fn(() => 3661.789), // 1 hour, 1 minute, 1.789 seconds
          configurable: true,
        });

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.uptime).toBe(3661); // Should be floored
      });

      it('should handle large memory values', async () => {
        const largeMemory = 128 * 1024 * 1024 * 1024; // 128GB
        mockOs.totalmem.mockReturnValue(largeMemory);
        mockOs.freemem.mockReturnValue(largeMemory * 0.1); // 10% free

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.memory.total).toBe(largeMemory);
        expect(result.memory.used).toBe(largeMemory * 0.9);
      });

      it('should handle zero memory scenarios', async () => {
        mockOs.totalmem.mockReturnValue(0);
        mockOs.freemem.mockReturnValue(0);

        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.memory.total).toBe(0);
        expect(result.memory.used).toBe(0);
      });
    });

    describe('error handling', () => {
      it('should handle generic errors', async () => {
        // Force an error by making os.totalmem() throw
        mockOs.totalmem.mockImplementation(() => {
          throw new Error('Memory access error');
        });

        const input: ServerStatusInputType = {};

        await expect(serverStatusTool.handler(input, mockContext)).rejects.toThrow(
          'Memory access error',
        );

        expect(mockLogger.error).toHaveBeenCalledWith(
          { error: expect.any(Error) as Error },
          'Error collecting server status',
        );
      });

      it('should handle non-Error objects', async () => {
        mockOs.totalmem.mockImplementation(() => {
          throw 'String error';
        });

        const input: ServerStatusInputType = {};

        await expect(serverStatusTool.handler(input, mockContext)).rejects.toThrow('String error');
      });
    });

    describe('logging behavior', () => {
      it('should log status request and compilation', async () => {
        const input: ServerStatusInputType = { details: true };

        await serverStatusTool.handler(input, mockContext);

        expect(mockLogger.info).toHaveBeenCalledWith({ details: true }, 'Server status requested');

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            uptime: expect.any(Number) as number,
            sessions: expect.any(Number) as number,
            memoryUsed: expect.any(Number),
          }),
          'Server status compiled',
        );
      });

      it('should log with default details when not provided', async () => {
        const input: ServerStatusInputType = {};

        await serverStatusTool.handler(input, mockContext);

        expect(mockLogger.info).toHaveBeenCalledWith(
          { details: undefined },
          'Server status requested',
        );
      });
    });

    describe('tool descriptor properties', () => {
      it('should have correct tool metadata', () => {
        expect(serverStatusTool.name).toBe('server_status');
        expect(serverStatusTool.description).toBe('Get MCP server status and system information');
        expect(serverStatusTool.category).toBe('utility');
        expect(serverStatusTool.inputSchema).toBeDefined();
        expect(serverStatusTool.outputSchema).toBeDefined();
      });

      it('should not have a chain hint (utility tool)', () => {
        expect(serverStatusTool.chainHint).toBeUndefined();
      });
    });

    describe('input validation', () => {
      it('should accept empty input', () => {
        const input = {};

        const parsed = serverStatusTool.inputSchema.parse(input);
        expect(parsed.details).toBeUndefined();
      });

      it('should accept details parameter', () => {
        const input: ServerStatusInputType = { details: true };

        const parsed = serverStatusTool.inputSchema.parse(input);
        expect(parsed.details).toBe(true);
      });
    });

    describe('output validation', () => {
      it('should produce schema-compliant output', async () => {
        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        // Validate output against schema
        expect(() => serverStatusTool.outputSchema.parse(result)).not.toThrow();
      });

      it('should handle all required fields', async () => {
        const input: ServerStatusInputType = {};

        const result = await serverStatusTool.handler(input, mockContext);

        expect(result.success).toBeDefined();
        expect(result.version).toBeDefined();
        expect(result.uptime).toBeDefined();
        expect(result.memory).toBeDefined();
        expect(result.memory.used).toBeDefined();
        expect(result.memory.total).toBeDefined();
        expect(result.sessions).toBeDefined();
        expect(result.tools).toBeDefined();

        // Check types
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.version).toBe('string');
        expect(typeof result.uptime).toBe('number');
        expect(typeof result.memory.used).toBe('number');
        expect(typeof result.memory.total).toBe('number');
        expect(typeof result.sessions).toBe('number');
        expect(typeof result.tools).toBe('number');
      });
    });

    describe('performance characteristics', () => {
      it('should complete status check within reasonable time', async () => {
        const input: ServerStatusInputType = {};

        const startTime = Date.now();
        await serverStatusTool.handler(input, mockContext);
        const endTime = Date.now();

        const duration = endTime - startTime;
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
      });

      it('should handle concurrent status requests', async () => {
        const input: ServerStatusInputType = {};

        const promises = Array.from({ length: 10 }, () =>
          serverStatusTool.handler(input, mockContext),
        );

        const results = await Promise.all(promises);

        expect(results).toHaveLength(10);
        results.forEach((result) => {
          expect(result.success).toBe(true);
        });
      });
    });
  });

  describe('utility tools integration', () => {
    it('should both tools work together without conflicts', async () => {
      const pingInput: PingInput = { message: 'integration-test' };
      const statusInput: ServerStatusInputType = { details: true };

      const [pingResult, statusResult] = await Promise.all([
        pingTool.handler(pingInput, mockContext),
        serverStatusTool.handler(statusInput, mockContext),
      ]);

      expect(pingResult.success).toBe(true);
      expect(statusResult.success).toBe(true);

      // Both should use same server information
      expect(pingResult.server.version).toBe(statusResult.version);
      expect(pingResult.server.name).toBe('container-kit-mcp');
    });

    it('should handle shared context correctly', async () => {
      const sharedContext = createMockToolContext({
        logger: mockLogger,
        sessionService: {
          getActiveCount: jest.fn().mockResolvedValue(5),
        },
        server: {
          listTools: jest.fn().mockResolvedValue([{ name: 'ping' }, { name: 'server_status' }]),
        },
      });

      const pingResult = await pingTool.handler({ message: 'shared' }, sharedContext);
      const statusResult = await serverStatusTool.handler({}, sharedContext);

      expect(pingResult.success).toBe(true);
      expect(statusResult.success).toBe(true);
      expect(statusResult.sessions).toBe(5);
      expect(statusResult.tools).toBe(2);
    });
  });
});
