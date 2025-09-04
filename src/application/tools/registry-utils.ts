import type { Logger } from 'pino';
import type { Services } from '../../services/index.js';
import type { ToolDescriptor } from './tool-types.js';
import { ToolRegistry } from './ops/registry.js';
import type { ApplicationConfig } from '../../config/types.js';
import { TOOL_MANIFEST, ToolStatus } from './tool-manifest.js';

/**
 * Create a tool registry with injected services
 */
export function createToolRegistry(
  services: Services,
  logger: Logger,
  config: ApplicationConfig,
): ToolRegistry {
  return new ToolRegistry(services, logger, config);
}

/**
 * Load and register all available tools
 */
export async function loadAllTools(registry: ToolRegistry): Promise<void> {
  await registry.registerAll();
}

/**
 * Get tool by name with error handling
 */
export function getTool(registry: ToolRegistry, name: string): ToolDescriptor {
  const tool = registry.getTool(name);
  if (!tool) {
    throw new Error(`Tool '${name}' not found in registry`);
  }
  return tool;
}

/**
 * Dynamically discover available tools from the tool manifest
 * @param includeStubs - Whether to include stub implementations
 * @returns Array of available tool names
 */
export function discoverAvailableTools(includeStubs = false): string[] {
  const tools: string[] = [];

  for (const [toolName, manifest] of Object.entries(TOOL_MANIFEST)) {
    // Include tool if it's implemented or partial
    // Optionally include stubs based on parameter
    if (
      manifest.status === ToolStatus.IMPLEMENTED ||
      manifest.status === ToolStatus.PARTIAL ||
      (includeStubs && manifest.status === ToolStatus.STUB)
    ) {
      tools.push(toolName);
    }
  }

  return tools.sort(); // Return sorted for consistency
}

/**
 * Get tools by category
 * @param category - Tool category to filter by
 * @returns Array of tool names in the specified category
 */
export function getToolsByCategory(category: string): string[] {
  const tools: string[] = [];

  for (const [toolName, manifest] of Object.entries(TOOL_MANIFEST)) {
    if (
      manifest.category === category &&
      (manifest.status === ToolStatus.IMPLEMENTED || manifest.status === ToolStatus.PARTIAL)
    ) {
      tools.push(toolName);
    }
  }

  return tools;
}

// Export a static list for backwards compatibility
// This will be dynamically generated from the manifest
export const AVAILABLE_TOOLS = discoverAvailableTools();
