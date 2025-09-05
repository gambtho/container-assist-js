/**
 * Docker Client Unit Tests
 * Comprehensive test coverage for Docker infrastructure client
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';

// Mock modules using ESM pattern
jest.unstable_mockModule('tar-fs', () => ({
  pack: dockerMocks.mockTarFs.pack
}));

jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => dockerMocks.mockDockerode)
}));

jest.unstable_mockModule('../../../../src/infrastructure/scanners/trivy-scanner', () => ({
  TrivyScanner: jest.fn().mockImplementation(() => trivyMocks.mockTrivyScanner)
}));

// Import mocks first
import * as dockerMocks from '../../../utils/mocks/docker-mock';
import * as trivyMocks from '../../../utils/mocks/trivy-mock';

const { mockDockerode, setupDockerMocks, MockStream, mockTarFs } = dockerMocks;
const { mockTrivyScanner, setupTrivyMocks } = trivyMocks;

// Import after mocking using dynamic imports
const { DockerClient } = await import('../../../../src/infrastructure/docker-client');
const { DockerError } = await import('../../../../src/errors/index');
const { ErrorCode } = await import('../../../../src/domain/types/errors');
const { createMockLogger } = await import('../../../utils/mock-factories');

// Type imports still work normally
import type { DockerClientConfig } from '../../../../src/infrastructure/docker-client';
import type { DockerBuildOptions, DockerScanResult, ScanOptions } from '../../../../src/domain/types/docker';

describe('DockerClient', () => {
  let dockerClient: DockerClient;
  let config: DockerClientConfig;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Use the setup functions from our mocks
    setupDockerMocks();
    setupTrivyMocks();
    
    mockLogger = createMockLogger();
    
    config = {
      socketPath: '/var/run/docker.sock',
      trivy: {
        scannerPath: 'trivy',
        cacheDir: '/tmp/trivy',
        timeout: 30000,
      },
    };

    dockerClient = new DockerClient(config, mockLogger);
  });

  describe('Constructor and Configuration', () => {
    test('should create DockerClient with socket path', () => {
      expect(dockerClient).toBeInstanceOf(DockerClient);
      expect(mockLogger.child).toHaveBeenCalledWith({ component: 'DockerClient' });
    });

    test('should create DockerClient with host configuration', () => {
      const hostConfig: DockerClientConfig = {
        host: 'localhost',
        port: 2376,
        protocol: 'http',
      };

      const client = new DockerClient(hostConfig, mockLogger);
      expect(client).toBeInstanceOf(DockerClient);
    });

    test('should create DockerClient without Trivy configuration', () => {
      const configWithoutTrivy: DockerClientConfig = {
        socketPath: '/var/run/docker.sock',
      };

      const client = new DockerClient(configWithoutTrivy, mockLogger);
      expect(client).toBeInstanceOf(DockerClient);
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await dockerClient.initialize();

      expect(mockDockerode.ping).toHaveBeenCalled();
      expect(mockTrivyScanner.initialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Docker client initialized successfully');
    });

    test('should handle Docker connection failure', async () => {
      // Create a separate client for this test to avoid affecting other tests
      const failingConfig: DockerClientConfig = {
        socketPath: '/var/run/docker.sock',
        trivy: {
          scannerPath: 'trivy',
          cacheDir: '/tmp/trivy',
          timeout: 30000,
        },
      };
      
      // Mock ping to fail for this specific test
      mockDockerode.ping.mockRejectedValueOnce(new Error('Connection failed'))
                       .mockRejectedValueOnce(new Error('Connection failed'));

      const failingClient = new DockerClient(failingConfig, mockLogger);
      
      await expect(failingClient.initialize()).rejects.toThrow(DockerError);
      await expect(failingClient.initialize()).rejects.toThrow('Failed to connect to Docker daemon');
    });

    test('should handle Trivy initialization failure', async () => {
      mockTrivyScanner.initialize.mockResolvedValueOnce({ ok: false, error: 'Trivy not found' });

      await dockerClient.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { error: 'Trivy not found' },
        'Trivy scanner initialization failed, scanning will be disabled'
      );
    });

    test('should initialize without Trivy when not configured', async () => {
      const configWithoutTrivy: DockerClientConfig = {
        socketPath: '/var/run/docker.sock',
      };

      const client = new DockerClient(configWithoutTrivy, mockLogger);
      await client.initialize();

      expect(mockTrivyScanner.initialize).not.toHaveBeenCalled();
    });
  });

  describe('Image Building', () => {
    test('should build image successfully', async () => {
      const buildOptions: DockerBuildOptions = {
        context: '/test/path',
        tags: ['test:latest'],
        dockerfile: 'Dockerfile',
      };

      // Setup tar-fs mock
      const mockTarStream = { pipe: jest.fn() };
      mockTarFs.pack.mockReturnValue(mockTarStream);

      // Setup build stream mock
      const mockBuildStream = {};
      mockDockerode.buildImage.mockResolvedValue(mockBuildStream);

      // Setup followProgress mock
      mockDockerode.modem.followProgress.mockImplementation((stream, onFinish, onProgress) => {
        const events = [
          { stream: 'Step 1/3: FROM node:18-alpine\n' },
          { aux: { ID: 'sha256:mock-image-id' } },
        ];
        
        if (onProgress) {
          events.forEach(onProgress);
        }
        
        setTimeout(() => onFinish(null, events), 10);
      });

      const result = await dockerClient.build('/test/path', buildOptions);

      expect(result.success).toBe(true);
      expect(result.imageId).toBe('sha256:mock-image-id');
      expect(result.tags).toEqual(['test:latest']);
      expect(mockTarFs.pack).toHaveBeenCalledWith('/test/path');
      expect(mockDockerode.buildImage).toHaveBeenCalled();
    });

    test('should handle build failure', async () => {
      const buildOptions: DockerBuildOptions = {
        context: '/test/path',
        tags: ['test:latest'],
      };

      mockTarFs.pack.mockReturnValue({ pipe: jest.fn() });
      mockDockerode.buildImage.mockResolvedValue({});

      // Mock build failure
      mockDockerode.modem.followProgress.mockImplementation((stream, onFinish, onProgress) => {
        const events = [
          { error: 'Dockerfile not found' },
        ];
        
        if (onProgress) {
          events.forEach(onProgress);
        }
        
        setTimeout(() => onFinish(null, events), 10);
      });

      await expect(dockerClient.build('/test/path', buildOptions)).rejects.toThrow(DockerError);
    });

    test('should tag additional images when multiple tags provided', async () => {
      const buildOptions: DockerBuildOptions = {
        context: '/test/path',
        tags: ['test:latest', 'test:v1.0', 'registry.io/test:latest'],
      };

      mockTarFs.pack.mockReturnValue({ pipe: jest.fn() });
      mockDockerode.buildImage.mockResolvedValue({});

      // Mock successful build
      mockDockerode.modem.followProgress.mockImplementation((stream, onFinish, onProgress) => {
        const events = [{ aux: { ID: 'sha256:mock-image-id' } }];
        if (onProgress) events.forEach(onProgress);
        setTimeout(() => onFinish(null, events), 10);
      });

      // Mock getImage and tag calls
      const mockImage = {
        tag: jest.fn().mockImplementation((options, callback) => {
          if (callback) callback();
          return Promise.resolve();
        }),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      const result = await dockerClient.build('/test/path', buildOptions);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['test:latest', 'test:v1.0', 'registry.io/test:latest']);
      expect(mockImage.tag).toHaveBeenCalledTimes(2); // Additional tags beyond first
    });
  });

  describe('Image Scanning', () => {
    test('should scan image successfully with Trivy', async () => {
      const scanOptions: ScanOptions = {
        scanner: 'trivy',
        severityThreshold: 'high',
      };

      const mockScanResult: DockerScanResult = {
        vulnerabilities: [
          {
            id: 'CVE-2023-1234',
            severity: 'high',
            package: 'test-package',
            version: '1.0.0',
            description: 'Test vulnerability',
          },
        ],
        summary: { critical: 0, high: 1, medium: 0, low: 0, unknown: 0, total: 1 },
        scanTime: new Date().toISOString(),
        metadata: { image: 'test:latest', lastScanned: new Date().toISOString() },
      };

      mockTrivyScanner.scan.mockResolvedValue({ ok: true, value: mockScanResult });

      const result = await dockerClient.scan('test:latest', scanOptions);

      expect(result).toEqual(mockScanResult);
      expect(mockTrivyScanner.scan).toHaveBeenCalledWith('test:latest', scanOptions);
    });

    test('should return empty scan result when Trivy not available', async () => {
      // Create client without Trivy
      const configWithoutTrivy: DockerClientConfig = {
        socketPath: '/var/run/docker.sock',
      };
      const clientWithoutTrivy = new DockerClient(configWithoutTrivy, mockLogger);

      const result = await clientWithoutTrivy.scan('test:latest');

      expect(result.vulnerabilities).toEqual([]);
      expect(result.summary.total).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Security scanning is not available. Install Trivy to enable vulnerability scanning.'
      );
    });

    test('should handle scan failure', async () => {
      mockTrivyScanner.scan.mockResolvedValue({ ok: false, error: 'Scan failed' });

      await expect(dockerClient.scan('test:latest')).rejects.toThrow(DockerError);
      await expect(dockerClient.scan('test:latest')).rejects.toThrow('Security scan failed: Scan failed');
    });
  });

  describe('Image Operations', () => {
    test('should tag image successfully', async () => {
      const mockImage = {
        tag: jest.fn().mockImplementation((options, callback) => {
          callback();
        }),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      await dockerClient.tag('sha256:abc123', 'test:v1.0');

      expect(mockDockerode.getImage).toHaveBeenCalledWith('sha256:abc123');
      expect(mockImage.tag).toHaveBeenCalledWith(
        { repo: 'test', tag: 'v1.0' },
        expect.any(Function)
      );
    });

    test('should push image successfully', async () => {
      const mockImage = {
        push: jest.fn().mockResolvedValue({}),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      mockDockerode.modem.followProgress.mockImplementation((stream, onFinish) => {
        const events = [{ aux: { Digest: 'sha256:digest123' } }];
        setTimeout(() => onFinish(null, events), 10);
      });

      const result = await dockerClient.push('test:latest');

      expect(result.digest).toBe('sha256:digest123');
      expect(mockDockerode.getImage).toHaveBeenCalledWith('test:latest');
    });

    test('should list images successfully', async () => {
      const mockImages = [
        {
          Id: 'sha256:abc123',
          RepoTags: ['test:latest'],
          Size: 100000,
          Created: Date.now() / 1000,
        },
      ];
      mockDockerode.listImages.mockResolvedValue(mockImages);

      const result = await dockerClient.listImages();

      expect(result).toEqual(mockImages);
      expect(mockDockerode.listImages).toHaveBeenCalled();
    });

    test('should remove image successfully', async () => {
      const mockImage = {
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      await dockerClient.removeImage('sha256:abc123');

      expect(mockDockerode.getImage).toHaveBeenCalledWith('sha256:abc123');
      expect(mockImage.remove).toHaveBeenCalled();
    });

    test('should check if image exists', async () => {
      const mockImage = {
        inspect: jest.fn().mockResolvedValue({ Id: 'sha256:abc123' }),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      const exists = await dockerClient.imageExists('sha256:abc123');

      expect(exists).toBe(true);
      expect(mockImage.inspect).toHaveBeenCalled();
    });

    test('should return false for non-existent image', async () => {
      const mockImage = {
        inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      const exists = await dockerClient.imageExists('sha256:nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('Container Operations', () => {
    test('should list containers successfully', async () => {
      const mockContainers = [
        {
          Id: 'container123',
          Names: ['/test-container'],
          Image: 'test:latest',
          State: 'running',
          Status: 'Up 5 minutes',
        },
      ];
      mockDockerode.listContainers.mockResolvedValue(mockContainers);

      const result = await dockerClient.listContainers();

      expect(result).toEqual(mockContainers);
      expect(mockDockerode.listContainers).toHaveBeenCalledWith({});
    });

    test('should list containers with options', async () => {
      const options = { all: true };
      const mockContainers = [
        {
          Id: 'container123',
          Names: ['/test-container'],
          Image: 'test:latest',
          State: 'exited',
        },
      ];
      mockDockerode.listContainers.mockResolvedValue(mockContainers);

      const result = await dockerClient.listContainers(options);

      expect(result).toEqual(mockContainers);
      expect(mockDockerode.listContainers).toHaveBeenCalledWith(options);
    });

    test('should handle container listing error', async () => {
      mockDockerode.listContainers.mockRejectedValue(new Error('Access denied'));

      await expect(dockerClient.listContainers()).rejects.toThrow(DockerError);
      await expect(dockerClient.listContainers()).rejects.toThrow('Failed to list containers');
    });
  });

  describe('Health Checks', () => {
    test('should return healthy status', async () => {
      const health = await dockerClient.health();

      expect(health.available).toBe(true);
      expect(health.version).toBe('20.10.17');
      expect(health.trivyAvailable).toBe(true);
      expect(health.systemInfo).toBeDefined();
      expect(mockDockerode.ping).toHaveBeenCalled();
      expect(mockDockerode.version).toHaveBeenCalled();
      expect(mockDockerode.info).toHaveBeenCalled();
    });

    test('should return unhealthy status on error', async () => {
      mockDockerode.ping.mockRejectedValueOnce(new Error('Connection failed'));

      const health = await dockerClient.health();

      expect(health.available).toBe(false);
      expect(health.version).toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'Docker health check failed'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle build context errors', async () => {
      mockTarFs.pack.mockImplementation(() => {
        throw new Error('Invalid context path');
      });

      await expect(dockerClient.build('/invalid/path', { context: '/invalid/path' }))
        .rejects.toThrow(DockerError);
    });

    test('should handle image tagging errors', async () => {
      const mockImage = {
        tag: jest.fn().mockImplementation((options, callback) => {
          callback(new Error('Tag failed'));
        }),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      await expect(dockerClient.tag('sha256:abc123', 'test:v1.0'))
        .rejects.toThrow(DockerError);
    });

    test('should handle push errors', async () => {
      const mockImage = {
        push: jest.fn().mockRejectedValue(new Error('Push failed')),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      await expect(dockerClient.push('test:latest'))
        .rejects.toThrow(DockerError);
    });

    test('should handle image removal errors', async () => {
      const mockImage = {
        remove: jest.fn().mockRejectedValue(new Error('Remove failed')),
      };
      mockDockerode.getImage.mockReturnValue(mockImage);

      await expect(dockerClient.removeImage('sha256:abc123'))
        .rejects.toThrow(DockerError);
    });
  });
});