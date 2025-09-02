/**
 * Tool Registry for MCP Server
 * Manages registration and execution of all MCP tools
 */

import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Logger } from '../../domain/types/index.js'
import { ServiceError, ErrorCode } from '../../domain/types/errors.js'
import { Dependencies } from '../dependencies.js'
import type { ToolHandler, ToolContext as HandlerContext, ToolDescriptor } from './tool-types.js'

// Re-export types for compatibility
export type { ToolHandler, ToolDescriptor }
export type ToolContext = HandlerContext

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>()
  private toolList: Array<{ name: string; description?: string; inputSchema?: unknown }> = []

  constructor(
    private readonly deps: Dependencies,
    private readonly logger: Logger
  ) {
    this.logger = logger.child({ component: 'ToolRegistry' })
  }

  /**
   * Register a tool with the registry
   */
  register<TInput, TOutput>(descriptor: ToolDescriptor<TInput, TOutput>): void {
    try {
      // Validate schemas can produce JSON Schema
      const inputJson = zodToJsonSchema(descriptor.inputSchema)
      // Validate output schema can also be converted (but we don't need to store it)
      zodToJsonSchema(descriptor.outputSchema)

      // Store the tool
      this.tools.set(descriptor.name, descriptor)

      // Add to tool list for MCP
      this.toolList.push({
        name: descriptor.name,
        description: descriptor.description,
        inputSchema: inputJson
      })

      this.logger.info({
        tool: descriptor.name,
        category: descriptor.category,
        hasChainHint: !!descriptor.chainHint
      }, 'Tool registered')

    } catch (error) {
      this.logger.error({ error, tool: descriptor.name }, 'Failed to register tool')
      throw new ServiceError(
        ErrorCode.ToolNotFound,
        `Failed to register tool ${descriptor.name}`,
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Handle MCP tool call request
   */
  async handleToolCall(request: any): Promise<any> {
    const { name, arguments: args } = request

    const tool = this.tools.get(name)
    if (!tool) {
      this.logger.warn({ tool: name }, 'Tool not found')
      return {
        content: [{
          type: 'text',
          text: `Tool ${name} not found`
        }],
        isError: true
      }
    }

    // Create base context
    const baseContext = this.createToolContext()

    try {
      // Validate input
      const validated = tool.inputSchema.parse(args)

      // Execute with timeout
      const timeout = tool.timeout || 30000
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const result = await tool.execute(validated, {
          ...baseContext,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (result.success && result.data) {
          // Validate output
          const validatedOutput = tool.outputSchema.parse(result.data)

          // Return MCP response
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(validatedOutput, null, 2)
            }]
          }
        } else {
          return {
            content: [{
              type: 'text',
              text: `Error: ${result.error?.message || 'Unknown error'}`
            }],
            isError: true
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }

    } catch (error) {
      this.logger.error({ error, tool: name }, 'Tool execution error')

      if (error instanceof z.ZodError) {
        return {
          content: [{
            type: 'text',
            text: `Validation error: ${error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          }],
          isError: true
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      }
    }
  }

  /**
   * Handle MCP list tools request
   */
  async listTools(): Promise<{ tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }> {
    return { tools: this.toolList }
  }

  /**
   * Handle MCP sampling request (for AI operations)
   */
  async handleSamplingRequest(request: any): Promise<any> {
    if (!this.deps.mcpSampler) {
      return {
        content: [{
          type: 'text',
          text: 'AI sampling not available'
        }],
        isError: true
      }
    }

    try {
      const result = await this.deps.mcpSampler.sample(request)
      if (!result.success) {
        throw new Error(result.error?.message || 'Sampling failed')
      }
      return {
        content: [{
          type: 'text',
          text: result.data
        }]
      }
    } catch (error) {
      this.logger.error({ error }, 'Sampling error');
      return {
        content: [{
          type: 'text',
          text: `Sampling error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      }
    }
  }

  /**
   * Register all tool handlers from new directory structure
   */
  async registerAll(): Promise<void> {
    try {
      // Category-based loading from organized directory structure
      const categoryModules = {
        analysis: ['analyze-repository', 'resolve-base-images'],
        build: ['generate-dockerfile', 'generate-dockerfile-ext', 'fix-dockerfile', 'build-image', 'scan-image'],
        registry: ['tag-image', 'push-image'],
        deployment: ['generate-k8s-manifests', 'prepare-cluster', 'deploy-application', 'verify-deployment'],
        orchestration: ['start-workflow', 'workflow-status'],
        utilities: ['ping', 'list-tools', 'server-status']
      }

      for (const [category, modules] of Object.entries(categoryModules)) {
        for (const moduleName of modules) {
          try {
            const module = await import(`./${category}/${moduleName}.js`)
            if (module.default) {
              this.register(module.default)
              this.logger.debug({ category, module: moduleName }, 'Tool loaded');
            } else {
              this.logger.warn({ category, module: moduleName }, 'No default export');
            }
          } catch (error) {
            this.logger.error({
              module: moduleName,
              category,
              error: error instanceof Error ? error.message : String(error)
            }, 'Failed to load tool handler')
          }
        }
      }

      this.logger.info({ toolCount: this.tools.size }, 'All tools registered');

    } catch (error) {
      this.logger.error({ error }, 'Failed to register tools');
      throw new ServiceError(
        ErrorCode.ServiceUnavailable,
        'Failed to register tool handlers',
        error instanceof Error ? error : undefined
      )
    }
  }

  /**
   * Get the number of registered tools
   */
  getToolCount(): number {
    return this.tools.size
  }

  /**
   * Get tool by name
   */
  getTool(name: string): ToolDescriptor | undefined {
    return this.tools.get(name)
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Create tool context from dependencies
   */
  private createToolContext(signal?: AbortSignal): ToolContext {
    return {
      logger: this.logger,
      sessionService: this.deps.sessionService,
      progressEmitter: this.deps.progressEmitter,
      dockerClient: this.deps.dockerClient,
      repositoryAnalyzer: this.deps.repositoryAnalyzer,
      eventPublisher: this.deps.eventPublisher,
      workflowManager: this.deps.workflowManager,
      workflowOrchestrator: this.deps.workflowOrchestrator,
      mcpSampler: this.deps.mcpSampler,
      structuredSampler: this.deps.structuredSampler,
      contentValidator: this.deps.contentValidator,
      config: this.deps.config,
      ...(signal && { signal })
    }
  }
}

