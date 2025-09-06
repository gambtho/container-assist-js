/**
 * Docker client for containerization operations
 */

import Docker from 'dockerode';
import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core/index.js';
import type {
  DockerBuildOptions,
  DockerBuildResult,
} from '../types/docker';

interface DockerClient {
  buildImage: (options: DockerBuildOptions) => Promise<Result<DockerBuildResult>>;
  getImage: (id: string) => Promise<Result<any>>;
  tagImage: (imageId: string, repository: string, tag: string) => Promise<Result<void>>;
  pushImage: (repository: string, tag: string) => Promise<Result<void>>;
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
        const stream = await docker.buildImage(options.context, {
          t: Array.isArray(options.tags) ? options.tags[0] : options.tags,
          dockerfile: options.dockerfile,
          buildargs: options.buildArgs,
        });

        const result = await new Promise<any>((resolve, reject) => {
          docker.modem.followProgress(stream as any,
            (err: any, res: any) => err ? reject(err) : resolve(res),
            (event: any) => logger.debug(event, 'Docker build progress'),
          );
        });

        const buildResult: DockerBuildResult = {
          imageId: result[result.length - 1]?.aux?.ID || '',
          tags: options.tags || [],
          size: 0, // Would need additional inspection to get size
          logs: [],
          success: true,
        };

        return Success(buildResult);
      } catch (error) {
        const errorMessage = `Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ error: errorMessage, options }, 'Docker build failed');

        return Failure(errorMessage);
      }
    },

    async getImage(id: string): Promise<Result<any>> {
      try {
        const image = docker.getImage(id);
        const inspect = await image.inspect();

        const imageInfo = {
          id: inspect.Id,
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

    async pushImage(repository: string, tag: string): Promise<Result<void>> {
      try {
        const image = docker.getImage(`${repository}:${tag}`);
        const stream = await image.push({});

        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(stream as any,
            (err: any) => err ? reject(err) : resolve(),
            (event: any) => logger.debug(event, 'Docker push progress'),
          );
        });

        logger.info({ repository, tag }, 'Image pushed successfully');
        return Success(undefined);
      } catch (error) {
        const errorMessage = `Failed to push image: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },
  };
};
