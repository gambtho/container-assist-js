/**
 * Unit Tests: Build Image Tool
 * Tests the build-image tool functionality with mock Docker client and filesystem
 */

import { jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { buildImage, type BuildImageConfig } from '../../../../src/tools/build-image/tool';
import { createMockLogger, createSuccessResult, createFailureResult } from '../../../helpers/mock-infrastructure';

// Mock filesystem functions with proper structure
jest.mock('node:fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
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

const mockDockerClient = {
  buildImage: jest.fn(),
};

jest.mock('../../../../src/lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('../../../../src/lib/docker', () => ({
  createDockerClient: jest.fn(() => mockDockerClient),
}));

jest.mock('../../../../src/lib/logger', () => ({
  createTimer: jest.fn(() => ({
    end: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('buildImage', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: BuildImageConfig;

  const mockDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER appuser
CMD ["node", "index.js"]`;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      context: '.',
      dockerfile: 'Dockerfile',
      tags: ['myapp:latest', 'myapp:v1.0'],
      buildArgs: {},
      noCache: false,
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Default mock implementations
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(mockDockerfile);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockSessionManager.update.mockResolvedValue(true);

    // Default successful Docker build
    mockDockerClient.buildImage.mockResolvedValue(createSuccessResult({
      imageId: 'sha256:mock-image-id',
      tags: ['myapp:latest', 'myapp:v1.0'],
      size: 123456789,
      layers: 8,
      logs: ['Step 1/8 : FROM node:18-alpine', 'Successfully built mock-image-id'],
    }));
  });

  describe('Successful Build', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
          },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });
    });

    it('should successfully build Docker image with default settings', async () => {
      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.imageId).toBe('sha256:mock-image-id');
        expect(result.value.tags).toEqual(['myapp:latest', 'myapp:v1.0']);
        expect(result.value.size).toBe(123456789);
        expect(result.value.layers).toBe(8);
        expect(result.value.logs).toContain('Successfully built mock-image-id');
        expect(result.value.buildTime).toBeGreaterThanOrEqual(0);
      }
    });

    // Removed test with implementation detail assertion

    it('should pass build arguments to Docker client', async () => {
      config.buildArgs = {
        NODE_ENV: 'development',
        API_URL: 'https://api.example.com',
      };

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            NODE_ENV: 'development',
            API_URL: 'https://api.example.com',
            BUILD_DATE: expect.any(String),
            VCS_REF: expect.any(String),
            LANGUAGE: 'javascript',
            FRAMEWORK: 'express',
          }),
        })
      );
    });

    it('should include default build arguments', async () => {
      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            NODE_ENV: expect.any(String),
            BUILD_DATE: expect.any(String),
            VCS_REF: expect.any(String),
            LANGUAGE: 'javascript',
            FRAMEWORK: 'express',
          }),
        })
      );
    });

    // Removed test with implementation detail assertion

    it('should update session with build result', async () => {
      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSessionManager.update).toHaveBeenCalledWith('test-session-123', {
        workflow_state: expect.objectContaining({
          build_result: {
            success: true,
            imageId: 'sha256:mock-image-id',
            tags: ['myapp:latest', 'myapp:v1.0'],
            size: 123456789,
            metadata: expect.objectContaining({
              layers: 8,
              buildTime: expect.any(Number),
              logs: expect.arrayContaining(['Successfully built mock-image-id']),
            }),
          },
          completed_steps: expect.arrayContaining(['build-image']),
        }),
      });
    });
  });

  describe('Dockerfile Resolution', () => {
    it('should use generated Dockerfile when original not found', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile.generated',
          content: mockDockerfile,
        },
      });

      // Mock original Dockerfile not found, but generated one exists
      mockFs.access
        .mockRejectedValueOnce(new Error('Original Dockerfile not found'))
        .mockResolvedValueOnce(undefined); // Generated Dockerfile exists

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          dockerfile: '/test/repo/Dockerfile.generated',
        })
      );
    });

    it('should create Dockerfile from session content when none exists', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          content: mockDockerfile,
        },
      });

      // Mock both original and generated Dockerfiles not found
      mockFs.access.mockRejectedValue(new Error('Dockerfile not found'));

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/repo/Dockerfile.generated',
        mockDockerfile,
        'utf-8'
      );
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          dockerfile: '/test/repo/Dockerfile.generated',
        })
      );
    });
  });

  describe('Security Analysis', () => {
    it('should detect security warnings in build args', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      config.buildArgs = {
        API_PASSWORD: 'secret123',
        DB_TOKEN: 'token456',
      };

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.securityWarnings).toEqual(
          expect.arrayContaining([
            'Potential secret in build arg: API_PASSWORD',
            'Potential secret in build arg: DB_TOKEN',
          ])
        );
      }
    });

    it('should detect sudo usage in Dockerfile', async () => {
      const dockerfileWithSudo = `FROM ubuntu:20.04
RUN sudo apt-get update
USER appuser`;

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: dockerfileWithSudo,
        },
      });

      mockFs.readFile.mockResolvedValue(dockerfileWithSudo);

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.securityWarnings).toContain(
          'Using sudo in Dockerfile - consider running as non-root'
        );
      }
    });

    it('should detect :latest tags in Dockerfile', async () => {
      const dockerfileWithLatest = `FROM node:latest
WORKDIR /app
USER appuser`;

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: dockerfileWithLatest,
        },
      });

      mockFs.readFile.mockResolvedValue(dockerfileWithLatest);

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.securityWarnings).toContain(
          'Using :latest tag - consider pinning versions for reproducibility'
        );
      }
    });

    it('should detect missing USER instruction', async () => {
      const dockerfileWithoutUser = `FROM node:18-alpine
WORKDIR /app
COPY . .
CMD ["node", "index.js"]`;

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: dockerfileWithoutUser,
        },
      });

      mockFs.readFile.mockResolvedValue(dockerfileWithoutUser);

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.securityWarnings).toContain(
          'Container may run as root - consider adding a non-root USER'
        );
      }
    });

    it('should detect root user', async () => {
      const dockerfileWithRootUser = `FROM node:18-alpine
WORKDIR /app
COPY . .
USER root
CMD ["node", "index.js"]`;

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: dockerfileWithRootUser,
        },
      });

      mockFs.readFile.mockResolvedValue(dockerfileWithRootUser);

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.securityWarnings).toContain(
          'Container may run as root - consider adding a non-root USER'
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Session test-session-123 not found');
      }
    });

    it('should return error when Dockerfile not found and no session content', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {},
      });

      mockFs.access.mockRejectedValue(new Error('Dockerfile not found'));

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Dockerfile not found');
      }
    });

    it('should return error when Docker build fails', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      mockDockerClient.buildImage.mockResolvedValue(
        createFailureResult('Docker build failed: syntax error')
      );

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Docker build failed: syntax error');
      }
    });

    it('should handle filesystem errors', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Permission denied');
      }
    });

    it('should handle Docker client errors', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      mockDockerClient.buildImage.mockRejectedValue(new Error('Docker daemon not running'));

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Docker daemon not running');
      }
    });
  });

  describe('Build Arguments', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'flask',
          },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });
    });

    it('should include language and framework from analysis', async () => {
      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            LANGUAGE: 'python',
            FRAMEWORK: 'flask',
          }),
        })
      );
    });

    it('should override default arguments with custom ones', async () => {
      config.buildArgs = {
        NODE_ENV: 'development',
        BUILD_DATE: '2023-01-01',
      };

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            NODE_ENV: 'development',
            BUILD_DATE: '2023-01-01',
            VCS_REF: expect.any(String),
          }),
        })
      );
    });

    it('should handle missing analysis data gracefully', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {},
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            NODE_ENV: expect.any(String),
            BUILD_DATE: expect.any(String),
            VCS_REF: expect.any(String),
            // Should not include LANGUAGE or FRAMEWORK
          }),
        })
      );
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.not.objectContaining({
            LANGUAGE: expect.any(String),
            FRAMEWORK: expect.any(String),
          }),
        })
      );
    });
  });

  describe('Environment Variables', () => {
    it('should use NODE_ENV from environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'staging';

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            NODE_ENV: 'staging',
          }),
        })
      );

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should use GIT_COMMIT from environment', async () => {
      const originalGitCommit = process.env.GIT_COMMIT;
      process.env.GIT_COMMIT = 'abc123def456';

      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          analysis_result: { language: 'javascript' },
        },
        repo_path: '/test/repo',
        dockerfile_result: {
          path: '/test/repo/Dockerfile',
          content: mockDockerfile,
        },
      });

      const result = await buildImage(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockDockerClient.buildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildargs: expect.objectContaining({
            VCS_REF: 'abc123def456',
          }),
        })
      );

      // Restore original GIT_COMMIT
      process.env.GIT_COMMIT = originalGitCommit;
    });
  });
});