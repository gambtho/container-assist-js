/**
 * Native MCP Tool Registration - Direct SDK Usage
 * Replaces complex ToolRegistry wrapper with direct MCP SDK calls
 */

import type { Logger } from 'pino';
import type { Services } from '../../services/index';
import type { ApplicationConfig } from '../../config/types';
import type { ToolDescriptor, ToolContext } from './tool-types';
import type { Session } from '../../domain/types/session';
// import type { SessionService } from '../session/manager'; // unused import
import { convertToMcpError } from '../errors/mcp-error-mapper';
import { z } from 'zod';

// Track registered tools for getRegisteredTools()
const registeredTools: Array<{ name: string; description: string }> = [];

// MCP Server interface (minimal needed for registration)
interface McpServer {
  registerTool: (
    name: string,
    definition: {
      title: string;
      description?: string;
      inputSchema: unknown;
    },
    handler: (
      params: unknown,
      context: unknown,
    ) => Promise<{
      content: Array<{ type: 'text'; text: string }>;
    }>,
  ) => void;
  notification?: (params: { method: string; params: Record<string, unknown> }) => void;
}

/**
 * Simple native MCP tool registration
 * Eliminates the complex ToolRegistry wrapper class
 */
export async function registerToolsNatively(
  server: McpServer,
  services: Services,
  logger: Logger,
  config: ApplicationConfig,
): Promise<void> {
  const toolLogger = logger.child({ component: 'NativeToolRegistration' });

  // Clear registered tools array at start of registration
  registeredTools.length = 0;

  // Create reusable tool context factory
  const createToolContext = async (contextOrSignal?: unknown): Promise<ToolContext> => {
    const { WorkflowManager } = await import('../workflow/manager');
    const { WorkflowOrchestrator } = await import('../workflow/orchestrator');
    const { SessionService: AppSessionService } = await import('../session/manager');
    const { SessionStore: InfraSessionStore } = await import('../../infrastructure/session-store');

    const workflowManager = new WorkflowManager(logger);

    // Create an application-layer SessionService with an in-memory store
    const sessionStore = new InfraSessionStore(logger);

    // Create an adapter that implements the domain SessionStore interface
    const storeAdapter = {
      create: (session: Session) => {
        sessionStore.set(session.id, session);
        return Promise.resolve();
      },
      get: (id: string) => Promise.resolve(sessionStore.get(id)),
      update: (id: string, session: Session) => {
        sessionStore.set(id, session);
        return Promise.resolve();
      },
      delete: (id: string) => {
        sessionStore.delete(id);
        return Promise.resolve();
      },
      list: () => Promise.resolve(sessionStore.list()),
      updateAtomic: (id: string, updater: (current: Session) => Session) => {
        const current = sessionStore.get(id);
        if (current) {
          const updated = updater(current);
          sessionStore.set(id, updated);
        }
        return Promise.resolve();
      },
      createBatch: (sessions: Session[]) => {
        for (const session of sessions) {
          sessionStore.set(session.id, session);
        }
        return Promise.resolve();
      },
      getActiveCount: () => Promise.resolve(sessionStore.list().length),
      getByStatus: (status: Session['status']) =>
        Promise.resolve(sessionStore.list().filter((s) => s.status === status)),
      getRecentlyUpdated: (limit: number) => Promise.resolve(sessionStore.list().slice(0, limit)),
    };

    const appSessionService = new AppSessionService(storeAdapter as any, logger);
    const workflowOrchestrator = new WorkflowOrchestrator(appSessionService, logger);

    const progressEmitter = services.events;
    const eventPublisher = services.events;

    const context = {
      server,
      logger,
      sessionService: services.session,
      progressEmitter,
      dockerService: services.docker,
      kubernetesService: services.kubernetes,
      aiService: services.ai,
      eventPublisher,
      workflowManager,
      workflowOrchestrator,
      config,
      logPerformanceMetrics: (operation: string, duration: number, metadata?: unknown) => {
        try {
          server.notification?.({
            method: 'notifications/message',
            params: {
              level: 'info',
              logger: 'tool-performance',
              data: {
                operation,
                duration,
                metadata: metadata ?? {},
                timestamp: new Date().toISOString(),
              },
            },
          });
        } catch (error) {
          logger.info({ operation, duration, metadata }, 'Performance metrics');
        }
      },
    };

    // Only add signal if it's defined
    if (contextOrSignal && typeof contextOrSignal === 'object' && 'aborted' in contextOrSignal) {
      // Safely add signal to context without type assertion issues
      (context as any).signal = contextOrSignal;
    }

    return context;
  };

  // Helper function to register a single tool
  const registerTool = <TInput, TOutput>(descriptor: ToolDescriptor<TInput, TOutput>): void => {
    // Track tool for getRegisteredTools()
    registeredTools.push({ name: descriptor.name, description: descriptor.description });

    // MCP SDK expects ZodRawShape (the .shape property of a ZodObject)
    // Check if the schema is a ZodObject and extract its shape
    let inputSchemaForMcp: z.ZodRawShape | undefined;

    if (descriptor.inputSchema instanceof z.ZodObject) {
      inputSchemaForMcp = descriptor.inputSchema.shape;
    }

    server.registerTool(
      descriptor.name,
      {
        title: descriptor.name,
        description: descriptor.description,
        inputSchema: inputSchemaForMcp,
      },
      async (params: unknown, context: unknown) => {
        const toolLogger = logger.child({ tool: descriptor.name });

        try {
          // Create tool context
          const toolContext = await createToolContext(context);

          // Validate input using Zod
          const validatedInput = descriptor.inputSchema.parse(params) as TInput;

          // Execute tool handler
          const result = await descriptor.handler(validatedInput, toolContext);

          // Validate output
          const validatedOutput = descriptor.outputSchema.parse(result);

          // Format response
          const responseText = `✅ **${descriptor.name} completed**\n${JSON.stringify(validatedOutput, null, 2)}`;

          return {
            content: [{ type: 'text' as const, text: responseText }],
          };
        } catch (error) {
          toolLogger.error({ error }, 'Tool execution failed');
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          return {
            content: [
              { type: 'text' as const, text: `❌ **${descriptor.name} failed**: ${errorMessage}` },
            ],
          };
        }
      },
    );

    toolLogger.info(
      {
        tool: descriptor.name,
        category: descriptor.category,
        registrationMethod: 'native-mcp-sdk',
      },
      'Tool registered natively',
    );
  };

  // Load and register tools directly
  try {
    let registeredCount = 0;

    // Import and register utility tools
    const pingTool = await import('./ops/ping.js');
    if (pingTool.default) {
      registerTool(pingTool.default);
      registeredCount++;
    }

    const serverStatusTool = await import('./ops/server-status.js');
    if (serverStatusTool.default) {
      registerTool(serverStatusTool.default);
      registeredCount++;
    }

    // Import and register workflow tools
    const analyzeRepoTool = await import('./analyze-repo/index.js');
    if (analyzeRepoTool.default) {
      registerTool(analyzeRepoTool.default);
      registeredCount++;
    }

    const generateDockerfileTool = await import('./generate-dockerfile/index.js');
    if (generateDockerfileTool.default) {
      registerTool(generateDockerfileTool.default);
      registeredCount++;
    }

    const buildImageTool = await import('./build-image/index.js');
    if (buildImageTool.default) {
      registerTool(buildImageTool.default);
      registeredCount++;
    }

    const tagImageTool = await import('./tag-image/index.js');
    if (tagImageTool.default) {
      registerTool(tagImageTool.default);
      registeredCount++;
    }

    const pushImageTool = await import('./push-image/index.js');
    if (pushImageTool.default) {
      registerTool(pushImageTool.default);
      registeredCount++;
    }

    const scanImageTool = await import('./scan-image/index.js');
    if (scanImageTool.default) {
      registerTool(scanImageTool.default);
      registeredCount++;
    }

    const fixDockerfileTool = await import('./fix-dockerfile/index.js');
    if (fixDockerfileTool.default) {
      registerTool(fixDockerfileTool.default);
      registeredCount++;
    }

    const generateK8sTool = await import('./generate-k8s-manifests/index.js');
    if (generateK8sTool.default) {
      registerTool(generateK8sTool.default);
      registeredCount++;
    }

    const deployAppTool = await import('./deploy-application/index.js');
    if (deployAppTool.default) {
      registerTool(deployAppTool.default);
      registeredCount++;
    }

    const verifyDeploymentTool = await import('./verify-deployment/index.js');
    if (verifyDeploymentTool.default) {
      registerTool(verifyDeploymentTool.default);
      registeredCount++;
    }

    const resolveBaseImagesTool = await import('./resolve-base-images/index.js');
    if (resolveBaseImagesTool.default) {
      registerTool(resolveBaseImagesTool.default);
      registeredCount++;
    }

    const prepareClusterTool = await import('./prepare-cluster/prepare-cluster.js');
    if (prepareClusterTool.default) {
      registerTool(prepareClusterTool.default);
      registeredCount++;
    }

    toolLogger.info({ toolCount: registeredCount }, 'All tools registered natively with MCP SDK');
  } catch (error) {
    toolLogger.error({ error }, 'Failed to register tools natively');
    throw convertToMcpError(error);
  }
}

/**
 * Simple tool listing for status/debugging
 * Returns the actual list of registered tools to prevent drift
 */
export function getRegisteredTools(): Array<{ name: string; description: string }> {
  // Return a copy of the registered tools array
  return [...registeredTools];
}
