/**
 * MCP Registry with Zod Schema Integration
 *
 * Uses SDK-native patterns for tool and workflow registration
 */

import type { Logger } from 'pino';
import { createLogger } from '../../lib/logger';
import { Success } from '../../core/types';
import { createToolRegistry, createAIToolRegistry, createMCPToolRegistry } from '../tools/registry';
import { containerizationWorkflow } from '../../workflows/containerization';
import { deploymentWorkflow } from '../../workflows/deployment';
import { toolSchemas } from '../core/schemas';
import type { MCPTool, MCPWorkflow } from '../core/types';

// Simple registries - direct Maps
const toolsRegistry: Map<string, MCPTool> = new Map();
const workflowsRegistry: Map<string, MCPWorkflow> = new Map();

// Map tool names to their Zod schemas
const getToolSchema = (name: string): any => {
  // Use Zod schemas from the centralized schema file
  const schema = toolSchemas[name as keyof typeof toolSchemas];
  if (schema) {
    // Convert Zod schema to JSON Schema for SDK compatibility
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(schema.shape).map(([key, value]: [string, any]) => [
          key,
          { type: getZodType(value), description: value.description },
        ]),
      ),
      required: Object.keys(schema.shape).filter((key: string) => {
        const field = (schema.shape as any)[key];
        return field && !field.isOptional();
      }),
    };
  }

  // Fallback for tools without schemas yet
  return { type: 'object', properties: {}, required: [] };
};

// Helper to get JSON Schema type from Zod type
const getZodType = (zodType: any): string => {
  if (zodType._def?.typeName === 'ZodString') return 'string';
  if (zodType._def?.typeName === 'ZodNumber') return 'number';
  if (zodType._def?.typeName === 'ZodBoolean') return 'boolean';
  if (zodType._def?.typeName === 'ZodArray') return 'array';
  if (zodType._def?.typeName === 'ZodObject') return 'object';
  if (zodType._def?.typeName === 'ZodEnum') return 'string';
  if (zodType._def?.typeName === 'ZodOptional') return getZodType(zodType._def.innerType);
  return 'string';
};

/**
 * Initialize tools with MCP Server integration
 * Uses SDK patterns by default when server is provided
 */
export const initializeToolsWithMCP = (
  logger: Logger,
  server: any,
  config?: {
    aiService?: any;
    sessionManager?: any;
    promptRegistry?: any;
  },
): void => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });

  // Create SDK-native tool registry
  const sdkRegistry = createMCPToolRegistry(log, server, {
    aiAugmentationService: config?.aiService,
    sessionManager: config?.sessionManager,
  });

  // Clear existing registry
  toolsRegistry.clear();

  // Convert SDK tools to MCP tools for backward compatibility
  sdkRegistry.getAllTools().forEach((tool) => {
    const mcpTool: MCPTool = {
      name: tool.name,
      description: tool.description ?? `${tool.name} tool`,
      schema: getToolSchema(tool.name),
      execute: async (params: object, logger: Logger, context?: any) => {
        return tool.execute(params as Record<string, unknown>, logger, context);
      },
    };
    toolsRegistry.set(tool.name, mcpTool);
  });

  log.info({ count: toolsRegistry.size }, 'MCP tools initialized with SDK patterns');
};

export const initializeTools = (
  logger?: Logger,
  config?: { aiService?: any; sessionManager?: any; promptRegistry?: any },
): void => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });

  // Create tool registry using functional composition
  const baseRegistry = config?.aiService
    ? createAIToolRegistry(log, {
        mcpHostAI: config.aiService,
        promptRegistry: config.promptRegistry,
      })
    : createToolRegistry(log);

  // Clear existing registry
  toolsRegistry.clear();

  // Convert to MCP tools with Zod schemas
  baseRegistry.forEach((tool: any, name: string) => {
    const mcpTool: MCPTool = {
      name: tool.name,
      description: tool.description || `${tool.name} tool`,
      schema: getToolSchema(name),
      execute: async (
        params: object,
        toolLogger: Logger,
        context?: import('../core/types.js').MCPContext,
      ) => {
        // Pass context to tools that support it (like sampling tools)
        const result = await tool.execute(
          params as Record<string, unknown>,
          toolLogger || log.child({ component: 'tool' }),
          context,
        );
        // Ensure result is wrapped in Result type if it's not already
        if (result && typeof result === 'object' && 'ok' in result) {
          return result;
        }
        return Success(result);
      },
    };

    toolsRegistry.set(name, mcpTool);
  });

  log.info({ count: toolsRegistry.size }, 'Tools initialized');
};

/**
 * Initialize workflows - simple direct registration
 */
export const initializeWorkflows = (logger?: Logger): void => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });

  workflowsRegistry.clear();

  const workflows = [
    {
      name: 'containerization',
      description: 'Complete containerization workflow',
      workflow: containerizationWorkflow,
    },
    {
      name: 'deployment',
      description: 'Application deployment workflow',
      workflow: deploymentWorkflow,
    },
  ];

  workflows.forEach(({ name, description, workflow }) => {
    workflowsRegistry.set(name, {
      name,
      description,
      execute: async (params: object, logger?: Logger) => {
        return await workflow.execute(params as any, logger);
      },
      schema: workflow.schema,
    });
  });

  log.info({ count: workflowsRegistry.size }, 'Workflows initialized');
};

/**
 * Get a tool by name from the registry
 * @param name - The tool name to retrieve
 * @returns The MCP tool instance or undefined if not found
 */
export const getTool = (name: string): MCPTool | undefined => toolsRegistry.get(name);

/**
 * Get all registered tools
 * @returns Array of all MCP tool instances
 */
export const getAllTools = (): MCPTool[] => Array.from(toolsRegistry.values());

/**
 * Get a workflow by name from the registry
 * @param name - The workflow name to retrieve
 * @returns The MCP workflow instance or undefined if not found
 */
export const getWorkflow = (name: string): MCPWorkflow | undefined => workflowsRegistry.get(name);

/**
 * Get all registered workflows
 * @returns Array of all MCP workflow instances
 */
export const getAllWorkflows = (): MCPWorkflow[] => Array.from(workflowsRegistry.values());

/**
 * Get statistics about the current registry state
 * @returns Object containing tool and workflow counts and names
 */
export const getRegistryStats = (): {
  tools: number;
  workflows: number;
  toolNames: string[];
  workflowNames: string[];
} => ({
  tools: toolsRegistry.size,
  workflows: workflowsRegistry.size,
  toolNames: Array.from(toolsRegistry.keys()),
  workflowNames: Array.from(workflowsRegistry.keys()),
});

// Simple initialization tracking
let initialized = false;

/**
 * Ensure the registry is initialized with tools and workflows
 * @param logger - Optional logger instance
 * @param config - Optional configuration with AI service and session manager
 */
export const ensureInitialized = (
  logger?: Logger,
  config?: { aiService?: any; sessionManager?: any; promptRegistry?: any },
): void => {
  if (!initialized) {
    initializeTools(logger, config);
    initializeWorkflows(logger);
    initialized = true;
  }
};
