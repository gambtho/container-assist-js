/**
 * Base Handler Pattern Tests
 * Priority 2: Tool Registry - Base handler patterns and MCP tool abstractions
 */

import { BaseToolDescriptor, ValidationError, type ToolRequest } from '../../../../src/application/tools/base-handler';
import { createMockLogger, createMockCoreServices } from '../../../utils/mock-factories';
import type { CoreServices } from '../../../../src/application/services/interfaces';
import type { ToolConfig } from '../../../../src/application/tools/tool-config';
import { z } from 'zod';
import { jest } from '@jest/globals';

// Mock Zod schema for testing
const MockInputSchema = z.object({
  param1: z.string(),
  param2: z.number().optional(),
});

const MockOutputSchema = z.object({
  result: z.string(),
  value: z.number(),
});

// Test implementation of BaseToolDescriptor
class TestToolHandler extends BaseToolDescriptor<
  z.infer<typeof MockInputSchema>,
  z.infer<typeof MockOutputSchema>
> {
  get inputSchema() {
    return MockInputSchema;
  }

  get outputSchema() {
    return MockOutputSchema;
  }

  async handler(input: z.infer<typeof MockInputSchema>) {
    return {
      result: `processed-${input.param1}`,
      value: (input.param2 ?? 0) * 2,
    };
  }
}

// Test tool with chain hint
class ChainedToolHandler extends BaseToolDescriptor<
  z.infer<typeof MockInputSchema>,
  z.infer<typeof MockOutputSchema>
> {
  get inputSchema() {
    return MockInputSchema;
  }

  get chainHint() {
    return {
      nextTool: 'next-tool',
      reason: 'Continue processing',
      paramMapper: (output: z.infer<typeof MockOutputSchema>) => ({
        input: output.result,
      }),
    };
  }

  async handler(input: z.infer<typeof MockInputSchema>) {
    return {
      result: `chained-${input.param1}`,
      value: input.param2 ?? 1,
    };
  }
}

// Test tool that throws errors
class ErrorToolHandler extends BaseToolDescriptor<
  z.infer<typeof MockInputSchema>,
  never
> {
  get inputSchema() {
    return MockInputSchema;
  }

  async handler(input: z.infer<typeof MockInputSchema>) {
    if (input.param1 === 'error') {
      throw new Error('Test error');
    }
    if (input.param1 === 'custom-error') {
      throw new ValidationError('Custom validation error', ['param1']);
    }
    throw new Error('Unexpected input');
  }
}

describe('BaseToolDescriptor', () => {
  let mockServices: CoreServices;
  let mockConfig: ToolConfig;
  let testTool: TestToolHandler;

  beforeEach(() => {
    mockServices = createMockCoreServices();
    mockConfig = {
      name: 'test-tool',
      description: 'Test tool for unit testing',
      category: 'testing',
      version: '1.0.0',
      schema: MockInputSchema,
    };
    testTool = new TestToolHandler(mockServices, mockConfig);
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with services and config', () => {
      expect(testTool).toBeDefined();
      expect(testTool['config']).toEqual(mockConfig);
      expect(testTool['services']).toEqual(mockServices);
    });

    it('should create child logger with tool name', () => {
      expect(mockServices.logger.child).toHaveBeenCalledWith({ tool: 'test-tool' });
    });

    it('should expose input schema', () => {
      expect(testTool.inputSchema).toBe(MockInputSchema);
    });

    it('should expose output schema when defined', () => {
      expect(testTool.outputSchema).toBe(MockOutputSchema);
    });

    it('should return undefined for chain hint by default', () => {
      expect(testTool.chainHint).toBeUndefined();
    });
  });

  describe('Tool Execution', () => {
    it('should execute successfully with valid input', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 'hello',
          param2: 5,
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.tool).toBe('test-tool');
        expect(result.data).toEqual({
          result: 'processed-hello',
          value: 10,
        });
        expect(result.message).toBe('Tool test-tool executed successfully');
        expect(result.arguments).toEqual(request.arguments);
      }
    });

    it('should execute successfully with minimal input', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 'minimal',
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          result: 'processed-minimal',
          value: 0, // param2 defaults to 0, then multiplied by 2
        });
      }
    });

    it('should handle empty arguments gracefully', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        // No arguments
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Input validation failed');
        expect(result.tool).toBe('test-tool');
      }
    });

    it('should validate output when output schema is provided', async () => {
      // Create a tool that returns invalid output
      class InvalidOutputTool extends BaseToolDescriptor<
        z.infer<typeof MockInputSchema>,
        z.infer<typeof MockOutputSchema>
      > {
        get inputSchema() {
          return MockInputSchema;
        }

        get outputSchema() {
          return MockOutputSchema;
        }

        async handler() {
          return {
            result: 'valid',
            // Missing 'value' field - should cause validation error
          } as any;
        }
      }

      const invalidTool = new InvalidOutputTool(mockServices, mockConfig);
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'test' },
      };

      const result = await invalidTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('value');
      }
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          // Missing required param1
          param2: 5,
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Input validation failed');
        expect(result.error).toContain('param1');
      }
    });

    it('should validate field types', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 123, // Should be string
          param2: 'invalid', // Should be number
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Input validation failed');
      }
    });

    it('should accept valid optional fields', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 'test',
          param2: 10,
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          result: 'processed-test',
          value: 20,
        });
      }
    });
  });

  describe('Error Handling', () => {
    let errorTool: ErrorToolHandler;

    beforeEach(() => {
      errorTool = new ErrorToolHandler(mockServices, mockConfig);
    });

    it('should handle standard errors', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'error' },
      };

      const result = await errorTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Test error');
        expect(result.tool).toBe('test-tool');
        expect(result.arguments).toEqual(request.arguments);
      }
    });

    it('should handle validation errors', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'custom-error' },
      };

      const result = await errorTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Custom validation error');
      }
    });

    it('should handle non-Error objects', async () => {
      class StringErrorTool extends BaseToolDescriptor<any, any> {
        get inputSchema() {
          return z.any();
        }

        async handler() {
          throw 'String error';
        }
      }

      const stringErrorTool = new StringErrorTool(mockServices, mockConfig);
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {},
      };

      const result = await stringErrorTool.handle(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('String error');
      }
    });

    it('should log errors properly', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'error' },
      };

      await errorTool.handle(request);

      expect(mockServices.logger.child().error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error',
          tool: 'test-tool',
        }),
        'Tool execution failed'
      );
    });
  });

  describe('Chain Hints', () => {
    let chainedTool: ChainedToolHandler;

    beforeEach(() => {
      chainedTool = new ChainedToolHandler(mockServices, mockConfig);
    });

    it('should include chain hint in successful response', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'chain-test' },
      };

      const result = await chainedTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.nextStep).toEqual({
          tool: 'next-tool',
          reason: 'Continue processing',
        });
      }
    });

    it('should expose chain hint configuration', () => {
      const chainHint = chainedTool.chainHint;
      
      expect(chainHint).toBeDefined();
      expect(chainHint?.nextTool).toBe('next-tool');
      expect(chainHint?.reason).toBe('Continue processing');
      expect(chainHint?.paramMapper).toBeDefined();
    });
  });

  describe('Session ID Handling', () => {
    it('should extract session ID from arguments (session_id)', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 'test',
          session_id: 'test-session-123',
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sessionId).toBe('test-session-123');
      }
    });

    it('should extract session ID from arguments (sessionId)', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 'test',
          sessionId: 'test-session-456',
        },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sessionId).toBe('test-session-456');
      }
    });

    it('should extract session ID from result when not in arguments', async () => {
      class SessionResultTool extends BaseToolDescriptor<any, any> {
        get inputSchema() {
          return z.object({ param1: z.string() });
        }

        async handler() {
          return {
            data: 'test',
            sessionId: 'result-session-789',
          };
        }
      }

      const sessionTool = new SessionResultTool(mockServices, mockConfig);
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'test' },
      };

      const result = await sessionTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sessionId).toBe('result-session-789');
      }
    });

    it('should handle missing session ID gracefully', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'test' },
      };

      const result = await testTool.handle(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sessionId).toBeUndefined();
      }
    });
  });

  describe('Progress Updates', () => {
    it('should emit progress updates when service is available', async () => {
      const mockProgress = {
        emit: jest.fn().mockResolvedValue(undefined),
      };
      mockServices.progress = mockProgress as any;

      const progressUpdate = {
        sessionId: 'test-session',
        step: 'test-step',
        status: 'in_progress' as const,
        message: 'Testing progress',
        progress: 50,
        data: { test: true },
      };

      await testTool['emitProgress'](progressUpdate);

      expect(mockProgress.emit).toHaveBeenCalledWith(progressUpdate);
    });

    it('should handle progress service errors gracefully', async () => {
      const mockProgress = {
        emit: jest.fn().mockRejectedValue(new Error('Progress service error')),
      };
      mockServices.progress = mockProgress as any;

      const progressUpdate = {
        sessionId: 'test-session',
        step: 'test-step',
        status: 'failed' as const,
        message: 'Testing error handling',
        progress: 0,
      };

      // Should not throw
      await expect(testTool['emitProgress'](progressUpdate)).resolves.not.toThrow();

      expect(mockServices.logger.child().warn).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to emit progress update'
      );
    });

    it('should handle missing progress service gracefully', async () => {
      mockServices.progress = undefined;

      const progressUpdate = {
        sessionId: 'test-session',
        step: 'test-step',
        status: 'completed' as const,
        message: 'Testing without service',
        progress: 100,
      };

      // Should not throw when progress service is undefined
      await expect(testTool['emitProgress'](progressUpdate)).resolves.not.toThrow();
    });
  });

  describe('Logging', () => {
    it('should log tool request start', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: {
          param1: 'logging-test',
          session_id: 'test-session',
        },
      };

      await testTool.handle(request);

      expect(mockServices.logger.child().info).toHaveBeenCalledWith(
        {
          tool: 'test-tool',
          hasSession: true,
        },
        'Handling tool request'
      );
    });

    it('should log successful tool execution', async () => {
      const request: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'success-test' },
      };

      await testTool.handle(request);

      expect(mockServices.logger.child().info).toHaveBeenCalledWith(
        {
          tool: 'test-tool',
          success: true,
        },
        'Tool executed successfully'
      );
    });

    it('should detect session presence correctly', async () => {
      const requestWithoutSession: ToolRequest = {
        method: 'test-tool',
        arguments: { param1: 'no-session' },
      };

      await testTool.handle(requestWithoutSession);

      expect(mockServices.logger.child().info).toHaveBeenCalledWith(
        {
          tool: 'test-tool',
          hasSession: false,
        },
        'Handling tool request'
      );
    });
  });

  describe('ValidationError Class', () => {
    it('should create validation error with fields', () => {
      const error = new ValidationError('Test validation error', ['field1', 'field2']);

      expect(error.message).toBe('Test validation error');
      expect(error.name).toBe('ValidationError');
      expect(error.fields).toEqual(['field1', 'field2']);
    });

    it('should be instanceof Error', () => {
      const error = new ValidationError('Test error', []);
      expect(error).toBeInstanceOf(Error);
    });
  });
});