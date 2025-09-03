/**
 * Analyze Repository - Enhanced with AI Optimization
 */

import { z } from 'zod';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import { AIRequestBuilder } from '../../../infrastructure/ai-request-builder.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';

// Input schema with support for both snake_case and camelCase
const AnalyzeRepositoryInput = z
  .object({
    repo_path: z.string().optional(),
    repoPath: z.string().optional(),
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    depth: z.enum(['shallow', 'deep']).default('deep'),
    include_tests: z.boolean().default(true),
    includeTests: z.boolean().optional()
  })
  .transform((data) => ({
    repoPath: data.repo_path ?? data.repoPath ?? process.cwd(),
    sessionId: data.session_id ?? data.sessionId,
    depth: data.depth,
    includeTests: data.include_tests ?? data.includeTests ?? true
  }));

// Output schema
const AnalyzeRepositoryOutput = z.object({
  success: z.boolean(),
  sessionId: z.string(),
  language: z.string(),
  languageVersion: z.string().optional(),
  framework: z.string().optional(),
  frameworkVersion: z.string().optional(),
  buildSystem: z
    .object({
      type: z.string(),
      buildFile: z.string(),
      buildCommand: z.string().optional(),
      testCommand: z.string().optional()
    })
    .optional(),
  dependencies: z.array(
    z.object({
      name: z.string(),
      version: z.string().optional(),
      type: z.enum(['runtime', 'dev', 'test']).optional()
    })
  ),
  ports: z.array(z.number()),
  hasDockerfile: z.boolean(),
  hasDockerCompose: z.boolean(),
  hasKubernetes: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  recommendations: z
    .object({
      baseImage: z.string().optional(),
      buildStrategy: z.string().optional(),
      securityNotes: z.array(z.string()).optional()
    })
    .optional()
});

// Type aliases
export type AnalyzeInput = z.infer<typeof AnalyzeRepositoryInput>;
export type AnalyzeOutput = z.infer<typeof AnalyzeRepositoryOutput>;

// Language detection configuration
interface LanguageSignature {
  extensions: string[];
  files: string[];
  patterns?: RegExp[];
}

const LANGUAGE_SIGNATURES: Record<string, LanguageSignature> = {
  javascript: {
    extensions: ['.js', '.mjs', '.cjs'],
    files: ['package.json', 'node_modules'],
    patterns: [/^import .* from/, /^const .* = require/]
  },
  typescript: {
    extensions: ['.ts', '.tsx'],
    files: ['tsconfig.json', 'package.json'],
    patterns: [/^import .* from/, /^export (class|interface|type)/]
  },
  python: {
    extensions: ['.py'],
    files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
    patterns: [/^import /, /^from .* import/]
  },
  java: {
    extensions: ['.java'],
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    patterns: [/^package /, /^import /]
  },
  go: {
    extensions: ['.go'],
    files: ['go.mod', 'go.sum'],
    patterns: [/^package /, /^import \(/]
  },
  rust: {
    extensions: ['.rs'],
    files: ['Cargo.toml', 'Cargo.lock'],
    patterns: [/^use /, /^mod /]
  },
  ruby: {
    extensions: ['.rb'],
    files: ['Gemfile', 'Gemfile.lock', 'Rakefile'],
    patterns: [/^require /, /^class .* </, /^module /]
  },
  php: {
    extensions: ['.php'],
    files: ['composer.json', 'composer.lock'],
    patterns: [/^<\?php/, /^namespace /, /^use /]
  }
};

// Framework detection configuration
const FRAMEWORK_SIGNATURES: Record<string, { files: string[]; dependencies?: string[] }> = {
  express: { files: [], dependencies: ['express'] },
  nestjs: { files: ['nest-cli.json'], dependencies: ['@nestjs/core'] },
  nextjs: { files: ['next.config.js', 'next.config.mjs'], dependencies: ['next'] },
  react: { files: [], dependencies: ['react', 'react-dom'] },
  vue: { files: ['vue.config.js'], dependencies: ['vue'] },
  angular: { files: ['angular.json'], dependencies: ['@angular/core'] },
  django: { files: ['manage.py'], dependencies: ['django'] },
  flask: { files: [], dependencies: ['flask'] },
  fastapi: { files: [], dependencies: ['fastapi'] },
  spring: { files: ['pom.xml', 'build.gradle'], dependencies: [] },
  rails: { files: ['Gemfile'], dependencies: ['rails'] },
  laravel: { files: ['artisan'], dependencies: [] }
};

// Build system detection
const BUILD_SYSTEMS = {
  npm: { file: 'package.json', buildCmd: 'npm run build', testCmd: 'npm test' },
  yarn: { file: 'yarn.lock', buildCmd: 'yarn build', testCmd: 'yarn test' },
  pnpm: { file: 'pnpm-lock.yaml', buildCmd: 'pnpm build', testCmd: 'pnpm test' },
  maven: { file: 'pom.xml', buildCmd: 'mvn package', testCmd: 'mvn test' },
  gradle: { file: 'build.gradle', buildCmd: 'gradle build', testCmd: 'gradle test' },
  cargo: { file: 'Cargo.toml', buildCmd: 'cargo build --release', testCmd: 'cargo test' },
  go: { file: 'go.mod', buildCmd: 'go build', testCmd: 'go test ./...' },
  pip: { file: 'requirements.txt', buildCmd: 'python setup.py build', testCmd: 'pytest' },
  poetry: { file: 'pyproject.toml', buildCmd: 'poetry build', testCmd: 'poetry run pytest' },
  composer: { file: 'composer.json', buildCmd: 'composer install', testCmd: 'phpunit' },
  bundler: { file: 'Gemfile', buildCmd: 'bundle install', testCmd: 'bundle exec rspec' }
};

/**
 * Validate repository path exists and is accessible
 */
async function validateRepositoryPath(
  repoPath: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const stats = await fs.stat(repoPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Path is not a directory' };
    }
    await fs.access(repoPath, fs.constants.R_OK);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Cannot access repository: ${String(error)}` };
  }
}

/**
 * Detect primary programming language
 */
async function detectLanguage(repoPath: string): Promise<{ language: string; version?: string }> {
  const files = await fs.readdir(repoPath);
  const fileStats = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(repoPath, file);
      const stats = await fs.stat(filePath);
      return { name: file, path: filePath, isFile: stats.isFile() };
    })
  );

  // Count file extensions
  const extensionCounts: Record<string, number> = {};
  for (const file of fileStats.filter((f) => f.isFile)) {
    const ext = path.extname(file.name);
    if (ext) {
      extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
    }
  }

  // Check for language signatures
  for (const [lang, signature] of Object.entries(LANGUAGE_SIGNATURES)) {
    // Check for specific files
    const hasFiles = signature.files?.some((f) => files.includes(f)) || false;
    if (hasFiles) {
      return { language: lang };
    }

    // Check for extensions
    const hasExtensions =
      signature.extensions?.some((ext) => (extensionCounts[ext] ?? 0) > 0) || false;
    if (hasExtensions) {
      return { language: lang };
    }
  }

  // Default to most common extension
  const mostCommonExt = Object.entries(extensionCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

  if (mostCommonExt != null) {
    for (const [lang, signature] of Object.entries(LANGUAGE_SIGNATURES)) {
      if (signature.extensions?.includes(mostCommonExt)) {
        return { language: lang };
      }
    }
  }

  return { language: 'unknown' };
}

/**
 * Detect framework
 */
async function detectFramework(
  repoPath: string,
  language: string
): Promise<{ framework?: string; version?: string }> {
  const files = await fs.readdir(repoPath);

  // Check for framework-specific files
  for (const [framework, signature] of Object.entries(FRAMEWORK_SIGNATURES)) {
    if (signature.files.some((f) => files.includes(f))) {
      return { framework };
    }
  }

  // Check package.json for Node.js projects
  if (language === 'javascript' || language === 'typescript') {
    const packageJsonPath = path.join(repoPath, 'package.json');
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {})
      };

      for (const [framework, signature] of Object.entries(FRAMEWORK_SIGNATURES)) {
        if (
          signature.dependencies != null &&
          signature.dependencies.some((dep) => dep in allDeps)
        ) {
          const firstDep = signature.dependencies?.[0];
          return { framework, version: firstDep != null ? allDeps[firstDep] : undefined };
        }
      }
    } catch {
      // Ignore JSON parsing errors
    }
  }

  return {};
}

/**
 * Detect build system
 */
async function detectBuildSystem(
  repoPath: string
): Promise<((typeof BUILD_SYSTEMS)[keyof typeof BUILD_SYSTEMS] & { type: string }) | undefined> {
  const files = await fs.readdir(repoPath);

  for (const [type, config] of Object.entries(BUILD_SYSTEMS)) {
    if (files.includes(config.file)) {
      return { type, ...config };
    }
  }

  return undefined;
}

/**
 * Analyze dependencies
 */
async function analyzeDependencies(
  repoPath: string,
  language: string
): Promise<Array<{ name: string; version?: string; type?: 'runtime' | 'dev' | 'test' }>> {
  const dependencies: Array<{ name: string; version?: string; type?: 'runtime' | 'dev' | 'test' }> =
    [];

  try {
    if (language === 'javascript' || language === 'typescript') {
      const packageJsonPath = path.join(repoPath, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      // Runtime dependencies
      Object.entries(packageJson.dependencies ?? {}).forEach(([name, version]) => {
        dependencies.push({ name, version: String(version), type: 'runtime' });
      });

      // Dev dependencies
      Object.entries(packageJson.devDependencies ?? {}).forEach(([name, version]) => {
        dependencies.push({ name, version: String(version), type: 'dev' });
      });
    } else if (language === 'python') {
      const requirementsPath = path.join(repoPath, 'requirements.txt');
      try {
        const requirements = await fs.readFile(requirementsPath, 'utf-8');
        requirements
          .split('\n')
          .filter((line) => line.trim() !== '' && !line.startsWith('#'))
          .forEach((line) => {
            const match = line.match(/^([^<>=\s]+)([<>=]+(.+))?/);
            if (match?.[1] != null) {
              const entry: { name: string; type?: 'runtime'; version?: string } = {
                name: match[1].trim(),
                type: 'runtime'
              };
              if (match[3]?.trim()) {
                entry.version = match[3].trim();
              }
              dependencies.push(entry);
            }
          });
      } catch {}
    } else if (language === 'java') {
      // Parse pom.xml or build.gradle for dependencies
      // This would require XML/Gradle parsing
    }
  } catch {}

  return dependencies;
}

/**
 * Detect exposed ports
 */
async function detectPorts(repoPath: string, language: string): Promise<number[]> {
  const ports: Set<number> = new Set();

  // Check for environment configuration
  try {
    const envPath = path.join(repoPath, '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    const portMatch = envContent.match(/PORT\s*=\s*(\d+)/);
    if (portMatch?.[1]) {
      ports.add(parseInt(portMatch[1]));
    }
  } catch {}

  // Check package.json scripts
  if (language === 'javascript' || language === 'typescript') {
    try {
      const packageJsonPath = path.join(repoPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const scripts = JSON.stringify(packageJson.scripts ?? {});
      const portMatches = scripts.matchAll(/--port[= ](\d+)/g);
      for (const match of portMatches) {
        if (match[1]) {
          ports.add(parseInt(match[1]));
        }
      }
    } catch {}
  }

  return Array.from(ports);
}

/**
 * Check for Docker files
 */
async function checkDockerFiles(
  repoPath: string
): Promise<{ hasDockerfile: boolean; hasDockerCompose: boolean; hasKubernetes: boolean }> {
  const files = await fs.readdir(repoPath);

  return {
    hasDockerfile: files.includes('Dockerfile') || files.includes('dockerfile'),
    hasDockerCompose: files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
    hasKubernetes: files.includes('k8s') || files.includes('kubernetes') || files.includes('.k8s')
  };
}

/**
 * Main handler implementation
 */
const analyzeRepositoryHandler: MCPToolDescriptor<AnalyzeInput, AnalyzeOutput> = {
  name: 'analyze_repository',
  description: 'Analyze repository structure and detect language, framework, and build system',
  category: 'workflow',
  inputSchema: AnalyzeRepositoryInput,
  outputSchema: AnalyzeRepositoryOutput,

  handler: async (input: AnalyzeInput, context: MCPToolContext): Promise<AnalyzeOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { repoPath, sessionId: inputSessionId, depth, includeTests } = input;

    logger.info(
      {
        repoPath,
        depth,
        includeTests
      },
      'Starting repository analysis'
    );

    try {
      // Validate repository path
      const validation = await validateRepositoryPath(repoPath);
      if (!validation.valid) {
        throw new DomainError(
          ErrorCode.InvalidInput,
          validation.error || 'Invalid repository path'
        );
      }

      // Create or get session
      let sessionId = inputSessionId;
      if (!sessionId && sessionService) {
        const session = await sessionService.create({
          projectName: path.basename(repoPath),
          metadata: {
            repoPath,
            analysisDepth: depth,
            includeTests
          }
        });
        sessionId = session.id;
      }

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'analyze_repository',
          status: 'in_progress',
          message: 'Analyzing repository structure',
          progress: 0.1
        });
      }

      // Perform basic analysis
      const languageInfo = await detectLanguage(repoPath);
      const frameworkInfo = await detectFramework(repoPath, languageInfo.language);
      const buildSystemRaw = await detectBuildSystem(repoPath);
      const dependencies = await analyzeDependencies(repoPath, languageInfo.language);
      const ports = await detectPorts(repoPath, languageInfo.language);
      const dockerInfo = await checkDockerFiles(repoPath);

      // Enhanced AI analysis if available
      let aiEnhancements: any = {};
      try {
        if (context.aiService) {
          // Gather file structure for AI context
          const fileList = await gatherFileStructure(repoPath, depth === 'deep' ? 3 : 1);

          // Build AI request for repository analysis
          const requestBuilder = new AIRequestBuilder()
            .template('repository-analysis' as unknown)
            .withModel('claude-3-haiku-20240307')
            .withSampling(0.3, 2000)
            .withVariables({
              fileList: fileList.slice(0, 30).join('\n'),
              configFiles: JSON.stringify({
                hasDockerfile: dockerInfo.hasDockerfile,
                hasDockerCompose: dockerInfo.hasDockerCompose,
                hasKubernetes: dockerInfo.hasKubernetes
              }),
              directoryTree: fileList.slice(0, 20).join('\n'),
              language: languageInfo.language,
              framework: frameworkInfo.framework || 'none',
              dependencies: dependencies
                .map((d) => d.name)
                .slice(0, 20)
                .join(', '),
              buildSystem: buildSystemRaw?.type || 'none'
            });

          const result = await context.aiService.generate<string>(requestBuilder);

          if (result.data) {
            try {
              // Try to parse structured response
              const parsed = JSON.parse(result.data);
              aiEnhancements = {
                aiInsights: parsed.insights ?? result.data,
                suggestedOptimizations: parsed.optimizations || [],
                securityRecommendations: parsed.security || [],
                recommendedBaseImage: parsed.baseImage,
                recommendedBuildStrategy: parsed.buildStrategy
              };
            } catch {
              // Fallback to raw content
              aiEnhancements = {
                aiInsights: result.data,
                fromCache: result.metadata.fromCache,
                tokensUsed: result.metadata.tokensUsed
              };
            }

            // Log AI analysis metadata
            logger.info(
              {
                model: result.metadata.model,
                tokensUsed: result.metadata.tokensUsed,
                fromCache: result.metadata.fromCache,
                durationMs: result.metadata.durationMs
              },
              'AI-enhanced repository analysis completed'
            );
          }
        } else {
          logger.debug('AI service not available, using basic analysis');
        }
      } catch (error) {
        logger.warn({ error }, 'AI enhancement failed, continuing with basic analysis');
      }

      // Transform buildSystem to match schema structure
      const buildSystem = buildSystemRaw
        ? {
            type: buildSystemRaw.type,
            build_file: buildSystemRaw.file,
            build_command: buildSystemRaw.buildCmd,
            test_command: buildSystemRaw.testCmd
          }
        : undefined;

      // Emit progress
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'analyze_repository',
          status: 'in_progress',
          message: 'Finalizing analysis',
          progress: 0.8
        });
      }

      // Build enhanced recommendations
      const baseRecommendations = {
        baseImage: getRecommendedBaseImage(languageInfo.language, frameworkInfo.framework),
        buildStrategy: buildSystem ? 'multi-stage' : 'single-stage',
        securityNotes: getSecurityRecommendations(dependencies)
      };

      // Merge with AI enhancements
      const recommendations = {
        ...baseRecommendations,
        ...(aiEnhancements.suggestedOptimizations && {
          aiOptimizations: aiEnhancements.suggestedOptimizations
        }),
        ...(aiEnhancements.securityRecommendations && {
          aiSecurity: aiEnhancements.securityRecommendations
        })
      };

      // Store analysis in session
      if (sessionService && sessionId) {
        await sessionService.updateAtomic(sessionId, (session) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            analysis_result: {
              language: languageInfo.language,
              framework: frameworkInfo.framework,
              build_system: buildSystem,
              dependencies,
              ports,
              has_tests: dependencies.some((dep) => dep.type === 'test') || false,
              docker_compose_exists: dockerInfo.hasDockerCompose ?? false,
              ...dockerInfo,
              recommendations
            }
          }
        }));
      }

      // Emit completion
      if (progressEmitter && sessionId) {
        await progressEmitter.emit({
          sessionId,
          step: 'analyze_repository',
          status: 'completed',
          message: 'Repository analysis complete',
          progress: 1.0
        });
      }

      // Construct response carefully to handle exactOptionalPropertyTypes
      const response: AnalyzeOutput = {
        success: true,
        sessionId: sessionId || 'temp-session',
        language: languageInfo.language,
        dependencies,
        ports,
        ...dockerInfo
      };

      // Only add optional properties if they have defined values
      if (languageInfo.version !== undefined) {
        response.languageVersion = languageInfo.version;
      }

      if (frameworkInfo.framework !== undefined) {
        response.framework = frameworkInfo.framework;
      }

      if (frameworkInfo.version !== undefined) {
        response.frameworkVersion = frameworkInfo.version;
      }

      if (buildSystem !== undefined) {
        response.buildSystem = {
          type: buildSystem.type,
          buildFile: buildSystem.build_file,
          buildCommand: buildSystem.build_command,
          testCommand: buildSystem.test_command
        };
      }

      if (recommendations !== undefined) {
        response.recommendations = recommendations;
      }

      // Add metadata with AI enhancements
      response.metadata = {
        repoPath,
        depth,
        includeTests,
        timestamp: new Date().toISOString(),
        ...(aiEnhancements.aiInsights && { aiInsights: aiEnhancements.aiInsights }),
        ...(aiEnhancements.aiTokenUsage && { aiTokenUsage: aiEnhancements.aiTokenUsage })
      };

      return response;
    } catch (error) {
      logger.error({ error }, 'Error occurred'); // Fixed logger call
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'generate_dockerfile',
    reason: 'Generate Dockerfile based on repository analysis',
    paramMapper: (output) => ({
      session_id: output.sessionId,
      language: output.language,
      framework: output.framework,
      base_image: output.recommendations?.baseImage
    })
  }
};

/**
 * Get recommended base image for language/framework
 */
function getRecommendedBaseImage(language: string, framework?: string): string {
  const imageMap: Record<string, string> = {
    javascript: 'node:18-alpine',
    typescript: 'node:18-alpine',
    python: 'python:3.11-slim',
    java: 'openjdk:17-jdk-slim',
    go: 'golang:1.21-alpine',
    rust: 'rust:1.75-slim',
    ruby: 'ruby:3.2-slim',
    php: 'php:8.2-fpm-alpine'
  };

  // Framework-specific overrides
  if (framework === 'nextjs') return 'node:18-alpine';
  if (framework === 'django') return 'python:3.11-slim';
  if (framework === 'spring') return 'openjdk:17-jdk-slim';

  return imageMap[language] || 'alpine:latest';
}

/**
 * Get security recommendations based on dependencies
 */
function getSecurityRecommendations(
  dependencies: Array<{ name: string; version?: string; type?: 'runtime' | 'dev' | 'test' }>
): string[] {
  const recommendations: string[] = [];

  // Check for known vulnerable packages
  const vulnerablePackages = ['request', 'node-uuid', 'minimist<1.2.6'];
  const foundVulnerable = dependencies.filter((dep) =>
    vulnerablePackages.some((vuln) => dep.name.includes(vuln.split('<')[0] || ''))
  );

  if (foundVulnerable.length > 0) {
    recommendations.push(
      `Update vulnerable packages: ${foundVulnerable.map((d) => d.name).join(', ')}`
    );
  }

  // General recommendations
  if (dependencies.length > 50) {
    recommendations.push('Consider using multi-stage builds to reduce final image size');
  }

  recommendations.push('Run container as non-root user');
  recommendations.push('Use specific version tags instead of :latest');

  return recommendations;
}

/**
 * Gather file structure for AI context
 */
async function gatherFileStructure(repoPath: string, maxDepth: number = 2): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await fs.readdir(dir);

      for (const entry of entries) {
        // Skip common ignore patterns
        if (
          [
            '.git',
            'node_modules',
            '.next',
            'dist',
            'build',
            '.vscode',
            '.idea',
            '__pycache__'
          ].includes(entry)
        ) {
          continue;
        }

        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(repoPath, fullPath);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
          files.push(`📁 ${relativePath}/`);
          await walkDir(fullPath, currentDepth + 1);
        } else {
          const ext = path.extname(entry);
          const icon = getFileIcon(ext);
          files.push(`${icon} ${relativePath}`);
        }
      }
    } catch (error) {
      // Skip inaccessible directories
    }
  }

  await walkDir(repoPath, 0);
  return files;
}

/**
 * Get appropriate icon for file type
 */
function getFileIcon(extension: string): string {
  const iconMap: Record<string, string> = {
    '.js': '📜',
    '.ts': '📘',
    '.tsx': '📘',
    '.jsx': '📜',
    '.py': '🐍',
    '.java': '☕',
    '.go': '🐹',
    '.rs': '🦀',
    '.rb': '💎',
    '.php': '🐘',
    '.dockerfile': '🐳',
    '.json': '📋',
    '.yaml': '📄',
    '.yml': '📄',
    '.md': '📖',
    '.txt': '📝'
  };

  return iconMap[extension.toLowerCase()] || '📄';
}

// Default export for registry
export default analyzeRepositoryHandler;
