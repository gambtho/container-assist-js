/**
 * Simplified Docker Service - No unnecessary abstractions
 */

import { DockerClient } from '../infrastructure/docker-client.js';
import type { Logger } from 'pino';
import { DockerError } from '../errors/index.js';
import { ErrorCode } from '../contracts/types/errors.js';
import {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions
} from '../contracts/types/index.js';

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
    available: boolean;
    status?: string;
    version?: string;
    trivyAvailable?: boolean;
    systemInfo?: unknown;
    client?: DockerClient;
  }> {
    // Use the enhanced health check from client
    const healthStatus = await this.client.health();

    if (!healthStatus.available) {
      throw new DockerError('Docker not available', ErrorCode.DOCKER_HEALTH_CHECK_FAILED, 'health');
    }

    const result: {
      available: boolean;
      status?: string;
      version?: string;
      trivyAvailable?: boolean;
      systemInfo?: unknown;
      client?: DockerClient;
    } = {
      available: healthStatus.available,
      status: 'healthy'
    };

    if (healthStatus.version !== undefined) {
      result.version = healthStatus.version;
    }
    if (healthStatus.trivyAvailable !== undefined) {
      result.trivyAvailable = healthStatus.trivyAvailable;
    }
    if (healthStatus.systemInfo !== undefined) {
      result.systemInfo = healthStatus.systemInfo;
    }
    if (healthStatus.client !== undefined) {
      result.client = healthStatus.client;
    }

    return result;
  }

  // Additional methods needed by resource providers
  async build(options: DockerBuildOptions): Promise<DockerBuildResult> {
    return this.buildImage(options);
  }

  async scan(imageId: string): Promise<DockerScanResult> {
    return this.scanImage(imageId);
  }

  async push(tag: string): Promise<{ digest?: string }> {
    return this.pushImage(tag);
  }

  async tag(source: string, target: string): Promise<void> {
    await this.client.tag(source, target);
  }

  async getSystemInfo(): Promise<Record<string, unknown> | null> {
    const health = await this.health();
    const systemInfo = health.systemInfo;
    if (systemInfo && typeof systemInfo === 'object') {
      return systemInfo as Record<string, unknown>;
    }
    // Return null when no system info is available instead of empty object
    return null;
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
  logger: Logger
): Promise<DockerService> {
  const service = new DockerService(config, logger);
  await service.initialize();
  return service;
}
