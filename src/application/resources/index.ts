/**
 * Resource Providers Manager for MCP SDK
 * Central manager for all MCP resource providers
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { ApplicationConfig } from '../../config/index.js';
import type { SessionService } from '../../services/session.js';
import type { DockerService } from '../../services/docker.js';
import type { ToolRegistry } from '../tools/ops/registry.js';

import { WorkflowResourceProvider } from './workflow-resource';
import { SessionResourceProvider } from './session-resource';
import { DockerResourceProvider } from './docker-resource';
import { ConfigResourceProvider } from './config-resource';
import { ToolsResourceProvider } from './tools-resource';

export class ResourceManager {
  private providers: Map<string, unknown> = new Map();
  private resources: Map<string, unknown> = new Map();
  private isRegistered = false;

  constructor(
    private config: ApplicationConfig,
    private sessionService: SessionService,
    private dockerService: DockerService,
    private toolRegistry: ToolRegistry,
    private logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ResourceManager' });
    this.initializeProviders();
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

    // Tools resources - direct registry access
    const toolsProvider = new ToolsResourceProvider(this.toolRegistry, this.logger);
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
  registerWithServer(server: McpServer): void {
    if (this.isRegistered) {
      this.logger.warn('Resources already registered with server');
      return;
    }

    try {
      // Register resources from all providers using new API
      for (const [providerName, provider] of Array.from(this.providers.entries())) {
        this.logger.debug({ provider: providerName }, 'Registering resources');
        const providerResources = (provider as { getResources: () => unknown[] }).getResources();
        for (const resource of providerResources) {
          const resourceObj = resource as {
            uri: string;
            name: string;
            description: string;
            mimeType?: string;
            handler: () => Promise<unknown>;
          };

          // Register each resource using the new API
          server.registerResource(
            resourceObj.name,
            resourceObj.uri,
            {
              title: resourceObj.name,
              description: resourceObj.description,
              mimeType: resourceObj.mimeType ?? 'application/json',
            },
            async () => {
              try {
                const result = await resourceObj.handler();
                return {
                  contents: [
                    {
                      uri: resourceObj.uri,
                      mimeType: resourceObj.mimeType ?? 'application/json',
                      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    },
                  ],
                };
              } catch (error) {
                this.logger.error({ error, uri: resourceObj.uri }, 'Resource handler failed');
                throw new Error(
                  `Resource handler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              }
            },
          );

          this.resources.set(resourceObj.uri, resource);
        }
      }

      // Register meta-resources that were added directly to this.resources
      for (const [uri, resource] of Array.from(this.resources.entries())) {
        // Skip resources that were already registered from providers
        if (
          !Array.from(this.providers.values()).some((provider) => {
            const providerResources =
              (provider as { getResources?: () => unknown[] }).getResources?.() || [];
            return providerResources.some((r: any) => r.uri === uri);
          })
        ) {
          const resourceObj = resource as {
            uri: string;
            name: string;
            description: string;
            mimeType?: string;
            handler: () => unknown;
          };

          // Register meta-resource using the new API
          server.registerResource(
            resourceObj.name,
            resourceObj.uri,
            {
              title: resourceObj.name,
              description: resourceObj.description,
              mimeType: resourceObj.mimeType ?? 'application/json',
            },
            async () => {
              try {
                const result = await Promise.resolve(resourceObj.handler());
                return {
                  contents: [
                    {
                      uri: resourceObj.uri,
                      mimeType: resourceObj.mimeType ?? 'application/json',
                      text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                    },
                  ],
                };
              } catch (error) {
                this.logger.error({ error, uri: resourceObj.uri }, 'Meta-resource handler failed');
                throw new Error(
                  `Meta-resource handler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              }
            },
          );

          this.logger.debug({ uri: resourceObj.uri }, 'Registered meta-resource');
        }
      }

      this.isRegistered = true;
      this.logger.info(
        {
          providers: Array.from(this.providers.keys()),
          metaResources: Array.from(this.resources.keys()).filter((uri) =>
            uri.startsWith('resources://'),
          ),
          totalResources: this.resources.size,
        },
        'All resources registered with server',
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
            providers: {} as Record<string, unknown>,
            issues: [] as string[],
            timestamp: new Date().toISOString(),
          };

          // Check each provider
          for (const [name, _provider] of Array.from(this.providers.entries())) {
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
            (p): p is { status: string } =>
              typeof p === 'object' &&
              p !== null &&
              'status' in p &&
              (p as { status: unknown }).status === 'unhealthy',
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
