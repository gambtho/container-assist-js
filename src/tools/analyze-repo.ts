/**
 * Analyze Repository Tool - Flat Architecture
 *
 * Analyzes repository structure and detects language, framework, and build system
 * Follows architectural requirement: only imports from src/lib/
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '../lib/session';
import { createAIService } from '../lib/ai';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';
import { DEFAULT_PORTS } from '../config/defaults';

export interface AnalyzeRepoConfig {
  sessionId: string;
  repoPath: string;
  depth?: number;
  includeTests?: boolean;
}

export interface AnalyzeRepoResult {
  ok: boolean;
  sessionId: string;
  language: string;
  languageVersion?: string;
  framework?: string;
  frameworkVersion?: string;
  buildSystem?: {
    type: string;
    buildFile: string;
    buildCommand: string;
    testCommand?: string;
  };
  dependencies: Array<{
    name: string;
    version?: string;
    type: string;
  }>;
  ports: number[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasKubernetes: boolean;
  recommendations?: {
    baseImage?: string;
    buildStrategy?: string;
    securityNotes?: string[];
  };
  metadata?: {
    repoPath: string;
    depth: number;
    includeTests: boolean;
    timestamp: string;
    aiInsights?: string;
  };
}

// Language detection configuration
const LANGUAGE_SIGNATURES: Record<string, { extensions: string[]; files: string[] }> = {
  javascript: {
    extensions: ['', '.mjs', '.cjs'],
    files: ['package.json', 'node_modules'],
  },
  typescript: {
    extensions: ['.ts', '.tsx'],
    files: ['tsconfig.json', 'package.json'],
  },
  python: {
    extensions: ['.py'],
    files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
  },
  java: {
    extensions: ['.java'],
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  },
  go: {
    extensions: ['.go'],
    files: ['go.mod', 'go.sum'],
  },
  rust: {
    extensions: ['.rs'],
    files: ['Cargo.toml', 'Cargo.lock'],
  },
  ruby: {
    extensions: ['.rb'],
    files: ['Gemfile', 'Gemfile.lock', 'Rakefile'],
  },
  php: {
    extensions: ['.php'],
    files: ['composer.json', 'composer.lock'],
  },
};

// Framework detection configuration
const FRAMEWORK_SIGNATURES: Record<string, { files: string[]; dependencies?: string[] }> = {
  express: { files: [], dependencies: ['express'] },
  nestjs: { files: ['nest-cli.json'], dependencies: ['@nestjs/core'] },
  nextjs: { files: ['next.config', 'next.config.mjs'], dependencies: ['next'] },
  react: { files: [], dependencies: ['react', 'react-dom'] },
  vue: { files: ['vue.config'], dependencies: ['vue'] },
  angular: { files: ['angular.json'], dependencies: ['@angular/core'] },
  django: { files: ['manage.py'], dependencies: ['django'] },
  flask: { files: [], dependencies: ['flask'] },
  fastapi: { files: [], dependencies: ['fastapi'] },
  spring: { files: ['pom.xml', 'build.gradle'], dependencies: [] },
  rails: { files: ['Gemfile'], dependencies: ['rails'] },
  laravel: { files: ['artisan'], dependencies: [] },
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
  bundler: { file: 'Gemfile', buildCmd: 'bundle install', testCmd: 'bundle exec rspec' },
};

/**
 * Validate repository path exists and is accessible
 */
async function validateRepositoryPath(
  repoPath: string,
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
    }),
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
    const hasFiles = signature.files?.some((f) => files.includes(f)) ?? false;
    if (hasFiles) {
      return { language: lang };
    }

    // Check for extensions
    const hasExtensions =
      signature.extensions?.some((ext) => (extensionCounts[ext] ?? 0) > 0) ?? false;
    if (hasExtensions) {
      return { language: lang };
    }
  }

  return { language: 'unknown' };
}

/**
 * Detect framework
 */
async function detectFramework(
  repoPath: string,
  language: string,
): Promise<{ framework?: string; version?: string } | undefined> {
  const files = await fs.readdir(repoPath);

  // Check package.json for JS/TS frameworks
  if (language === 'javascript' || language === 'typescript') {
    const packageJsonPath = path.join(repoPath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
      };

      for (const [framework, signature] of Object.entries(FRAMEWORK_SIGNATURES)) {
        if (signature.dependencies?.some((dep) => dep in allDeps)) {
          return { framework };
        }
      }
    } catch {
      // Package.json not found or invalid
    }
  }

  // Check for framework-specific files
  for (const [framework, signature] of Object.entries(FRAMEWORK_SIGNATURES)) {
    if (signature.files?.some((f) => files.includes(f))) {
      return { framework };
    }
  }

  return undefined;
}

/**
 * Detect build system
 */
async function detectBuildSystem(repoPath: string): Promise<
  | {
      type: string;
      file: string;
      buildCmd: string;
      testCmd?: string;
    }
  | undefined
> {
  const files = await fs.readdir(repoPath);

  for (const [system, config] of Object.entries(BUILD_SYSTEMS)) {
    if (files.includes(config.file)) {
      return {
        type: system,
        file: config.file,
        buildCmd: config.buildCmd,
        testCmd: config.testCmd,
      };
    }
  }

  return undefined;
}

/**
 * Analyze dependencies
 */
async function analyzeDependencies(
  repoPath: string,
  language: string,
): Promise<Array<{ name: string; version?: string; type: string }>> {
  const dependencies: Array<{ name: string; version?: string; type: string }> = [];

  if (language === 'javascript' || language === 'typescript') {
    const packageJsonPath = path.join(repoPath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      // Production dependencies
      for (const [name, version] of Object.entries(packageJson.dependencies ?? {})) {
        dependencies.push({ name, version: String(version), type: 'production' });
      }

      // Dev dependencies
      for (const [name, version] of Object.entries(packageJson.devDependencies ?? {})) {
        dependencies.push({ name, version: String(version), type: 'development' });
      }
    } catch {
      // Package.json not found or invalid
    }
  }

  return dependencies;
}

/**
 * Detect exposed ports
 */
async function detectPorts(_repoPath: string, language: string): Promise<number[]> {
  const ports: Set<number> = new Set();

  // Use centralized default ports by language/framework
  const languageKey = language as keyof typeof DEFAULT_PORTS;
  const languagePorts = DEFAULT_PORTS[languageKey] || DEFAULT_PORTS.default;

  if (languagePorts) {
    languagePorts.forEach((port) => ports.add(port));
  }

  return Array.from(ports);
}

/**
 * Check for Docker files
 */
async function checkDockerFiles(repoPath: string): Promise<{
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasKubernetes: boolean;
}> {
  const files = await fs.readdir(repoPath);

  return {
    hasDockerfile: files.includes('Dockerfile') || files.includes('dockerfile'),
    hasDockerCompose: files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
    hasKubernetes:
      files.includes('k8s') || files.includes('kubernetes') || files.includes('deployment.yaml'),
  };
}

/**
 * Get recommended base image
 */
function getRecommendedBaseImage(language: string, _framework?: string): string {
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
 * Get security recommendations
 */
function getSecurityRecommendations(
  dependencies: Array<{ name: string; version?: string; type: string }>,
): string[] {
  const recommendations: string[] = [];

  // Check for known vulnerable packages
  const vulnerablePackages = ['lodash', 'moment', 'request'];
  const hasVulnerable = dependencies.some((dep) => vulnerablePackages.includes(dep.name));

  if (hasVulnerable) {
    recommendations.push('Consider updating or replacing deprecated/vulnerable packages');
  }

  if (dependencies.length > 50) {
    recommendations.push(
      'Large number of dependencies detected - consider reducing for smaller attack surface',
    );
  }

  recommendations.push('Use multi-stage builds to minimize final image size');
  recommendations.push('Run containers as non-root user');
  recommendations.push('Scan images regularly for vulnerabilities');

  return recommendations;
}

/**
 * Analyze repository
 */
export async function analyzeRepo(
  config: AnalyzeRepoConfig,
  logger: Logger,
): Promise<Result<AnalyzeRepoResult>> {
  const timer = createTimer(logger, 'analyze-repo');

  try {
    const { sessionId, depth = 3, includeTests = false } = config;
    const { repoPath } = config;

    logger.info({ repoPath, depth, includeTests }, 'Starting repository analysis');

    // Validate repository path
    const validation = await validateRepositoryPath(repoPath);
    if (!validation.valid) {
      return Failure(validation.error ?? 'Invalid repository path');
    }

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Create AI service
    const aiService = createAIService(logger);

    // Get or create session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session
      await sessionManager.create(sessionId);
    }

    // Perform analysis
    const languageInfo = await detectLanguage(repoPath);
    const frameworkInfo = await detectFramework(repoPath, languageInfo.language);
    const buildSystemRaw = await detectBuildSystem(repoPath);
    const dependencies = await analyzeDependencies(repoPath, languageInfo.language);
    const ports = await detectPorts(repoPath, languageInfo.language);
    const dockerInfo = await checkDockerFiles(repoPath);

    // Get AI insights
    let aiInsights: string | undefined;
    try {
      const aiResponse = await aiService.generate({
        prompt: `Analyze repository structure for ${languageInfo.language} project`,
        context: {
          language: languageInfo.language,
          framework: frameworkInfo?.framework,
          hasDependencies: dependencies.length > 0,
          hasDocker: dockerInfo.hasDockerfile,
        },
      });

      if (aiResponse.ok) {
        // Extract insights from the structured context
        aiInsights =
          aiResponse.value.context.guidance || 'Analysis completed using AI context preparation';
      }
    } catch (error) {
      logger.debug({ error }, 'AI analysis skipped');
    }

    // Build recommendations
    const baseImage = getRecommendedBaseImage(languageInfo.language, frameworkInfo?.framework);
    const securityNotes = getSecurityRecommendations(dependencies);

    // Transform build system
    const buildSystem = buildSystemRaw
      ? {
          type: buildSystemRaw.type,
          buildFile: buildSystemRaw.file,
          buildCommand: buildSystemRaw.buildCmd,
          ...(buildSystemRaw.testCmd !== undefined && { testCommand: buildSystemRaw.testCmd }),
        }
      : undefined;

    const result: AnalyzeRepoResult = {
      ok: true,
      sessionId,
      language: languageInfo.language,
      ...(languageInfo.version !== undefined && { languageVersion: languageInfo.version }),
      ...(frameworkInfo?.framework !== undefined && { framework: frameworkInfo.framework }),
      ...(frameworkInfo?.version !== undefined && { frameworkVersion: frameworkInfo.version }),
      ...(buildSystem !== undefined && { buildSystem }),
      dependencies,
      ports,
      hasDockerfile: dockerInfo.hasDockerfile,
      hasDockerCompose: dockerInfo.hasDockerCompose,
      hasKubernetes: dockerInfo.hasKubernetes,
      recommendations: {
        baseImage,
        buildStrategy: buildSystem ? 'multi-stage' : 'single-stage',
        securityNotes,
      },
      metadata: {
        repoPath,
        depth,
        includeTests,
        timestamp: new Date().toISOString(),
        ...(aiInsights !== undefined && { aiInsights }),
      },
    };

    // Update session with analysis result
    const currentState = session as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      analysis_result: {
        language: languageInfo.language,
        ...(languageInfo.version && { language_version: languageInfo.version }),
        ...(frameworkInfo?.framework && { framework: frameworkInfo.framework }),
        ...(frameworkInfo?.version && { framework_version: frameworkInfo.version }),
        ...(buildSystem && {
          build_system: {
            type: buildSystem.type,
            build_file: buildSystem.buildFile,
            ...(buildSystem.buildCommand && { build_command: buildSystem.buildCommand }),
          },
        }),
        dependencies: dependencies.map((d) => ({
          name: d.name,
          ...(d.version && { version: d.version }),
          type:
            d.type === 'production'
              ? ('runtime' as const)
              : d.type === 'development'
                ? ('dev' as const)
                : ('test' as const),
        })),
        has_tests: dependencies.some((dep) => dep.type === 'test'),
        ports,
        docker_compose_exists: dockerInfo.hasDockerCompose,
        recommendations: {
          baseImage,
          buildStrategy: buildSystem ? 'multi-stage' : 'single-stage',
          securityNotes,
        },
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'analyze-repo'],
    });

    await sessionManager.update(sessionId, updatedWorkflowState);

    timer.end({ language: languageInfo.language });
    logger.info({ language: languageInfo.language }, 'Repository analysis completed');

    return Success(result);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Repository analysis failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Analyze repository tool instance
 */
export const analyzeRepoTool = {
  name: 'analyze-repo',
  execute: (config: AnalyzeRepoConfig, logger: Logger) => analyzeRepo(config, logger),
};
