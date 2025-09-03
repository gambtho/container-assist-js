/**
 * Error Validation Utilities - Zod-based validation with MCP error responses
 * Provides validation middleware and utilities for MCP tool handlers
 */

import { z } from 'zod';
import { convertToMcpError, type MCPError } from './mcp-error-mapper.js';
import type { Logger } from 'pino';

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: MCPError;
    };

/**
 * Create a validation handler for input parameters
 */
export function createValidationHandler<T>(schema: z.ZodSchema<T>) {
  return (input: unknown): T => {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw convertToMcpError(new Error('Input validation failed'));
    }
    return result.data;
  };
}

/**
 * Create a safe validation handler that returns a result instead of throwing
 */
export function createSafeValidationHandler<T>(schema: z.ZodSchema<T>) {
  return (input: unknown): ValidationResult<T> => {
    const result = schema.safeParse(input);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return {
        success: false,
        error: convertToMcpError(new Error('Input validation failed'))
      };
    }
  };
}

/**
 * Validation middleware for tool handlers
 */
export function withValidation<TInput, TOutput>(
  inputSchema: z.ZodSchema<TInput>,
  outputSchema: z.ZodSchema<TOutput>,
  handler: (input: TInput) => Promise<TOutput>
) {
  return async (input: unknown): Promise<TOutput> => {
    // Validate input
    const validatedInput = createValidationHandler(inputSchema)(input);

    try {
      // Execute handler
      const result = await handler(validatedInput);

      // Validate output
      const validatedOutput = outputSchema.parse(result);
      return validatedOutput;
    } catch (error) {
      // Convert any error to MCP error
      throw convertToMcpError(error);
    }
  };
}

/**
 * Validation middleware with logging
 */
export function withValidationAndLogging<TInput, TOutput>(
  inputSchema: z.ZodSchema<TInput>,
  outputSchema: z.ZodSchema<TOutput>,
  handler: (input: TInput, logger: Logger) => Promise<TOutput>,
  logger: Logger,
  toolName: string
) {
  return async (input: unknown): Promise<TOutput> => {
    const toolLogger = logger.child({ tool: toolName });

    try {
      // Validate input
      toolLogger.debug({ input }, 'Validating input');
      const validatedInput = createValidationHandler(inputSchema)(input);

      // Execute handler
      toolLogger.debug('Executing tool handler');
      const startTime = Date.now();
      const result = await handler(validatedInput, toolLogger);
      const duration = Date.now() - startTime;

      // Validate output
      toolLogger.debug({ result, duration }, 'Validating output');
      const validatedOutput = outputSchema.parse(result);

      toolLogger.info({ duration }, 'Tool executed successfully');
      return validatedOutput;
    } catch (error) {
      toolLogger.error({ error }, 'Tool execution failed');
      throw convertToMcpError(error);
    }
  };
}

/**
 * Common validation schemas for MCP tools
 */
export const CommonSchemas = {
  /**
   * Basic string parameter that cannot be empty
   */
  nonEmptyString: z.string().min(1, 'String cannot be empty'),

  /**
   * File path parameter
   */
  filePath: z.string().min(1, 'File path cannot be empty'),

  /**
   * Optional file path
   */
  optionalFilePath: z.string().optional(),

  /**
   * Docker image name/tag
   */
  dockerImage: z
    .string()
    .regex(
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-zA-Z0-9._-]+)?$/,
      'Invalid Docker image name format'
    ),

  /**
   * Kubernetes resource name
   */
  k8sResourceName: z
    .string()
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Invalid Kubernetes resource name format'),

  /**
   * Namespace (optional)
   */
  optionalNamespace: z
    .string()
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Invalid namespace format')
    .optional(),

  /**
   * Progress token
   */
  progressToken: z.string().optional(),

  /**
   * Boolean with default
   */
  optionalBoolean: z.boolean().optional(),

  /**
   * Port number
   */
  port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535'),

  /**
   * Optional port
   */
  optionalPort: z.number().int().min(1).max(65535).optional(),

  /**
   * Environment variables
   */
  environmentVariables: z.record(z.string()).optional(),

  /**
   * Labels/annotations
   */
  labels: z.record(z.string()).optional(),

  /**
   * Timeout in milliseconds
   */
  timeout: z.number().int().min(1000).max(300000).optional().default(30000)
};

/**
 * Common output schemas
 */
export const CommonOutputSchemas = {
  /**
   * Success response with message
   */
  success: z.object({
    success: z.boolean(),
    message: z.string(),
    timestamp: z.string().optional()
  }),

  /**
   * Success with data
   */
  successWithData: <T>(dataSchema: z.ZodSchema<T>) =>
    z.object({
      success: z.boolean(),
      message: z.string(),
      data: dataSchema,
      timestamp: z.string().optional()
    }),

  /**
   * Docker build result
   */
  dockerBuildResult: z.object({
    success: z.boolean(),
    imageId: z.string(),
    tags: z.array(z.string()),
    buildTime: z.number(),
    size: z.number().optional(),
    layers: z.number().optional()
  }),

  /**
   * Kubernetes deployment result
   */
  k8sDeploymentResult: z.object({
    success: z.boolean(),
    resources: z.array(
      z.object({
        kind: z.string(),
        name: z.string(),
        namespace: z.string().optional(),
        status: z.string()
      })
    ),
    deploymentTime: z.number(),
    message: z.string()
  }),

  /**
   * Analysis result
   */
  analysisResult: z.object({
    success: z.boolean(),
    findings: z.array(
      z.object({
        type: z.string(),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        message: z.string(),
        file: z.string().optional(),
        line: z.number().optional()
      })
    ),
    summary: z.string(),
    recommendations: z.array(z.string()).optional()
  })
};

/**
 * Validation error formatter for user-friendly messages
 */
export function formatValidationError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return `Validation failed: ${issues.join(', ')}`;
}

/**
 * Tool parameter builder with validation
 */
export class ToolParameterBuilder {
  private schema: z.ZodRawShape = {};

  /**
   * Add a required string parameter
   */
  requiredString(name: string, description?: string): this {
    this.schema[name] = CommonSchemas.nonEmptyString.describe(description ?? name);
    return this;
  }

  /**
   * Add an optional string parameter
   */
  optionalString(name: string, description?: string): this {
    this.schema[name] = z
      .string()
      .optional()
      .describe(description ?? name);
    return this;
  }

  /**
   * Add a boolean parameter
   */
  boolean(name: string, defaultValue?: boolean, description?: string): this {
    let schema: any = z.boolean().describe(description ?? name);
    if (defaultValue !== undefined) {
      schema = schema.default(defaultValue);
    }
    this.schema[name] = schema;
    return this;
  }

  /**
   * Add a number parameter
   */
  number(name: string, min?: number, max?: number, description?: string): this {
    let schema = z.number().describe(description ?? name);
    if (min !== undefined) schema = schema.min(min);
    if (max !== undefined) schema = schema.max(max);
    this.schema[name] = schema;
    return this;
  }

  /**
   * Add a custom parameter
   */
  custom<T>(name: string, zodSchema: z.ZodSchema<T>, description?: string): this {
    this.schema[name] = zodSchema.describe(description ?? name);
    return this;
  }

  /**
   * Build the final schema
   */
  build(): z.ZodObject<any> {
    return z.object(this.schema);
  }
}

/**
 * Create a tool parameter builder
 */
export function createParameterBuilder(): ToolParameterBuilder {
  return new ToolParameterBuilder();
}
