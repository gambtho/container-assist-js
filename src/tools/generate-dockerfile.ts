/**
 * Generate Dockerfile Tool - Flat Architecture
 *
 * Generates optimized Dockerfiles based on repository analysis
 * Follows architectural requirement: only imports from src/lib/
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../lib/session';
import { createAIService, type AIResult } from '../lib/ai';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';

export interface GenerateDockerfileConfig {
  sessionId: string;
  baseImage?: string;
  runtimeImage?: string;
  optimization?: boolean;
  multistage?: boolean;
  securityHardening?: boolean;
  includeHealthcheck?: boolean;
  customInstructions?: string;
  optimizeSize?: boolean;
  customCommands?: string[];
}

export interface GenerateDockerfileResult {
  success: boolean;
  sessionId: string;
  content: string;
  path: string;
  baseImage: string;
  optimization: boolean;
  multistage: boolean;
  warnings?: string[];
}

/**
 * Get recommended base image for a language
 */
function getRecommendedBaseImage(language: string): string {
  const recommendations: Record<string, string> = {
    javascript: 'node:18-alpine',
    typescript: 'node:18-alpine',
    python: 'python:3.11-slim',
    java: 'openjdk:17-alpine',
    go: 'golang:1.21-alpine',
    rust: 'rust:alpine',
    ruby: 'ruby:3.2-alpine',
    php: 'php:8.2-fpm-alpine',
  };

  return recommendations[language] ?? 'alpine:latest';
}

/**
 * Get build commands for different languages
 */
function getBuildCommands(
  analysis: { language?: string; build_system?: { type?: string } },
  stage: 'build' | 'runtime' | 'single',
): string {
  const lang = analysis.language;
  const buildSystem = analysis.build_system?.type;

  if (lang === 'javascript' || lang === 'typescript') {
    if (stage === 'build') {
      return 'COPY package*.json ./\nRUN npm ci --only=production\n';
    } else if (stage === 'runtime') {
      return 'COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules\nCOPY --chown=appuser:appuser . .\n';
    } else {
      return 'COPY package*.json ./\nRUN npm ci --only=production\nCOPY --chown=appuser:appuser . .\n';
    }
  } else if (lang === 'python') {
    if (stage === 'build') {
      return 'RUN python -m venv /opt/venv\nENV PATH="/opt/venv/bin:$PATH"\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\n';
    } else if (stage === 'runtime') {
      return 'COPY --from=builder /opt/venv /opt/venv\nENV PATH="/opt/venv/bin:$PATH"\nCOPY --chown=appuser:appuser . .\n';
    } else {
      return 'COPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY --chown=appuser:appuser . .\n';
    }
  } else if (lang === 'java') {
    if (buildSystem === 'maven') {
      if (stage === 'build') {
        return 'COPY pom.xml .\nRUN mvn dependency:go-offline\nCOPY src ./src\nRUN mvn clean package -DskipTests\n';
      } else if (stage === 'runtime') {
        return 'COPY --from=builder --chown=appuser:appuser /app/target/*.jar app.jar\n';
      }
    } else if (buildSystem === 'gradle') {
      if (stage === 'build') {
        return 'COPY build.gradle .\nCOPY gradle ./gradle\nRUN gradle build --no-daemon\n';
      } else if (stage === 'runtime') {
        return 'COPY --from=builder --chown=appuser:appuser /app/build/libs/*.jar app.jar\n';
      }
    }
  } else if (lang === 'go') {
    if (stage === 'build') {
      return 'COPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .\n';
    } else if (stage === 'runtime') {
      return 'RUN apk --no-cache add ca-certificates\nCOPY --from=builder --chown=appuser:appuser /app/main .\n';
    } else {
      return 'COPY . .\nRUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .\n';
    }
  }

  // Generic fallback
  return 'COPY --chown=appuser:appuser . .\n';
}

/**
 * Get start command for different languages/frameworks
 */
function getStartCommand(analysis: { language?: string; framework?: string }): string {
  const lang = analysis.language;
  const framework = analysis.framework;

  if (lang === 'javascript' || lang === 'typescript') {
    if (framework === 'nextjs') return 'CMD ["npm", "run", "start"]\n';
    if (framework === 'express') return 'CMD ["node", "index.js"]\n';
    return 'CMD ["npm", "start"]\n';
  } else if (lang === 'python') {
    if (framework === 'django') return 'CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]\n';
    if (framework === 'flask') return 'CMD ["python", "-m", "flask", "run", "--host=0.0.0.0"]\n';
    if (framework === 'fastapi')
      return 'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]\n';
    return 'CMD ["python", "main.py"]\n';
  } else if (lang === 'java') {
    return 'CMD ["java", "-jar", "app.jar"]\n';
  } else if (lang === 'go') {
    return 'CMD ["./main"]\n';
  } else if (lang === 'ruby') {
    if (framework === 'rails') return 'CMD ["rails", "server", "-b", "0.0.0.0"]\n';
    return 'CMD ["ruby", "app.rb"]\n';
  }

  return 'CMD ["/bin/sh"]\n';
}

/**
 * Generate optimized Dockerfile based on analysis and options
 */
function generateOptimizedDockerfile(
  analysis: {
    language?: string;
    framework?: string;
    dependencies?: Array<{ name: string }>;
    ports?: number[];
  },
  options: GenerateDockerfileConfig,
): string {
  const baseImage = options.baseImage ?? getRecommendedBaseImage(analysis.language ?? 'unknown');
  const framework = analysis.framework ?? '';
  const deps = analysis.dependencies?.map((d: { name: string }) => d.name) ?? [];

  // Build optimized Dockerfile content
  let dockerfile = `# AI-Optimized Dockerfile for ${analysis.language}${framework ? ` (${framework})` : ''}
# Generated on ${new Date().toISOString()}

`;

  if (options.multistage && deps.length > 5) {
    // Use explicit runtimeImage if provided, otherwise reuse the exact baseImage
    const runtimeImage = options.runtimeImage ?? baseImage;

    dockerfile += `# Build stage
FROM ${baseImage} AS builder
WORKDIR /app

# Copy dependency files first for better caching
${getBuildCommands(analysis, 'build')}

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

# Copy built artifacts
${getBuildCommands(analysis, 'runtime')}

`;
  } else {
    dockerfile += `FROM ${baseImage}
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

${getBuildCommands(analysis, 'single')}

`;
  }

  // Add ports
  const ports = analysis.ports ?? [3000];
  ports.forEach((port: number) => {
    dockerfile += `EXPOSE ${port}\n`;
  });

  // Add health check if requested
  if (options.includeHealthcheck) {
    const primaryPort = ports[0] ?? 3000;
    dockerfile += `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${primaryPort}/health || exit 1
`;
  }

  // Add custom commands if provided
  if (options.customCommands && options.customCommands.length > 0) {
    dockerfile += `
# Custom commands
${options.customCommands.map((cmd: string) => `RUN ${cmd}`).join('\n')}
`;
  }

  // Add custom instructions if provided
  if (options.customInstructions) {
    dockerfile += `
# Custom instructions
${options.customInstructions}
`;
  }

  // Switch to non-root user
  dockerfile += `\nUSER appuser\n`;

  // Add start command based on language/framework
  dockerfile += getStartCommand(analysis);

  return dockerfile;
}

/**
 * Generate Dockerfile
 */
export async function generateDockerfile(
  config: GenerateDockerfileConfig,
  logger: Logger,
): Promise<Result<GenerateDockerfileResult>> {
  const timer = createTimer(logger, 'generate-dockerfile');

  try {
    const { sessionId, optimization = true, multistage = true, securityHardening = true } = config;

    logger.info({ sessionId, optimization, multistage }, 'Generating Dockerfile');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Fallback mock function for testing scenarios
    const mockAIFunction = async (_request: unknown): Promise<AIResult> => ({
      success: true as const,
      text: 'Mock AI response',
      tokenCount: 10,
      model: 'mock',
    });
    // Will be used when actual AI functionality is integrated
    const aiService = createAIService(mockAIFunction, logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get analysis result from session
    const workflowState = session.workflow_state as
      | {
          analysis_result?: {
            language?: string;
            framework?: string;
            dependencies?: Array<{ name: string }>;
            ports?: number[];
          };
        }
      | null
      | undefined;
    const analysisResult = workflowState?.analysis_result;
    if (!analysisResult) {
      return Failure('Repository must be analyzed first - run analyze_repo');
    }

    // Generate Dockerfile content
    const dockerfileContent = generateOptimizedDockerfile(analysisResult, config);

    // Use AI to enhance the Dockerfile (when available)
    const processedContent = dockerfileContent;
    try {
      const aiResponse = await aiService.generateDockerfile({
        language: analysisResult.language,
        framework: analysisResult.framework,
        dependencies: analysisResult.dependencies,
        ports: analysisResult.ports,
        optimization,
        multistage,
      });

      if (aiResponse.success) {
        // For now, we use the generated content
        // In production, AI would provide enhanced content
        logger.debug('AI enhancement would be applied here');
      }
    } catch (error) {
      logger.debug({ error }, 'AI enhancement skipped');
    }

    // Determine output path
    const repoPath = session.repo_path ?? '.';
    const dockerfilePath = path.join(repoPath, 'Dockerfile');

    // Write Dockerfile to disk
    await fs.writeFile(dockerfilePath, processedContent, 'utf-8');

    // Check for warnings
    const warnings: string[] = [];
    if (!securityHardening) {
      warnings.push('Security hardening is disabled - consider enabling for production');
    }
    if (processedContent.includes('root')) {
      warnings.push('Container may run as root user');
    }
    if (processedContent.includes(':latest')) {
      warnings.push('Using :latest tags - consider pinning versions');
    }

    // Update session with Dockerfile result
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      dockerfile_result: {
        content: processedContent,
        path: dockerfilePath,
        multistage,
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'generate-dockerfile'],
      metadata: {
        ...(currentState?.metadata ?? {}),
        dockerfile_baseImage:
          config.baseImage ?? getRecommendedBaseImage(analysisResult.language ?? 'unknown'),
        dockerfile_optimization: optimization,
        dockerfile_warnings: warnings,
      },
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ path: dockerfilePath });
    logger.info({ path: dockerfilePath }, 'Dockerfile generation completed');

    return Success({
      success: true,
      sessionId,
      content: processedContent,
      path: dockerfilePath,
      baseImage: config.baseImage ?? getRecommendedBaseImage(analysisResult.language ?? 'unknown'),
      optimization,
      multistage,
      ...(warnings.length > 0 && { warnings }),
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Dockerfile generation failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Factory function for creating generate-dockerfile tool instances
 */
export function createGenerateDockerfileTool(logger: Logger): {
  name: string;
  execute: (config: GenerateDockerfileConfig) => Promise<Result<GenerateDockerfileResult>>;
} {
  return {
    name: 'generate-dockerfile',
    execute: (config: GenerateDockerfileConfig) => generateDockerfile(config, logger),
  };
}
