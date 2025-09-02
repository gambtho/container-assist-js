/**
 * Shared type definitions for external infrastructure services
 *
 * Note: For Docker-specific types, import from './cli/docker-cli.js'
 * which contains the most comprehensive interface definitions.
 */

// Re-export Docker CLI types for convenience
export type {
  ImageInfo,
  PullOptions,
  RemoveOptions,
  ListOptions,
  PushOptions,
  PushResult,
  CleanupOptions
} from './cli/docker-cli.js'


