/**
 * Simple MCP Registry - Direct Maps replacing complex registry patterns
 */

import type { Logger } from 'pino';
import { createLogger } from '../lib/logger.js';
import { Success } from '../types/core';
import {
  createToolRegistry,
  createEnhancedToolRegistry,
} from '../application/tools/intelligent/ai-tool-factory.js';
import { containerizationWorkflow } from '../workflows/containerization.js';
import { deploymentWorkflow } from '../workflows/deployment.js';
import type { MCPTool, MCPWorkflow } from './types.js';

// Simple registries - direct Maps
const toolsRegistry: Map<string, MCPTool> = new Map();
const workflowsRegistry: Map<string, MCPWorkflow> = new Map();

// Tool schemas - simplified metadata
const toolSchemas: Record<string, any> = {
  'analyze-repo': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      repoPath: { type: 'string' },
    },
    required: ['sessionId', 'repoPath'],
  },
  'generate-dockerfile': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      baseImage: { type: 'string' },
    },
    required: ['sessionId'],
  },
  'build-image': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      dockerfilePath: { type: 'string' },
    },
    required: ['sessionId'],
  },
  scan: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      imageId: { type: 'string' },
    },
    required: ['sessionId', 'imageId'],
  },
  workflow: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      workflowType: { type: 'string' },
    },
    required: ['sessionId', 'workflowType'],
  },
  // Sampling tools
  'dockerfile-sampling': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      repoPath: { type: 'string' },
      variantCount: { type: 'number' },
      strategies: { type: 'array', items: { type: 'string' } },
      environment: { type: 'string', enum: ['development', 'staging', 'production'] },
      optimization: { type: 'string', enum: ['size', 'security', 'performance', 'balanced'] },
      criteria: { type: 'object' },
    },
    required: ['sessionId', 'repoPath'],
  },
  'dockerfile-compare': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      dockerfiles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            strategy: { type: 'string' },
          },
          required: ['id', 'content'],
        },
      },
      criteria: { type: 'object' },
    },
    required: ['sessionId', 'dockerfiles'],
  },
  'dockerfile-validate': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      content: { type: 'string' },
      criteria: { type: 'object' },
    },
    required: ['sessionId', 'content'],
  },
  'dockerfile-best': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      repoPath: { type: 'string' },
      environment: { type: 'string', enum: ['development', 'staging', 'production'] },
      optimization: { type: 'string', enum: ['size', 'security', 'performance', 'balanced'] },
    },
    required: ['sessionId', 'repoPath'],
  },
  'sampling-strategies': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
    },
    required: [],
  },
  // Analysis sampling tools
  'analysis-sampling': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      repoPath: { type: 'string' },
      language: { type: 'string' },
      framework: { type: 'string' },
      dependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            type: { type: 'string' },
          },
          required: ['name', 'type'],
        },
      },
      ports: { type: 'array', items: { type: 'number' } },
      depth: { type: 'number' },
      includeTests: { type: 'boolean' },
      securityFocus: { type: 'boolean' },
      performanceFocus: { type: 'boolean' },
      strategies: { type: 'array', items: { type: 'string' } },
      criteria: { type: 'object' },
    },
    required: ['sessionId', 'repoPath', 'language'],
  },
  'analysis-compare': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      variants: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            strategy: { type: 'string' },
            analysis: {
              type: 'object',
              properties: {
                language: { type: 'string' },
                framework: { type: 'string' },
                dependencies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      version: { type: 'string' },
                      type: { type: 'string' },
                    },
                    required: ['name', 'type'],
                  },
                },
                recommendations: { type: 'array', items: { type: 'string' } },
                securityIssues: { type: 'array', items: { type: 'string' } },
                performanceIssues: { type: 'array', items: { type: 'string' } },
              },
              required: ['language', 'dependencies', 'recommendations'],
            },
            metadata: {
              type: 'object',
              properties: {
                confidence: { type: 'number' },
                executionTime: { type: 'number' },
                timestamp: { type: 'string' },
              },
              required: ['confidence', 'executionTime', 'timestamp'],
            },
          },
          required: ['strategy', 'analysis', 'metadata'],
        },
      },
      criteria: { type: 'object' },
    },
    required: ['sessionId', 'variants'],
  },
  'analysis-validate': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      variant: {
        type: 'object',
        properties: {
          strategy: { type: 'string' },
          analysis: {
            type: 'object',
            properties: {
              language: { type: 'string' },
              framework: { type: 'string' },
              dependencies: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    version: { type: 'string' },
                    type: { type: 'string' },
                  },
                  required: ['name', 'type'],
                },
              },
              recommendations: { type: 'array', items: { type: 'string' } },
              securityIssues: { type: 'array', items: { type: 'string' } },
              performanceIssues: { type: 'array', items: { type: 'string' } },
            },
            required: ['language', 'dependencies', 'recommendations'],
          },
          metadata: {
            type: 'object',
            properties: {
              confidence: { type: 'number' },
              executionTime: { type: 'number' },
              timestamp: { type: 'string' },
            },
            required: ['confidence', 'executionTime', 'timestamp'],
          },
        },
        required: ['strategy', 'analysis', 'metadata'],
      },
    },
    required: ['sessionId', 'variant'],
  },
  'analysis-strategies': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      includeDescription: { type: 'boolean' },
    },
    required: ['sessionId'],
  },
  // Analysis perspectives tools
  'enhanced-analysis': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      repoPath: { type: 'string' },
      perspective: {
        type: 'string',
        enum: ['comprehensive', 'security-focused', 'performance-focused'],
      },
      depth: { type: 'number' },
      includeTests: { type: 'boolean' },
      securityFocus: { type: 'boolean' },
      performanceFocus: { type: 'boolean' },
    },
    required: ['sessionId', 'repoPath'],
  },
  'perspectives-list': {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      includeDetails: { type: 'boolean' },
    },
    required: ['sessionId'],
  },
};

/**
 * Initialize tools using simple functional approach
 */
export const initializeTools = (
  logger?: Logger,
  config?: { aiService?: any; sessionManager?: any; promptRegistry?: any },
): void => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });

  // Create tool registry using functional composition
  const baseRegistry = config?.aiService
    ? createEnhancedToolRegistry(log, {
        mcpHostAI: config.aiService,
        promptRegistry: config.promptRegistry,
      })
    : createToolRegistry(log);

  // Clear existing registry
  toolsRegistry.clear();

  // Convert to MCP tools with schemas
  baseRegistry.forEach((tool, name) => {
    const mcpTool: MCPTool = {
      name: tool.name,
      description: `${tool.name} tool`,
      schema: toolSchemas[name] || { type: 'object', properties: {}, required: [] },
      execute: async (
        params: object,
        toolLogger: Logger,
        context?: import('./types.js').MCPContext,
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
