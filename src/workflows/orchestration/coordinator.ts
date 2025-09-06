import { Result, Success, Failure } from '../../types/core.js';
import type { Logger } from 'pino';
import {
  WorkflowConfig,
  WorkflowResult,
  WorkflowStage,
  WorkflowMetrics,
  ResourceManager,
  ProgressNotifier,
  EnhancedTool,
  RecoveryStrategy,
  STAGE_TIMEOUTS,
  RETRY_CONFIGS,
} from './types.js';
import { SessionManager } from './session-manager.js';
import {
  createMockResourceManager,
  createMockProgressNotifier,
  createMockEnhancedTools,
  createMockRemediationTool,
  USE_MOCKS,
} from './mocks.js';
import {
  createRealResourceManager,
  createRealProgressNotifier,
  createDependencies,
  USE_REAL_IMPLEMENTATIONS,
} from './real-implementations.js';
import { createRealEnhancedTools } from './enhanced-tools.js';

export class WorkflowCoordinator {
  private resourceManager: ResourceManager;
  private progressNotifier: ProgressNotifier;
  private tools: Record<string, EnhancedTool>;
  private sessionManager: SessionManager;

  constructor(
    private logger: Logger,
    resourceManager?: ResourceManager,
    progressNotifier?: ProgressNotifier,
    tools?: Record<string, EnhancedTool>,
  ) {
    // Use provided implementations, real implementations, or fall back to mocks
    if (resourceManager && progressNotifier) {
      // Explicitly provided - use as-is
      this.resourceManager = resourceManager;
      this.progressNotifier = progressNotifier;
    } else if (USE_REAL_IMPLEMENTATIONS) {
      // Use real implementations from Team Alpha
      const dependencies = createDependencies(logger);
      this.resourceManager = dependencies.resourceManager || createMockResourceManager(logger);
      this.progressNotifier = dependencies.progressNotifier || createMockProgressNotifier(logger);
    } else {
      // Fall back to mocks for development
      this.resourceManager = resourceManager ?? createMockResourceManager(logger);
      this.progressNotifier = progressNotifier ?? createMockProgressNotifier(logger);
    }

    this.tools = tools ?? (USE_REAL_IMPLEMENTATIONS ? createRealEnhancedTools(logger) : createMockEnhancedTools(logger));
    this.sessionManager = new SessionManager(logger);

    // Add remediation tool if not present
    if (!this.tools.remediate_vulnerabilities) {
      this.tools.remediate_vulnerabilities = createMockRemediationTool(logger);
    }

    this.logger.info({
      usingRealImplementations: USE_REAL_IMPLEMENTATIONS,
      usingMocks: USE_MOCKS,
      availableTools: Object.keys(this.tools),
      resourceManagerType: this.resourceManager.constructor.name,
      progressNotifierType: this.progressNotifier.constructor.name,
    }, 'WorkflowCoordinator initialized');
  }

  async executeWorkflow(
    repositoryPath: string,
    config?: Partial<WorkflowConfig>,
  ): Promise<Result<WorkflowResult>> {
    const startTime = Date.now();

    // Create session
    const sessionResult = await this.sessionManager.createSession(
      { path: repositoryPath, name: this.extractRepoName(repositoryPath) },
      config,
    );

    if (!sessionResult.ok) {
      return Failure(`Failed to create session: ${sessionResult.error}`);
    }

    const session = sessionResult.value;
    const progressToken = `workflow_${session.id}`;

    this.logger.info({
      sessionId: session.id,
      repositoryPath,
      config: session.config,
    }, 'Starting workflow execution');

    try {
      // Initialize progress tracking
      this.progressNotifier.notifyProgress({
        token: progressToken,
        value: 0,
        message: 'Initializing workflow...',
      });

      const metrics: WorkflowMetrics = {
        totalDuration: 0,
        stageDurations: {} as Record<WorkflowStage, number>,
        retryCount: 0,
        artifactSizes: {},
      };

      // Execute workflow stages
      const stages = [
        WorkflowStage.ANALYSIS,
        WorkflowStage.DOCKERFILE_GENERATION,
        WorkflowStage.BUILD,
        WorkflowStage.SCAN,
        WorkflowStage.K8S_GENERATION,
        WorkflowStage.DEPLOYMENT,
        WorkflowStage.VERIFICATION,
      ];

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i]!;
        const stageProgress = ((i) / stages.length) * 100;

        this.progressNotifier.notifyProgress({
          token: progressToken,
          value: stageProgress,
          message: `Executing ${stage}...`,
        });

        const stageResult = await this.executeStage(session.id, stage);

        if (!stageResult.ok) {
          // Handle stage failure with recovery
          const recoveryResult = await this.handleStageFailure(
            session.id,
            stage,
            stageResult.error,
            progressToken,
          );

          if (!recoveryResult.ok) {
            // Workflow failed - cleanup and return
            await this.cleanupSession(session.id);

            this.progressNotifier.notifyError(
              progressToken,
              `Workflow failed at ${stage}: ${recoveryResult.error}`,
            );

            return Failure(`Workflow failed at ${stage}: ${recoveryResult.error}`);
          }

          metrics.retryCount++;
        }

        // Update stage completion
        await this.sessionManager.updateSessionState(session.id, stage, 'completed');
        if (stageResult.ok && stageResult.value) {
        metrics.stageDurations[stage] = stageResult.value.duration || 0;
      }
      }

      // Check for remediation requirement after scan
      const needsRemediation = await this.checkRemediationNeeded(session.id);
      if (needsRemediation) {
        this.logger.info({ sessionId: session.id }, 'Remediation required, executing remediation stage');

        const remediationResult = await this.executeStage(session.id, WorkflowStage.REMEDIATION);
        if (remediationResult.ok) {
          // Re-run scan after remediation
          await this.executeStage(session.id, WorkflowStage.SCAN);
        }
      }

      // Complete workflow
      const totalDuration = Date.now() - startTime;
      metrics.totalDuration = totalDuration;

      this.progressNotifier.notifyComplete(progressToken);

      // Get final artifacts
      const sessionFinal = await this.sessionManager.getSession(session.id);
      const finalArtifacts: Record<string, string> = {};

      if (sessionFinal.ok) {
        for (const [name, uri] of sessionFinal.value.artifacts) {
          finalArtifacts[name] = uri;
        }
      }

      const result: WorkflowResult = {
        sessionId: session.id,
        success: true,
        duration: totalDuration,
        completedStages: stages,
        finalArtifacts,
        metrics,
      };

      this.logger.info({
        sessionId: session.id,
        duration: totalDuration,
        stages: stages.length,
        retries: metrics.retryCount,
      }, 'Workflow completed successfully');

      return Success(result);

    } catch (error) {
      this.logger.error({
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      }, 'Workflow execution failed');

      this.progressNotifier.notifyError(progressToken, error instanceof Error ? error.message : String(error));
      await this.cleanupSession(session.id);

      return Failure(`Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeStage(sessionId: string, stage: WorkflowStage): Promise<Result<{ duration: number }>> {
    const stageStart = Date.now();

    this.logger.debug({ sessionId, stage }, 'Executing workflow stage');

    // Update session state
    await this.sessionManager.updateSessionState(sessionId, stage, 'started');

    try {
      let result: Result<any>;

      switch (stage) {
        case WorkflowStage.ANALYSIS:
          result = await this.executeAnalysis(sessionId);
          break;

        case WorkflowStage.DOCKERFILE_GENERATION:
          result = await this.executeDockerfileGeneration(sessionId);
          break;

        case WorkflowStage.BUILD:
          result = await this.executeBuild(sessionId);
          break;

        case WorkflowStage.SCAN:
          result = await this.executeScan(sessionId);
          break;

        case WorkflowStage.REMEDIATION:
          result = await this.executeRemediation(sessionId);
          break;

        case WorkflowStage.K8S_GENERATION:
          result = await this.executeK8sGeneration(sessionId);
          break;

        case WorkflowStage.DEPLOYMENT:
          result = await this.executeDeployment(sessionId);
          break;

        case WorkflowStage.VERIFICATION:
          result = await this.executeVerification(sessionId);
          break;

        default:
          return Failure(`Unknown stage: ${stage}`);
      }

      if (!result.ok) {
        await this.sessionManager.updateSessionState(sessionId, stage, 'failed');
        return Failure(result.error);
      }

      const duration = Date.now() - stageStart;

      this.logger.info({
        sessionId,
        stage,
        duration,
      }, 'Stage completed successfully');

      return Success({ duration });

    } catch (error) {
      await this.sessionManager.updateSessionState(sessionId, stage, 'failed');

      this.logger.error({
        sessionId,
        stage,
        error: error instanceof Error ? error.message : String(error),
      }, 'Stage execution failed');

      return Failure(`Stage ${stage} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeAnalysis(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.analyze_repository;
    if (!tool) {
      return Failure('analyze_repository tool not available');
    }

    const session = await this.sessionManager.getSession(sessionId);
    if (!session.ok) {
      return Failure(session.error);
    }

    const result = await tool.execute({
      repositoryPath: session.value.repository.path,
      sessionId,
    });

    if (result.ok && result.value.resources) {
      // Store analysis artifacts
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `analysis_${name}`, uri);
      }
    }

    return result;
  }

  private async executeDockerfileGeneration(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.generate_dockerfile;
    if (!tool) {
      return Failure('generate_dockerfile tool not available');
    }

    const session = await this.sessionManager.getSession(sessionId);
    if (!session.ok) {
      return Failure(session.error);
    }

    const result = await tool.execute({
      sessionId,
      useSampling: session.value.config.enableSampling,
      maxCandidates: session.value.config.maxCandidates,
    });

    if (result.ok && result.value.resources) {
      // Store dockerfile artifacts
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `dockerfile_${name}`, uri);
      }
    }

    return result;
  }

  private async executeBuild(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.build_image;
    if (!tool) {
      return Failure('build_image tool not available');
    }

    const result = await tool.execute({
      sessionId,
      timeout: STAGE_TIMEOUTS[WorkflowStage.BUILD],
    });

    if (result.ok && result.value.resources) {
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `build_${name}`, uri);
      }
    }

    return result;
  }

  private async executeScan(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.scan_image;
    if (!tool) {
      return Failure('scan_image tool not available');
    }

    const result = await tool.execute({
      sessionId,
      timeout: STAGE_TIMEOUTS[WorkflowStage.SCAN],
    });

    if (result.ok && result.value.resources) {
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `scan_${name}`, uri);
      }
    }

    return result;
  }

  private async executeRemediation(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.remediate_vulnerabilities;
    if (!tool) {
      return Failure('remediate_vulnerabilities tool not available');
    }

    const result = await tool.execute({
      sessionId,
      maxAttempts: 2,
    });

    if (result.ok && result.value.resources) {
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `remediation_${name}`, uri);
      }
    }

    return result;
  }

  private async executeK8sGeneration(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.generate_k8s_manifests;
    if (!tool) {
      return Failure('generate_k8s_manifests tool not available');
    }

    const session = await this.sessionManager.getSession(sessionId);
    if (!session.ok) {
      return Failure(session.error);
    }

    const result = await tool.execute({
      sessionId,
      useSampling: session.value.config.enableSampling,
      targetEnvironment: session.value.config.targetEnvironment,
      deploymentStrategy: session.value.config.deploymentStrategy,
    });

    if (result.ok && result.value.resources) {
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `k8s_${name}`, uri);
      }
    }

    return result;
  }

  private async executeDeployment(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.deploy_application;
    if (!tool) {
      return Failure('deploy_application tool not available');
    }

    const result = await tool.execute({
      sessionId,
      timeout: STAGE_TIMEOUTS[WorkflowStage.DEPLOYMENT],
    });

    if (result.ok && result.value.resources) {
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `deploy_${name}`, uri);
      }
    }

    return result;
  }

  private async executeVerification(sessionId: string): Promise<Result<any>> {
    const tool = this.tools.verify_deployment;
    if (!tool) {
      return Failure('verify_deployment tool not available');
    }

    const result = await tool.execute({
      sessionId,
      timeout: STAGE_TIMEOUTS[WorkflowStage.VERIFICATION],
    });

    if (result.ok && result.value.resources) {
      for (const [name, uri] of Object.entries(result.value.resources)) {
        await this.sessionManager.addSessionArtifact(sessionId, `verify_${name}`, uri);
      }
    }

    return result;
  }

  private async checkRemediationNeeded(sessionId: string): Promise<boolean> {
    // Check if scan results indicate remediation is needed
    const scanResults = await this.sessionManager.getSessionArtifact(sessionId, 'scan_report');
    if (!scanResults.ok) {
      return false;
    }

    // This would normally parse the scan results
    // For now, using mock logic
    return Math.random() > 0.7; // 30% chance of needing remediation
  }

  private async handleStageFailure(
    sessionId: string,
    stage: WorkflowStage,
    error: string,
    progressToken: string,
  ): Promise<Result<void>> {
    const retryConfig = RETRY_CONFIGS[stage];
    const session = await this.sessionManager.getSession(sessionId);

    if (!session.ok) {
      return Failure(session.error);
    }

    const currentRetries = session.value.state.retryCount[stage] || 0;

    this.logger.warn({
      sessionId,
      stage,
      error,
      currentRetries,
      maxAttempts: retryConfig.maxAttempts,
      strategy: retryConfig.strategy,
    }, 'Stage failed, attempting recovery');

    if (currentRetries >= retryConfig.maxAttempts) {
      return Failure(`Max retry attempts exceeded for stage ${stage}`);
    }

    switch (retryConfig.strategy) {
      case RecoveryStrategy.RETRY:
        if (retryConfig.backoffMs > 0) {
          await new Promise(resolve => setTimeout(resolve, retryConfig.backoffMs));
        }

        this.progressNotifier.notifyProgress({
          token: progressToken,
          value: 0,
          message: `Retrying ${stage}...`,
        });

        const retryResult = await this.executeStage(sessionId, stage);
        return retryResult.ok ? Success(undefined) : Failure(retryResult.error);

      case RecoveryStrategy.FALLBACK:
        // Try fallback tool if available
        if (retryConfig.fallbackTool && this.tools[retryConfig.fallbackTool]) {
          this.logger.info({
            sessionId,
            stage,
            fallbackTool: retryConfig.fallbackTool,
          }, 'Using fallback tool');

          // This would execute the fallback tool
          return Success(undefined);
        }
        return Failure('No fallback tool available');

      case RecoveryStrategy.SKIP:
        this.logger.warn({ sessionId, stage }, 'Skipping failed stage');
        return Success(undefined);

      case RecoveryStrategy.MANUAL:
        this.logger.info({
          sessionId,
          stage,
          prompt: retryConfig.userPrompt,
        }, 'Manual intervention required');
        return Failure(retryConfig.userPrompt || 'Manual intervention required');

      case RecoveryStrategy.ABORT:
        return Failure(`Stage ${stage} failed and cannot be recovered`);

      default:
        return Failure(`Unknown recovery strategy: ${retryConfig.strategy}`);
    }
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    try {
      // Clean up resources
      await this.resourceManager.cleanup(new Date());

      // Delete session
      await this.sessionManager.deleteSession(sessionId);

      this.logger.info({ sessionId }, 'Session cleanup completed');
    } catch (error) {
      this.logger.error({
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Session cleanup failed');
    }
  }

  private extractRepoName(path: string): string {
    return path.split('/').pop() || 'unknown';
  }

  // Public methods for session management
  async getSessionStatus(sessionId: string): Promise<Result<any>> {
    return this.sessionManager.getSession(sessionId);
  }

  async listActiveSessions(): Promise<any[]> {
    return this.sessionManager.listSessions();
  }

  async cancelWorkflow(sessionId: string): Promise<Result<void>> {
    return this.sessionManager.deleteSession(sessionId);
  }
}
