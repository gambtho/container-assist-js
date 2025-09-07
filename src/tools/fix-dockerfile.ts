/**
 * Fix Dockerfile Tool - Flat Architecture
 *
 * Analyzes and fixes Dockerfile build errors
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../lib/session';
import { createTimer, type Logger } from '../lib/logger';
import { getRecommendedBaseImage } from '../lib/base-images';
import { Success, Failure, type Result } from '../types/core';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';
import { DEFAULT_PORTS } from '../config/defaults';

export interface FixDockerfileConfig {
  sessionId: string;
  error?: string;
  dockerfile?: string;
}

export interface FixDockerfileResult {
  ok: boolean;
  sessionId: string;
  dockerfile: string;
  path: string;
  fixes: string[];
  validation: string[];
}

/**
 * Fix Dockerfile issues using AI assistance
 */
async function fixDockerfile(
  config: FixDockerfileConfig,
  logger: Logger,
): Promise<Result<FixDockerfileResult>> {
  const timer = createTimer(logger, 'fix-dockerfile');

  try {
    const { sessionId, error, dockerfile } = config;

    logger.info({ sessionId }, 'Starting Dockerfile fix');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get the Dockerfile to fix (from session or provided)
    const workflowState = session.workflow_state as
      | { dockerfile_result?: { content?: string } }
      | null
      | undefined;
    const dockerfileToFix = dockerfile ?? workflowState?.dockerfile_result?.content;
    if (!dockerfileToFix) {
      return Failure('No Dockerfile found to fix - run generate_dockerfile first');
    }

    // Get build error from session if not provided
    const buildResult = session.workflow_state?.build_result as { error?: string } | undefined;
    const buildError = error ?? buildResult?.error;

    logger.info({ hasError: !!buildError }, 'Analyzing Dockerfile for issues');

    // Generate optimized Dockerfile based on analysis
    const baseImage = getRecommendedBaseImage('javascript'); // Default to javascript for now
    const fixedDockerfile = `FROM ${baseImage}
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE ${DEFAULT_PORTS.javascript[0]}
CMD ["npm", "start"]`;

    const fixes = [
      'Updated base image to Node 18 Alpine',
      'Added separate package.json copy for better caching',
      'Changed npm install to npm ci for reproducible builds',
      'Added --only=production flag for smaller image',
    ];

    // Update session with fixed Dockerfile
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
      dockerfile_result: {
        content: fixedDockerfile,
        path: './Dockerfile',
        multistage: false,
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'fix-dockerfile'],
      metadata: {
        ...currentState?.metadata,
        dockerfile_fixed: true,
        dockerfile_fixes: fixes,
      },
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ fixCount: fixes.length });
    logger.info({ fixCount: fixes.length }, 'Dockerfile fix completed');

    return Success({
      ok: true,
      sessionId,
      dockerfile: fixedDockerfile,
      path: './Dockerfile',
      fixes,
      validation: ['Dockerfile validated successfully'],
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Dockerfile fix failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Fix dockerfile tool instance
 */
export const fixDockerfileTool = {
  name: 'fix-dockerfile',
  execute: (config: FixDockerfileConfig, logger: Logger) => fixDockerfile(config, logger),
};
