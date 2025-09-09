/**
 * Dependency Injection Container
 *
 * Provides typed dependency injection for all services with support for testing overrides.
 * Creates and manages application dependencies and services.
 */

import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';
import { createSessionManager, SessionManager } from '../lib/session';
import { PromptRegistryCompatAdapter, createTemplateEngine } from '../core/templates';
import {
  createResourceContext,
  createSDKResourceManager,
  type SDKResourceManager,
} from '../resources/manager';
import { createSDKToolRegistry, type SDKToolRegistry } from '../mcp/tools/registry';
import type { AIService } from '../domain/types';
import { createAppConfig, type AppConfig } from '../config/app-config';
import { createDockerClient, type DockerClient } from '../infrastructure/docker/client';
import { createKubernetesClient, type KubernetesClient } from '../infrastructure/kubernetes/client';

/**
 * All application dependencies with their types
 */
export interface Deps {
  // Configuration
  config: AppConfig;

  // Core services
  logger: Logger;
  sessionManager: SessionManager;

  // Infrastructure clients
  dockerClient: DockerClient;
  kubernetesClient: KubernetesClient;

  // MCP services
  promptRegistry: PromptRegistryCompatAdapter;
  resourceManager: SDKResourceManager;
  toolRegistry: SDKToolRegistry;

  // Optional AI services
  aiService?: AIService;
}

/**
 * Container environment presets
 */
export type ContainerEnvironment = 'default' | 'test' | 'mcp';

/**
 * Configuration overrides for dependency creation
 */
export interface ContainerConfigOverrides {
  // Use custom configuration instead of default
  config?: AppConfig;

  // Environment preset
  environment?: ContainerEnvironment;

  // AI configuration
  ai?: {
    enabled?: boolean;
  };
}

/**
 * Partial dependency overrides for testing
 */
export type DepsOverrides = Partial<Deps>;

/**
 * Create application container with all dependencies
 */
export async function createContainer(
  configOverrides: ContainerConfigOverrides = {},
  depsOverrides: DepsOverrides = {},
): Promise<Deps> {
  // Use provided config or create default
  const appConfig = configOverrides.config ?? createAppConfig();

  // Apply environment-specific overrides
  const environment = configOverrides.environment ?? 'default';
  if (environment === 'test') {
    appConfig.server.logLevel = 'error'; // Quiet logs during tests
    appConfig.session.ttl = 60; // Short TTL for tests
    appConfig.session.maxSessions = 10;
    appConfig.workspace.maxFileSize = 1024 * 1024; // 1MB max for tests
  } else if (environment === 'mcp') {
    appConfig.mcp.name = 'mcp-server';
  }

  // Create logger first as other services depend on it
  const logger =
    depsOverrides.logger ??
    createLogger({
      name: appConfig.mcp.name,
      level: appConfig.server.logLevel,
    });

  // Create session manager using config
  const sessionManager =
    depsOverrides.sessionManager ??
    createSessionManager(logger, {
      ttl: appConfig.session.ttl,
      maxSessions: appConfig.session.maxSessions,
      cleanupIntervalMs: appConfig.session.cleanupInterval,
    });

  // Create infrastructure clients
  const dockerClient = depsOverrides.dockerClient ?? createDockerClient(logger);
  const kubernetesClient = depsOverrides.kubernetesClient ?? createKubernetesClient(logger);

  // Create prompt registry using new template system
  const promptRegistry =
    depsOverrides.promptRegistry ??
    (await (async () => {
      const engineResult = await createTemplateEngine(logger);
      if (engineResult.isFailure()) {
        logger.error(
          { error: engineResult.error },
          'Failed to create template engine, using fallback',
        );
        throw new Error(`Template engine creation failed: ${engineResult.error}`);
      }
      return new PromptRegistryCompatAdapter(engineResult.value, logger);
    })());

  // Create resource manager using config
  const resourceManager =
    depsOverrides.resourceManager ??
    (() => {
      const resourceContext = createResourceContext(
        {
          defaultTtl: appConfig.cache.ttl,
          maxResourceSize: appConfig.workspace.maxFileSize,
        },
        logger,
      );
      return createSDKResourceManager(resourceContext);
    })();

  // Create tool registry
  const toolRegistry =
    depsOverrides.toolRegistry ?? createSDKToolRegistry(logger, null as any, sessionManager);

  const deps: Deps = {
    config: appConfig,
    logger,
    sessionManager,
    dockerClient,
    kubernetesClient,
    promptRegistry,
    resourceManager,
    toolRegistry,
  };

  logger.info(
    {
      config: {
        nodeEnv: appConfig.server.nodeEnv,
        logLevel: appConfig.server.logLevel,
        port: appConfig.server.port,
        maxSessions: appConfig.mcp.maxSessions,
        dockerSocket: appConfig.docker.socketPath,
        k8sNamespace: appConfig.kubernetes.namespace,
      },
      services: {
        logger: deps.logger !== undefined,
        sessionManager: deps.sessionManager !== undefined,
        dockerClient: deps.dockerClient !== undefined,
        kubernetesClient: deps.kubernetesClient !== undefined,
        promptRegistry: deps.promptRegistry !== undefined,
        resourceManager: deps.resourceManager !== undefined,
        toolRegistry: deps.toolRegistry !== undefined,
        toolRegistryType: typeof deps.toolRegistry,
        toolRegistryKeys: deps.toolRegistry?.tools.size,
      },
    },
    'Dependency container created',
  );

  return deps;
}

/**
 * Create container with test overrides for easy testing
 */
export async function createTestContainer(overrides: DepsOverrides = {}): Promise<Deps> {
  const testConfig = createAppConfig();

  // Apply test-specific overrides
  testConfig.server.logLevel = 'error'; // Quiet logs during tests
  testConfig.session.ttl = 60; // Short TTL for tests
  testConfig.session.maxSessions = 10;
  testConfig.workspace.maxFileSize = 1024 * 1024; // 1MB max for tests

  return await createContainer(
    {
      config: testConfig,
      ai: {
        enabled: false, // Disable AI by default in tests
      },
    },
    overrides,
  );
}

/**
 * Create container specifically for MCP server usage
 */
export function createMCPContainer(
  configOverrides: ContainerConfigOverrides = {},
  depsOverrides: DepsOverrides = {},
): Deps {
  const mcpConfig = configOverrides.config ?? createAppConfig();

  // MCP server specific overrides
  mcpConfig.mcp.name = 'mcp-server';

  return createContainer(
    {
      config: mcpConfig,
      ...configOverrides,
    },
    depsOverrides,
  );
}

/**
 * Gracefully shutdown all services in the container
 */
export async function shutdownContainer(deps: Deps): Promise<void> {
  const { logger, sessionManager } = deps;

  logger.info('Shutting down container services...');

  try {
    // Close session manager (stops cleanup timers)
    if ('close' in sessionManager && typeof sessionManager.close === 'function') {
      sessionManager.close();
    }

    // Clean up resource manager
    if ('cleanup' in deps.resourceManager) {
      await deps.resourceManager.cleanup();
    }

    logger.info('Container shutdown complete');
  } catch (error) {
    logger.error({ error }, 'Error during container shutdown');
    throw error;
  }
}

/**
 * Container status information
 */
export interface ContainerStatus {
  healthy: boolean;
  running: boolean;
  services: Record<string, boolean>;
  stats: {
    tools: number;
    resources: number;
    prompts: number;
    workflows: number;
  };
  details?: Record<string, unknown>;
}

/**
 * Health check for container services
 */
export function checkContainerHealth(deps: Deps): {
  healthy: boolean;
  services: Record<string, boolean>;
  details?: Record<string, unknown>;
} {
  const requiredServices = {
    logger: deps.logger !== undefined,
    sessionManager: deps.sessionManager !== undefined,
    dockerClient: deps.dockerClient !== undefined,
    kubernetesClient: deps.kubernetesClient !== undefined,
    promptRegistry: deps.promptRegistry !== undefined,
    resourceManager: deps.resourceManager !== undefined,
    toolRegistry: deps.toolRegistry !== undefined,
  };

  const optionalServices = {};

  const services = { ...requiredServices, ...optionalServices };
  const healthy = Object.values(requiredServices).every(Boolean);

  const details = {
    toolCount: deps.toolRegistry.tools.size,
    promptCount: deps.promptRegistry.hasPrompt('dockerfile-generation') ? 7 : 0,
    resourceStats: 'getStats' in deps.resourceManager ? deps.resourceManager.getStats() : undefined,
  };

  return {
    healthy,
    services,
    details,
  };
}

/**
 * Get comprehensive container status
 * This is the single source of truth for system status
 */
export function getContainerStatus(deps: Deps, serverRunning: boolean = false): ContainerStatus {
  const healthCheck = checkContainerHealth(deps);

  // Count prompts - check if prompt registry has the base prompts
  const promptCount = deps.promptRegistry.hasPrompt('dockerfile-generation') ? 7 : 0;

  // Get resource stats
  const resourceStats = deps.resourceManager.getStats();

  // Tool count from registry
  const toolCount = deps.toolRegistry.tools.size;

  return {
    healthy: healthCheck.healthy,
    running: serverRunning,
    services: healthCheck.services,
    stats: {
      tools: toolCount,
      resources: resourceStats.total,
      prompts: promptCount,
      workflows: 2, // containerization and deployment workflows
    },
    ...(healthCheck.details && { details: healthCheck.details }),
  };
}
