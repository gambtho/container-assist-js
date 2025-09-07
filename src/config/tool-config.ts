/**
 * Simple Tool Configuration - De-Enterprise Refactoring
 *
 * Replaces complex Zod schemas and dynamic config manager with
 * simple environment variable based configuration.
 */

export interface ToolConfig {
  timeout: number;
  retries: number;
  enabled: boolean;
}

/**
 * Validate a number from environment variable with bounds checking
 */
const validateNumber = (val: string, min: number, max: number, defaultVal: number): number => {
  const num = parseInt(val, 10);
  return isNaN(num) || num < min || num > max ? defaultVal : num;
};

/**
 * Get tool configuration from environment variables
 */
export const getToolConfig = (toolName: string): ToolConfig => {
  const upperToolName = toolName.toUpperCase().replace(/-/g, '_');

  return {
    timeout: validateNumber(
      process.env[`${upperToolName}_TIMEOUT`] ?? '30000',
      1000,
      300000,
      30000,
    ),
    retries: validateNumber(process.env[`${upperToolName}_RETRIES`] ?? '3', 0, 10, 3),
    enabled: process.env[`${upperToolName}_ENABLED`] !== 'false',
  };
};

/**
 * Sampling configuration interface
 */
export interface SamplingConfig {
  maxCandidates: number;
  timeout: number;
}

/**
 * Get sampling configuration from environment variables
 */
export const getSamplingConfig = (): SamplingConfig => ({
  maxCandidates: validateNumber(process.env.MAX_CANDIDATES ?? '3', 1, 10, 3),
  timeout: validateNumber(process.env.SAMPLING_TIMEOUT ?? '30000', 1000, 300000, 30000),
});

/**
 * Simple health check - just verify the tool is enabled
 */
export const isToolHealthy = (toolName: string): boolean => {
  return getToolConfig(toolName).enabled;
};
