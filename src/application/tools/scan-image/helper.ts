/**
 * Scan Image - Helper Functions
 */

import { DockerScanResult } from '../../../contracts/types/index.js';
import type { ToolContext } from '../tool-types.js';

/**
 * Severity level priority for sorting
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

/**
 * Filter vulnerabilities by severity threshold
 */
export function filterBySeverity(
  vulnerabilities: DockerScanResult['vulnerabilities'],
  threshold: string
): DockerScanResult['vulnerabilities'] {
  const thresholdPriority = SEVERITY_PRIORITY[threshold] || 0;
  return vulnerabilities.filter(
    (vuln) => (SEVERITY_PRIORITY[vuln.severity] || 0) >= thresholdPriority
  );
}

/**
 * Generate security recommendations based on scan results
 */
export function generateRecommendations(
  vulnerabilities: DockerScanResult['vulnerabilities'],
  summary: DockerScanResult['summary']
): string[] {
  const recommendations: string[] = [];

  // Critical vulnerabilities
  if (summary.critical > 0) {
    recommendations.push(`🚨 Fix ${summary.critical} critical vulnerabilities immediately`);
  }

  // High vulnerabilities
  if (summary.high > 5) {
    recommendations.push(`⚠️ Address ${summary.high} high severity vulnerabilities`);
  }

  // Check for specific vulnerable packages
  const vulnerablePackages = new Set(vulnerabilities.map((v) => v.package));

  if (vulnerablePackages.has('log4j')) {
    recommendations.push('Critical: Update log4j to latest version (Log4Shell vulnerability)');
  }

  if (vulnerablePackages.has('openssl')) {
    recommendations.push('Important: Update OpenSSL for security fixes');
  }

  // General recommendations
  if (vulnerabilities.length > 50) {
    recommendations.push('Consider updating base image to reduce vulnerability count');
  }

  const fixableVulns = vulnerabilities.filter((v) => v.fixedVersion);
  if (fixableVulns.length > 0) {
    recommendations.push(
      `${fixableVulns.length} vulnerabilities have fixes available - run updates`
    );
  }

  // Add general best practices
  if (recommendations.length === 0) {
    recommendations.push('✅ No critical issues found');
    recommendations.push('Continue monitoring for new vulnerabilities');
  }

  recommendations.push('Use minimal base images (alpine, distroless) when possible');
  recommendations.push('Implement regular vulnerability scanning in CI/CD');

  return recommendations;
}

/**
 * Mock scan function for testing/fallback
 */
export async function mockScan(_imageId: string): Promise<DockerScanResult> {
  return {
    vulnerabilities: [
      {
        severity: 'high',
        cve: 'CVE-2024-1234',
        package: 'example-package',
        version: '1.0.0',
        fixedVersion: '1.0.1',
        description: 'Mock vulnerability for testing'
      }
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      total: 6
    },
    scanTime: new Date().toISOString()
  };
}

/**
 * Get scan target from session or input
 */
export async function getScanTarget(
  imageId: string | undefined,
  imageTag: string | undefined,
  sessionId: string | undefined,
  sessionService: any
): Promise<string> {
  let scanTarget = imageId ?? imageTag;

  // If no image specified, get from session
  if (!scanTarget && sessionId && sessionService) {
    const session = await sessionService.get(sessionId);
    if (session?.workflow_state?.build_result) {
      scanTarget =
        session.workflow_state.build_result.imageId ?? session.workflow_state.build_result.tag;
    }
  }

  if (!scanTarget) {
    throw new Error('No image specified for scanning');
  }

  return scanTarget;
}

/**
 * Perform actual Docker scan
 */
export async function performDockerScan(
  scanTarget: string,
  dockerService: any,
  context: ToolContext
): Promise<DockerScanResult> {
  const { logger } = context;

  if (dockerService) {
    // Use Docker service for scanning
    logger.info('Using Docker service for vulnerability scan');
    if ('scan' in dockerService) {
      const result = await dockerService.scan(scanTarget);

      if (!result.success ?? !result.data) {
        throw new Error(result.error?.message ?? 'Scan failed');
      }

      return result.data;
    } else {
      throw new Error('Docker service scan method not available');
    }
  } else {
    logger.warn('Docker service not available, using mock scan');
    return await mockScan(scanTarget);
  }
}

/**
 * Process scan results
 */
export function processScanResults(
  scanResult: DockerScanResult,
  severityThreshold: string,
  ignoreUnfixed: boolean
): {
  filteredVulnerabilities: DockerScanResult['vulnerabilities'];
  fixableCount: number;
} {
  // Filter vulnerabilities based on threshold
  const filteredVulnerabilities = filterBySeverity(scanResult.vulnerabilities, severityThreshold);

  // Filter unfixed if requested
  const finalVulnerabilities = ignoreUnfixed
    ? filteredVulnerabilities.filter((v) => v.fixedVersion)
    : filteredVulnerabilities;

  // Sort by severity
  finalVulnerabilities.sort(
    (a, b) => (SEVERITY_PRIORITY[b.severity] || 0) - (SEVERITY_PRIORITY[a.severity] || 0)
  );

  // Calculate fixable count
  const fixableCount = finalVulnerabilities.filter((v) => v.fixedVersion).length;

  return {
    filteredVulnerabilities: finalVulnerabilities,
    fixableCount
  };
}

/**
 * Get image details from session
 */
export async function getImageDetails(
  sessionId: string | undefined,
  sessionService: any
): Promise<
  | {
      size?: number;
      layers?: number;
      os?: string;
      architecture?: string;
    }
  | undefined
> {
  if (!sessionId || !sessionService) {
    return undefined;
  }

  const session = await sessionService.get(sessionId);
  const buildResult = session?.workflow_state?.build_result;
  return buildResult
    ? {
        size: buildResult.size ?? 0,
        layers: Array.isArray(buildResult.layers) ? buildResult.layers.length : 0,
        os: 'linux',
        architecture: 'amd64'
      }
    : undefined;
}

/**
 * Sort vulnerabilities by severity priority
 */
export function sortVulnerabilitiesBySeverity(
  vulnerabilities: DockerScanResult['vulnerabilities']
): DockerScanResult['vulnerabilities'] {
  return vulnerabilities.sort(
    (a, b) => (SEVERITY_PRIORITY[b.severity] || 0) - (SEVERITY_PRIORITY[a.severity] || 0)
  );
}
