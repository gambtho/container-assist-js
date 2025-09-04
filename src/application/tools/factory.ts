/**
 * Tool Factory - Creates and manages ToolRegistry instance
 */

import { ToolRegistry } from './ops/registry.js';
import type { Logger } from 'pino';
import type { Services } from '../../services/index.js';

export class ToolFactory {
  private registry: ToolRegistry;

  constructor(services: Services, logger: Logger) {
    this.registry = new ToolRegistry(services, logger);
  }

  // Delegate methods to registry
  setServer(server: unknown): void {
    this.registry.setServer(server);
  }

  async registerAll(): Promise<void> {
    return this.registry.registerAll();
  }

  async getAllTools(): Promise<
    Array<{ name: string; description?: string; inputSchema?: unknown }>
    > {
    const result = await this.registry.listTools();
    return result.tools;
  }

  createTool(name: string): any {
    const tool = this.registry.getTool(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return tool;
  }

  async handleToolCall(request: unknown): Promise<any> {
    return this.registry.handleToolCall(request);
  }

  getToolCount(): number {
    return this.registry.getToolCount();
  }

  getToolNames(): string[] {
    return this.registry.getToolNames();
  }
}

// Export AVAILABLE_TOOLS
export const AVAILABLE_TOOLS = [
  'analyze-repository',
  'resolve-base-images',
  'generate-dockerfile',
  'build-image',
  'scan-image',
  'tag-image',
  'push-image',
  'generate-k8s-manifests',
  'prepare-cluster',
  'deploy-application',
  'verify-deployment',
  'start-workflow',
  'workflow-status',
  'ping',
  'list-tools',
  'server-status',
];
