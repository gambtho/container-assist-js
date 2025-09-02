/**
 * Docker Client - Direct interface to Docker daemon
 * Replaces the complex adapter pattern with a simpler, direct approach
 */

import Docker from 'dockerode';
import { DockerError } from '../errors/index';
import type { Logger } from 'pino';
import {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions
} from '../contracts/types/index';

interface DockerSystemInfo {
  os?: string;
  arch?: string;
  containers?: number;
  images?: number;
  serverVersion?: string;
}

interface DockerBuildEvent {
  stream?: string;
  error?: string;
  aux?: {
    ID?: string;
    Digest?: string;
  };
}

interface DockerImageInfo {
  Id: string;
  RepoTags?: string[];
  Size?: number;
  Created?: number;
}

interface DockerContainerInfo {
  Id: string;
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
}

interface TrivyConfig {
  scannerPath?: string;
  cacheDir?: string;
  timeout?: number;
}

export interface DockerHealthStatus {
  available: boolean;
  version?: string;
  trivyAvailable?: boolean;
  systemInfo?: DockerSystemInfo;
  client?: DockerClient;
}

export interface DockerClientConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: string;
  trivy?: TrivyConfig;
}

export class DockerClient {
  private docker: Docker;
  private logger: Logger;

  constructor(config: DockerClientConfig, logger: Logger) {
    this.logger = logger.child({ component: 'DockerClient' });

    // Initialize Docker with config
    const dockerOptions: Docker.DockerOptions = {};
    if (config.socketPath != null) {
      dockerOptions.socketPath = config.socketPath;
    } else if (config.host != null) {
      dockerOptions.host = config.host;
      dockerOptions.port = config.port ?? 2375;
      dockerOptions.protocol = (config.protocol as 'ssh' | 'https' | 'http' | undefined) || 'http';
    }

    this.docker = new Docker(dockerOptions);
  }

  async initialize(): Promise<void> {
    try {
      await this.docker.ping();
      this.logger.info('Docker client initialized successfully');
    } catch (error) {
      throw new DockerError(
        'Failed to connect to Docker daemon',
        'DOCKER_INIT_FAILED',
        'initialize',
        error as Error
      );
    }
  }

  async build(contextPath: string, options: DockerBuildOptions): Promise<DockerBuildResult> {
    try {
      this.logger.debug({ contextPath, options }, 'Starting Docker build');

      // Create tar stream from context using tar-fs module
      // @ts-ignore - No types available for tar-fs
      const { pack } = await import('tar-fs');
      const tarStream = pack(contextPath);

      // Prepare build options
      const buildOptions: Docker.BuildImageOptions = {
        t: options.tags?.[0] || options.tag,
        dockerfile: options.dockerfile ?? options.dockerfilePath || 'Dockerfile',
        buildargs: options.buildArgs,
        target: options.target,
        nocache: options.noCache,
        platform: options.platform,
        pull: options.pull,
        rm: options.rm !== false, // Default to true
        forcerm: options.forcerm,
        squash: options.squash,
        labels: options.labels
      };

      // Remove undefined values
      Object.keys(buildOptions).forEach((key) => {
        if (buildOptions[key] === undefined) {
          delete buildOptions[key];
        }
      });

      // Build the image
      const stream = (await this.docker.buildImage(
        tarStream,
        buildOptions
      )) as NodeJS.ReadableStream;

      // Process build output
      const logs: string[] = [];
      let imageId: string | undefined;

      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null, res: DockerBuildEvent[]) => {
            if (err) {
              reject(err);
            } else {
              // Extract image ID from build output
              const lastLog = res[res.length - 1];
              if (lastLog?.aux?.ID) {
                imageId = lastLog.aux.ID;
              }
              resolve(res);
            }
          },
          (event: DockerBuildEvent) => {
            if (event.stream != null) {
              logs.push(event.stream.trim());
            }
            if (event.error) {
              logs.push(`ERROR: ${event.error}`);
            }
          }
        );
      });

      // Tag additional tags if provided
      if (imageId && options.tags && options.tags.length > 1) {
        for (let i = 1; i < options.tags.length; i++) {
          const tag = options.tags[i];
          if (tag) {
            await this.tag(imageId, tag);
          }
        }
      }

      const result: DockerBuildResult = {
        imageId: imageId ?? '',
        tags: options.tags ?? (options.tag ? [options.tag] : []),
        success: true,
        logs,
        buildTime: Date.now()
      };

      if (imageId) {
        result.digest = imageId;
      }

      return result;
    } catch (error) {
      throw new DockerError(
        `Docker build failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DOCKER_BUILD_FAILED',
        'build',
        error as Error,
        { contextPath, options }
      );
    }
  }

  async scan(image: string, _options?: ScanOptions): Promise<DockerScanResult> {
    // For now, return a basic scan result
    // In a real implementation, this would integrate with Trivy or another scanner
    this.logger.warn('Docker scan not implemented, returning mock result');
    return {
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
        total: 0
      },
      scanTime: new Date().toISOString(),
      metadata: {
        image
      }
    };
  }

  async tag(imageId: string, tag: string): Promise<void> {
    try {
      const [repo, tagName] = tag.includes(':') ? tag.split(':') : [tag, 'latest'];
      const image = this.docker.getImage(imageId);
      await image.tag({ repo, tag: tagName });
      this.logger.debug({ imageId, tag }, 'Image tagged successfully');
    } catch (error) {
      throw new DockerError(
        `Failed to tag image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DOCKER_TAG_FAILED',
        'tag',
        error as Error,
        { imageId, tag }
      );
    }
  }

  async push(tag: string, registry?: string): Promise<{ digest?: string }> {
    try {
      const image = this.docker.getImage(tag);
      const stream = await image.push();

      let digest: string | undefined;

      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: Error | null, res: DockerBuildEvent[]) => {
          if (err) {
            reject(err);
          } else {
            // Extract digest from push output
            const lastLog = res[res.length - 1];
            if (lastLog?.aux?.Digest) {
              digest = lastLog.aux.Digest;
            }
            resolve(res);
          }
        });
      });

      this.logger.info({ tag, digest }, 'Image pushed successfully');

      const result: { digest?: string } = {};
      if (digest) {
        result.digest = digest;
      }

      return result;
    } catch (error) {
      throw new DockerError(
        `Failed to push image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DOCKER_PUSH_FAILED',
        'push',
        error as Error,
        { tag, registry }
      );
    }
  }

  async listImages(): Promise<DockerImageInfo[]> {
    try {
      return await this.docker.listImages();
    } catch (error) {
      throw new DockerError(
        `Failed to list images: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DOCKER_LIST_FAILED',
        'listImages',
        error as Error
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
        'DOCKER_REMOVE_FAILED',
        'removeImage',
        error as Error,
        { imageId }
      );
    }
  }

  async imageExists(imageId: string): Promise<boolean> {
    try {
      const image = this.docker.getImage(imageId);
      await image.inspect();
      return true;
    } catch (error) {
      // If error is 404, image doesn't exist'
      const dockerError = error as { statusCode?: number };
      if (dockerError?.statusCode === 404) {
        return false;
      }
      // For other errors, throw
      throw new DockerError(
        `Failed to check image existence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DOCKER_INSPECT_FAILED',
        'imageExists',
        error as Error,
        { imageId }
      );
    }
  }

  async health(): Promise<DockerHealthStatus> {
    try {
      await this.docker.ping();
      const version = await this.docker.version();
      const info = await this.docker.info();

      return {
        available: true,
        version: version.Version,
        trivyAvailable: false, // Would need actual Trivy check
        systemInfo: {
          os: info.OperatingSystem,
          arch: info.Architecture,
          containers: info.Containers,
          images: info.Images,
          serverVersion: info.ServerVersion
        },
        client: this
      };
    } catch (error) {
      this.logger.error({ error }, 'Docker health check failed');
      return {
        available: false
      };
    }
  }

  /**
   * List Docker containers
   */
  async listContainers(options: Docker.ListContainersOptions = {}): Promise<DockerContainerInfo[]> {
    try {
      const containers = (await this.docker.listContainers(options)) as DockerContainerInfo[];
      return containers ?? [];
    } catch (error) {
      this.logger.error({ error }, 'Failed to list containers');
      throw new DockerError(
        'Failed to list containers',
        'DOCKER_LIST_CONTAINERS_FAILED',
        'listContainers',
        error instanceof Error ? error : undefined
      );
    }
  }
}
