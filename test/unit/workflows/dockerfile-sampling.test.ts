import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { generateBestDockerfile, SamplingConfig, SamplingOptions } from '../../../src/workflows/dockerfile-sampling';
import { Success, Failure } from '../../../src/types/core';
import type { Logger } from 'pino';

// Mock the SamplingService dependency
jest.mock('../../../src/workflows/sampling/sampling-service');
import { SamplingService } from '../../../src/workflows/sampling/sampling-service';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger)
} as any;

const mockSamplingService = {
  generateBestDockerfile: jest.fn()
};

// Mock the SamplingService class
(SamplingService as jest.MockedClass<typeof SamplingService>).mockImplementation(() => mockSamplingService as any);

describe('Dockerfile Sampling', () => {
  const testConfig: SamplingConfig = {
    sessionId: 'test-session-123',
    repoPath: '/test/repo'
  };

  const testOptions: SamplingOptions = {
    environment: 'production',
    optimization: 'balanced'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mock response
    mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
      content: 'FROM node:16-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --production\nCOPY . .\nCMD ["npm", "start"]',
      score: 0.85,
      metadata: {
        strategy: 'multi-stage',
        variants: 5,
        optimization: 'balanced',
        baseImage: 'node:16-alpine',
        stages: 2
      }
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBestDockerfile', () => {
    it('should successfully generate the best Dockerfile using sampling service', async () => {
      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.content).toBeDefined();
      expect(result.value.score).toBe(0.85);
      expect(result.value.metadata).toEqual({
        strategy: 'multi-stage',
        variants: 5,
        optimization: 'balanced',
        baseImage: 'node:16-alpine',
        stages: 2
      });

      expect(SamplingService).toHaveBeenCalledWith(mockLogger);
      expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(testConfig, testOptions, mockLogger);
    });

    it('should log sampling start and completion', async () => {
      await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith({
        config: testConfig,
        options: testOptions
      }, 'Starting advanced Dockerfile sampling');

      expect(mockLogger.info).toHaveBeenCalledWith({
        score: 85, // Should be converted to 0-100 scale
        strategy: 'multi-stage',
        variants: 5,
        optimization: 'balanced'
      }, 'Advanced Dockerfile sampling completed successfully');
    });

    it('should handle different environment configurations', async () => {
      const developmentOptions: SamplingOptions = {
        environment: 'development',
        optimization: 'performance'
      };

      const result = await generateBestDockerfile(testConfig, developmentOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(testConfig, developmentOptions, mockLogger);
    });

    it('should handle staging environment', async () => {
      const stagingOptions: SamplingOptions = {
        environment: 'staging',
        optimization: 'security'
      };

      const result = await generateBestDockerfile(testConfig, stagingOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(testConfig, stagingOptions, mockLogger);
    });

    it('should handle options without optimization setting', async () => {
      const minimalOptions: SamplingOptions = {
        environment: 'production'
      };

      const result = await generateBestDockerfile(testConfig, minimalOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(testConfig, minimalOptions, mockLogger);
    });

    it('should handle different optimization strategies', async () => {
      const testCases: Array<{ optimization: SamplingOptions['optimization']; expectedCall: boolean }> = [
        { optimization: 'size', expectedCall: true },
        { optimization: 'security', expectedCall: true },
        { optimization: 'performance', expectedCall: true },
        { optimization: 'balanced', expectedCall: true }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        const options: SamplingOptions = {
          environment: 'production',
          optimization: testCase.optimization
        };

        const result = await generateBestDockerfile(testConfig, options, mockLogger);

        expect(result.ok).toBe(true);
        expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(testConfig, options, mockLogger);
      }
    });

    it('should handle sampling service failure', async () => {
      mockSamplingService.generateBestDockerfile.mockResolvedValue(
        Failure('No suitable Dockerfile candidates found')
      );

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Sampling failed: No suitable Dockerfile candidates found');

      expect(mockLogger.error).toHaveBeenCalledWith({
        error: 'No suitable Dockerfile candidates found'
      }, 'Sampling service failed');
    });

    it('should handle sampling service throwing an exception', async () => {
      mockSamplingService.generateBestDockerfile.mockRejectedValue(new Error('Service initialization failed'));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Dockerfile sampling error: Service initialization failed');

      expect(mockLogger.error).toHaveBeenCalledWith({
        error: 'Service initialization failed',
        sessionId: 'test-session-123'
      }, 'Dockerfile sampling failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockSamplingService.generateBestDockerfile.mockRejectedValue('String error message');

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Dockerfile sampling error: String error message');

      expect(mockLogger.error).toHaveBeenCalledWith({
        error: 'String error message',
        sessionId: 'test-session-123'
      }, 'Dockerfile sampling failed');
    });

    it('should handle high-scoring results correctly', async () => {
      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM alpine:latest\nRUN apk add --no-cache node npm\nWORKDIR /app\nCOPY . .\nRUN npm ci --production\nCMD ["node", "server.js"]',
        score: 0.95,
        metadata: {
          strategy: 'size-optimized',
          variants: 8,
          optimization: 'size',
          baseImage: 'alpine:latest',
          stages: 1
        }
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.score).toBe(0.95);

      expect(mockLogger.info).toHaveBeenCalledWith({
        score: 95, // Should be converted to 0-100 scale
        strategy: 'size-optimized',
        variants: 8,
        optimization: 'size'
      }, 'Advanced Dockerfile sampling completed successfully');
    });

    it('should handle low-scoring results correctly', async () => {
      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM node:latest\nCOPY . .\nRUN npm install\nCMD ["npm", "start"]',
        score: 0.42,
        metadata: {
          strategy: 'basic',
          variants: 2,
          optimization: 'balanced',
          baseImage: 'node:latest',
          stages: 1
        }
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.score).toBe(0.42);

      expect(mockLogger.info).toHaveBeenCalledWith({
        score: 42, // Should be converted to 0-100 scale
        strategy: 'basic',
        variants: 2,
        optimization: 'balanced'
      }, 'Advanced Dockerfile sampling completed successfully');
    });

    it('should preserve all metadata from sampling service', async () => {
      const complexMetadata = {
        strategy: 'multi-stage',
        variants: 10,
        optimization: 'security',
        baseImage: 'node:16-alpine',
        stages: 3,
        securityFeatures: ['non-root-user', 'minimal-packages'],
        buildTime: 45.2,
        imageSize: '156MB',
        vulnerabilities: 0
      };

      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM node:16-alpine AS builder...',
        score: 0.88,
        metadata: complexMetadata
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.metadata).toEqual(complexMetadata);
    });

    it('should handle empty or minimal metadata', async () => {
      const minimalMetadata = {
        strategy: 'basic',
        variants: 1,
        optimization: 'balanced'
      };

      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM node:16\nCOPY . .\nRUN npm install\nCMD ["node", "app.js"]',
        score: 0.65,
        metadata: minimalMetadata
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.metadata).toEqual(minimalMetadata);

      expect(mockLogger.info).toHaveBeenCalledWith({
        score: 65,
        strategy: 'basic',
        variants: 1,
        optimization: 'balanced'
      }, 'Advanced Dockerfile sampling completed successfully');
    });

    it('should handle different session IDs', async () => {
      const configs = [
        { ...testConfig, sessionId: 'session-001' },
        { ...testConfig, sessionId: 'session-002' },
        { ...testConfig, sessionId: 'workflow-12345' }
      ];

      for (const config of configs) {
        jest.clearAllMocks();
        
        const result = await generateBestDockerfile(config, testOptions, mockLogger);

        expect(result.ok).toBe(true);
        expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(config, testOptions, mockLogger);
      }
    });

    it('should handle different repository paths', async () => {
      const configs = [
        { ...testConfig, repoPath: '/app/frontend' },
        { ...testConfig, repoPath: '/services/api' },
        { ...testConfig, repoPath: '/microservices/user-service' }
      ];

      for (const config of configs) {
        jest.clearAllMocks();
        
        const result = await generateBestDockerfile(config, testOptions, mockLogger);

        expect(result.ok).toBe(true);
        expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(config, testOptions, mockLogger);
      }
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle SamplingService constructor failure', async () => {
      (SamplingService as jest.MockedClass<typeof SamplingService>).mockImplementation(() => {
        throw new Error('Failed to initialize sampling service');
      });

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Dockerfile sampling error: Failed to initialize sampling service');
    });

    it('should handle malformed sampling service response', async () => {
      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM node:16',
        score: 'invalid-score', // Invalid score type
        metadata: null // Invalid metadata
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.content).toBe('FROM node:16');
      expect(result.value.score).toBe('invalid-score'); // Should pass through as-is
      expect(result.value.metadata).toBe(null); // Should pass through as-is
    });

    it('should handle zero score correctly', async () => {
      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM scratch',
        score: 0,
        metadata: {
          strategy: 'minimal',
          variants: 1,
          optimization: 'size'
        }
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.score).toBe(0);

      expect(mockLogger.info).toHaveBeenCalledWith({
        score: 0, // 0 * 100 = 0
        strategy: 'minimal',
        variants: 1,
        optimization: 'size'
      }, 'Advanced Dockerfile sampling completed successfully');
    });

    it('should handle perfect score correctly', async () => {
      mockSamplingService.generateBestDockerfile.mockResolvedValue(Success({
        content: 'FROM node:16-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --production',
        score: 1.0,
        metadata: {
          strategy: 'optimal',
          variants: 12,
          optimization: 'balanced'
        }
      }));

      const result = await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.score).toBe(1.0);

      expect(mockLogger.info).toHaveBeenCalledWith({
        score: 100, // 1.0 * 100 = 100
        strategy: 'optimal',
        variants: 12,
        optimization: 'balanced'
      }, 'Advanced Dockerfile sampling completed successfully');
    });
  });

  describe('integration behavior', () => {
    it('should create new SamplingService instance for each call', async () => {
      await generateBestDockerfile(testConfig, testOptions, mockLogger);
      await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(SamplingService).toHaveBeenCalledTimes(2);
      expect(SamplingService).toHaveBeenCalledWith(mockLogger);
    });

    it('should pass logger to SamplingService constructor', async () => {
      await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(SamplingService).toHaveBeenCalledWith(mockLogger);
    });

    it('should call sampling service with exact parameters', async () => {
      await generateBestDockerfile(testConfig, testOptions, mockLogger);

      expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledWith(testConfig, testOptions, mockLogger);
      expect(mockSamplingService.generateBestDockerfile).toHaveBeenCalledTimes(1);
    });
  });
});