/**
 * Type definitions and interfaces for MCP Sampling
 * Provides strict typing for AI integration boundaries
 */

import { z } from 'zod'

/**
 * AI Request interface - simplified from plan
 */
export interface AIRequest {
  templateId: string
  variables: Record<string, any>
  format?: 'text' | 'json' | 'yaml' | 'dockerfile' | 'kubernetes'
  temperature?: number
  maxTokens?: number
}

/**
 * AI Response interface - simplified from plan
 */
export interface AIResponse<T = any> {
  success: boolean
  content: T
  error?: Error
  metadata?: {
    tokensUsed?: number
    duration?: number
    retryCount?: number
  }
}

/**
 * Simple, focused interface - no complex validation schemas
 */
export interface MCPSampler {
  sample<T = any>(request: AIRequest): Promise<AIResponse<T>>
}

/**
 * Template IDs must match Go implementation exactly
 */
export const TemplateId = z.enum([
  'repository-analysis',
  'dockerfile-generation',
  'dockerfile-fix',
  'k8s-generation',
  'k8s-fix',
  'error-analysis',
  'optimization-suggestion'
])

/**
 * Request format enforced at boundary
 */
export const SamplingRequest = z.object({
  templateId: TemplateId,
  variables: z.record(z.string(), z.string()),
  format: z.enum(['text', 'json', 'yaml', 'dockerfile', 'kubernetes']).default('text'),
  maxTokens: z.number().min(100).max(4000).default(2000),
  temperature: z.number().min(0).max(1).default(0.2),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().optional(),
})

/**
 * Response validation
 */
export const SamplingResponse = z.object({
  content: z.string(),
  format: z.enum(['text', 'json', 'yaml', 'dockerfile', 'kubernetes']),
  tokenUsage: z.object({
    prompt: z.number(),
    completion: z.number(),
    total: z.number(),
  }).optional(),
  model: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Prompt template schema matching Go YAML structure
 */
export const PromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  system: z.string(),
  user: z.string(),
  variables: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(true),
    default: z.string().optional(),
  })).default([]),
  outputFormat: z.enum(['text', 'json', 'yaml', 'dockerfile', 'kubernetes']).default('text'),
  examples: z.array(z.object({
    input: z.record(z.string(), z.string()),
    output: z.string(),
  })).optional(),
  tags: z.array(z.string()).optional(),
})

/**
 * Error types specific to sampling
 */
export class MCPSamplingError extends Error {
  public override readonly name: string = 'MCPSamplingError'
  public override readonly cause: Error | null
  public readonly templateId: string | null
  public readonly retryable: boolean

  constructor(
    message: string,
    cause: Error | null = null,
    templateId: string | null = null,
    retryable: boolean = true
  ) {
    super(message)
    this.cause = cause
    this.templateId = templateId
    this.retryable = retryable
  }
}

/**
 * Sampler capabilities
 */
export const SamplerCapabilities = z.object({
  maxTokens: z.number(),
  supportsStreaming: z.boolean(),
  supportsSystemPrompt: z.boolean(),
  models: z.array(z.string())
})

/**
 * Type exports
 */
export type TemplateIdType = z.infer<typeof TemplateId>
export type SamplingRequestType = z.infer<typeof SamplingRequest>
export type SamplingResponseType = z.infer<typeof SamplingResponse>
export type PromptTemplateType = z.infer<typeof PromptTemplateSchema>
export type SamplerCapabilitiesType = z.infer<typeof SamplerCapabilities>


