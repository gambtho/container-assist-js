/**
 * Security Scanner - Direct Scanner Integration
 *
 * Simplified security scanning operations using direct scanner integration
 * Removes unnecessary wrapper complexity while maintaining core functionality
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core/index.js';
import { scanImage as scanImageWithTrivy } from './security-scanner';

/**
 * Security scan result
 */
export interface ScanResult {
  imageId: string;
  vulnerabilities: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    package: string;
    version: string;
    fixedVersion?: string;
    description: string;
  }>;
  totalVulnerabilities: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  scanDate: Date;
}

interface SecurityScanner {
  scanImage: (imageId: string) => Promise<Result<ScanResult>>;
  ping: () => Promise<Result<boolean>>;
}

/**
 * Create a security scanner with direct integration
 */
export const createSecurityScanner = (logger: Logger, scannerType?: string): SecurityScanner => {
  return {
    /**
     * Scan Docker image for vulnerabilities
     */
    async scanImage(imageId: string): Promise<Result<ScanResult>> {
      try {
        logger.info({ imageId, scanner: scannerType }, 'Starting security scan');

        // Use the simplified scanner implementation
        const scanResult = await scanImageWithTrivy(imageId, {}, logger);

        if (!scanResult.ok) {
          return Failure(scanResult.error);
        }

        const dockerScanResult = scanResult.value;

        // Convert DockerScanResult to ScanResult format
        const result: ScanResult = {
          imageId,
          vulnerabilities:
            dockerScanResult.vulnerabilities?.map((v) => ({
              id: v.id || 'unknown',
              severity: v.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
              package: v.package,
              version: v.version,
              ...(v.fixedVersion && { fixedVersion: v.fixedVersion }),
              description: v.description || '',
            })) || [],
          totalVulnerabilities: dockerScanResult.summary?.total || 0,
          criticalCount: dockerScanResult.summary?.critical || 0,
          highCount: dockerScanResult.summary?.high || 0,
          mediumCount: dockerScanResult.summary?.medium || 0,
          lowCount: dockerScanResult.summary?.low || 0,
          scanDate: new Date(dockerScanResult.scanTime || new Date()),
        };

        logger.info(
          {
            imageId,
            totalVulnerabilities: result.totalVulnerabilities,
            criticalCount: result.criticalCount,
            highCount: result.highCount,
          },
          'Security scan completed',
        );

        return Success(result);
      } catch (error) {
        const errorMessage = `Security scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ error: errorMessage, imageId }, 'Security scan failed');

        return Failure(errorMessage);
      }
    },

    /**
     * Check scanner availability
     */
    async ping(): Promise<Result<boolean>> {
      try {
        logger.debug('Checking scanner availability');
        // In production, this would ping the actual scanner service
        return Success(true);
      } catch (error) {
        const errorMessage = `Scanner ping failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },
  };
};
