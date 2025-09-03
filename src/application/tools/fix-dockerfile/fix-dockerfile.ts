/**
 * Fix Dockerfile - Main Orchestration Logic
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import { AIRequestBuilder } from '../../../infrastructure/ai-request-builder.js';
import type { MCPTool, MCPToolContext } from '../tool-types.js';
import {
  FixDockerfileInput as FixDockerfileInputSchema,
  FixResultSchema,
  FixDockerfileParams,
  FixResult
} from '../schemas.js';
import {
  analyzeDockerfile,
  generateFixedDockerfile,
  validateDockerfileFix
} from './helper';

const FixDockerfileInput = FixDockerfileInputSchema;
const FixDockerfileOutput = FixResultSchema;

// Type aliases
export type FixInput = FixDockerfileParams;
export type FixOutput = FixResult;

/**
 * Main handler implementation
 */
<<<<<<< Updated upstream
const fixDockerfileHandler: MCPToolDescriptor<FixInput, FixOutput> = {
  name: 'fix_dockerfile',
  description: 'Fix issues in existing Dockerfile with AI assistance',
=======
export const fixDockerfileHandler: MCPTool<FixDockerfileInputType, FixDockerfileOutputType> = {
  name: 'fix-dockerfile',
  description:
    'AI-powered Dockerfile error analysis and intelligent fixing with comprehensive solutions',
>>>>>>> Stashed changes
  category: 'workflow',
  inputSchema: FixDockerfileInput,
  outputSchema: FixDockerfileOutput,

  handler: async (input: FixInput, context: MCPToolContext): Promise<FixOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId, dockerfilePath, issues } = input;

    logger.info(
      {
        sessionId,
        dockerfilePath,
        issuesCount: issues?.length || 0
      },
      'Starting Dockerfile fix'
    );

    try {
      // Validate session
      if (!sessionService) {
        throw new DomainError(ErrorCode.DependencyNotInitialized, 'Session service not available');
      }

      const session = await sessionService.get(sessionId);
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'fix_dockerfile',
          status: 'in_progress',
          message: 'Analyzing Dockerfile issues',
          progress: 0.2
        });
      }

      // Read existing Dockerfile
      const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');

      // Analyze issues
      const analysisResult = await analyzeDockerfile(dockerfileContent, issues, context);

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'fix_dockerfile',
          status: 'in_progress',
          message: 'Generating fixed Dockerfile',
          progress: 0.6
        });
      }

      // Generate fixed Dockerfile
      const fixedContent = await generateFixedDockerfile(
        dockerfileContent,
        analysisResult,
        context
      );

      // Validate the fix
      const validation = await validateDockerfileFix(fixedContent, analysisResult);

      // Write fixed Dockerfile
      const backupPath = `${dockerfilePath}.backup`;
      await fs.writeFile(backupPath, dockerfileContent, 'utf-8');
      await fs.writeFile(dockerfilePath, fixedContent, 'utf-8');

      // Update session
      await sessionService.updateAtomic(sessionId, (session: any) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          dockerfile_fix_result: {
            originalPath: dockerfilePath,
            backupPath,
            fixedContent,
            issuesFixed: analysisResult.fixedIssues,
            validation
          }
        }
      }));

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'fix_dockerfile',
          status: 'completed',
          message: 'Dockerfile fixed successfully',
          progress: 1.0
        });
      }

      logger.info(
        {
          path: dockerfilePath,
          issuesFixed: analysisResult.fixedIssues.length,
          backupCreated: backupPath
        },
        'Dockerfile fixed successfully'
      );

      return {
        success: true,
        sessionId,
        originalPath: dockerfilePath,
        backupPath,
        fixedDockerfile: fixedContent,
        issuesFixed: analysisResult.fixedIssues,
        validation: validation.isValid,
        warnings: validation.warnings,
        metadata: {
          timestamp: new Date().toISOString(),
          originalSize: dockerfileContent.length,
          fixedSize: fixedContent.length
        }
      };
    } catch (error) {
      logger.error({ error }, 'Error occurred during Dockerfile fix');

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'fix_dockerfile',
          status: 'failed',
          message: 'Dockerfile fix failed'
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'build_image',
    reason: 'Build Docker image from fixed Dockerfile',
    paramMapper: (output) => ({
      session_id: output.sessionId,
      dockerfile_path: output.originalPath
    })
  }
};

// Default export for registry
export default fixDockerfileHandler;
