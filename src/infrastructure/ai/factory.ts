/**
 * Factory for creating MCP samplers
 * Handles selection between real MCP and mock implementations
 */

import type { Logger } from '../../domain/types/index.js'
import { MCPSamplerImpl, type MCPServer } from './mcp-sampler.js'
import { MockMCPSampler } from './mock-sampler.js'
import type { MCPSampler } from './ai-types.js'

function createMockConfig(config: any) {
  const result: any = {
    deterministicMode: config?.deterministicMode ?? true,
    simulateLatency: config?.simulateLatency ?? false,
    latencyMs: config?.latencyMs || { min: 100, max: 500 },
    errorRate: config?.errorRate ?? 0
  }
  if (config?.responsesDir) {
    result.responsesDir = config.responsesDir
  }
  return result
}

/**
 * Sampler configuration
 */
export interface SamplerConfig {
  mode?: 'mcp' | 'mock' | 'auto'
  templateDir?: string
  cacheEnabled?: boolean
  retryAttempts?: number
  retryDelayMs?: number
  mock?: {
    responsesDir?: string
    deterministicMode?: boolean
    simulateLatency?: boolean
    latencyMs?: { min: number; max?: number }
    errorRate?: number
  }
}

/**
 * Factory for creating MCP samplers
 */
export class MCPSamplerFactory {
  /**
   * Create an MCP sampler instance
   */
  static async create(
    server: MCPServer,
    logger: Logger,
    config: SamplerConfig = {}
  ): Promise<MCPSampler> {
    const defaultConfig: Required<Omit<SamplerConfig, 'mock'>> = {
      mode: 'auto',
      templateDir: './prompts/templates',
      cacheEnabled: true,
      retryAttempts: 3,
      retryDelayMs: 1000
    }

    const finalConfig = { ...defaultConfig, ...config }

    logger.info({
      mode: finalConfig.mode,
      templateDir: finalConfig.templateDir
    }, 'Creating MCP sampler')

    // Mock mode - always return mock sampler
    if (finalConfig.mode === 'mock') {
      logger.info('Using mock MCP sampler (forced)')
      return new MockMCPSampler(logger, createMockConfig(finalConfig.mock))
    }

    // MCP mode - try to create real sampler
    if (finalConfig.mode === 'mcp') {
      try {
        const sampler = new MCPSamplerImpl(server, logger)
        logger.info('Using MCP sampler with host AI')
        return sampler

      } catch (error) {
        logger.error({ error: (error as Error).message }, 'Failed to create MCP sampler')
        throw error
      }
    }

    // Auto mode - try MCP first, fall back to mock
    if (finalConfig.mode === 'auto') {
      // Check for environment variable override
      if (process.env.FORCE_MOCK_SAMPLER === 'true') {
        logger.info('Using mock sampler (environment override)')
        return new MockMCPSampler(logger, finalConfig.mock || {})
      }

      // Try to create MCP sampler
      try {
        const sampler = new MCPSamplerImpl(server, logger)
        logger.info('Auto mode: Using MCP sampler')
        return sampler

      } catch (error) {
        logger.warn({
          error: (error as Error).message
        }, 'MCP sampler not available, falling back to mock')
      }

      // Fall back to mock sampler
      logger.info('Auto mode: Using mock sampler (fallback)')
      return new MockMCPSampler(logger, createMockConfig(finalConfig.mock))
    }

    throw new Error(`Invalid sampler mode: ${finalConfig.mode}`)
  }

  /**
   * Create a mock sampler for testing
   */
  static createMock(logger: Logger, config: SamplerConfig['mock'] = {}): MCPSampler {
    return new MockMCPSampler(logger, {
      deterministicMode: true,
      simulateLatency: false,
      errorRate: 0,
      ...config
    })
  }

  /**
   * Create a sampler based on environment
   */
  static async createFromEnvironment(server: MCPServer, logger: Logger): Promise<MCPSampler> {
    const mode = (process.env.MCP_SAMPLER_MODE as SamplerConfig['mode']) || 'auto'
    const templateDir = process.env.MCP_TEMPLATE_DIR || './prompts/templates'
    const cacheEnabled = process.env.MCP_CACHE_ENABLED !== 'false'
    const retryAttempts = parseInt(process.env.MCP_RETRY_ATTEMPTS || '3')
    const retryDelayMs = parseInt(process.env.MCP_RETRY_DELAY_MS || '1000')

    const config: SamplerConfig = {
      mode,
      templateDir,
      cacheEnabled,
      retryAttempts,
      retryDelayMs
    }

    // Mock configuration from environment
    if (process.env.MOCK_RESPONSES_DIR) {
      config.mock = {
        responsesDir: process.env.MOCK_RESPONSES_DIR,
        deterministicMode: process.env.MOCK_DETERMINISTIC !== 'false',
        simulateLatency: process.env.MOCK_SIMULATE_LATENCY === 'true',
        errorRate: parseFloat(process.env.MOCK_ERROR_RATE || '0')
      }

      if (process.env.MOCK_LATENCY_MIN && process.env.MOCK_LATENCY_MAX) {
        config.mock.latencyMs = {
          min: parseInt(process.env.MOCK_LATENCY_MIN),
          max: parseInt(process.env.MOCK_LATENCY_MAX)
        }
      }
    }

    return this.create(server, logger, config)
  }
}


