/**
 * Docker Client - Library Export
 *
 * Re-exports Docker client functionality from infrastructure for lib/ imports
 */

// Re-export from infrastructure
export {
  createDockerClient,
  type DockerClient,
  type DockerBuildResult,
  type DockerBuildOptions,
  type DockerPushResult,
} from '../infrastructure/docker/client';

export { createDockerRegistryClient, type ImageMetadata } from '../infrastructure/docker/registry';
