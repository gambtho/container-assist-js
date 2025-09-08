/**
 * Scan Image Tool - Flat Architecture
 *
 * Scans Docker images for security vulnerabilities
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../../lib/session';
import { createSecurityScanner } from '../../lib/scanner';
import { createTimer, type Logger } from '../../lib/logger';
import {
  Success,
  Failure,
  type Result,
  updateWorkflowState,
  type WorkflowState,
} from '../../domain/types';
import { createToolProgressReporter } from '../../mcp/server/progress';
import type { ToolContext } from '../types';

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
  context?: ToolContext,
): Promise<Result<ScanImageResult>> {
  const timer = createTimer(logger, 'scan-image');

  // Extract abort signal and progress token from context if available
  const abortSignal = context?.abortSignal;
  const progressToken = context?.progressToken;

  // Create progress reporter
  const reportProgress = createToolProgressReporter(
    progressToken ? { progressToken, logger } : { logger },
    'scan-image',
  );

  try {
    await reportProgress('Initializing security scan', 0);
    const { sessionId, scanner = 'trivy', severityThreshold = 'high' } = config;

    logger.info({ sessionId, scanner, severityThreshold }, 'Starting image security scan');

    await reportProgress('Loading scanner configuration', 10);

    // Check for abort signal early
    if (abortSignal?.aborted) {
      return Failure('Scan operation cancelled');
    }

    // Use sessionManager from context or create new one
    const sessionManager = context?.sessionManager || createSessionManager(logger);
    const securityScanner = createSecurityScanner(logger, scanner);

    // Get or create session
    await reportProgress('Loading session', 20);
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
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

    await reportProgress('Retrieving image information', 30);

    // Check for abort before starting the scan
    if (abortSignal?.aborted) {
      return Failure('Scan operation cancelled before scanning');
    }

    // Scan image using security scanner
    await reportProgress('Scanning for vulnerabilities', 50);
    const scanResultWrapper = await securityScanner.scanImage(imageId);

    if (!scanResultWrapper.ok) {
      return Failure(`Scan failed: ${scanResultWrapper.error || 'Unknown error'}`);
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

    await reportProgress('Updating scan results', 80);
    // Update session with scan results
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
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

    await reportProgress('Scan completed', 100);

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
  execute: (config: ScanImageConfig, logger: Logger, context?: ToolContext) =>
    scanImage(config, logger, context),
};
