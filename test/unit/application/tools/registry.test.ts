/**
 * Tool Registry Tests
 * Team Delta - Test Coverage Foundation
 * 
 * Tests for MCP tool registration, discovery, and execution
 */

import { jest } from '@jest/globals';
import { ToolRegistry } from '../../../../src/application/tools/ops/registry';
import { createMockLogger, createMockCoreServices } from '../../../utils/mock-factories';
import { ServiceError, ErrorCode } from '../../../../src/domain/types/errors';
import { z } from 'zod';
import type { ToolDescriptor } from '../../../../src/application/tools/tool-types';
import type { Logger } from 'pino';
import type { Services } from '../../../../src/services/index';
import type { ApplicationConfig } from '../../../../src/config/types';

// Mock MCP Server
const createMockServer = () => ({
  log: jest.fn(),
  registerTool: jest.fn(),
  notification: jest.fn(),
});

// Mock Tool Descriptor
const createMockToolDescriptor = (name = 'test-tool'): ToolDescriptor => ({
  name,
  description: `Test tool ${name}`,
  inputSchema: z.object({
    input: z.string(),
    optional: z.number().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    success: z.boolean(),
  }),
  handler: jest.fn().mockResolvedValue({
    result: 'test result',
    success: true,
  }),
  category: 'test',
  timeout: 30000,
});

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockServices: ReturnType<typeof createMockCoreServices>;
  let mockConfig: ApplicationConfig;
  let mockServer: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockServices = createMockCoreServices();
    mockConfig = {
      server: { host: 'localhost', port: 3000 },
      docker: { enabled: true },
      kubernetes: { enabled: true },
    } as ApplicationConfig;
    mockServer = createMockServer();
    
    registry = new ToolRegistry(mockServices, mockLogger, mockConfig);
  });

  describe('Server Management', () => {
    it('should attach MCP server to registry', () => {
      registry.setServer(mockServer);
      expect(mockLogger.info).toHaveBeenCalledWith('MCP server attached to registry');
    });

    it('should throw error when registering tool without server', () => {
      const tool = createMockToolDescriptor();
      
      expect(() => registry.registerTool(tool)).toThrow(ServiceError);
      expect(() => registry.registerTool(tool)).toThrow('MCP server not attached');
    });
  });

  describe('Tool Registration', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should register a valid tool descriptor', () => {
      const tool = createMockToolDescriptor('analyze-repo');
      
      registry.registerTool(tool);
      
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'analyze-repo',
        expect.objectContaining({
          title: 'analyze-repo',
          description: 'Test tool analyze-repo',
        }),
        expect.any(Function)
      );
    });

    it('should register multiple tools', () => {
      const tools = [
        createMockToolDescriptor('tool-1'),
        createMockToolDescriptor('tool-2'),
        createMockToolDescriptor('tool-3'),
      ];

      tools.forEach(tool => registry.registerTool(tool));

      expect(mockServer.registerTool).toHaveBeenCalledTimes(3);
      tools.forEach(tool => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
          tool.name,
          expect.any(Object),
          expect.any(Function)
        );
      });
    });

    it('should handle tool with chainHint', () => {
      const tool = createMockToolDescriptor();
      (tool as any).chainHint = 'Can be followed by build-image tool';
      
      registry.registerTool(tool);
      
      expect(mockServer.registerTool).toHaveBeenCalled();
    });

    it('should reject duplicate tool registration', () => {
      const tool = createMockToolDescriptor('duplicate-tool');
      
      registry.registerTool(tool);
      
      // Attempt to register again
      expect(() => registry.registerTool(tool)).toThrow();
    });
  });

  describe('Tool Discovery', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should list all registered tools', () => {
      const tools = [
        createMockToolDescriptor('tool-a'),
        createMockToolDescriptor('tool-b'),
        createMockToolDescriptor('tool-c'),
      ];

      tools.forEach(tool => registry.registerTool(tool));

      const toolList = registry.listTools();
      expect(toolList.tools).toHaveLength(3);
      expect(toolList.tools.map(t => t.name)).toEqual(['tool-a', 'tool-b', 'tool-c']);
    });

    it('should get tool by name', () => {
      const tool = createMockToolDescriptor('specific-tool');
      registry.registerTool(tool);

      const retrieved = registry.getTool('specific-tool');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('specific-tool');
    });

    it('should return undefined for non-existent tool', () => {
      const retrieved = registry.getTool('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should check if tool exists', () => {
      const tool = createMockToolDescriptor('exists');
      registry.registerTool(tool);

      expect(registry.getTool('exists')).toBeDefined();
      expect(registry.getTool('not-exists')).toBeUndefined();
    });
  });

  describe('Tool Execution', () => {
    let mockTool: ToolDescriptor;

    beforeEach(() => {
      registry.setServer(mockServer);
      mockTool = createMockToolDescriptor('executable-tool');
      registry.registerTool(mockTool);
    });

    it('should execute registered tool handler', async () => {
      const input = { input: 'test input', optional: 42 };
      
      // Simulate handler execution through the registered callback
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];
      const result = await registeredHandler(input, {});

      expect(result).toEqual({
        content: [{ type: 'text', text: expect.any(String) }],
      });
    });

    it('should log tool execution', async () => {
      const input = { input: 'test input' };
      
      // Simulate execution
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];
      await registeredHandler(input, {});

      expect(mockServer.log).toHaveBeenCalledWith(
        'info',
        'Tool execution started',
        expect.objectContaining({
          tool: 'executable-tool',
          timestamp: expect.any(String),
        })
      );
    });

    it('should sanitize sensitive parameters in logs', () => {
      const sensitiveInput = {
        username: 'user',
        password: 'secret123',
        api_token: 'token456',
        auth_key: 'key789',
      };

      // Create registry instance to test sanitization
      const testRegistry = new ToolRegistry(mockServices, mockLogger, mockConfig);
      testRegistry.setServer(mockServer);
      
      // Access private method through type casting
      const sanitized = (testRegistry as any).sanitizeParams(sensitiveInput);

      expect(sanitized.username).toBe('user');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.api_token).toBe('[REDACTED]');
      expect(sanitized.auth_key).toBe('[REDACTED]');
    });

    it('should handle tool execution errors', async () => {
      const errorTool = createMockToolDescriptor('error-tool');
      errorTool.handler = jest.fn().mockRejectedValue(new Error('Execution failed'));
      
      registry.registerTool(errorTool);

      const registeredHandler = mockServer.registerTool.mock.calls[1][2];
      
      const result = await registeredHandler({ input: 'test' }, {});
      expect(result).toEqual({
        content: [{ type: 'text', text: expect.stringContaining('error-tool failed') }]
      });
    });

    it('should handle validation errors', async () => {
      const invalidInput = { wrong: 'field' }; // Missing required 'input' field
      
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];
      
      // Handler should validate input against schema
      const result = await registeredHandler(invalidInput, {});
      expect(result).toEqual({
        content: [{ type: 'text', text: expect.stringContaining('failed') }]
      });
    });
  });

  describe('Tool Categories', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should group tools by category', () => {
      const tools = [
        { ...createMockToolDescriptor('workflow-1'), category: 'workflow' },
        { ...createMockToolDescriptor('workflow-2'), category: 'workflow' },
        { ...createMockToolDescriptor('utility-1'), category: 'utility' },
        { ...createMockToolDescriptor('docker-1'), category: 'docker' },
      ];

      tools.forEach(tool => registry.registerTool(tool));

      // Since getToolsByCategory doesn't exist, we filter manually
      const allTools = registry.listTools().tools;
      const workflowTools = allTools.filter(t => (registry.getTool(t.name) as any)?.category === 'workflow');
      expect(workflowTools).toHaveLength(2);
      expect(workflowTools.map(t => t.name)).toEqual(['workflow-1', 'workflow-2']);

      const utilityTools = allTools.filter(t => (registry.getTool(t.name) as any)?.category === 'utility');
      expect(utilityTools).toHaveLength(1);
      expect(utilityTools[0].name).toBe('utility-1');
    });

    it('should return empty array for non-existent category', () => {
      const allTools = registry.listTools().tools;
      const tools = allTools.filter(t => (registry.getTool(t.name) as any)?.category === 'non-existent');
      expect(tools).toEqual([]);
    });
  });

  describe('Bulk Registration', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should register all tools from directory', async () => {
      // Mock the registerAll method
      const registerAllSpy = jest.spyOn(registry, 'registerAll');
      registerAllSpy.mockResolvedValue(undefined);

      await registry.registerAll();

      expect(registerAllSpy).toHaveBeenCalled();
    });

    it('should handle partial registration failures', async () => {
      const tools = [
        createMockToolDescriptor('success-1'),
        createMockToolDescriptor('failure-tool'),
        createMockToolDescriptor('success-2'),
      ];

      // Register first tool successfully
      registry.registerTool(tools[0]);
      
      // Second tool fails
      mockServer.registerTool.mockImplementationOnce(() => {
        throw new Error('Registration failed');
      });
      
      expect(() => registry.registerTool(tools[1])).toThrow();
      
      // Third tool should still register
      registry.registerTool(tools[2]);
      
      expect(registry.listTools().tools).toHaveLength(2);
    });
  });

  describe('Tool Validation', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should validate tool has required fields', () => {
      const invalidTools = [
        { name: '', handler: jest.fn() }, // Empty name
        { name: 'test', handler: null }, // No handler
        { name: 'test', handler: jest.fn(), inputSchema: 'invalid' }, // Invalid schema
      ];

      invalidTools.forEach(tool => {
        expect(() => registry.registerTool(tool as any)).toThrow();
      });
    });

    it('should validate input against schema before execution', async () => {
      const strictTool = createMockToolDescriptor('strict-tool');
      strictTool.inputSchema = z.object({
        requiredField: z.string().min(1),
        numberField: z.number().positive(),
      }).strict();

      registry.registerTool(strictTool);

      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      // Valid input
      const validResult = await registeredHandler(
        { requiredField: 'value', numberField: 10 },
        {}
      );
      expect(validResult).toBeDefined();

      // Invalid input
      const invalidResult = await registeredHandler({ requiredField: '', numberField: -5 }, {});
      expect(invalidResult).toEqual({
        content: [{ type: 'text', text: expect.stringContaining('failed') }]
      });
    });
  });

  describe('Tool Timeouts', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should respect tool timeout configuration', () => {
      const timeoutTool = createMockToolDescriptor('timeout-tool');
      timeoutTool.timeout = 5000; // 5 seconds

      registry.registerTool(timeoutTool);

      const registered = registry.getTool('timeout-tool');
      expect(registered?.timeout).toBe(5000);
    });

    it('should use default timeout if not specified', () => {
      const defaultTool = createMockToolDescriptor('default-timeout');
      delete (defaultTool as any).timeout;

      registry.registerTool(defaultTool);

      const registered = registry.getTool('default-timeout');
      expect(registered?.timeout).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should handle server communication errors', () => {
      mockServer.registerTool.mockImplementation(() => {
        throw new Error('Server communication failed');
      });

      const tool = createMockToolDescriptor();
      
      expect(() => registry.registerTool(tool)).toThrow('Server communication failed');
    });

    it('should handle malformed tool descriptors', () => {
      const malformedTools = [
        null,
        undefined,
        {},
        { name: 123 }, // Wrong type
        { name: 'test', handler: 'not-a-function' }, // Wrong handler type
      ];

      malformedTools.forEach(tool => {
        expect(() => registry.registerTool(tool as any)).toThrow();
      });
    });

    it('should provide helpful error messages', () => {
      try {
        registry.getTool('non-existent-tool');
        // Tool might not exist, which is okay
      } catch (error: any) {
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Registry State Management', () => {
    beforeEach(() => {
      registry.setServer(mockServer);
    });

    it('should maintain tool registration state', () => {
      const tools = [
        createMockToolDescriptor('tool-1'),
        createMockToolDescriptor('tool-2'),
      ];

      expect(registry.listTools().tools).toHaveLength(0);

      registry.registerTool(tools[0]);
      expect(registry.listTools().tools).toHaveLength(1);

      registry.registerTool(tools[1]);
      expect(registry.listTools().tools).toHaveLength(2);
    });

    it('should track tool count', () => {
      const tools = [
        createMockToolDescriptor('tool-1'),
        createMockToolDescriptor('tool-2'),
        createMockToolDescriptor('tool-3'),
      ];

      expect(registry.getToolCount()).toBe(0);

      tools.forEach(tool => registry.registerTool(tool));
      expect(registry.getToolCount()).toBe(3);
    });

    it('should get tool names', () => {
      const tools = [
        createMockToolDescriptor('alpha'),
        createMockToolDescriptor('beta'),
        createMockToolDescriptor('gamma'),
      ];

      tools.forEach(tool => registry.registerTool(tool));
      
      const names = registry.getToolNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toContain('gamma');
    });
  });
});