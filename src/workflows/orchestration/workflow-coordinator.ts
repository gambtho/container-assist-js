/**
 * Simple Workflow Functions - Direct function calls replacing coordinator pattern
 * Eliminates unnecessary wrapper class and delegation
 */

import { Result } from '@types';
import type { Logger } from 'pino';
import {
  runContainerizationWorkflow,
  runBuildOnlyWorkflow,
  type ContainerizationConfig as ContainerizationWorkflowConfig,
} from '@workflows/containerization-workflow';
import {
  executeWorkflow as executeIntelligentWorkflow,
  type WorkflowContext,
} from '@workflows/intelligent-orchestration';

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
): Promise<Result<any>> => {
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
): Promise<Result<any>> => {
  return runBuildOnlyWorkflow(repositoryPath, logger, config);
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
  config?: Partial<
    ContainerizationWorkflowConfig & { toolFactory?: any; aiService?: any; sessionManager?: any }
  >,
): Promise<Result<any>> => {
  const context: WorkflowContext = {
    sessionId: (config as any)?.sessionId,
    logger,
  };

  const params = {
    repoPath: repositoryPath,
    ...config,
  };

  return executeIntelligentWorkflow(workflowType, params, context, config?.toolFactory);
};

/**
 * Execute deployment workflow - direct function
 */
export const executeDeploymentWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<any>> => {
  return executeWorkflow(repositoryPath, 'deployment', logger, config);
};

/**
 * Execute security workflow - direct function
 */
export const executeSecurityWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<any>> => {
  return executeWorkflow(repositoryPath, 'security', logger, config);
};

/**
 * Execute optimization workflow - direct function
 */
export const executeOptimizationWorkflow = async (
  repositoryPath: string,
  logger: Logger,
  config?: Partial<ContainerizationWorkflowConfig>,
): Promise<Result<any>> => {
  return executeWorkflow(repositoryPath, 'optimization', logger, config);
};
