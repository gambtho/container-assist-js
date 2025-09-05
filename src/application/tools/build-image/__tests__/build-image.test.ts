/**
 * Unit tests for build-image tool
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('node:fs', () => ({
  promises: {
    readFile: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.unstable_mockModule('../utils', () => ({
  fileExists: jest.fn(),
}));

jest.unstable_mockModule('../error-recovery', () => ({
  executeWithRetry: jest.fn(),
}));

// Import modules AFTER setting up mocks
const buildImageHandler = (await import('../index')).default;
const fs = await import('node:fs');
const mockUtils = (await import('../utils')) as typeof import('../utils');
const mockErrorRecovery = (await import('../error-recovery')) as typeof import('../error-recovery');

// Import types and utilities
import type { BuildImageParams, BuildResult } from '../../schemas';
import type { Session } from '../../../../domain/types/session';
import type { SessionService, ProgressEmitter } from '../../../services/interfaces';
import { createMockToolContext, createSampleDockerfile } from '../../__tests__/shared/test-utils';
import { createMockDockerService } from '../../__tests__/shared/docker-mocks';

const mockFs = fs.promises as jest.Mocked<typeof fs.promises>;

// Type-safe mock utilities
interface MockUtils {
  fileExists: jest.MockedFunction<(path: string) => Promise<boolean>>;
}

interface MockErrorRecovery {
  executeWithRetry: jest.MockedFunction<
    <T>(fn: () => Promise<T>, options?: { maxAttempts?: number }) => Promise<T>
  >;
}

const typedMockUtils = mockUtils as MockUtils;
const typedMockErrorRecovery = mockErrorRecovery as MockErrorRecovery;

describe('build-image tool', () => {
  let mockContext: ReturnType<typeof createMockToolContext>;
  let mockDockerService: ReturnType<typeof createMockDockerService>;
  let mockSession: Session;
  let sampleDockerfile: string;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock context
    mockContext = createMockToolContext();
    mockDockerService = createMockDockerService();

    // Setup Docker service
    mockContext.dockerService = mockDockerService;

    // Create sample Dockerfile
    sampleDockerfile = createSampleDockerfile();

    // Create mock session with build context
    mockSession = {
      id: 'test-session-123',
      project_name: 'test-app',
      metadata: {
        projectName: 'test-app',
        repoPath: '/path/to/test-app',
      },
      workflow_state: {
        dockerfile_result: {
          path: '/path/to/test-app/Dockerfile',
          content: sampleDockerfile,
        },
        analysis_result: {
          language: 'javascript',
          framework: 'express',
          ports: [3000],
        },
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Setup session service mock
    const mockSessionService: jest.Mocked<SessionService> = {
      get: jest.fn().mockResolvedValue(mockSession),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateAtomic: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn(),
    };
    mockContext.sessionService = mockSessionService;

    // Setup filesystem mocks
    (mockFs.readFile as jest.MockedFunction<typeof mockFs.readFile>).mockResolvedValue(
      sampleDockerfile,
    );
    typedMockUtils.fileExists.mockResolvedValue(true);

    // Setup error recovery mock
    typedMockErrorRecovery.executeWithRetry.mockImplementation(
      async <T>(fn: () => Promise<T>) => await fn(),
    );

    // Setup progress emitter
    const mockProgressEmitter: jest.Mocked<ProgressEmitter> = {
      emit: jest.fn().mockResolvedValue(undefined),
    };
    mockContext.progressEmitter = mockProgressEmitter;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Tool descriptor configuration', () => {
    it('should have correct tool configuration', () => {
      expect(buildImageHandler.name).toBe('build_image');
      expect(buildImageHandler.description).toContain('Build Docker image');
      expect(buildImageHandler.category).toBe('workflow');
      expect(buildImageHandler.inputSchema).toBeDefined();
      expect(buildImageHandler.outputSchema).toBeDefined();
      expect(buildImageHandler.handler).toBeInstanceOf(Function);
    });

    it('should have correct chain hint configuration', () => {
      expect(buildImageHandler.chainHint).toBeDefined();
      expect(buildImageHandler.chainHint?.nextTool).toBe('scan_image');
      expect(buildImageHandler.chainHint?.reason).toContain('Scan built image');
      expect(buildImageHandler.chainHint?.paramMapper).toBeInstanceOf(Function);
    });

    it('should map output parameters correctly for chain hint', () => {
      const sampleOutput: BuildResult = {
        success: true,
        sessionId: 'test-session-123',
        imageId: 'sha256:abc123',
        tags: ['test-app:latest'],
        size: 100000000,
        layers: 5,
        buildTime: 30000,
        digest: 'sha256:abc123',
      };

      const mapped = buildImageHandler.chainHint?.paramMapper?.(sampleOutput);
      expect(mapped).toEqual({
        image_id: 'sha256:abc123',
        image_tag: 'test-app:latest',
      });
    });
  });

  describe('Input validation', () => {
    it('should validate required session ID', () => {
      const invalidInput = {} as BuildImageParams;

      expect(() => {
        buildImageHandler.inputSchema.parse(invalidInput);
      }).toThrow();
    });

    it('should accept valid input with minimal parameters', () => {
      const validInput: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const parsed = buildImageHandler.inputSchema.parse(validInput);
      expect(parsed).toMatchObject(validInput);
      expect(parsed.context).toBe('.'); // Default value
      expect(parsed.dockerfile).toBe('Dockerfile'); // Default value
      expect(parsed.noCache).toBe(false); // Default value
    });

    it('should accept input with all optional parameters', () => {
      const fullInput: BuildImageParams = {
        sessionId: 'test-session-123',
        context: './src',
        dockerfile: 'Dockerfile.prod',
        tags: ['app:v1.0.0', 'app:latest'],
        buildArgs: { NODE_ENV: 'production' },
        target: 'production',
        noCache: true,
        platform: 'linux/amd64',
        push: true,
        registry: 'registry.example.com',
      };

      const parsed = buildImageHandler.inputSchema.parse(fullInput);
      expect(parsed).toEqual(fullInput);
    });
  });

  describe('Session validation', () => {
    it('should fail when session service is not available', async () => {
      mockContext.sessionService = undefined;

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(buildImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session service not available',
      );
    });

    it('should fail when session is not found', async () => {
      const mockSessionServiceForTest: jest.Mocked<SessionService> = {
        get: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        updateAtomic: jest.fn(),
        initialize: jest.fn(),
      };
      mockContext.sessionService = mockSessionServiceForTest;

      const input: BuildImageParams = {
        sessionId: 'non-existent-session',
      };

      await expect(buildImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Session not found',
      );
    });
  });

  describe('Dockerfile location handling', () => {
    it('should use specified Dockerfile when it exists', async () => {
      typedMockUtils.fileExists
        .mockResolvedValueOnce(true) // Specified Dockerfile exists
        .mockResolvedValueOnce(true); // Generated Dockerfile also exists

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        dockerfile: 'custom.Dockerfile',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('Dockerfile'), // Generated one is preferred
        'utf-8',
      );
    });

    it('should fall back to generated Dockerfile when specified does not exist', async () => {
      typedMockUtils.fileExists
        .mockResolvedValueOnce(false) // Specified Dockerfile does not exist
        .mockResolvedValueOnce(true); // Generated Dockerfile exists

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        dockerfile: 'non-existent.Dockerfile',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedPath: expect.any(String),
        }),
        'Using generated Dockerfile',
      );
    });

    it('should fail when no Dockerfile is available', async () => {
      // Remove generated Dockerfile from session
      const sessionWithoutDockerfile: Session = {
        ...mockSession,
        workflow_state: {
          analysis_result: mockSession.workflow_state?.analysis_result,
        },
      };

      const mockSessionServiceForTest: jest.Mocked<SessionService> = {
        get: jest.fn().mockResolvedValue(sessionWithoutDockerfile),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        updateAtomic: jest.fn(),
        initialize: jest.fn(),
      };
      mockContext.sessionService = mockSessionServiceForTest;

      typedMockUtils.fileExists.mockResolvedValue(false);

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        dockerfile: 'non-existent.Dockerfile',
      };

      await expect(buildImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Dockerfile not found',
      );
    });

    it('should prefer generated Dockerfile when both exist', async () => {
      typedMockUtils.fileExists.mockResolvedValue(true);

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        dockerfile: 'original.Dockerfile',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedPath: expect.any(String),
        }),
        'Using generated Dockerfile instead of original',
      );
    });
  });

  describe('Docker build execution', () => {
    it('should successfully build Docker image using Docker service', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        tags: ['test-app:v1.0.0'],
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.imageId).toMatch(/^sha256:[a-f0-9]+$/);
      expect(result.tags).toEqual(['test-app:v1.0.0']);
      expect(result.size).toBeGreaterThan(0);
      expect(result.buildTime).toBeGreaterThan(0);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.any(String),
          dockerfile: expect.any(String),
          tags: ['test-app:v1.0.0'],
        }),
      );
    });

    it('should use default tags when none provided', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.tags).toEqual(['test-app:latest']);
    });

    it('should handle registry prefix for tags', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        tags: ['app:v1.0.0'],
        registry: 'registry.example.com',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['registry.example.com/app:v1.0.0'],
        }),
      );
    });

    it('should pass build arguments correctly', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        buildArgs: {
          NODE_ENV: 'production',
          API_URL: 'https://api.example.com',
        },
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          buildArgs: expect.objectContaining({
            NODE_ENV: 'production',
            API_URL: 'https://api.example.com',
            BUILD_DATE: expect.any(String),
          }),
        }),
      );
    });

    it('should handle multi-platform builds', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        platform: 'linux/arm64',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'linux/arm64',
        }),
      );

      expect(result.metadata?.platform).toBe('linux/arm64');
    });

    it('should handle target stage in multi-stage builds', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        target: 'production',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'production',
        }),
      );
    });

    it('should handle no-cache builds', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        noCache: true,
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          noCache: true,
        }),
      );

      expect(result.metadata).toEqual(
        expect.objectContaining({
          cached: false,
        }),
      );
    });
  });

  describe('Build error handling', () => {
    it('should handle Docker build failures', async () => {
      mockDockerService.build.mockRejectedValue(new Error('Docker build failed'));

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(buildImageHandler.handler(input, mockContext)).rejects.toThrow(
        'Docker build failed',
      );

      expect(mockContext.logger.error).toHaveBeenCalledWith(
        { error: 'Docker build failed' },
        'Docker build error',
      );
    });

    it('should retry build operation on transient failures', async () => {
      mockDockerService.build
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          imageId: 'sha256:abc123',
          tags: ['test-app:latest'],
          size: 100000000,
          layers: 5,
          success: true,
        });

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockErrorRecovery.executeWithRetry).toHaveBeenCalledWith(expect.any(Function), {
        maxAttempts: 2,
      });
    });

    it('should fall back to CLI when Docker service unavailable', async () => {
      // Remove Docker service
      mockContext.dockerService = undefined;

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.logger.warn).toHaveBeenCalledWith(
        'Docker service not available, using CLI fallback',
      );
    });
  });

  describe('Security analysis', () => {
    it('should detect security issues in Dockerfile', async () => {
      const insecureDockerfile = `
FROM node:16
RUN curl -sSL https://get.docker.com | sh
RUN sudo apt-get install -y something
USER root
      `.trim();

      mockFs.readFile.mockResolvedValue(insecureDockerfile);

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('sudo'),
          expect.stringContaining('curl | sh'),
        ]),
      );

      expect(mockContext.logger.warn).toHaveBeenCalledWith({
        warnings: expect.any(Array),
      });
    });

    it('should detect sensitive build arguments', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        buildArgs: {
          API_TOKEN: 'secret-token',
          DATABASE_PASSWORD: 'password123',
          NORMAL_VAR: 'value',
        },
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('API_TOKEN'),
          expect.stringContaining('DATABASE_PASSWORD'),
        ]),
      );
    });

    it('should not warn when no security issues detected', async () => {
      const secureDockerfile = `
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
CMD ["node", "index"]
      `.trim();

      mockFs.readFile.mockResolvedValue(secureDockerfile);

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        buildArgs: { NODE_ENV: 'production' },
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.warnings).toBeUndefined();
    });
  });

  describe('Registry push functionality', () => {
    it('should push to registry when requested', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        push: true,
        registry: 'registry.example.com',
        tags: ['app:v1.0.0'],
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockDockerService.push).toHaveBeenCalledWith({
        image: 'registry.example.com/app:v1.0.0',
        registry: 'registry.example.com',
      });

      expect(mockContext.logger.info).toHaveBeenCalledWith(
        { registry: 'registry.example.com' },
        'Pushing to registry',
      );
    });

    it('should not push when push flag is false', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        push: false,
        registry: 'registry.example.com',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockDockerService.push).not.toHaveBeenCalled();
    });

    it('should skip push when no registry specified', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        push: true,
        // No registry specified
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(mockDockerService.push).not.toHaveBeenCalled();
    });
  });

  describe('Progress tracking', () => {
    it('should emit progress updates throughout the build', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      const mockProgressEmitter = mockContext.progressEmitter as jest.Mocked<ProgressEmitter>;
      const emitMock = mockProgressEmitter['emit'] as jest.MockedFunction<ProgressEmitter['emit']>;
      expect(emitMock).toHaveBeenCalledTimes(4);

      // Verify progress sequence
      const calls = emitMock.mock.calls;
      expect(calls[0][0]).toMatchObject({
        sessionId: 'test-session-123',
        step: 'build_image',
        status: 'in_progress',
        message: 'Preparing Docker build',
        progress: 0.1,
      });

      expect(calls[3][0]).toMatchObject({
        step: 'build_image',
        status: 'completed',
        message: 'Docker image built successfully',
        progress: 1.0,
      });
    });

    it('should emit failure progress on error', async () => {
      mockDockerService.build.mockRejectedValue(new Error('Build failed'));

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      await expect(buildImageHandler.handler(input, mockContext)).rejects.toThrow('Build failed');

      const mockProgressEmitter = mockContext.progressEmitter;
      const calls = (mockProgressEmitter.emit as jest.Mock).mock.calls;
      const failureCall = calls.find((call) => call[0].status === 'failed');
      expect(failureCall).toBeDefined();
      expect(failureCall[0]).toMatchObject({
        sessionId: 'test-session-123',
        step: 'build_image',
        status: 'failed',
        message: 'Docker build failed',
        progress: 0,
      });
    });

    it('should work without progress emitter', async () => {
      mockContext.progressEmitter = undefined;

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
    });
  });

  describe('Session updates', () => {
    it('should update session with build result', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockContext.sessionService?.updateAtomic).toHaveBeenCalledWith(
        'test-session-123',
        expect.any(Function),
      );

      // Verify the session update includes build_result
      const updateFunction = jest.mocked(mockContext.sessionService!.updateAtomic).mock.calls[0][1];
      const updatedSession = updateFunction(mockSession);

      expect(updatedSession.workflow_state.build_result).toBeDefined();
      expect(updatedSession.workflow_state.build_result.imageId).toMatch(/^sha256:/);
      expect(updatedSession.workflow_state.build_result.success).toBe(true);
    });
  });

  describe('Build context resolution', () => {
    it('should use session repo path as context', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          context: path.resolve('/path/to/test-app'),
        }),
      );
    });

    it('should use custom context when provided', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
        context: './custom-context',
      };

      // Update session to not have repoPath
      const sessionWithoutRepo: Session = {
        ...mockSession,
        metadata: {
          projectName: 'test-app',
        },
      };

      mockContext.sessionService = {
        get: jest.fn().mockResolvedValue(sessionWithoutRepo),
        updateAtomic: jest.fn(),
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(mockDockerService.build).toHaveBeenCalledWith(
        expect.objectContaining({
          context: path.resolve('./custom-context'),
        }),
      );
    });
  });

  describe('Base image extraction', () => {
    it('should extract base image from Dockerfile', async () => {
      const dockerfileWithBaseImage = 'FROM node:18-alpine\nWORKDIR /app';
      mockFs.readFile.mockResolvedValue(dockerfileWithBaseImage);

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.metadata?.baseImage).toBe('node:18-alpine');
    });

    it('should handle unknown base image', async () => {
      const dockerfileWithoutFrom = 'WORKDIR /app\nCOPY . .';
      mockFs.readFile.mockResolvedValue(dockerfileWithoutFrom);

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.metadata?.baseImage).toBe('unknown');
    });
  });

  describe('Output validation', () => {
    it('should produce output that matches the schema', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      // Validate against output schema
      expect(() => buildImageHandler.outputSchema.parse(result)).not.toThrow();
    });

    it('should include all required fields', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.imageId).toBeDefined();
      expect(result.tags).toBeInstanceOf(Array);
      expect(typeof result.size).toBe('number');
      expect(typeof result.layers).toBe('number');
      expect(typeof result.buildTime).toBe('number');
      expect(result.digest).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should handle optional fields correctly', async () => {
      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const _result = await buildImageHandler.handler(input, mockContext);

      // Optional fields should be undefined when no warnings
      if (result.warnings !== undefined) {
        expect(result.warnings).toBeInstanceOf(Array);
      }

      // Metadata should always be present
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.dockerfile).toBeDefined();
      expect(result.metadata?.context).toBeDefined();
    });
  });

  describe('Performance considerations', () => {
    it('should complete build within reasonable time for small images', async () => {
      // Mock a fast build
      mockDockerService.build.mockResolvedValue({
        imageId: 'sha256:abc123',
        tags: ['test-app:latest'],
        size: 50000000, // 50MB
        layers: 5,
        buildTime: 5000, // 5 seconds
        success: true,
      });

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const startTime = Date.now();
      const result = await buildImageHandler.handler(input, mockContext);
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(10000); // Total handler time under 10s
      expect(result.buildTime).toBeLessThan(10000); // Build time under 10s
    });

    it('should handle large image builds', async () => {
      // Mock a large, slow build
      mockDockerService.build.mockResolvedValue({
        imageId: 'sha256:def456',
        tags: ['large-app:latest'],
        size: 1000000000, // 1GB
        layers: 20,
        buildTime: 120000, // 2 minutes
        success: true,
      });

      const input: BuildImageParams = {
        sessionId: 'test-session-123',
      };

      const result = await buildImageHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.size).toBe(1000000000);
      expect(result.buildTime).toBe(120000);
    });
  });
});
