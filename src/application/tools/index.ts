/**
 * Simple Tools Collection - Replaces ToolFactory Pattern
 * Direct tool imports without factory overhead
 */

import type { MCPToolDescriptor, MCPToolContext } from './tool-types.js';
import type { CoreServices } from '../services/interfaces.js';

// Import all tools directly
import analyzeRepositoryHandler from './analyze-repo/handler.js';
import buildImageHandler from './build-image/build-image.js';
import pushImageHandler from './push-image/push-image.js';
import scanImageHandler from './scan-image/scan-image.js';
import tagImageHandler from './tag-image/tag-image.js';
import prepareClusterHandler from './prepare-cluster/prepare-cluster.js';
import verifyDeploymentHandler from './verify-deployment/verify-deployment.js';
import startWorkflowHandler from './workflow/start-workflow.js';

// Import operational tools
import { pingTool } from './ops/ping.js';
import { listToolsTool } from './ops/list-tools.js';
import { serverStatusTool } from './ops/server-status.js';

/**
 * All available tools in a simple array
 * No factory pattern, no complex instantiation
 */
export const ALL_TOOLS: MCPToolDescriptor[] = [
  // Analysis Tools
  analyzeRepositoryHandler,
  
  // Docker Tools  
  buildImageHandler,
  scanImageHandler,
  tagImageHandler,
  pushImageHandler,
  
  // Kubernetes Tools
  prepareClusterHandler,
  verifyDeploymentHandler,
  
  // Workflow Tools
  startWorkflowHandler,
  
  // Operational Tools
  pingTool,
  listToolsTool,
  serverStatusTool
];

/**
 * Tool names for backwards compatibility
 */
export const AVAILABLE_TOOLS = ALL_TOOLS.map(tool => tool.name);

/**
 * Simple tool lookup by name
 */
export function getToolByName(name: string): MCPToolDescriptor | undefined {
  return ALL_TOOLS.find(tool => tool.name === name);
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): MCPToolDescriptor[] {
  return ALL_TOOLS.filter(tool => tool.category === category);
}

/**
 * Create tool context - simplified version of what ToolFactory used to do
 */
export function createToolContext(services: CoreServices): MCPToolContext {
  return {
    server: null, // Will be set by the server
    logger: services.logger,
    sessionService: services.session,
    dockerService: services.docker,
    kubernetesService: services.kubernetes,
    aiService: services.ai,
    progressEmitter: services.progress,
    eventPublisher: services.events,
    
    // Simplified workflow management
    workflowOrchestrator: {} as any, // Placeholder
    workflowManager: {} as any, // Placeholder
    
    // Basic config
    config: {
      session: { store: 'memory', ttl: 3600, maxSessions: 100 },
      server: { nodeEnv: 'development', logLevel: 'info', port: 3000, host: 'localhost' },
      mcp: {
        storePath: './data/sessions.db',
        sessionTTL: '24h',
        maxSessions: 100,
        enableMetrics: false,
        enableEvents: true
      },
      workspace: { workspaceDir: process.cwd(), tempDir: './tmp', cleanupOnExit: true },
      infrastructure: {
        docker: {
          socketPath: '/var/run/docker.sock',
          registry: 'docker.io',
          host: 'localhost',
          port: 2376,
          timeout: 300000,
          apiVersion: '1.41'
        },
        kubernetes: {
          kubeconfig: '',
          namespace: 'default',
          timeout: 300000
        },
        ai: {
          apiKey: '',
          model: 'claude-3-sonnet-20241022',
          baseUrl: '',
          timeout: 30000,
          retryAttempts: 3,
          retryDelayMs: 1000,
          temperature: 0.1,
          maxTokens: 4096
        }
      }
    }
  };
}

/**
 * Legacy compatibility - what the old ToolFactory.createTool() did
 */
export function createTool(name: string, services: CoreServices): any {
  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(`Tool '${name}' not found`);
  }

  // Return an object that mimics the old tool interface
  return {
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    chainHint: tool.chainHint,
    
    async handle(request: { method: string; arguments?: Record<string, unknown> }) {
      const context = createToolContext(services);
      const result = await tool.handler(request.arguments || {}, context);
      
      return {
        success: true,
        tool: tool.name,
        message: `Tool ${tool.name} executed successfully`,
        arguments: request.arguments,
        data: result
      };
    }
  };
}
