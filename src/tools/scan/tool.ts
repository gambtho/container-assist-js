/**
 * Scan Image Tool - Standardized Implementation
 *
 * Scans Docker images for security vulnerabilities
 * Uses standardized helpers for consistency
 */

import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession, updateSessionData } from '@mcp/tools/session-helpers';
import type { ExtendedToolContext } from '../shared-types';
import { createSecurityScanner } from '../../lib/scanner';
import { createTimer, type Logger } from '../../lib/logger';
import { Success, Failure, type Result } from '../../domain/types';
import type { ScanImageParams } from './schema';

interface DockerScanResult {
  vulnerabilities?: Array<{
    id?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    package?: string;
    version?: string;
    description?: string;
    fixedVersion?: string;
  }>;
  summary?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown?: number;
    total: number;
  };
  scanTime?: string;
  metadata?: {
    image: string;
  };
}

export interface ScanImageResult {
  success: boolean;
  sessionId: string;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
    total: number;
  };
  scanTime: string;
  passed: boolean;
}

/**
 * Core scan image implementation
 */
async function scanImageImpl(
  params: ScanImageParams,
  context: ExtendedToolContext,
  logger: Logger,
): Promise<Result<ScanImageResult>> {
  const timer = createTimer(logger, 'scan-image');

  try {
    const { scanner = 'trivy', severity } = params;

    // Map new severity parameter to final threshold
    const finalSeverityThreshold = severity
      ? (severity.toLowerCase() as 'low' | 'medium' | 'high' | 'critical')
      : 'high';

    logger.info(
      { scanner, severityThreshold: finalSeverityThreshold },
      'Starting image security scan',
    );

    // Resolve session (now always optional)
    const sessionResult = await resolveSession(logger, context, {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      defaultIdHint: 'scan-image',
      createIfNotExists: true,
    });

    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const { id: sessionId, state: session } = sessionResult.value;
    logger.info({ sessionId, scanner }, 'Starting image security scan');

    const securityScanner = createSecurityScanner(logger, scanner);

    // Check for built image in session or use provided imageId
    const buildResult = (session as any)?.build_result;
    const imageId = params.imageId || buildResult?.imageId;

    if (!imageId) {
      return Failure(
        'No image specified. Provide imageId parameter or ensure session has built image from build-image tool.',
      );
    }
    logger.info({ imageId, scanner }, 'Scanning image for vulnerabilities');

    // Scan image using security scanner
    const scanResultWrapper = await securityScanner.scanImage(imageId);

    if (!scanResultWrapper.ok) {
      return Failure(`Failed to scan image: ${scanResultWrapper.error ?? 'Unknown error'}`);
    }

    const scanResult = scanResultWrapper.value;

    // Convert ScanResult to DockerScanResult
    interface ScanResultVulnerability {
      id?: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      package?: string;
      version?: string;
      description?: string;
      fixedVersion?: string;
    }

    const dockerScanResult: DockerScanResult = {
      vulnerabilities: scanResult.vulnerabilities.map((v: Record<string, unknown>) => {
        const vuln: ScanResultVulnerability = {
          severity: v.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        };
        if (v.id) {
          vuln.id = v.id as string;
        }
        if (v.package) {
          vuln.package = v.package as string;
        }
        if (v.version) {
          vuln.version = v.version as string;
        }
        if (v.description) {
          vuln.description = v.description as string;
        }
        if (v.fixedVersion) {
          vuln.fixedVersion = v.fixedVersion as string;
        }
        return vuln;
      }),
      summary: {
        critical: scanResult.criticalCount,
        high: scanResult.highCount,
        medium: scanResult.mediumCount,
        low: scanResult.lowCount,
        total: scanResult.totalVulnerabilities,
      },
      scanTime: scanResult.scanDate.toISOString(),
      metadata: {
        image: scanResult.imageId,
      },
    };

    // Determine if scan passed based on threshold
    const thresholdMap = {
      critical: ['critical'],
      high: ['critical', 'high'],
      medium: ['critical', 'high', 'medium'],
      low: ['critical', 'high', 'medium', 'low'],
    };

    const failingSeverities = thresholdMap[finalSeverityThreshold] || thresholdMap['high'];
    let vulnerabilityCount = 0;

    for (const severity of failingSeverities) {
      if (severity === 'critical') {
        vulnerabilityCount += scanResult.criticalCount;
      } else if (severity === 'high') {
        vulnerabilityCount += scanResult.highCount;
      } else if (severity === 'medium') {
        vulnerabilityCount += scanResult.mediumCount;
      } else if (severity === 'low') {
        vulnerabilityCount += scanResult.lowCount;
      }
    }

    const passed = vulnerabilityCount === 0;

    // Update session with scan results using standardized helper
    const updateResult = await updateSessionData(
      sessionId,
      {
        scan_result: {
          success: passed,
          vulnerabilities: dockerScanResult.vulnerabilities?.map((v) => ({
            id: v.id ?? 'unknown',
            severity: v.severity,
            package: v.package ?? 'unknown',
            version: v.version ?? 'unknown',
            description: v.description ?? '',
            ...(v.fixedVersion && { fixedVersion: v.fixedVersion }),
          })),
          summary: dockerScanResult.summary,
        },
        completed_steps: [...(session.completed_steps || []), 'scan'],
        metadata: {
          ...session.metadata,
          scanTime: dockerScanResult.scanTime ?? new Date().toISOString(),
          scanner,
          scanPassed: passed,
        },
      },
      logger,
      context,
    );

    if (!updateResult.ok) {
      logger.warn({ error: updateResult.error }, 'Failed to update session, but scan succeeded');
    }

    timer.end({
      vulnerabilities: scanResult.totalVulnerabilities,
      critical: scanResult.criticalCount,
      high: scanResult.highCount,
      passed,
    });

    logger.info(
      {
        imageId,
        vulnerabilities: scanResult.totalVulnerabilities,
        passed,
      },
      'Image scan completed',
    );

    return Success({
      success: true,
      sessionId,
      vulnerabilities: {
        critical: dockerScanResult.summary?.critical ?? 0,
        high: dockerScanResult.summary?.high ?? 0,
        medium: dockerScanResult.summary?.medium ?? 0,
        low: dockerScanResult.summary?.low ?? 0,
        unknown: dockerScanResult.summary?.unknown ?? 0,
        total: dockerScanResult.summary?.total ?? 0,
      },
      scanTime: dockerScanResult.scanTime ?? new Date().toISOString(),
      passed,
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Image scan failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Wrapped scan image tool with standardized behavior
 */
export const scanImageTool = wrapTool('scan', scanImageImpl);

/**
 * Legacy export for backward compatibility during migration
 */
export const scanImage = async (
  params: ScanImageParams,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<ScanImageResult>> => {
  return scanImageImpl(params, context || {}, logger);
};
