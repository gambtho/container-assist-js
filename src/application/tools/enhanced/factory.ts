/**
 * Enhanced Tools Factory
 *
 * Creates and configures enhanced MCP tools with AI-powered capabilities.
 * Integrates all enhanced features: resource management, prompt templates, and AI validation.
 */

import type { Logger } from 'pino';
import { EnhancedResourceManager, type ResourceCategory } from '../../../mcp/resources/enhanced-resource-manager.js';
import { PromptTemplatesManager, type TemplateContext } from './prompt-templates.js';
import { AIParameterValidator, type ValidationContext } from './ai-parameter-validator.js';
import type { McpResourceManager } from '../../../mcp/resources/manager.js';
import { Result, Success, Failure } from '../../../types/core/index.js';

/**
 * Enhanced tools configuration
 */
export interface EnhancedToolsConfig {
  resourceManager?: McpResourceManager;
  enableAIValidation?: boolean;
  enablePromptTemplates?: boolean;
  enableResourceManagement?: boolean;
  aiApiKey?: string;
}

/**
 * Enhanced tools suite
 */
export interface EnhancedTools {
  resourceManager: EnhancedResourceManager;
  promptTemplates: PromptTemplatesManager;
  aiValidator: AIParameterValidator;

  // Convenience methods
  publishWorkflowArtifact: (
    name: string,
    content: unknown,
    category: ResourceCategory,
    metadata?: {
      description?: string;
      priority?: number;
      audience?: string[];
    }
  ) => Promise<Result<string>>;

  validateToolParameters: (
    toolName: string,
    parameters: Record<string, unknown>,
    context?: ValidationContext
  ) => Promise<Result<import('./ai-parameter-validator.js').ValidationResult>>;

  getContextualPrompt: (
    promptName: string,
    context?: TemplateContext
  ) => Promise<Result<import('@modelcontextprotocol/sdk/types.js').GetPromptResult>>;
}

/**
 * Enhanced Tools Factory
 */
export class EnhancedToolsFactory {
  private static instance: EnhancedTools | null = null;

  /**
   * Create enhanced tools suite
   */
  static async create(
    baseResourceManager: McpResourceManager,
    logger: Logger,
    config: EnhancedToolsConfig = {},
  ): Promise<Result<EnhancedTools>> {
    try {
      const enhancedResourceManager = new EnhancedResourceManager(baseResourceManager, logger);
      const promptTemplates = new PromptTemplatesManager(logger);
      const aiValidator = new AIParameterValidator(logger, config.aiApiKey);

      const tools: EnhancedTools = {
        resourceManager: enhancedResourceManager,
        promptTemplates,
        aiValidator,

        // Convenience method for publishing workflow artifacts
        async publishWorkflowArtifact(name, content, category, metadata = {}) {
          const uri = `workflow://${category}/${name}-${Date.now()}`;

          return await enhancedResourceManager.publishEnhanced(
            uri,
            content,
            {
              name,
              description: metadata.description || `${category} artifact: ${name}`,
              category,
              annotations: {
                audience: metadata.audience || ['workflow'],
                priority: metadata.priority || 1,
              },
            },
          );
        },

        // Convenience method for validating tool parameters
        async validateToolParameters(toolName, parameters, context) {
          return await aiValidator.validateParameters(toolName, parameters, context);
        },

        // Convenience method for getting contextual prompts
        async getContextualPrompt(promptName, context) {
          return await promptTemplates.getPrompt(promptName, context);
        },
      };

      EnhancedToolsFactory.instance = tools;

      logger.info({
        resourceManagerEnabled: !!config.enableResourceManagement,
        promptTemplatesEnabled: !!config.enablePromptTemplates,
        aiValidationEnabled: !!config.enableAIValidation,
        resourceStats: enhancedResourceManager.getStats(),
        promptStats: promptTemplates.getStats(),
        validatorStats: aiValidator.getStats(),
      }, 'Enhanced tools suite created');

      return Success(tools);
    } catch (error) {
      logger.error({ error, config }, 'Failed to create enhanced tools suite');
      return Failure(`Failed to create enhanced tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get existing enhanced tools instance
   */
  static getInstance(): EnhancedTools | null {
    return EnhancedToolsFactory.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static reset(): void {
    EnhancedToolsFactory.instance = null;
  }
}

/**
 * Convenience function to create enhanced workflow configuration
 */
export const createEnhancedWorkflowConfig = async (
  repositoryPath: string,
  environment: 'development' | 'test' | 'production',
  options: {
    enableSampling?: boolean;
    enableGates?: boolean;
    enableScoring?: boolean;
    enableRemediation?: boolean;
    enableAIValidation?: boolean;
    securityLevel?: 'basic' | 'enhanced' | 'strict';
  } = {},
): Promise<{
  repositoryPath: string;
  enableSampling: boolean;
  enableGates: boolean;
  enableScoring: boolean;
  enableRemediation: boolean;
  enableAIValidation: boolean;
  samplingEnvironment: 'development' | 'test' | 'production';
  securityLevel: 'basic' | 'enhanced' | 'strict';
  maxRemediationAttempts: number;
  aiValidator?: AIParameterValidator;
}> => {
  const tools = EnhancedToolsFactory.getInstance();

  // Environment-based defaults
  const defaults = {
    development: {
      enableSampling: options.enableSampling ?? false,
      enableGates: options.enableGates ?? false,
      enableScoring: options.enableScoring ?? false,
      enableRemediation: options.enableRemediation ?? false,
      securityLevel: 'basic' as const,
      maxRemediationAttempts: 2,
    },
    test: {
      enableSampling: options.enableSampling ?? true,
      enableGates: options.enableGates ?? true,
      enableScoring: options.enableScoring ?? true,
      enableRemediation: options.enableRemediation ?? true,
      securityLevel: 'enhanced' as const,
      maxRemediationAttempts: 3,
    },
    production: {
      enableSampling: options.enableSampling ?? true,
      enableGates: options.enableGates ?? true,
      enableScoring: options.enableScoring ?? true,
      enableRemediation: options.enableRemediation ?? true,
      securityLevel: 'strict' as const,
      maxRemediationAttempts: 5,
    },
  };

  const envDefaults = defaults[environment];

  return {
    repositoryPath,
    enableSampling: envDefaults.enableSampling,
    enableGates: envDefaults.enableGates,
    enableScoring: envDefaults.enableScoring,
    enableRemediation: envDefaults.enableRemediation,
    enableAIValidation: options.enableAIValidation ?? true,
    samplingEnvironment: environment,
    securityLevel: options.securityLevel ?? envDefaults.securityLevel,
    maxRemediationAttempts: envDefaults.maxRemediationAttempts,
    ...(tools && { aiValidator: tools.aiValidator }),
  };
};

/**
 * Get enhanced tools statistics
 */
export const getEnhancedToolsStats = (): {
  available: boolean;
  resources?: ReturnType<EnhancedResourceManager['getStats']>;
  prompts?: ReturnType<PromptTemplatesManager['getStats']>;
  validator?: ReturnType<AIParameterValidator['getStats']>;
} => {
  const tools = EnhancedToolsFactory.getInstance();

  if (!tools) {
    return { available: false };
  }

  return {
    available: true,
    resources: tools.resourceManager.getStats(),
    prompts: tools.promptTemplates.getStats(),
    validator: tools.aiValidator.getStats(),
  };
};
