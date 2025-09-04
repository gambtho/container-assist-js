/**
 * Docker Service - Clean dockerode integration
 * Provides Docker operations with proper type safety and error handling
 */

import Docker from 'dockerode';
import type { Logger } from 'pino';
import { DockerError } from '../../errors/index.js';
import { ErrorCode } from '../../contracts/types/errors.js';
import {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions,
} from '../../contracts/types/index.js';

export interface DockerServiceConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: 'http' | 'https' | 'ssh';
}

export interface DockerHealthStatus {
  available: boolean;
  version?: string;
  systemInfo?: {
    os?: string;
    arch?: string;
    containers?: number;
    images?: number;
    serverVersion?: string;
  };
}

interface DockerBuildEvent {
  stream?: string;
  error?: string;
  aux?: {
    ID?: string;
    Digest?: string;
  };
}

interface DockerSystemInfo {
  OperatingSystem?: unknown;
  Architecture?: unknown;
  Containers?: unknown;
  Images?: unknown;
  ServerVersion?: unknown;
}

interface DockerVersionInfo {
  Version?: unknown;
}

export class DockerService {
  private docker: Docker;
  private logger: Logger;

  constructor(config: DockerServiceConfig, logger: Logger) {
    this.logger = logger.child({ service: 'docker' });

    // Initialize Docker with config
    const dockerOptions: Docker.DockerOptions = {};

    if (config.socketPath?.trim()) {
      dockerOptions.socketPath = config.socketPath;
    } else if (config.host?.trim()) {
      dockerOptions.host = config.host;
      dockerOptions.port = config.port ?? 2375;
      dockerOptions.protocol = config.protocol ?? 'http';
    }

    this.docker = new Docker(dockerOptions);
  }

  async initialize(): Promise<void> {
    try {
      await this.docker.ping();
      this.logger.info('Docker service initialized successfully');
    } catch (error) {
      throw new DockerError(
        'Failed to connect to Docker daemon',
        ErrorCode.DOCKER_INIT_FAILED,
        'initialize',
        error as Error,
      );
    }
  }

  async build(contextPath: string, options: DockerBuildOptions): Promise<DockerBuildResult> {
    try {
      this.logger.debug({ contextPath, options }, 'Starting Docker build');

      // Create tar stream from context
      const { pack } = await import('tar-fs');
      const tarStream = pack(contextPath);

      // Prepare build options (only include defined values)
      const buildOptions: Record<string, unknown> = {
        t: options.tags?.[0] ?? options.tag,
        dockerfile: options.dockerfile ?? options.dockerfilePath ?? 'Dockerfile',
        rm: options.rm !== false, // Default to true
      };

      // Add optional build parameters if they exist
      if (options.buildArgs) buildOptions.buildargs = options.buildArgs;
      if (options.target) buildOptions.target = options.target;
      if (options.noCache) buildOptions.nocache = options.noCache;
      if (options.platform) buildOptions.platform = options.platform;
      if (options.pull !== undefined) buildOptions.pull = options.pull;
      if (options.forcerm) buildOptions.forcerm = options.forcerm;
      if (options.squash) buildOptions.squash = options.squash;
      if (options.labels) buildOptions.labels = options.labels;

      // Build the image
      const stream = await this.docker.buildImage(tarStream, buildOptions);

      // Process build output
      const { logs, imageId } = await this.followBuildProgress(stream);

      // Tag additional tags if provided
      if (imageId && options.tags && options.tags.length > 1) {
        await this.tagAdditionalImages(imageId, options.tags.slice(1));
      }

      const result: DockerBuildResult = {
        imageId: imageId ?? '',
        tags: options.tags ?? (options.tag ? [options.tag] : []),
        success: true,
        logs,
        buildTime: Date.now(),
      };

      if (imageId) {
        result.digest = imageId;
      }

      return result;
    } catch (error) {
      throw new DockerError(
        `Docker build failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DockerBuildFailed,
        'build',
        error as Error,
        { contextPath, options },
      );
    }
  }

  async tag(imageId: string, tag: string): Promise<void> {
    try {
      // Parse repository and tag from the tag string
      let repo: string;
      let tagName: string;
      
      if (tag.includes(':')) {
        const parts = tag.split(':');
        repo = parts[0] ?? '';
        tagName = parts[1] ?? 'latest';
      } else {
        repo = tag;
        tagName = 'latest';
        
      }

      // Validate that we have a valid repository name
      if (!repo || repo.trim().length === 0) {
        throw new Error('Invalid repository name extracted from tag');
      }

      const image = this.docker.getImage(imageId);
      await image.tag({ repo: repo.trim(), tag: tagName });
      this.logger.debug({ imageId, tag }, 'Image tagged successfully');
    } catch (error) {
      throw new DockerError(
        `Failed to tag image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DOCKER_TAG_FAILED,
        'tag',
        error as Error,
        { imageId, tag },
      );
    }
  }

  async push(tag: string, registry?: string): Promise<{ digest?: string }> {
    try {
      const fullTag = registry ? `${registry}/${tag}` : tag;
      const image = this.docker.getImage(fullTag);
      const stream = await image.push();

      let digest: string | undefined;

      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: Error | null, res: DockerBuildEvent[]) => {
          if (err) {
            reject(err);
          } else {
            // Extract digest from push output
            const lastLog = res[res.length - 1];
            if (lastLog?.aux?.Digest) {
              digest = lastLog.aux.Digest;
            }
            resolve();
          }
        });
      });

      this.logger.info({ tag: fullTag, digest }, 'Image pushed successfully');
      return digest ? { digest } : {};
    } catch (error) {
      throw new DockerError(
        `Failed to push image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DockerPushFailed,
        'push',
        error as Error,
        { tag, registry },
      );
    }
  }

  scan(image: string, _options?: ScanOptions): Promise<DockerScanResult> {
    // Basic implementation - would integrate with actual scanner in production
    this.logger.warn('Docker scan not fully implemented, returning mock result');
    return Promise.resolve({
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
        image,
      },
    });
  }

  async listImages(): Promise<Docker.ImageInfo[]> {
    try {
      return await this.docker.listImages();
    } catch (error) {
      throw new DockerError(
        `Failed to list images: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DOCKER_LIST_FAILED,
        'listImages',
        error as Error,
      );
    }
  }

  async removeImage(imageId: string): Promise<void> {
    try {
      const image = this.docker.getImage(imageId);
      await image.remove();
      this.logger.debug({ imageId }, 'Image removed successfully');
    } catch (error) {
      throw new DockerError(
        `Failed to remove image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DOCKER_REMOVE_FAILED,
        'removeImage',
        error as Error,
        { imageId },
      );
    }
  }

  async imageExists(imageId: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(imageId);
      await image.inspect();
      return true;
    } catch (error) {
      // If error is 404, image doesn't exist
      const dockerError = error as { statusCode?: number };
      if (dockerError?.statusCode === 404) {
        return false;
      }
      // For other errors, throw
      throw new DockerError(
        `Failed to check image existence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DOCKER_INSPECT_FAILED,
        'imageExists',
        error as Error,
        { imageId },
      );
    }
  }

  async listContainers(options: Record<string, unknown> = {}): Promise<Docker.ContainerInfo[]> {
    try {
      return await this.docker.listContainers(options);
    } catch (error) {
      throw new DockerError(
        `Failed to list containers: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCode.DOCKER_LIST_CONTAINERS_FAILED,
        'listContainers',
        error as Error,
      );
    }
  }

  async getSystemInfo(): Promise<Record<string, unknown>> {
    const healthStatus = await this.health();
    return (healthStatus.systemInfo ?? {}) as Record<string, unknown>;
  }

  async health(): Promise<DockerHealthStatus> {
    try {
      await this.docker.ping();
      const [version, info] = await Promise.all([
        this.docker.version() as Promise<DockerVersionInfo>,
        this.docker.info() as Promise<DockerSystemInfo>,
      ]);

      const result: DockerHealthStatus = {
        available: true,
      };

      if (typeof version.Version === 'string') {
        result.version = version.Version;
      }

      const systemInfo: NonNullable<DockerHealthStatus['systemInfo']> = {};
      if (typeof info.OperatingSystem === 'string') systemInfo.os = info.OperatingSystem;
      if (typeof info.Architecture === 'string') systemInfo.arch = info.Architecture;
      if (typeof info.Containers === 'number') systemInfo.containers = info.Containers;
      if (typeof info.Images === 'number') systemInfo.images = info.Images;
      if (typeof info.ServerVersion === 'string') systemInfo.serverVersion = info.ServerVersion;

      if (Object.keys(systemInfo).length > 0) {
        result.systemInfo = systemInfo;
      }

      return result;
    } catch (error) {
      this.logger.error({ error }, 'Docker health check failed');
      return {
        available: false,
      };
    }
  }

  private async followBuildProgress(stream: NodeJS.ReadableStream): Promise<{ logs: string[]; imageId: string | undefined }> {
    const logs: string[] = [];
    let imageId: string | undefined;

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null, res: DockerBuildEvent[]) => {
          if (err) {
            reject(err);
          } else {
            // Extract image ID from any event that contains it
            if (!imageId) {
              for (const event of res) {
                if (event?.aux?.ID) {
                  imageId = event.aux.ID;
                  break;
                }
              }
            }
            resolve();
          }
        },
        (event: DockerBuildEvent) => {
          if (event.stream) {
            logs.push(event.stream.trim());
          }
          if (event.error) {
            logs.push(`ERROR: ${event.error}`);
          }
          // Capture image ID as events arrive
          if (event.aux?.ID && !imageId) {
            imageId = event.aux.ID;
          }
        },
      );
    });

    return { logs, imageId };
  }

  private async tagAdditionalImages(imageId: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      if (tag?.trim()) {
        await this.tag(imageId, tag);
      }
    }
  }

  close(): void {
    this.logger.info('Docker service closed');
  }
}

/**
 * Create a Docker service instance
 */
export async function createDockerService(
  config: DockerServiceConfig,
  logger: Logger,
): Promise<DockerService> {
  const service = new DockerService(config, logger);
  await service.initialize();
  return service;
}
