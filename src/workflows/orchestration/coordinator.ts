/**
 * Unified Workflow Coordinator - De-Enterprise Refactoring
 *
 * Combines WorkflowCoordinator + EnhancedWorkflowCoordinator functionality
 * using functional composition instead of inheritance.
 * Reduces from 337 + 48 lines to ~50 lines total.
 */

import { Result } from '../../types/core.js';
import type { Logger } from 'pino';
import {
  runContainerizationWorkflow,
  runBuildOnlyWorkflow,
  type WorkflowConfig as SimpleWorkflowConfig,
} from '../containerization-workflow.js';
import {
  runEnhancedWorkflow,
  runEnhancedBuildWorkflow,
  type EnhancedWorkflowConfig,
} from '../orchestrated-workflow.js';

/**
 * Unified WorkflowCoordinator - supports both simple and enhanced workflows
 */
export class WorkflowCoordinator {
  constructor(private logger: Logger) {
    this.logger.info('Unified WorkflowCoordinator initialized');
  }

  /**
   * Execute simple containerization workflow
   */
  async executeWorkflow(
    repositoryPath: string,
    config?: Partial<SimpleWorkflowConfig>,
  ): Promise<Result<any>> {
    return runContainerizationWorkflow(repositoryPath, this.logger, config);
  }

  /**
   * Execute enhanced containerization workflow with gates, scoring, and artifacts
   */
  async executeEnhancedWorkflow(
    repositoryPath: string,
    config?: Partial<EnhancedWorkflowConfig>,
  ): Promise<Result<any>> {
    return runEnhancedWorkflow(repositoryPath, this.logger, config);
  }

  /**
   * Execute simple build-only workflow
   */
  async executeBuildWorkflow(
    repositoryPath: string,
    config?: Partial<SimpleWorkflowConfig>,
  ): Promise<Result<any>> {
    return runBuildOnlyWorkflow(repositoryPath, this.logger, config);
  }

  /**
   * Execute enhanced build-only workflow
   */
  async executeEnhancedBuildWorkflow(
    repositoryPath: string,
    config?: Partial<EnhancedWorkflowConfig>,
  ): Promise<Result<any>> {
    return runEnhancedBuildWorkflow(repositoryPath, this.logger, config);
  }
}

/**
 * Factory function for creating simple coordinator
 */
export const createSimpleWorkflowCoordinator = (logger: Logger): WorkflowCoordinator => {
  return new WorkflowCoordinator(logger);
};
