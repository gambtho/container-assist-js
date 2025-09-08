/**
 * Generate optimized Dockerfiles based on repository analysis
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../../lib/session';
import { createTimer, type Logger } from '../../lib/logger';
import {
  Success,
  Failure,
  type Result,
  updateWorkflowState,
  type WorkflowState,
} from '../../domain/types';
import { getDefaultPort, DEFAULT_NETWORK, DEFAULT_CONTAINER } from '../../config/defaults';
import { getRecommendedBaseImage } from '../../lib/base-images';
import {
  stripFencesAndNoise,
  isValidDockerfileContent,
  extractBaseImage,
  parseInstructions,
} from '../../lib/text-processing';
import type { ToolContext } from '../../mcp/context/types';

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
 * Normalized arguments for Dockerfile prompt
 */
interface DockerfilePromptArgs extends Record<string, unknown> {
  language: string; // required - normalized language name
  framework?: string | undefined; // optional - framework if detected
  ports?: string | undefined; // optional - comma-separated port numbers
  baseImage?: string | undefined; // optional - suggested base image
  requirements?: string | undefined; // optional - dependency information
  repoSummary: string; // required - bounded 2-4 sentences
}

/**
 * Repository analysis structure from session
 */
interface RepoAnalysis {
  language?: string;
  framework?: string;
  dependencies?: Array<{ name: string }>;
  ports?: number[];
  build_system?: { type?: string };
  summary?: string;
}

/**
 * Normalize language name to standard format
 */
function normalizeLanguage(language?: string): string {
  if (!language) return 'Node.js';

  const normalized = language.toLowerCase();
  const languageMap: Record<string, string> = {
    javascript: 'Node.js',
    js: 'Node.js',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    python: 'Python',
    py: 'Python',
    java: 'Java',
    go: 'Go',
    golang: 'Go',
    rust: 'Rust',
    dotnet: '.NET',
    csharp: 'C#',
    'c#': 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
  };

  return languageMap[normalized] || language.charAt(0).toUpperCase() + language.slice(1);
}

/**
 * Normalize ports to comma-separated string
 */
function normalizePorts(ports?: number[]): string | undefined {
  if (!ports || ports.length === 0) return undefined;
  return ports.join(', ');
}

/**
 * Suggest base image based on analysis
 */
function suggestBaseImage(analysis: RepoAnalysis): string | undefined {
  if (!analysis.language) return undefined;
  return getRecommendedBaseImage(analysis.language);
}

/**
 * Format requirements/dependencies for prompt
 */
function formatRequirements(dependencies?: Array<{ name: string }>): string | undefined {
  if (!dependencies || dependencies.length === 0) return undefined;

  const depNames = dependencies.slice(0, 10).map((d) => d.name); // Limit to first 10 deps
  if (dependencies.length > 10) {
    return `${depNames.join(', ')} and ${dependencies.length - 10} others`;
  }
  return depNames.join(', ');
}

/**
 * Create a bounded summary (2-4 sentences)
 */
function boundSummary(
  summary?: string,
  minSentences: number = 2,
  maxSentences: number = 4,
): string {
  if (!summary) {
    return 'This is a repository that needs containerization. The Dockerfile will be generated based on detected language and framework.';
  }

  // Split into sentences and bound to 2-4
  const sentences = summary.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

  if (sentences.length < minSentences) {
    return `${summary} The Dockerfile will be optimized for this application's specific requirements.`;
  }

  if (sentences.length <= maxSentences) {
    return sentences.join(' ').trim();
  }

  return sentences.slice(0, maxSentences).join(' ').trim();
}

/**
 * Build normalized arguments from analysis for prompting
 */
function buildArgsFromAnalysis(analysis: RepoAnalysis): DockerfilePromptArgs {
  return {
    language: normalizeLanguage(analysis.language),
    ...(analysis.framework && { framework: analysis.framework }),
    ...(normalizePorts(analysis.ports) && { ports: normalizePorts(analysis.ports) }),
    ...(suggestBaseImage(analysis) && { baseImage: suggestBaseImage(analysis) }),
    ...(formatRequirements(analysis.dependencies) && {
      requirements: formatRequirements(analysis.dependencies),
    }),
    repoSummary: boundSummary(analysis.summary),
  };
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
 * Process AI response and extract Dockerfile content
 * @param response - AI sampling response
 * @param analysis - Repository analysis for fallback
 * @returns Result with processed Dockerfile or error
 */
async function processDockerfileResponse(response: string): Promise<
  Result<{
    dockerfile: string;
    aiUsed: boolean;
    baseImage: string | null;
    instructions: Array<{ instruction: string; content: string }>;
  }>
> {
  try {
    // Strip code fences and clean the response
    const cleaned = stripFencesAndNoise(response);

    // Validate Dockerfile format
    if (!isValidDockerfileContent(cleaned)) {
      throw new Error('Invalid Dockerfile format - missing FROM instruction');
    }

    return Success({
      dockerfile: cleaned,
      aiUsed: true,
      baseImage: extractBaseImage(cleaned),
      instructions: parseInstructions(cleaned),
    });
  } catch (error) {
    return Failure(
      `Failed to process AI response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Generate fallback Dockerfile when AI is unavailable
 * @param analysis - Repository analysis
 * @param config - Generation configuration
 * @returns Result with fallback Dockerfile
 */
function generateFallbackDockerfile(
  analysis: RepoAnalysis,
  config: GenerateDockerfileConfig,
): Result<{
  dockerfile: string;
  aiUsed: boolean;
  baseImage: string | null;
  instructions: Array<{ instruction: string; content: string }>;
}> {
  const dockerfile = generateTemplateDockerfile(analysis, config);

  return Success({
    dockerfile,
    aiUsed: false,
    baseImage: extractBaseImage(dockerfile),
    instructions: parseInstructions(dockerfile),
  });
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
 * @param context - Tool context for MCP operations (optional for backward compatibility)
 * @returns Promise resolving to Result with generated Dockerfile content and metadata
 */
export async function generateDockerfile(
  config: GenerateDockerfileConfig,
  logger: Logger,
  context?: ToolContext,
): Promise<Result<GenerateDockerfileResult>> {
  const timer = createTimer(logger, 'generate-dockerfile');

  try {
    const { sessionId, optimization = true, multistage = true, securityHardening = true } = config;

    logger.info({ sessionId, optimization, multistage }, 'Generating Dockerfile');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Get or create session
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
    }

    // Get analysis result from session
    const workflowState = session.workflow_state as
      | {
          analysis_result?: RepoAnalysis;
        }
      | null
      | undefined;
    const analysisResult = workflowState?.analysis_result;
    if (!analysisResult) {
      return Failure('Repository must be analyzed first - run analyze_repo');
    }

    // Generate Dockerfile content - try AI first if context available, then fallback
    let dockerfileResult: Result<{
      dockerfile: string;
      aiUsed: boolean;
      baseImage: string | null;
      instructions: Array<{ instruction: string; content: string }>;
    }>;

    if (context) {
      // Try AI generation using new ToolContext pattern
      try {
        logger.debug('Using AI-enhanced Dockerfile generation with ToolContext');

        // 1. Build normalized arguments
        const argsFromAnalysis = buildArgsFromAnalysis(analysisResult);

        // 2. Get prompt with arguments
        const { description, messages } = await context.getPrompt(
          'generate-dockerfile',
          argsFromAnalysis,
        );

        logger.debug(
          {
            prompt: description,
            language: argsFromAnalysis.language,
            framework: argsFromAnalysis.framework,
          },
          'Generated prompt for AI',
        );

        // 3. Single sampling call with proper configuration
        const response = await context.sampling.createMessage({
          messages,
          includeContext: 'thisServer',
          modelPreferences: {
            hints: [{ name: 'code' }],
          },
          stopSequences: ['```', '\n\n```', '\n\n# ', '\n\n---'],
          maxTokens: 2048,
        });

        // Extract text from response content array
        const responseText = response.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n')
          .trim();

        logger.debug({ responseLength: responseText.length }, 'Received AI response');

        // 4. Process response
        dockerfileResult = await processDockerfileResponse(responseText);
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'AI generation failed, using fallback',
        );
        dockerfileResult = generateFallbackDockerfile(analysisResult, config);
      }
    } else {
      logger.debug('No ToolContext provided, using template-based generation');
      dockerfileResult = generateFallbackDockerfile(analysisResult, config);
    }

    if (!dockerfileResult.ok) {
      return dockerfileResult;
    }

    const {
      dockerfile: processedContent,
      aiUsed,
      baseImage: detectedBaseImage,
    } = dockerfileResult.value;

    // Store AI generation info in workflow state
    if (aiUsed) {
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
          detectedBaseImage ??
          config.baseImage ??
          getRecommendedBaseImage(analysisResult.language ?? 'unknown'),
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
      baseImage:
        detectedBaseImage ??
        config.baseImage ??
        getRecommendedBaseImage(analysisResult.language ?? 'unknown'),
      optimization,
      multistage,
      ...(warnings.length > 0 && { warnings }),
    } as GenerateDockerfileResult);
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
  execute: (config: GenerateDockerfileConfig, logger: Logger, context?: ToolContext) =>
    generateDockerfile(config, logger, context),
};
