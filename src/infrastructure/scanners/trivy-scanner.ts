/**
 * Trivy Scanner - Integration with Trivy vulnerability scanner
 * Provides real vulnerability scanning for Docker images
 */

import type { Logger } from 'pino';
import { CommandExecutor } from '../command-executor';
import { DockerScanResult, ScanOptions } from '../../domain/types/index';
import { Success, Failure, Result } from '../../domain/types/result';

export interface TrivyConfig {
  scannerPath?: string;
  cacheDir?: string;
  timeout?: number;
  severity?: string[];
  ignoreUnfixed?: boolean;
  skipUpdate?: boolean;
}

interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity: string;
  Description?: string;
  PrimaryURL?: string;
  PublishedDate?: string;
  CVSS?: {
    nvd?: {
      V3Score?: number;
    };
    redhat?: {
      V3Score?: number;
    };
  };
}

interface TrivyResult {
  SchemaVersion?: number;
  ArtifactName?: string;
  ArtifactType?: string;
  Metadata?: {
    ImageConfig?: {
      architecture?: string;
      os?: string;
    };
    Size?: number;
  };
  Results?: Array<{
    Target?: string;
    Type?: string;
    Vulnerabilities?: TrivyVulnerability[];
  }>;
}

export class TrivyScanner {
  private readonly executor: CommandExecutor;
  private readonly config: Required<TrivyConfig>;
  private isInitialized = false;
  private trivyVersion: string | null = null;

  constructor(
    private readonly logger: Logger,
    config?: TrivyConfig,
    executor?: CommandExecutor,
  ) {
    this.executor = executor ?? new CommandExecutor(logger);
    this.config = {
      scannerPath: config?.scannerPath ?? 'trivy',
      cacheDir: config?.cacheDir ?? '/tmp/trivy-cache',
      timeout: config?.timeout ?? 300000, // 5 minutes
      severity: config?.severity ?? ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      ignoreUnfixed: config?.ignoreUnfixed ?? false,
      skipUpdate: config?.skipUpdate ?? false,
    };
  }

  /**
   * Initialize the scanner and check availability
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Check if Trivy is available
      const isAvailable = await this.executor.isAvailable(this.config.scannerPath);
      if (!isAvailable) {
        return Failure(
          'Trivy is not installed. Please install Trivy to enable vulnerability scanning.',
        );
      }

      // Get Trivy version
      this.trivyVersion = await this.executor.getVersion(this.config.scannerPath, 'version');
      this.logger.info({ version: this.trivyVersion }, 'Trivy scanner initialized');

      // Update vulnerability database if not skipping
      if (!this.config.skipUpdate) {
        this.logger.info('Updating Trivy vulnerability database...');
        const updateResult = await this.executor.execute(
          this.config.scannerPath,
          ['image', '--download-db-only'],
          { timeout: 120000 }, // 2 minutes for DB update
        );

        if (updateResult.exitCode !== 0) {
          this.logger.warn(
            { stderr: updateResult.stderr },
            'Failed to update Trivy database, continuing with existing database',
          );
        }
      }

      this.isInitialized = true;
      return Success(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Failure(`Failed to initialize Trivy scanner: ${message}`);
    }
  }

  /**
   * Check if scanner is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isInitialized) {
      const initResult = await this.initialize();
      return initResult.ok;
    }
    return true;
  }

  /**
   * Scan a Docker image for vulnerabilities
   */
  async scan(image: string, options?: ScanOptions): Promise<Result<DockerScanResult>> {
    // Ensure scanner is initialized
    if (!this.isInitialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return initResult;
      }
    }

    try {
      this.logger.info({ image }, 'Scanning image with Trivy');

      // Build Trivy command arguments
      const args = ['image', '--format', 'json', '--quiet', '--cache-dir', this.config.cacheDir];

      // Add severity filter
      if (options?.severity ?? this.config.severity.length > 0) {
        const severities = options?.severity
          ? options.severity.map((s) => s.toUpperCase())
          : this.config.severity.map((s) => s.toUpperCase());
        args.push('--severity', severities.join(','));
      }

      // Add ignore unfixed option
      if (options?.ignoreUnfixed ?? this.config.ignoreUnfixed) {
        args.push('--ignore-unfixed');
      }

      // Add the image name
      args.push(image);

      // Execute Trivy scan
      const result = await this.executor.execute(this.config.scannerPath, args, {
        timeout: this.config.timeout,
      });

      if (result.timedOut) {
        return Failure('Trivy scan timed out');
      }

      if (result.exitCode !== 0 && !result.stdout) {
        return Failure(`Trivy scan failed: ${result.stderr || 'Unknown error'}`);
      }

      // Parse Trivy output
      const scanResult = this.parseTrivyOutput(result.stdout, image);
      return Success(scanResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Failure(`Image scan failed: ${message}`);
    }
  }

  /**
   * Parse Trivy JSON output into our scan result format
   */
  private parseTrivyOutput(output: string, imageRef: string): DockerScanResult {
    try {
      const trivyResult = JSON.parse(output) as TrivyResult;
      const vulnerabilities: DockerScanResult['vulnerabilities'] = [];
      const summary = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
        total: 0,
      };

      // Process all results
      if (trivyResult.Results) {
        for (const result of trivyResult.Results) {
          if (result.Vulnerabilities) {
            for (const vuln of result.Vulnerabilities) {
              const severity = vuln.Severity.toLowerCase() as
                | 'critical'
                | 'high'
                | 'medium'
                | 'low';

              const score = vuln.CVSS?.nvd?.V3Score ?? vuln.CVSS?.redhat?.V3Score;
              const vulnEntry: DockerScanResult['vulnerabilities'][0] = {
                id: vuln.VulnerabilityID,
                severity,
                cve: vuln.VulnerabilityID,
                package: vuln.PkgName,
                version: vuln.InstalledVersion,
                ...(vuln.FixedVersion && { fixedVersion: vuln.FixedVersion }),
                ...(vuln.Description && { description: vuln.Description }),
                ...(vuln.PrimaryURL && { references: [vuln.PrimaryURL] }),
                ...(score !== undefined && { score }),
              };

              vulnerabilities.push(vulnEntry);

              // Update summary
              if (severity in summary) {
                summary[severity]++;
              } else {
                summary.unknown++;
              }
              summary.total++;
            }
          }
        }
      }

      // Build metadata
      const metadata: Record<string, unknown> = {
        image: trivyResult.ArtifactName,
        scanner: 'trivy',
        scannerVersion: this.trivyVersion,
      };

      if (trivyResult.Metadata) {
        if (trivyResult.Metadata.Size) {
          metadata.imageSize = trivyResult.Metadata.Size;
        }
        if (trivyResult.Metadata.ImageConfig) {
          metadata.os = trivyResult.Metadata.ImageConfig.os;
          metadata.architecture = trivyResult.Metadata.ImageConfig.architecture;
        }
      }

      return {
        vulnerabilities,
        summary,
        scanTime: new Date().toISOString(),
        metadata: {
          ...metadata,
          image: metadata.image as string,
        },
      };
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : error },
        'Failed to parse Trivy output',
      );

      // Return empty result on parse error
      return {
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
        metadata: {
          image: imageRef,
        },
      };
    }
  }

  /**
   * Get scanner information
   */
  getInfo(): { available: boolean; version: string | null } {
    return {
      available: this.isInitialized,
      version: this.trivyVersion,
    };
  }
}
