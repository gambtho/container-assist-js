/**
 * Unit tests for tool error handling
 * Tests proper error handling for unimplemented and failing tools
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  ToolNotImplementedError, 
  ToolValidationError, 
  ToolExecutionError,
  suggestAlternativeTools 
} from '../../../src/application/errors/tool-errors.js';
import { convertToMcpError } from '../../../src/application/errors/mcp-error-mapper.js';
import { ToolRegistry } from '../../../src/application/tools/ops/registry.js';
import { 
  getImplementedTools, 
  isToolImplemented,
  getToolInfo,
  ToolStatus
} from '../../../src/application/tools/tool-manifest.js';
import { ErrorCode } from '../../../src/domain/types/errors.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('ToolNotImplementedError', () => {
  it('should create error with proper properties', () => {
    const error = new ToolNotImplementedError(
      'Tool xyz is not implemented',
      'xyz',
      {
        availableTools: ['analyze_repository', 'build_image'],
        suggestedAlternatives: ['analyze_repository']
      }
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Tool xyz is not implemented');
    expect(error.name).toBe('ToolNotImplementedError');
    expect(error.toolName).toBe('xyz');
    expect(error.availableTools).toEqual(['analyze_repository', 'build_image']);
    expect(error.suggestedAlternatives).toEqual(['analyze_repository']);
    expect(error.code).toBe(ErrorCode.TOOL_ERROR);
    expect(error.severity).toBe('high');
  });

  it('should convert to domain error format', () => {
    const error = new ToolNotImplementedError('Test error', 'test_tool');
    const domainError = error.toDomainError();

    expect(domainError.code).toBe(ErrorCode.TOOL_ERROR);
    expect(domainError.message).toBe('Test error');
    expect(domainError.toolName).toBe('test_tool');
    expect(domainError.severity).toBe('high');
    expect(domainError.timestamp).toBeTruthy();
  });

  it('should be properly converted by MCP error mapper', () => {
    const error = new ToolNotImplementedError(
      'Unknown tool',
      'unknown_tool',
      {
        availableTools: ['tool1', 'tool2'],
        suggestedAlternatives: ['tool1']
      }
    );

    const mcpError = convertToMcpError(error);
    
    expect(mcpError.code).toBe(-32601); // MethodNotFound
    expect(mcpError.message).toBe('Unknown tool');
    expect(mcpError.data).toMatchObject({
      toolName: 'unknown_tool',
      availableTools: ['tool1', 'tool2'],
      suggestedAlternatives: ['tool1']
    });
  });
});

describe('ToolValidationError', () => {
  it('should create validation error with details', () => {
    const validationErrors = {
      field1: 'Required',
      field2: 'Invalid format'
    };

    const error = new ToolValidationError(
      'Validation failed',
      'test_tool',
      validationErrors
    );

    expect(error.message).toBe('Validation failed');
    expect(error.toolName).toBe('test_tool');
    expect(error.validationErrors).toEqual(validationErrors);
    expect(error.code).toBe(ErrorCode.VALIDATION);
    expect(error.severity).toBe('medium');
  });

  it('should be converted to MCP InvalidParams error', () => {
    const error = new ToolValidationError(
      'Input validation failed',
      'build_image',
      { context: 'Missing required field' }
    );

    const mcpError = convertToMcpError(error);
    
    expect(mcpError.code).toBe(-32602); // InvalidParams
    expect(mcpError.message).toBe('Input validation failed');
    expect(mcpError.data).toMatchObject({
      toolName: 'build_image',
      validationErrors: { context: 'Missing required field' }
    });
  });
});

describe('ToolExecutionError', () => {
  it('should create execution error with context', () => {
    const originalError = new Error('Docker daemon not running');
    
    const error = new ToolExecutionError(
      'Failed to build image',
      'build_image',
      'docker_build',
      originalError
    );

    expect(error.message).toBe('Failed to build image');
    expect(error.toolName).toBe('build_image');
    expect(error.operation).toBe('docker_build');
    expect(error.originalError).toBe(originalError);
    expect(error.code).toBe(ErrorCode.TOOL_ERROR);
    expect(error.severity).toBe('high');
  });

  it('should be converted to MCP InternalError', () => {
    const error = new ToolExecutionError(
      'Scan failed',
      'scan_image',
      'trivy_scan'
    );

    const mcpError = convertToMcpError(error);
    
    expect(mcpError.code).toBe(-32603); // InternalError
    expect(mcpError.message).toBe('Scan failed');
    expect(mcpError.data).toMatchObject({
      toolName: 'scan_image',
      operation: 'trivy_scan'
    });
  });
});

describe('suggestAlternativeTools', () => {
  const availableTools = [
    'analyze_repository',
    'build_image',
    'scan_image',
    'generate_dockerfile',
    'generate_k8s_manifests',
    'deploy_application'
  ];

  it('should suggest tools with exact substring match', () => {
    const suggestions = suggestAlternativeTools('analyze', availableTools);
    expect(suggestions).toContain('analyze_repository');
  });

  it('should suggest tools with matching prefix', () => {
    const suggestions = suggestAlternativeTools('build_container', availableTools);
    expect(suggestions).toContain('build_image');
  });

  it('should suggest tools that contain the search term', () => {
    const suggestions = suggestAlternativeTools('image', availableTools);
    expect(suggestions).toContain('build_image');
    expect(suggestions).toContain('scan_image');
  });

  it('should limit suggestions to 3', () => {
    const suggestions = suggestAlternativeTools('generate', availableTools);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions).toContain('generate_dockerfile');
    expect(suggestions).toContain('generate_k8s_manifests');
  });

  it('should return empty array for no matches', () => {
    const suggestions = suggestAlternativeTools('xyz_unknown', availableTools);
    expect(suggestions).toEqual([]);
  });
});

describe('Tool Manifest Integration', () => {
  it('should correctly identify implemented tools', () => {
    expect(isToolImplemented('analyze_repository')).toBe(true);
    expect(isToolImplemented('build_image')).toBe(true);
    expect(isToolImplemented('scan_image')).toBe(true);
  });

  it('should correctly identify unimplemented tools', () => {
    expect(isToolImplemented('unknown_tool')).toBe(false);
    expect(isToolImplemented('future_tool')).toBe(false);
  });

  it('should return tool info with status', () => {
    const info = getToolInfo('scan_image');
    expect(info).toBeDefined();
    expect(info?.status).toBe(ToolStatus.IMPLEMENTED);
    expect(info?.category).toBe('docker');
    expect(info?.notes).toContain('Trivy');
  });

  it('should return undefined for unknown tools', () => {
    const info = getToolInfo('nonexistent_tool');
    expect(info).toBeUndefined();
  });

  it('should list all implemented tools', () => {
    const implementedTools = getImplementedTools();
    expect(implementedTools).toBeInstanceOf(Array);
    expect(implementedTools).toContain('analyze_repository');
    expect(implementedTools).toContain('build_image');
    expect(implementedTools).toContain('scan_image');
    expect(implementedTools).toContain('deploy_application');
  });
});

describe('Tool Registry Error Handling', () => {
  let registry: ToolRegistry;
  let mockServices: any;

  beforeEach(() => {
    mockServices = {
      docker: { isAvailable: jest.fn(() => true) },
      kubernetes: { isAvailable: jest.fn(() => false) },
      ai: { isAvailable: jest.fn(() => true) },
      session: { 
        get: jest.fn(),
        update: jest.fn(),
        create: jest.fn()
      },
      events: {
        emit: jest.fn(),
        on: jest.fn()
      }
    };

    registry = new ToolRegistry(mockServices, logger);
  });

  it('should throw ToolNotImplementedError for unknown tools', async () => {
    const request = {
      name: 'unknown_tool',
      arguments: { param: 'value' }
    };

    await expect(registry.handleToolCall(request)).rejects.toThrow(ToolNotImplementedError);
  });

  it('should provide suggestions for similar tool names', async () => {
    const request = {
      name: 'build_container',
      arguments: {}
    };

    try {
      await registry.handleToolCall(request);
      fail('Should have thrown ToolNotImplementedError');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolNotImplementedError);
      const toolError = error as ToolNotImplementedError;
      expect(toolError.suggestedAlternatives).toContain('build_image');
    }
  });

  it('should include tool status in error message', async () => {
    // Mock a tool that exists in manifest but not implemented
    const mockGetToolInfo = jest.fn(() => ({
      name: 'future_tool',
      status: ToolStatus.STUB,
      category: 'test',
      description: 'Future feature',
      notes: 'Coming soon'
    }));

    // Replace the actual function temporarily
    const originalGetToolInfo = getToolInfo;
    (global as any).getToolInfo = mockGetToolInfo;

    const request = {
      name: 'future_tool',
      arguments: {}
    };

    try {
      await registry.handleToolCall(request);
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolNotImplementedError);
      const toolError = error as ToolNotImplementedError;
      expect(toolError.message).toContain('Status: stub');
      expect(toolError.message).toContain('Coming soon');
    } finally {
      (global as any).getToolInfo = originalGetToolInfo;
    }
  });
});

describe('Error Recovery Scenarios', () => {
  it('should handle validation errors with detailed information', () => {
    const validationError = new ToolValidationError(
      'Required parameters missing',
      'deploy_application',
      {
        namespace: 'Required field',
        manifest: 'Invalid YAML format'
      }
    );

    const mcpError = convertToMcpError(validationError);
    
    expect(mcpError.code).toBe(-32602);
    expect(mcpError.data).toMatchObject({
      toolName: 'deploy_application',
      validationErrors: {
        namespace: 'Required field',
        manifest: 'Invalid YAML format'
      }
    });
  });

  it('should handle execution errors with operation context', () => {
    const executionError = new ToolExecutionError(
      'Kubernetes API unreachable',
      'verify_deployment',
      'health_check',
      new Error('Connection timeout')
    );

    const mcpError = convertToMcpError(executionError);
    
    expect(mcpError.code).toBe(-32603);
    expect(mcpError.data).toMatchObject({
      toolName: 'verify_deployment',
      operation: 'health_check'
    });
  });

  it('should provide actionable error messages', () => {
    const error = new ToolNotImplementedError(
      'Tool "build" is not implemented',
      'build',
      {
        availableTools: getImplementedTools(),
        suggestedAlternatives: ['build_image']
      }
    );

    expect(error.suggestedAlternatives).toContain('build_image');
    expect(error.availableTools).toContain('analyze_repository');
    expect(error.availableTools?.length).toBeGreaterThan(10);
  });
});