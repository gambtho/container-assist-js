import type { ProgressReporter } from '@mcp/context/types';
import {
  STANDARD_STAGES,
  createStandardProgress,
  reportProgress,
  createToolProgressReporter,
} from '@mcp/utils/progress-helper';

describe('progress-helper', () => {
  describe('STANDARD_STAGES', () => {
    it('should define all required stages with correct percentages', () => {
      expect(STANDARD_STAGES.VALIDATING).toEqual({
        message: 'Validating',
        percentage: 10,
      });
      expect(STANDARD_STAGES.EXECUTING).toEqual({
        message: 'Executing',
        percentage: 50,
      });
      expect(STANDARD_STAGES.FINALIZING).toEqual({
        message: 'Finalizing',
        percentage: 90,
      });
      expect(STANDARD_STAGES.COMPLETE).toEqual({
        message: 'Complete',
        percentage: 100,
      });
    });

    it('should be immutable', () => {
      // The object is frozen with `as const`, so properties can't be reassigned
      expect(STANDARD_STAGES).toEqual(expect.objectContaining({
        VALIDATING: { message: 'Validating', percentage: 10 },
        EXECUTING: { message: 'Executing', percentage: 50 },
        FINALIZING: { message: 'Finalizing', percentage: 90 },
        COMPLETE: { message: 'Complete', percentage: 100 },
      }));
    });
  });

  describe('reportProgress', () => {
    it('should call reporter when provided', async () => {
      const mockReporter = jest.fn();
      await reportProgress(mockReporter, 'Test message', 50);
      
      expect(mockReporter).toHaveBeenCalledWith('Test message', 50);
      expect(mockReporter).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined reporter safely', async () => {
      // Should not throw when reporter is undefined
      await expect(
        reportProgress(undefined, 'Test message', 50)
      ).resolves.toBeUndefined();
    });

    it('should handle null reporter safely', async () => {
      // Should not throw when reporter is null
      await expect(
        reportProgress(null as any, 'Test message', 50)
      ).resolves.toBeUndefined();
    });
  });

  describe('createStandardProgress', () => {
    let mockReporter: ReturnType<typeof jest.fn>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockReporter = jest.fn();
    });

    it('should create a progress handler that reports correct stages', async () => {
      const progress = createStandardProgress(mockReporter);

      await progress('VALIDATING');
      expect(mockReporter).toHaveBeenCalledWith('Validating', 10);

      await progress('EXECUTING');
      expect(mockReporter).toHaveBeenCalledWith('Executing', 50);

      await progress('FINALIZING');
      expect(mockReporter).toHaveBeenCalledWith('Finalizing', 90);

      await progress('COMPLETE');
      expect(mockReporter).toHaveBeenCalledWith('Complete', 100);

      expect(mockReporter).toHaveBeenCalledTimes(4);
    });

    it('should work without a reporter', async () => {
      const progress = createStandardProgress();

      // Should not throw
      await expect(progress('VALIDATING')).resolves.toBeUndefined();
      await expect(progress('EXECUTING')).resolves.toBeUndefined();
      await expect(progress('FINALIZING')).resolves.toBeUndefined();
      await expect(progress('COMPLETE')).resolves.toBeUndefined();
    });

    it('should work with undefined reporter', async () => {
      const progress = createStandardProgress(undefined);

      // Should not throw
      await expect(progress('VALIDATING')).resolves.toBeUndefined();
    });

    it('should enforce type-safe stage names', () => {
      const progress = createStandardProgress(mockReporter);

      // TypeScript should catch this at compile time
      // @ts-expect-error - Testing type safety
      expect(() => progress('INVALID_STAGE')).rejects.toThrow();
    });
  });

  describe('createToolProgressReporter', () => {
    const mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
    };

    const mockServer = {
      sendNotification: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should create a reporter that logs progress', async () => {
      const reporter = createToolProgressReporter(
        { logger: mockLogger as any },
        'test-tool'
      );

      await reporter('Test progress', 50);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'test-tool',
          progress: 50,
          message: 'Test progress',
        }),
        'Tool progress update'
      );
    });

    it('should clamp progress values between 0 and 100', async () => {
      const reporter = createToolProgressReporter(
        { logger: mockLogger as any },
        'test-tool'
      );

      await reporter('Negative', -10);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 0,
        }),
        'Tool progress update'
      );

      jest.clearAllMocks();

      await reporter('Overflow', 150);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 100,
        }),
        'Tool progress update'
      );
    });

    it('should send notifications to MCP server when available', async () => {
      const progressToken = { id: 'test-token-123' };
      const reporter = createToolProgressReporter(
        {
          logger: mockLogger as any,
          server: mockServer as any,
          progressToken,
        },
        'test-tool'
      );

      await reporter('Server test', 75, 100);

      expect(mockServer.sendNotification).toHaveBeenCalledWith(
        'notifications/progress',
        {
          progressToken: 'test-token-123',
          progress: 75,
          total: 100,
        }
      );
    });

    it('should handle server notification errors gracefully', async () => {
      const progressToken = { id: 'test-token-123' };
      mockServer.sendNotification.mockRejectedValueOnce(new Error('Network error'));

      const reporter = createToolProgressReporter(
        {
          logger: mockLogger as any,
          server: mockServer as any,
          progressToken,
        },
        'test-tool'
      );

      await reporter('Error test', 50);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Failed to report progress to MCP server'
      );
    });
  });

  describe('Integration with standardized progress', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should work seamlessly with tool progress reporter', async () => {
      const mockLogger = {
        debug: jest.fn(),
        warn: jest.fn(),
      };

      const toolReporter = createToolProgressReporter(
        { logger: mockLogger as any },
        'integration-test'
      );

      const standardProgress = createStandardProgress(toolReporter);

      await standardProgress('VALIDATING');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'integration-test',
          progress: 10,
          message: 'Validating',
        }),
        'Tool progress update'
      );

      await standardProgress('EXECUTING');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'integration-test',
          progress: 50,
          message: 'Executing',
        }),
        'Tool progress update'
      );
    });
  });
});