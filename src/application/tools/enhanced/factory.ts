/**
 * Enhanced Tools - Simple factory functions without Java patterns
 *
 * Creates enhanced MCP tools with AI-powered capabilities using
 * functional composition instead of singleton/factory patterns.
 */

import type { Logger } from 'pino';
import type { McpResourceManager } from '../../../mcp/resources/manager.js';
import { Result, Success, Failure } from '../../../types/core/index.js';
import { AIParameterValidator } from '../intelligent/ai-parameter-validator.js';

/**
 * Enhanced tools configuration
 */
export interface EnhancedToolsConfig {
  resourceManager?: McpResourceManager;
  enableAIValidation?: boolean;
  enablePromptTemplates?: boolean;
  enableResourceManagement?: boolean;
}

/**
 * Create enhanced tools - Pure function, no singleton
 */
export function createEnhancedTools(
  baseResourceManager: McpResourceManager,
  logger: Logger,
  config: EnhancedToolsConfig = {},
): Result<{
  resourceManager: McpResourceManager;
  promptTemplates: any;
  aiValidator: AIParameterValidator;
}> {
  try {
    const enhancedResourceManager = baseResourceManager;
    const promptTemplates = {};
    const aiValidator = new AIParameterValidator(logger);

    logger.info({
      resourceManagerEnabled: !!config.enableResourceManagement,
      promptTemplatesEnabled: !!config.enablePromptTemplates,
      aiValidationEnabled: !!config.enableAIValidation,
    }, 'Enhanced tools created');

    return Success({
      resourceManager: enhancedResourceManager,
      promptTemplates,
      aiValidator,
    });
  } catch (error) {
    logger.error({ error, config }, 'Failed to create enhanced tools');
    return Failure(`Failed to create enhanced tools: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create workflow configuration - Simple object creation
 * @param repositoryPath - Path to the repository being analyzed
 * @param environment - Target environment (development, test, production)
 * @param options - Additional configuration options
 * @returns Workflow configuration object with environment defaults
 */
export const createWorkflowConfig = (
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
): {
  repositoryPath: string;
  samplingEnvironment: 'development' | 'test' | 'production';
  enableSampling: boolean;
  enableGates: boolean;
  enableScoring: boolean;
  enableRemediation: boolean;
  securityLevel: 'basic' | 'enhanced' | 'strict';
  maxRemediationAttempts: number;
  enableAIValidation: boolean;
} => {
  const environmentDefaults = {
    development: {
      enableSampling: false,
      enableGates: false,
      enableScoring: false,
      enableRemediation: false,
      securityLevel: 'basic' as const,
      maxRemediationAttempts: 2,
    },
    test: {
      enableSampling: true,
      enableGates: true,
      enableScoring: true,
      enableRemediation: true,
      securityLevel: 'enhanced' as const,
      maxRemediationAttempts: 3,
    },
    production: {
      enableSampling: true,
      enableGates: true,
      enableScoring: true,
      enableRemediation: true,
      securityLevel: 'strict' as const,
      maxRemediationAttempts: 5,
    },
  };

  const defaults = environmentDefaults[environment];

  return {
    repositoryPath,
    samplingEnvironment: environment,
    ...defaults,
    ...options,
    enableAIValidation: options.enableAIValidation ?? true,
  };
};
