import type { Logger } from 'pino';
import type { Services } from '../../services/index.js';
import { ToolRegistry } from './ops/registry.js';

/**
 * Create a tool registry with injected services
 */
export function createToolRegistry(services: Services, logger: Logger): ToolRegistry {
  return new ToolRegistry(services, logger);
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
export function getTool(registry: ToolRegistry, name: string): any {
  const tool = registry.getTool(name);
  if (!tool) {
    throw new Error(`Tool '${name}' not found in registry`);
  }
  return tool;
}

// Available tools list (updated to match actual tool names)
export const AVAILABLE_TOOLS = [
  'analyze_repository',
  'resolve_base_images',
  'generate_dockerfile',
  'build_image',
  'scan_image',
  'tag_image',
  'push_image',
  'generate_k8s_manifests',
  'prepare_cluster',
  'deploy_application',
  'verify_deployment',
  'start_workflow',
  'workflow_status',
  'ping',
  'list_tools',
  'server_status',
];
