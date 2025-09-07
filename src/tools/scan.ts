/**
 * Scan Image Tool - Flat Architecture
 *
 * Scans Docker images for security vulnerabilities
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../lib/session';
import { createSecurityScanner } from '../lib/scanner';
import { createTimer, type Logger } from '../lib/logger';
import {
  Success,
  Failure,
  type Result,
  updateWorkflowState,
  type WorkflowState,
} from '../core/types';

export interface ScanImageConfig {
  sessionId: string;
  scanner?: 'trivy' | 'snyk' | 'grype';
  severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
}

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
 * Scan Docker image for vulnerabilities using lib utilities only
 */
export async function scanImage(
  config: ScanImageConfig,
  logger: Logger,
): Promise<Result<ScanImageResult>> {
  const timer = createTimer(logger, 'scan-image');

  try {
    const { sessionId, scanner = 'trivy', severityThreshold = 'high' } = config;

    logger.info({ sessionId, scanner, severityThreshold }, 'Starting image security scan');

    // Create lib instances
    const sessionManager = createSessionManager(logger);
    const securityScanner = createSecurityScanner(logger, scanner);

    // Get session using lib session manager
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    const workflowState = session.workflow_state as
      | { build_result?: { imageId?: string } }
      | null
      | undefined;
    const buildResult = workflowState?.build_result;

    if (!buildResult?.imageId) {
      return Failure('No built image found in session - run build_image first');
    }

    const imageId = buildResult.imageId;
    logger.info({ imageId, scanner }, 'Scanning image for vulnerabilities');

    // Scan image using security scanner
    const scanResultWrapper = await securityScanner.scanImage(imageId);

    if (!scanResultWrapper.ok) {
      return Failure(`Scan failed: ${scanResultWrapper.error || 'Unknown error'}`);
    }

    const scanResult = scanResultWrapper.value;

    // Convert ScanResult to DockerScanResult
    const dockerScanResult: DockerScanResult = {
      vulnerabilities: scanResult.vulnerabilities.map((v: any) => {
        const vuln: any = {
          id: v.id,
          severity: v.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
          package: v.package,
          version: v.version,
          description: v.description,
        };
        if (v.fixedVersion) {
          vuln.fixedVersion = v.fixedVersion;
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

    const failingSeverities = thresholdMap[severityThreshold];
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

    // Update session with scan results
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
      scan_result: {
        success: passed,
        vulnerabilities: dockerScanResult.vulnerabilities?.map((v) => ({
          id: v.id ?? 'unknown',
          severity: v.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
          package: v.package ?? 'unknown',
          version: v.version ?? 'unknown',
          description: v.description ?? '',
          ...(v.fixedVersion && { fixedVersion: v.fixedVersion }),
        })),
        summary: dockerScanResult.summary,
      },
      metadata: {
        ...currentState?.metadata,
        scanTime: dockerScanResult.scanTime ?? new Date().toISOString(),
        scanner,
        scanPassed: passed,
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'scan'],
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

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
 * Scan image tool instance
 */
export const scanImageTool = {
  name: 'scan',
  execute: (config: ScanImageConfig, logger: Logger) => scanImage(config, logger),
};
