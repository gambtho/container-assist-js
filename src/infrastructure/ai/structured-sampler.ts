/**
 * Structured Sampler for AI-driven content generation
 * Provides structured output generation with validation
 */

import type { Logger } from 'pino';
import { z } from 'zod';
import type { SampleFunction } from './sampling';
import type { AIRequest } from './requests';

/**
 * Security issue detected during generation
 */
export interface SecurityIssue {
  type: 'credential' | 'vulnerability' | 'exposure' | 'misconfiguration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
  recommendation?: string;
}

/**
 * Validation result for structured output
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  securityIssues?: SecurityIssue[];
}

/**
 * Options for structured sampling
 */
export interface StructuredSampleOptions {
  schema?: z.ZodSchema;
  format?: 'json' | 'yaml' | 'text';
  validateSecurity?: boolean;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Result from structured sampling
 */
export interface StructuredSampleResult<T = unknown> {
  success: boolean;
  data?: T;
  raw?: string;
  error?: string;
  validation?: ValidationResult;
  metadata?: {
    attempts: number;
    model?: string;
    tokensUsed?: number;
  };
}

/**
 * Structured Sampler implementation
 */
export class StructuredSampler {
  private sampler: SampleFunction;
  private logger: Logger;

  constructor(sampler: SampleFunction, logger: Logger) {
    this.sampler = sampler;
    this.logger = logger.child({ component: 'structured-sampler' });
  }

  /**
   * Generate structured output with validation
   */
  async generateStructured<T = unknown>(
    prompt: string,
    options: StructuredSampleOptions = {},
  ): Promise<StructuredSampleResult<T>> {
    const {
      schema,
      format = 'json',
      validateSecurity = true,
      maxRetries = 3,
      temperature = 0.3,
      maxTokens = 2000,
    } = options;

    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < maxRetries) {
      attempts++;

      try {
        // Build the AI request
        const request: AIRequest = {
          prompt: this.buildStructuredPrompt(prompt, format, schema),
          temperature,
          maxTokens,
          context: {
            format,
            structured: true,
          },
        };

        // Sample from the AI using function directly
        const response = await this.sampler(request);

        if (!response.success) {
          const failedResponse = response;
          lastError = failedResponse.error;
          this.logger.warn({ attempt: attempts, error: failedResponse.error }, 'Sampling failed');
          continue;
        }

        // Parse the response
        const parsed = this.parseResponse(response.text, format);

        // Validate with schema if provided
        if (schema) {
          const parseResult = schema.safeParse(parsed);
          if (!parseResult.success) {
            lastError = `Schema validation failed: ${parseResult.error.message}`;
            this.logger.warn(
              {
                attempt: attempts,
                errors: parseResult.error.errors,
              },
              'Schema validation failed',
            );
            continue;
          }
        }

        // Validate security if requested
        const validation = validateSecurity
          ? this.validateSecurity(response.text)
          : { valid: true };

        return {
          success: true,
          data: parsed as T,
          raw: response.text,
          validation,
          metadata: {
            attempts,
            ...(response.model && { model: response.model }),
            ...(response.tokenCount !== undefined && { tokensUsed: response.tokenCount }),
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          {
            attempt: attempts,
            error: lastError,
          },
          'Structured generation error',
        );
      }
    }

    return {
      success: false,
      error: `Max retries exceeded (${attempts} attempts)${lastError ? `. Last error: ${lastError}` : ''}`,
      metadata: { attempts },
    };
  }

  /**
   * Build a structured prompt with format instructions
   */
  private buildStructuredPrompt(basePrompt: string, format: string, schema?: z.ZodSchema): string {
    let prompt = basePrompt;

    // Add format instructions
    switch (format) {
      case 'json':
        prompt +=
          '\n\nPlease respond with valid JSON only. Do not include any markdown formatting or explanations.';
        break;
      case 'yaml':
        prompt +=
          '\n\nPlease respond with valid YAML only. Do not include any markdown formatting or explanations.';
        break;
      case 'text':
        prompt += '\n\nPlease respond with plain text only.';
        break;
    }

    // Add schema instructions if provided
    if (schema) {
      const schemaDescription = this.describeSchema(schema);
      if (schemaDescription) {
        prompt += `\n\nThe response must conform to this structure:\n${schemaDescription}`;
      }
    }

    return prompt;
  }

  /**
   * Parse response based on format
   */
  private parseResponse(text: string, format: string): unknown {
    // Clean the response
    text = text.trim();

    // Remove markdown code blocks if present
    const codeBlockRegex = /^```(?:json|yaml|text)?\n?([\s\S]*?)\n?```$/;
    const match = text.match(codeBlockRegex);
    if (match?.[1]) {
      text = match[1];
    }

    switch (format) {
      case 'json':
        return JSON.parse(text);
      case 'yaml':
        // Return the text as-is
        return text;
      case 'text':
        return text;
      default:
        return text;
    }
  }

  /**
   * Describe a Zod schema in human-readable format
   */
  private describeSchema(_schema: z.ZodSchema): string | null {
    try {
      // Return a simplified schema description
      return 'Follow the expected schema structure';
    } catch {
      return null;
    }
  }

  /**
   * Validate security aspects of generated content
   */
  private validateSecurity(content: string): ValidationResult {
    const issues: SecurityIssue[] = [];
    const warnings: string[] = [];

    // Check for potential credentials
    const credentialPatterns = [
      /api[_-]?key\s*[:=]\s*["']?[\w-]{20,}/gi,
      /password\s*[:=]\s*["']?[^"'\s]+/gi,
      /token\s*[:=]\s*["']?[\w-]{20,}/gi,
      /secret\s*[:=]\s*["']?[\w-]{20,}/gi,
    ];

    for (const pattern of credentialPatterns) {
      if (content.match(pattern)) {
        issues.push({
          type: 'credential',
          severity: 'high',
          description: 'Potential credential exposure detected',
          recommendation: 'Use environment variables or secrets management',
        });
        break; // Only report one credential issue per content
      }
    }

    // Check for known vulnerable patterns
    const vulnerablePatterns = [
      { pattern: /eval\s*\(/, desc: 'eval() usage detected' },
      { pattern: /exec\s*\(/, desc: 'exec() usage detected' },
      { pattern: /\$\{.*\}/, desc: 'Template injection risk' },
    ];

    for (const { pattern, desc } of vulnerablePatterns) {
      if (pattern.test(content)) {
        warnings.push(desc);
      }
    }

    const result: ValidationResult = {
      valid: issues.length === 0,
    };

    if (issues.length > 0) {
      result.errors = ['Security issues detected'];
      result.securityIssues = issues;
    }
    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }

  /**
   * Generate structured Dockerfile content
   */
  async generateDockerfile(
    requirements: string,
    constraints?: Record<string, unknown>,
  ): Promise<StructuredSampleResult<string>> {
    const prompt = `Generate a production-ready Dockerfile based on these requirements:
${requirements}

${constraints ? `Constraints: ${JSON.stringify(constraints, null, 2)}` : ''}

Follow best practices for:
- Multi-stage builds
- Layer caching
- Security (non-root user, minimal base images)
- Size optimization`;

    return this.generateStructured(prompt, {
      format: 'text',
      validateSecurity: true,
      temperature: 0.2,
      maxTokens: 3000,
    });
  }

  /**
   * Generate Kubernetes manifests
   */
  async generateKubernetesManifests(
    appDescription: string,
    options?: Record<string, unknown>,
  ): Promise<StructuredSampleResult<unknown>> {
    const prompt = `Generate Kubernetes manifests for:
${appDescription}

${options ? `Options: ${JSON.stringify(options, null, 2)}` : ''}

Include:
- Deployment
- Service
- ConfigMap (if needed)
- Ingress (if specified)`;

    return this.generateStructured(prompt, {
      format: 'yaml',
      validateSecurity: true,
      temperature: 0.2,
      maxTokens: 4000,
    });
  }

  /**
   * Sample structured output (alias for generateStructured)
   */
  async sampleStructured<T = unknown>(
    prompt: string,
    options: StructuredSampleOptions = {},
  ): Promise<StructuredSampleResult<T>> {
    return this.generateStructured<T>(prompt, options);
  }

  /**
   * Sample JSON output
   */
  async sampleJSON<T = unknown>(
    prompt: string,
    options: Omit<StructuredSampleOptions, 'format'> = {},
  ): Promise<StructuredSampleResult<T>> {
    return this.generateStructured<T>(prompt, {
      ...options,
      format: 'json',
    });
  }
}
