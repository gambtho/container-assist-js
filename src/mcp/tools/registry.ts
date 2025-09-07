/**
 * SDK-Native Tool Registry - Aligned with MCP SDK patterns
 */

import type { Logger } from 'pino';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '../../core/types';
import { AIAugmentationService } from '../../lib/ai/ai-service';
import type { MCPHostAI } from '../../lib/mcp-host-ai';
import type { SDKPromptRegistry } from '../prompts/sdk-prompt-registry';
import { createProductionTool } from './capabilities';

// Import base tools
import { analyzeRepoTool } from '../../tools/analyze-repo';
import { generateDockerfileTool } from '../../tools/generate-dockerfile';
import { buildImageTool } from '../../tools/build-image';
import { scanImageTool } from '../../tools/scan';
import { pushImageTool } from '../../tools/push';
import { tagImageTool } from '../../tools/tag';
import { workflowTool } from '../../tools/workflow';
import { fixDockerfileTool } from '../../tools/fix-dockerfile';
import { resolveBaseImagesTool } from '../../tools/resolve-base-images';
import { prepareClusterTool } from '../../tools/prepare-cluster';
import { opsTool } from '../../tools/ops';
import { deployApplicationTool } from '../../tools/deploy';
import { generateK8sManifestsTool } from '../../tools/generate-k8s-manifests';
import { verifyDeploymentTool } from '../../tools/verify-deployment';

// Sampling tools are now internal services - not imported here

/**
 * SDK-native tool registry with proper MCP integration
 */
export interface SDKToolRegistry {
  tools: Map<string, Tool>;
  server: Server;
  registerTool(tool: Tool): void;
  getTool(name: string): Tool | undefined;
  getAllTools(): Tool[];
  getToolSchemas(): Array<{ name: string; description: string; inputSchema?: any }>;
  setupServerHandlers(server: Server): void;
}

/**
 * Backward compatibility type
 */
export type ToolRegistry = Map<string, Tool>;

/**
 * Create SDK-native tool registry with proper MCP integration
 */
export const createSDKToolRegistry = (logger: Logger, server: Server): SDKToolRegistry => {
  const tools = new Map<string, Tool>();

  const registry: SDKToolRegistry = {
    tools,
    server,

    registerTool(tool: Tool): void {
      tools.set(tool.name, tool);
      logger.debug({ tool: tool.name }, 'Tool registered in SDK registry');
    },

    getTool(name: string): Tool | undefined {
      return tools.get(name);
    },

    getAllTools(): Tool[] {
      return Array.from(tools.values());
    },

    getToolSchemas(): Array<{ name: string; description: string; inputSchema?: any }> {
      return Array.from(tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description ?? `${tool.name} tool`,
        inputSchema: tool.schema,
      }));
    },

    setupServerHandlers(server: Server): void {
      // SDK-native tool listing handler
      server.setRequestHandler(ListToolsRequestSchema, async () => {
        logger.debug('SDK registry handling tools/list request');
        const toolSchemas = registry.getToolSchemas();
        logger.info({ count: toolSchemas.length }, 'SDK registry returning tool list');
        return { tools: toolSchemas };
      });

      // SDK-native tool execution handler
      server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
        const { name, arguments: args } = request.params;
        logger.info({ tool: name }, 'SDK registry executing tool');

        const tool = registry.getTool(name);
        if (!tool) {
          logger.error({ tool: name }, 'Tool not found in SDK registry');
          throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }

        try {
          const result = await tool.execute(args ?? {}, logger);

          // Handle Result<T> pattern
          if (result && typeof result === 'object' && 'ok' in result) {
            if (result.ok) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(result.value, null, 2),
                  },
                ],
              };
            } else {
              throw new McpError(ErrorCode.InternalError, result.error);
            }
          }

          // Handle other response formats
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error({ tool: name, error }, 'SDK registry tool execution failed');

          // Re-throw MCP errors as-is
          if (error instanceof McpError) {
            throw error;
          }

          // Convert other errors to MCP errors
          throw new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : 'Unknown error occurred',
            { tool: name },
          );
        }
      });

      registry.server = server;
      logger.info('SDK registry handlers configured');
    },
  };

  return registry;
};

/**
 * Create AI-powered tools using standardized pipeline (backward compatibility)
 */
export const createToolRegistry = (
  logger: Logger,
  config: {
    enableAI?: boolean;
    enableMetrics?: boolean;
    aiAugmentationService?: AIAugmentationService;
    metricsCollector?: any;
    sessionManager?: any;
  } = {},
): ToolRegistry => {
  // Only expose 14 core tools - sampling tools are internal services
  const baseTools = [
    analyzeRepoTool,
    generateDockerfileTool,
    buildImageTool,
    scanImageTool,
    pushImageTool,
    tagImageTool,
    workflowTool,
    fixDockerfileTool,
    resolveBaseImagesTool,
    prepareClusterTool,
    opsTool,
    deployApplicationTool,
    generateK8sManifestsTool,
    verifyDeploymentTool,
  ];

  // Sampling tools are now internal services, not exposed via MCP
  const allTools = baseTools;

  const registry = new Map<string, Tool>();

  allTools.forEach((rawTool) => {
    // Create wrapper that matches Tool interface
    const baseTool: any = {
      name: rawTool.name,
      description: (rawTool as any).description || `${rawTool.name} tool`,
      execute: async (params: Record<string, unknown>, logger: Logger) => {
        return await rawTool.execute(params as any, logger);
      },
    };

    // Use standardized production tool enhancement
    const enhancementConfig: Parameters<typeof createProductionTool>[1] = {
      logger,
      retry: { attempts: 3, delay: 1000, backoff: true },
    };

    if (config.aiAugmentationService !== undefined) {
      enhancementConfig.aiAugmentationService = config.aiAugmentationService;
    }
    if (config.metricsCollector !== undefined) {
      enhancementConfig.metricsCollector = config.metricsCollector;
    }
    if (config.sessionManager !== undefined) {
      enhancementConfig.sessionManager = config.sessionManager;
    }

    const aiTool = createProductionTool(baseTool, enhancementConfig);

    registry.set(baseTool.name, aiTool);
  });

  return registry;
};

/**
 * Get tool from registry
 */
export const getTool = (registry: ToolRegistry, name: string): Tool | undefined => {
  return registry.get(name);
};

/**
 * Get all tools from registry
 */
export const getAllTools = (registry: ToolRegistry): Tool[] => {
  return Array.from(registry.values());
};

/**
 * AI enhancement functions using centralized AI Enhancement Service
 */
export const withAI =
  (aiAugmentationService: AIAugmentationService) =>
  <T extends Tool>(tool: T): T => ({
    ...tool,
    async execute(params: any, logger: Logger, context?: import('../core/types.js').MCPContext) {
      const result = await tool.execute(params, logger, context);

      // Add AI insights if available and requested
      if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        result.ok &&
        params.enableAI !== false &&
        aiAugmentationService.isAvailable()
      ) {
        try {
          const enhancementResult = await aiAugmentationService.augmentTool(
            tool.name,
            result.value,
            {
              metadata: params.context || {},
              requirements: {
                securityLevel: params.securityLevel,
                optimization: params.optimization,
                environment: params.environment,
              },
            },
          );

          if (enhancementResult.ok && enhancementResult.value.augmented) {
            const aiResult = enhancementResult.value;
            const resultValue = result.value;

            return {
              ...result,
              value: {
                ...(typeof resultValue === 'object' ? resultValue : {}),
                aiInsights: aiResult.insights,
                aiRecommendations: aiResult.recommendations,
                metadata: {
                  ...(resultValue?.metadata || {}),
                  aiEnhanced: true,
                  aiProvider: aiResult.metadata.aiProvider,
                  augmentationType: aiResult.metadata.augmentationType,
                  processingTime: aiResult.metadata.processingTime,
                },
              },
            };
          }
        } catch (error) {
          logger.warn({ tool: tool.name, error }, 'AI enhancement request failed');
        }
      }

      return result;
    },
  });

/**
 * Create AI-powered tool registry with intelligent capabilities
 */
export const createAIToolRegistry = (
  logger: Logger,
  config: {
    mcpHostAI?: MCPHostAI;
    promptRegistry?: SDKPromptRegistry;
    enableMetrics?: boolean;
    metricsCollector?: any;
    sessionManager?: any;
  } = {},
): ToolRegistry => {
  // Create AI enhancement service if available
  const aiAugmentationService =
    config.mcpHostAI && config.promptRegistry
      ? new AIAugmentationService(config.mcpHostAI, config.promptRegistry, logger)
      : undefined;

  // Create registry with all enhancements applied consistently
  return createToolRegistry(logger, {
    enableAI: !!aiAugmentationService,
    enableMetrics: config.enableMetrics ?? false,
    ...(aiAugmentationService ? { aiAugmentationService } : {}),
    metricsCollector: config.metricsCollector,
    sessionManager: config.sessionManager,
  });
};

/**
 * Create tool registry with SDK integration
 * Now uses SDK patterns by default when server is provided
 */
export const createMCPToolRegistry = (
  logger: Logger,
  server: Server,
  config: {
    enableAI?: boolean;
    enableMetrics?: boolean;
    aiAugmentationService?: AIAugmentationService;
    metricsCollector?: any;
    sessionManager?: any;
  } = {},
): SDKToolRegistry => {
  const sdkRegistry = createSDKToolRegistry(logger, server);

  // Populate with all tools using the legacy tool creation logic
  const legacyTools = createToolRegistry(logger, config);
  legacyTools.forEach((tool) => {
    sdkRegistry.registerTool(tool);
  });

  // Setup server handlers for SDK-native request handling
  sdkRegistry.setupServerHandlers(server);

  return sdkRegistry;
};

/**
 * Get registry stats
 */
export const getRegistryStats = (
  registry: ToolRegistry | SDKToolRegistry,
): {
  totalTools: number;
  tools: string[];
} => {
  if ('tools' in registry && registry.tools instanceof Map) {
    // SDK registry
    return {
      totalTools: registry.tools.size,
      tools: Array.from(registry.tools.keys()),
    };
  } else {
    // Base registry (Map)
    const map = registry as Map<string, Tool>;
    return {
      totalTools: map.size,
      tools: Array.from(map.keys()),
    };
  }
};
