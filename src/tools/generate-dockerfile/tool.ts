/**
 * Generate optimized Dockerfiles based on repository analysis
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '@lib/session';
import { createMCPHostAI, createPromptTemplate, type MCPHostAI } from '@lib/mcp-host-ai';
import { createTimer, type Logger } from '@lib/logger';
import { Success, Failure, type Result, updateWorkflowState, type WorkflowState } from '@types';
import { getDefaultPort, DEFAULT_NETWORK, DEFAULT_CONTAINER } from '@config/defaults';
import { getRecommendedBaseImage } from '@lib/base-images';

/**
 * Configuration for Dockerfile generation
 */
export interface GenerateDockerfileConfig {
  /** Session identifier for storing results */
  sessionId: string;
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
}

/**
 * Result of Dockerfile generation operation
 */
export interface GenerateDockerfileResult {
  /** Whether the generation was successful */
  ok: boolean;
  /** Session identifier */
  sessionId: string;
  /** Generated Dockerfile content */
  content: string;
  /** File path where Dockerfile was written */
  path: string;
  /** Base image used in the Dockerfile */
  baseImage: string;
  /** Whether optimization was enabled */
  optimization: boolean;
  /** Whether multi-stage build was used */
  multistage: boolean;
  /** Optional warnings about the generated Dockerfile */
  warnings?: string[];
}

/**
 * Get recommended base image for a language
 * @param language - Programming language detected in repository
 * @returns Recommended Docker base image
 */

/**
 * Get build commands for different languages
 * @param analysis - Repository analysis data
 * @param stage - Build stage type
 * @returns Docker commands for building the application
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
  } else if (lang === 'dotnet') {
    if (buildSystem === 'dotnet' || buildSystem === 'dotnet-sln') {
      if (stage === 'build') {
        return 'COPY *.csproj* *.sln ./\nCOPY */*.csproj ./*/\nRUN dotnet restore\nCOPY . .\nRUN dotnet publish -c Release -o out\n';
      } else if (stage === 'runtime') {
        return 'COPY --from=builder --chown=appuser:appuser /app/out ./\n';
      } else {
        return 'COPY *.csproj* *.sln ./\nCOPY */*.csproj ./*/\nRUN dotnet restore\nCOPY . .\nRUN dotnet publish -c Release -o out\n';
      }
    }
  }

  return 'COPY --chown=appuser:appuser . .\n';
}

/**
 * Get start command for different languages/frameworks
 * @param analysis - Repository analysis with language and framework info
 * @returns Docker CMD instruction
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
  } else if (lang === 'dotnet') {
    if (framework === 'aspnet-core') return 'CMD ["dotnet", "*.dll"]\n';
    if (framework === 'blazor') return 'CMD ["dotnet", "*.dll"]\n';
    if (framework === 'minimal-api') return 'CMD ["dotnet", "*.dll"]\n';
    return 'CMD ["dotnet", "*.dll"]\n';
  } else if (lang === 'ruby') {
    if (framework === 'rails') return 'CMD ["rails", "server", "-b", "0.0.0.0"]\n';
    return 'CMD ["ruby", "app.rb"]\n';
  }

  return 'CMD ["/bin/sh"]\n';
}

/**
 * Generate AI-enhanced Dockerfile based on analysis and options
 * @param analysis - Repository analysis containing language, framework, dependencies
 * @param options - Generation options including multi-stage and security settings
 * @param mcpHostAI - MCP Host AI instance for intelligent generation
 * @param logger - Logger for debug information
 * @returns Complete Dockerfile content as string
 */
async function generateAIDockerfile(
  analysis: {
    language?: string;
    framework?: string;
    dependencies?: Array<{ name: string }>;
    ports?: number[];
    build_system?: { type?: string };
  },
  options: GenerateDockerfileConfig,
  mcpHostAI: MCPHostAI,
  logger: Logger,
): Promise<string> {
  try {
    const context = {
      language: analysis.language,
      framework: analysis.framework,
      dependencies: analysis.dependencies,
      ports: analysis.ports,
      buildTools: analysis.build_system?.type,
      securityLevel: options.securityHardening ? 'strict' : 'standard',
      optimization: options.optimization ? 'balanced' : 'minimal',
      multistage: options.multistage !== false,
      expectsAIResponse: true,
      type: 'dockerfile',
    };

    const prompt = createPromptTemplate('dockerfile', {
      ...context,
      requirements: [
        'Use best practices for the detected language/framework',
        'Optimize for minimal image size',
        'Include security hardening',
        'Use multi-stage builds where appropriate',
        'Add proper health checks',
        'Configure non-root user',
      ],
    });

    const result = await mcpHostAI.submitPrompt(prompt, context);

    if (result.ok) {
      logger.debug(
        { language: analysis.language, framework: analysis.framework },
        'AI-enhanced Dockerfile generated',
      );
      return parseDockerfileFromAIResponse(result.value);
    } else {
      logger.warn(
        { error: result.error },
        'AI Dockerfile generation failed, falling back to template',
      );
    }
  } catch (error) {
    logger.warn({ error }, 'AI Dockerfile generation error, falling back to template');
  }

  // Fall back to template-based generation
  return generateTemplateDockerfile(analysis, options);
}

/**
 * Parse Dockerfile content from AI response
 * @param aiResponse - Raw AI response that may contain Dockerfile content
 * @returns Cleaned Dockerfile content
 */
function parseDockerfileFromAIResponse(aiResponse: string): string {
  // Extract Dockerfile content from AI response
  // Look for code blocks first
  const dockerfileMatch = aiResponse.match(/```(?:dockerfile|docker)?\n([\s\S]*?)\n```/i);
  if (dockerfileMatch?.[1]) {
    return dockerfileMatch[1].trim();
  }

  // If no code blocks, check if the response is already a Dockerfile
  if (aiResponse.trim().startsWith('FROM ')) {
    return aiResponse.trim();
  }

  // If response contains Dockerfile commands, extract them
  const lines = aiResponse.split('\n');
  const dockerfileLines: string[] = [];
  let inDockerfile = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('FROM ')) {
      inDockerfile = true;
    }
    if (inDockerfile) {
      // Check if this looks like a Dockerfile instruction
      if (
        trimmed.startsWith('FROM ') ||
        trimmed.startsWith('RUN ') ||
        trimmed.startsWith('COPY ') ||
        trimmed.startsWith('WORKDIR ') ||
        trimmed.startsWith('EXPOSE ') ||
        trimmed.startsWith('ENV ') ||
        trimmed.startsWith('USER ') ||
        trimmed.startsWith('CMD ') ||
        trimmed.startsWith('ENTRYPOINT ') ||
        trimmed.startsWith('HEALTHCHECK ') ||
        trimmed.startsWith('ARG ') ||
        trimmed.startsWith('LABEL ') ||
        trimmed.startsWith('#') ||
        trimmed === ''
      ) {
        dockerfileLines.push(line);
      }
    }
  }

  return dockerfileLines.length > 0 ? dockerfileLines.join('\n') : aiResponse.trim();
}

/**
 * Generate template-based Dockerfile (fallback when AI is unavailable)
 * @param analysis - Repository analysis containing language, framework, dependencies
 * @param options - Generation options including multi-stage and security settings
 * @returns Complete Dockerfile content as string
 */
function generateTemplateDockerfile(
  analysis: {
    language?: string;
    framework?: string;
    dependencies?: Array<{ name: string }>;
    ports?: number[];
    build_system?: { type?: string };
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

  // Use multi-stage build for projects with many dependencies to reduce final image size
  if (options.multistage && deps.length > 5) {
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

  // Add ports - use defaults if not specified
  const defaultPort = getDefaultPort(analysis.language || 'javascript');
  const ports = analysis.ports && analysis.ports.length > 0 ? analysis.ports : [defaultPort];
  ports.forEach((port: number) => {
    dockerfile += `EXPOSE ${port}\n`;
  });

  // Add health check if requested
  if (options.includeHealthcheck) {
    const primaryPort = ports[0] ?? defaultPort;
    dockerfile += `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://${DEFAULT_NETWORK.host}:${primaryPort}${DEFAULT_CONTAINER.healthCheckPath} || exit 1
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
 * Generate optimized Dockerfile based on repository analysis
 * @param config - Generation configuration with optimization options
 * @param logger - Logger instance for debug and info output
 * @returns Promise resolving to Result with generated Dockerfile content and metadata
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

    // Create MCP Host AI service
    const mcpHostAI = createMCPHostAI(logger);

    // Get or create session
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
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

    // Generate Dockerfile content with AI enhancement when available
    let processedContent: string;
    let aiGenerated = false;

    try {
      if (mcpHostAI.isAvailable()) {
        logger.debug('Using AI-enhanced Dockerfile generation');
        processedContent = await generateAIDockerfile(analysisResult, config, mcpHostAI, logger);
        aiGenerated = true;
      } else {
        logger.debug('Using template-based Dockerfile generation');
        processedContent = generateTemplateDockerfile(analysisResult, config);
      }
    } catch (error) {
      logger.warn({ error }, 'AI generation failed, falling back to template');
      processedContent = generateTemplateDockerfile(analysisResult, config);
    }

    // Store AI generation info in workflow state
    if (aiGenerated) {
      const currentWorkflowState = session.workflow_state as WorkflowState | undefined;
      const updatedContext = updateWorkflowState(currentWorkflowState ?? {}, {
        metadata: {
          ...(currentWorkflowState?.metadata ?? {}),
          ai_enhancement_used: true,
          ai_generation_type: 'dockerfile',
          timestamp: new Date().toISOString(),
        },
      });
      await sessionManager.update(sessionId, {
        workflow_state: updatedContext,
      });
    }

    // Determine output path
    const repoPath = (session?.metadata?.repo_path as string) ?? '.';
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
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
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
      ok: true,
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
 * Generate dockerfile tool instance
 */
export const generateDockerfileTool = {
  name: 'generate-dockerfile',
  execute: (config: GenerateDockerfileConfig, logger: Logger) => generateDockerfile(config, logger),
};
