/**
 * Docker CLI Wrapper - Fallback for Docker operations when Dockerode fails
 * Provides comprehensive Docker command-line interface with error recovery
 */

import { CLIExecutor } from './executor.js'
import {
  ok,
  fail,
  Result,
  DockerBuildOptions,
  DockerBuildResult
} from '../../domain/types/index.js'
import type { Logger } from '../../domain/types/index.js'

// Use consolidated domain types instead of local duplicates

export interface ImageInfo {
  id: string
  repoTags: string[]
  repoDigests: string[]
  created: string
  size: number
  virtualSize: number
  architecture: string
  os: string
  variant: string | undefined
  config: {
    cmd: string[] | undefined
    entrypoint: string[] | undefined
    env: string[]
    exposedPorts: string[]
    workdir: string | undefined
    user: string | undefined
    labels: Record<string, string>
  }
  rootFS: {
    type: string | undefined
    layers: string[]
  }
}

export interface PushOptions {
  quiet?: boolean
}

export interface PushResult {
  success: boolean
  tag: string
  digest: string | undefined
  size: number | undefined
}

export interface ListOptions {
  all?: boolean
  quiet?: boolean
  filter?: string[]
}

export interface RemoveOptions {
  force?: boolean
  noPrune?: boolean
}

export interface PullOptions {
  platform?: string
  quiet?: boolean
}

export interface CleanupOptions {
  images?: boolean
  containers?: boolean
  volumes?: boolean
  networks?: boolean
  all?: boolean
  force?: boolean
}

export class DockerCLI {
  private readonly executor: CLIExecutor
  private readonly logger: Logger

  constructor(_config: any, logger: Logger, _progressEmitter?: any) {
    this.executor = new CLIExecutor(logger)
    this.logger = (logger as any).child({ component: 'DockerCLI' })
  }

  /**
   * Check if Docker CLI is available
   */
  async isAvailable(): Promise<Result<boolean>> {
    return await this.executor.which('docker')
  }

  /**
   * Test Docker daemon connectivity via CLI
   */
  async ping(): Promise<Result<any>> {
    const result = await this.executor.execute('docker', ['version'], { timeout: 10000 })

    if (result.success) {
      this.logger.info('Docker CLI is available and daemon is responding')
      return ok(undefined)
    }

    return fail('Docker CLI cannot connect to daemon')
  }

  /**
   * Build Docker image using CLI
   */
  async build(options: DockerBuildOptions): Promise<Result<DockerBuildResult>> {
    const {
      context,
      dockerfile = 'Dockerfile',
      tag,
      buildArgs = {},
      target,
      noCache = false,
      platform,
      labels = {},
      squash = false
    } = options

    this.logger.info({
      context,
      dockerfile,
      tag,
      noCache,
      platform
    }, 'Building Docker image via CLI')

    try {
      // Prepare build arguments
      const args = ['build']

      // Add dockerfile path if not default
      if (dockerfile !== 'Dockerfile') {
        args.push('-f', dockerfile)
      }

      // Add tag
      args.push('-t', tag)

      // Add build arguments
      Object.entries(buildArgs).forEach(([key, value]) => {
        args.push('--build-arg', `${key}=${value}`)
      })

      // Add labels
      Object.entries(labels).forEach(([key, value]) => {
        args.push('--label', `${key}=${value}`)
      })

      // Add other options
      if (target) {
        args.push('--target', target)
      }

      if (noCache) {
        args.push('--no-cache')
      }

      if (platform) {
        args.push('--platform', platform)
      }

      if (squash) {
        args.push('--squash')
      }

      // Set progress output
      args.push('--progress', 'plain')

      // Add context path
      args.push(context)

      // Execute build with extended timeout
      const result = await this.executor.executeStream('docker', args, {
        timeout: 600000, // 10 minutes
        cwd: process.cwd(),
        onStdout: (data: string) => {
          // Parse build progress from CLI output
          const lines = data.split('\n').filter(line => line.trim())
          for (const line of lines) {
            if (line.includes('#') && (line.includes('FROM') || line.includes('RUN') || line.includes('COPY'))) {
              this.logger.debug({ step: line.trim() }, 'Build step')
            }
          }
        },
        onStderr: (data: string) => {
          // Log build warnings and errors
          if (data.includes('WARNING') || data.includes('Warning')) {
            this.logger.warn({ warning: data.trim() }, 'Build warning')
          } else if (data.includes('ERROR') || data.includes('Error')) {
            this.logger.error({ error: data.trim() }, 'Build error')
          }
        }
      })

      if (!result.success) {
        return result as Result<DockerBuildResult>
      }

      // Get image ID by inspecting the built image
      const inspectResult = await this.inspect(tag)
      if (inspectResult.success && inspectResult.data) {
        return ok({
          imageId: inspectResult.data.id,
          tag,
          size: inspectResult.data.size,
          method: 'cli'
        })
      }

      // Fallback: try to get image ID from docker images
      const listResult = await this.executor.execute('docker', ['images', tag, '--quiet'], { timeout: 30000 })
      if (listResult.success && listResult.data?.stdout?.trim()) {
        const imageId = listResult.data.stdout.trim().split('\n')[0]
        return ok({
          imageId: imageId || '',
          tag,
          method: 'cli'
        })
      }

      return fail('Build completed but unable to retrieve image ID')

    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Docker CLI build failed')
      return fail(`Docker CLI build failed: ${(error as Error).message}`)
    }
  }

  /**
   * Tag an image using CLI
   */
  async tag(imageId: string, newTag: string): Promise<Result<any>> {
    const result = await this.executor.execute('docker', ['tag', imageId, newTag], { timeout: 30000 })

    if (result.success) {
      this.logger.info({ imageId, newTag }); // Fixed logger call
      return ok(undefined)
    }

    return fail(`Failed to tag image: ${result.error?.message}`)
  }

  /**
   * Push image to registry using CLI
   */
  async push(tag: string, options: PushOptions = {}): Promise<Result<PushResult>> {
    const { quiet = false } = options

    this.logger.info({ tag }); // Fixed logger call

    const args = ['push']
    if (quiet) {
      args.push('--quiet')
    }
    args.push(tag)

    const result = await this.executor.executeStream('docker', args, {
      timeout: 600000, // 10 minutes
      onStdout: (data: string) => {
        // Parse push progress
        const lines = data.split('\n').filter(line => line.trim())
        for (const line of lines) {
          if (line.includes('Pushing') || line.includes('Pushed') || line.includes('Layer already exists')) {
            this.logger.debug({ progress: line.trim() }, 'Push progress')
          }
        }
      },
      onStderr: (data: string) => {
        if (data.includes('denied') || data.includes('unauthorized')) {
          this.logger.error({ error: data.trim() }, 'Push authentication failed')
        }
      }
    })

    if (result.success) {
      this.logger.info({ tag }); // Fixed logger call
      return ok({
        success: true,
        tag,
        digest: undefined,
        size: undefined
      })
    }

    return fail(`Failed to push image: ${result.error?.message}`)
  }

  /**
   * Pull an image using CLI
   */
  async pull(image: string, options: PullOptions = {}): Promise<Result<any>> {
    const { platform, quiet = false } = options

    this.logger.info({ image, platform }); // Fixed logger call

    const args = ['pull']

    if (platform) {
      args.push('--platform', platform)
    }

    if (quiet) {
      args.push('--quiet')
    }

    args.push(image)

    const result = await this.executor.execute('docker', args, {
      timeout: 600000 // 10 minutes
    })

    if (result.success) {
      this.logger.info({ image }); // Fixed logger call
      return ok(undefined)
    }

    return fail(`Failed to pull image: ${result.error?.message}`)
  }

  /**
   * Inspect an image using CLI
   */
  async inspect(imageId: string): Promise<Result<ImageInfo>> {
    const result = await this.executor.executeJSON(
      'docker',
      ['inspect', imageId],
      null,
      { timeout: 30000 }
    )

    if (!result.success) {
      return fail(`Failed to inspect image: ${result.error?.message}`)
    }

    const imageData = Array.isArray(result.data?.data) ? result.data.data[0] : result.data?.data

    if (!imageData) {
      return fail(`Image not found: ${imageId}`)
    }

    return ok({
      id: imageData.Id,
      repoTags: imageData.RepoTags || [],
      repoDigests: imageData.RepoDigests || [],
      created: imageData.Created,
      size: imageData.Size,
      virtualSize: imageData.VirtualSize,
      architecture: imageData.Architecture,
      os: imageData.Os,
      variant: imageData.Variant || undefined,
      config: {
        cmd: imageData.Config?.Cmd,
        entrypoint: imageData.Config?.Entrypoint,
        env: imageData.Config?.Env || [],
        exposedPorts: Object.keys(imageData.Config?.ExposedPorts || {}),
        workdir: imageData.Config?.WorkingDir,
        user: imageData.Config?.User,
        labels: imageData.Config?.Labels || {}
      },
      rootFS: {
        type: imageData.RootFS?.Type,
        layers: imageData.RootFS?.Layers || []
      }
    })
  }

  /**
   * Remove an image using CLI
   */
  async remove(imageId: string, options: RemoveOptions = {}): Promise<Result<any>> {
    const { force = false, noPrune = false } = options

    const args = ['rmi']

    if (force) {
      args.push('--force')
    }

    if (noPrune) {
      args.push('--no-prune')
    }

    args.push(imageId)

    const result = await this.executor.execute('docker', args, { timeout: 60000 })

    if (result.success) {
      this.logger.info({ imageId }); // Fixed logger call
      return ok(undefined)
    }

    return fail(`Failed to remove image: ${result.error?.message}`)
  }

  /**
   * List images using CLI
   */
  async listImages(options: ListOptions = {}): Promise<Result<ImageInfo[]>> {
    const { all = false, quiet = false, filter = [] } = options

    const args = ['images']

    if (all) {
      args.push('--all')
    }

    if (quiet) {
      args.push('--quiet')
    }

    // Add filters
    filter.forEach(f => {
      args.push('--filter', f)
    })

    args.push('--format', 'json')

    const result = await this.executor.execute('docker', args, { timeout: 30000 })

    if (!result.success) {
      return fail(`Failed to list images: ${result.error?.message}`)
    }

    try {
      // Parse JSON Lines format
      const images = result.data?.stdout
        ?.split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => JSON.parse(line)) || []

      return ok(images.map((img: any) => ({
        id: img.ID,
        repoTags: img.Repository && img.Tag ? [`${img.Repository}:${img.Tag}`] : [],
        repoDigests: [],
        created: img.CreatedAt,
        size: this._parseImageSize(img.Size),
        virtualSize: this._parseImageSize(img.Size),
        architecture: '',
        os: '',
        variant: undefined,
        config: {
          cmd: undefined,
          entrypoint: undefined,
          env: [],
          exposedPorts: [],
          workdir: undefined,
          user: undefined,
          labels: {}
        },
        rootFS: {
          type: undefined,
          layers: []
        }
      })))

    } catch (parseError) {
      this.logger.error({
        error: (parseError as Error).message,
        output: result.data?.stdout?.substring(0, 500)
      }, 'Failed to parse image list output')

      return fail('Failed to parse image list output')
    }
  }

  /**
   * Get Docker system information using CLI
   */
  async getSystemInfo(): Promise<Result<any>> {
    const result = await this.executor.executeJSON(
      'docker',
      ['system', 'info', '--format', 'json'],
      null,
      { timeout: 30000 }
    )

    if (!result.success) {
      return fail(`Failed to get system info: ${result.error?.message}`)
    }

    const info = result.data?.data

    return ok({
      containers: info?.Containers || 0,
      containersRunning: info?.ContainersRunning || 0,
      containersPaused: info?.ContainersPaused || 0,
      containersStopped: info?.ContainersStopped || 0,
      images: info?.Images || 0,
      serverVersion: info?.ServerVersion || 'unknown',
      architecture: info?.Architecture || 'unknown',
      os: info?.OperatingSystem || 'unknown',
      osType: info?.OSType || 'unknown',
      kernelVersion: info?.KernelVersion || 'unknown',
      totalMemory: info?.MemTotal || 0,
      cpus: info?.NCPU || 0,
      storageDriver: info?.Driver || 'unknown',
      loggingDriver: info?.LoggingDriver || 'unknown'
    })
  }

  /**
   * Clean up Docker resources using CLI
   */
  async cleanup(options: CleanupOptions = {}): Promise<Result<any>> {
    const {
      images = false,
      containers = false,
      volumes = false,
      networks = false,
      all = false,
      force = false
    } = options

    const results: Array<{ operation: string; success?: boolean }> = []

    try {
      if (all || images) {
        const args = ['image', 'prune']
        if (all) args.push('--all')
        if (force) args.push('--force')

        const result = await this.executor.execute('docker', args, { timeout: 120000 })
        results.push({ operation: 'image_prune', success: result.success })
      }

      if (all || containers) {
        const args = ['container', 'prune']
        if (force) args.push('--force')

        const result = await this.executor.execute('docker', args, { timeout: 60000 })
        results.push({ operation: 'container_prune', success: result.success })
      }

      if (all || volumes) {
        const args = ['volume', 'prune']
        if (force) args.push('--force')

        const result = await this.executor.execute('docker', args, { timeout: 60000 })
        results.push({ operation: 'volume_prune', success: result.success })
      }

      if (all || networks) {
        const args = ['network', 'prune']
        if (force) args.push('--force')

        const result = await this.executor.execute('docker', args, { timeout: 60000 })
        results.push({ operation: 'network_prune', success: result.success })
      }

      const allSuccessful = results.every(r => r.success)

      if (allSuccessful) {
        this.logger.info({ operations: results }); // Fixed logger call
        return ok({ operations: results })
      } else {
        this.logger.warn({ operations: results }); // Fixed logger call
        return ok({ operations: results, partialFailure: true })
      }

    } catch (error) {
      this.logger.error({ error: (error as Error).message }, 'Docker cleanup failed')
      return fail(`Docker cleanup failed: ${(error as Error).message}`)
    }
  }

  /**
   * Check Docker version and capabilities
   */
  async getVersion(): Promise<Result<any>> {
    const result = await this.executor.executeJSON(
      'docker',
      ['version', '--format', 'json'],
      null,
      { timeout: 10000 }
    )

    if (!result.success) {
      return fail(`Failed to get Docker version: ${result.error?.message}`)
    }

    const version = result.data?.data

    return ok({
      client: {
        version: version?.Client?.Version,
        apiVersion: version?.Client?.ApiVersion,
        platform: version?.Client?.Platform?.Name,
        experimental: version?.Client?.Experimental
      },
      server: {
        version: version?.Server?.Version,
        apiVersion: version?.Server?.ApiVersion,
        minApiVersion: version?.Server?.MinAPIVersion,
        gitCommit: version?.Server?.GitCommit,
        os: version?.Server?.Os,
        arch: version?.Server?.Arch,
        experimental: version?.Server?.Experimental
      }
    })
  }

  /**
   * Parse Docker image size string to bytes
   */
  private _parseImageSize(sizeStr: string): number {
    if (!sizeStr || typeof sizeStr !== 'string') return 0

    const match = sizeStr.match(/^([0-9.]+)\s*([A-Z]*)B?$/i)
    if (!match) return 0

    const value = parseFloat(match[1] || '0')
    const unit = match[2] ? match[2].toUpperCase() : ''

    const multipliers: Record<string, number> = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    }

    return Math.round(value * (multipliers[unit] || 1))
  }
}


