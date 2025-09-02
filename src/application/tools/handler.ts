/**
 * Handler - MCP SDK Compatible Version
 */

import type { ToolConfig } from './config';
import type { MCPToolContext } from './tool-types';
import type { Logger } from '../interfaces';

// Analysis tools
import analyzeRepositoryHandler from './analysis/analyze-repository';

// Build tools
import generateDockerfileHandler from './build/generate-dockerfile';
import { fixDockerfileHandler } from './build/fix-dockerfile';
import buildImageHandler from './build/build-image';
import scanImageHandler from './build/scan-image';
import tagImageHandler from './build/tag-image';
import pushImageHandler from './build/push-image';
import resolveBaseImagesHandler from './build/resolve-base-images';

// Deploy tools
import generateK8sManifestsHandler from './deploy/generate-k8s-manifests';
import prepareClusterHandler from './deploy/prepare-cluster';
import deployApplicationHandler from './deploy/deploy-application';
import verifyDeploymentHandler from './deploy/verify-deployment';

// Ops tools
import listToolsHandler from './ops/list-tools';
import pingHandler from './ops/ping';
import serverStatusHandler from './ops/server-status';

// Workflow tools
import startWorkflowHandler from './workflow/start-workflow';
import workflowStatusHandler from './workflow/workflow-status';

export interface ToolRequest {
  method: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  error?: string;
  message?: string;
  tool?: string;
  sessionId?: string;
  status?: string;
  repoPath?: string;
  workflowState?: unknown;
  createdAt?: string;
  updatedAt?: string;
  arguments?: Record<string, unknown>;
  stub?: boolean;
  nextStep?: {
    tool: string;
    reason: string | null;
  };
  [key: string]: unknown;
}

export class ToolHandler {
  private readonly config: ToolConfig;
  private readonly context: MCPToolContext;
  private readonly logger: Logger;

  constructor(config: ToolConfig, context: MCPToolContext) {
    this.config = config;
    this.context = context;
    this.logger = context.logger.child({ tool: config.name });
  }

  async handle(request: ToolRequest): Promise<ToolResult> {
    const { arguments: args = {} } = request;

    this.logger.info(
      {
        tool: this.config.name,
        hasSession: !!args.session_id
      },
      'Handling tool request'
    );

    try {
      // Route to appropriate handler based on tool name
      let result: ToolResult;

      switch (this.config.name) {
        // Utility tools
        case 'ping':
          result = await this.executeHandler(pingHandler, args);
          break;

        case 'list_tools':
          result = await this.executeHandler(listToolsHandler, args);
          break;

        case 'server_status':
          result = await this.executeHandler(serverStatusHandler, args);
          break;

        // Workflow tools
        case 'analyze_repository':
          result = await this.executeHandler(analyzeRepositoryHandler, args);
          break;

        case 'generate_dockerfile':
          result = await this.executeHandler(generateDockerfileHandler, args);
          break;

        case 'generate_k8s_manifests':
          result = await this.executeHandler(generateK8sManifestsHandler, args);
          break;

        // Build tools
        case 'build_image':
          result = await this.executeHandler(buildImageHandler, args);
          break;

        case 'scan_image':
          result = await this.executeHandler(scanImageHandler, args);
          break;

        case 'tag_image':
          result = await this.executeHandler(tagImageHandler, args);
          break;

        case 'push_image':
          result = await this.executeHandler(pushImageHandler, args);
          break;

        // Deployment tools
        case 'deploy_application':
          result = await this.executeHandler(deployApplicationHandler, args);
          break;

        case 'verify_deployment':
          result = await this.executeHandler(verifyDeploymentHandler, args);
          break;

        case 'prepare_cluster':
          result = await this.executeHandler(prepareClusterHandler, args);
          break;

        // Workflow tools
        case 'start_workflow':
          result = await this.executeHandler(startWorkflowHandler, args);
          break;

        case 'workflow_status':
          result = await this.executeHandler(workflowStatusHandler, args);
          break;

        // Additional tools
        case 'resolve_base_images':
          result = await this.executeHandler(resolveBaseImagesHandler, args);
          break;

        case 'fix_dockerfile':
          result = await this.executeHandler(fixDockerfileHandler, args);
          break;

        case 'generate_dockerfile_ext':
          result = await this.executeHandler(generateDockerfileExtHandler, args);
          break;

        // Stub implementations for other tools
        default:
          result = await this.stubImplementation(args);
      }

      // Add chain hint if configured
      if (this.config.nextTool && result.success !== false) {
        result.nextStep = {
          tool: this.config.nextTool,
          reason: this.config.chainReason
        };
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        {
          error: errorMessage,
          stack: errorStack
        },
        'Tool execution failed'
      );

      return {
        success: false,
        error: errorMessage,
        tool: this.config.name
      };
    }
  }

  private async executeHandler(handler: unknown, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Parse input using handler's schema'
      const input = handler.inputSchema.parse(args);

      // Execute the handler
      const result = await handler.handler(input, this.context);

      if (result.success && result.success.length > 0) {
        return {
          success: true,
          tool: this.config.name,
          arguments: args,
          data: result.data,
          message: `Tool ${this.config.name} executed successfully`
        };
      } else {
        return {
          success: false,
          tool: this.config.name,
          arguments: args,
          error: result.error?.message ?? 'Tool execution failed'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        tool: this.config.name,
        arguments: args,
        error: `Input validation failed: ${errorMessage}`
      };
    }
  }

  private async stubImplementation(args: Record<string, unknown>): Promise<ToolResult> {
    // Stub implementation for tools without handlers
    this.logger.warn({ tool: this.config.name }, 'Using stub implementation');

    return {
      success: true,
      message: `Tool ${this.config.name} executed (stub implementation)`,
      tool: this.config.name,
      arguments: args,
      stub: true
    };
  }
}
