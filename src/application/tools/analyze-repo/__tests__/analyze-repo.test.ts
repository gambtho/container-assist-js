/**
 * Unit tests for analyze-repo tool
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import type { Dirent } from 'node:fs';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('node:fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    lstat: jest.fn(),
  },
}));

// Import modules AFTER setting up mocks
const analyzeRepositoryHandler = (await import('../index')).default;
const fs = await import('node:fs');

// Import types and utilities
import type { AnalyzeRepositoryParams, AnalysisResult } from '../../schemas';
import { createMockToolContext, createSampleProject } from '../../__tests__/shared/test-utils';
import { createMockAIService } from '../../__tests__/shared/ai-mocks';
import { Success } from '../../../../domain/types/result';

const mockFs = fs.promises as jest.Mocked<typeof fs.promises>;

describe('analyze-repo tool', () => {
  let mockContext: ReturnType<typeof createMockToolContext>;
  let mockProjectStructure: ReturnType<typeof createSampleProject>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock context
    mockContext = createMockToolContext();
    mockProjectStructure = createSampleProject();

    // Setup default filesystem mocks
    setupFileSystemMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  function setupFileSystemMocks(customProject?: Record<string, string>): void {
    const project = customProject ?? mockProjectStructure;

    // Mock fs.access for path validation
    mockFs.access.mockImplementation(async (filePath) => {
      const pathStr = filePath.toString();
      if (pathStr.includes('non-existent') || pathStr.includes('invalid')) {
        throw new Error('ENOENT: no such file or directory');
      }
      return Promise.resolve();
    });

    // Mock fs.readFile
    mockFs.readFile.mockImplementation((filePath, _encoding) => {
      const pathStr = String(filePath);
      const fileName = path.basename(pathStr);

      if (project[fileName]) {
        return Promise.resolve(project[fileName]);
      }

      // Handle specific file requests
      if (fileName === 'package.json') {
        return Promise.resolve(
          JSON.stringify({
            name: 'test-app',
            version: '1.0.0',
            dependencies: { express: '^4.18.0' },
            scripts: { start: 'node index' },
          }),
        );
      }

      return Promise.reject(new Error('ENOENT: no such file or directory'));
    });

    // Mock fs.readdir
    mockFs.readdir.mockImplementation((dirPath) => {
      const pathStr = String(dirPath);

      if (pathStr.includes('test-app')) {
        return Promise.resolve([
          { name: 'package.json', isDirectory: () => false },
          { name: 'index', isDirectory: () => false },
          { name: 'node_modules', isDirectory: () => true },
          { name: 'src', isDirectory: () => true },
          { name: 'Dockerfile', isDirectory: () => false },
        ] as Array<{ name: string; isDirectory: () => boolean }>);
      }

      return Promise.resolve([]);
    });

    // Mock fs.stat
    mockFs.stat.mockImplementation((filePath) => {
      return {
        isFile: () => !path.basename(filePath.toString()).includes('node_modules'),
        isDirectory: () =>
          path.basename(filePath.toString()).includes('node_modules') ||
          path.basename(filePath.toString()) === 'src',
        size: 1024,
        mtime: new Date(),
      } as { isDirectory: () => boolean; size: number; mtime: Date };
    });
  }

  describe('Tool descriptor configuration', () => {
    it('should have correct tool configuration', () => {
      expect(analyzeRepositoryHandler.name).toBe('analyze_repository');
      expect(analyzeRepositoryHandler.description).toContain('repository structure');
      expect(analyzeRepositoryHandler.category).toBe('workflow');
      expect(analyzeRepositoryHandler.inputSchema).toBeDefined();
      expect(analyzeRepositoryHandler.outputSchema).toBeDefined();
      expect(analyzeRepositoryHandler.handler).toBeInstanceOf(Function);
    });

    it('should have correct chain hint configuration', () => {
      expect(analyzeRepositoryHandler.chainHint).toBeDefined();
      expect(analyzeRepositoryHandler.chainHint?.nextTool).toBe('generate_dockerfile');
      expect(analyzeRepositoryHandler.chainHint?.reason).toContain('Dockerfile');
      expect(analyzeRepositoryHandler.chainHint?.paramMapper).toBeInstanceOf(Function);
    });

    it('should map output parameters correctly for chain hint', () => {
      const sampleOutput: AnalysisResult = {
        success: true,
        sessionId: 'test-session-123',
        language: 'javascript',
        dependencies: [],
        ports: [3000],
        hasDockerfile: false,
        hasDockerCompose: false,
        hasKubernetes: false,
        recommendations: {
          baseImage: 'node:16-alpine',
        },
      };

      const mapped = analyzeRepositoryHandler.chainHint?.paramMapper?.(sampleOutput);
      expect(mapped).toEqual({
        session_id: 'test-session-123',
        language: 'javascript',
        framework: undefined,
        base_image: 'node:16-alpine',
      });
    });
  });

  describe('Input validation', () => {
    it('should validate required repository path', () => {
      const invalidInput = {} as AnalyzeRepositoryParams;

      try {
        analyzeRepositoryHandler.inputSchema.parse(invalidInput);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should validate repository path format', () => {
      const input = { repoPath: '' };

      try {
        analyzeRepositoryHandler.inputSchema.parse(input);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should accept valid input with all optional parameters', () => {
      const validInput: AnalyzeRepositoryParams = {
        repoPath: '/path/to/repo',
        sessionId: 'test-session',
        depth: 'deep',
        includeTests: true,
      };

      const parsed = analyzeRepositoryHandler.inputSchema.parse(validInput);
      expect(parsed).toEqual(validInput);
    });

    it('should set default values for optional parameters', () => {
      const minimalInput = { repoPath: '/path/to/repo' };

      const parsed = analyzeRepositoryHandler.inputSchema.parse(minimalInput);
      expect(parsed.depth).toBe('shallow');
      expect(parsed.includeTests).toBe(false);
    });
  });

  describe('Repository validation', () => {
    it('should handle non-existent repository path', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: '/path/to/non-existent-repo',
      };

      // Should reject for invalid path
      await expect(analyzeRepositoryHandler.handler(input, mockContext)).rejects.toThrow();
    });

    it('should handle invalid repository path', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: '/invalid/path',
      };

      try {
        await analyzeRepositoryHandler.handler(input, mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should validate existing repository path', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('Language detection', () => {
    it('should detect JavaScript project correctly', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.language).toBe('javascript');
    });

    it('should detect TypeScript project', async () => {
      // Setup TypeScript project structure
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          name: 'ts-app',
          dependencies: { typescript: '^4.9.0' },
        }),
        'tsconfig.json': JSON.stringify({
          compilerOptions: { target: 'ES2020' },
        }),
        'src/index.ts': 'export const app = "Hello TypeScript";',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './ts-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.language).toBe('typescript');
    });

    it('should detect Python project', async () => {
      setupFileSystemMocks({
        'requirements.txt': 'flask==2.0.0\ngunicorn==20.1.0',
        'app.py': 'from flask import Flask\napp = Flask(__name__)',
        'setup.py': 'from setuptools import setup',
      });

      mockFs.readdir.mockResolvedValue([
        { name: 'requirements.txt', isDirectory: () => false },
        { name: 'app.py', isDirectory: () => false },
        { name: 'setup.py', isDirectory: () => false },
      ] as Array<{ name: string; isDirectory: () => boolean }>);

      const input: AnalyzeRepositoryParams = {
        repoPath: './python-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.language).toBe('python');
    });
  });

  describe('Framework detection', () => {
    it('should detect Express.js framework', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          name: 'express-app',
          dependencies: { express: '^4.18.0' },
        }),
        server: 'const express = require("express");',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './express-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.framework).toBe('express');
    });

    it('should detect Next.js framework', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          name: 'nextjs-app',
          dependencies: { next: '^13.0.0', react: '^18.0.0' },
        }),
        'next.config': 'module.exports = { reactStrictMode: true };',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './nextjs-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.framework).toBe('nextjs');
    });

    it('should handle projects without specific framework', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          name: 'vanilla-app',
          dependencies: {},
        }),
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './vanilla-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.framework).toBeUndefined();
    });
  });

  describe('Dependency analysis', () => {
    it('should analyze package.json dependencies correctly', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          name: 'test-app',
          dependencies: {
            express: '^4.18.0',
            cors: '^2.8.5',
          },
          devDependencies: {
            jest: '^29.0.0',
            '@types/node': '^18.0.0',
          },
        }),
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        includeTests: true,
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'express', type: 'runtime' }),
          expect.objectContaining({ name: 'cors', type: 'runtime' }),
        ]),
      );
    });

    it('should identify test dependencies when includeTests is true', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          dependencies: { express: '^4.18.0' },
          devDependencies: { jest: '^29.0.0' },
        }),
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        includeTests: true,
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.dependencies).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'jest', type: 'test' })]),
      );
    });

    it('should exclude test dependencies when includeTests is false', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        includeTests: false,
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      const testDeps = result.dependencies.filter((dep) => dep.type === 'test');
      expect(testDeps).toHaveLength(0);
    });
  });

  describe('Port detection', () => {
    it('should detect port from package.json scripts', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({
          scripts: {
            start: 'node server.js --port 8080',
          },
        }),
        server: 'const port = process.env.PORT || 8080;',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.ports).toContain(8080);
    });

    it('should detect default port 3000 for Node.js apps', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.ports).toContain(3000);
    });

    it('should detect multiple ports from source code', async () => {
      setupFileSystemMocks({
        server: `
          const express = require('express');
          const app = express();
          
          app.listen(3000);
          app.listen(8080);
        `,
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.ports).toEqual(expect.arrayContaining([3000, 8080]));
    });
  });

  describe('Docker file detection', () => {
    it('should detect existing Dockerfile', async () => {
      setupFileSystemMocks({
        ...mockProjectStructure,
        Dockerfile: 'FROM node:16\nWORKDIR /app',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.hasDockerfile).toBe(true);
    });

    it('should detect docker-compose.yml', async () => {
      setupFileSystemMocks({
        ...mockProjectStructure,
        'docker-compose.yml': 'version: "3.8"\nservices:\n  app:\n    build: .',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.hasDockerCompose).toBe(true);
    });

    it('should detect Kubernetes manifests', async () => {
      setupFileSystemMocks({
        ...mockProjectStructure,
        'k8s/deployment.yaml': 'apiVersion: apps/v1\nkind: Deployment',
      });

      mockFs.readdir.mockImplementation((dirPath) => {
        const pathStr = String(dirPath);
        if (pathStr.includes('k8s')) {
          return Promise.resolve([
            { name: 'deployment.yaml', isDirectory: () => false, isFile: () => true },
          ] as Dirent[]);
        }
        return Promise.resolve([
          { name: 'package.json', isDirectory: () => false, isFile: () => true },
          { name: 'k8s', isDirectory: () => true, isFile: () => false },
        ] as Dirent[]);
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.hasKubernetes).toBe(true);
    });
  });

  describe('AI enhancement integration', () => {
    it('should work without AI service available', async () => {
      mockContext.aiService = undefined;

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.metadata?.aiInsights).toBeUndefined();
    });

    it('should integrate with AI service when available', async () => {
      const mockAIService = createMockAIService();
      mockContext.aiService = mockAIService;

      // Mock AI service response
      mockAIService.generateStructured.mockResolvedValue(
        Success({
          content: {
            insights: 'This is a Node.js Express application',
            optimizations: ['Use multi-stage builds', 'Optimize layer caching'],
            security: ['Update dependencies', 'Use non-root user'],
            baseImage: 'node:16-alpine',
            buildStrategy: 'multi-stage',
          },
          model: 'claude-3-opus',
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        }),
      );

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.aiInsights).toContain('Node.js Express');
      expect(mockAIService.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            fileList: expect.any(String),
            configFiles: expect.any(String),
          }),
        }),
      );
    });

    it('should handle AI service errors gracefully', async () => {
      const mockAIService = createMockAIService();
      mockContext.aiService = mockAIService;

      // Mock AI service failure
      mockAIService.generateStructured.mockRejectedValue(new Error('AI service unavailable'));

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.metadata?.aiInsights).toBeUndefined();
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'AI enhancement failed, continuing with basic analysis',
      );
    });

    it('should parse structured AI responses correctly', async () => {
      const mockAIService = createMockAIService();
      mockContext.aiService = mockAIService;

      mockAIService.generateStructured.mockResolvedValue(
        Success({
          content: {
            insights: 'Detailed analysis',
            optimizations: ['optimization1', 'optimization2'],
            security: ['security1', 'security2'],
            baseImage: 'node:18-alpine',
          },
          model: 'claude-3-opus',
          usage: {
            promptTokens: 50,
            completionTokens: 50,
            totalTokens: 100,
          },
        }),
      );

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.metadata?.aiInsights).toBe('Detailed analysis');
      expect(result.recommendations?.aiOptimizations).toEqual(['optimization1', 'optimization2']);
      expect(result.recommendations?.aiSecurity).toEqual(['security1', 'security2']);
    });
  });

  describe('Session management', () => {
    it('should create new session when none provided', async () => {
      const mockSessionService = {
        create: jest.fn().mockResolvedValue({ id: 'new-session-123' }),
        updateAtomic: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        initialize: jest.fn().mockResolvedValue(undefined),
      } as typeof mockContext.sessionService;
      mockContext.sessionService = mockSessionService;

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.sessionId).toBe('new-session-123');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSessionService.create).toHaveBeenCalledWith({
        projectName: 'test-app',
        metadata: {
          repoPath: './test-app',
          analysisDepth: 'shallow',
          includeTests: false,
        },
      });
    });

    it('should use provided session ID', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        sessionId: 'existing-session-456',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.sessionId).toBe('existing-session-456');
    });

    it('should update session with analysis results', async () => {
      mockContext.sessionService = {
        create: jest.fn().mockResolvedValue({ id: 'test-session' }),
        updateAtomic: jest.fn().mockResolvedValue(undefined),
      };

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        sessionId: 'test-session',
      };

      const _result = await analyzeRepositoryHandler.handler(input, mockContext);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockContext.sessionService.updateAtomic).toHaveBeenCalledWith(
        'test-session',
        expect.any(Function),
      );
    });

    it('should handle session creation failures gracefully', async () => {
      mockContext.sessionService = {
        create: jest.fn().mockRejectedValue(new Error('Session service unavailable')),
        updateAtomic: jest.fn().mockResolvedValue(undefined),
      };

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('temp-session');
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to create session for repo analysis',
      );
    });
  });

  describe('Progress tracking', () => {
    it('should emit progress updates when progress emitter available', async () => {
      const mockProgressEmitter = {
        emit: jest.fn().mockResolvedValue(undefined),
      };
      mockContext.progressEmitter = mockProgressEmitter;

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        sessionId: 'test-session',
      };

      const _result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(mockProgressEmitter.emit).toHaveBeenCalledTimes(3);
      expect(mockProgressEmitter.emit).toHaveBeenCalledWith({
        sessionId: 'test-session',
        step: 'analyze_repository',
        status: 'in_progress',
        message: 'Analyzing repository structure',
        progress: 0.1,
      });
      expect(mockProgressEmitter.emit).toHaveBeenCalledWith({
        sessionId: 'test-session',
        step: 'analyze_repository',
        status: 'completed',
        message: 'Repository analysis complete',
        progress: 1.0,
      });
    });

    it('should skip progress updates when emitter not available', async () => {
      mockContext.progressEmitter = undefined;

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        sessionId: 'test-session',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });

    it('should handle progress emitter failures gracefully', async () => {
      const mockProgressEmitter = {
        emit: jest.fn().mockRejectedValue(new Error('Progress service unavailable')),
      };
      mockContext.progressEmitter = mockProgressEmitter;

      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        sessionId: 'test-session',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
    });
  });

  describe('Deep vs shallow analysis', () => {
    it('should perform shallow analysis by default', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.metadata?.depth).toBe('shallow');
    });

    it('should perform deep analysis when requested', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
        depth: 'deep',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.metadata?.depth).toBe('deep');
    });
  });

  describe('Build system detection', () => {
    it('should detect npm build system', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({ name: 'npm-app' }),
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './npm-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.buildSystem?.type).toBe('npm');
      expect(result.buildSystem?.buildFile).toBe('package.json');
    });

    it('should detect yarn build system', async () => {
      setupFileSystemMocks({
        'package.json': JSON.stringify({ name: 'yarn-app' }),
        'yarn.lock': '',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './yarn-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.buildSystem?.type).toBe('yarn');
    });

    it('should detect Maven build system', async () => {
      setupFileSystemMocks({
        'pom.xml': '<project><modelVersion>4.0.0</modelVersion></project>',
      });

      mockFs.readdir.mockResolvedValue([{ name: 'pom.xml', isDirectory: () => false } as Dirent]);

      const input: AnalyzeRepositoryParams = {
        repoPath: './maven-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.buildSystem?.type).toBe('maven');
      expect(result.buildSystem?.buildCommand).toBe('mvn package');
    });
  });

  describe('Error handling', () => {
    it('should handle filesystem access errors', async () => {
      mockFs.access.mockRejectedValue(new Error('Permission denied'));

      const input: AnalyzeRepositoryParams = {
        repoPath: './restricted-app',
      };

      try {
        await analyzeRepositoryHandler.handler(input, mockContext);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle malformed package.json files', async () => {
      setupFileSystemMocks({
        'package.json': '{ invalid json }',
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './malformed-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.success).toBe(true);
      expect(result.dependencies).toEqual([]);
    });

    it('should log errors appropriately', async () => {
      mockFs.access.mockRejectedValue(new Error('Test error'));

      const input: AnalyzeRepositoryParams = {
        repoPath: './error-app',
      };

      try {
        await analyzeRepositoryHandler.handler(input, mockContext);
      } catch {
        expect(mockContext.logger.error).toHaveBeenCalled();
      }
    });
  });

  describe('Output validation', () => {
    it('should produce output that matches the schema', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      // Validate against output schema
      expect(() => analyzeRepositoryHandler.outputSchema.parse(result)).not.toThrow();
    });

    it('should include all required fields', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.language).toBeDefined();
      expect(result.dependencies).toBeInstanceOf(Array);
      expect(result.ports).toBeInstanceOf(Array);
      expect(typeof result.hasDockerfile).toBe('boolean');
      expect(typeof result.hasDockerCompose).toBe('boolean');
      expect(typeof result.hasKubernetes).toBe('boolean');
    });

    it('should handle optional fields correctly', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './minimal-app',
      };

      setupFileSystemMocks({
        index: 'console.log("Hello");',
      });

      const result = await analyzeRepositoryHandler.handler(input, mockContext);

      // Optional fields should be undefined or have proper values
      if (result.framework !== undefined) {
        expect(typeof result.framework).toBe('string');
      }
      if (result.buildSystem !== undefined) {
        expect(result.buildSystem.type).toBeDefined();
      }
    });
  });

  describe('Performance considerations', () => {
    it('should complete analysis within reasonable time', async () => {
      const input: AnalyzeRepositoryParams = {
        repoPath: './test-app',
      };

      const startTime = Date.now();
      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should limit file reading for large projects', async () => {
      // Setup large project structure
      const largeProjectFiles: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeProjectFiles[`file${i}.js`] = `// File ${i}`;
      }

      setupFileSystemMocks({
        'package.json': JSON.stringify({ name: 'large-app' }),
        ...largeProjectFiles,
      });

      const input: AnalyzeRepositoryParams = {
        repoPath: './large-app',
        depth: 'deep',
      };

      const result = await analyzeRepositoryHandler.handler(input, mockContext);
      expect(result.success).toBe(true);

      // Should not read all files
      expect(mockFs.readFile).not.toHaveBeenCalledTimes(1000);
    });
  });
});
