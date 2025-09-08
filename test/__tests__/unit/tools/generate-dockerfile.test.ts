/**
 * Unit Tests: Generate Dockerfile Tool
 * Tests the generate-dockerfile tool functionality with mock filesystem and sessions
 */

import { jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { generateDockerfile, type GenerateDockerfileConfig } from '../../../../src/tools/generate-dockerfile/tool';
import { createMockLogger, createSuccessResult } from '../../../helpers/mock-infrastructure';
import { 
  nodeExpressBasicRepository, 
  expectedNodeExpressDockerfile,
  pythonFlaskBasicRepository,
  expectedPythonFlaskDockerfile,
  javaSpringBootBasicRepository,
  expectedJavaSpringBootDockerfile,
} from '../../../fixtures/repositories';

// Mock filesystem functions with proper structure
jest.mock('node:fs', () => ({
  promises: {
    writeFile: jest.fn(),
    constants: {
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
      F_OK: 0,
    },
  },
  constants: {
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    F_OK: 0,
  },
}));

// Mock lib modules
const mockSessionManager = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockAIService = {
  generate: jest.fn(),
};

jest.mock('../../../../src/lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('../../../../src/lib/ai/ai-service', () => ({
  createAIService: jest.fn(() => mockAIService),
}));

jest.mock('../../../../src/lib/logger', () => ({
  createTimer: jest.fn(() => ({
    end: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('generateDockerfile', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: GenerateDockerfileConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      optimization: true,
      multistage: true,
      securityHardening: true,
      includeHealthcheck: false,
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Default successful AI service response
    mockAIService.generate.mockResolvedValue(createSuccessResult({
      context: { guidance: 'AI-generated dockerfile optimization' },
      metadata: { contextSize: 1000, guidance: true, template: true },
    }));

    // Default mock implementations
    mockFs.writeFile.mockResolvedValue(undefined);
    mockSessionManager.update.mockResolvedValue(true);
  });

  describe('Node.js Express Dockerfile Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [
              { name: 'express' },
              { name: 'cors' },
            ],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate Node.js Dockerfile with default settings', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(true);
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.baseImage).toBe('node:18-alpine');
        expect(result.value.optimization).toBe(true);
        expect(result.value.multistage).toBe(true);
        
        // Check that Dockerfile content includes expected elements
        expect(result.value.content).toContain('FROM node:18-alpine');
        expect(result.value.content).toContain('WORKDIR /app');
        expect(result.value.content).toContain('EXPOSE 3000');
        expect(result.value.content).toContain('USER appuser');
        expect(result.value.content).toContain('CMD ["node", "index.js"]');
      }
    });

    it('should generate multistage Dockerfile when enabled and dependencies > 5', async () => {
      // Mock session with many dependencies
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [
              { name: 'express' },
              { name: 'cors' },
              { name: 'helmet' },
              { name: 'morgan' },
              { name: 'body-parser' },
              { name: 'lodash' },
              { name: 'moment' },
            ],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('# Build stage');
        expect(result.value.content).toContain('FROM node:18-alpine AS builder');
        expect(result.value.content).toContain('# Runtime stage');
        expect(result.value.content).toContain('COPY --from=builder');
      }
    });

    it('should use single-stage build when multistage is disabled', async () => {
      config.multistage = false;

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.multistage).toBe(false);
        expect(result.value.content).not.toContain('AS builder');
        expect(result.value.content).not.toContain('COPY --from=builder');
      }
    });

    it('should use custom base image when provided', async () => {
      config.baseImage = 'node:20-alpine';

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toBe('node:20-alpine');
        expect(result.value.content).toContain('FROM node:20-alpine');
      }
    });

    it('should include health check when requested', async () => {
      config.includeHealthcheck = true;

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('HEALTHCHECK');
        expect(result.value.content).toContain('http://localhost:3000/health');
      }
    });

    it('should add custom commands when provided', async () => {
      config.customCommands = ['apt-get update', 'apt-get install -y git'];

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('# Custom commands');
        expect(result.value.content).toContain('RUN apt-get update');
        expect(result.value.content).toContain('RUN apt-get install -y git');
      }
    });

    it('should add custom instructions when provided', async () => {
      config.customInstructions = 'ENV NODE_ENV=production\nEXPOSE 8080';

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('# Custom instructions');
        expect(result.value.content).toContain('ENV NODE_ENV=production');
        expect(result.value.content).toContain('EXPOSE 8080');
      }
    });
  });

  describe('Python Flask Dockerfile Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'flask',
            dependencies: [
              { name: 'Flask' },
              { name: 'gunicorn' },
            ],
            ports: [5000],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate Python Flask Dockerfile', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toBe('python:3.11-slim');
        expect(result.value.content).toContain('FROM python:3.11-slim');
        expect(result.value.content).toContain('EXPOSE 5000');
        expect(result.value.content).toContain('COPY requirements.txt');
        expect(result.value.content).toContain('pip install --no-cache-dir');
        expect(result.value.content).toContain('CMD ["python", "-m", "flask", "run", "--host=0.0.0.0"]');
      }
    });
  });

  describe('Java Spring Boot Dockerfile Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'java',
            framework: 'spring',
            build_system: { type: 'maven' },
            dependencies: [
              { name: 'spring-boot-starter-web' },
            ],
            ports: [8080],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate Java Maven Dockerfile', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toBe('openjdk:17-alpine');
        expect(result.value.content).toContain('FROM openjdk:17-alpine');
        expect(result.value.content).toContain('EXPOSE 8080');
        expect(result.value.content).toContain('USER appuser');
        expect(result.value.content).toContain('CMD ["java", "-jar", "app.jar"]');
        // For single stage builds with few dependencies, uses generic copy
        expect(result.value.content).toContain('COPY --chown=appuser:appuser . .');
      }
    });

    it('should generate Java Gradle Dockerfile', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'java',
            framework: 'spring',
            build_system: { type: 'gradle' },
            dependencies: [
              { name: 'spring-boot-starter-web' },
            ],
            ports: [8080],
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('FROM openjdk:17-alpine');
        expect(result.value.content).toContain('CMD ["java", "-jar", "app.jar"]');
        // For single stage builds with few dependencies, uses generic copy
        expect(result.value.content).toContain('COPY --chown=appuser:appuser . .');
      }
    });
  });

  describe('Go Application Dockerfile Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'go',
            dependencies: [
              { name: 'github.com/gorilla/mux' },
            ],
            ports: [8000],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate Go Dockerfile', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toBe('golang:1.21-alpine');
        expect(result.value.content).toContain('FROM golang:1.21-alpine');
        expect(result.value.content).toContain('EXPOSE 8000');
        expect(result.value.content).toContain('CGO_ENABLED=0');
        expect(result.value.content).toContain('CMD ["./main"]');
        // For single stage builds, uses the single-stage Go commands
        expect(result.value.content).toContain('COPY . .');
        expect(result.value.content).toContain('go build -a -installsuffix cgo -o main');
      }
    });
  });

  describe('Framework-specific Commands', () => {
    it('should use Next.js specific command', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'nextjs',
            dependencies: [{ name: 'next' }],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('CMD ["npm", "run", "start"]');
      }
    });

    it('should use Django specific command', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'django',
            dependencies: [{ name: 'Django' }],
            ports: [8000],
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]');
      }
    });

    it('should use FastAPI specific command', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'fastapi',
            dependencies: [{ name: 'fastapi' }],
            ports: [8000],
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]');
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should return error when analysis result not found', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {},
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Repository must be analyzed first - run analyze_repo');
      }
    });

    it('should handle file write errors', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express' }],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });

      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Permission denied');
      }
    });

    it('should handle AI service failures gracefully', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express' }],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });

      mockAIService.generate.mockRejectedValue(new Error('AI service unavailable'));

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      // Should still generate Dockerfile even if AI fails
      if (result.ok) {
        expect(result.value.content).toContain('FROM node:18-alpine');
      }
    });
  });

  describe('Security and Warnings', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express' }],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should warn when security hardening is disabled', async () => {
      config.securityHardening = false;

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain('Security hardening is disabled - consider enabling for production');
      }
    });

    it('should warn about :latest tags', async () => {
      config.baseImage = 'node:latest';

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain('Using :latest tags - consider pinning versions');
      }
    });

    it('should create non-root user by default', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('addgroup -g 1001 -S appuser');
        expect(result.value.content).toContain('adduser -S appuser -u 1001');
        expect(result.value.content).toContain('USER appuser');
      }
    });
  });

  describe('Port Handling', () => {
    it('should use default port when none specified', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express' }],
            ports: [], // Empty ports array
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should use default JavaScript port (3000)
        expect(result.value.content).toContain('EXPOSE 3000');
      }
    });

    it('should expose multiple ports', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express' }],
            ports: [3000, 8080, 9090],
          },
        },
        repo_path: '/test/repo',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('EXPOSE 3000');
        expect(result.value.content).toContain('EXPOSE 8080');
        expect(result.value.content).toContain('EXPOSE 9090');
      }
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            dependencies: [{ name: 'express' }],
            ports: [3000],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should update session with Dockerfile result', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSessionManager.update).toHaveBeenCalledWith('test-session-123', {
        workflow_state: expect.objectContaining({
          dockerfile_result: expect.objectContaining({
            content: expect.stringContaining('FROM node:18-alpine'),
            path: '/test/repo/Dockerfile',
            multistage: true,
          }),
          completed_steps: expect.arrayContaining(['generate-dockerfile']),
        }),
      });
    });

    it('should write Dockerfile to correct path', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.path).toMatch(/Dockerfile$/);
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          '/test/repo/Dockerfile',
          expect.stringContaining('FROM node:18-alpine'),
          'utf-8'
        );
      }
    });
  });
});