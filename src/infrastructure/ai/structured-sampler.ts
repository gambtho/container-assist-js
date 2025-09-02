/**
 * Structured JSON sampler with auto-repair capabilities
 * Implements AI reliability features for guaranteed JSON parsing
 */

import { z } from 'zod'
import type { AIRequest, MCPSampler } from './ai-types.js'
import { Result, ok, fail } from '../../domain/types/result.js'

export interface StructuredSamplingOptions {
  maxRepairAttempts?: number
  schema?: z.ZodSchema
}

export interface ValidationResult {
  isValid: boolean
  issues: SecurityIssue[]
  summary: string
}

export interface SecurityIssue {
  severity: 'high' | 'medium' | 'low'
  message: string
  category: string
}

/**
 * Enhanced sampler that guarantees structured JSON output with auto-repair
 */
export class StructuredSampler {
  constructor(private readonly baseSampler: MCPSampler) {}

  /**
   * Sample JSON with automatic repair and validation
   * @param request - AI request configuration
   * @param schema - Optional Zod schema for validation
   * @param options - Sampling options
   */
  async sampleJSON<T>(
    request: AIRequest,
    schema?: z.ZodSchema<T>,
    options: StructuredSamplingOptions = {}
  ): Promise<Result<T>> {
    const { maxRepairAttempts = 2 } = options

    for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
      const response = await this.baseSampler.sample({
        ...request,
        format: 'json'
      })

      if (!response.success) {
        return fail(response.error?.message || 'Sampling failed')
      }

      // Try parsing the JSON
      const parsed = this.tryParseJSON(response.content)
      if (parsed.success) {
        // Validate with schema if provided
        if (schema) {
          const validated = schema.safeParse(parsed.data)
          if (validated.success) {
            return ok(validated.data)
          } else if (attempt < maxRepairAttempts) {
            // Retry with validation errors
            request = this.createRepairRequest(request, response.content, validated.error)
            continue
          } else {
            return fail(`Schema validation failed: ${validated.error.message}`)
          }
        } else {
          return ok(parsed.data)
        }
      } else if (attempt < maxRepairAttempts) {
        // Retry with parsing error
        const parseError = parsed.error instanceof Error ? parsed.error : new Error(String(parsed.error))
        request = this.createRepairRequest(request, response.content, parseError)
        continue
      }
    }

    return fail('Failed to get valid JSON after repair attempts')
  }

  /**
   * Sample with structured output format (YAML, Dockerfile, etc.)
   * @param request - AI request configuration
   * @param format - Output format
   */
  async sampleStructured(
    request: AIRequest,
    format: 'yaml' | 'dockerfile' | 'kubernetes'
  ): Promise<Result<string>> {
    const response = await this.baseSampler.sample({
      ...request,
      format
    })

    if (!response.success) {
      return fail(response.error?.message || 'Sampling failed')
    }

    // Clean up markdown code fences if present
    const cleaned = this.cleanMarkdownFences(response.content, format)

    return ok(cleaned)
  }

  /**
   * Try to parse JSON content with cleanup
   * @param content - Raw content to parse
   */
  private tryParseJSON(content: string): Result<any> {
    try {
      // Remove markdown code fences if present
      const cleaned = content.replace(/```(?:json)?\n?(.*?)\n?```/s, '$1').trim()
      const parsed = JSON.parse(cleaned)
      return ok(parsed)
    } catch (error) {
      return fail(error as Error)
    }
  }

  /**
   * Create repair request for malformed JSON
   * @param originalRequest - Original request
   * @param malformedContent - Malformed JSON content
   * @param error - Parse or validation error
   */
  private createRepairRequest(
    originalRequest: AIRequest,
    malformedContent: string,
    error: Error | z.ZodError
  ): AIRequest {
    let errorMessage = error.message
    let repairInstruction = 'Fix the JSON syntax and format errors. Return only valid JSON.'

    if (error instanceof z.ZodError) {
      errorMessage = this.formatZodError(error)
      repairInstruction = 'Fix the JSON structure to match the required schema. Return only valid JSON.'
    }

    return {
      ...originalRequest,
      variables: {
        ...originalRequest.variables,
        malformed_json: malformedContent,
        error_message: errorMessage,
        repair_instruction: repairInstruction
      },
      templateId: 'json-repair'
    }
  }

  /**
   * Format Zod validation errors for repair
   * @param error - Zod validation error
   */
  private formatZodError(error: z.ZodError): string {
    const issues = error.issues.map(issue =>
      `${issue.path.join('.')}: ${issue.message}`
    )
    return `Schema validation errors: ${issues.join(', ')}`
  }

  /**
   * Clean markdown code fences from structured content
   * @param content - Raw content
   * @param format - Expected format
   */
  private cleanMarkdownFences(content: string, format: string): string {
    // Remove code fences with optional language specification
    const patterns = [
      new RegExp(`\`\`\`(?:${format})?\n?(.*?)\n?\`\`\``, 's'),
      /```yaml\n?(.*?)\n?```/s,
      /```dockerfile\n?(.*?)\n?```/s,
      /```kubernetes\n?(.*?)\n?```/s,
      /```\n?(.*?)\n?```/s
    ]

    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match?.[1]) {
        return match[1].trim()
      }
    }

    return content.trim()
  }
}


