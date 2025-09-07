/**
 * Stage Gate Validators
 *
 * Simple gate validators to ensure quality at each workflow stage
 */

import { Result, Success, Failure } from '../../types/core.js';
import type { Logger } from 'pino';
import { ORCHESTRATOR_CONFIG } from '../../config/orchestrator-config.js';

/**
 * Gate validation result
 */
export interface GateResult {
  passed: boolean;
  reason?: string;
  metrics?: Record<string, unknown>;
  suggestions?: string[];
}

/**
 * Analysis result interface for gate checking
 */
export interface AnalysisResult {
  language?: string;
  framework?: string;
  entrypoint?: string;
  ports?: number[];
  dependencies?: string[];
  buildTool?: string;
  [key: string]: unknown;
}

/**
 * Scan result interface for gate checking
 */
export interface ScanResult {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  imageSize?: number;
  layers?: number;
  [key: string]: unknown;
}

/**
 * Build result interface for gate checking
 */
export interface BuildResult {
  imageId: string;
  size: number;
  layers: number;
  buildTime: number;
  warnings?: string[];
  [key: string]: unknown;
}

/**
 * Deployment result interface for gate checking
 */
export interface DeploymentResult {
  deployed: boolean;
  replicas?: number;
  endpoints?: string[];
  healthStatus?: string;
  [key: string]: unknown;
}

/**
 * Stage gate validators
 */
export class StageGates {
  constructor(private logger: Logger) {}

  /**
   * Check if analysis results meet minimum requirements
   */
  async checkAnalysisGate(analysis: AnalysisResult): Promise<Result<GateResult>> {
    const required = ['language', 'framework', 'entrypoint'];
    const missing = required.filter((field) => !analysis[field]);

    if (missing.length > 0) {
      this.logger.warn({ missing }, 'Analysis gate failed: missing required fields');
      return Success({
        passed: false,
        reason: `Missing required fields: ${missing.join(', ')}`,
        suggestions: [
          'Ensure project has detectable language files',
          'Check that main entry point exists',
          'Verify framework configuration files are present',
        ],
      });
    }

    // Check for ports if it's a web application
    if (analysis.framework?.includes('web') || analysis.framework?.includes('api')) {
      if (!analysis.ports || analysis.ports.length === 0) {
        this.logger.warn('Analysis gate warning: no ports detected for web application');
        return Success({
          passed: true, // Pass with warning
          metrics: { warning: 'no-ports' },
          suggestions: ['Consider specifying application port explicitly'],
        });
      }
    }

    this.logger.info('Analysis gate passed');
    return Success({
      passed: true,
      metrics: {
        language: analysis.language,
        framework: analysis.framework,
        hasEntrypoint: true,
        portCount: analysis.ports?.length || 0,
      },
    });
  }

  /**
   * Check if scan results meet security thresholds
   */
  async checkScanGate(scanResult: ScanResult): Promise<Result<GateResult>> {
    const { critical, high, medium } = scanResult.vulnerabilities;
    const thresholds = ORCHESTRATOR_CONFIG.SCAN_THRESHOLDS;

    const violations = [];
    if (critical > thresholds.critical) {
      violations.push(`Critical: ${critical}/${thresholds.critical}`);
    }
    if (high > thresholds.high) {
      violations.push(`High: ${high}/${thresholds.high}`);
    }
    if (medium > thresholds.medium) {
      violations.push(`Medium: ${medium}/${thresholds.medium}`);
    }

    if (violations.length > 0) {
      this.logger.warn({ violations }, 'Scan gate failed: vulnerabilities exceed thresholds');
      return Success({
        passed: false,
        reason: `Vulnerabilities exceed thresholds: ${violations.join(', ')}`,
        metrics: { critical, high, medium },
        suggestions: [
          'Update base image to latest version',
          'Review and update dependencies',
          'Consider using distroless or minimal base images',
          'Apply security patches',
        ],
      });
    }

    this.logger.info('Scan gate passed');
    return Success({
      passed: true,
      metrics: {
        critical,
        high,
        medium,
        imageSize: scanResult.imageSize,
        layers: scanResult.layers,
      },
    });
  }

  /**
   * Check if build size is reasonable compared to best candidate
   */
  async checkBuildGate(
    buildResult: BuildResult,
    bestCandidateSize?: number,
  ): Promise<Result<GateResult>> {
    // Basic validation
    if (!buildResult.imageId) {
      return Success({
        passed: false,
        reason: 'Build failed: no image ID',
      });
    }

    // Check build warnings
    if (buildResult.warnings && buildResult.warnings.length > 0) {
      this.logger.warn({ warnings: buildResult.warnings }, 'Build completed with warnings');
    }

    // Size comparison if we have a reference
    if (bestCandidateSize && bestCandidateSize > 0) {
      const ratio = buildResult.size / bestCandidateSize;
      const sanityLimit = ORCHESTRATOR_CONFIG.BUILD_SIZE_LIMITS.sanityFactor;
      const rejectLimit = ORCHESTRATOR_CONFIG.BUILD_SIZE_LIMITS.rejectFactor;

      if (ratio > rejectLimit) {
        this.logger.error({ ratio, limit: rejectLimit }, 'Build gate failed: excessive size');
        return Success({
          passed: false,
          reason: `Build size ${ratio.toFixed(2)}x larger than best candidate (limit: ${rejectLimit}x)`,
          metrics: {
            buildSize: buildResult.size,
            bestCandidateSize,
            ratio,
          },
          suggestions: [
            'Review multi-stage build optimization',
            'Check for unnecessary files in image',
            'Consider using smaller base image',
            'Remove build dependencies from final stage',
          ],
        });
      }

      if (ratio > sanityLimit) {
        this.logger.warn({ ratio, limit: sanityLimit }, 'Build size exceeds sanity threshold');
        // Pass with warning
        return Success({
          passed: true,
          metrics: {
            buildSize: buildResult.size,
            bestCandidateSize,
            ratio,
            warning: 'size-above-sanity-limit',
          },
          suggestions: ['Consider optimizing image size'],
        });
      }
    }

    this.logger.info('Build gate passed');
    return Success({
      passed: true,
      metrics: {
        imageId: buildResult.imageId,
        size: buildResult.size,
        layers: buildResult.layers,
        buildTime: buildResult.buildTime,
        warningCount: buildResult.warnings?.length || 0,
      },
    });
  }

  /**
   * Check if deployment was successful
   */
  async checkDeploymentGate(deployment: DeploymentResult): Promise<Result<GateResult>> {
    if (!deployment.deployed) {
      return Success({
        passed: false,
        reason: 'Deployment failed',
        suggestions: [
          'Check cluster connectivity',
          'Verify namespace permissions',
          'Review resource quotas',
        ],
      });
    }

    // Check if we have endpoints
    if (!deployment.endpoints || deployment.endpoints.length === 0) {
      this.logger.warn('Deployment gate warning: no endpoints available');
      return Success({
        passed: true, // Pass with warning
        metrics: { warning: 'no-endpoints' },
        suggestions: ['Check service configuration'],
      });
    }

    // Check health status if available
    if (deployment.healthStatus && deployment.healthStatus !== 'healthy') {
      return Success({
        passed: false,
        reason: `Deployment unhealthy: ${deployment.healthStatus}`,
        suggestions: [
          'Check pod logs for errors',
          'Verify health check configuration',
          'Review resource limits',
        ],
      });
    }

    this.logger.info('Deployment gate passed');
    return Success({
      passed: true,
      metrics: {
        replicas: deployment.replicas,
        endpointCount: deployment.endpoints.length,
        healthStatus: deployment.healthStatus || 'unknown',
      },
    });
  }

  /**
   * Generic gate check for any stage
   */
  async checkGate(
    stage: string,
    data: unknown,
    additionalChecks?: (data: unknown) => Promise<GateResult>,
  ): Promise<Result<GateResult>> {
    this.logger.debug({ stage }, 'Checking stage gate');

    switch (stage.toLowerCase()) {
      case 'analysis':
        return this.checkAnalysisGate(data as AnalysisResult);
      case 'scan':
        return this.checkScanGate(data as ScanResult);
      case 'build':
        return this.checkBuildGate(data as BuildResult);
      case 'deploy':
      case 'deployment':
        return this.checkDeploymentGate(data as DeploymentResult);
    }

    // Run additional custom checks if provided
    if (additionalChecks) {
      try {
        const result = await additionalChecks(data);
        return Success(result);
      } catch (error) {
        return Failure(
          `Gate check error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Default: pass if no specific checks
    this.logger.debug({ stage }, 'No specific gate checks for stage, passing by default');
    return Success({ passed: true });
  }
}
