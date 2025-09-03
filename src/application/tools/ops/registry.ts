import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { MCPTool, MCPToolContext } from '../tool-types';
import { ServerCapabilitiesSchema } from '@modelcontextprotocol/sdk/types.js';
import { Services } from '../../../services';

export enum ToolName {
  ANALYZE_REPOSITORY = 'analyze-repository',
  RESOLVE_BASE_IMAGES = 'resolve-base-images',
  GENERATE_DOCKERFILE = 'generate-dockerfile',
  GENERATE_DOCKERFILE_EXT = 'generate-dockerfile-ext',
  FIX_DOCKERFILE = 'fix-dockerfile',
  BUILD_IMAGE = 'build-image',
  SCAN_IMAGE = 'scan-image',
  TAG_IMAGE = 'tag-image',
  PUSH_IMAGE = 'push-image',
  GENERATE_K8S_MANIFESTS = 'generate-k8s-manifests',
  PREPARE_CLUSTER = 'prepare-cluster',
  DEPLOY_APPLICATION = 'deploy-application',
  VERIFY_DEPLOYMENT = 'verify-deployment',
  START_WORKFLOW = 'start-workflow',
  WORKFLOW_STATUS = 'workflow-status',
  PING = 'ping',
  LIST_TOOLS = 'list-tools',
  SERVER_STATUS = 'server-status'
}

// Available tools - modify this array to control which tools are registered
const AVAILABLE_TOOLS = [
  ToolName.PING,
  ToolName.SERVER_STATUS,
  ToolName.ANALYZE_REPOSITORY,
  ToolName.RESOLVE_BASE_IMAGES,
  ToolName.GENERATE_DOCKERFILE,
  ToolName.FIX_DOCKERFILE,
  ToolName.BUILD_IMAGE,
  ToolName.SCAN_IMAGE,
  ToolName.TAG_IMAGE,
  ToolName.PUSH_IMAGE,
  ToolName.GENERATE_K8S_MANIFESTS,
  ToolName.PREPARE_CLUSTER,
  ToolName.DEPLOY_APPLICATION,
  ToolName.VERIFY_DEPLOYMENT,
  ToolName.START_WORKFLOW,
  ToolName.WORKFLOW_STATUS,
  ToolName.LIST_TOOLS
];

export class ToolRegistry {
  private tools = new Map<string, MCPTool>();

  constructor(
    private readonly services: Services,
    private readonly context: MCPToolContext,
    private readonly logger: Logger,
    private server: McpServer
  ) {
    this.logger = logger.child({ component: 'ToolRegistry' });
  }

  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    this.server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema.shape
      },
      async (input: Record<string, unknown>) => {
        const startTime = Date.now();
        const toolLogger = this.logger.child({ tool: tool.name });

        try {
          toolLogger.info({ input }, 'Tool execution started');

          const validatedInput = tool.inputSchema.parse(input);

          const result = await tool.handler(validatedInput, this.services, this.context);

          const duration = Date.now() - startTime;
          toolLogger.info({ duration, success: true }, 'Tool execution completed');

          const responseText = `✅ **${tool.name} completed** (${duration}ms)\n${JSON.stringify(result, null, 2)}`;

          return {
            content: [
              {
                type: 'text' as const,
                text: responseText
              }
            ]
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          toolLogger.error({ error, duration }, 'Tool execution failed');

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            content: [
              {
                type: 'text' as const,
                text: `❌ **${tool.name} failed** (${duration}ms): ${errorMessage}`
              }
            ]
          };
        }
      }
    );

    this.logger.info({ tool: tool.name }, 'Tool registered');
  }

  async registerAll(): Promise<void> {
    let registered = 0;

    for (const toolName of AVAILABLE_TOOLS) {
      try {
        const module = await import(`./${toolName}/${toolName}.js`);
        const tool = module.default as MCPTool;

        if (tool) {
          this.register(tool);
          registered++;
        } else {
          this.logger.warn({ tool: toolName }, 'Invalid tool - no execute function found');
        }
      } catch (error) {
        this.logger.warn(
          {
            tool: toolName,
            error: error instanceof Error ? error.message : String(error)
          },
          'Failed to load tool'
        );
      }
    }

    this.logger.info(
      {
        registered,
        total: AVAILABLE_TOOLS.length,
        tools: Array.from(this.tools.keys())
      },
      'Tool registration completed'
    );
  }
}
