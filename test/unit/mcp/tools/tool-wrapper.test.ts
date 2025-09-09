/**
 * Tests for Tool Wrapper Module
 */

import { wrapTool, formatStandardResponse } from '../../../../src/mcp/tools/tool-wrapper';
import { Success, Failure } from '../../../../src/domain/types';
import type { ExtendedToolContext } from '../../../../src/tools/shared-types';

describe('Tool Wrapper', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  } as any;

  const mockContext: ExtendedToolContext = {
    progress: jest.fn().mockResolvedValue(undefined),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatStandardResponse', () => {
    it('should format successful response correctly', () => {
      const result = Success({ test: 'data' });
      const formatted = formatStandardResponse(result, 'session-123');

      expect(formatted.ok).toBe(true);
      if (formatted.ok) {
        expect(formatted.value.ok).toBe(true);
        expect(formatted.value.sessionId).toBe('session-123');
        expect(formatted.value.data).toEqual({ test: 'data' });
        expect(formatted.value.message).toBe('Operation completed successfully');
      }
    });

    it('should format successful response without sessionId', () => {
      const result = Success({ test: 'data' });
      const formatted = formatStandardResponse(result);

      expect(formatted.ok).toBe(true);
      if (formatted.ok) {
        expect(formatted.value.ok).toBe(true);
        expect(formatted.value).not.toHaveProperty('sessionId');
        expect(formatted.value.data).toEqual({ test: 'data' });
      }
    });

    it('should format failure response correctly', () => {
      const result = Failure('Test error');
      const formatted = formatStandardResponse(result, 'session-123');

      expect(formatted.ok).toBe(false);
      if (!formatted.ok) {
        expect(formatted.error).toBe('Test error');
      }
    });
  });

  describe('wrapTool', () => {
    it('should execute tool successfully with all stages', async () => {
      const mockImplementation = jest.fn().mockResolvedValue(Success({ result: 'test' }));
      const wrappedTool = wrapTool('test-tool', mockImplementation);

      const result = await wrappedTool({ param: 'value' }, mockContext);

      expect(result.ok).toBe(true);
      expect(mockImplementation).toHaveBeenCalledWith(
        { param: 'value' },
        mockContext,
        expect.any(Object) // logger
      );
      
      // Verify progress stages were called
      expect(mockContext.progress).toHaveBeenCalledWith('Validating', 10);
      expect(mockContext.progress).toHaveBeenCalledWith('Executing', 50);
      expect(mockContext.progress).toHaveBeenCalledWith('Finalizing', 90);
      expect(mockContext.progress).toHaveBeenCalledWith('Complete', 100);
    });

    it('should handle tool implementation failure', async () => {
      const mockImplementation = jest.fn().mockResolvedValue(Failure('Tool failed'));
      const wrappedTool = wrapTool('test-tool', mockImplementation);

      const result = await wrappedTool({ param: 'value' }, mockContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Tool failed');
      }
    });

    it('should handle implementation throwing error', async () => {
      const mockImplementation = jest.fn().mockRejectedValue(new Error('Unexpected error'));
      const wrappedTool = wrapTool('test-tool', mockImplementation);

      const result = await wrappedTool({ param: 'value' }, mockContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('test-tool failed: Unexpected error');
      }
    });

    it('should handle invalid parameters', async () => {
      const mockImplementation = jest.fn();
      const wrappedTool = wrapTool('test-tool', mockImplementation);

      const result = await wrappedTool(null as any, mockContext);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('test-tool: Invalid parameters provided');
      }
      expect(mockImplementation).not.toHaveBeenCalled();
    });

    it('should extract sessionId from result', async () => {
      const mockImplementation = jest.fn().mockResolvedValue(
        Success({ sessionId: 'extracted-123', data: 'test' })
      );
      const wrappedTool = wrapTool('test-tool', mockImplementation);

      const result = await wrappedTool({ param: 'value' }, mockContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('extracted-123');
      }
    });

    it('should work without progress reporter', async () => {
      const mockImplementation = jest.fn().mockResolvedValue(Success({ result: 'test' }));
      const wrappedTool = wrapTool('test-tool', mockImplementation);
      const contextWithoutProgress = {} as ExtendedToolContext;

      const result = await wrappedTool({ param: 'value' }, contextWithoutProgress);

      expect(result.ok).toBe(true);
      expect(mockImplementation).toHaveBeenCalled();
    });
  });
});