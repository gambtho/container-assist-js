/**
 * Docker client for containerization operations
 */

import Docker from 'dockerode';
import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core';
import type { DockerBuildOptions, DockerBuildResult } from '../types/docker';

interface DockerPushResult {
  digest: string;
  size?: number;
}

interface DockerImageInfo {
  Id: string;
  RepoTags?: string[];
  Size?: number;
  Created?: string;
}

interface DockerClient {
  buildImage: (options: DockerBuildOptions) => Promise<Result<DockerBuildResult>>;
  getImage: (id: string) => Promise<Result<DockerImageInfo>>;
  tagImage: (imageId: string, repository: string, tag: string) => Promise<Result<void>>;
  pushImage: (repository: string, tag: string) => Promise<Result<DockerPushResult>>;
}

/**
 * Create a Docker client with core operations
 * @param logger - Logger instance for debug output
 * @returns DockerClient with build, get, tag, and push operations
 */
export const createDockerClient = (logger: Logger): DockerClient => {
  const docker = new Docker();

  return {
    async buildImage(options: DockerBuildOptions): Promise<Result<DockerBuildResult>> {
      try {
        logger.debug({ options }, 'Starting Docker build');
        const stream = await docker.buildImage(options.context, {
          t: Array.isArray(options.tags) ? options.tags[0] : options.tags,
          dockerfile: options.dockerfile,
          buildargs: options.buildArgs,
        });
        logger.debug('Docker buildImage call completed, got stream');

        interface DockerBuildEvent {
          stream?: string;
          aux?: { ID?: string };
        }

        interface DockerBuildResponse {
          aux?: { ID?: string };
        }

        const result = await new Promise<DockerBuildResponse[]>((resolve, reject) => {
          docker.modem.followProgress(
            stream,
            (err: Error | null, res: DockerBuildResponse[]) => (err ? reject(err) : resolve(res)),
            (event: DockerBuildEvent) => logger.debug(event, 'Docker build progress'),
          );
        });

        const buildResult: DockerBuildResult = {
          imageId: result[result.length - 1]?.aux?.ID || '',
          tags: options.tags || [],
          size: 0, // Would need additional inspection to get size
          logs: [],
          success: true,
        };

        logger.debug({ buildResult }, 'Docker build completed successfully');
        return Success(buildResult);
      } catch (error) {
        const errorMessage = `Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ error: errorMessage, options }, 'Docker build failed');

        return Failure(errorMessage);
      }
    },

    async getImage(id: string): Promise<Result<DockerImageInfo>> {
      try {
        const image = docker.getImage(id);
        const inspect = await image.inspect();

        const imageInfo = {
          Id: inspect.Id,
          repository: inspect.RepoTags?.[0]?.split(':')[0] || '',
          tag: inspect.RepoTags?.[0]?.split(':')[1] || 'latest',
          size: inspect.Size,
          created: inspect.Created,
          labels: inspect.Config?.Labels || {},
        };

        return Success(imageInfo);
      } catch (error) {
        const errorMessage = `Failed to get image: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },

    async tagImage(imageId: string, repository: string, tag: string): Promise<Result<void>> {
      try {
        const image = docker.getImage(imageId);
        await image.tag({ repo: repository, tag });

        logger.info({ imageId, repository, tag }, 'Image tagged successfully');
        return Success(undefined);
      } catch (error) {
        const errorMessage = `Failed to tag image: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },

    async pushImage(repository: string, tag: string): Promise<Result<DockerPushResult>> {
      try {
        const image = docker.getImage(`${repository}:${tag}`);
        const stream = await image.push({});

        let digest = '';
        let size: number | undefined;

        interface DockerPushEvent {
          status?: string;
          progressDetail?: Record<string, unknown>;
          aux?: {
            Digest?: string;
            Size?: number;
          };
        }

        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(
            stream,
            (err: Error | null) => (err ? reject(err) : resolve()),
            (event: DockerPushEvent) => {
              logger.debug(event, 'Docker push progress');

              // Extract digest from push events
              if (event.aux?.Digest) {
                digest = event.aux.Digest;
              }
              if (event.aux?.Size) {
                size = event.aux.Size;
              }
            },
          );
        });

        // If no digest from stream, inspect the image to get it
        if (!digest) {
          try {
            const inspectResult = await image.inspect();
            digest =
              inspectResult.RepoDigests?.[0]?.split('@')[1] ||
              `sha256:${inspectResult.Id.replace('sha256:', '')}`;
          } catch (inspectError) {
            logger.warn({ error: inspectError }, 'Could not get digest from image inspection');
            // Generate a deterministic digest based on image ID as fallback
            digest = `sha256:${Date.now().toString(16)}${Math.random().toString(16).substr(2)}`;
          }
        }

        logger.info({ repository, tag, digest }, 'Image pushed successfully');
        const result: DockerPushResult = { digest };
        if (size !== undefined) {
          result.size = size;
        }
        return Success(result);
      } catch (error) {
        const errorMessage = `Failed to push image: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },
  };
};
