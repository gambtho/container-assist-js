/**
 * Scan Image Tool - Flat Architecture
 *
 * Scans Docker images for security vulnerabilities
 * Follows architectural requirement: only imports from src/lib/
 */

import { getSessionManager } from '../lib/session';
import { createSecurityScanner } from '../lib/scanner';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';
import type { DockerScanResult } from '../types/docker';

export interface ScanImageConfig {
  sessionId: string;
  scanner?: 'trivy' | 'snyk' | 'grype';
  severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
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
    const sessionManager = getSessionManager(logger);
    const securityScanner = createSecurityScanner(null, { scanner }, logger);

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
    const scanResult: DockerScanResult = await securityScanner.scanImage(imageId, {
      scanner,
      severityThreshold: severityThreshold.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    });

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
      vulnerabilityCount +=
        (scanResult.summary as Record<string, number> | null | undefined)?.[severity] ?? 0;
    }

    const passed = vulnerabilityCount === 0;

    // Update session with scan results
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      scan_result: {
        success: passed,
        vulnerabilities: scanResult.vulnerabilities?.map((v) => ({
          id: (v as { id?: string; cve?: string }).id ?? (v as { cve?: string }).cve ?? 'unknown',
          severity: ((v as { severity?: string }).severity ?? 'LOW') as
            | 'LOW'
            | 'MEDIUM'
            | 'HIGH'
            | 'CRITICAL',
          package: (v as { package?: string }).package ?? 'unknown',
          version: (v as { version?: string }).version ?? 'unknown',
          description: (v as { description?: string }).description ?? '',
          fixedVersion: (v as { fixedVersion?: string }).fixedVersion,
        })),
        summary: scanResult.summary,
      },
      metadata: {
        ...currentState?.metadata,
        scanTime: scanResult.scanTime ?? new Date().toISOString(),
        scanner,
        scanPassed: passed,
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'scan'],
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({
      vulnerabilities: scanResult.summary?.total ?? 0,
      critical: scanResult.summary?.critical ?? 0,
      high: scanResult.summary?.high ?? 0,
      passed,
    });

    logger.info(
      {
        imageId,
        vulnerabilities: scanResult.summary,
        passed,
      },
      'Image scan completed',
    );

    return Success({
      success: true,
      sessionId,
      vulnerabilities: {
        critical: scanResult.summary?.critical ?? 0,
        high: scanResult.summary?.high ?? 0,
        medium: scanResult.summary?.medium ?? 0,
        low: scanResult.summary?.low ?? 0,
        unknown: scanResult.summary?.unknown ?? 0,
        total: scanResult.summary?.total ?? 0,
      },
      scanTime: scanResult.scanTime ?? new Date().toISOString(),
      passed,
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Image scan failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Factory function for creating scan tool instances
 */
export function createScanTool(logger: Logger): {
  name: string;
  execute: (config: ScanImageConfig) => Promise<Result<ScanImageResult>>;
} {
  return {
    name: 'scan',
    execute: (config: ScanImageConfig) => scanImage(config, logger),
  };
}

export default scanImage;
