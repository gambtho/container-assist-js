/**
 * Simplified Docker Service - No unnecessary abstractions
 */

import { DockerClient } from '../infrastructure/docker-client';
import type { Logger } from 'pino';
import { DockerError } from '../errors/index';
import { ErrorCode } from '../domain/types/errors';
import {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions,
} from '../domain/types/index';

export interface DockerServiceConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: string;
  trivy?: {
    scannerPath?: string;
    cacheDir?: string;
    timeout?: number;
  };
}

export class DockerService {
  private client: DockerClient;
  private logger: Logger;

  constructor(config: DockerServiceConfig, logger: Logger) {
    this.logger = logger.child({ service: 'docker' });
    this.client = new DockerClient(config, this.logger);
  }

  async initialize(): Promise<void> {
    return this.client.initialize();
  }

  async buildImage(options: DockerBuildOptions): Promise<DockerBuildResult> {
    return await this.client.build(options.context, options);
  }

  async scanImage(image: string, options?: ScanOptions): Promise<DockerScanResult> {
    return await this.client.scan(image, options);
  }

  async tagImage(imageId: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.client.tag(imageId, tag);
    }
  }

  async pushImage(tag: string, registry?: string): Promise<{ digest?: string }> {
    const fullTag = registry != null && registry !== '' ? `${registry}/${tag}` : tag;
    return await this.client.push(fullTag, registry);
  }

  async listImages(): Promise<
    Array<{
      Id: string;
      RepoTags?: string[];
      Size?: number;
      Created?: number;
    }>
  > {
    return this.client.listImages() as Promise<
      Array<{
        Id: string;
        RepoTags?: string[];
        Size?: number;
        Created?: number;
      }>
    >;
  }

  async removeImage(imageId: string): Promise<void> {
    return this.client.removeImage(imageId);
  }

  async imageExists(imageId: string): Promise<boolean> {
    return this.client.imageExists(imageId);
  }

  async health(): Promise<{
    healthy: boolean;
    available?: boolean;
    version?: string;
    info?: unknown;
    client?: unknown;
  }> {
    // Use the enhanced health check from client
    const healthStatus = await this.client.health();

    if (!healthStatus.available) {
      throw new DockerError('Docker not available', ErrorCode.DOCKER_HEALTH_CHECK_FAILED, 'health');
    }

    return {
      healthy: healthStatus.available,
      available: healthStatus.available,
      ...(healthStatus.version && { version: healthStatus.version }),
      ...(healthStatus.systemInfo && { info: healthStatus.systemInfo }),
      ...(healthStatus.client && { client: healthStatus.client }),
    };
  }

  // Additional methods needed by resource providers
  async build(options: DockerBuildOptions): Promise<DockerBuildResult> {
    return this.buildImage(options);
  }

  async scan(options: { image: string; severity?: string; format?: string }): Promise<unknown> {
    const scanOptions: ScanOptions | undefined =
      (options.severity ?? options.format)
        ? {
            ...(options.severity && { severity: [options.severity] }),
            ...(options.format && { format: options.format }),
          }
        : undefined;
    return this.scanImage(options.image, scanOptions);
  }

  async push(options: { image: string; registry?: string }): Promise<void> {
    await this.pushImage(options.image, options.registry);
  }

  async tag(options: { image: string; tag: string }): Promise<void> {
    await this.client.tag(options.image, options.tag);
  }

  async getSystemInfo(): Promise<Record<string, unknown> | null> {
    try {
      const health = await this.health();
      const systemInfo = health.info;
      if (systemInfo && typeof systemInfo === 'object') {
        return systemInfo as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  async listContainers(options?: Record<string, unknown>): Promise<
    Array<{
      Id: string;
      Names?: string[];
      Image?: string;
      State?: string;
      Status?: string;
    }>
  > {
    return this.client.listContainers(options);
  }

  /**
   * Close the Docker service
   */
  async close(): Promise<void> {
    // Docker client doesn't need explicit cleanup, but log the shutdown'
    await Promise.resolve(); // Satisfy async requirement
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
