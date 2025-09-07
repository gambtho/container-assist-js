/**
 * AI-Powered Parameter Validation
 *
 * Provides intelligent parameter validation and optimization using the MCP host AI.
 * Integrates with the MCP-native AI service for context-aware validation.
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../../types/core.js';
import { createAIService, type AIRequest, type AIResponse } from '../../../lib/ai.js';

/**
 * Parameter validation context
 */
export interface ValidationContext {
  toolName: string;
  repositoryPath?: string;
  language?: string;
  framework?: string;
  environment?: 'development' | 'staging' | 'production';
  securityLevel?: 'basic' | 'enhanced' | 'strict';
}

/**
 * Parameter validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  optimizedParameters?: Record<string, unknown> | undefined;
}

/**
 * Parameter validation rule
 */
export interface ValidationRule {
  parameter: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  allowedValues?: unknown[];
  customValidator?: (value: unknown, context: ValidationContext) => Promise<Result<boolean>>;
}

/**
 * Tool parameter schema
 */
export interface ParameterSchema {
  toolName: string;
  description: string;
  parameters: ValidationRule[];
  contextualRules?: (context: ValidationContext) => ValidationRule[];
}

/**
 * AI-Powered Parameter Validator
 */
export class AIParameterValidator {
  private aiService: ReturnType<typeof createAIService>;
  private schemas: Map<string, ParameterSchema> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'AIParameterValidator' });
    this.aiService = createAIService(this.logger);
    this.initializeDefaultSchemas();
  }

  /**
   * Initialize default parameter schemas for containerization tools
   */
  private initializeDefaultSchemas(): void {
    const defaultSchemas: ParameterSchema[] = [
      {
        toolName: 'generate-dockerfile',
        description: 'Generate optimized Dockerfile with best practices',
        parameters: [
          {
            parameter: 'repositoryPath',
            required: true,
            type: 'string',
            minLength: 1,
          },
          {
            parameter: 'baseImage',
            required: false,
            type: 'string',
            pattern: /^[\w\-.]+(:[\w-.]+)?$/,
          },
          {
            parameter: 'language',
            required: false,
            type: 'string',
            allowedValues: ['node', 'python', 'java', 'go', 'rust', 'php', 'ruby'],
          },
          {
            parameter: 'securityLevel',
            required: false,
            type: 'string',
            allowedValues: ['basic', 'enhanced', 'strict'],
          },
        ],
        contextualRules: (context) => [
          ...(context.environment === 'production'
            ? [
                {
                  parameter: 'enableHealthCheck',
                  required: true,
                  type: 'boolean' as const,
                },
              ]
            : []),
          ...(context.securityLevel === 'strict'
            ? [
                {
                  parameter: 'nonRootUser',
                  required: true,
                  type: 'boolean' as const,
                },
              ]
            : []),
        ],
      },
      {
        toolName: 'generate-k8s-manifests',
        description: 'Generate Kubernetes deployment manifests',
        parameters: [
          {
            parameter: 'appName',
            required: true,
            type: 'string',
            pattern: /^[a-z0-9-]+$/,
            minLength: 1,
            maxLength: 63,
          },
          {
            parameter: 'imageName',
            required: true,
            type: 'string',
            pattern: /^[\w-./]+(:[\w-.]+)?$/,
          },
          {
            parameter: 'replicas',
            required: false,
            type: 'number',
            min: 1,
            max: 100,
          },
          {
            parameter: 'namespace',
            required: false,
            type: 'string',
            pattern: /^[a-z0-9-]+$/,
          },
        ],
        contextualRules: (context) => [
          ...(context.environment === 'production'
            ? [
                {
                  parameter: 'replicas',
                  required: true,
                  type: 'number' as const,
                  min: 3,
                },
              ]
            : []),
        ],
      },
      {
        toolName: 'scan-image',
        description: 'Scan container image for security vulnerabilities',
        parameters: [
          {
            parameter: 'imageName',
            required: true,
            type: 'string',
            pattern: /^[\w-./]+(:[\w-.]+)?$/,
          },
          {
            parameter: 'severity',
            required: false,
            type: 'string',
            allowedValues: ['low', 'medium', 'high', 'critical'],
          },
          {
            parameter: 'format',
            required: false,
            type: 'string',
            allowedValues: ['json', 'table', 'sarif'],
          },
        ],
      },
      {
        toolName: 'enhanced-workflow',
        description: 'Run enhanced containerization workflow with advanced features',
        parameters: [
          {
            parameter: 'repositoryPath',
            required: true,
            type: 'string',
            minLength: 1,
          },
          {
            parameter: 'enableSampling',
            required: false,
            type: 'boolean',
          },
          {
            parameter: 'enableGates',
            required: false,
            type: 'boolean',
          },
          {
            parameter: 'enableScoring',
            required: false,
            type: 'boolean',
          },
          {
            parameter: 'enableRemediation',
            required: false,
            type: 'boolean',
          },
          {
            parameter: 'maxRemediationAttempts',
            required: false,
            type: 'number',
            min: 1,
            max: 10,
          },
          {
            parameter: 'samplingEnvironment',
            required: false,
            type: 'string',
            allowedValues: ['development', 'test', 'production'],
          },
        ],
        contextualRules: (context) => [
          ...(context.environment === 'production'
            ? [
                {
                  parameter: 'enableGates',
                  required: true,
                  type: 'boolean' as const,
                },
                {
                  parameter: 'enableRemediation',
                  required: true,
                  type: 'boolean' as const,
                },
              ]
            : []),
          ...(context.securityLevel === 'strict'
            ? [
                {
                  parameter: 'enableScoring',
                  required: true,
                  type: 'boolean' as const,
                },
              ]
            : []),
        ],
      },
    ];

    defaultSchemas.forEach((schema) => {
      this.schemas.set(schema.toolName, schema);
    });

    this.logger.info({ count: defaultSchemas.length }, 'Default parameter schemas initialized');
  }

  /**
   * Validate tool parameters with AI-powered optimization
   */
  async validateParameters(
    toolName: string,
    parameters: Record<string, unknown>,
    context?: ValidationContext,
  ): Promise<Result<ValidationResult>> {
    try {
      const schema = this.schemas.get(toolName);
      if (!schema) {
        return Failure(`No parameter schema found for tool: ${toolName}`);
      }

      const validationContext: ValidationContext = {
        toolName,
        ...context,
      };

      // Perform basic validation
      const basicValidation = await this.performBasicValidation(
        schema,
        parameters,
        validationContext,
      );
      if (!basicValidation.ok) {
        return basicValidation;
      }

      // Perform AI-powered optimization
      const aiOptimization = await this.performAIOptimization(
        schema,
        parameters,
        validationContext,
      );
      if (!aiOptimization.ok) {
        this.logger.warn(
          { error: aiOptimization.error },
          'AI optimization failed, using basic validation',
        );
        return Success(basicValidation.value);
      }

      // Merge results
      const mergedResult: ValidationResult = {
        ...basicValidation.value,
        suggestions: [...basicValidation.value.suggestions, ...aiOptimization.value.suggestions],
        optimizedParameters:
          aiOptimization.value.optimizedParameters || basicValidation.value.optimizedParameters,
      };

      this.logger.debug(
        {
          toolName,
          isValid: mergedResult.isValid,
          errorCount: mergedResult.errors.length,
          warningCount: mergedResult.warnings.length,
          suggestionCount: mergedResult.suggestions.length,
          hasOptimizations: !!mergedResult.optimizedParameters,
        },
        'Parameter validation completed',
      );

      return Success(mergedResult);
    } catch (error) {
      this.logger.error({ error, toolName, parameters, context }, 'Parameter validation failed');
      return Failure(
        `Parameter validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Register a custom parameter schema
   */
  async registerSchema(schema: ParameterSchema): Promise<Result<void>> {
    try {
      this.schemas.set(schema.toolName, schema);

      this.logger.info(
        {
          toolName: schema.toolName,
          parameterCount: schema.parameters.length,
          hasContextualRules: !!schema.contextualRules,
        },
        'Custom parameter schema registered',
      );

      return Success(undefined);
    } catch (error) {
      this.logger.error({ error, schema }, 'Failed to register parameter schema');
      return Failure(
        `Failed to register schema: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get parameter suggestions for a tool
   */
  async getParameterSuggestions(
    toolName: string,
    partialParameters: Record<string, unknown>,
    context?: ValidationContext,
  ): Promise<Result<{ suggestions: Record<string, unknown>; reasoning: string }>> {
    try {
      const schema = this.schemas.get(toolName);
      if (!schema) {
        return Failure(`No parameter schema found for tool: ${toolName}`);
      }

      // Create AI request for parameter suggestions
      const aiRequest: AIRequest = {
        prompt: `Suggest optimal parameters for ${toolName}`,
        context: {
          toolDescription: schema.description,
          partialParameters,
          availableParameters: schema.parameters.map((p) => ({
            name: p.parameter,
            type: p.type,
            required: p.required,
            allowedValues: p.allowedValues,
          })),
          context: context || {},
        },
      };

      const aiResponse = await this.aiService.generate(aiRequest);
      if (!aiResponse.ok) {
        return Failure(`AI parameter suggestion failed: ${aiResponse.error}`);
      }

      // Parse AI guidance into suggestions
      const suggestions = this.parseAISuggestions(aiResponse.value, schema, partialParameters);

      this.logger.debug(
        {
          toolName,
          suggestionCount: Object.keys(suggestions.suggestions).length,
        },
        'Generated parameter suggestions',
      );

      return Success(suggestions);
    } catch (error) {
      this.logger.error(
        { error, toolName, partialParameters, context },
        'Failed to get parameter suggestions',
      );
      return Failure(
        `Failed to get parameter suggestions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Perform basic parameter validation
   */
  private async performBasicValidation(
    schema: ParameterSchema,
    parameters: Record<string, unknown>,
    context: ValidationContext,
  ): Promise<Result<ValidationResult>> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Get all applicable rules
    const rules = [...schema.parameters];
    if (schema.contextualRules) {
      rules.push(...schema.contextualRules(context));
    }

    // Validate each rule
    for (const rule of rules) {
      const value = parameters[rule.parameter];
      const hasValue = value !== undefined && value !== null && value !== '';

      // Check required parameters
      if (rule.required && !hasValue) {
        errors.push(`Required parameter '${rule.parameter}' is missing`);
        continue;
      }

      if (!hasValue) continue;

      // Type validation
      if (!this.validateType(value, rule.type)) {
        errors.push(`Parameter '${rule.parameter}' must be of type ${rule.type}`);
        continue;
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors.push(`Parameter '${rule.parameter}' does not match required pattern`);
      }

      // Length validation
      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`Parameter '${rule.parameter}' must be at least ${rule.minLength} characters`);
      }

      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(
          `Parameter '${rule.parameter}' must be no more than ${rule.maxLength} characters`,
        );
      }

      // Numeric validation
      if (rule.min && typeof value === 'number' && value < rule.min) {
        errors.push(`Parameter '${rule.parameter}' must be at least ${rule.min}`);
      }

      if (rule.max && typeof value === 'number' && value > rule.max) {
        errors.push(`Parameter '${rule.parameter}' must be no more than ${rule.max}`);
      }

      // Allowed values validation
      if (rule.allowedValues && !rule.allowedValues.includes(value)) {
        errors.push(
          `Parameter '${rule.parameter}' must be one of: ${rule.allowedValues.join(', ')}`,
        );
      }

      // Custom validation
      if (rule.customValidator) {
        const customResult = await rule.customValidator(value, context);
        if (!customResult.ok) {
          errors.push(`Custom validation failed for '${rule.parameter}': ${customResult.error}`);
        }
      }
    }

    // Generate basic suggestions
    if (context.environment === 'production' && !parameters.replicas) {
      suggestions.push('Consider setting replicas to at least 3 for production deployments');
    }

    if (context.securityLevel === 'strict' && !parameters.nonRootUser) {
      suggestions.push('For strict security, enable non-root user in container');
    }

    return Success({
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    });
  }

  /**
   * Perform AI-powered parameter optimization
   */
  private async performAIOptimization(
    schema: ParameterSchema,
    parameters: Record<string, unknown>,
    context: ValidationContext,
  ): Promise<Result<{ suggestions: string[]; optimizedParameters?: Record<string, unknown> }>> {
    try {
      const aiRequest: AIRequest = {
        prompt: `Optimize parameters for ${context.toolName} tool`,
        context: {
          toolDescription: schema.description,
          currentParameters: parameters,
          validationContext: context,
          parameterRules: schema.parameters.map((p) => ({
            name: p.parameter,
            type: p.type,
            required: p.required,
            constraints: {
              pattern: p.pattern?.toString(),
              minLength: p.minLength,
              maxLength: p.maxLength,
              min: p.min,
              max: p.max,
              allowedValues: p.allowedValues,
            },
          })),
        },
      };

      const aiResponse = await this.aiService.generate(aiRequest);
      if (!aiResponse.ok) {
        return Failure(aiResponse.error);
      }

      // Extract optimization suggestions from AI response
      const suggestions = this.extractOptimizationSuggestions(aiResponse.value, context);

      return Success({
        suggestions,
        // Note: optimizedParameters would come from AI analysis in a real implementation
        // For now, we provide basic optimizations based on context
        optimizedParameters: this.generateBasicOptimizations(parameters, context),
      });
    } catch (error) {
      return Failure(
        `AI optimization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate parameter type
   */
  private validateType(value: unknown, type: ValidationRule['type']): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Parse AI suggestions into structured format
   */
  private parseAISuggestions(
    aiResponse: AIResponse,
    schema: ParameterSchema,
    partialParameters: Record<string, unknown>,
  ): { suggestions: Record<string, unknown>; reasoning: string } {
    // In a real implementation, this would parse the AI response
    // For now, provide context-aware suggestions based on the guidance
    const suggestions: Record<string, unknown> = {};

    // Use schema information for better suggestions
    schema.parameters.forEach((param) => {
      if (!partialParameters[param.parameter] && param.allowedValues) {
        suggestions[param.parameter] = param.allowedValues[0];
      }
    });

    if (aiResponse.context.guidance?.includes('security')) {
      suggestions.nonRootUser = true;
      suggestions.securityLevel = 'enhanced';
    }

    if (aiResponse.context.guidance?.includes('production')) {
      suggestions.replicas = Math.max(3, (partialParameters.replicas as number) || 1);
      suggestions.healthCheck = true;
    }

    return {
      suggestions,
      reasoning: aiResponse.context.guidance || 'Basic optimization applied',
    };
  }

  /**
   * Extract optimization suggestions from AI response
   */
  private extractOptimizationSuggestions(
    aiResponse: AIResponse,
    context: ValidationContext,
  ): string[] {
    const suggestions: string[] = [];

    if (aiResponse.context.guidance?.includes('multi-stage')) {
      suggestions.push('Consider using multi-stage builds to reduce image size');
    }

    if (aiResponse.context.guidance?.includes('security') && context.environment === 'production') {
      suggestions.push('Apply security best practices for production deployment');
    }

    if (aiResponse.context.guidance?.includes('resource')) {
      suggestions.push('Set appropriate resource limits and requests');
    }

    return suggestions;
  }

  /**
   * Generate basic parameter optimizations based on context
   */
  private generateBasicOptimizations(
    parameters: Record<string, unknown>,
    context: ValidationContext,
  ): Record<string, unknown> {
    const optimizations = { ...parameters };

    // Production environment optimizations
    if (context.environment === 'production') {
      if (!optimizations.replicas) {
        optimizations.replicas = 3;
      }
      if (!optimizations.healthCheck) {
        optimizations.healthCheck = true;
      }
    }

    // Security level optimizations
    if (context.securityLevel === 'strict') {
      optimizations.nonRootUser = true;
      optimizations.readOnlyRootFilesystem = true;
    }

    return optimizations;
  }

  /**
   * Get validation statistics
   */
  getStats(): {
    totalSchemas: number;
    schemasByTool: string[];
    averageParameterCount: number;
  } {
    const schemas = Array.from(this.schemas.values());
    const totalParameters = schemas.reduce((sum, schema) => sum + schema.parameters.length, 0);

    return {
      totalSchemas: schemas.length,
      schemasByTool: schemas.map((s) => s.toolName),
      averageParameterCount: schemas.length > 0 ? Math.round(totalParameters / schemas.length) : 0,
    };
  }
}
