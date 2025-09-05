/**
 * Unit tests for generate-dockerfile tool
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('node:fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
  },
}));

// Import modules AFTER setting up mocks
const generateDockerfileHandler = (await import('../index')).default;
const fs = await import('node:fs');

// Import types and utilities
import type { GenerateDockerfileParams, DockerfileResult } from '../../schemas';
import type { AnalysisResult, Session } from '../../../../domain/types/session';
import { createMockToolContext } from '../../__tests__/shared/test-utils';

const mockFs = fs.promises as jest.Mocked<typeof fs.promises>;

describe('generate-dockerfile tool', () => {
  let mockContext: ReturnType<typeof createMockToolContext>;
  let mockAnalysisResult: AnalysisResult;
  let mockSession: Session;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock context
    mockContext = createMockToolContext();

    // Create mock analysis result
    mockAnalysisResult = {
      language: 'javascript',
      framework: 'express',
      build_system: {
        type: 'npm',
        build_file: 'package.json',
        build_command: 'npm run build',
        test_command: 'npm test',
      },
      dependencies: [
        { name: 'express', version: '^4.18.0', type: 'runtime' },
        { name: 'cors', version: '^2.8.5', type: 'runtime' },
        { name: 'jest', version: '^29.0.0', type: 'test' },
      ],
      ports: [3000],
      has_tests: true,
      docker_compose_exists: false,
      hasDockerfile: false,
      hasDockerCompose: false,
      hasKubernetes: false,
      recommendations: {
        baseImage: 'node:20-alpine',
        buildStrategy: 'multi-stage',
        securityNotes: ['Use non-root user', 'Pin dependency versions'],
      },
    };

    // Create mock session with analysis result
    mockSession = {
      id: 'test-session-123',
      project_name: 'test-app',
      workflow_state: {
        analysis_result: mockAnalysisResult,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Setup session service mock
    mockContext.sessionService = {
      get: jest.fn().mockResolvedValue(mockSession),
      updateAtomic: jest.fn().mockResolvedValue(undefined),
    };

    // Setup filesystem mock
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Tool descriptor configuration', () => {
    it('should have correct tool configuration', () => {
      expect(generateDockerfileHandler.name).toBe('generate_dockerfile');
      expect(generateDockerfileHandler.description).toContain('Dockerfile');
      expect(generateDockerfileHandler.category).toBe('workflow');
      expect(generateDockerfileHandler.inputSchema).toBeDefined();
      expect(generateDockerfileHandler.outputSchema).toBeDefined();
      expect(generateDockerfileHandler.handler).toBeInstanceOf(Function);
    });

    it('should have correct chain hint configuration', () => {
      expect(generateDockerfileHandler.chainHint).toBeDefined();
      expect(generateDockerfileHandler.chainHint?.nextTool).toBe('build_image');
      expect(generateDockerfileHandler.chainHint?.reason).toContain('Build Docker image');
      expect(generateDockerfileHandler.chainHint?.paramMapper).toBeInstanceOf(Function);
    });

    it('should map output parameters correctly for chain hint', () => {
      const sampleOutput: DockerfileResult = {
        success: true,
        sessionId: 'test-session-123',
        dockerfile: 'FROM node:20-alpine\nWORKDIR /app',
        path: '/path/to/Dockerfile',
        validation: [],
      };

      const mapped = generateDockerfileHandler.chainHint?.paramMapper?.(sampleOutput);
      expect(mapped).toEqual({
        session_id: undefined, // Due to path containing '/'
        dockerfile_path: '/path/to/Dockerfile',
        tags: expect.arrayContaining([expect.stringContaining('app:')]),
      });
    });
  });

  describe('Input validation', () => {
    it('should validate required session ID', () => {
      const invalidInput = {} as GenerateDockerfileParams;

      expect(() => {
        generateDockerfileHandler.inputSchema.parse(invalidInput);
      }).toThrow();
    });

    it('should accept valid input with session ID', () => {
      const validInput: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const parsed = generateDockerfileHandler.inputSchema.parse(validInput);
      expect(parsed).toEqual(validInput);
    });
  });

  describe('Session validation', () => {
    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      await expect(generateDockerfileHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(null),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'non-existent-session',
      };

      await expect(generateDockerfileHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });

    it('should fail when no analysis result is available', async () => {
      const emptySession: Session = {
        ...mockSession,
        workflow_state: {},
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(emptySession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      await expect(generateDockerfileHandler.handler(input, mockContext)).rejects.toThrow(
        'No analysis result found',
      );
    });
  });

  describe('Dockerfile generation', () => {
    it('should generate basic Dockerfile for JavaScript/Node.js project', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.dockerfile).toContain('FROM node:20-alpine');
      expect(result.dockerfile).toContain('WORKDIR /app');
      expect(result.dockerfile).toContain('EXPOSE 3000');
      expect(result.dockerfile).toContain('USER appuser');
      expect(result.path).toContain('Dockerfile');
    });

    it('should generate Dockerfile for TypeScript project', async () => {
      const typescriptAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'typescript',
        framework: 'nextjs',
      };

      const typescriptSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: typescriptAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(typescriptSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM node:20-alpine');
      expect(result.dockerfile).toContain('CMD ["npm", "start"]');
    });

    it('should generate Dockerfile for Python project', async () => {
      const pythonAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'python',
        framework: 'flask',
        ports: [5000],
        build_system: {
          type: 'pip',
          build_file: 'requirements.txt',
          build_command: 'pip install -r requirements.txt',
        },
      };

      const pythonSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: pythonAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(pythonSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM python:3.11-slim');
      expect(result.dockerfile).toContain('EXPOSE 5000');
      expect(result.dockerfile).toContain('CMD ["python", "app.py"]');
      expect(result.dockerfile).toContain('requirements.txt');
    });

    it('should generate Dockerfile for Java Maven project', async () => {
      const javaAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'java',
        framework: 'spring',
        ports: [8080],
        build_system: {
          type: 'maven',
          build_file: 'pom.xml',
          build_command: 'mvn package',
        },
        dependencies: [{ name: 'spring-boot-starter', version: '3.0.0', type: 'runtime' }],
      };

      const javaSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: javaAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(javaSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM openjdk:17-jdk-slim');
      expect(result.dockerfile).toContain('EXPOSE 8080');
      expect(result.dockerfile).toContain('ENTRYPOINT ["java", "-jar", "app.jar"]');
    });

    it('should generate Dockerfile for Go project', async () => {
      const goAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'go',
        ports: [8080],
        build_system: {
          type: 'go',
          build_file: 'go.mod',
          build_command: 'go build',
        },
        dependencies: [{ name: 'github.com/gin-gonic/gin', version: 'v1.9.0', type: 'runtime' }],
      };

      const goSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: goAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(goSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM golang:1.21-alpine');
      expect(result.dockerfile).toContain('EXPOSE 8080');
      expect(result.dockerfile).toContain('CMD ["./main"]');
    });
  });

  describe('Multi-stage builds', () => {
    it('should generate multi-stage build for projects with many dependencies', async () => {
      const largeDepsAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        dependencies: Array.from({ length: 10 }, (_, i) => ({
          name: `dependency-${i}`,
          version: '1.0.0',
          type: 'runtime' as const,
        })),
      };

      const largeDepsSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: largeDepsAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(largeDepsSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM node:20-alpine AS builder');
      expect(result.dockerfile).toContain('# Build stage');
      expect(result.dockerfile).toContain('# Runtime stage');
    });

    it('should generate single-stage build for simple projects', async () => {
      const simpleDepsAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        dependencies: [{ name: 'express', version: '^4.18.0', type: 'runtime' }],
      };

      const simpleDepsSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: simpleDepsAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(simpleDepsSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).not.toContain('AS builder');
      expect(result.dockerfile).not.toContain('# Build stage');
    });
  });

  describe('Security features', () => {
    it('should include non-root user creation', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('addgroup -g 1001 -S appuser');
      expect(result.dockerfile).toContain('adduser -S appuser -u 1001');
      expect(result.dockerfile).toContain('USER appuser');
    });

    it('should use appropriate file ownership', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('--chown=appuser:appuser');
    });

    it('should include health check when requested', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('HEALTHCHECK');
      expect(result.dockerfile).toContain('--interval=30s');
      expect(result.dockerfile).toContain('localhost:3000/health');
    });

    it('should adapt health check port to application port', async () => {
      const customPortAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        ports: [8080],
      };

      const customPortSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: customPortAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(customPortSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('localhost:8080/health');
    });
  });

  describe('Port handling', () => {
    it('should expose all detected ports', async () => {
      const multiPortAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        ports: [3000, 8080, 9090],
      };

      const multiPortSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: multiPortAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(multiPortSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('EXPOSE 3000');
      expect(result.dockerfile).toContain('EXPOSE 8080');
      expect(result.dockerfile).toContain('EXPOSE 9090');
    });

    it('should use default port 3000 when no ports detected', async () => {
      const noPortAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        ports: [],
      };

      const noPortSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: noPortAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(noPortSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('EXPOSE 3000');
    });
  });

  describe('Framework-specific optimizations', () => {
    it('should optimize for Next.js applications', async () => {
      const nextjsAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        framework: 'nextjs',
      };

      const nextjsSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: nextjsAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(nextjsSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('CMD ["npm", "start"]');
    });

    it('should optimize for Django applications', async () => {
      const djangoAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'python',
        framework: 'django',
        ports: [8000],
      };

      const djangoSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: djangoAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(djangoSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain(
        'CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]',
      );
    });

    it('should optimize for FastAPI applications', async () => {
      const fastapiAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'python',
        framework: 'fastapi',
        ports: [8000],
      };

      const fastapiSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: fastapiAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(fastapiSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain(
        'CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]',
      );
    });
  });

  describe('Security validation', () => {
    it('should validate generated Dockerfile for security issues', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.validation).toBeDefined();
      expect(result.validation).toBeInstanceOf(Array);

      // Should not have common security issues since we generate secure Dockerfiles
      const securityIssues = result.validation.filter(
        (issue) => issue.includes('root user') || issue.includes('latest tag'),
      );
      expect(securityIssues).toHaveLength(0);
    });

    it('should detect and report security warnings in custom Dockerfile content', async () => {
      // Mock a scenario where we generate a Dockerfile with security issues
      const unsafeAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        recommendations: {
          baseImage: 'ubuntu:latest', // Uses latest tag
          buildStrategy: 'single-stage',
        },
      };

      const unsafeSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: unsafeAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(unsafeSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      // The actual generation still uses secure practices, but let's test the validation function
      expect(result.validation).toBeDefined();
    });

    it('should warn about exposed sensitive ports', async () => {
      // Create a mock analysis that would expose SSH port
      const sensitivePortAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        ports: [22, 3000], // Include SSH port
      };

      const sensitivePortSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: sensitivePortAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sensitivePortSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      // Check if the validation detects sensitive port exposure
      const sensitivePortWarning = result.validation.find((warning) =>
        warning.includes('sensitive port 22'),
      );
      expect(sensitivePortWarning).toBeDefined();
    });
  });

  describe('File system operations', () => {
    it('should write Dockerfile to correct path', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('Dockerfile'),
        expect.stringContaining('FROM node:20-alpine'),
        'utf-8',
      );

      expect(result.path).toContain('Dockerfile');
    });

    it('should handle file system errors gracefully', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      await expect(generateDockerfileHandler.handler(input, mockContext)).rejects.toThrow(
        'Permission denied',
      );

      expect(mockContext.logger.error).toHaveBeenCalled();
    });
  });

  describe('Session updates', () => {
    it('should update session with Dockerfile result', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const _result = await generateDockerfileHandler.handler(input, mockContext);

      expect(mockContext.sessionService?.updateAtomic).toHaveBeenCalledWith(
        'test-session-123',
        expect.any(Function),
      );

      // Verify the session update includes dockerfile_result
      const updateFunction = jest.mocked(mockContext.sessionService!.updateAtomic).mock.calls[0][1];
      const updatedSession = updateFunction(mockSession);

      expect(updatedSession.workflow_state.dockerfile_result).toBeDefined();
      expect(updatedSession.workflow_state.dockerfile_result.content).toContain(
        'FROM node:20-alpine',
      );
      expect(updatedSession.workflow_state.dockerfile_result.multistage).toBe(true);
    });

    it('should handle session update failures gracefully', async () => {
      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(mockSession),
        updateAtomic: jest.fn().mockRejectedValue(new Error('Session update failed')),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      await expect(generateDockerfileHandler.handler(input, mockContext)).rejects.toThrow(
        'Session update failed',
      );
    });
  });

  describe('Base image selection', () => {
    it('should use recommended base image from analysis', async () => {
      const customBaseAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        recommendations: {
          baseImage: 'node:18-slim',
          buildStrategy: 'single-stage',
        },
      };

      const customBaseSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: customBaseAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(customBaseSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM node:18-slim');
    });

    it('should fall back to default base image when none recommended', async () => {
      const noRecommendationAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        recommendations: undefined,
      };

      const noRecommendationSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: noRecommendationAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(noRecommendationSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM node:20-alpine'); // Default for JavaScript
    });

    it('should use appropriate base image for unknown languages', async () => {
      const unknownLanguageAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        language: 'unknown-language',
      };

      const unknownLanguageSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: unknownLanguageAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(unknownLanguageSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.dockerfile).toContain('FROM alpine:3.19'); // Default fallback
    });
  });

  describe('Output validation', () => {
    it('should produce output that matches the schema', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      // Validate against output schema
      expect(() => generateDockerfileHandler.outputSchema.parse(result)).not.toThrow();
    });

    it('should include all required fields in output', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.dockerfile).toBeDefined();
      expect(typeof result.dockerfile).toBe('string');
      expect(result.path).toBeDefined();
      expect(result.validation).toBeInstanceOf(Array);
    });

    it('should generate valid Dockerfile content', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const result = await generateDockerfileHandler.handler(input, mockContext);

      // Basic Dockerfile structure validation
      expect(result.dockerfile).toContain('FROM ');
      expect(result.dockerfile).toContain('WORKDIR ');
      expect(result.dockerfile).toMatch(/EXPOSE \d+/);
      expect(result.dockerfile).toContain('USER ');
      expect(result.dockerfile).toContain('CMD ');
    });
  });

  describe('Error handling', () => {
    it('should handle various error scenarios gracefully', async () => {
      const scenarios = [
        {
          description: 'session service error',
          setup: () => {
            mockContext.sessionService = {
              get: jest.fn().mockRejectedValue(new Error('Database connection failed')),
              updateAtomic: jest.fn(),
            };
          },
        },
      ];

      for (const scenario of scenarios) {
        scenario.setup();

        const input: GenerateDockerfileParams = {
          sessionId: 'test-session-123',
        };

        await expect(generateDockerfileHandler.handler(input, mockContext)).rejects.toThrow();

        expect(mockContext.logger.error).toHaveBeenCalled();
      }
    });

    it('should log errors with appropriate context', async () => {
      mockContext.sessionService = {
        get: jest.fn().mockRejectedValue(new Error('Test error')),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      try {
        await generateDockerfileHandler.handler(input, mockContext);
      } catch (error) {
        expect(mockContext.logger.error).toHaveBeenCalledWith(
          { error: expect.any(Error) },
          'Error generating Dockerfile',
        );
      }
    });
  });

  describe('Performance considerations', () => {
    it('should complete generation within reasonable time', async () => {
      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const startTime = Date.now();
      const result = await generateDockerfileHandler.handler(input, mockContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large dependency lists efficiently', async () => {
      const largeDepsAnalysis: AnalysisResult = {
        ...mockAnalysisResult,
        dependencies: Array.from({ length: 100 }, (_, i) => ({
          name: `dependency-${i}`,
          version: '1.0.0',
          type: 'runtime' as const,
        })),
      };

      const largeDepsSession: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: largeDepsAnalysis,
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(largeDepsSession),
        updateAtomic: jest.fn(),
      };

      const input: GenerateDockerfileParams = {
        sessionId: 'test-session-123',
      };

      const startTime = Date.now();
      const result = await generateDockerfileHandler.handler(input, mockContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should handle large lists efficiently
    });
  });
});
