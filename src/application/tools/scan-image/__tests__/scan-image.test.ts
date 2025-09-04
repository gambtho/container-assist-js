/**
 * Unit tests for scan-image tool
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import scanImageHandler from '../index';
import type { ScanImageParams, ScanResult } from '../../schemas';
import type { Session } from '../../../../domain/types/session';
import { createMockToolContext } from '../../__tests__/shared/test-utils';
import { createMockDockerService } from '../../__tests__/shared/docker-mocks';

describe('scan-image tool', () => {
  let mockContext: ReturnType<typeof createMockToolContext>;
  let mockDockerService: ReturnType<typeof createMockDockerService>;
  let mockSession: Session;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock context
    mockContext = createMockToolContext();
    mockDockerService = createMockDockerService();

    // Setup Docker service
    mockContext.dockerService = mockDockerService;

    // Create mock session with build result
    mockSession = {
      id: 'test-session-123',
      project_name: 'test-app',
      metadata: {
        projectName: 'test-app',
      },
      workflow_state: {
        build_result: {
          imageId: 'sha256:abc123def456',
          tags: ['test-app:latest'],
          size: 100000000,
        },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Setup session service mock
    mockContext.sessionService = {
      get: jest.fn().mockResolvedValue(mockSession),
      updateAtomic: jest.fn().mockResolvedValue(undefined),
    };

    // Setup progress emitter
    mockContext.progressEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Tool descriptor configuration', () => {
    it('should have correct tool configuration', () => {
      expect(scanImageHandler.name).toBe('scan_image');
      expect(scanImageHandler.description).toContain('security vulnerabilities');
      expect(scanImageHandler.category).toBe('workflow');
      expect(scanImageHandler.inputSchema).toBeDefined();
      expect(scanImageHandler.outputSchema).toBeDefined();
      expect(scanImageHandler.handler).toBeInstanceOf(Function);
    });

    it('should have correct chain hint configuration', () => {
      expect(scanImageHandler.chainHint).toBeDefined();
      expect(scanImageHandler.chainHint?.nextTool).toBe('tag_image');
      expect(scanImageHandler.chainHint?.reason).toContain('Tag the scanned image');
      expect(scanImageHandler.chainHint?.paramMapper).toBeInstanceOf(Function);
    });

    it('should map output parameters correctly for chain hint', () => {
      const sampleOutput: ScanResult = {
        success: true,
        sessionId: 'test-session-123',
        vulnerabilities: 5,
        critical: 0,
        high: 1,
        medium: 2,
        low: 2,
      };

      const mapped = scanImageHandler.chainHint?.paramMapper?.(sampleOutput);
      expect(mapped).toEqual({
        scan_passed: true, // No critical vulnerabilities
        vulnerabilities: 5,
      });
    });

    it('should indicate scan failure when critical vulnerabilities exist', () => {
      const sampleOutput: ScanResult = {
        success: true,
        sessionId: 'test-session-123',
        vulnerabilities: 3,
        critical: 2,
        high: 1,
        medium: 0,
        low: 0,
      };

      const mapped = scanImageHandler.chainHint?.paramMapper?.(sampleOutput);
      expect(mapped).toEqual({
        scan_passed: false, // Has critical vulnerabilities
        vulnerabilities: 3,
      });
    });
  });

  describe('Input validation', () => {
    it('should validate required session ID', () => {
      const invalidInput = {} as ScanImageParams;

      expect(() => {
        scanImageHandler.inputSchema.parse(invalidInput);
      }).toThrow();
    });

    it('should accept valid input with session ID', () => {
      const validInput: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const parsed = scanImageHandler.inputSchema.parse(validInput);
      expect(parsed).toEqual(validInput);
    });
  });

  describe('Session validation', () => {
    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(null),
        updateAtomic: jest.fn(),
      };

      const input: ScanImageParams = {
        sessionId: 'non-existent-session',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });

    it('should fail when no build result is available', async () => {
      const sessionWithoutBuild: Session = {
        ...mockSession,
        workflow_state: {},
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sessionWithoutBuild),
        updateAtomic: jest.fn(),
      };

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow(
        'No built image found in session',
      );
    });

    it('should fail when build result has no image ID', async () => {
      const sessionWithoutImageId: Session = {
        ...mockSession,
        workflow_state: {
          build_result: {
            tags: ['test-app:latest'],
            size: 100000000,
          },
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sessionWithoutImageId),
        updateAtomic: jest.fn(),
      };

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow(
        'No built image found in session',
      );
    });
  });

  describe('Docker scan execution', () => {
    it('should successfully scan image using Docker service', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(typeof result.vulnerabilities).toBe('number');
      expect(typeof result.critical).toBe('number');
      expect(typeof result.high).toBe('number');
      expect(typeof result.medium).toBe('number');
      expect(typeof result.low).toBe('number');

      expect(mockDockerService.scan).toHaveBeenCalledWith({ image: 'sha256:abc123def456' });
    });

    it('should handle clean image (no vulnerabilities)', async () => {
      // Mock clean scan result
      mockDockerService.scan.mockResolvedValue({
        success: true,
        data: {
          vulnerabilities: [],
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            unknown: 0,
            total: 0,
          },
          scanTime: new Date().toISOString(),
        },
      });

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.vulnerabilities).toBe(0);
      expect(result.critical).toBe(0);
      expect(result.high).toBe(0);
      expect(result.medium).toBe(0);
      expect(result.low).toBe(0);
    });

    it('should handle image with various vulnerability severities', async () => {
      // Mock scan result with mixed vulnerabilities
      mockDockerService.scan.mockResolvedValue({
        success: true,
        data: {
          vulnerabilities: [
            {
              severity: 'critical',
              cve: 'CVE-2024-0001',
              package: 'critical-package',
              version: '1.0.0',
              fixedVersion: '1.0.1',
              description: 'Critical vulnerability',
            },
            {
              severity: 'high',
              cve: 'CVE-2024-0002',
              package: 'high-package',
              version: '2.0.0',
              fixedVersion: '2.0.1',
              description: 'High severity vulnerability',
            },
            {
              severity: 'medium',
              cve: 'CVE-2024-0003',
              package: 'medium-package',
              version: '3.0.0',
              description: 'Medium severity vulnerability',
            },
            {
              severity: 'low',
              cve: 'CVE-2024-0004',
              package: 'low-package',
              version: '4.0.0',
              description: 'Low severity vulnerability',
            },
          ],
          summary: {
            critical: 1,
            high: 1,
            medium: 1,
            low: 1,
            unknown: 0,
            total: 4,
          },
          scanTime: new Date().toISOString(),
        },
      });

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.vulnerabilities).toBe(4);
      expect(result.critical).toBe(1);
      expect(result.high).toBe(1);
      expect(result.medium).toBe(1);
      expect(result.low).toBe(1);
      expect(result.details).toHaveLength(4);
    });

    it('should fall back to mock scan when Docker service unavailable', async () => {
      mockContext.dockerService = undefined;

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Docker service not available, using mock scan',
      );

      // Mock scan always returns some vulnerabilities
      expect(result.vulnerabilities).toBeGreaterThan(0);
    });

    it('should fall back to mock scan when Docker service has no scan method', async () => {
      // Remove scan method from Docker service
      const dockerServiceWithoutScan = {
        build: jest.fn(),
        tag: jest.fn(),
        push: jest.fn(),
        // No scan method
      };
      mockContext.dockerService = dockerServiceWithoutScan;

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Docker service not available, using mock scan',
      );
    });
  });

  describe('Scan error handling', () => {
    it('should handle Docker scan service failures', async () => {
      mockDockerService.scan.mockResolvedValue({
        success: false,
        error: 'Trivy scan failed',
      });

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Trivy scan failed',
      );

      expect(mockContext.logger.error).toHaveBeenCalled();
    });

    it('should handle scan service exceptions', async () => {
      mockDockerService.scan.mockRejectedValue(new Error('Network timeout'));

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow('Network timeout');

      expect(mockContext.logger.error).toHaveBeenCalled();
    });

    it('should handle malformed scan results', async () => {
      mockDockerService.scan.mockResolvedValue({
        success: true,
        data: null, // Malformed response
      });

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow('Scan failed');
    });

    it('should emit failure progress on error', async () => {
      mockDockerService.scan.mockRejectedValue(new Error('Scan failed'));

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow('Scan failed');

      const calls = (mockContext.progressEmitter?.emit as jest.Mock).mock.calls;
      const failureCall = calls.find((call) => call[0].status === 'failed');
      expect(failureCall).toBeDefined();
      expect(failureCall[0]).toMatchObject({
        sessionId: 'test-session-123',
        step: 'scan_image',
        status: 'failed',
        message: 'Security scan failed',
      });
    });
  });

  describe('Progress tracking', () => {
    it('should emit progress updates during scan', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockEmit = mockContext.progressEmitter?.emit as jest.Mock;
      expect(mockEmit).toHaveBeenCalledTimes(2);

      // Verify progress sequence
      const calls = mockEmit.mock.calls;
      expect(calls[0][0]).toMatchObject({
        sessionId: 'test-session-123',
        step: 'scan_image',
        status: 'in_progress',
        message: expect.stringContaining('Scanning image'),
        progress: 0.5,
      });

      expect(calls[1][0]).toMatchObject({
        sessionId: 'test-session-123',
        step: 'scan_image',
        status: 'completed',
        message: expect.stringContaining('vulnerabilities found'),
        progress: 1.0,
      });
    });

    it('should work without progress emitter', async () => {
      mockContext.progressEmitter = undefined;

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('Session updates', () => {
    it('should update session with scan results', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await scanImageHandler.handler(input, mockContext);

      expect(mockContext.sessionService?.updateAtomic).toHaveBeenCalledWith(
        'test-session-123',
        expect.any(Function),
      );

      // Verify the session update includes scan_result
      const updateFunction = jest.mocked(mockContext.sessionService!.updateAtomic).mock.calls[0][1];
      const updatedSession = updateFunction(mockSession);

      expect(updatedSession.workflow_state.scan_result).toBeDefined();
      expect(updatedSession.workflow_state.scan_result.vulnerabilities).toBeDefined();
      expect(updatedSession.workflow_state.scan_result.critical).toBeDefined();
      expect(updatedSession.workflow_state.scan_result.details).toBeDefined();
    });

    it('should handle session update failures gracefully', async () => {
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(mockSession),
        updateAtomic: jest.fn().mockRejectedValue(new Error('Session update failed')),
      };

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(scanImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session update failed',
      );
    });
  });

  describe('Mock scan functionality', () => {
    it('should provide consistent mock scan results', async () => {
      mockContext.dockerService = undefined;

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result1 = await scanImageHandler.handler(input, mockContext);

      // Reset mocks and run again
      jest.clearAllMocks();
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(mockSession),
        updateAtomic: jest.fn().mockResolvedValue(undefined),
      };
      mockContext.progressEmitter = {
        emit: jest.fn().mockResolvedValue(undefined),
      };

      const result2 = await scanImageHandler.handler(input, mockContext);

      // Mock should return consistent structure
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(typeof result1.vulnerabilities).toBe('number');
      expect(typeof result2.vulnerabilities).toBe('number');
    });
  });

  describe('Vulnerability severity handling', () => {
    it('should handle unknown severity vulnerabilities', async () => {
      mockDockerService.scan.mockResolvedValue({
        success: true,
        data: {
          vulnerabilities: [
            {
              severity: 'unknown',
              cve: 'CVE-2024-UNKNOWN',
              package: 'unknown-package',
              version: '1.0.0',
              description: 'Unknown severity vulnerability',
            },
          ],
          summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            unknown: 1,
            total: 1,
          },
          scanTime: new Date().toISOString(),
        },
      });

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.vulnerabilities).toBe(0); // Unknown not counted in total
      expect(result.details).toHaveLength(1);
    });

    it('should prioritize critical vulnerabilities in chain hint', () => {
      const criticalResult: ScanResult = {
        success: true,
        sessionId: 'test-session-123',
        vulnerabilities: 10,
        critical: 5,
        high: 3,
        medium: 2,
        low: 0,
      };

      const mapped = scanImageHandler.chainHint?.paramMapper?.(criticalResult);
      expect(mapped?.scan_passed).toBe(false); // Critical vulnerabilities fail scan
    });

    it('should pass scan when only low/medium vulnerabilities exist', () => {
      const lowRiskResult: ScanResult = {
        success: true,
        sessionId: 'test-session-123',
        vulnerabilities: 5,
        critical: 0,
        high: 0,
        medium: 3,
        low: 2,
      };

      const mapped = scanImageHandler.chainHint?.paramMapper?.(lowRiskResult);
      expect(mapped?.scan_passed).toBe(true); // No critical vulnerabilities
    });
  });

  describe('Output validation', () => {
    it('should produce output that matches the schema', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      // Validate against output schema
      expect(() => scanImageHandler.outputSchema.parse(result)).not.toThrow();
    });

    it('should include all required fields', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(typeof result.vulnerabilities).toBe('number');
      expect(typeof result.critical).toBe('number');
      expect(typeof result.high).toBe('number');
      expect(typeof result.medium).toBe('number');
      expect(typeof result.low).toBe('number');

      // Optional fields
      if (result.details !== undefined) {
        expect(result.details).toBeInstanceOf(Array);
      }
    });

    it('should handle optional details field correctly', async () => {
      // Test with details
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      if (result.details !== undefined) {
        expect(result.details).toBeInstanceOf(Array);
        result.details.forEach((vulnerability) => {
          expect(vulnerability).toHaveProperty('severity');
          expect(vulnerability).toHaveProperty('cve');
          expect(vulnerability).toHaveProperty('package');
        });
      }
    });
  });

  describe('Performance considerations', () => {
    it('should complete scan within reasonable time', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const startTime = Date.now();
      const result = await scanImageHandler.handler(input, mockContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle large vulnerability lists efficiently', async () => {
      // Mock scan with many vulnerabilities
      const manyVulnerabilities = Array.from({ length: 1000 }, (_, i) => ({
        severity: ['critical', 'high', 'medium', 'low'][i % 4],
        cve: `CVE-2024-${String(i).padStart(4, '0')}`,
        package: `package-${i}`,
        version: '1.0.0',
        description: `Vulnerability ${i}`,
      }));

      mockDockerService.scan.mockResolvedValue({
        success: true,
        data: {
          vulnerabilities: manyVulnerabilities,
          summary: {
            critical: 250,
            high: 250,
            medium: 250,
            low: 250,
            unknown: 0,
            total: 1000,
          },
          scanTime: new Date().toISOString(),
        },
      });

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const startTime = Date.now();
      const result = await scanImageHandler.handler(input, mockContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.vulnerabilities).toBe(1000);
      expect(duration).toBeLessThan(10000); // Should handle large results efficiently
    });
  });

  describe('Logging', () => {
    it('should log scan progress and results', async () => {
      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await scanImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        { sessionId: 'test-session-123' },
        'Starting image security scan',
      );

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Using Docker service for vulnerability scan',
      );

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          total: expect.any(Number),
          critical: expect.any(Number),
          high: expect.any(Number),
          medium: expect.any(Number),
          low: expect.any(Number),
        }),
        'Security scan completed',
      );
    });

    it('should log errors appropriately', async () => {
      mockDockerService.scan.mockRejectedValue(new Error('Test scan error'));

      const input: ScanImageParams = {
        sessionId: 'test-session-123',
      };

      try {
        await scanImageHandler.handler(input, mockContext);
      } catch {
        expect(mockContext.logger.error).toHaveBeenCalledWith(
          { error: expect.any(Error) },
          'Image scan failed',
        );
      }
    });
  });
});
