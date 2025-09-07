/**
 * Simple Workflow Functions - Direct function calls replacing coordinator pattern
 * Eliminates unnecessary wrapper class and delegation
 */

import { Result } from '../../types/core.js';
import type { Logger } from 'pino';
import {
  runContainerizationWorkflow,
  runBuildOnlyWorkflow,
  type WorkflowConfig as SimpleWorkflowConfig,
} from '../containerization-workflow.js';
import { createIntelligentOrchestrator, type WorkflowContext } from '../intelligent-orchestration.js';

/**
 * Unified WorkflowCoordinator - supports both simple and enhanced workflows
 */
export class WorkflowCoordinator {
  private intelligentOrchestrator: any;

  constructor(private logger: Logger) {
    this.logger.info('Unified WorkflowCoordinator initialized');
    // Initialize with minimal dependencies for enhanced workflows
    this.intelligentOrchestrator = createIntelligentOrchestrator(
      null, // toolFactory - will be passed in context
      null, // aiService - optional
      null, // sessionManager - optional
      logger,
    );
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
   * Execute enhanced containerization workflow with intelligent orchestration
   */
  async executeEnhancedWorkflow(
    repositoryPath: string,
    config?: Partial<SimpleWorkflowConfig>,
  ): Promise<Result<any>> {
    const context: WorkflowContext = {
      sessionId: config?.sessionId,
      logger: this.logger,
    };

    const params = {
      repoPath: repositoryPath,
      ...config,
    };

    return this.intelligentOrchestrator.executeWorkflow('containerization', params, context);
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
   * Execute enhanced build-only workflow with intelligent orchestration
   */
  async executeEnhancedBuildWorkflow(
    repositoryPath: string,
    config?: Partial<SimpleWorkflowConfig>,
  ): Promise<Result<any>> {
    const context: WorkflowContext = {
      sessionId: config?.sessionId,
      logger: this.logger,
    };

    const params = {
      repoPath: repositoryPath,
      buildImage: true,
      pushImage: false,
      scanImage: false,
      ...config,
    };

    return this.intelligentOrchestrator.executeWorkflow('optimization', params, context);
  }
}

/**
 * Factory function for creating simple coordinator
 */
export const createSimpleWorkflowCoordinator = (logger: Logger): WorkflowCoordinator => {
  return new WorkflowCoordinator(logger);
};
