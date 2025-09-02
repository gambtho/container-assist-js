/**
 * AI Service Factory - Handles creation of AI-related services
 */

import type { Logger } from '../../domain/types/index.js'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { MCPServer, AIRequest } from '../../infrastructure/ai/mcp-sampler.js'
import type { ZodSchema } from 'zod'
import type { MCPSampler, StructuredSampler, ContentValidator } from '../interfaces.js'
import type { ApplicationConfig } from '../../config/index.js'
import { ok, fail, type Result } from '../../domain/types/result.js'

// Type adapter for bridging between different server interfaces
function adaptServer(server: Server): MCPServer {
  return {
    async request(request: { method: string; params?: Record<string, unknown> }): Promise<unknown> {
      try {
        const result = await (server as any).request(request.method, request.params)
        return result
      } catch (error) {
        try {
          const result = await (server as any).request(request)
          return result
        } catch (fallbackError) {
          throw new Error(fallbackError instanceof Error ? fallbackError.message : 'Unknown MCP request error')
        }
      }
    }
  }
}

export interface AIServices {
  mcpSampler?: MCPSampler
  structuredSampler?: StructuredSampler
  contentValidator?: ContentValidator
}

export class AIServiceFactory {
  static async create(
    config: ApplicationConfig,
    logger: Logger,
    mcpServer?: Server
  ): Promise<AIServices> {
    const services: AIServices = {}

    // Create MCP sampler for AI operations with adapter
    if (mcpServer && config.features?.aiEnabled !== false) {
      const { MCPSamplerImpl } = await import('../../infrastructure/ai/mcp-sampler.js')
      const mcpImpl = new MCPSamplerImpl(adaptServer(mcpServer), logger)

      // Adapt to service interface
      services.mcpSampler = {
        sample: async (request: AIRequest) => {
          const response = await mcpImpl.sample(request)
          if (response.success) {
            return ok(response.content as string)
          }
          return fail(response.error || new Error('AI sampling failed'))
        },
        sampleStructured: async <T>(request: AIRequest, schema: ZodSchema<T>): Promise<Result<T>> => {
          const response = await mcpImpl.sampleStructured<T>(request, schema)
          if (response.success) {
            return ok(response.content as T)
          }
          return fail(response.error || new Error('Structured sampling failed'))
        }
      }
      logger.info('MCP Sampler initialized for AI operations')
    } else if (config.features?.mockMode) {
      // Use mock sampler for testing
      const { MockMCPSampler } = await import('../../infrastructure/ai/mock-sampler.js')
      const mockImpl = new MockMCPSampler(logger)

      // Adapt to service interface
      services.mcpSampler = {
        sample: async (request: AIRequest) => {
          const response = await mockImpl.sample(request)
          if (response.success) {
            return ok(response.content as string)
          }
          return fail(response.error || new Error('Mock sampling failed'))
        },
        sampleStructured: async <T>(request: AIRequest, schema: ZodSchema<T>): Promise<Result<T>> => {
          const response = await mockImpl.sampleStructured(request, schema)
          if (response.success) {
            return ok(response.content as T)
          }
          return fail(response.error || new Error('Mock structured sampling failed'))
        }
      }
      logger.info('Mock MCP Sampler initialized for testing')
    }

    // Initialize AI reliability services
    if (services.mcpSampler) {
      const { StructuredSampler } = await import('../../infrastructure/ai/structured-sampler.js')
      const { ContentValidator } = await import('../../infrastructure/ai/content-validator.js')

      services.structuredSampler = new StructuredSampler(services.mcpSampler)
      services.contentValidator = new ContentValidator()

      logger.info('AI reliability services initialized')
    } else {
      logger.warn('AI reliability services require MCP sampler - structured sampling and content validation will not work')
    }

    return services
  }
}