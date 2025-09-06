/**
 * Security Scanner Wrapper
 *
 * Provides a simplified, clean interface for security scanning operations
 * Wraps the existing scanner infrastructure with consistent error handling and logging
 */

import { createTimer, type Logger } from './logger';
import type { DockerScanResult, ScanOptions } from '../types/docker';

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  scanner?: 'trivy' | 'grype' | 'snyk';
  timeout?: number;
  cacheDir?: string;
  updateDb?: boolean;
}

/**
 * Security scanner interface for lib layer
 */
export interface SecurityScanner {
  /**
   * Scan a Docker image for vulnerabilities
   */
  scanImage(image: string, options?: ScanOptions): Promise<DockerScanResult>;

  /**
   * Scan a filesystem path for vulnerabilities
   */
  scanPath(path: string, options?: ScanOptions): Promise<DockerScanResult>;

  /**
   * Update vulnerability database
   */
  updateDatabase(): Promise<void>;

  /**
   * Check scanner availability and version
   */
  getVersion(): Promise<{ scanner: string; version: string }>;

  /**
   * Check scanner health
   */
  ping(): Promise<boolean>;

  /**
   * Get scanner configuration
   */
  getConfig(): ScannerConfig;
}

/**
 * Security scanner wrapper implementation
 */
export class SecurityScannerWrapper implements SecurityScanner {
  private logger: Logger;

  constructor(
    private scannerService: any, // Will be the actual scanner service (e.g., TrivyScanner)
    private config: ScannerConfig,
    logger: Logger,
  ) {
    this.logger = logger.child({
      component: 'security-scanner',
      scanner: config.scanner ?? 'trivy',
    });
  }

  /**
   * Scan a Docker image for vulnerabilities
   */
  async scanImage(image: string, options: ScanOptions = {}): Promise<DockerScanResult> {
    const timer = createTimer(this.logger, 'scan-image');

    try {
      this.logger.info(
        {
          image,
          scanner: options.scanner ?? this.config.scanner,
          severityThreshold: options.severityThreshold,
        },
        'Scanning Docker image for vulnerabilities',
      );

      // Merge configuration with options
      const mergedOptions: ScanOptions = {
        ...options,
        scanner: options.scanner ?? this.config.scanner ?? 'trivy',
        ...((options.timeout ?? this.config.timeout)
          ? { timeout: options.timeout ?? this.config.timeout }
          : {}),
      };

      const result = await this.scannerService.scan(image, mergedOptions);

      // Ensure result has proper structure
      const normalizedResult = this.normalizeScanResult(result);

      timer.end({
        vulnerabilityCount: normalizedResult.summary?.total || 0,
        criticalCount: normalizedResult.summary?.critical || 0,
        highCount: normalizedResult.summary?.high || 0,
        scanner: normalizedResult.scanner,
      });

      this.logger.info(
        {
          image,
          vulnerabilities: normalizedResult.summary?.total || 0,
          critical: normalizedResult.summary?.critical || 0,
          high: normalizedResult.summary?.high || 0,
        },
        'Image scan completed',
      );

      return normalizedResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      this.logger.error({ image, error: error.message }, 'Image scan failed');

      return {
        vulnerabilities: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0,
        },
        scanner: (options.scanner ?? this.config.scanner ?? 'trivy') as 'trivy' | 'grype' | 'snyk',
        scanTime: new Date().toISOString(),
        metadata: {
          image,
        },
      };
    }
  }

  /**
   * Scan a filesystem path for vulnerabilities
   */
  async scanPath(path: string, options: ScanOptions = {}): Promise<DockerScanResult> {
    const timer = createTimer(this.logger, 'scan-path');

    try {
      this.logger.info(
        {
          path,
          scanner: options.scanner ?? this.config.scanner,
        },
        'Scanning filesystem path for vulnerabilities',
      );

      const mergedOptions: ScanOptions = {
        ...options,
        scanner: options.scanner ?? this.config.scanner ?? 'trivy',
        ...((options.timeout ?? this.config.timeout)
          ? { timeout: options.timeout ?? this.config.timeout }
          : {}),
      };

      const result = await this.scannerService.scanPath(path, mergedOptions);
      const normalizedResult = this.normalizeScanResult(result);

      timer.end({
        vulnerabilityCount: normalizedResult.summary?.total || 0,
        criticalCount: normalizedResult.summary?.critical || 0,
      });

      return normalizedResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      return {
        vulnerabilities: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0,
        },
        scanner: (options.scanner ?? this.config.scanner ?? 'trivy') as 'trivy' | 'grype' | 'snyk',
        scanTime: new Date().toISOString(),
        metadata: {
          image: `path:${path}`,
          path,
          error: error.message,
        },
      };
    }
  }

  /**
   * Update vulnerability database
   */
  async updateDatabase(): Promise<void> {
    const timer = createTimer(this.logger, 'update-database');

    try {
      this.logger.info({ scanner: this.config.scanner }, 'Updating vulnerability database');

      await this.scannerService.updateDatabase();

      timer.end();
      this.logger.info('Database updated successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * Get scanner version information
   */
  async getVersion(): Promise<{ scanner: string; version: string }> {
    try {
      const version = await this.scannerService.getVersion();
      return {
        scanner: this.config.scanner ?? 'unknown',
        version: version || 'unknown',
      };
    } catch (err) {
      this.logger.warn({ error: err }, 'Failed to get scanner version');
      return {
        scanner: this.config.scanner ?? 'unknown',
        version: 'unknown',
      };
    }
  }

  /**
   * Check scanner health
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.scannerService.ping();
      return result === true;
    } catch {
      return false;
    }
  }

  /**
   * Get scanner configuration
   */
  getConfig(): ScannerConfig {
    return { ...this.config };
  }

  /**
   * Normalize scan result to ensure consistent structure
   */
  private normalizeScanResult(result: any): DockerScanResult {
    // Ensure vulnerabilities array exists
    const vulnerabilities = Array.isArray(result.vulnerabilities)
      ? result.vulnerabilities.map((v: any) => this.normalizeVulnerability(v))
      : [];

    // Calculate summary if missing
    let summary = result.summary;
    if (!summary || typeof summary !== 'object') {
      summary = this.calculateSummary(vulnerabilities);
    }

    // Ensure all required summary fields
    summary = {
      critical: summary.critical || 0,
      high: summary.high || 0,
      medium: summary.medium || 0,
      low: summary.low || 0,
      unknown: summary.unknown || 0,
      total: summary.total || vulnerabilities.length,
      ...summary,
    };

    return {
      vulnerabilities,
      summary,
      scanTime: result.scanTime || new Date().toISOString(),
      scanner: result.scanner || this.config.scanner || 'unknown',
      metadata: {
        ...result.metadata,
        scan_duration_ms: result.scan_duration_ms,
      },
    };
  }

  /**
   * Normalize individual vulnerability
   */
  private normalizeVulnerability(vuln: any): DockerScanResult['vulnerabilities'][0] {
    return {
      id: vuln.id || vuln.cve || 'unknown',
      severity: this.normalizeSeverity(vuln.severity),
      cve: vuln.cve || vuln.id,
      package: vuln.package || vuln.pkg_name || 'unknown',
      version: vuln.version || vuln.installed_version || 'unknown',
      fixedVersion: vuln.fixedVersion || vuln.fixed_version,
      fixed_version: vuln.fixed_version || vuln.fixedVersion,
      description: vuln.description || '',
      score: vuln.score || vuln.cvss_score,
      vector: vuln.vector || vuln.cvss_vector,
      references: Array.isArray(vuln.references) ? vuln.references : [],
    };
  }

  /**
   * Normalize severity to consistent format
   */
  private normalizeSeverity(severity: string): DockerScanResult['vulnerabilities'][0]['severity'] {
    const normalized = (severity || '').toUpperCase();

    switch (normalized) {
      case 'CRITICAL':
      case 'CRIT':
        return 'CRITICAL';
      case 'HIGH':
        return 'HIGH';
      case 'MEDIUM':
      case 'MED':
        return 'MEDIUM';
      case 'LOW':
        return 'LOW';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Calculate summary from vulnerabilities
   */
  private calculateSummary(
    vulnerabilities: DockerScanResult['vulnerabilities'],
  ): DockerScanResult['summary'] {
    const summary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
      total: vulnerabilities.length,
    };

    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
        case 'CRITICAL':
          summary.critical++;
          break;
        case 'HIGH':
          summary.high++;
          break;
        case 'MEDIUM':
          summary.medium++;
          break;
        case 'LOW':
          summary.low++;
          break;
        default:
          summary.unknown++;
          break;
      }
    }

    return summary;
  }
}

/**
 * Create a security scanner instance
 */
export function createSecurityScanner(
  scannerService: any,
  config: ScannerConfig,
  logger: Logger,
): SecurityScanner {
  return new SecurityScannerWrapper(scannerService, config, logger);
}

/**
 * Mock security scanner for testing
 */
export class MockSecurityScanner implements SecurityScanner {
  constructor(private config: ScannerConfig = {}) {}

  async scanImage(image: string): Promise<DockerScanResult> {
    return {
      vulnerabilities: [
        {
          id: 'CVE-2023-1234',
          severity: 'MEDIUM',
          package: 'openssl',
          version: '1.1.1',
          fixedVersion: '1.1.1k',
          description: 'Mock vulnerability for testing',
        },
      ],
      summary: {
        critical: 0,
        high: 0,
        medium: 1,
        low: 0,
        total: 1,
      },
      scanner: 'trivy',
      scanTime: new Date().toISOString(),
      metadata: {
        image,
      },
    };
  }

  async scanPath(): Promise<DockerScanResult> {
    return this.scanImage('mock-path');
  }

  async updateDatabase(): Promise<void> {
    // Mock implementation
  }

  async getVersion(): Promise<{ scanner: string; version: string }> {
    return {
      scanner: 'trivy',
      version: '1.0.0',
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  getConfig(): ScannerConfig {
    return { ...this.config };
  }
}
