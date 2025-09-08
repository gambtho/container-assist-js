/**
 * Dependency Injection Container
 *
 * Provides typed dependency injection for all services with support for testing overrides.
 * Creates and manages application dependencies and services.
 */

import type { Logger } from 'pino';
import { createLogger } from '@lib/logger';
import { createSessionManager, SessionManager } from '@lib/session';
import { PromptRegistry } from '@prompts/prompt-registry';
import {
  createResourceContext,
  createSDKResourceManager,
  type SDKResourceManager,
} from '@resources/manager';
import { createSDKToolRegistry, type SDKToolRegistry } from '@mcp/tools/registry';
import { AIAugmentationService } from '@lib/ai/ai-service';
import type { MCPHostAI } from '@lib/mcp-host-ai';
import type { AIService } from '@types';
import { createAppConfig, type AppConfig } from '@config/app-config';

/**
 * All application dependencies with their types
 */
export interface Deps {
  // Configuration
  config: AppConfig;

  // Core services
  logger: Logger;
  sessionManager: SessionManager;

  // MCP services
  promptRegistry: PromptRegistry;
  resourceManager: SDKResourceManager;
  toolRegistry: SDKToolRegistry;

  // Optional AI services
  aiService?: AIService;
  aiAugmentationService?: AIAugmentationService;
  mcpHostAI?: MCPHostAI;
}

/**
 * Configuration overrides for dependency creation
 */
export interface ContainerConfigOverrides {
  // Use custom configuration instead of default
  config?: AppConfig;

  // AI configuration
  ai?: {
    enabled?: boolean;
    mcpHostAI?: MCPHostAI;
  };
}

/**
 * Partial dependency overrides for testing
 */
export type DepsOverrides = Partial<Deps>;

/**
 * Create application container with all dependencies
 */
export function createContainer(
  configOverrides: ContainerConfigOverrides = {},
  depsOverrides: DepsOverrides = {},
): Deps {
  // Use provided config or create default
  const appConfig = configOverrides.config ?? createAppConfig();

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

  // Create prompt registry
  const promptRegistry = depsOverrides.promptRegistry ?? new PromptRegistry(logger);

  // Create resource manager using config
  const resourceManager =
    depsOverrides.resourceManager ??
    (() => {
      const resourceContext = createResourceContext(
        {
          defaultTtl: appConfig.cache.ttl,
          maxResourceSize: appConfig.workspace.maxFileSize,
          cacheConfig: {
            defaultTtl: appConfig.cache.ttl,
            maxSize: appConfig.cache.maxSize,
            maxMemoryUsage: appConfig.cache.maxSize * 1024, // Convert to bytes estimate
            enableAccessTracking: true,
          },
        },
        logger,
      );
      return createSDKResourceManager(resourceContext);
    })();

  // Create AI services if enabled
  const mcpHostAI = depsOverrides.mcpHostAI ?? configOverrides.ai?.mcpHostAI;
  const aiAugmentationService =
    depsOverrides.aiAugmentationService ??
    (mcpHostAI ? new AIAugmentationService(mcpHostAI, promptRegistry, logger) : undefined);

  // Create tool registry
  const toolRegistry =
    depsOverrides.toolRegistry ?? createSDKToolRegistry(logger, null as any, sessionManager);

  const deps: Deps = {
    config: appConfig,
    logger,
    sessionManager,
    promptRegistry,
    resourceManager,
    toolRegistry,
    ...(mcpHostAI && { mcpHostAI }),
    ...(aiAugmentationService && { aiAugmentationService }),
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
        promptRegistry: deps.promptRegistry !== undefined,
        resourceManager: deps.resourceManager !== undefined,
        toolRegistry: deps.toolRegistry !== undefined,
        toolRegistryType: typeof deps.toolRegistry,
        toolRegistryKeys: deps.toolRegistry?.tools.size,
        aiAugmentationService: deps.aiAugmentationService !== undefined,
        mcpHostAI: deps.mcpHostAI !== undefined,
      },
    },
    'Dependency container created',
  );

  return deps;
}

/**
 * Create container with test overrides for easy testing
 */
export function createTestContainer(overrides: DepsOverrides = {}): Deps {
  const testConfig = createAppConfig();

  // Apply test-specific overrides
  testConfig.server.logLevel = 'error'; // Quiet logs during tests
  testConfig.session.ttl = 60; // Short TTL for tests
  testConfig.session.maxSessions = 10;
  testConfig.cache.ttl = 60;
  testConfig.workspace.maxFileSize = 1024 * 1024; // 1MB max for tests

  return createContainer(
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
  const services = {
    logger: deps.logger !== undefined,
    sessionManager: deps.sessionManager !== undefined,
    promptRegistry: deps.promptRegistry !== undefined,
    resourceManager: deps.resourceManager !== undefined,
    toolRegistry: deps.toolRegistry !== undefined,
    aiAugmentationService: deps.aiAugmentationService !== undefined,
  };

  const healthy = Object.values(services).every(Boolean);

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
