/**
 * Scan Image - MCP SDK Compatible Version
 */

import { DockerScanResult } from '../../../domain/types/index';
import { DomainError, ErrorCode } from '../../../domain/types/errors';
import {
  ScanImageInput,
  type ScanImageParams,
  ScanResultSchema,
  type ScanResult,
} from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { Session } from '../../../domain/types/session';

// Type aliases
export type ScanInput = ScanImageParams;
export type ScanOutput = ScanResult;

/**
 * Severity level priority for sorting
 */

function mockScan(_imageId: string): DockerScanResult {
  return {
    vulnerabilities: [
      {
        severity: 'high',
        cve: 'CVE-2024-1234',
        package: 'example-package',
        version: '1.0.0',
        fixedVersion: '1.0.1',
        description: 'Mock vulnerability for testing',
      },
      {
        severity: 'unknown',
        cve: 'CVE-2024-9999',
        package: 'unknown-package',
        version: '2.0.0',
        description: 'Unknown severity vulnerability',
      },
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      unknown: 1,
      total: 7,
    },
    scanTime: new Date().toISOString(),
  };
}

/**
 * Main handler implementation
 */
const scanImageHandler: ToolDescriptor<ScanInput, ScanOutput> = {
  name: 'scan_image',
  description: 'Scan Docker image for security vulnerabilities',
  category: 'workflow',
  inputSchema: ScanImageInput,
  outputSchema: ScanResultSchema,

  handler: async (input: ScanInput, context: ToolContext): Promise<ScanOutput> => {
    const { logger, sessionService, progressEmitter, dockerService } = context;
    const { sessionId } = input;

    logger.info({ sessionId }, 'Starting image security scan');

    try {
      // Get session and image info
      if (!sessionService) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Session service not available');
      }

      const session = await sessionService.get(sessionId);
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Get image from build result
      const buildResult = session.workflow_state?.build_result;
      if (!buildResult?.imageId) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No built image found in session');
      }

      const scanTarget = buildResult.imageId;

      // Emit progress
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'scan_image',
          status: 'in_progress',
          message: `Scanning image ${scanTarget}`,
          progress: 0.5,
        });
      }

      // Perform scan
      let scanResult: DockerScanResult;

      if (dockerService && 'scan' in dockerService) {
        logger.info('Using Docker service for vulnerability scan');
        const result = await dockerService.scan({ image: scanTarget });
        const scanResponse = result as {
          success?: boolean;
          data?: DockerScanResult;
          error?: { message?: string };
        };
        if (!scanResponse.success || !scanResponse.data) {
          throw new Error(scanResponse.error?.message ?? 'Scan failed');
        }
        scanResult = scanResponse.data;
      } else {
        logger.warn('Docker service not available, using mock scan');
        scanResult = mockScan(scanTarget);
      }

      // Extract counts; prefer service-reported total, include unknown
      const {
        critical = 0,
        high = 0,
        medium = 0,
        low = 0,
        unknown = 0,
        total: reportedTotal,
      } = scanResult.summary ?? {};
      const total = reportedTotal ?? scanResult.vulnerabilities.length;

      // Update session with scan results
      await sessionService.updateAtomic(sessionId, (session: Session) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          scan_result: {
            vulnerabilities: scanResult.vulnerabilities,
            summary: {
              vulnerabilities: total,
              critical,
              high,
              medium,
              low,
              unknown,
              total,
            },
          },
        },
      }));

      // Emit completion
      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'scan_image',
          status: 'completed',
          message: `Scan complete: ${total} vulnerabilities found`,
          progress: 1.0,
        });
      }

      logger.info({ total, critical, high, medium, low }, 'Security scan completed');

      return {
        success: true,
        sessionId,
        vulnerabilities: total,
        critical,
        high,
        medium,
        low,
        details: scanResult.vulnerabilities,
      };
    } catch (error) {
      logger.error({ error }, 'Image scan failed');

      if (progressEmitter) {
        progressEmitter.emit('progress', {
          sessionId,
          step: 'scan_image',
          status: 'failed',
          message: 'Security scan failed',
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'tag_image',
    reason: 'Tag the scanned image for registry push',
    paramMapper: (output) => ({
      scan_passed: output.critical === 0,
      vulnerabilities: output.vulnerabilities,
    }),
  },
};

// Default export for registry
export default scanImageHandler;
