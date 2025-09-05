/**
 * Docker Client - Direct interface to Docker daemon
 * Replaces the complex adapter pattern with a simpler, direct approach
 */

import Docker from 'dockerode';
import { DockerError } from '../errors/index';
import { ErrorCode } from '../domain/types/errors';
import type { Logger } from 'pino';
import {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions,
} from '../domain/types/index';
import { TrivyScanner } from './scanners/trivy-scanner';
import { isOk } from '../domain/types/result';

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
  RepoTags?: string[] | undefined;
  Size?: number | undefined;
  Created?: number | undefined;
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
  private trivyScanner?: TrivyScanner;

  constructor(config: DockerClientConfig, logger: Logger) {
    this.logger = logger.child({ component: 'DockerClient' });

    // Initialize Docker with config
    const dockerOptions: Docker.DockerOptions = {};
    if (config.socketPath != null) {
      dockerOptions.socketPath = config.socketPath;
    } else if (config.host != null) {
      dockerOptions.host = config.host;
      dockerOptions.port = config.port ?? 2375;
      dockerOptions.protocol = (config.protocol as 'ssh' | 'https' | 'http' | undefined) ?? 'http';
    }

    this.docker = new Docker(dockerOptions);

    // Initialize Trivy scanner if configured
    if (config.trivy !== undefined) {
      this.trivyScanner = new TrivyScanner(this.logger, config.trivy);
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.docker.ping();
      this.logger.info('Docker client initialized successfully');

      // Initialize Trivy scanner if available
      if (this.trivyScanner) {
        const trivyResult = await this.trivyScanner.initialize();
        if (!trivyResult.ok) {
          this.logger.warn(
            { error: trivyResult.error },
            'Trivy scanner initialization failed, scanning will be disabled',
          );
          // Delete the scanner instead of setting to undefined
          delete this.trivyScanner;
        }
      }
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

      // Create tar stream from context using tar-fs module
      const { pack } = await import('tar-fs');
      const tarStream = pack(contextPath);

      // Prepare build options
      const buildOptions: Docker.ImageBuildOptions = {
        t: options.tags?.[0] ?? options.tag,
        dockerfile: options.dockerfile ?? options.dockerfilePath ?? 'Dockerfile',
        buildargs: options.buildArgs,
        target: options.target,
        nocache: options.noCache,
        platform: options.platform,
        pull: options.pull,
        rm: options.rm !== false, // Default to true
        forcerm: options.forcerm,
        squash: options.squash,
        labels: options.labels,
      };

      // Remove undefined values
      const cleanBuildOptions: Record<string, unknown> = {};
      Object.entries(buildOptions).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanBuildOptions[key] = value;
        }
      });

      // Build the image
      const stream = await this.docker.buildImage(
        tarStream,
        cleanBuildOptions as Docker.ImageBuildOptions,
      );

      // Process build output
      const logs: string[] = [];
      let imageId: string | undefined;
      let buildError: string | undefined;

      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null, res: DockerBuildEvent[]) => {
            if (err) {
              reject(err);
            } else {
              // Extract image ID from build output - try multiple approaches
              for (const event of res.reverse()) {
                if (event?.aux?.ID) {
                  imageId = event.aux.ID;
                  break;
                }
              }

              // If no aux ID found, try to extract from successful completion message
              if (!imageId) {
                const successLog = logs.find(
                  (log) => log.includes('Successfully built') || log.includes('sha256:'),
                );
                if (successLog) {
                  const sha256Match = successLog.match(/sha256:([a-f0-9]{64})/);
                  const builtMatch = successLog.match(/Successfully built ([a-f0-9]+)/);
                  imageId = sha256Match?.[1] ?? builtMatch?.[1];
                }
              }

              resolve(res);
            }
          },
          (event: DockerBuildEvent) => {
            if (event.stream != null) {
              logs.push(event.stream.trim());
            }
            if (event.error) {
              buildError = event.error;
              logs.push(`ERROR: ${event.error}`);
            }
          },
        );
      });

      // Check if build actually succeeded - be more specific about fatal errors
      const hasFatalErrors =
        buildError ??
        logs.some((log) => {
          const lowerLog = log.toLowerCase();
          return (
            lowerLog.includes('pull access denied') ||
            lowerLog.includes('repository does not exist') ||
            (lowerLog.includes('no such file or directory') && lowerLog.includes('dockerfile')) ||
            lowerLog.includes('failed to solve') ||
            lowerLog.includes('error response from daemon')
          );
        });

      // If no image ID found but build seems successful, try to find it by tag
      if (!imageId && !hasFatalErrors && (options.tags?.[0] ?? options.tag)) {
        try {
          const targetTag = options.tags?.[0] ?? options.tag;
          const images = await this.listImages();
          const builtImage = images.find((img) => img.RepoTags?.some((tag) => tag === targetTag));
          if (builtImage) {
            imageId = builtImage.Id;
          }
        } catch (error) {
          this.logger.warn({ error }, 'Failed to find built image by tag');
        }
      }

      // Only throw if we have fatal errors and no image was produced
      if (hasFatalErrors && !imageId) {
        throw new DockerError(
          `Docker build failed: ${buildError ?? 'Fatal build errors detected'}`,
          ErrorCode.DockerBuildFailed,
          'build',
          new Error(buildError ?? 'Build failed'),
          { contextPath, options, logs },
        );
      }

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
        success: !!imageId && !hasFatalErrors,
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

  async scan(image: string, options?: ScanOptions): Promise<DockerScanResult> {
    // Check if Trivy scanner is available
    if (!this.trivyScanner) {
      this.logger.warn(
        'Security scanning is not available. Install Trivy to enable vulnerability scanning.',
      );

      // Return empty scan result with metadata indicating scanning is disabled
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
          image,
          // Note: scanner not available - metadata only includes standard fields
          lastScanned: new Date().toISOString(),
        },
      };
    }

    // Perform actual scan using Trivy
    this.logger.info({ image, options }, 'Performing security scan with Trivy');

    const scanResult = await this.trivyScanner.scan(image, options);

    if (isOk(scanResult)) {
      return scanResult.value;
    } else {
      // Log the error and throw with proper context
      this.logger.error({ error: scanResult.error }, 'Security scan failed');

      throw new DockerError(
        `Security scan failed: ${scanResult.error}`,
        ErrorCode.SCANNER_NOT_AVAILABLE,
        'scan',
        undefined,
        { image, options },
      );
    }
  }

  async tag(imageId: string, tag: string): Promise<void> {
    try {
      const parts = tag.includes(':') ? tag.split(':') : [tag, 'latest'];
      const repo = parts[0] ?? tag;
      const tagName = parts[1] ?? 'latest';
      const image = this.docker.getImage(imageId);
      await new Promise<void>((resolve, reject) => {
        image.tag({ repo, tag: tagName ?? 'latest' }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      this.logger.debug({ imageId, tag }, 'Image tagged successfully');
    } catch (error) {
      const dockerError = error as { statusCode?: number };
      // Handle 301 redirects by retrying with different approach
      if (dockerError?.statusCode === 301) {
        try {
          // Try using Docker engine API directly with different parameters
          const parts = tag.includes(':') ? tag.split(':') : [tag, 'latest'];
          const repo = parts[0] ?? tag;
          const tagName = parts[1] ?? 'latest';
          const image = this.docker.getImage(imageId);
          image.tag({ repo, tag: tagName } as any);
          this.logger.debug({ imageId, tag }, 'Image tagged successfully (retry)');
          return;
        } catch (retryError) {
          this.logger.warn({ error: retryError }, 'Tag retry failed, using original error');
        }
      }
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
        ErrorCode.DockerPushFailed,
        'push',
        error as Error,
        { tag, registry },
      );
    }
  }

  async listImages(): Promise<DockerImageInfo[]> {
    try {
      const images = await this.docker.listImages();
      return images.map((img) => ({
        Id: img.Id,
        RepoTags: img.RepoTags ?? undefined,
        Size: img.Size ?? undefined,
        Created: img.Created ?? undefined,
      }));
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
      // If error is 404, image doesn't exist'
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

  async health(): Promise<DockerHealthStatus> {
    try {
      await this.docker.ping();
      const version = await this.docker.version();
      const info = (await this.docker.info()) as {
        OperatingSystem?: string;
        Architecture?: string;
        Containers?: number;
        Images?: number;
        ServerVersion?: string;
      };

      return {
        available: true,
        version: version.Version,
        trivyAvailable: this.trivyScanner ? await this.trivyScanner.isAvailable() : false,
        systemInfo: {
          os: info.OperatingSystem ?? 'unknown',
          arch: info.Architecture ?? 'unknown',
          containers: info.Containers ?? 0,
          images: info.Images ?? 0,
          serverVersion: info.ServerVersion ?? 'unknown',
        },
        client: this,
      };
    } catch (error) {
      this.logger.error({ error }, 'Docker health check failed');
      return {
        available: false,
      };
    }
  }

  /**
   * List Docker containers
   */
  async listContainers(options: Docker.ContainerListOptions = {}): Promise<DockerContainerInfo[]> {
    try {
      const containers = (await this.docker.listContainers(options)) as DockerContainerInfo[];
      return containers ?? [];
    } catch (error) {
      this.logger.error({ error }, 'Failed to list containers');
      throw new DockerError(
        'Failed to list containers',
        ErrorCode.DOCKER_LIST_CONTAINERS_FAILED,
        'listContainers',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
