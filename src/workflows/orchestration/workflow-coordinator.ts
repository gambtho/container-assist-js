/**
 * Simple Workflow Functions - Direct function calls replacing coordinator pattern
 * Eliminates unnecessary wrapper class and delegation
 */

import { Result, Success, type Tool } from '@types';
import type { Logger } from 'pino';
import {
  runContainerizationWorkflow,
  runBuildOnlyWorkflow,
  type ContainerizationConfig as ContainerizationWorkflowConfig,
  type ContainerizationResult,
} from '@workflows/containerization-workflow';
import {
  executeWorkflow as executeIntelligentWorkflow,
  type WorkflowContext,
  type WorkflowResult,
} from '@workflows/intelligent-orchestration';

interface EnhancedWorkflowConfig extends ContainerizationWorkflowConfig {
  toolFactory?: {
    getTool?: (toolName: string) => Tool;
    [key: string]: Tool | ((toolName: string) => Tool) | undefined;
  };
  aiService?: Record<string, unknown>;
  sessionManager?: Record<string, unknown>;
  sessionId?: string;
}

/**
 * Execute containerization workflow for a repository
 * @param repositoryPath - Path to the repository to containerize
 * @param logger - Logger instance for workflow execution
 * @param config - Optional workflow configuration
 * @returns Promise resolving to workflow execution result
 */
export const executeBasicContainerizationWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<ContainerizationResult>> => {
  return runContainerizationWorkflow(repositoryPath, logger, config);
};

/**
 * Execute build-only workflow for a repository
 * @param repositoryPath - Path to the repository to build
 * @param logger - Logger instance for workflow execution
 * @param config - Optional workflow configuration
 * @returns Promise resolving to build workflow execution result
 */
export const executeBuildWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<ContainerizationResult>> => {
  const result = await runBuildOnlyWorkflow(repositoryPath, logger, config);
  if (!result.ok) {
    return result as Result<ContainerizationResult>;
  }

  // Convert the build-only result to ContainerizationResult format
  return Success({
    ok: true,
    imageId: result.value.imageId,
    duration: result.value.duration,
  });
};

/**
 * Execute enhanced workflow using intelligent orchestration
 * @param repositoryPath - Path to the repository
 * @param workflowType - Type of workflow to execute (e.g., 'deployment', 'security')
 * @param logger - Logger instance for workflow execution
 * @param config - Optional workflow configuration with AI service and session management
 * @returns Promise resolving to enhanced workflow execution result
 */
export const executeWorkflow = async (
  repositoryPath: string,
  workflowType: string,
  logger: Logger,
  config?: Partial<EnhancedWorkflowConfig>,
): Promise<Result<WorkflowResult>> => {
  const context: WorkflowContext = {
    ...(config?.sessionId ? { sessionId: config.sessionId } : {}),
    logger,
  };

  const params = {
    repoPath: repositoryPath,
    ...config,
  };

  return executeIntelligentWorkflow(
    workflowType,
    params,
    context,
    (config?.toolFactory ?? {}) as {
      getTool?: (toolName: string) => Tool;
      [key: string]: Tool | ((toolName: string) => Tool) | undefined;
    },
  );
};

/**
 * Execute deployment workflow - direct function
 */
export const executeDeploymentWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<WorkflowResult>> => {
  return executeWorkflow(repositoryPath, 'deployment', logger, config);
};

/**
 * Execute security workflow - direct function
 */
export const executeSecurityWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<WorkflowResult>> => {
  return executeWorkflow(repositoryPath, 'security', logger, config);
};

/**
 * Execute optimization workflow - direct function
 */
export const executeOptimizationWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<WorkflowResult>> => {
  return executeWorkflow(repositoryPath, 'optimization', logger, config);
};
