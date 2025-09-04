/**
 * Generate Dockerfile - Helper Functions
 */

import {
  buildDockerfileRequest,
  extractDockerfileVariables,
} from '../../../infrastructure/ai/index.js';
import type { ToolContext } from '../tool-types.js';
import type { AnalysisResult } from '../../../contracts/types/session.js';

interface DockerfileStage {
  name: string;
  baseImage: string;
  purpose: string;
}

interface DockerfileGenerationResult {
  content: string;
  stages?: DockerfileStage[];
  optimizations?: string[];
}

// Type for input options
interface DockerfileInput {
  baseImage?: string;
  optimization: 'size' | 'build-speed' | 'security' | 'balanced';
  multistage: boolean;
  optimizeSize: boolean;
  securityHardening: boolean;
  includeHealthcheck: boolean;
  customCommands: string[];
  customInstructions?: string;
}

// Dockerfile templates for different languages
const DOCKERFILE_TEMPLATES: Record<string, string> = {
  javascript: `# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Runtime stage
FROM node:18-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .
USER nodejs
EXPOSE 3000
CMD ["node", "index.js"]
`,
  typescript: `# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:18-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
USER nodejs
EXPOSE 3000
CMD ["node", "dist/index.js"]
`,
  python: `# Build stage
FROM python:3.11-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage
FROM python:3.11-slim
WORKDIR /app
RUN useradd -m -u 1001 python && chown -R python:python /app
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --chown=python:python . .
USER python
EXPOSE 8000
CMD ["python", "app.py"]
`,
  java: `# Build stage
FROM maven:3.9-openjdk-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn clean package -DskipTests

# Runtime stage
FROM openjdk:17-jdk-slim
WORKDIR /app
RUN groupadd -r java && useradd -r -g java java
COPY --from=builder --chown=java:java /app/target/*.jar app.jar
USER java
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`,
  go: `# Build stage
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /root/
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/main .
USER app
EXPOSE 8080
CMD ["./main"]
`,
};

/**
 * Generate Dockerfile content based on analysis
 */
export async function generateDockerfileContent(
  analysis: AnalysisResult,
  options: DockerfileInput,
  context: ToolContext,
): Promise<DockerfileGenerationResult> {
  const { logger, aiService } = context;

  // Use template as base fallback
  let baseTemplate = DOCKERFILE_TEMPLATES[analysis.language] || DOCKERFILE_TEMPLATES.javascript;

  // Enhanced AI generation
  try {
    // Use the AI service from context if available
    if (aiService) {
      // Build the AI request for Dockerfile generation
      const dockerfileVars = extractDockerfileVariables(analysis);

      // Merge with user options
      const mergedVars = {
        ...dockerfileVars,
        ...(options.baseImage && { baseImage: options.baseImage }),
        optimization: options.optimization,
        multistage: options.multistage,
        securityHardening: options.securityHardening,
        includeHealthcheck: options.includeHealthcheck,
        customInstructions: options.customInstructions ?? undefined,
      };

      const requestBuilder = buildDockerfileRequest(mergedVars, {
        temperature: 0.3,
        maxTokens: 3000,
      });

      const result = await aiService.generate(requestBuilder);

      if (result.data) {
        baseTemplate = result.data;

        // Log AI generation with metadata
        logger.info(
          {
            model: result.metadata.model,
            tokensUsed: result.metadata.tokensUsed,
            fromCache: result.metadata.fromCache,
            durationMs: result.metadata.durationMs,
          },
          'AI-generated Dockerfile successfully',
        );
      }
    } else {
      // If no AI service is available, use the optimized static generation
      logger.info('Using optimized template generation (AI service not available)');
      baseTemplate = generateOptimizedDockerfile(analysis, options);
    }
  } catch (error) {
    logger.warn({ error }, 'AI-enhanced generation failed, using template fallback');
    // Fall back to static generation
    baseTemplate = generateOptimizedDockerfile(analysis, options);
  }

  // Apply optimizations
  const optimizations: string[] = [];
  let content = baseTemplate;

  if (!content) {
    throw new Error('Failed to generate Dockerfile content');
  }

  if (options.optimizeSize) {
    optimizations.push('Multi-stage build for smaller image');
    optimizations.push('Alpine base images where possible');
    optimizations.push('Combined RUN commands to reduce layers');
  }

  if (options.securityHardening) {
    optimizations.push('Non-root user execution');
    optimizations.push('Minimal base images');
    optimizations.push('No unnecessary packages');

    // Ensure non-root user if not present
    if (!content.includes('USER ') && !content.includes('adduser')) {
      const userSetup = `
# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser
USER appuser`;
      content = content.replace(/EXPOSE/g, `${userSetup}\nEXPOSE`);
    }
  }

  if (options.includeHealthcheck) {
    optimizations.push('Health check endpoint');
    const port = analysis.ports?.[0] || 3000;
    const healthcheck = `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/health || exit 1`;

    if (!content.includes('HEALTHCHECK')) {
      content = content.replace(/CMD \[/, `${healthcheck}\n\nCMD [`);
    }
  }

  // Add custom commands
  if (options.customCommands.length > 0) {
    const customSection = `
# Custom commands
${options.customCommands.map((cmd) => `RUN ${cmd}`).join('\n')}`;
    content = content.replace(/USER /, `${customSection}\n\nUSER `);
  }

  // Parse stages from content
  const stages: DockerfileStage[] = [];
  const stageRegex = /FROM .* AS (\w+)/g;
  let match;
  while ((match = stageRegex.exec(content)) !== null) {
    const baseImage = match[0].split(' ')[1];
    if (match[1] && baseImage) {
      stages.push({
        name: match[1],
        baseImage,
        purpose: match[1] === 'builder' ? 'Build dependencies and compile' : 'Runtime environment',
      });
    }
  }

  // Add final stage if no named stages
  if (stages.length === 0) {
    const finalFrom = content.match(/FROM ([\w:.-]+)/);
    if (finalFrom?.[1]) {
      stages.push({
        name: 'runtime',
        baseImage: finalFrom[1],
        purpose: 'Single-stage runtime',
      });
    }
  }

  return { content, stages, optimizations };
}

/**
 * Generate optimized Dockerfile based on analysis and options
 */
function generateOptimizedDockerfile(analysis: AnalysisResult, options: DockerfileInput): string {
  const baseImage = options.baseImage ?? getRecommendedBaseImage(analysis.language);
  const framework = analysis.framework ?? '';
  const deps = analysis.dependencies?.map((d: any) => d.name) || [];

  // Build optimized Dockerfile content
  let dockerfile = `# AI-Optimized Dockerfile for ${analysis.language}${framework ? ` (${framework})` : ''}
# Generated on ${new Date().toISOString()}

`;

  if (options.multistage && deps.length > 5) {
    dockerfile += `# Build stage
FROM ${baseImage} AS builder
WORKDIR /app

# Copy dependency files first for better caching
${getBuildCommands(analysis, 'build')}

# Runtime stage
FROM ${baseImage.includes('alpine') ? baseImage : baseImage.replace(/:\d+/, ':alpine')}
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
    const primaryPort = ports[0] || 3000;
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
${options.customCommands.map((cmd) => `RUN ${cmd}`).join('\n')}
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
    return 'CMD ["node", "index.js"]';
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

  return imageMap[language] || 'alpine:3.19';
}

/**
 * Analyze Dockerfile for security issues
 */
export function analyzeDockerfileSecurity(content: string): string[] {
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
 * Estimate image size based on language and dependencies
 */
export function estimateImageSize(
  language: string,
  dependencies: string[],
  multistage: boolean,
): string {
  // Updated base sizes with Node 20 and more accurate estimates
  const baseSizes: Record<string, number> = {
    'node:20-alpine': 55,
    'node:20': 380,
    'node:18-alpine': 50,
    'node:18': 350,
    'python:3.12-slim': 125,
    'python:3.11-slim': 120,
    'python:3.11': 380,
    'openjdk:17-jdk-slim': 420,
    'openjdk:11-jdk-slim': 400,
    'golang:1.21-alpine': 350,
    'golang:1.20-alpine': 330,
    'alpine:3.19': 5,
    'alpine:3.18': 5,
    'ubuntu:22.04': 77,
    'ubuntu:20.04': 72,
    'debian:12-slim': 74,
    'debian:11-slim': 69,
  };

  // Try to match the base image more accurately
  let baseSize = 100; // default
  for (const [image, size] of Object.entries(baseSizes)) {
    const langBase = language.split(':')[0];
    if (langBase && (language.includes(image) || image.includes(langBase))) {
      baseSize = size;
      break;
    }
  }

  let estimatedSize = baseSize;

  // More accurate dependency overhead calculation
  // Different dependency types have different sizes
  const depOverhead = dependencies.reduce((total, dep) => {
    // Large dependencies
    if (dep.includes('tensorflow') || dep.includes('torch') || dep.includes('opencv')) {
      return total + 500;
    }
    // Medium dependencies
    if (dep.includes('pandas') || dep.includes('numpy') || dep.includes('react')) {
      return total + 50;
    }
    // Development dependencies (if not using multistage, they add to size)
    if (
      !multistage &&
      (dep.includes('webpack') || dep.includes('typescript') || dep.includes('eslint'))
    ) {
      return total + 30;
    }
    // Default small dependency
    return total + 2;
  }, 0);

  estimatedSize += depOverhead;

  // Add application code estimate (assuming ~10-50MB for typical apps)
  estimatedSize += 25;

  // Multistage reduces final size by removing build tools
  if (multistage) {
    // More realistic reduction - removes dev dependencies and build artifacts
    estimatedSize = Math.round(estimatedSize * 0.6);
  }

  // Add layer overhead (~10%)
  estimatedSize = Math.round(estimatedSize * 1.1);

  // Format output
  if (estimatedSize < 1000) {
    return `~${estimatedSize}MB`;
  } else {
    return `~${(estimatedSize / 1000).toFixed(1)}GB`;
  }
}
