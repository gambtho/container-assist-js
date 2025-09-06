/**
 * Docker Client Wrapper
 *
 * Provides a simplified, clean interface for Docker operations
 * Wraps the existing Docker infrastructure with consistent error handling and logging
 */

import { createTimer, type Logger } from './logger';
import type {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  DockerImage,
  DockerPushResult,
  DockerTagResult,
  DockerRegistryConfig,
  DockerContainer,
  ScanOptions,
  DockerClient as IDockerClient,
} from '../types/docker';

/**
 * Docker client wrapper implementation
 */
export class DockerClientWrapper implements IDockerClient {
  private logger: Logger;

  constructor(
    private dockerClient: any, // Will be the actual dockerode instance
    private scannerService: any, // Will be the scanner service
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'docker-client' });
  }

  /**
   * Build a Docker image
   */
  async build(options: DockerBuildOptions): Promise<DockerBuildResult> {
    const timer = createTimer(this.logger, 'docker-build');

    try {
      this.logger.info(
        {
          context: options.context,
          tags: options.tags,
          platform: options.platform,
          noCache: options.noCache,
        },
        'Building Docker image',
      );

      // Use the existing docker client build functionality
      const result = await this.dockerClient.build(options);

      timer.end({
        imageId: result.imageId,
        size: result.size,
        layers: result.layers,
      });

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      return {
        imageId: '',
        tags: options.tags ?? [],
        size: 0,
        logs: [],
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get image information
   */
  async getImage(id: string): Promise<DockerImage | null> {
    try {
      this.logger.debug({ imageId: id }, 'Getting image information');

      const image = await this.dockerClient.getImage(id);
      if (!image) {
        return null;
      }

      const inspect = await image.inspect();

      return {
        id: inspect.Id,
        repository: inspect.RepoTags?.[0]?.split(':')[0] || '',
        tag: inspect.RepoTags?.[0]?.split(':')[1] || 'latest',
        digest: inspect.RepoDigests?.[0] || undefined,
        size: inspect.Size,
        created: inspect.Created,
        labels: inspect.Config?.Labels || {},
        repoTags: inspect.RepoTags || [],
        repoDigests: inspect.RepoDigests || [],
        architecture: inspect.Architecture,
        os: inspect.Os,
        config: {
          env: inspect.Config?.Env || [],
          cmd: inspect.Config?.Cmd || [],
          entrypoint: inspect.Config?.Entrypoint || [],
          workingDir: inspect.Config?.WorkingDir,
          user: inspect.Config?.User,
          exposedPorts: inspect.Config?.ExposedPorts || {},
        },
      };
    } catch (err) {
      this.logger.warn({ imageId: id, error: err }, 'Failed to get image information');
      return null;
    }
  }

  /**
   * List images
   */
  async listImages(
    options: { all?: boolean; filters?: Record<string, string[]> } = {},
  ): Promise<DockerImage[]> {
    try {
      this.logger.debug({ options }, 'Listing images');

      const images = await this.dockerClient.listImages({
        all: options.all ?? false,
        filters: options.filters ?? {},
      });

      const result: DockerImage[] = [];

      for (const imageInfo of images) {
        const image = await this.getImage(imageInfo.Id);
        if (image) {
          result.push(image);
        }
      }

      return result;
    } catch (err) {
      this.logger.error({ error: err }, 'Failed to list images');
      return [];
    }
  }

  /**
   * Remove an image
   */
  async removeImage(id: string, options: { force?: boolean } = {}): Promise<void> {
    try {
      this.logger.info({ imageId: id, force: options.force }, 'Removing image');

      const image = this.dockerClient.getImage(id);
      await image.remove({ force: options.force ?? false });

      this.logger.info({ imageId: id }, 'Image removed successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error({ imageId: id, error: error.message }, 'Failed to remove image');
      throw error;
    }
  }

  /**
   * Tag an image
   */
  async tagImage(sourceImage: string, targetTag: string): Promise<DockerTagResult> {
    const timer = createTimer(this.logger, 'docker-tag');

    try {
      this.logger.info({ sourceImage, targetTag }, 'Tagging image');

      const image = this.dockerClient.getImage(sourceImage);
      const [repository, tag] = targetTag.split(':');

      await image.tag({
        repo: repository,
        tag: tag ?? 'latest',
      });

      timer.end({ targetTag });

      return {
        sourceImage,
        targetTag,
        success: true,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      return {
        sourceImage,
        targetTag,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Push an image to registry
   */
  async push(image: string, options: DockerRegistryConfig = {}): Promise<DockerPushResult> {
    const timer = createTimer(this.logger, 'docker-push');

    try {
      this.logger.info({ image, registry: options.url }, 'Pushing image');

      const imageObj = this.dockerClient.getImage(image);

      // Configure authentication if provided
      const authconfig =
        options.username && options.password
          ? {
              username: options.username,
              password: options.password,
              email: options.email,
              serveraddress: options.serveraddress ?? options.url,
            }
          : undefined;

      const stream = await imageObj.push({ authconfig });

      // Wait for push to complete and extract digest
      let digest = '';
      await new Promise<void>((resolve, reject) => {
        this.dockerClient.modem.followProgress(stream, (err: any, res: any) => {
          if (err) reject(err);
          else {
            // Extract digest from push result
            const digestResult = res.find((r: any) => r.aux?.Digest);
            if (digestResult) {
              digest = digestResult.aux.Digest;
            }
            resolve();
          }
        });
      });

      const [repository, tag] = image.split(':');
      timer.end({ digest });

      return {
        registry: options.url ?? 'docker.io',
        repository: repository ?? '',
        tag: tag ?? 'latest',
        digest,
        success: true,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      return {
        registry: options.url ?? 'docker.io',
        repository: image.split(':')[0] ?? '',
        tag: image.split(':')[1] ?? 'latest',
        digest: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Pull an image from registry
   */
  async pull(image: string, options: DockerRegistryConfig = {}): Promise<void> {
    const timer = createTimer(this.logger, 'docker-pull');

    try {
      this.logger.info({ image, registry: options.url }, 'Pulling image');

      const authconfig =
        options.username && options.password
          ? {
              username: options.username,
              password: options.password,
              email: options.email,
              serveraddress: options.serveraddress ?? options.url,
            }
          : undefined;

      const stream = await this.dockerClient.pull(image, { authconfig });

      await new Promise<void>((resolve, reject) => {
        this.dockerClient.modem.followProgress(stream, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      timer.end();
      this.logger.info({ image }, 'Image pulled successfully');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);
      throw error;
    }
  }

  /**
   * List containers
   */
  async listContainers(
    options: { all?: boolean; filters?: Record<string, string[]> } = {},
  ): Promise<DockerContainer[]> {
    try {
      this.logger.debug({ options }, 'Listing containers');

      const containers = await this.dockerClient.listContainers({
        all: options.all ?? false,
        filters: options.filters ?? {},
      });

      return containers.map(
        (container: any): DockerContainer => ({
          id: container.Id,
          name: container.Names?.[0]?.replace(/^\//, '') || '',
          image: container.Image,
          status: container.Status,
          state: container.State,
          ports:
            container.Ports?.map((port: any) => ({
              privatePort: port.PrivatePort,
              publicPort: port.PublicPort,
              type: port.Type,
            })) || [],
          labels: container.Labels || {},
          created: new Date(container.Created * 1000).toISOString(),
          command: container.Command,
          mounts:
            container.Mounts?.map((mount: any) => ({
              type: mount.Type,
              source: mount.Source,
              destination: mount.Destination,
              mode: mount.Mode,
              rw: mount.RW,
            })) || [],
        }),
      );
    } catch (err) {
      this.logger.error({ error: err }, 'Failed to list containers');
      return [];
    }
  }

  /**
   * Scan an image for security vulnerabilities
   */
  async scan(image: string, options: ScanOptions = {}): Promise<DockerScanResult> {
    const timer = createTimer(this.logger, 'docker-scan');

    try {
      this.logger.info(
        {
          image,
          scanner: options.scanner ?? 'trivy',
          severityThreshold: options.severityThreshold,
        },
        'Scanning image for vulnerabilities',
      );

      // Use the existing scanner service
      const result = await this.scannerService.scan(image, options);

      timer.end({
        vulnerabilityCount: result.summary?.total || 0,
        criticalCount: result.summary?.critical || 0,
      });

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      return {
        vulnerabilities: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0,
        },
        scanner: options.scanner ?? 'trivy',
      };
    }
  }

  /**
   * Check Docker daemon connectivity
   */
  async ping(): Promise<boolean> {
    try {
      await this.dockerClient.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Docker version information
   */
  async version(): Promise<{ version: string; apiVersion: string }> {
    try {
      const version = await this.dockerClient.version();
      return {
        version: version.Version || 'unknown',
        apiVersion: version.ApiVersion || 'unknown',
      };
    } catch {
      return {
        version: 'unknown',
        apiVersion: 'unknown',
      };
    }
  }
}

/**
 * Create a Docker client instance
 */
export function createDockerClient(
  dockerClient: any,
  scannerService: any,
  logger: Logger,
): IDockerClient {
  return new DockerClientWrapper(dockerClient, scannerService, logger);
}

/**
 * Mock Docker client for testing
 */
export class MockDockerClient implements IDockerClient {
  async build(options: DockerBuildOptions): Promise<DockerBuildResult> {
    return {
      imageId: 'sha256:mock-image-id',
      tags: options.tags ?? ['mock:latest'],
      size: 100 * 1024 * 1024, // 100MB
      logs: [
        'Step 1/3 : FROM node:18',
        'Step 2/3 : COPY . .',
        'Step 3/3 : CMD ["node", "index.js"]',
      ],
      success: true,
    };
  }

  async getImage(): Promise<DockerImage | null> {
    return {
      id: 'sha256:mock-image-id',
      repository: 'mock',
      tag: 'latest',
      size: 100 * 1024 * 1024,
      created: new Date().toISOString(),
      labels: {},
      repoTags: ['mock:latest'],
      architecture: 'amd64',
      os: 'linux',
    };
  }

  async listImages(): Promise<DockerImage[]> {
    const image = await this.getImage();
    return image ? [image] : [];
  }

  async removeImage(): Promise<void> {
    // Mock implementation
  }

  async tagImage(sourceImage: string, targetTag: string): Promise<DockerTagResult> {
    return {
      sourceImage,
      targetTag,
      success: true,
    };
  }

  async push(image: string): Promise<DockerPushResult> {
    const [repository, tag] = image.split(':');
    return {
      registry: 'docker.io',
      repository: repository ?? '',
      tag: tag ?? 'latest',
      digest: 'sha256:mock-digest',
      success: true,
    };
  }

  async pull(): Promise<void> {
    // Mock implementation
  }

  async listContainers(): Promise<DockerContainer[]> {
    return [];
  }

  async scan(): Promise<DockerScanResult> {
    return {
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      },
      scanner: 'trivy',
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async version(): Promise<{ version: string; apiVersion: string }> {
    return {
      version: '20.10.0',
      apiVersion: '1.41',
    };
  }
}
