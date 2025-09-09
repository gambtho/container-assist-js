/**
 * Generate optimized Dockerfiles based on repository analysis
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession, updateSessionData } from '@mcp/tools/session-helpers';
import { aiGenerate } from '@mcp/tools/ai-helpers';
import { reportProgress } from '@mcp/utils/progress-helper';
import { createTimer, type Logger } from '@lib/logger';
import type { SessionData } from '../session-types';
import type { ToolContext } from '../../domain/types/tool-context';
import type { ProgressReporter } from '@mcp/context/types';
import { Success, Failure, type Result } from '../../domain/types';
import { getDefaultPort } from '@config/defaults';
import { getRecommendedBaseImage } from '@lib/base-images';
import {
  stripFencesAndNoise,
  isValidDockerfileContent,
  extractBaseImage,
} from '@lib/text-processing';

/**
 * Configuration for Dockerfile generation
 */
export interface GenerateDockerfileConfig {
  /** Session identifier for storing results */
  sessionId?: string;
  /** Custom base image (defaults to language-specific recommendation) */
  baseImage?: string;
  /** Runtime image for multi-stage builds */
  runtimeImage?: string;
  /** Enable build optimizations */
  optimization?: boolean;
  /** Use multi-stage build pattern */
  multistage?: boolean;
  /** Apply security hardening practices */
  securityHardening?: boolean;
  /** Include health check configuration */
  includeHealthcheck?: boolean;
  /** Custom Dockerfile instructions to include */
  customInstructions?: string;
  /** Optimize for smaller image size */
  optimizeSize?: boolean;
  /** Additional RUN commands to execute */
  customCommands?: string[];
  /** Repository path */
  repoPath?: string;
}

/**
 * Result from Dockerfile generation
 */
export interface GenerateDockerfileResult {
  /** Generated Dockerfile content */
  content: string;
  /** Path where Dockerfile was written */
  path: string;
  /** Base image used */
  baseImage: string;
  /** Whether optimization was applied */
  optimization: boolean;
  /** Whether multi-stage build was used */
  multistage: boolean;
  /** Warnings about potential issues */
  warnings?: string[];
  /** Session ID for reference */
  sessionId?: string;
}

/**
 * Template-based Dockerfile generation (fallback when AI unavailable)
 */
function generateTemplateDockerfile(
  analysisResult: any,
  params: GenerateDockerfileConfig,
): Result<Pick<GenerateDockerfileResult, 'content' | 'baseImage'>> {
  const { language, framework, dependencies = [], ports = [] } = analysisResult;
  const { baseImage, multistage = true, securityHardening = true } = params;

  const effectiveBase = baseImage || getRecommendedBaseImage(language || 'unknown');
  const mainPort = ports[0] || getDefaultPort(language || framework || 'generic');

  let dockerfile = `# Generated Dockerfile for ${language} ${framework ? `(${framework})` : ''}\n`;
  dockerfile += `FROM ${effectiveBase}\n\n`;

  // Add metadata labels
  dockerfile += `# Metadata\n`;
  dockerfile += `LABEL maintainer="generated"\n`;
  dockerfile += `LABEL language="${language || 'unknown'}"\n`;
  if (framework) dockerfile += `LABEL framework="${framework}"\n\n`;

  // Set working directory
  dockerfile += `WORKDIR /app\n\n`;

  // Language-specific setup
  switch (language) {
    case 'javascript':
    case 'typescript':
      // Handle Node.js projects
      dockerfile += `# Copy package files\n`;
      dockerfile += `COPY package*.json ./\n`;
      if (dependencies.some((d: any) => d.name === 'yarn')) {
        dockerfile += `COPY yarn.lock ./\n`;
        dockerfile += `RUN yarn install --frozen-lockfile\n\n`;
      } else {
        dockerfile += `RUN npm ci --only=production\n\n`;
      }
      dockerfile += `# Copy application files\n`;
      dockerfile += `COPY . .\n\n`;
      if (language === 'typescript') {
        dockerfile += `# Build TypeScript\n`;
        dockerfile += `RUN npm run build\n\n`;
      }
      break;

    case 'python':
      // Handle Python projects
      dockerfile += `# Install dependencies\n`;
      dockerfile += `COPY requirements.txt ./\n`;
      dockerfile += `RUN pip install --no-cache-dir -r requirements.txt\n\n`;
      dockerfile += `# Copy application files\n`;
      dockerfile += `COPY . .\n\n`;
      break;

    case 'java':
      // Handle Java projects
      if (multistage) {
        dockerfile = `# Multi-stage build for Java\n`;
        dockerfile += `FROM maven:3-amazoncorretto-17 AS builder\n`;
        dockerfile += `WORKDIR /build\n`;
        dockerfile += `COPY pom.xml .\n`;
        dockerfile += `RUN mvn dependency:go-offline\n`;
        dockerfile += `COPY src ./src\n`;
        dockerfile += `RUN mvn package -DskipTests\n\n`;
        dockerfile += `FROM ${effectiveBase}\n`;
        dockerfile += `WORKDIR /app\n`;
        dockerfile += `COPY --from=builder /build/target/*.jar app.jar\n`;
      } else {
        dockerfile += `# Copy JAR file\n`;
        dockerfile += `COPY target/*.jar app.jar\n\n`;
      }
      break;

    case 'go':
      // Handle Go projects
      if (multistage) {
        dockerfile = `# Multi-stage build for Go\n`;
        dockerfile += `FROM golang:1.21-alpine AS builder\n`;
        dockerfile += `WORKDIR /build\n`;
        dockerfile += `COPY go.* ./\n`;
        dockerfile += `RUN go mod download\n`;
        dockerfile += `COPY . .\n`;
        dockerfile += `RUN CGO_ENABLED=0 go build -o app\n\n`;
        dockerfile += `FROM alpine:latest\n`;
        dockerfile += `RUN apk --no-cache add ca-certificates\n`;
        dockerfile += `WORKDIR /app\n`;
        dockerfile += `COPY --from=builder /build/app .\n`;
      } else {
        dockerfile += `# Copy binary\n`;
        dockerfile += `COPY app /app/\n\n`;
      }
      break;

    default:
      // Generic Dockerfile
      dockerfile += `# Copy application files\n`;
      dockerfile += `COPY . .\n\n`;
  }

  // Security hardening
  if (securityHardening) {
    dockerfile += `# Security hardening\n`;
    dockerfile += `RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup\n`;
    dockerfile += `USER appuser\n\n`;
  }

  // Expose port
  if (mainPort) {
    dockerfile += `# Expose application port\n`;
    dockerfile += `EXPOSE ${mainPort}\n\n`;
  }

  // Set entrypoint based on language
  dockerfile += `# Start application\n`;
  switch (language) {
    case 'javascript':
    case 'typescript':
      dockerfile += `CMD ["node", "${language === 'typescript' ? 'dist/' : ''}index.js"]\n`;
      break;
    case 'python':
      dockerfile += `CMD ["python", "app.py"]\n`;
      break;
    case 'java':
      dockerfile += `CMD ["java", "-jar", "app.jar"]\n`;
      break;
    case 'go':
      dockerfile += `CMD ["./app"]\n`;
      break;
    default:
      dockerfile += `CMD ["sh", "-c", "echo 'Please configure your application startup command'"]\n`;
  }

  return Success({ content: dockerfile, baseImage: effectiveBase });
}

/**
 * Build arguments for AI prompt from analysis result
 */
function buildArgsFromAnalysis(analysisResult: any): Record<string, any> {
  const {
    language = 'unknown',
    framework = '',
    dependencies = [],
    ports = [],
    summary = '',
    packageManager = 'npm',
    buildSystem,
  } = analysisResult;

  return {
    language,
    framework,
    dependencies: dependencies.map((d: any) => d.name || d).join(', '),
    ports: ports.join(', '),
    summary,
    packageManager,
    buildSystem: buildSystem?.type || 'none',
    buildCommand: buildSystem?.build_command || '',
  };
}

/**
 * Compute hash for default session ID
 */
function computeHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 8);
}

/**
 * Core implementation of generate Dockerfile
 */
async function generateDockerfileImpl(
  params: GenerateDockerfileConfig,
  context: ToolContext,
): Promise<Result<GenerateDockerfileResult>> {
  const logger = context.logger;
  const timer = createTimer(logger, 'generate-dockerfile');

  try {
    const { optimization = true, multistage = true, securityHardening = true } = params;

    // Progress: Analyzing
    if (context && 'progressReporter' in context && context.progressReporter) {
      await reportProgress(
        context.progressReporter as ProgressReporter,
        'Analyzing repository structure',
        10,
      );
    }

    // Resolve session with optional sessionId
    const sessionResult = await resolveSession(logger, context, {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      defaultIdHint: computeHash(params.repoPath || process.cwd()),
    });

    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const session = sessionResult.value;

    // Get analysis result from session
    const sessionData = session.state as unknown as SessionData;
    const analysisResult =
      sessionData?.analysis_result || sessionData?.workflow_state?.analysis_result;

    if (!analysisResult) {
      return Failure(
        `Repository must be analyzed first. Please run 'analyze-repo' before 'generate-dockerfile'.`,
      );
    }

    // Progress: Processing
    if (context && 'progressReporter' in context && context.progressReporter) {
      await reportProgress(
        context.progressReporter as ProgressReporter,
        'Generating Dockerfile',
        50,
      );
    }

    // Generate Dockerfile with AI or fallback
    const aiResult = await aiGenerate(logger, context as any, {
      promptName: 'dockerfile-generation',
      promptArgs: buildArgsFromAnalysis(analysisResult),
      expectation: 'dockerfile',
      maxRetries: 3,
      fallbackBehavior: 'default',
    });

    let dockerfileContent: string;
    let baseImageUsed: string;
    let aiUsed = false;

    if (aiResult.ok) {
      // Use AI-generated content
      const cleaned = stripFencesAndNoise(aiResult.value.content);
      if (!isValidDockerfileContent(cleaned)) {
        // Fall back to template if AI output is invalid
        const fallbackResult = generateTemplateDockerfile(analysisResult, params);
        if (!fallbackResult.ok) {
          return Failure(fallbackResult.error);
        }
        dockerfileContent = fallbackResult.value.content;
        baseImageUsed = fallbackResult.value.baseImage;
      } else {
        dockerfileContent = cleaned;
        baseImageUsed =
          extractBaseImage(cleaned) ||
          params.baseImage ||
          getRecommendedBaseImage(analysisResult.language ?? 'unknown');
        aiUsed = true;
      }
    } else {
      // Use template fallback
      const fallbackResult = generateTemplateDockerfile(analysisResult, params);
      if (!fallbackResult.ok) {
        return Failure(fallbackResult.error);
      }
      dockerfileContent = fallbackResult.value.content;
      baseImageUsed = fallbackResult.value.baseImage;
    }

    // Progress: Finalizing
    if (context && 'progressReporter' in context && context.progressReporter) {
      await reportProgress(context.progressReporter as ProgressReporter, 'Writing Dockerfile', 90);
    }

    // Determine output path
    const repoPath =
      sessionData?.metadata?.repo_path ||
      sessionData?.workflow_state?.metadata?.repo_path ||
      params.repoPath ||
      '.';
    const dockerfilePath = path.join(repoPath, 'Dockerfile');

    // Write Dockerfile to disk
    await fs.writeFile(dockerfilePath, dockerfileContent, 'utf-8');

    // Check for warnings
    const warnings: string[] = [];
    if (!securityHardening) {
      warnings.push('Security hardening is disabled - consider enabling for production');
    }
    if (dockerfileContent.includes('root')) {
      warnings.push('Container may run as root user');
    }
    if (dockerfileContent.includes(':latest')) {
      warnings.push('Using :latest tags - consider pinning versions');
    }

    // Prepare result
    const dockerfileResult = {
      content: dockerfileContent,
      path: dockerfilePath,
      multistage,
      fixed: false,
      fixes: [],
    };

    // Update session with Dockerfile result using standardized helper
    const updateResult = await updateSessionData(
      session.id,
      {
        dockerfile_result: dockerfileResult,
        completed_steps: [...((sessionData as any)?.completed_steps || []), 'dockerfile'],
        metadata: {
          ...((sessionData as any)?.metadata || {}),
          dockerfile_baseImage: baseImageUsed,
          dockerfile_optimization: optimization,
          dockerfile_warnings: warnings,
          ai_enhancement_used: aiUsed,
        },
      },
      logger,
      context,
    );

    if (!updateResult.ok) {
      logger.warn(
        { error: updateResult.error },
        'Failed to update session, but Dockerfile generation succeeded',
      );
    }

    // Progress: Complete
    if (context && 'progressReporter' in context && context.progressReporter) {
      await reportProgress(
        context.progressReporter as ProgressReporter,
        'Dockerfile generated successfully',
        100,
      );
    }

    timer.end({ path: dockerfilePath });

    // Return result
    return Success({
      content: dockerfileContent,
      path: dockerfilePath,
      baseImage: baseImageUsed,
      optimization,
      multistage,
      ...(warnings.length > 0 && { warnings }),
      sessionId: session.id,
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Dockerfile generation failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Wrapped generate Dockerfile tool with standardized behavior
 */
export const generateDockerfileTool = wrapTool('generate-dockerfile', generateDockerfileImpl);

/**
 * Legacy function export for backward compatibility during migration
 */
export async function generateDockerfile(
  config: GenerateDockerfileConfig,
  logger: Logger,
  context?: ToolContext,
): Promise<Result<GenerateDockerfileResult>> {
  const unifiedContext: ToolContext = context || { logger };
  return generateDockerfileImpl(config, unifiedContext);
}
