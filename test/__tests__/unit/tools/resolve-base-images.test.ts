/**
 * Unit Tests: Resolve Base Images Tool
 * Tests base image resolution functionality with mock registry and session management
 */

import { jest } from '@jest/globals';
import { resolveBaseImagesTool, type ResolveBaseImagesConfig } from '@tools/resolve-base-images/tool';
import { createMockLogger } from '../../../utils/mock-factories';

// Mock lib modules
const mockSessionManager = {
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockDockerRegistryClient = {
  getImageMetadata: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('@lib/docker', () => ({
  createDockerRegistryClient: jest.fn(() => mockDockerRegistryClient),
}));

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

jest.mock('@lib/base-images', () => ({
  getSuggestedBaseImages: jest.fn((language: string, framework?: string) => {
    if (language === 'javascript' || language === 'typescript') {
      return framework === 'react' 
        ? ['node:18-alpine', 'node:18', 'node:16-alpine']
        : ['node:18', 'node:18-alpine', 'node:16'];
    }
    if (language === 'python') {
      return ['python:3.11-slim', 'python:3.11', 'python:3.11-alpine'];
    }
    return ['ubuntu:20.04', 'alpine:3.16'];
  }),
  getRecommendedBaseImage: jest.fn((language: string) => {
    const defaults: Record<string, string> = {
      javascript: 'node:18',
      typescript: 'node:18',
      python: 'python:3.11',
      java: 'openjdk:17',
      go: 'golang:1.19',
    };
    return defaults[language] || 'ubuntu:20.04';
  }),
}));

describe('resolveBaseImagesTool', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: ResolveBaseImagesConfig;
  const mockSession = {
    id: 'test-session',
    workflow_state: {
      analysis_result: {
        language: 'javascript',
        framework: 'react',
      },
      completed_steps: ['analyze-repo'],
      metadata: {},
    },
  };

  const mockImageMetadata = {
    name: 'node',
    tag: '18-alpine',
    digest: 'sha256:abc123',
    size: 45000000,
    lastUpdated: '2023-10-15T10:30:00Z',
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      targetEnvironment: 'production',
      securityLevel: 'medium',
      performancePriority: 'balanced',
    };

    // Reset all mocks
    jest.clearAllMocks();
    
    // Default successful mock responses
    mockSessionManager.get.mockResolvedValue(mockSession);
    mockSessionManager.update.mockResolvedValue(undefined);
    mockDockerRegistryClient.getImageMetadata.mockResolvedValue(mockImageMetadata);
  });

  describe('successful base image resolution', () => {
    it('should resolve base images for JavaScript/React application', async () => {
      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          sessionId: 'test-session-123',
          primaryImage: {
            name: 'node',
            tag: '18-alpine',
            digest: 'sha256:abc123',
            size: 45000000,
            lastUpdated: '2023-10-15T10:30:00Z',
          },
          alternativeImages: [
            {
              name: 'node',
              tag: '18',
              reason: 'More compatibility',
            },
            {
              name: 'node',
              tag: '16-alpine',
              reason: 'Smaller size, better security',
            },
          ],
          rationale: 'Selected node:18-alpine for javascript/react application based on production environment with medium security requirements',
          securityConsiderations: [
            'Standard base image with regular security updates',
            'Recommend scanning with Trivy or Snyk before deployment',
          ],
          performanceNotes: [
            'Alpine images are smaller but may have compatibility issues with some packages',
          ],
        });
      }
    });

    it('should prefer Alpine images for high security production environment', async () => {
      const highSecurityConfig = {
        ...config,
        targetEnvironment: 'production' as const,
        securityLevel: 'high' as const,
      };

      const result = await resolveBaseImagesTool.execute(highSecurityConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.securityConsiderations).toContain('Using minimal Alpine-based image for reduced attack surface');
      }
    });

    it('should handle Python applications', async () => {
      const sessionWithPython = {
        ...mockSession,
        workflow_state: {
          ...mockSession.workflow_state,
          analysis_result: {
            language: 'python',
            framework: 'flask',
          },
        },
      };
      mockSessionManager.get.mockResolvedValue(sessionWithPython);

      const pythonMetadata = {
        ...mockImageMetadata,
        name: 'python',
        tag: '3.11-slim',
      };
      mockDockerRegistryClient.getImageMetadata.mockResolvedValue(pythonMetadata);

      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primaryImage.name).toBe('python');
        expect(result.value.rationale).toContain('python/flask application');
      }
    });

    it('should use default values when optional parameters not provided', async () => {
      const minimalConfig = {
        sessionId: 'test-session-123',
      };

      const result = await resolveBaseImagesTool.execute(minimalConfig, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          targetEnvironment: 'production',
          securityLevel: 'medium',
        }),
        'Resolving base images'
      );
    });
  });

  describe('failure scenarios', () => {
    it('should fail when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should fail when no analysis result available', async () => {
      const sessionWithoutAnalysis = {
        ...mockSession,
        workflow_state: {
          completed_steps: [],
          metadata: {},
        },
      };
      mockSessionManager.get.mockResolvedValue(sessionWithoutAnalysis);

      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      if (!result.ok) {
        expect(result.error).toBe('Repository must be analyzed first - run analyze_repo');
      }
    });

    it('should handle registry client errors', async () => {
      mockDockerRegistryClient.getImageMetadata.mockRejectedValue(new Error('Registry error'));

      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(!result.ok).toBe(true);
      expect(mockTimer.error).toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('should update session with base image recommendation', async () => {
      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            completed_steps: expect.arrayContaining(['analyze-repo', 'resolve-base-images']),
            metadata: expect.objectContaining({
              base_image_recommendation: expect.any(Object),
            }),
          }),
        })
      );

      expect(result.ok).toBe(true);
    });

    it('should work with context-provided session manager', async () => {
      const contextSessionManager = {
        get: jest.fn().mockResolvedValue(mockSession),
        update: jest.fn().mockResolvedValue(undefined),
      };

      const context = { sessionManager: contextSessionManager };

      await resolveBaseImagesTool.execute(config, mockLogger, context);

      expect(contextSessionManager.get).toHaveBeenCalledWith('test-session-123');
      expect(contextSessionManager.update).toHaveBeenCalled();
    });
  });

  describe('image selection logic', () => {
    it('should handle images without tags', async () => {
      const sessionWithUnknown = {
        ...mockSession,
        workflow_state: {
          ...mockSession.workflow_state,
          analysis_result: {
            language: 'unknown',
          },
        },
      };
      mockSessionManager.get.mockResolvedValue(sessionWithUnknown);

      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      // Should fall back to ubuntu:20.04 for unknown languages
    });

    it('should provide proper alternative image reasons', async () => {
      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alternativeImages?.[1]?.reason).toBe('Smaller size, better security');
        expect(result.value.alternativeImages?.[0]?.reason).toBe('More compatibility');
      }
    });
  });

  describe('logging and timing', () => {
    it('should log resolution start and completion', async () => {
      await resolveBaseImagesTool.execute(config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'test-session-123',
          targetEnvironment: 'production',
          securityLevel: 'medium',
        }),
        'Resolving base images'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryImage: 'node:18-alpine',
        }),
        'Base image resolution completed'
      );
    });

    it('should end timer on success', async () => {
      await resolveBaseImagesTool.execute(config, mockLogger);

      expect(mockTimer.end).toHaveBeenCalledWith({ primaryImage: 'node:18-alpine' });
    });

    it('should handle errors with timer', async () => {
      mockSessionManager.get.mockRejectedValue(new Error('Session error'));

      const result = await resolveBaseImagesTool.execute(config, mockLogger);

      expect(mockTimer.error).toHaveBeenCalled();
      expect(!result.ok).toBe(true);
    });
  });

  describe('tool structure', () => {
    it('should have correct tool name', () => {
      expect(resolveBaseImagesTool.name).toBe('resolve-base-images');
    });

    it('should have execute function', () => {
      expect(typeof resolveBaseImagesTool.execute).toBe('function');
    });

    it('should accept context parameter', () => {
      expect(resolveBaseImagesTool.execute.length).toBe(3); // config, logger, context
    });
  });
});