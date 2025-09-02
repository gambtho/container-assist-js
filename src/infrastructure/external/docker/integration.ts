/**
 * Docker Integration Layer for Tool Handlers
 * Provides Docker interface compatible with existing handlers
 */

import type { Logger } from '../../domain/types/index.js'
import { DockerService } from './docker-service.js'
import { ok, fail, type Result } from '../../domain/types/result.js'
import type { IDockerService } from '../../../domain/types/index.js'
import type { ImageInfo } from '../external-types.js'

interface BuildConfig {
  context: string
  dockerfile?: string
  tag: string
  buildArgs?: Record<string, string>
  target?: string
  noCache?: boolean
  platform?: string
  labels?: Record<string, string>
  squash?: boolean
  sessionId?: string
}

interface BuildResult {
  success: boolean
  imageId: string
  tag: string
  size: number
  layers: number
  buildTime: number
  digest: string | undefined
  method: string | undefined
}

// Using shared ImageInfo interface from types.js

interface ScanResult {
  success: boolean
  image: string
  summary: any
  scanner: string
  scannerVersion: string
  scanDate: string
  vulnerabilities: any[]
  rawData: any
}

interface PushResult {
  success: boolean
  tag: string
  digest: string | undefined
  size: number | undefined
}

/**
 * Docker integration adapter that provides methods expected by enhanced tool handlers
 */
export class DockerIntegration implements IDockerService {
  private readonly service: DockerService
  private readonly logger: Logger
  private initialized: boolean = false

  constructor(config: any, logger: Logger, progressEmitter: any) {
    this.service = new DockerService(config, logger, progressEmitter)
    this.logger = (logger as any).child({ component: 'DockerIntegration' })
  }

  /**
   * Initialize Docker service
   */
  async initialize(): Promise<Result<{ alreadyInitialized?: boolean }>> {
    if (this.initialized) {
      return ok({ alreadyInitialized: true })
    }

    try {
      await this.service.initialize()
      this.initialized = true
      this.logger.info('Docker integration initialized')
      return ok({ alreadyInitialized: false })
    } catch (error) {
      return fail(`Failed to initialize Docker integration: ${(error as Error).message}`)
    }
  }

  /**
   * Build image - compatible with enhanced handlers
   */
  async buildImage(buildConfig: BuildConfig): Promise<Result<BuildResult>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult as Result<BuildResult>
      }
    }

    // Transform buildConfig to match unified service interface
    const options = {
      context: buildConfig.context,
      dockerfile: buildConfig.dockerfile || 'Dockerfile',
      tag: buildConfig.tag,
      buildArgs: buildConfig.buildArgs || {},
      ...(buildConfig.target && { target: buildConfig.target }),
      noCache: buildConfig.noCache || false,
      ...(buildConfig.platform && { platform: buildConfig.platform }),
      labels: {
        'session-id': buildConfig.sessionId || '',
        'built-by': 'container-kit-mcp',
        'build-date': new Date().toISOString(),
        ...buildConfig.labels
      },
      squash: buildConfig.squash || false
    }

    const result = await this.service.buildImage(options)

    if (result.success && result.data) {
      // Transform result to match expected format for enhanced handlers
      return ok({
        success: true,
        imageId: result.data.imageId,
        tag: result.data.tag,
        size: result.data.size || 0,
        layers: typeof result.data.layers === 'number' ? result.data.layers : (result.data.layers?.length || 0),
        buildTime: result.data.buildTime || 0,
        digest: result.data.digest,
        method: result.data.method
      } as BuildResult)
    }

    return fail('Build failed')
  }

  /**
   * Create build stream - returns a promise that resolves with build result
   * This method is used by existing enhanced handlers
   */
  async createBuildStream(buildConfig: BuildConfig): Promise<Result<BuildResult>> {
    // For the unified service, we don't need to create streams manually
    // The build process handles streaming internally
    return await this.buildImage(buildConfig)
  }

  /**
   * Inspect image
   */
  async inspectImage(imageId: string): Promise<Result<ImageInfo>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult as Result<ImageInfo>
      }
    }

    const result = await this.service.inspectImage(imageId)

    if (result.success && result.data) {
      // Transform to match expected format
      return ok({
        Id: result.data.id,
        RepoTags: result.data.repoTags,
        RepoDigests: result.data.repoDigests,
        Created: result.data.created,
        Size: result.data.size,
        VirtualSize: result.data.virtualSize,
        Architecture: result.data.architecture,
        Os: result.data.os,
        Variant: result.data.variant,
        Config: result.data.config,
        RootFS: result.data.rootFS
      })
    }

    return result as any
  }

  /**
   * Tag image
   */
  async tagImage(imageId: string, newTag: string): Promise<Result<any>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult
      }
    }

    return await this.service.tagImage(imageId, newTag)
  }

  /**
   * Push image
   */
  async pushImage(tag: string, auth: any = null): Promise<Result<PushResult>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult as Result<PushResult>
      }
    }

    const result = await this.service.pushImage(tag, auth)

    if (result.success) {
      return ok({
        success: true,
        tag,
        digest: result.data?.digest,
        size: result.data?.size
      })
    }

    return result as Result<PushResult>
  }

  /**
   * Scan image for vulnerabilities
   */
  async scanImage(image: string, options: any = {}): Promise<Result<ScanResult>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult as Result<ScanResult>
      }
    }

    const result = await this.service.scanImage(image, options)

    if (result.success && result.data) {
      // Transform scan result to match expected format
      return ok({
        success: true,
        image,
        summary: result.data.summary,
        scanner: result.data.scanner,
        scannerVersion: result.data.scannerVersion,
        scanDate: result.data.scanDate,
        vulnerabilities: result.data.summary?.vulnerabilities || [],
        rawData: result.data.rawData
      })
    }

    return result as Result<ScanResult>
  }

  /**
   * Remove image
   */
  async removeImage(imageId: string, force: boolean = false): Promise<Result<any>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult
      }
    }

    return await this.service.removeImage(imageId, force)
  }

  /**
   * List images
   */
  async listImages(filters: any = {}): Promise<Result<any[]>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult as Result<any[]>
      }
    }

    return await this.service.listImages(filters)
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<Result<any>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult
      }
    }

    return await this.service.getSystemInfo()
  }

  /**
   * Check if Docker is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return false
      }
    }

    return this.service.isDockerAvailable()
  }

  /**
   * Check if scanning is available
   */
  async isScanningAvailable(): Promise<boolean> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return false
      }
    }

    return this.service.isScanningAvailable()
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<Result<any>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return fail('Docker service not initialized')
      }
    }

    return await this.service.getHealthStatus()
  }

  /**
   * Update Trivy database
   */
  async updateTrivyDB(_options: any = {}): Promise<Result<any>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult
      }
    }

    return await this.service.updateTrivyDB()
  }

  /**
   * Cleanup Docker resources
   */
  async cleanup(_options: any = {}): Promise<Result<any>> {
    if (!this.initialized) {
      const initResult = await this.initialize()
      if (!initResult.success) {
        return initResult
      }
    }

    return await this.service.cleanup()
  }

  /**
   * Refresh component availability
   */
  async refreshAvailability(): Promise<Result<any>> {
    try {
      await this.service.refreshAvailability()
      return ok({ refreshed: true })
    } catch (error) {
      return fail(`Failed to refresh availability: ${(error as Error).message}`)
    }
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      ...this.service.getMetrics(),
      initialized: this.initialized
    }
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    if (this.service) {
      await this.service.close()
    }
    this.initialized = false
    this.logger.info('Docker integration closed')
  }

  // Event forwarding methods for compatibility
  on(event: string, listener: (...args: any[]) => void) {
    return this.service.on(event, listener)
  }

  off(event: string, listener: (...args: any[]) => void) {
    return this.service.off(event, listener)
  }

  emit(event: string, ...args: any[]) {
    return this.service.emit(event, ...args)
  }
}

/**
 * Factory function to create Docker integration instance
 */
export function createDockerIntegration(config: any, logger: Logger, progressEmitter: any): DockerIntegration {
  return new DockerIntegration(config, logger, progressEmitter)
}


