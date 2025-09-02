/**
 * Trivy Security Scanner Integration
 * Provides vulnerability scanning with automatic installation and Docker fallback
 */

import { CLIExecutor } from './executor.js'
import { ok, fail, type Result } from '../../domain/types/result.js'
import { z } from 'zod'
import type { Logger } from '../../domain/types/index.js'

// Trivy vulnerability schema
const VulnerabilitySchema = z.object({
  VulnerabilityID: z.string(),
  PkgName: z.string(),
  PkgPath: z.string().optional(),
  PkgID: z.string().optional(),
  InstalledVersion: z.string(),
  FixedVersion: z.string().optional(),
  Status: z.string().optional(),
  Layer: z.object({
    Digest: z.string().optional(),
    DiffID: z.string().optional(),
  }).optional(),
  SeveritySource: z.string().optional(),
  PrimaryURL: z.string().optional(),
  DataSource: z.object({
    ID: z.string().optional(),
    Name: z.string().optional(),
    URL: z.string().optional(),
  }).optional(),
  Title: z.string().optional(),
  Description: z.string().optional(),
  Severity: z.enum(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  CweIDs: z.array(z.string()).optional(),
  CVSS: z.record(z.string(), z.any()).optional(),
  References: z.array(z.string()).optional(),
  PublishedDate: z.string().optional(),
  LastModifiedDate: z.string().optional(),
})

// Trivy scan result schema
const TrivyScanResultSchema = z.object({
  SchemaVersion: z.number().optional(),
  ArtifactName: z.string().optional(),
  ArtifactType: z.string().optional(),
  Metadata: z.object({
    OS: z.object({
      Family: z.string().optional(),
      Name: z.string().optional(),
    }).optional(),
    ImageID: z.string().optional(),
    DiffIDs: z.array(z.string()).optional(),
    RepoTags: z.array(z.string()).optional(),
    RepoDigests: z.array(z.string()).optional(),
    ImageConfig: z.record(z.string(), z.any()).optional(),
  }).optional(),
  Results: z.array(z.object({
    Target: z.string(),
    Class: z.string().optional(),
    Type: z.string().optional(),
    Vulnerabilities: z.array(VulnerabilitySchema).nullable().optional(),
    Secrets: z.array(z.any()).optional(),
    Licenses: z.array(z.any()).optional(),
  })).optional(),
})

export interface ScanOptions {
  severity?: string[]
  ignoreUnfixed?: boolean
  format?: string
  timeout?: number
  skipDBUpdate?: boolean
  skipJavaDBUpdate?: boolean
  scanners?: string[]
  imageConfigScanners?: string[]
  exitCode?: number | null
}

export interface ScanSummary {
  critical: number
  high: number
  medium: number
  low: number
  unknown: number
  total: number
  vulnerabilities: any[]
  secrets: number
  licenses: number
}

export interface ScanResult {
  success: boolean
  image: string
  summary: ScanSummary
  scanner: string
  scannerVersion: string
  scanDate: string
  vulnerabilities: any[]
  rawData: any
  metadata?: any
}

export class TrivyScanner {
  private readonly executor: CLIExecutor
  private readonly logger: Logger
  private trivyVersion: string | null = null

  constructor(_config: any, logger: Logger, _progressEmitter?: any) {
    this.executor = new CLIExecutor(logger)
    this.logger = (logger as any).child({ component: 'TrivyScanner' })
  }

  /**
   * Check if Trivy is available
   */
  async isAvailable(): Promise<Result<boolean>> {
    const availableResult = await this.executor.which('trivy')

    if (availableResult.success && availableResult.data) {
      try {
        // Check version
        const result = await this.executor.execute('trivy', ['--version'], { timeout: 5000 })
        if (result.success && result.data) {
          const versionMatch = result.data.stdout?.match(/Version: (.+)/)
          if (versionMatch && versionMatch[1]) {
            this.trivyVersion = versionMatch[1].trim()
            this.logger.info({ version: this.trivyVersion }); // Fixed logger call
          }
        }
      } catch (error) {
        this.logger.warn({ error: (error as Error).message }, 'Could not determine Trivy version')
      }

      return ok(true)
    }

    return ok(false)
  }

  /**
   * Scan image for vulnerabilities (main method)
   */
  async scan(image: string, options: ScanOptions = {}): Promise<Result<ScanResult>> {
    const {
      severity = ['CRITICAL', 'HIGH'],
      ignoreUnfixed = false,
      format = 'json',
      timeout = 300000,
      skipDBUpdate = false,
      skipJavaDBUpdate = false,
      scanners = ['vuln'],
      imageConfigScanners = [],
      exitCode = null
    } = options

    this.logger.info({
      image,
      severity,
      scanners,
      timeout
    }, 'Starting Trivy vulnerability scan')

    try {
      // Check if Trivy is available
      const availabilityResult = await this.isAvailable()
      if (!availabilityResult.success || !availabilityResult.data) {
        return fail('Trivy scanner not available')
      }

      // Update database if needed
      if (!skipDBUpdate) {
        this.logger.info('Updating Trivy vulnerability database')
        await this.updateDB({ timeout: 120000 })
      }

      // Prepare scan arguments
      const args = ['image']

      // Add severity filters
      if (severity.length > 0) {
        args.push('--severity', severity.join(','))
      }

      // Add ignore unfixed option
      if (ignoreUnfixed) {
        args.push('--ignore-unfixed')
      }

      // Skip Java DB update if requested
      if (skipJavaDBUpdate) {
        args.push('--skip-java-db-update')
      }

      // Add scanners
      if (scanners.length > 0) {
        args.push('--scanners', scanners.join(','))
      }

      if (imageConfigScanners.length > 0) {
        args.push('--image-config-scanners', imageConfigScanners.join(','))
      }

      // Set output format
      args.push('--format', format)

      // Quiet mode for JSON output
      if (format === 'json') {
        args.push('--quiet')
      }

      // Set exit code
      if (exitCode !== null) {
        args.push('--exit-code', exitCode.toString())
      }

      // Add image name
      args.push(image)

      // Execute scan
      const result = await this.executor.executeJSON(
        'trivy',
        args,
        TrivyScanResultSchema.optional(),
        { timeout }
      )

      if (!result.success) {
        this.logger.error({ error: result.error?.message }); // Fixed logger call
        return fail(`Trivy scan failed: ${result.error?.message}`)
      }

      // Process scan results
      const scanData = result.data?.data
      const summary = this._processScanResults(scanData, image)

      this.logger.info({
        image,
        vulnerabilities: summary.total,
        critical: summary.critical,
        high: summary.high
      }, 'Trivy scan completed')

      return ok({
        success: true,
        image,
        scanDate: new Date().toISOString(),
        scanner: 'trivy',
        scannerVersion: this.trivyVersion || 'unknown',
        summary,
        vulnerabilities: summary.vulnerabilities,
        rawData: scanData,
        metadata: scanData?.Metadata
      })

    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Trivy scan error')
      return fail(`Trivy scan error: ${(error as Error).message}`)
    }
  }

  /**
   * Update Trivy vulnerability database
   */
  async updateDB(options: { timeout?: number } = {}): Promise<Result<any>> {
    const { timeout = 300000 } = options

    this.logger.info('Updating Trivy vulnerability database')

    try {
      const result = await this.executor.execute(
        'trivy',
        ['image', '--download-db-only', '--no-progress'],
        { timeout }
      )

      if (result.success) {
        this.logger.info('Trivy database updated successfully')
        return ok({ updated: true })
      } else {
        this.logger.warn({ error: result.error?.message }); // Fixed logger call
        return fail(`Database update failed: ${result.error?.message}`)
      }

    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Trivy database update error')
      return fail(`Database update error: ${(error as Error).message}`)
    }
  }

  /**
   * Check Trivy version
   */
  async checkVersion(): Promise<Result<string>> {
    const result = await this.executor.execute('trivy', ['--version'], { timeout: 5000 })

    if (!result.success || !result.data) {
      return fail(`Failed to get Trivy version: ${result.error?.message}`)
    }

    const versionMatch = result.data.stdout?.match(/Version: (.+)/)
    if (versionMatch && versionMatch[1]) {
      const version = versionMatch[1].trim()
      return ok(version)
    }

    return fail('Could not parse Trivy version')
  }

  /**
   * Process scan results into summary format
   */
  private _processScanResults(scanData: any, _image: string): ScanSummary {
    const summary: ScanSummary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
      total: 0,
      vulnerabilities: [],
      secrets: 0,
      licenses: 0
    }

    if (!scanData || !scanData.Results) {
      return summary
    }

    // Process vulnerabilities
    for (const result of scanData.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          summary.total++
          summary.vulnerabilities.push({
            id: vuln.VulnerabilityID,
            package: vuln.PkgName,
            installedVersion: vuln.InstalledVersion,
            fixedVersion: vuln.FixedVersion,
            severity: vuln.Severity,
            title: vuln.Title,
            description: vuln.Description,
            references: vuln.References
          })

          // Count by severity
          switch (vuln.Severity) {
            case 'CRITICAL':
              summary.critical++
              break
            case 'HIGH':
              summary.high++
              break
            case 'MEDIUM':
              summary.medium++
              break
            case 'LOW':
              summary.low++
              break
            default:
              summary.unknown++
          }
        }
      }

      // Count secrets and licenses
      if (result.Secrets) {
        summary.secrets += result.Secrets.length
      }
      if (result.Licenses) {
        summary.licenses += result.Licenses.length
      }
    }

    return summary
  }
}


