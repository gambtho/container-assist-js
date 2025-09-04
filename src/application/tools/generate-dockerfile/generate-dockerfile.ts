/**
 * Generate Dockerfile - MCP SDK Compatible Version
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { ErrorCode, DomainError } from '../../../domain/types/errors';
import {
  GenerateDockerfileInput,
  type GenerateDockerfileParams,
  DockerfileResultSchema,
  type DockerfileResult,
} from '../schemas';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { AnalysisResult, Session } from '../../../domain/types/session';
import type { SessionService } from '../../services/interfaces';
import { safeGetMetadataField, isWorkflowMetadata } from '../../../domain/types/workflow-state';

/**
 * Simple interface for generation options
 */
interface GenerationOptions {
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

/**
 * Generate optimized Dockerfile based on analysis and options
 */
function generateOptimizedDockerfile(analysis: AnalysisResult, options: GenerationOptions): string {
  const baseImage = options.baseImage ?? getRecommendedBaseImage(analysis.language);
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
  ports.forEach((port) => {
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
${options.customCommands?.map((cmd: string) => `RUN ${cmd}`).join('\n') ?? ''}
`;
  }

  // Switch to non-root user
  dockerfile += `\nUSER appuser\n`;

  // Add start command based on language/framework
  dockerfile += getStartCommand(analysis);

  return dockerfile;
}

/**
 * Get build commands for different languages
 */
function getBuildCommands(analysis: AnalysisResult, stage: 'build' | 'runtime' | 'single'): string {
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
    }
  } else if (lang === 'go') {
    if (stage === 'build') {
      return 'COPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .\n';
    } else if (stage === 'runtime') {
      return 'RUN apk --no-cache add ca-certificates\nCOPY --from=builder --chown=appuser:appuser /app/main .\n';
    }
  }

  return 'COPY --chown=appuser:appuser . .\n';
}

/**
 * Get start command based on language/framework
 */
function getStartCommand(analysis: AnalysisResult): string {
  const lang = analysis.language;
  const framework = analysis.framework;

  if (lang === 'javascript' || lang === 'typescript') {
    if (framework === 'nextjs') return 'CMD ["npm", "start"]';
    return 'CMD ["node", "."]';
  } else if (lang === 'python') {
    if (framework === 'django') return 'CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]';
    if (framework === 'flask') return 'CMD ["python", "app.py"]';
    if (framework === 'fastapi')
      return 'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]';
    return 'CMD ["python", "main.py"]';
  } else if (lang === 'java') {
    return 'ENTRYPOINT ["java", "-jar", "app.jar"]';
  } else if (lang === 'go') {
    return 'CMD ["./main"]';
  }

  return 'CMD ["echo", "No start command defined"]';
}

/**
 * Get recommended base image for language
 */
function getRecommendedBaseImage(language: string): string {
  const imageMap: Record<string, string> = {
    javascript: 'node:20-alpine',
    typescript: 'node:20-alpine',
    python: 'python:3.11-slim',
    java: 'openjdk:17-jdk-slim',
    go: 'golang:1.21-alpine',
    rust: 'rust:1.75-slim',
    ruby: 'ruby:3.2-slim',
    php: 'php:8.2-fpm-alpine',
  };

  return imageMap[language] ?? 'alpine:3.19';
}

/**
 * Analyze Dockerfile for security issues
 */
function analyzeDockerfileSecurity(content: string): string[] {
  const warnings: string[] = [];

  // Check for running as root
  if (!content.includes('USER ') || content.includes('USER root')) {
    warnings.push('Container runs as root user - consider adding a non-root user');
  }

  // Check for latest tags
  if (content.includes(':latest')) {
    warnings.push('Using :latest tag - consider pinning to specific versions');
  }

  // Check for sudo usage
  if (content.includes('sudo ')) {
    warnings.push('Avoid using sudo in containers');
  }

  // Check for exposed sensitive ports
  const sensitiveports = [22, 23, 135, 139, 445];
  for (const port of sensitiveports) {
    if (content.includes(`EXPOSE ${port}`)) {
      warnings.push(`Exposing potentially sensitive port ${port}`);
    }
  }

  // Check for package manager cleanup
  if (content.includes('apt-get install') && !content.includes('rm -rf /var/lib/apt/lists')) {
    warnings.push('Consider cleaning apt cache after installation');
  }

  if (content.includes('yum install') && !content.includes('yum clean all')) {
    warnings.push('Consider cleaning yum cache after installation');
  }

  return warnings;
}

/**
 * Main handler implementation
 */
const generateDockerfileHandler: ToolDescriptor<GenerateDockerfileParams, DockerfileResult> = {
  name: 'generate_dockerfile',
  description: 'Generate optimized Dockerfile using AI with security best practices',
  category: 'workflow',
  inputSchema: GenerateDockerfileInput,
  outputSchema: DockerfileResultSchema,

  handler: async (
    input: GenerateDockerfileParams,
    context: ToolContext,
  ): Promise<DockerfileResult> => {
    const contextServices = context;
    const logger = contextServices.logger;
    const sessionService = contextServices.sessionService as SessionService;
    const { sessionId } = input;

    logger.info(
      {
        sessionId,
      },
      'Starting Dockerfile generation',
    );

    try {
      // Validate session and get analysis
      if (!sessionService) {
        throw new DomainError(ErrorCode.DependencyNotInitialized, 'Session service not available');
      }

      type SessionService = { get: (id: string) => Promise<Session | null> };
      const sessionResult = await (sessionService as SessionService).get(sessionId);
      if (!sessionResult) {
        throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
      }

      // Type-safe session access
      const session = sessionResult;
      const workflowState = session.workflow_state as unknown;

      // Safe metadata extraction
      let analysis: AnalysisResult | undefined;
      if (isWorkflowMetadata(workflowState)) {
        analysis = safeGetMetadataField(workflowState, 'analysis_result', undefined) as
          | AnalysisResult
          | undefined;
      } else if (
        workflowState &&
        typeof workflowState === 'object' &&
        'analysis_result' in workflowState
      ) {
        analysis = (workflowState as { analysis_result?: AnalysisResult }).analysis_result;
      }

      if (!analysis) {
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          'No analysis result found. Run analyze_repository first',
        );
      }

      // Use simple options for generation
      const recommendedImage = getRecommendedBaseImage(analysis.language);
      const deps = analysis.dependencies?.map((d: { name: string }) => d.name) ?? [];
      const shouldUseMultistage = deps.length > 5;

      const generationOptions: GenerationOptions = {
        baseImage:
          (analysis.recommendations as { baseImage?: string })?.baseImage ?? recommendedImage,
        optimization: true,
        multistage: shouldUseMultistage,
        securityHardening: true,
        includeHealthcheck: true,
        customInstructions: '',
        optimizeSize: true,
        customCommands: [],
      };

      // Generate Dockerfile content
      const dockerfileContent = generateOptimizedDockerfile(analysis, generationOptions);

      // Define output path
      const dockerfilePath = path.join(process.cwd(), 'Dockerfile');

      // Write Dockerfile
      await fs.writeFile(dockerfilePath, dockerfileContent, 'utf-8');

      // Analyze for security issues
      const validation = analyzeDockerfileSecurity(dockerfileContent);

      // Update session with Dockerfile info
      await sessionService.updateAtomic(sessionId, (currentSession: any) => ({
        ...currentSession,
        workflow_state: {
          ...((currentSession.workflow_state as Record<string, unknown>) ?? {}),
          dockerfile_result: {
            content: dockerfileContent,
            path: dockerfilePath,
            base_image: generationOptions.baseImage,
            stages: [],
            optimizations: shouldUseMultistage
              ? ['Multi-stage build', 'Security hardening', 'Health checks']
              : ['Security hardening', 'Health checks'],
            multistage: shouldUseMultistage,
          },
        },
      }));

      logger.info(
        {
          path: dockerfilePath,
          validationIssues: validation.length,
        },
        'Dockerfile generated successfully',
      );

      return {
        success: true,
        sessionId,
        dockerfile: dockerfileContent,
        path: dockerfilePath,
        validation,
      };
    } catch (error) {
      logger.error({ error }, 'Error generating Dockerfile');
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'build_image',
    reason: 'Build Docker image from generated Dockerfile',
    paramMapper: (output: DockerfileResult) => ({
      session_id: output.path.includes('/') ? undefined : output.path,
      dockerfile_path: output.path,
      tags: [`app:${Date.now()}`],
    }),
  },
};

// Default export for registry
export default generateDockerfileHandler;
