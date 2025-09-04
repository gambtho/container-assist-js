/**
 * Resource Providers Manager for MCP SDK
 * Central manager for all MCP resource providers
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Logger } from 'pino';
import type { ApplicationConfig } from '../../config/index.js';
import type { SessionService } from '../../services/session.js';
import type { DockerService } from '../../services/docker.js';
import type { ToolRegistry } from '../tools/ops/registry.js';
import type { ToolFactory } from '../tools/factory.js';

import { WorkflowResourceProvider } from './workflow-resource';
import { SessionResourceProvider } from './session-resource';
import { DockerResourceProvider } from './docker-resource';
import { ConfigResourceProvider } from './config-resource';
import { ToolsResourceProvider } from './tools-resource';

// Resource schemas removed - using direct string literals instead

export class ResourceManager {
  private providers: Map<string, unknown> = new Map();
  private resources: Map<string, unknown> = new Map();
  private isRegistered = false;

  constructor(
    private config: ApplicationConfig,
    private sessionService: SessionService,
    private dockerService: DockerService,
    private toolRegistryOrFactory: ToolRegistry | ToolFactory,
    private logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ResourceManager' });
    this.initializeProviders();
  }

  /**
   * Create a tool registry adapter for ToolFactory compatibility
   */
  private createToolRegistryAdapter(): ToolRegistry {
    if ('listTools' in this.toolRegistryOrFactory) {
      // It's a ToolRegistry'
      return this.toolRegistryOrFactory;
    }

    // Create adapter for ToolFactory
    const toolFactory = this.toolRegistryOrFactory;
    const adapter = {
      listTools: async () => {
        const tools = await toolFactory.getAllTools();
        return {
          tools: tools.map((tool: unknown) => ({
            name: (tool as Record<string, unknown>).name ?? 'unknown',
            description: (tool as Record<string, unknown>).description ?? '',
            inputSchema: (tool as Record<string, unknown>).inputSchema ?? {
              type: 'object',
              properties: {},
            },
          })),
        };
      },
      getToolCount: () => {
        // Return a synchronous count
        return 0; // ToolFactory doesn't provide sync count
      },
      getTool: (_name: string) => {
        // ToolFactory doesn't provide synchronous getTool
        return undefined;
      },
      getToolNames: () => {
        // ToolFactory doesn't provide synchronous names
        return [];
      },
      handleToolCall: async (_request: unknown) => {
        // Delegate to factory if it has a handler
        return Promise.resolve({
          content: [{ type: 'text', text: 'Not implemented' }],
          success: false,
        });
      },
      handleSamplingRequest: async (_request: unknown) => {
        // Delegate to factory if it has a handler
        return Promise.resolve({
          content: [{ type: 'text', text: 'Not implemented' }],
          success: false,
        });
      },
      register: () => {
        // No-op for factory adapter
      },
      registerAll: async () => {
        // No-op for factory adapter
        return Promise.resolve();
      },
      setServer: () => {
        // No-op for factory adapter
      },
    };

    return adapter as unknown as ToolRegistry;
  }

  /**
   * Initialize all resource providers
   */
  private initializeProviders(): void {
    // Workflow resources
    const workflowProvider = new WorkflowResourceProvider(this.sessionService, this.logger);
    this.providers.set('workflow', workflowProvider);

    // Session resources
    const sessionProvider = new SessionResourceProvider(this.sessionService, this.logger);
    this.providers.set('session', sessionProvider);

    // Docker resources
    const dockerProvider = new DockerResourceProvider(this.dockerService, this.logger);
    this.providers.set('docker', dockerProvider);

    // Configuration resources
    const configProvider = new ConfigResourceProvider(this.config, this.logger);
    this.providers.set('config', configProvider);

    // Tools resources - create adapter for ToolFactory if needed
    const toolsProvider = new ToolsResourceProvider(this.createToolRegistryAdapter(), this.logger);
    this.providers.set('tools', toolsProvider);

    // Register meta-resources
    this.registerMetaResources();

    this.logger.info(
      {
        providers: Array.from(this.providers.keys()),
      },
      'Resource providers initialized',
    );
  }

  /**
   * Register all resource providers with MCP server
   */
  registerWithServer(server: Server): void {
    if (this.isRegistered) {
      this.logger.warn('Resources already registered with server');
      return;
    }

    try {
      // Collect resources from all providers
      for (const [name, provider] of this.providers.entries()) {
        this.logger.debug({ provider: name }, 'Collecting resources');
        const providerResources = (provider as { getResources: () => unknown[] }).getResources();
        for (const resource of providerResources) {
          this.resources.set((resource as { uri: string }).uri, resource);
        }
      }

      // Register resource list handler
      server.setRequestHandler('resources/list' as any, () => {
        const resourceList = Array.from(this.resources.values()).map((r) => {
          const resource = r as {
            uri: string;
            name: string;
            description: string;
            mimeType?: string;
          };
          return {
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType ?? 'application/json',
          };
        });

        return { resources: resourceList };
      });

      // Register resource read handler
      server.setRequestHandler(
        'resources/read' as any,
        async (request: { params: { uri: string } }) => {
          const { uri } = request.params;
          const resource = this.resources.get(uri);

          if (resource == null) {
            throw new Error(`Resource not found: ${uri}`);
          }

          const resourceObj = resource as { handler: () => Promise<unknown>; mimeType?: string };

          try {
            // Execute the resource handler
            const result = await resourceObj.handler();

            return {
              contents: [
                {
                  uri,
                  mimeType: resourceObj.mimeType ?? 'application/json',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error, uri }, 'Failed to read resource');
            throw error;
          }
        },
      );

      this.isRegistered = true;
      this.logger.info(
        {
          resourceCount: this.resources.size,
        },
        'All resources registered with MCP server',
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to register resource providers');
      throw error;
    }
  }

  /**
   * Register meta-resources that provide information about available resources
   */
  private registerMetaResources(): void {
    // Resource catalog
    this.resources.set('resources://catalog', {
      uri: 'resources://catalog',
      name: 'Resource Catalog',
      description: 'Complete catalog of available MCP resources',
      mimeType: 'application/json',
      handler: () => {
        try {
          const catalog = {
            categories: {
              workflow: {
                description: 'Workflow state and execution information',
                resources: [
                  { uri: 'workflow://current', name: 'Current Workflow State' },
                  { uri: 'workflow://history', name: 'Workflow History' },
                  { uri: 'workflow://stats', name: 'Workflow Statistics' },
                ],
              },
              session: {
                description: 'Session management and tracking',
                resources: [
                  { uri: 'session://active', name: 'Active Sessions' },
                  { uri: 'session://details/{sessionId}', name: 'Session Details' },
                  { uri: 'session://management', name: 'Session Management' },
                ],
              },
              docker: {
                description: 'Docker system and container information',
                resources: [
                  { uri: 'docker://system', name: 'Docker System Information' },
                  { uri: 'docker://images', name: 'Docker Images' },
                  { uri: 'docker://containers', name: 'Docker Containers' },
                  { uri: 'docker://build-context', name: 'Docker Build Context' },
                ],
              },
              config: {
                description: 'Server configuration and capabilities',
                resources: [
                  { uri: 'config://current', name: 'Current Server Configuration' },
                  { uri: 'config://capabilities', name: 'Server Capabilities' },
                  { uri: 'config://environment', name: 'Server Environment' },
                  { uri: 'config://validation', name: 'Configuration Validation' },
                ],
              },
              tools: {
                description: 'Tool registry and analytics',
                resources: [
                  { uri: 'tools://registry', name: 'Tool Registry' },
                  { uri: 'tools://analytics', name: 'Tool Usage Analytics' },
                  { uri: 'tools://dependencies', name: 'Tool Dependencies' },
                  { uri: 'tools://documentation', name: 'Tool Documentation' },
                ],
              },
            },
            totalResources: this.resources.size,
            timestamp: new Date().toISOString(),
          };

          return catalog;
        } catch (error) {
          this.logger.error({ error }, 'Failed to generate resource catalog');
          return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          };
        }
      },
    });

    // Resource health check
    this.resources.set('resources://health', {
      uri: 'resources://health',
      name: 'Resource Health',
      description: 'Health status of all resource providers',
      mimeType: 'application/json',
      handler: () => {
        try {
          const health = {
            overall: 'healthy',
            providers: {} as Record<string, any>,
            issues: [] as string[],
            timestamp: new Date().toISOString(),
          };

          // Check each provider
          for (const [name, _provider] of this.providers.entries()) {
            try {
              // Basic health check - providers are healthy if they exist
              health.providers[name] = {
                status: 'healthy',
                message: 'Provider operational',
              };
            } catch (error) {
              health.providers[name] = {
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Unknown error',
              };
              health.issues.push(`${name} provider is unhealthy`);
            }
          }

          // Set overall status
          const unhealthyProviders = Object.values(health.providers).filter(
            (p: { status: string }) => p.status === 'unhealthy',
          );

          if (unhealthyProviders.length > 0) {
            health.overall = 'degraded';
          }

          return health;
        } catch (error) {
          this.logger.error({ error }, 'Failed to generate health status');
          return {
            overall: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          };
        }
      },
    });
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if resources have been registered
   */
  isResourcesRegistered(): boolean {
    return this.isRegistered;
  }

  /**
   * Get a specific provider
   */
  getProvider(name: string): unknown {
    return this.providers.get(name);
  }

  /**
   * Get total resource count
   */
  getResourceCount(): number {
    return this.resources.size;
  }
}

export * from './workflow-resource';
export * from './session-resource';
export * from './docker-resource';
export * from './config-resource';
export * from './tools-resource';
