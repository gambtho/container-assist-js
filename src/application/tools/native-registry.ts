/**
 * Native MCP Tool Registration - Direct SDK Usage
 * Replaces complex ToolRegistry wrapper with direct MCP SDK calls
 */

import type { Logger } from 'pino';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Services } from '../../services/index';
import type { ApplicationConfig } from '../../config/types';
import type { ToolDescriptor, ToolContext } from './tool-types';
import { convertToMcpError } from '../errors/mcp-error-mapper';

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

  // Create reusable tool context factory
  const createToolContext = async (contextOrSignal?: unknown): Promise<ToolContext> => {
    const { WorkflowManager } = await import('../workflow/manager');
    const { WorkflowOrchestrator } = await import('../workflow/orchestrator');

    const workflowManager = new WorkflowManager(logger);
    const workflowOrchestrator = new WorkflowOrchestrator(services.session as any, logger);

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
      (context as any).signal = contextOrSignal;
    }

    return context;
  };

  // Helper function to register a single tool
  const registerTool = <TInput, TOutput>(descriptor: ToolDescriptor<TInput, TOutput>) => {
    server.registerTool(
      descriptor.name,
      {
        title: descriptor.name,
        description: descriptor.description,
        inputSchema: zodToJsonSchema(descriptor.inputSchema),
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
    // Import tools directly (eliminates complex discovery logic)
    const pingTool = await import('./ops/ping.js');
    const serverStatusTool = await import('./ops/server-status.js');

    // Register each tool directly with the MCP SDK
    if (pingTool.default) {
      registerTool(pingTool.default);
    }

    if (serverStatusTool.default) {
      registerTool(serverStatusTool.default);
    }

    toolLogger.info({ toolCount: 2 }, 'All tools registered natively with MCP SDK');
  } catch (error) {
    toolLogger.error({ error }, 'Failed to register tools natively');
    throw convertToMcpError(error);
  }
}

/**
 * Simple tool listing for status/debugging
 */
export function getRegisteredTools(): Array<{ name: string; description: string }> {
  return [
    { name: 'ping', description: 'Test MCP server connectivity and health' },
    { name: 'server_status', description: 'Get MCP server status and system information' },
    // Additional tools can be added here as they are migrated
  ];
}
