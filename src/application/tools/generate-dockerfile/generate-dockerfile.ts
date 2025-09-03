/**
 * Generate Dockerfile - Main Orchestration Logic
 */

import { z } from 'zod';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import { AIRequestBuilder } from '../../../infrastructure/ai-request-builder.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';
import type { AnalysisResult } from '../../../contracts/types/session.js';
import {
  generateDockerfileContent,
  analyzeDockerfileSecurity,
  estimateImageSize
} from './helper';

// Input schema with support for both snake_case and camelCase
const GenerateDockerfileInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    target_path: z.string().optional(),
    targetPath: z.string().optional(),
    base_image: z.string().optional(),
    baseImage: z.string().optional(),
    optimization: z.enum(['size', 'build-speed', 'security', 'balanced']).default('balanced'),
    multistage: z.boolean().default(true),
    optimize_size: z.boolean().default(true),
    security_hardening: z.boolean().default(true),
    include_healthcheck: z.boolean().default(true),
    includeHealthcheck: z.boolean().optional(),
    include_security_scanning: z.boolean().default(true),
    includeSecurityScanning: z.boolean().optional(),
    custom_commands: z.array(z.string()).optional(),
    customCommands: z.array(z.string()).optional(),
    custom_instructions: z.string().optional(),
    customInstructions: z.string().optional(),
    force_regenerate: z.boolean().default(false),
    forceRegenerate: z.boolean().optional()
  })
  .transform((data) => ({
    sessionId: data.session_id ?? (data.sessionId || ''),
    targetPath: data.target_path ?? (data.targetPath || './Dockerfile'),
    baseImage: data.base_image ?? data.baseImage ?? undefined,
    optimization: data.optimization,
    multistage: data.multistage,
    optimizeSize: data.optimize_size,
    securityHardening: data.security_hardening,
    includeHealthcheck: data.include_healthcheck ?? data.includeHealthcheck ?? true,
    includeSecurityScanning: data.include_security_scanning ?? data.includeSecurityScanning ?? true,
    customCommands: data.custom_commands ?? (data.customCommands || []),
    customInstructions: data.custom_instructions ?? data.customInstructions ?? undefined,
    forceRegenerate: data.force_regenerate ?? data.forceRegenerate ?? false
  }));

// Output schema
const GenerateDockerfileOutput = z.object({
  success: z.boolean(),
  dockerfile: z.string(),
  path: z.string(),
  baseImage: z.string(),
  stages: z.array(
    z.object({
      name: z.string(),
      baseImage: z.string(),
      purpose: z.string()
    })
  ),
  optimizations: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
  metadata: z
    .object({
      estimatedSize: z.string().optional(),
      layers: z.number().optional(),
      securityFeatures: z.array(z.string()).optional(),
      buildTime: z.string().optional(),
      generated: z.string()
    })
    .optional()
});

// Type aliases
export type DockerfileInput = z.infer<typeof GenerateDockerfileInput>;
export type DockerfileOutput = z.infer<typeof GenerateDockerfileOutput>;

/**
 * Main handler implementation
 */
const generateDockerfileHandler: MCPToolDescriptor<DockerfileInput, DockerfileOutput> = {
  name: 'generate_dockerfile',
  description: 'Generate optimized Dockerfile using AI with security best practices',
  category: 'workflow',
  inputSchema: GenerateDockerfileInput,
  outputSchema: GenerateDockerfileOutput,

  handler: async (input: DockerfileInput, context: MCPToolContext): Promise<DockerfileOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { sessionId, targetPath, forceRegenerate } = input;

    logger.info(
      {
        sessionId,
        optimization: input.optimization,
        multistage: input.multistage
      },
      'Starting Dockerfile generation'
    );

    try {
      // Validate session and get analysis
      if (!sessionService) {
        throw new DomainError(ErrorCode.DependencyNotInitialized, 'Session service not available');
      }

      const session = await sessionService.get(sessionId);
      if (!session) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      const analysis = session.workflow_state?.analysis_result;
      if (!analysis) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          'No analysis result found. Run analyze_repository first'
        );
      }

      // Check if Dockerfile already exists and not forcing regeneration
      const dockerfilePath = path.isAbsolute(targetPath)
        ? targetPath
        : path.join(process.cwd(), targetPath);
      if (!forceRegenerate) {
        try {
          await fs.access(dockerfilePath);
          logger.info('Dockerfile already exists, skipping generation');
          const existingContent = await fs.readFile(dockerfilePath, 'utf-8');

          return {
            success: true,
            dockerfile: existingContent,
            path: dockerfilePath,
            baseImage: input.baseImage ?? (analysis.recommendations?.baseImage || 'alpine:latest'),
            stages: [],
            optimizations: ['Using existing Dockerfile'],
            warnings: analyzeDockerfileSecurity(existingContent),
            metadata: {
              generated: new Date().toISOString()
            }
          };
        } catch {
          // File doesn't exist, continue with generation
        }
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_dockerfile',
          status: 'in_progress',
          message: 'Generating optimized Dockerfile',
          progress: 0.3
        });
      }

      // Generate Dockerfile content
      const { content, stages, optimizations } = await generateDockerfileContent(
        analysis,
        input,
        context
      );

      // Analyze for security issues
      const warnings = analyzeDockerfileSecurity(content);

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_dockerfile',
          status: 'in_progress',
          message: 'Writing Dockerfile',
          progress: 0.8
        });
      }

      // Write Dockerfile
      const dockerfileDir = path.dirname(dockerfilePath);
      await fs.mkdir(dockerfileDir, { recursive: true });
      await fs.writeFile(dockerfilePath, content, 'utf-8');

      // Determine base image
      const baseImage = input.baseImage ?? (analysis.recommendations?.baseImage || 'alpine:latest');

      // Estimate size
      const estimatedSize = estimateImageSize(
        analysis.language,
        (analysis.dependencies ?? []).map((dep: any) => dep.name),
        input.multistage
      );

      // Build metadata
      const metadata = {
        estimatedSize,
        layers: content.split('\nRUN ').length + content.split('\nCOPY ').length,
        securityFeatures: [
          input.securityHardening ? 'Non-root user' : '',
          input.includeHealthcheck ? 'Health check' : '',
          input.multistage ? 'Multi-stage build' : ''
        ].filter(Boolean),
        buildTime: analysis.build_system?.build_command,
        generated: new Date().toISOString()
      };

      // Update session with Dockerfile info
      await sessionService.updateAtomic(sessionId, (session: any) => ({
        ...session,
        workflow_state: {
          ...session.workflow_state,
          dockerfile_result: {
            content,
            path: dockerfilePath,
            base_image: baseImage,
            stages: [],
            optimizations,
            multistage: input.multistage ?? false
          }
        }
      }));

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_dockerfile',
          status: 'completed',
          message: 'Dockerfile generated successfully',
          progress: 1.0
        });
      }

      logger.info(
        {
          path: dockerfilePath,
          stages: stages ? stages.length : 0,
          warnings: warnings.length
        },
        'Dockerfile generated successfully'
      );

      const result: any = {
        success: true,
        dockerfile: content,
        path: dockerfilePath,
        baseImage,
        metadata
      };

      if (stages && stages.length > 0) {
        result.stages = stages;
      }

      if (optimizations && optimizations.length > 0) {
        result.optimizations = optimizations;
      }

      if (warnings && warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;
    } catch (error) {
      logger.error({ error }, 'Error occurred');

      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'generate_dockerfile',
          status: 'failed',
          message: 'Dockerfile generation failed'
        });
      }

      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'build_image',
    reason: 'Build Docker image from generated Dockerfile',
    paramMapper: (output) => ({
      session_id: output.path.includes('/') ? undefined : output.path,
      dockerfile_path: output.path,
      tags: [`app:${Date.now()}`]
    })
  }
};

// Default export for registry
export default generateDockerfileHandler;
