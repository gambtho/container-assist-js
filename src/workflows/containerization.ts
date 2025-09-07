/**
 * Containerization Workflow - Orchestrates the complete containerization pipeline
 *
 * Steps:
 * 1. Analyze repository structure
 * 2. Generate optimized Dockerfile
 * 3. Build Docker image
 * 4. Scan image for security vulnerabilities
 * 5. Tag image appropriately
 */

import { analyzeRepo } from '../tools/analyze-repo';
import { generateDockerfile } from '../tools/generate-dockerfile';
import { buildImage } from '../tools/build-image';
import { scanImage } from '../tools/scan';
import { tagImage } from '../tools/tag';
import { isFail } from '../types/core';
import { createSessionManager } from '../lib/session';
import { createTimer, createLogger, type Logger } from '../lib/logger';
import type {
  ContainerizationWorkflowParams,
  ContainerizationWorkflowResult,
  WorkflowStep,
  WorkflowContext,
} from './types';

/**
 * Run the complete containerization workflow
 */
export async function runContainerizationWorkflow(
  params: ContainerizationWorkflowParams,
  providedLogger?: Logger,
): Promise<ContainerizationWorkflowResult> {
  const logger = providedLogger || createLogger({ name: 'containerization-workflow' });
  const timer = createTimer(logger, 'containerization-workflow');
  const sessionManager = createSessionManager(logger);
  const { sessionId, projectPath, buildOptions = {}, scanOptions = {} } = params;

  // Initialize workflow context
  const context: WorkflowContext = {
    sessionId,
    steps: [],
    artifacts: new Map(),
    metadata: {
      startTime: new Date(),
      projectPath,
    },
  };

  // Define workflow steps
  const steps: WorkflowStep[] = [
    { name: 'analyze-repository', status: 'pending' },
    { name: 'generate-dockerfile', status: 'pending' },
    { name: 'build-image', status: 'pending' },
    { name: 'scan-image', status: 'pending' },
    { name: 'tag-image', status: 'pending' },
  ];
  context.steps = steps;

  try {
    logger.info('Starting containerization workflow');

    // Update session
    await sessionManager.update(sessionId, {
      status: 'analyzing',
      stage: 'analyze-repository',
    });

    // Step 1: Analyze repository
    const analyzeStep = steps[0]!;
    analyzeStep.status = 'running';
    analyzeStep.startTime = new Date();
    context.currentStep = analyzeStep.name;

    logger.info('Analyzing repository structure');
    const analysisResult = await analyzeRepo(
      {
        sessionId,
        repoPath: projectPath,
        includeTests: true,
      },
      logger,
    );

    if (isFail(analysisResult)) {
      analyzeStep.status = 'failed';
      analyzeStep.error = `Analysis failed: ${analysisResult.error}`;
      return {
        success: false,
        sessionId,
        error: analyzeStep.error,
        metadata: {
          steps: context.steps,
          endTime: new Date(),
        },
      };
    }
    const analysis = analysisResult.value;

    analyzeStep.status = 'completed';
    analyzeStep.endTime = new Date();
    analyzeStep.output = analysis;
    context.artifacts.set('analysis', analysis);

    // Step 2: Generate Dockerfile
    const generateStep = steps[1]!;
    generateStep.status = 'running';
    generateStep.startTime = new Date();
    context.currentStep = generateStep.name;

    await sessionManager.update(sessionId, {
      stage: 'generate-dockerfile',
    });

    logger.info('Generating Dockerfile');

    const dockerfileResult = await generateDockerfile(
      {
        sessionId,
        baseImage: analysis.recommendations?.baseImage || 'node:18-alpine',
        optimization: true,
        multistage: true,
        securityHardening: true,
      },
      logger,
    );

    if (!dockerfileResult.ok) {
      generateStep.status = 'failed';
      generateStep.error = `Dockerfile generation failed: ${dockerfileResult.error}`;
      const endTime = new Date();
      const errorMessage = `Dockerfile generation failed: ${dockerfileResult.error}`;

      // Mark remaining steps as skipped
      steps.forEach((step) => {
        if (step.status === 'pending') {
          step.status = 'skipped';
        }
      });

      await sessionManager.update(sessionId, {
        status: 'failed',
        metadata: {
          error: errorMessage,
          failedAt: endTime.toISOString(),
        },
      });

      timer.end();
      logger.error('Containerization workflow failed during Dockerfile generation');

      return {
        success: false,
        sessionId,
        error: errorMessage,
        metadata: {
          startTime: context.metadata.startTime,
          endTime,
          duration: endTime.getTime() - context.metadata.startTime.getTime(),
          steps: context.steps,
        },
      };
    }
    const dockerfile = dockerfileResult.value;

    generateStep.status = 'completed';
    generateStep.endTime = new Date();
    generateStep.output = dockerfile;
    context.artifacts.set('dockerfile', dockerfile);

    // Step 3: Build image
    const buildStep = steps[2]!;
    buildStep.status = 'running';
    buildStep.startTime = new Date();
    context.currentStep = buildStep.name;

    await sessionManager.update(sessionId, {
      stage: 'build-image',
    });

    logger.info('Building Docker image');

    const buildResult = await buildImage(
      {
        sessionId,
        dockerfile: dockerfile.path,
        context: buildOptions.contextPath || projectPath,
        buildArgs: buildOptions.buildArgs || {},
        ...(buildOptions.target && { target: buildOptions.target }),
        ...(buildOptions.platform && { platform: buildOptions.platform }),
        ...(buildOptions.noCache && { noCache: buildOptions.noCache }),
      },
      logger,
    );

    if (!buildResult.ok) {
      buildStep.status = 'failed';
      buildStep.error = `Build failed: ${buildResult.error}`;
      const endTime = new Date();
      const errorMessage = `Build failed: ${buildResult.error}`;

      // Mark remaining steps as skipped
      steps.forEach((step) => {
        if (step.status === 'pending') {
          step.status = 'skipped';
        }
      });

      await sessionManager.update(sessionId, {
        status: 'failed',
        metadata: {
          error: errorMessage,
          failedAt: endTime.toISOString(),
        },
      });

      timer.end();
      logger.error('Containerization workflow failed during image build');

      return {
        success: false,
        sessionId,
        error: errorMessage,
        metadata: {
          startTime: context.metadata.startTime,
          endTime,
          duration: endTime.getTime() - context.metadata.startTime.getTime(),
          steps: context.steps,
        },
      };
    }
    const build = buildResult.value;

    buildStep.status = 'completed';
    buildStep.endTime = new Date();
    buildStep.output = build;
    context.artifacts.set('build', build);

    // Step 4: Scan image
    const scanStep = steps[3]!;
    scanStep.status = 'running';
    scanStep.startTime = new Date();
    context.currentStep = scanStep.name;

    await sessionManager.update(sessionId, {
      stage: 'scan-image',
    });

    logger.info('Scanning image for vulnerabilities');

    // Update session with build result so scan can find the imageId
    await sessionManager.update(sessionId, {
      workflow_state: {
        ...((await sessionManager.get(sessionId))?.workflow_state || {}),
        build_result: build,
      } as any,
    });

    const scanResult = await scanImage(
      {
        sessionId,
        scanner: 'trivy',
        severityThreshold: scanOptions.severity || 'high',
      },
      logger,
    );

    // Scan failures are warnings, not workflow failures
    let scan: any = null;
    if (!scanResult.ok) {
      scanStep.status = 'completed';
      scanStep.error = `Scan completed with warnings: ${scanResult.error}`;
      logger.warn('Image scan found issues');
    } else {
      scanStep.status = 'completed';
      scan = scanResult.value;
    }

    scanStep.endTime = new Date();
    scanStep.output = scan;
    context.artifacts.set('scan', scan);

    // Step 5: Tag image
    const tagStep = steps[4]!;
    tagStep.status = 'running';
    tagStep.startTime = new Date();
    context.currentStep = tagStep.name;

    await sessionManager.update(sessionId, {
      stage: 'tag-image',
    });

    const tags = buildOptions.tags || [`${analysis.language}:latest`];
    logger.info('Tagging image');

    const tagResult = await tagImage(
      {
        sessionId,
        tag: tags[0] || 'latest',
        imageName: build.imageId || `${analysis.language}-app`,
        sourceTag: 'latest',
        targetTag: tags[0] || 'latest',
      },
      logger,
    );

    if (!tagResult.ok) {
      tagStep.status = 'failed';
      tagStep.error = `Tagging failed: ${tagResult.error}`;
      const endTime = new Date();
      const errorMessage = `Tagging failed: ${tagResult.error}`;

      // Mark remaining steps as skipped
      steps.forEach((step) => {
        if (step.status === 'pending') {
          step.status = 'skipped';
        }
      });

      await sessionManager.update(sessionId, {
        status: 'failed',
        metadata: {
          error: errorMessage,
          failedAt: endTime.toISOString(),
        },
      });

      timer.end();
      logger.error('Containerization workflow failed during image tagging');

      return {
        success: false,
        sessionId,
        error: errorMessage,
        metadata: {
          startTime: context.metadata.startTime,
          endTime,
          duration: endTime.getTime() - context.metadata.startTime.getTime(),
          steps: context.steps,
        },
      };
    }
    const tag = tagResult.value;

    tagStep.status = 'completed';
    tagStep.endTime = new Date();
    tagStep.output = tag;
    context.artifacts.set('tags', tag);

    // Workflow completed successfully
    const endTime = new Date();
    await sessionManager.update(sessionId, {
      status: 'completed',
      stage: 'finished',
      metadata: {
        completedAt: endTime.toISOString(),
        results: {
          imageId: build.imageId,
          tags: tag.tags,
          dockerfilePath: dockerfile.path,
          scanResults: scan?.vulnerabilities,
        },
      },
    });

    timer.end();
    logger.info('Containerization workflow completed successfully');

    return {
      success: true,
      sessionId,
      results: {
        ...(build.imageId && { imageId: build.imageId }),
        ...(tag.tags && { imageTags: tag.tags }),
        ...(dockerfile.path && { dockerfilePath: dockerfile.path }),
        ...(scan && {
          scanResults: {
            vulnerabilities: scan.vulnerabilities,
            summary: scan.summary,
          },
        }),
        analysisData: {
          language: analysis.language,
        },
      },
      metadata: {
        startTime: context.metadata.startTime,
        endTime,
        duration: endTime.getTime() - context.metadata.startTime.getTime(),
        steps: context.steps,
      },
    };
  } catch (error) {
    const endTime = new Date();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Mark current step as failed
    const currentStepObj = steps.find((s) => s.name === context.currentStep);
    if (currentStepObj && currentStepObj.status === 'running') {
      currentStepObj.status = 'failed';
      currentStepObj.endTime = endTime;
      currentStepObj.error = errorMessage;
    }

    // Mark remaining steps as skipped
    steps.forEach((step) => {
      if (step.status === 'pending') {
        step.status = 'skipped';
      }
    });

    await sessionManager.update(sessionId, {
      status: 'failed',
      metadata: {
        error: errorMessage,
        failedAt: endTime.toISOString(),
      },
    });

    timer.end();
    logger.error('Containerization workflow failed');

    return {
      success: false,
      sessionId,
      error: errorMessage,
      metadata: {
        startTime: context.metadata.startTime,
        endTime,
        duration: endTime.getTime() - context.metadata.startTime.getTime(),
        steps: context.steps,
      },
    };
  }
}

/**
 * Export for MCP registration
 */
export const containerizationWorkflow = {
  name: 'containerization-workflow',
  description: 'Complete containerization pipeline from analysis to tagged image',
  execute: runContainerizationWorkflow,
  schema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session identifier' },
      projectPath: { type: 'string', description: 'Path to project repository' },
      buildOptions: {
        type: 'object',
        properties: {
          dockerfilePath: { type: 'string' },
          contextPath: { type: 'string' },
          buildArgs: { type: 'object' },
          target: { type: 'string' },
          platform: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          noCache: { type: 'boolean' },
        },
      },
      scanOptions: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          ignoreUnfixed: { type: 'boolean' },
        },
      },
    },
    required: ['sessionId', 'projectPath'],
  },
};
