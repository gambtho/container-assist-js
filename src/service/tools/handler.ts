import type { ToolConfig } from './config.js'
import type { ToolContext } from './tool-types.js'
import type { Logger, DependenciesConfig } from '../interfaces.js'

import analyzeRepositoryHandler from './analysis/analyze-repository.js'
import startWorkflowHandler from './orchestration/start-workflow.js'
import listToolsHandler from './utilities/list-tools.js'
import pingHandler from './utilities/ping.js'
import serverStatusHandler from './utilities/server-status.js'
import generateDockerfileHandler from './build/generate-dockerfile.js'
import generateK8sManifestsHandler from './deployment/generate-k8s-manifests.js'

export interface ToolRequest {
  method: string
  arguments?: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  error?: string
  message?: string
  tool?: string
  sessionId?: string
  status?: string
  repoPath?: string
  workflowState?: unknown
  createdAt?: string
  updatedAt?: string
  arguments?: Record<string, unknown>
  stub?: boolean
  nextStep?: {
    tool: string
    reason: string | null
  }
  [key: string]: unknown
}

export class ToolHandler {
  private readonly config: ToolConfig
  private readonly context: ToolContext
  private readonly logger: Logger

  constructor(config: ToolConfig, context: ToolContext) {
    this.config = config
    this.context = context
    this.logger = context.logger.child({ tool: config.name })
  }

  async handle(request: ToolRequest): Promise<ToolResult> {
    const { arguments: args = {} } = request

    this.logger.info({
      tool: this.config.name,
      hasSession: !!args.session_id
    }, 'Handling tool request')

    try {
      // Route to appropriate handler based on tool name
      let result: ToolResult

      switch (this.config.name) {
        // Utility tools
        case 'ping':
          result = await this.executeHandler(pingHandler, args)
          break

        case 'list_tools':
          result = await this.executeHandler(listToolsHandler, args)
          break

        case 'server_status':
          result = await this.executeHandler(serverStatusHandler, args)
          break

        // Workflow tools
        case 'analyze_repository':
          result = await this.executeHandler(analyzeRepositoryHandler, args)
          break

        case 'generate_dockerfile':
          result = await this.executeHandler(generateDockerfileHandler, args)
          break

        case 'generate_k8s_manifests':
          result = await this.executeHandler(generateK8sManifestsHandler, args)
          break

        case 'start_workflow':
          result = await this.executeHandler(startWorkflowHandler, args)
          break

        case 'workflow_status':
          result = await this.getWorkflowStatus(args)
          break

        // Stub implementations for other tools
        default:
          result = await this.stubImplementation(args)
      }

      // Add chain hint if configured
      if (this.config.nextTool && result.success !== false) {
        result.nextStep = {
          tool: this.config.nextTool,
          reason: this.config.chainReason
        }
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      this.logger.error({
        error: errorMessage,
        stack: errorStack
      }, 'Tool execution failed')

      return {
        success: false,
        error: errorMessage,
        tool: this.config.name
      }
    }
  }

  private async executeHandler(handler: any, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Parse input using handler's schema
      const input = handler.inputSchema.parse(args)
      
      // Execute the handler
      const result = await handler.execute(input, this.context)
      
      // Convert Result<T> to ToolResult format
      if (result.success) {
        return {
          success: true,
          tool: this.config.name,
          arguments: args,
          data: result.value,
          message: `Tool ${this.config.name} executed successfully`
        }
      } else {
        return {
          success: false,
          tool: this.config.name,
          arguments: args,
          error: result.error?.message || 'Tool execution failed'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        tool: this.config.name,
        arguments: args,
        error: `Input validation failed: ${errorMessage}`
      }
    }
  }

  private async getWorkflowStatus(args: Record<string, unknown>): Promise<ToolResult> {
    const { session_id } = args

    if (!session_id || typeof session_id !== 'string') {
      throw new Error('session_id is required')
    }

    const session = await this.context.sessionService.get(session_id)

    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      }
    }

    return {
      success: true,
      sessionId: session_id,
      status: session.status,
      repoPath: session.repoPath,
      workflowState: session.workflow_state,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }
  }

  private async stubImplementation(args: Record<string, unknown>): Promise<ToolResult> {
    // Stub implementation for tools without handlers
    this.logger.warn({ tool: this.config.name }, 'Using stub implementation')

    return {
      success: true,
      message: `Tool ${this.config.name} executed (stub implementation)`,
      tool: this.config.name,
      arguments: args,
      stub: true
    }
  }
}

