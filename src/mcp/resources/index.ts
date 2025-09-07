/**
 * MCP Resources Module - Functional API
 * Exports the new functional resource management API
 */

// Functional resource operations
export {
  publishResource,
  readResource,
  invalidateResource,
  listResources,
  cleanupResources,
  getResourceMetadata,
  createResourceContext,
  createResourceAPI,
} from './manager.js';

// Types
export type { ResourceConfig, ResourceContext } from './manager.js';

export type { Resource, ResourceCache } from './types.js';

// Backward compatibility
export { McpResourceManager } from './manager.js';
