/**
 * Resource Providers Manager for MCP SDK
 * Central manager for all MCP resource providers
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { ApplicationConfig } from '../../config/index';
import type { SessionService } from '../../services/session';
import type { DockerService } from '../../services/docker';
import type { ToolRegistry } from '../tools/ops/registry';
import type { ToolFactory } from '../tools/factory';

import { WorkflowResourceProvider } from './workflow-resource';
import { SessionResourceProvider } from './session-resource';
import { DockerResourceProvider } from './docker-resource';
import { ConfigResourceProvider } from './config-resource';
import { ToolsResourceProvider } from './tools-resource';

// Define resource schemas for MCP protocol
const ResourceListRequestSchema = z.object({
  method: z.literal('resources/list')
});

const ResourceReadRequestSchema = z.object({
  method: z.literal('resources/read'),
  params: z.object({
    uri: z.string()
  })
});

export class ResourceManager {
  private providers: Map<string, any> = new Map();
  private resources: Map<string, any> = new Map();
  private isRegistered = false;

  constructor(
    private config: ApplicationConfig,
    private sessionService: SessionService,
    private dockerService: DockerService,
    private toolRegistryOrFactory: ToolRegistry | ToolFactory,
    private logger: Logger
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
    return {
      listTools: () => {
        const tools = toolFactory.getAllTools();
        return {
          tools: tools.map((tool: unknown) => ({
            name: tool.config?.name ?? 'unknown',
            description: tool.config?.description ?? '',
            inputSchema: tool.inputSchema ?? { type: 'object', properties: {} }
          }))
        };
      },
      getToolCount: () => toolFactory.getAllTools().length
    } as unknown;
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
        providers: Array.from(this.providers.keys())
      },
      'Resource providers initialized'
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
        const providerResources = provider.getResources();
        for (const resource of providerResources) {
          this.resources.set(resource.uri, resource);
        }
      }

      // Register resource list handler
      server.setRequestHandler(ResourceListRequestSchema as unknown, async () => {
        const resourceList = Array.from(this.resources.values()).map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType ?? 'application/json'
        }));

        return { resources: resourceList };
      });

      // Register resource read handler
      server.setRequestHandler(ResourceReadRequestSchema as unknown, async (request: unknown) => {
        const { uri } = request.params;
        const resource = this.resources.get(uri);

        if (!resource) {
          throw new Error(`Resource not found: ${uri}`);
        }

        try {
          // Execute the resource handler
          const result = await resource.handler();

          return {
            contents: [
              {
                uri,
                mimeType: resource.mimeType ?? 'application/json',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          this.logger.error({ error, uri }, 'Failed to read resource');
          throw error;
        }
      });

      this.isRegistered = true;
      this.logger.info(
        {
          resourceCount: this.resources.size
        },
        'All resources registered with MCP server'
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
      handler: async () => {
        try {
          const catalog = {
            categories: {
              workflow: {
                description: 'Workflow state and execution information',
                resources: [
                  { uri: 'workflow://current', name: 'Current Workflow State' },
                  { uri: 'workflow://history', name: 'Workflow History' },
                  { uri: 'workflow://stats', name: 'Workflow Statistics' }
                ]
              },
              session: {
                description: 'Session management and tracking',
                resources: [
                  { uri: 'session://active', name: 'Active Sessions' },
                  { uri: 'session://details/{sessionId}', name: 'Session Details' },
                  { uri: 'session://management', name: 'Session Management' }
                ]
              },
              docker: {
                description: 'Docker system and container information',
                resources: [
                  { uri: 'docker://system', name: 'Docker System Information' },
                  { uri: 'docker://images', name: 'Docker Images' },
                  { uri: 'docker://containers', name: 'Docker Containers' },
                  { uri: 'docker://build-context', name: 'Docker Build Context' }
                ]
              },
              config: {
                description: 'Server configuration and capabilities',
                resources: [
                  { uri: 'config://current', name: 'Current Server Configuration' },
                  { uri: 'config://capabilities', name: 'Server Capabilities' },
                  { uri: 'config://environment', name: 'Server Environment' },
                  { uri: 'config://validation', name: 'Configuration Validation' }
                ]
              },
              tools: {
                description: 'Tool registry and analytics',
                resources: [
                  { uri: 'tools://registry', name: 'Tool Registry' },
                  { uri: 'tools://analytics', name: 'Tool Usage Analytics' },
                  { uri: 'tools://dependencies', name: 'Tool Dependencies' },
                  { uri: 'tools://documentation', name: 'Tool Documentation' }
                ]
              }
            },
            totalResources: this.resources.size,
            timestamp: new Date().toISOString()
          };

          return catalog;
        } catch (error) {
          this.logger.error({ error }, 'Failed to generate resource catalog');
          return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      }
    });

    // Resource health check
    this.resources.set('resources://health', {
      uri: 'resources://health',
      name: 'Resource Health',
      description: 'Health status of all resource providers',
      mimeType: 'application/json',
      handler: async () => {
        try {
          const health = {
            overall: 'healthy',
            providers: {} as Record<string, any>,
            issues: [] as string[],
            timestamp: new Date().toISOString()
          };

          // Check each provider
          for (const [name, _provider] of this.providers.entries()) {
            try {
              // Basic health check - providers are healthy if they exist
              health.providers[name] = {
                status: 'healthy',
                message: 'Provider operational'
              };
            } catch (error) {
              health.providers[name] = {
                status: 'unhealthy',
                message: error instanceof Error ? error.message : 'Unknown error'
              };
              health.issues.push(`${name} provider is unhealthy`);
            }
          }

          // Set overall status
          const unhealthyProviders = Object.values(health.providers).filter(
            (p: unknown) => p.status === 'unhealthy'
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
            timestamp: new Date().toISOString()
          };
        }
      }
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
  getProvider(name: string): any {
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
