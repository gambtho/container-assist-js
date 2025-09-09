/**
 * Docker Client - Library Export
 *
 * Re-exports Docker client functionality from infrastructure for lib/ imports
 */

// Re-export from infrastructure
export { createDockerClient } from '../infrastructure/docker/client';

export { createDockerRegistryClient } from '../infrastructure/docker/registry';
