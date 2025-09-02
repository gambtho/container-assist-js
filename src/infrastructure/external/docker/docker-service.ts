/**
 * Docker Service - Comprehensive Docker operations with automatic fallback
 * Combines Docker client, CLI wrapper, and Trivy scanner
 */

import { EventEmitter } from 'events'
import { DockerCLI } from '../cli/docker-cli.js'
import { TrivyScanner } from '../cli/trivy.js'
import {
  ok,
  fail,
  Result,
  Logger,
  ErrorCode,
  InfrastructureError,
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions
} from '../../domain/types/index.js'

import { DockerClient } from './client.js'
import type { ImageInfo } from '../external-types.js'

// Use consolidated domain types instead of local duplicates

// Timeout constants for Docker operations
const DOCKER_TIMEOUTS = {
  SCAN_DEFAULT: 300000,     // 5 minutes for vulnerability scanning
} as const

export interface ScanResult {
  summary: any
  scanner: string
  scannerVersion: string
  scanDate: string
  rawData: any
}

export interface ServiceConfig {
  docker?: any
  preferredStrategy?: 'dockerode' | 'cli'
}

export interface DockerProgressEmitter {
  emit(data: {
    step: string
    status: string
    progress: number
    message: string
    metadata?: any
  }): Promise<void>
}

export interface HealthStatus {
  overall: boolean
  services: {
    dockerode: boolean
    cli: boolean
    trivy: boolean
  }
  preferredStrategy: string
  capabilities: {
    build: boolean
    scan: boolean
    push: boolean
    inspect: boolean
  }
  systemInfo?: {
    containers: number
    images: number
    serverVersion: string
    architecture: string
    os: string
  }
}

export class DockerService extends EventEmitter {
  private readonly logger: Logger
  private readonly progressEmitter: DockerProgressEmitter | null

  private readonly dockerClient: any
  private readonly dockerCLI: DockerCLI
  private readonly trivyScanner: TrivyScanner

  private dockerodeAvailable: boolean = false
  private cliAvailable: boolean = false
  private trivyAvailable: boolean = false
  private preferredStrategy: 'dockerode' | 'cli'

  constructor(config: ServiceConfig = {}, logger: Logger, progressEmitter: DockerProgressEmitter | null = null) {
    super()

    this.logger = logger.child({ component: 'DockerService' })
    this.progressEmitter = progressEmitter

    // Initialize components
    this.dockerClient = new DockerClient(config.docker || {}, logger)
    this.dockerCLI = new DockerCLI(config.docker || {}, logger, this.progressEmitter)
    this.trivyScanner = new TrivyScanner((config as any).trivy || {}, logger, this.progressEmitter)

    // Strategy preference (can be changed based on success/failure)
    this.preferredStrategy = config.preferredStrategy || 'dockerode'

    // Setup event forwarding
    this._setupEventForwarding()
  }

  /**
   * Setup event forwarding from components
   */
  private _setupEventForwarding(): void {
    // Forward Docker client events
    this.dockerClient.on('build-progress', (data: any) => {
      this.emit('build-progress', data)
      if (this.progressEmitter) {
        this.progressEmitter.emit({
          step: 'build_image',
          status: 'in_progress',
          progress: data.progress,
          message: data.message,
          metadata: data
        }).catch(err => this.logger.warn({ error: err.message }, 'Failed to emit build progress'))
      }
    })

    this.dockerClient.on('push-progress', (data: any) => {
      this.emit('push-progress', data)
      if (this.progressEmitter) {
        this.progressEmitter.emit({
          step: 'push_image',
          status: 'in_progress',
          progress: data.progress || 0,
          message: data.status,
          metadata: data
        }).catch(err => this.logger.warn({ error: err.message }, 'Failed to emit push progress'))
      }
    })
  }

  /**
   * Initialize and check availability of all components
   */
  async initialize(): Promise<Result<{ dockerode: boolean; cli?: boolean; trivy?: boolean }>> {
    this.logger.info('Initializing unified Docker service')

    await Promise.allSettled([
      this._checkDockerodeAvailability(),
      this._checkCLIAvailability(),
      this._checkTrivyAvailability()
    ])

    // Log availability status
    this.logger.info({
      dockerode: this.dockerodeAvailable,
      cli: this.cliAvailable,
      trivy: this.trivyAvailable,
      preferredStrategy: this.preferredStrategy
    }, 'Docker component availability check')

    // Ensure at least one Docker method is available
    if (!this.dockerodeAvailable && !this.cliAvailable) {
      return fail(new InfrastructureError(
        ErrorCode.DockerNotAvailable,
        'Neither Dockerode nor Docker CLI is available'
      ).message)
    }

    // Warn if Trivy is not available
    if (!this.trivyAvailable) {
      this.logger.warn('Trivy scanner not available - security scanning will be limited')
    }

    this.logger.info({
      strategies: {
        dockerode: this.dockerodeAvailable,
        cli: this.cliAvailable,
        trivy: this.trivyAvailable
      }
    }, 'Unified Docker service initialized successfully')

    return ok({
      dockerode: this.dockerodeAvailable,
      cli: this.cliAvailable,
      trivy: this.trivyAvailable
    })
  }

  /**
   * Check Dockerode availability
   */
  private async _checkDockerodeAvailability(): Promise<void> {
    try {
      const result = await this.dockerClient.ping()
      this.dockerodeAvailable = result.success

      if (result.success) {
        this.logger.info('Dockerode client is available and connected')
      } else {
        this.logger.warn({ error: result.error?.message }); // Fixed logger call
      }
    } catch (error) {
      this.dockerodeAvailable = false
      this.logger.warn({ error: (error as Error).message }, 'Error checking Dockerode availability')
    }
  }

  /**
   * Check Docker CLI availability
   */
  private async _checkCLIAvailability(): Promise<void> {
    try {
      const cliResult = await this.dockerCLI.isAvailable()
      this.cliAvailable = cliResult.success && !!cliResult.data

      if (this.cliAvailable) {
        const pingResult = await this.dockerCLI.ping()
        this.cliAvailable = pingResult.success

        if (pingResult.success) {
          this.logger.info('Docker CLI is available and daemon is responding')
        } else {
          this.logger.warn({ error: pingResult.error?.message }); // Fixed logger call
        }
      } else {
        this.logger.warn('Docker CLI not available')
      }
    } catch (error) {
      this.cliAvailable = false
      this.logger.warn({ error: (error as Error).message }, 'Error checking Docker CLI availability')
    }
  }

  /**
   * Check Trivy availability
   */
  private async _checkTrivyAvailability(): Promise<void> {
    try {
      const trivyResult = await this.trivyScanner.isAvailable()
      this.trivyAvailable = trivyResult.success && !!trivyResult.data

      if (this.trivyAvailable) {
        this.logger.info('Trivy scanner is available')
      } else {
        this.logger.info('Trivy scanner not available - will attempt installation on first scan')
      }
    } catch (error) {
      this.trivyAvailable = false
      this.logger.warn({ error: (error as Error).message }, 'Error checking Trivy availability')
    }
  }

  /**
   * Build Docker image with automatic fallback
   */
  async buildImage(options: DockerBuildOptions): Promise<Result<DockerBuildResult>> {
    const {
      context,
      dockerfile = 'Dockerfile',
      tag,
      noCache = false
    } = options

    this.logger.info({
      context,
      dockerfile,
      tag,
      strategy: this.preferredStrategy,
      noCache
    }, 'Building Docker image')

    // Try preferred strategy first
    let result: Result<DockerBuildResult>
    if (this.preferredStrategy === 'dockerode' && this.dockerodeAvailable) {
      result = await this._buildWithDockerode(options)

      if (!result.success && this.cliAvailable) {
        this.logger.warn({
          error: result.error?.message
        }, 'Dockerode build failed, falling back to CLI')
        result = await this._buildWithCLI(options)
      }
    } else if (this.cliAvailable) {
      result = await this._buildWithCLI(options)

      if (!result.success && this.dockerodeAvailable) {
        this.logger.warn({
          error: result.error?.message
        }, 'CLI build failed, falling back to Dockerode')
        result = await this._buildWithDockerode(options)
      }
    } else {
      return fail('No Docker build method available')
    }

    // Update preferred strategy based on success
    if (result.success && result.data) {
      this._updatePreferredStrategy((result.data as any).method)
    }

    return result
  }

  /**
   * Build with Dockerode
   */
  private async _buildWithDockerode(options: DockerBuildOptions): Promise<Result<DockerBuildResult>> {
    try {
      const buildOptions = {
        context: options.context,
        dockerfile: options.dockerfile,
        tag: options.tag,
        buildArgs: options.buildArgs,
        target: options.target,
        noCache: options.noCache,
        platform: options.platform,
        labels: {
          'built-by': 'container-kit-mcp-unified',
          'build-method': 'dockerode',
          ...options.labels
        },
        squash: options.squash
      }

      const result = await this.dockerClient.buildImage(buildOptions)

      if (result.success) {
        return ok({
          ...result.data,
          method: 'dockerode'
        })
      }

      return result

    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Dockerode build error')
      return fail(`Dockerode build failed: ${(error as Error).message}`)
    }
  }

  /**
   * Build with Docker CLI
   */
  private async _buildWithCLI(options: DockerBuildOptions): Promise<Result<DockerBuildResult>> {
    try {
      const result = await this.dockerCLI.build(options)

      if (result.success && result.data) {
        return ok({
          imageId: result.data.imageId,
          tag: result.data.tag,
          ...(result.data.size !== undefined && { size: result.data.size }),
          ...(result.data.layers !== undefined && { layers: result.data.layers }),
          ...(result.data.buildTime !== undefined && { buildTime: result.data.buildTime }),
          ...(result.data.digest !== undefined && { digest: result.data.digest }),
          method: 'cli'
        } as DockerBuildResult)
      }

      return result as Result<DockerBuildResult>

    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'CLI build error')
      return fail(`CLI build failed: ${(error as Error).message}`)
    }
  }

  /**
   * Tag image with automatic fallback
   */
  async tagImage(imageId: string, newTag: string): Promise<Result<any>> {
    this.logger.info({ imageId, newTag }); // Fixed logger call

    let result: Result<any>
    if (this.dockerodeAvailable) {
      result = await this.dockerClient.tagImage(imageId, newTag)

      if (!result.success && this.cliAvailable) {
        this.logger.warn('Dockerode tag failed, falling back to CLI')
        result = await this.dockerCLI.tag(imageId, newTag)
      }
    } else if (this.cliAvailable) {
      result = await this.dockerCLI.tag(imageId, newTag)
    } else {
      return fail('No Docker tag method available')
    }

    return result
  }

  /**
   * Push image with automatic fallback
   */
  async pushImage(tag: string, auth: any = null): Promise<Result<any>> {
    this.logger.info({ tag, hasAuth: !!auth }); // Fixed logger call

    let result: Result<any>
    if (this.dockerodeAvailable) {
      result = await this.dockerClient.pushImage(tag, auth)

      if (!result.success && this.cliAvailable) {
        this.logger.warn('Dockerode push failed, falling back to CLI')
        result = await this.dockerCLI.push(tag, { quiet: false })
      }
    } else if (this.cliAvailable) {
      result = await this.dockerCLI.push(tag, { quiet: false })
    } else {
      return fail('No Docker push method available')
    }

    return result
  }

  /**
   * Inspect image with automatic fallback
   */
  async inspectImage(imageId: string): Promise<Result<ImageInfo>> {
    let result: Result<any>
    if (this.dockerodeAvailable) {
      result = await this.dockerClient.inspectImage(imageId)

      if (!result.success && this.cliAvailable) {
        result = await this.dockerCLI.inspect(imageId)
      }
    } else if (this.cliAvailable) {
      result = await this.dockerCLI.inspect(imageId)
    } else {
      return fail('No Docker inspect method available')
    }

    return result
  }

  /**
   * Remove image with automatic fallback
   */
  async removeImage(imageId: string, force: boolean = false): Promise<Result<any>> {
    let result: Result<any>
    if (this.dockerodeAvailable) {
      result = await this.dockerClient.removeImage(imageId, force)

      if (!result.success && this.cliAvailable) {
        result = await this.dockerCLI.remove(imageId, { force })
      }
    } else if (this.cliAvailable) {
      result = await this.dockerCLI.remove(imageId, { force })
    } else {
      return fail('No Docker remove method available')
    }

    return result
  }

  /**
   * List images with automatic fallback
   */
  async listImages(filters: Record<string, any> = {}): Promise<Result<any[]>> {
    let result: Result<any>
    if (this.dockerodeAvailable) {
      result = await this.dockerClient.listImages(filters)

      if (!result.success && this.cliAvailable) {
        const cliFilters = Object.entries(filters).map(([k, v]) => `${k}=${v}`)
        result = await this.dockerCLI.listImages({ filter: cliFilters })
      }
    } else if (this.cliAvailable) {
      const cliFilters = Object.entries(filters).map(([k, v]) => `${k}=${v}`)
      result = await this.dockerCLI.listImages({ filter: cliFilters })
    } else {
      return fail('No Docker list method available')
    }

    return result
  }

  /**
   * Scan image for vulnerabilities
   */
  async scanImage(image: string, options: ScanOptions = {}): Promise<Result<DockerScanResult>> {
    this.logger.info({
      image,
      severity: options.severity,
      ignoreUnfixed: options.ignoreUnfixed
    }, 'Scanning image for vulnerabilities')

    // Emit progress for scan start
    if (this.progressEmitter) {
      this.progressEmitter.emit({
        step: 'scan_image',
        status: 'in_progress',
        progress: 0.1,
        message: `Starting vulnerability scan of ${image}`
      }).catch(err => this.logger.warn({ error: err.message }, 'Failed to emit scan progress'))
    }

    const result = await this.trivyScanner.scan(image, {
      severity: options.severity || ['CRITICAL', 'HIGH'],
      ignoreUnfixed: options.ignoreUnfixed || false,
      timeout: options.timeout || DOCKER_TIMEOUTS.SCAN_DEFAULT,
      scanners: options.scanners || ['vuln'],
      ...options
    })

    // Emit progress for scan completion
    if (this.progressEmitter) {
      const status = result.success ? 'completed' : 'failed'
      const message = result.success
        ? `Scan completed - ${result.data?.summary?.total || 0} vulnerabilities found`
        : `Scan failed: ${result.error?.message}`

      this.progressEmitter.emit({
        step: 'scan_image',
        status,
        progress: 1.0,
        message,
        metadata: result.success ? {
          vulnerabilities: result.data?.summary?.total,
          critical: result.data?.summary?.critical,
          high: result.data?.summary?.high
        } : undefined
      }).catch(err => this.logger.warn({ error: err.message }, 'Failed to emit scan progress'))
    }

    return result
  }

  /**
   * Get Docker system information
   */
  async getSystemInfo(): Promise<Result<any>> {
    let result: Result<any>
    if (this.dockerodeAvailable) {
      result = await this.dockerClient.getSystemInfo()

      if (!result.success && this.cliAvailable) {
        result = await this.dockerCLI.getSystemInfo()
      }
    } else if (this.cliAvailable) {
      result = await this.dockerCLI.getSystemInfo()
    } else {
      return fail('No Docker system info method available')
    }

    return result
  }

  /**
   * Clean up Docker resources
   */
  async cleanup(options: any = {}): Promise<Result<any>> {
    if (this.cliAvailable) {
      return await this.dockerCLI.cleanup(options)
    }

    return fail('Docker cleanup only available via CLI')
  }

  /**
   * Update Trivy vulnerability database
   */
  async updateTrivyDB(options: any = {}): Promise<Result<any>> {
    return await this.trivyScanner.updateDB(options)
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<Result<HealthStatus>> {
    const health: HealthStatus = {
      overall: true,
      services: {
        dockerode: this.dockerodeAvailable,
        cli: this.cliAvailable,
        trivy: this.trivyAvailable
      },
      preferredStrategy: this.preferredStrategy,
      capabilities: {
        build: this.dockerodeAvailable || this.cliAvailable,
        scan: this.trivyAvailable,
        push: this.dockerodeAvailable || this.cliAvailable,
        inspect: this.dockerodeAvailable || this.cliAvailable
      }
    }

    // Check if any critical service is available
    health.overall = health.capabilities.build

    // Get additional info if available
    if (this.dockerodeAvailable || this.cliAvailable) {
      try {
        const infoResult = await this.getSystemInfo()
        if (infoResult.success) {
          health.systemInfo = {
            containers: infoResult.data.containers,
            images: infoResult.data.images,
            serverVersion: infoResult.data.serverVersion,
            architecture: infoResult.data.architecture,
            os: infoResult.data.os
          }
        }
      } catch (error) {
        this.logger.warn({ error: (error as Error).message }, 'Failed to get system info for health check')
      }
    }

    return ok(health)
  }

  /**
   * Update preferred strategy based on success/failure patterns
   */
  private _updatePreferredStrategy(successfulMethod: string): void {
    if (successfulMethod && successfulMethod !== this.preferredStrategy) {
      const oldStrategy = this.preferredStrategy
      this.preferredStrategy = successfulMethod as 'dockerode' | 'cli'

      this.logger.info({
        from: oldStrategy,
        to: this.preferredStrategy
      }, 'Updated preferred Docker strategy')
    }
  }

  /**
   * Force refresh of component availability
   */
  async refreshAvailability(): Promise<Result<{ dockerode: boolean; cli?: boolean; trivy?: boolean }>> {
    this.logger.info('Refreshing Docker component availability')
    return await this.initialize()
  }

  /**
   * Close all connections and cleanup
   */
  async close(): Promise<void> {
    this.logger.info('Closing unified Docker service')

    const cleanupPromises: Promise<void>[] = []

    if (this.dockerClient) {
      cleanupPromises.push(
        this.dockerClient.close()
          .catch((err: Error) => this.logger.warn({ error: err.message }, 'Failed to close dockerClient'))
      )
    }

    await Promise.all(cleanupPromises)

    this.removeAllListeners()
    this.logger.info('Unified Docker service closed')
  }

  /**
   * Get service metrics and statistics
   */
  getMetrics() {
    return {
      availability: {
        dockerode: this.dockerodeAvailable,
        cli: this.cliAvailable,
        trivy: this.trivyAvailable
      },
      preferredStrategy: this.preferredStrategy,
      initialized: this.dockerodeAvailable || this.cliAvailable
    }
  }

  /**
   * Check if Docker is available (any method)
   */
  isDockerAvailable(): boolean {
    return this.dockerodeAvailable || this.cliAvailable
  }

  /**
   * Check if security scanning is available
   */
  isScanningAvailable(): boolean {
    return this.trivyAvailable || (this.cliAvailable && !!this.trivyScanner)
  }
}


