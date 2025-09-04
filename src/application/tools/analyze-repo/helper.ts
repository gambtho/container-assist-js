/**
 * Analyze Repository - Enhanced with AI Optimization
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AnalyzeRepositoryParams, AnalysisResult } from '../schemas.js';

// Use consolidated schemas

// Type aliases
export type AnalyzeInput = AnalyzeRepositoryParams;
export type AnalyzeOutput = AnalysisResult;

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
    patterns: [/^import .* from/, /^const .* = require/],
  },
  typescript: {
    extensions: ['.ts', '.tsx'],
    files: ['tsconfig.json', 'package.json'],
    patterns: [/^import .* from/, /^export (class|interface|type)/],
  },
  python: {
    extensions: ['.py'],
    files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
    patterns: [/^import /, /^from .* import/],
  },
  java: {
    extensions: ['.java'],
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    patterns: [/^package /, /^import /],
  },
  go: {
    extensions: ['.go'],
    files: ['go.mod', 'go.sum'],
    patterns: [/^package /, /^import \(/],
  },
  rust: {
    extensions: ['.rs'],
    files: ['Cargo.toml', 'Cargo.lock'],
    patterns: [/^use /, /^mod /],
  },
  ruby: {
    extensions: ['.rb'],
    files: ['Gemfile', 'Gemfile.lock', 'Rakefile'],
    patterns: [/^require /, /^class .* </, /^module /],
  },
  php: {
    extensions: ['.php'],
    files: ['composer.json', 'composer.lock'],
    patterns: [/^<\?php/, /^namespace /, /^use /],
  },
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
export async function validateRepositoryPath(
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
export async function detectLanguage(
  repoPath: string,
): Promise<{ language: string; version?: string }> {
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
export async function detectFramework(
  repoPath: string,
  language: string,
): Promise<{ framework?: string; version?: string } | null> {
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
        ...(packageJson.devDependencies ?? {}),
      };

      for (const [framework, signature] of Object.entries(FRAMEWORK_SIGNATURES)) {
        if (
          signature.dependencies != null &&
          signature.dependencies.some((dep) => dep in allDeps)
        ) {
          const firstDep = signature.dependencies?.[0];
          const result: { framework: string; version?: string } = { framework };
          if (firstDep != null && allDeps[firstDep] != null) {
            const version = allDeps[firstDep];
            if (typeof version === 'string') {
              result.version = version;
            }
          }
          return result;
        }
      }
    } catch {
      // Ignore JSON parsing errors
    }
  }

  // Return null when no framework is detected instead of empty object
  return null;
}

/**
 * Detect build system
 */
export async function detectBuildSystem(
  repoPath: string,
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
export async function analyzeDependencies(
  repoPath: string,
  language: string,
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
                type: 'runtime',
              };
              if (match[3]?.trim()) {
                entry.version = match[3].trim();
              }
              dependencies.push(entry);
            }
          });
      } catch {
        // Ignore parsing errors for package.json
      }
    } else if (language === 'java') {
      // Parse pom.xml or build.gradle for dependencies
      // This would require XML/Gradle parsing
    }
  } catch {
    // Ignore errors when parsing dependencies
  }

  return dependencies;
}

/**
 * Detect exposed ports
 */
export async function detectPorts(repoPath: string, language: string): Promise<number[]> {
  const ports: Set<number> = new Set();

  // Check for environment configuration
  try {
    const envPath = path.join(repoPath, '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    const portMatch = envContent.match(/PORT\s*=\s*(\d+)/);
    if (portMatch?.[1]) {
      ports.add(parseInt(portMatch[1]));
    }
  } catch {
    // Ignore errors when reading .env file
  }

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
    } catch {
      // Ignore errors when parsing package.json scripts
    }
  }

  return Array.from(ports);
}

/**
 * Check for Docker files
 */
export async function checkDockerFiles(
  repoPath: string,
): Promise<{ hasDockerfile: boolean; hasDockerCompose: boolean; hasKubernetes: boolean }> {
  const files = await fs.readdir(repoPath);

  return {
    hasDockerfile: files.includes('Dockerfile') || files.includes('dockerfile'),
    hasDockerCompose: files.includes('docker-compose.yml') || files.includes('docker-compose.yaml'),
    hasKubernetes: files.includes('k8s') || files.includes('kubernetes') || files.includes('.k8s'),
  };
}

/**
 * Get recommended base image for language/framework
 */
export function getRecommendedBaseImage(language: string, framework?: string): string {
  const imageMap: Record<string, string> = {
    javascript: 'node:18-alpine',
    typescript: 'node:18-alpine',
    python: 'python:3.11-slim',
    java: 'openjdk:17-jdk-slim',
    go: 'golang:1.21-alpine',
    rust: 'rust:1.75-slim',
    ruby: 'ruby:3.2-slim',
    php: 'php:8.2-fpm-alpine',
  };

  // Framework-specific overrides
  if (framework === 'nextjs') return 'node:18-alpine';
  if (framework === 'django') return 'python:3.11-slim';
  if (framework === 'spring') return 'openjdk:17-jdk-slim';

  return imageMap[language] || 'alpine:3.19';
}

/**
 * Get security recommendations based on dependencies
 */
export function getSecurityRecommendations(
  dependencies: Array<{ name: string; version?: string; type?: 'runtime' | 'dev' | 'test' }>,
): string[] {
  const recommendations: string[] = [];

  // Check for known vulnerable packages
  const vulnerablePackages = ['request', 'node-uuid', 'minimist<1.2.6'];
  const foundVulnerable = dependencies.filter((dep) =>
    vulnerablePackages.some((vuln) => dep.name.includes(vuln.split('<')[0] || '')),
  );

  if (foundVulnerable.length > 0) {
    recommendations.push(
      `Update vulnerable packages: ${foundVulnerable.map((d) => d.name).join(', ')}`,
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
export async function gatherFileStructure(
  repoPath: string,
  maxDepth: number = 2,
): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string, currentDepth: number): Promise<void> {
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
            '__pycache__',
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
    '.txt': '📝',
  };

  return iconMap[extension.toLowerCase()] || '📄';
}
