/**
 * Simple Tool Creation Functions
 * Replaces complex factory patterns with functional composition
 */

import type { Logger } from 'pino';
import type { Tool } from '../../../types/tools.js';

/**
 * Tool configuration for enhancement
 */
export interface ToolConfig {
  enableAIValidation?: boolean;
  enableMetrics?: boolean;
  enableRetry?: boolean;
  retryAttempts?: number;
}

export interface ToolConfigWithDefaults {
  repositoryPath: string;
  samplingEnvironment: 'development' | 'test' | 'production';
  enableSampling: boolean;
  enableGates: boolean;
  enableScoring: boolean;
  enableRemediation: boolean;
  securityLevel: 'basic' | 'enhanced' | 'strict';
  maxRemediationAttempts: number;
  enableAIValidation: boolean;
}

/**
 * Add logging to a tool using functional composition
 */
export const withLogging =
  (logger: Logger) =>
  <T extends Tool>(tool: T): T => ({
    ...tool,
    async execute(params: any, toolLogger: Logger) {
      const startTime = Date.now();
      logger.info({ tool: tool.name, params }, 'Tool execution started');

      try {
        const result = await tool.execute(params, toolLogger);
        const success = result && typeof result === 'object' && 'ok' in result ? result.ok : true;
        logger.info(
          {
            tool: tool.name,
            duration: Date.now() - startTime,
            success,
          },
          'Tool execution completed',
        );
        return result;
      } catch (error) {
        logger.error({ tool: tool.name, error }, 'Tool execution failed');
        throw error;
      }
    },
  });

/**
 * Add metrics collection to a tool
 */
export const withMetrics =
  (metricsCollector?: any) =>
  <T extends Tool>(tool: T): T => {
    if (!metricsCollector) return tool;

    return {
      ...tool,
      async execute(params: any, logger: Logger) {
        const startTime = Date.now();
        try {
          const result = await tool.execute(params, logger);
          const success = result && typeof result === 'object' && 'ok' in result ? result.ok : true;
          metricsCollector.recordExecution(tool.name, Date.now() - startTime, success);
          return result;
        } catch (error) {
          metricsCollector.recordExecution(tool.name, Date.now() - startTime, false);
          throw error;
        }
      },
    };
  };

/**
 * Add retry capability to a tool
 */
export const withRetry =
  (attempts: number = 3) =>
  <T extends Tool>(tool: T): T => ({
    ...tool,
    async execute(params: any, logger: Logger) {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await tool.execute(params, logger);
        } catch (error) {
          lastError = error as Error;
          if (attempt < attempts) {
            logger.warn({ tool: tool.name, attempt, error }, 'Tool execution failed, retrying');
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      throw lastError;
    },
  });

/**
 * Create an enhanced tool using functional composition
 */
export const createIntelligentTool = <T extends Tool>(
  baseTool: T,
  config: ToolConfig & { logger: Logger; metricsCollector?: any } = { logger: console as any },
): T => {
  let result = baseTool;

  // Apply enhancements in sequence
  result = withLogging(config.logger)(result);

  if (config.enableMetrics) {
    result = withMetrics(config.metricsCollector)(result);
  }

  if (config.enableRetry) {
    result = withRetry(config.retryAttempts)(result);
  }

  return result;
};

/**
 * Create workflow configuration - Simple object creation
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
): ToolConfigWithDefaults => {
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
