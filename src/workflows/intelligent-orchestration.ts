import { Success, Failure, type Result } from '@types';
import type { Logger } from 'pino';
import type { ProgressReporter } from '@mcp/server/middleware';

type WorkflowStep = {
  toolName: string;
  parameters: any;
  description?: string;
  required?: boolean;
  condition?: (previousResults: any[]) => boolean;
};

type WorkflowContext = {
  sessionId?: string;
  progressReporter?: ProgressReporter;
  signal?: AbortSignal;
  logger: Logger;
};

type WorkflowResult = {
  workflowType: string;
  completedSteps: string[];
  results: any[];
  sessionId?: string | undefined;
  recommendations: string[];
  executionTime: number;
  metadata?: any;
};

/**
 * Plans workflow steps based on type and session state.
 * Skips already completed steps when resuming workflows.
 *
 * @param workflowType - The type of workflow to plan ('containerization', 'deployment', 'security')
 * @param params - Workflow parameters including optional flags for build, scan, and push
 * @param sessionId - Optional session identifier for resuming workflows
 * @param sessionManager - Manager for tracking workflow session state
 * @returns Array of workflow steps to execute
 */
const planWorkflowSteps = async (
  workflowType: string,
  params: any,
  sessionId: string | undefined,
  sessionManager: any,
): Promise<WorkflowStep[]> => {
  const sessionState = sessionId ? await sessionManager.getState(sessionId) : undefined;

  if (workflowType === 'containerization') {
    const steps: WorkflowStep[] = [];

    if (!sessionState?.completed_steps?.includes('analyze-repo')) {
      steps.push({
        toolName: 'analyze-repo',
        parameters: { ...params, sessionId },
        description: 'Analyzing repository structure and dependencies',
        required: true,
      });
    }

    steps.push({
      toolName: 'generate-dockerfile',
      parameters: { ...params, sessionId },
      description: 'Generating optimized Dockerfile',
      required: true,
    });

    if (params.buildImage !== false) {
      steps.push({
        toolName: 'build-image',
        parameters: { ...params, sessionId },
        description: 'Building Docker image',
        required: false,
      });

      if (params.scanImage !== false) {
        steps.push({
          toolName: 'scan',
          parameters: { ...params, sessionId },
          description: 'Scanning image for vulnerabilities',
          required: false,
          condition: (results) => results[results.length - 1]?.imageId !== undefined,
        });
      }

      if (params.pushImage && params.registry) {
        steps.push({
          toolName: 'push',
          parameters: { ...params, sessionId },
          description: 'Pushing image to registry',
          required: false,
          condition: (results) => results[results.length - 1]?.imageId !== undefined,
        });
      }
    }

    return steps;
  }

  if (workflowType === 'deployment') {
    return [
      {
        toolName: 'generate-k8s-manifests',
        parameters: { ...params, sessionId },
        description: 'Generating Kubernetes manifests',
        required: true,
      },
      {
        toolName: 'prepare-cluster',
        parameters: { ...params, sessionId },
        description: 'Preparing cluster for deployment',
        required: true,
      },
      {
        toolName: 'deploy',
        parameters: { ...params, sessionId },
        description: 'Deploying application to cluster',
        required: true,
      },
      {
        toolName: 'verify-deployment',
        parameters: { ...params, sessionId },
        description: 'Verifying deployment health',
        required: false,
      },
    ];
  }

  if (workflowType === 'security') {
    return [
      {
        toolName: 'analyze-repo',
        parameters: { ...params, sessionId, detectSecrets: true },
        description: 'Analyzing repository for security issues',
        required: true,
      },
      {
        toolName: 'scan',
        parameters: { ...params, sessionId, severity: 'MEDIUM' },
        description: 'Scanning for vulnerabilities',
        required: true,
      },
      {
        toolName: 'fix-dockerfile',
        parameters: { ...params, sessionId },
        description: 'Fixing security issues in Dockerfile',
        required: false,
        condition: (results) => results.some((r) => r.vulnerabilities?.length > 0),
      },
    ];
  }

  // Optimization workflow
  if (workflowType === 'optimization') {
    return [
      {
        toolName: 'analyze-repo',
        parameters: { ...params, sessionId },
        description: 'Analyzing repository',
        required: true,
      },
      {
        toolName: 'resolve-base-images',
        parameters: { ...params, sessionId },
        description: 'Resolving optimal base images',
        required: true,
      },
      {
        toolName: 'generate-dockerfile',
        parameters: { ...params, sessionId, optimizationLevel: 'aggressive' },
        description: 'Generating optimized Dockerfile',
        required: true,
      },
      {
        toolName: 'build-image',
        parameters: { ...params, sessionId },
        description: 'Building optimized image',
        required: false,
      },
    ];
  }

  return [];
};

const executeWorkflowStep = async (
  step: WorkflowStep,
  toolFactory: any,
  context: WorkflowContext,
  previousResults: any[],
): Promise<Result<any>> => {
  const { logger } = context;

  // Check step condition
  if (step.condition && !step.condition(previousResults)) {
    logger.info({ step: step.toolName }, 'Skipping step due to condition');
    return Success({ skipped: true, reason: 'Condition not met' });
  }

  // Get tool from factory
  const tool = toolFactory.getTool
    ? toolFactory.getTool(step.toolName)
    : toolFactory[step.toolName];

  if (!tool) {
    return Failure(`Tool not found: ${step.toolName}`);
  }

  // Execute with enhanced context if available
  if (tool.executeEnhanced) {
    return tool.executeEnhanced(step.parameters, context);
  }

  // Fallback to standard execution
  return tool.execute(step.parameters, logger);
};

const generateWorkflowRecommendations = (workflowType: string, results: any[]): string[] => {
  const recommendations: string[] = [];

  // General recommendations
  recommendations.push('Review generated artifacts for accuracy');
  recommendations.push('Test container functionality before production deployment');

  // Workflow-specific recommendations
  if (workflowType === 'containerization') {
    if (results.some((r) => r.vulnerabilities?.length > 0)) {
      recommendations.push('Address security vulnerabilities before deployment');
    }
    recommendations.push('Configure CI/CD pipeline for automated builds');
  }

  if (workflowType === 'deployment') {
    recommendations.push('Monitor deployment health metrics');
    recommendations.push('Set up alerts for critical issues');
    recommendations.push('Configure autoscaling based on load patterns');
  }

  if (workflowType === 'security') {
    recommendations.push('Enable security scanning in CI/CD pipeline');
    recommendations.push('Regularly update base images and dependencies');
    recommendations.push('Implement runtime security monitoring');
  }

  if (workflowType === 'optimization') {
    const imageSizes = results.filter((r) => r.imageSize).map((r) => r.imageSize);
    if (imageSizes.length > 1) {
      const reduction = ((imageSizes[0] - imageSizes[imageSizes.length - 1]) / imageSizes[0]) * 100;
      recommendations.push(`Image size reduced by ${reduction.toFixed(1)}% through optimization`);
    }
    recommendations.push('Consider using distroless images for further size reduction');
  }

  return recommendations;
};

const updateSessionWithWorkflowProgress = async (
  sessionId: string,
  sessionManager: any,
  step: number,
  totalSteps: number,
  stepName: string,
  result: any,
): Promise<void> => {
  await sessionManager.updateWorkflowProgress(sessionId, {
    step,
    totalSteps,
    currentStep: stepName,
    result,
    timestamp: new Date().toISOString(),
  });

  // Store completed step
  await sessionManager.addCompletedStep(sessionId, stepName);

  // Store result if significant
  if (result && !result.skipped) {
    await sessionManager.storeStepResult(sessionId, stepName, result);
  }
};

/**
 * Execute a workflow with intelligent orchestration
 */
export const executeWorkflow = async (
  workflowType: string,
  params: any,
  context: WorkflowContext,
  toolFactory: any,
  aiService?: any,
  sessionManager?: any,
): Promise<Result<WorkflowResult>> => {
  const { sessionId, progressReporter, signal, logger } = context;
  const startTime = Date.now();

  try {
    // Validate workflow type
    const validWorkflows = ['containerization', 'deployment', 'security', 'optimization'];
    if (!validWorkflows.includes(workflowType)) {
      return Failure(
        `Invalid workflow type: ${workflowType}. Valid types: ${validWorkflows.join(', ')}`,
      );
    }

    // Plan workflow steps
    void progressReporter?.({ progress: 5, message: 'Planning workflow steps...' });
    const steps = await planWorkflowSteps(workflowType, params, sessionId, sessionManager);

    if (steps.length === 0) {
      return Failure(`No steps planned for workflow: ${workflowType}`);
    }

    logger.info(
      {
        workflowType,
        stepCount: steps.length,
        steps: steps.map((s) => s.toolName),
      },
      'Workflow execution started',
    );

    const results: any[] = [];
    const completedSteps: string[] = [];

    // Execute each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      const progressPercent = 10 + (i / steps.length) * 80;

      void progressReporter?.({
        progress: progressPercent,
        message: step.description || `Executing ${step.toolName}...`,
      });

      // Check for cancellation
      if (signal?.aborted) {
        logger.info({ workflowType, completedSteps }, 'Workflow cancelled by user');
        return Failure('Workflow cancelled by user');
      }

      // Execute step with context
      const stepResult = await executeWorkflowStep(
        step,
        toolFactory,
        {
          sessionId: sessionId || 'default',
          signal: signal || new AbortController().signal,
          logger: logger.child({ step: step.toolName }),
          progressReporter: async (progress) => {
            await progressReporter?.({
              progress: progressPercent + (progress.progress * 0.8) / steps.length,
              message: progress.message,
              total: progress.total,
            });
          },
        } as WorkflowContext,
        results,
      );

      if (!stepResult.ok) {
        if (step.required) {
          // Required step failed - abort workflow
          const error = `Required step ${i + 1} (${step.toolName}) failed: ${stepResult.error}`;
          logger.error({ step: step.toolName, error: stepResult.error }, 'Workflow step failed');

          const suggestions = [
            'Review error message and fix the issue',
            'Check input parameters are correct',
            'Verify prerequisites are met',
            sessionId ? 'Review session state for conflicts' : null,
          ].filter(Boolean);

          return Failure(`${error}\n\nRecovery options:\n- ${suggestions.join('\n- ')}`);
        } else {
          // Optional step failed - log and continue
          logger.warn(
            { step: step.toolName, error: stepResult.error },
            'Optional step failed, continuing',
          );
          results.push({ error: stepResult.error, stepName: step.toolName });
        }
      } else {
        results.push(stepResult.value);

        if (!stepResult.value.skipped) {
          completedSteps.push(step.toolName);
        }
      }

      // Update session state if available
      if (sessionId && sessionManager) {
        await updateSessionWithWorkflowProgress(
          sessionId,
          sessionManager,
          i + 1,
          steps.length,
          step.toolName,
          stepResult.ok ? stepResult.value : { error: stepResult.error },
        );
      }
    }

    void progressReporter?.({ progress: 95, message: 'Finalizing workflow...' });

    // Get final session state for recommendations
    const finalSessionState =
      sessionId && sessionManager ? await sessionManager.getState(sessionId) : undefined;

    // Generate recommendations
    const recommendations = generateWorkflowRecommendations(workflowType, results);

    // Add AI insights if available
    if (aiService && sessionId) {
      const aiAnalysis = await aiService.analyzeResults({
        toolName: 'workflow',
        parameters: { workflowType, ...params },
        result: { completedSteps, results },
        sessionId,
        context: finalSessionState,
      });

      if (aiAnalysis.ok && aiAnalysis.value.nextSteps) {
        recommendations.push(...aiAnalysis.value.nextSteps);
      }
    }

    const executionTime = Date.now() - startTime;

    // Generate workflow summary
    const summary: WorkflowResult = {
      workflowType,
      completedSteps,
      results,
      sessionId,
      recommendations: [...new Set(recommendations)], // Remove duplicates
      executionTime,
      metadata: {
        totalSteps: steps.length,
        successfulSteps: completedSteps.length,
        skippedSteps: results.filter((r) => r.skipped).length,
        failedSteps: results.filter((r) => r.error).length,
        aiEnhanced: !!aiService,
        sessionTracked: !!sessionId,
      },
    };

    void progressReporter?.({ progress: 100, message: 'Workflow complete' });

    logger.info(
      {
        workflowType,
        executionTime,
        completedSteps: completedSteps.length,
        totalSteps: steps.length,
      },
      'Workflow execution completed',
    );

    return Success(summary);
  } catch (error: unknown) {
    logger.error({ error, workflowType }, 'Workflow execution failed');
    const message = error instanceof Error ? error.message : String(error);
    return Failure(`Workflow execution failed: ${message}`);
  }
};

// Create a basic orchestrator for compatibility
export function createMCPAIOrchestrator(logger: Logger, _options?: any) {
  return {
    execute: executeWorkflow,
    validateParameters: async (_toolName: string, _params: any, _context?: any) =>
      Success({ isValid: true, errors: [], warnings: [] }),
    logger,
  };
}

export interface MCPAIOrchestrator {
  execute: typeof executeWorkflow;
  validateParameters: (
    toolName: string,
    params: any,
    context?: any,
  ) => Promise<Result<{ isValid: boolean; errors: string[]; warnings: string[] }>>;
  logger: Logger;
}

// Export types
export type { WorkflowStep, WorkflowContext, WorkflowResult };
