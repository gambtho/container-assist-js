/**
 * Scan Image - Main Orchestration Logic
 */

import { z } from 'zod';
import { DomainError, ErrorCode } from '../../../contracts/types/errors.js';
import type { MCPTool, MCPToolContext } from '../tool-types.js';
import {
  getScanTarget,
  performDockerScan,
  processScanResults,
  generateRecommendations,
  getImageDetails
} from './helper';

// Input schema with support for both snake_case and camelCase
const ScanImageInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    image_id: z.string().optional(),
    imageId: z.string().optional(),
    image_tag: z.string().optional(),
    imageTag: z.string().optional(),
    scanner: z.enum(['trivy', 'grype', 'auto']).default('auto'),
    severity_threshold: z.enum(['critical', 'high', 'medium', 'low']).default('high'),
    severityThreshold: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    format: z.enum(['table', 'json', 'sarif']).default('table'),
    ignore_unfixed: z.boolean().default(false),
    ignoreUnfixed: z.boolean().optional(),
    scan_layers: z.boolean().default(true),
    scanLayers: z.boolean().optional()
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId,
    imageId: data.image_id ?? data.imageId,
    imageTag: data.image_tag ?? data.imageTag,
    scanner: data.scanner,
    severityThreshold: data.severity_threshold ?? (data.severityThreshold || 'high'),
    format: data.format,
    ignoreUnfixed: data.ignore_unfixed ?? data.ignoreUnfixed ?? false,
    scanLayers: data.scan_layers ?? data.scanLayers ?? true
  }));

// Output schema
const ScanImageOutput = z.object({
  success: z.boolean(),
  vulnerabilities: z.array(
    z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      cve: z.string(),
      package: z.string(),
      version: z.string(),
      fixedVersion: z.string().optional(),
      description: z.string().optional(),
      publishedDate: z.string().optional(),
      score: z.number().optional()
    })
  ),
  summary: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    total: z.number(),
    fixable: z.number()
  }),
  sbom: z
    .object({
      packages: z.number(),
      licenses: z.array(z.string()).optional()
    })
    .optional(),
  scanTime: z.string(),
  scanner: z.string(),
  imageDetails: z
    .object({
      size: z.number().optional(),
      layers: z.number().optional(),
      os: z.string().optional(),
      architecture: z.string().optional()
    })
    .optional(),
  recommendations: z.array(z.string()).optional()
});

// Type aliases
export type ScanInput = z.infer<typeof ScanImageInput>;
export type ScanOutput = z.infer<typeof ScanImageOutput>;


/**
 * Main handler implementation
 */
const scanImageHandler: MCPTool<ScanInput, ScanOutput> = {
  name: 'scan_image',
  description: 'Scan Docker image for security vulnerabilities',
  category: 'workflow',
  inputSchema: ScanImageInput,
  outputSchema: ScanImageOutput,

  handler: async (input: ScanInput, context: MCPToolContext): Promise<ScanOutput> => {
    const { logger, sessionService, progressEmitter, dockerService } = context;
    const {
      sessionId,
      imageId,
      imageTag,
      scanner,
      severityThreshold,
      ignoreUnfixed,
      scanLayers: _scanLayers
    } = input;

    logger.info(
      {
        sessionId,
        imageId,
        imageTag,
        scanner,
        severityThreshold
      },
      'Starting image security scan'
    );

    try {
      // Determine image to scan using helper function
      const scanTarget = await getScanTarget(imageId, imageTag, sessionId, sessionService);

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'scan_image',
          status: 'in_progress',
          message: `Scanning image ${scanTarget}`,
          progress: 0.2
        });
      }

      // Perform scan using helper function
      const scanResult = await performDockerScan(scanTarget, dockerService, context);

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'scan_image',
          status: 'in_progress',
          message: 'Analyzing vulnerabilities',
          progress: 0.7
        });
      }

      // Process scan results using helper function
      const { filteredVulnerabilities: finalVulnerabilities, fixableCount } = processScanResults(
        scanResult,
        severityThreshold,
        ignoreUnfixed
      );

      // Generate recommendations using helper function
      const recommendations = generateRecommendations(finalVulnerabilities, scanResult.summary);

      // Build output
      const output: ScanOutput = {
        success: true,
        vulnerabilities: finalVulnerabilities.map((v) => ({
          severity: v.severity === 'unknown' ? 'low' : v.severity,
          cve: v.cve ?? '',
          package: v.package,
          version: v.version,
          fixedVersion: v.fixedVersion,
          description: v.description
        })),
        summary: {
          ...scanResult.summary,
          fixable: fixableCount
        },
        sbom: {
          packages: 0, // Would be populated by actual scanner
          licenses: []
        },
        scanTime: String(
          (typeof scanResult.scanTime === 'number'
            ? scanResult.scanTime
            : parseInt(String(scanResult.scanTime), 10)) || 0
        ),
        scanner: scanner === 'auto' ? 'trivy' : (scanner ?? 'trivy'),
        imageDetails: await getImageDetails(sessionId, sessionService),
        recommendations
      };

      // Update session with scan results
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session: any) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            scan_result: {
              scanner: 'trivy',
              vulnerabilities: output.vulnerabilities.map((vuln) => ({
                id: vuln.cve,
                severity: vuln.severity,
                package: vuln.package,
                version: vuln.version,
                fixed_version: vuln.fixedVersion,
                description: vuln.description
              })),
              summary: output.summary,
              scan_duration_ms:
                typeof output.scanTime === 'string' ? parseInt(output.scanTime) : output.scanTime
            }
          }
        }));
      }

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'scan_image',
          status: 'completed',
          message: `Scan complete: ${output.summary.total} vulnerabilities found`,
          progress: 1.0
        });
      }

      // Log results
      logger.info(
        {
          total: output.summary.total,
          critical: output.summary.critical,
          high: output.summary.high,
          fixable: output.summary.fixable
        },
        'Security scan completed'
      );

      // Fail if critical vulnerabilities found and threshold is strict
      if (severityThreshold === 'critical' && output.summary.critical > 0) {
        logger.error('Critical vulnerabilities found, failing scan');
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          `Found ${output.summary.critical} critical vulnerabilities`
        );
      }

      return output;
    } catch (error) {
      logger.error({ error }, 'Image scan failed');

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'scan_image',
          status: 'failed',
          message: 'Security scan failed',
          progress: 0
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'tag_image',
    reason: 'Tag the scanned image for registry push',
    paramMapper: (output) => ({
      scan_passed: output.summary.critical === 0,
      vulnerabilities: output.summary.total
    })
  }
};

// Default export for registry
export default scanImageHandler;
