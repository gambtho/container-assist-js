/**
 * Factory - MCP SDK Compatible Version
 */

import { BaseMCPToolDescriptor } from './base-handler';
import type { CoreServices } from '../services/interfaces.js';
import { getSimpleToolConfig, type SimpleToolConfig } from './simple-config';

// Import tools
import analyzeRepositoryHandler from './analysis/analyze-repository';
import buildImageHandler from './build/build-image';
import generateDockerfileHandler from './build/generate-dockerfile';
import scanImageHandler from './build/scan-image';
import tagImageHandler from './build/tag-image';
import pushImageHandler from './build/push-image';
import generateK8sManifestsHandler from './deploy/generate-k8s-manifests';
import deployApplicationHandler from './deploy/deploy-application';
import pingHandler from './ops/ping';
import listToolsHandler from './ops/list-tools';
import serverStatusHandler from './ops/server-status';

/**
 * Legacy tool handler interface for backwards compatibility
 */
interface LegacyToolHandler {
  name: string;
  description?: string;
  category?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  execute: (input: unknown, context: unknown) => Promise<unknown>;
  chainHint?: string;
}

/**
 * Wrapper to make legacy handlers compatible with new base class
 */
class LegacyToolWrapper extends BaseMCPToolDescriptor {
  constructor(
    services: CoreServices,
    config: SimpleToolConfig,
    private legacyHandler:
      | LegacyToolHandler
      | {
          handler: (input: unknown, context: unknown) => Promise<unknown>;
          inputSchema: Record<string, unknown>;
          outputSchema?: Record<string, unknown>;
          chainHint?: string;
        }
  ) {
    super(services, config);
  }

  override get inputSchema() {
    return this.legacyHandler.inputSchema;
  }

  override get outputSchema() {
    return this.legacyHandler.outputSchema;
  }

  override get chainHint() {
    return this.legacyHandler.chainHint;
  }

  async handler(input: unknown): Promise<unknown> {
    // Create legacy context from services
    const context = {
      logger: this.services.logger,
      sessionService: this.services.session,
      dockerService: this.services.docker,
      kubernetesService: this.services.kubernetes,
      aiService: this.services.ai,
      progressEmitter: this.services.progress,

      // Legacy getters for backwards compatibility
      getDockerService: async () => this.services.docker,
      getKubernetesService: async () => this.services.kubernetes,
      getAIService: async () => this.services.ai,
      getSessionService: async () => this.services.session,
      getProgressEmitter: async () => this.services.progress
    };

    // Check if it's an MCP tool descriptor or legacy handler'
    if ('handler' in this.legacyHandler) {
      return await this.legacyHandler.handler(input, context);
    } else if ('execute' in this.legacyHandler) {
      return await this.legacyHandler.execute(input, context);
    } else {
      throw new Error('Invalid tool handler');
    }
  }
}

/**
 * Tool factory that creates handlers with dependency injection
 */
export class ToolFactory {
  constructor(private services: CoreServices) {}

  /**
   * Create a tool handler by name
   */
  createTool(toolName: string): BaseMCPToolDescriptor {
    const config = getSimpleToolConfig(toolName);

    // Route all tools through legacy wrapper
    switch (toolName) {
      case 'analyze_repository':
        return new LegacyToolWrapper(this.services, config, analyzeRepositoryHandler);

      // Other tools wrapped for compatibility
      case 'build_image':
        return new LegacyToolWrapper(this.services, config, buildImageHandler);

      case 'scan_image':
        return new LegacyToolWrapper(this.services, config, scanImageHandler);

      case 'generate_dockerfile':
        return new LegacyToolWrapper(this.services, config, generateDockerfileHandler);

      case 'tag_image':
        return new LegacyToolWrapper(this.services, config, tagImageHandler);

      case 'push_image':
        return new LegacyToolWrapper(this.services, config, pushImageHandler);

      case 'generate_k8s_manifests':
        return new LegacyToolWrapper(this.services, config, generateK8sManifestsHandler);

      case 'deploy_application':
        return new LegacyToolWrapper(this.services, config, deployApplicationHandler);

      case 'ping':
        return new LegacyToolWrapper(this.services, config, pingHandler);

      case 'list_tools':
        return new LegacyToolWrapper(this.services, config, listToolsHandler);

      case 'server_status':
        return new LegacyToolWrapper(this.services, config, serverStatusHandler);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get all available tools
   */
  getAllTools(): BaseMCPToolDescriptor[] {
    return AVAILABLE_TOOLS.map((name) => this.createTool(name));
  }
}

/**
 * List of all available tools
 */
export const AVAILABLE_TOOLS = [
  // Analysis
  'analyze_repository',

  // Build workflow
  'generate_dockerfile',
  'build_image',
  'scan_image',
  'tag_image',
  'push_image',

  // Deploy workflow
  'generate_k8s_manifests',
  'deploy_application',

  // Operations
  'ping',
  'list_tools',
  'server_status'
] as const;

/**
 * Tool names type
 */
export type ToolName = (typeof AVAILABLE_TOOLS)[number];

/**
 * Helper to check if a tool name is valid
 */
export function isValidToolName(name: string): name is ToolName {
  return (AVAILABLE_TOOLS as readonly string[]).includes(name);
}
