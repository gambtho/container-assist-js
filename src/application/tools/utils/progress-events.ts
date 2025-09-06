/**
 * Progress Event Utilities - Team Delta Implementation
 *
 * Standardized progress reporting for MCP tools with integration into MCP SDK's
 * built-in progress notification system.
 */

import type { Logger } from 'pino';
import type { ProgressReporter } from '../interfaces';

/**
 * Progress step definition
 */
export interface ProgressStep {
  name: string;
  description: string;
  weight: number; // Relative weight for progress calculation
  estimatedDurationMs?: number;
}

/**
 * Progress state tracking
 */
export interface ProgressState {
  toolName: string;
  sessionId: string;
  totalSteps: number;
  completedSteps: number;
  currentStep: string | undefined;
  currentStepProgress: number;
  overallProgress: number;
  startTime: Date;
  estimatedCompletionTime?: Date;
  subtasks: Map<string, number>;
}

/**
 * Progress reporter implementation with MCP integration
 */
export class ProgressReporterImpl implements ProgressReporter {
  private state: ProgressState;
  private steps: ProgressStep[];
  private currentStepIndex = -1;

  constructor(
    private logger: Logger,
    private toolName: string,
    private sessionId: string,
    steps: ProgressStep[] = [],
    private mcpProgressToken?: string,
  ) {
    this.steps = steps;
    this.state = {
      toolName,
      sessionId,
      totalSteps: steps.length,
      completedSteps: 0,
      currentStepProgress: 0,
      overallProgress: 0,
      startTime: new Date(),
      subtasks: new Map(),
    };
  }

  /**
   * Report progress for current step
   */
  reportProgress(step: string, percentage: number, message?: string): void {
    this.updateCurrentStep(step, percentage);
    this.calculateOverallProgress();

    const progressData = {
      toolName: this.toolName,
      sessionId: this.sessionId,
      step,
      percentage: Math.min(100, Math.max(0, percentage)),
      message,
      overallProgress: this.state.overallProgress,
      currentStepIndex: this.currentStepIndex,
      totalSteps: this.state.totalSteps,
    };

    this.logger.info(progressData, 'Tool progress update');

    // Emit MCP progress notification if token available
    if (this.mcpProgressToken) {
      this.emitMCPProgress(progressData);
    }
  }

  /**
   * Report step completion
   */
  reportComplete(summary: string): void {
    this.state.completedSteps = this.state.totalSteps;
    this.state.overallProgress = 100;
    this.state.currentStep = undefined;

    const completionData = {
      toolName: this.toolName,
      sessionId: this.sessionId,
      summary,
      totalDurationMs: Date.now() - this.state.startTime.getTime(),
      overallProgress: 100,
    };

    this.logger.info(completionData, 'Tool execution completed');

    // Emit MCP completion notification
    if (this.mcpProgressToken) {
      this.emitMCPCompletion(completionData);
    }
  }

  /**
   * Report error
   */
  reportError(error: string, recoverable: boolean): void {
    const errorData = {
      toolName: this.toolName,
      sessionId: this.sessionId,
      error,
      recoverable,
      currentStep: this.state.currentStep,
      overallProgress: this.state.overallProgress,
      durationMs: Date.now() - this.state.startTime.getTime(),
    };

    this.logger.error(errorData, 'Tool execution error');

    // Emit MCP error notification
    if (this.mcpProgressToken) {
      this.emitMCPError(errorData);
    }
  }

  /**
   * Report subtask progress
   */
  reportSubtask(subtaskName: string, progress: number): void {
    this.state.subtasks.set(subtaskName, progress);

    const subtaskData = {
      toolName: this.toolName,
      sessionId: this.sessionId,
      subtaskName,
      progress,
      currentStep: this.state.currentStep,
    };

    this.logger.debug(subtaskData, 'Subtask progress update');
  }

  /**
   * Get current progress state
   */
  getState(): Readonly<ProgressState> {
    return { ...this.state };
  }

  /**
   * Advance to next predefined step
   */
  advanceToNextStep(): void {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      const step = this.steps[this.currentStepIndex];
      if (step) {
        this.state.currentStep = step.name;
      }
      this.state.currentStepProgress = 0;

      this.logger.debug(
        {
          toolName: this.toolName,
          stepName: step?.name,
          stepIndex: this.currentStepIndex,
        },
        'Advanced to next step',
      );
    }
  }

  /**
   * Update estimated completion time
   */
  updateEstimatedCompletion(): void {
    if (this.state.overallProgress > 0) {
      const elapsed = Date.now() - this.state.startTime.getTime();
      const estimatedTotal = (elapsed / this.state.overallProgress) * 100;
      const remaining = estimatedTotal - elapsed;

      this.state.estimatedCompletionTime = new Date(Date.now() + remaining);
    }
  }

  private updateCurrentStep(stepName: string, percentage: number): void {
    // Find step index if not already set
    if (this.state.currentStep !== stepName) {
      const stepIndex = this.steps.findIndex((s) => s.name === stepName);
      if (stepIndex >= 0) {
        this.currentStepIndex = stepIndex;
        this.state.completedSteps = stepIndex;
      }
      this.state.currentStep = stepName;
    }

    this.state.currentStepProgress = Math.min(100, Math.max(0, percentage));
    this.updateEstimatedCompletion();
  }

  private calculateOverallProgress(): void {
    if (this.steps.length === 0) {
      this.state.overallProgress = this.state.currentStepProgress;
      return;
    }

    const totalWeight = this.steps.reduce((sum, step) => sum + step.weight, 0);
    let completedWeight = 0;

    // Add weight for completed steps
    for (let i = 0; i < this.state.completedSteps && i < this.steps.length; i++) {
      const step = this.steps[i];
      if (step) {
        completedWeight += step.weight;
      }
    }

    // Add partial weight for current step
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      if (currentStep) {
        const currentStepWeight = currentStep.weight;
        completedWeight += (currentStepWeight * this.state.currentStepProgress) / 100;
      }
    }

    this.state.overallProgress = totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;
  }

  private emitMCPProgress(data: Record<string, unknown>): void {
    // TODO: Integrate with actual MCP SDK progress notifications
    // For now, this is a placeholder for the MCP progress emission
    this.logger.debug(
      { mcpProgressToken: this.mcpProgressToken, ...data },
      'MCP progress notification',
    );
  }

  private emitMCPCompletion(data: Record<string, unknown>): void {
    // TODO: Integrate with actual MCP SDK completion notifications
    this.logger.debug(
      { mcpProgressToken: this.mcpProgressToken, ...data },
      'MCP completion notification',
    );
  }

  private emitMCPError(data: Record<string, unknown>): void {
    // TODO: Integrate with actual MCP SDK error notifications
    this.logger.debug(
      { mcpProgressToken: this.mcpProgressToken, ...data },
      'MCP error notification',
    );
  }
}

/**
 * Predefined progress step templates for common tool operations
 */
export const PROGRESS_TEMPLATES = {
  ANALYZE_REPOSITORY: [
    { name: 'validate_path', description: 'Validating repository path', weight: 5 },
    { name: 'detect_language', description: 'Detecting programming language', weight: 15 },
    { name: 'analyze_dependencies', description: 'Analyzing dependencies', weight: 25 },
    { name: 'detect_framework', description: 'Detecting framework', weight: 20 },
    { name: 'analyze_structure', description: 'Analyzing project structure', weight: 20 },
    { name: 'generate_recommendations', description: 'Generating recommendations', weight: 15 },
  ],

  GENERATE_DOCKERFILE: [
    { name: 'load_analysis', description: 'Loading repository analysis', weight: 10 },
    { name: 'generate_candidates', description: 'Generating Dockerfile candidates', weight: 40 },
    { name: 'score_candidates', description: 'Scoring candidates', weight: 25 },
    { name: 'select_winner', description: 'Selecting best candidate', weight: 10 },
    { name: 'write_file', description: 'Writing Dockerfile to disk', weight: 15 },
  ],

  BUILD_IMAGE: [
    { name: 'prepare_context', description: 'Preparing build context', weight: 10 },
    { name: 'validate_dockerfile', description: 'Validating Dockerfile', weight: 15 },
    { name: 'start_build', description: 'Starting Docker build', weight: 5 },
    { name: 'build_image', description: 'Building Docker image', weight: 60 },
    { name: 'tag_image', description: 'Tagging image', weight: 5 },
    { name: 'analyze_security', description: 'Analyzing build security', weight: 5 },
  ],

  SCAN_IMAGE: [
    { name: 'prepare_scanner', description: 'Preparing security scanner', weight: 10 },
    { name: 'scan_vulnerabilities', description: 'Scanning for vulnerabilities', weight: 70 },
    { name: 'analyze_results', description: 'Analyzing scan results', weight: 15 },
    { name: 'generate_report', description: 'Generating security report', weight: 5 },
  ],

  GENERATE_K8S_MANIFESTS: [
    { name: 'load_build_info', description: 'Loading build information', weight: 10 },
    { name: 'generate_candidates', description: 'Generating manifest candidates', weight: 40 },
    { name: 'validate_manifests', description: 'Validating Kubernetes manifests', weight: 25 },
    { name: 'select_winner', description: 'Selecting best manifest', weight: 15 },
    { name: 'write_files', description: 'Writing manifest files', weight: 10 },
  ],

  DEPLOY_APPLICATION: [
    { name: 'prepare_manifests', description: 'Preparing deployment manifests', weight: 10 },
    { name: 'validate_cluster', description: 'Validating cluster connection', weight: 15 },
    { name: 'apply_manifests', description: 'Applying Kubernetes manifests', weight: 40 },
    { name: 'wait_for_rollout', description: 'Waiting for deployment rollout', weight: 30 },
    { name: 'verify_health', description: 'Verifying application health', weight: 5 },
  ],
} as const;

/**
 * Factory function for creating progress reporters
 */
export function createProgressReporter(
  logger: Logger,
  toolName: string,
  sessionId: string,
  template?: keyof typeof PROGRESS_TEMPLATES,
  mcpProgressToken?: string,
): ProgressReporter {
  const steps = template ? [...PROGRESS_TEMPLATES[template]] : [];
  return new ProgressReporterImpl(logger, toolName, sessionId, steps, mcpProgressToken);
}

/**
 * Progress aggregator for tracking multiple concurrent tool executions
 */
export class ProgressAggregator {
  private reporters = new Map<string, ProgressReporterImpl>();

  constructor(private logger: Logger) {}

  addTool(toolId: string, reporter: ProgressReporterImpl): void {
    this.reporters.set(toolId, reporter);
  }

  removeTool(toolId: string): void {
    this.reporters.delete(toolId);
  }

  getOverallProgress(): number {
    if (this.reporters.size === 0) return 0;

    const totalProgress = Array.from(this.reporters.values()).reduce(
      (sum, reporter) => sum + reporter.getState().overallProgress,
      0,
    );

    return totalProgress / this.reporters.size;
  }

  getActiveTools(): string[] {
    return Array.from(this.reporters.keys());
  }

  getToolProgress(toolId: string): ProgressState | undefined {
    const reporter = this.reporters.get(toolId);
    return reporter?.getState();
  }
}
