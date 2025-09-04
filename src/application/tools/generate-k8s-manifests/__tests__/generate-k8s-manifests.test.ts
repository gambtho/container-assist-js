/**
 * Generate K8s Manifests Tool - Unit Tests
 */

import { jest } from '@jest/globals';
import * as path from 'node:path';

// Set up mocks before any imports for ESM compatibility
jest.unstable_mockModule('../helper', () => ({
  generateK8sManifests: jest.fn(),
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  access: jest.fn(),
}));

jest.unstable_mockModule('js-yaml', () => ({
  dump: jest.fn(),
  loadAll: jest.fn(),
}));

// Import modules AFTER setting up mocks
const generateKubernetesManifestsHandler = (await import('../index')).default;
const mockHelper = await import('../helper');
const fs = await import('node:fs/promises');
const mockYaml = await import('js-yaml');

// Import types and utilities
import type { GenerateK8sManifestsParams, K8sManifestsResult } from '../../schemas';
import type { ToolContext } from '../../tool-types';
import { ErrorCode, createDomainError } from '../../../../domain/types/errors';
import { createMockToolContext, createMockLogger } from '../../__tests__/shared/test-utils';
import { createMockKubernetesService } from '../../__tests__/shared/kubernetes-mocks';
import { createMockAIService } from '../../__tests__/shared/ai-mocks';

const mockFs = fs as jest.Mocked<typeof fs>;

describe('generate-k8s-manifests tool', () => {
  let mockContext: ToolContext;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockContext = createMockToolContext({
      logger: mockLogger,
      aiService: createMockAIService(),
      kubernetesService: createMockKubernetesService(),
    });

    // Mock filesystem operations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    // Mock yaml operations
    (mockYaml.dump as jest.Mock).mockReturnValue('mocked: yaml\n');
    (mockYaml.loadAll as jest.Mock).mockReturnValue([
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'test-app' },
        spec: {},
      },
      {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'test-app-service' },
        spec: {},
      },
    ]);

    // Mock helper function
    (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
      outputPath: './k8s/test-session',
      manifests: [
        {
          kind: 'Deployment',
          name: 'test-app',
          path: './k8s/test-session/deployment-test-app.yaml',
        },
        {
          kind: 'Service',
          name: 'test-app-service',
          path: './k8s/test-session/service-test-app-service.yaml',
        },
      ],
      metadata: {
        appName: 'app',
        namespace: 'default',
        environment: 'prod',
      },
      warnings: [],
    });
  });

  describe('basic manifest generation', () => {
    it('should generate K8s manifests successfully', async () => {
      const input: GenerateK8sManifestsParams = {
        sessionId: 'test-session',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result).toEqual({
        success: true,
        sessionId: 'test-session',
        manifests: expect.any(String),
        path: './k8s/',
        resources: expect.any(Array),
      });

      expect(mockHelper.generateK8sManifests).toHaveBeenCalledWith(
        {
          sessionId: 'test-session',
          appName: 'app',
          namespace: 'default',
          replicas: 1,
          serviceType: 'ClusterIP',
          ingressEnabled: false,
          environment: 'prod',
          outputPath: path.join('k8s', 'test-session'),
        },
        mockContext,
      );
    });

    it('should handle empty sessionId', async () => {
      const input: GenerateK8sManifestsParams = {
        sessionId: '',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.sessionId).toBe('');
      expect(mockHelper.generateK8sManifests).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: '',
          outputPath: path.join('k8s', 'default'),
        }),
        mockContext,
      );
    });

    it('should handle undefined sessionId', async () => {
      const input: GenerateK8sManifestsParams = {};

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.sessionId).toBe('');
      expect(mockHelper.generateK8sManifests).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: '',
          outputPath: path.join('k8s', 'default'),
        }),
        mockContext,
      );
    });
  });

  describe('manifest content handling', () => {
    it('should handle array manifests format', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/array-test',
        manifests: [
          { kind: 'Deployment', name: 'app-deployment' },
          { kind: 'Service', name: 'app-service' },
        ],
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: [],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'array-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.manifests).toEqual(
        JSON.stringify([
          { kind: 'Deployment', name: 'app-deployment' },
          { kind: 'Service', name: 'app-service' },
        ]),
      );
    });

    it('should handle string manifests format', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/string-test',
        manifests: 'apiVersion: apps/v1\nkind: Deployment',
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: [],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'string-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.manifests).toBe('apiVersion: apps/v1\nkind: Deployment');
    });

    it('should handle empty manifests', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/empty-test',
        manifests: null,
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: ['No manifests generated'],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'empty-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.manifests).toBe('');
    });
  });

  describe('resource handling', () => {
    it('should handle resources array from result', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/resources-test',
        manifests: [],
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: [],
        resources: [
          { kind: 'Deployment', name: 'app-deployment' },
          { kind: 'Service', name: 'app-service' },
          { kind: 'Ingress', name: 'app-ingress' },
        ],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'resources-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.resources).toEqual([
        { kind: 'Deployment', name: 'app-deployment' },
        { kind: 'Service', name: 'app-service' },
        { kind: 'Ingress', name: 'app-ingress' },
      ]);
    });

    it('should handle missing resources field', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/no-resources-test',
        manifests: [],
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: [],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'no-resources-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.resources).toEqual([]);
    });

    it('should handle non-array resources field', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/invalid-resources-test',
        manifests: [],
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: [],
        resources: 'not-an-array',
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'invalid-resources-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.resources).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle generation errors gracefully', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockRejectedValue(
        new Error('AI service unavailable'),
      );

      const input: GenerateK8sManifestsParams = {
        sessionId: 'error-test',
      };

      await expect(generateKubernetesManifestsHandler.handler(input, mockContext)).rejects.toThrow(
        'AI service unavailable',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error) },
        'K8s manifest generation failed',
      );
    });

    it('should handle domain errors', async () => {
      const domainError = createDomainError(
        ErrorCode.AI_SERVICE_ERROR,
        'Failed to parse YAML manifests',
      );
      (mockHelper.generateK8sManifests as jest.Mock).mockRejectedValue(domainError);

      const input: GenerateK8sManifestsParams = {
        sessionId: 'domain-error-test',
      };

      await expect(generateKubernetesManifestsHandler.handler(input, mockContext)).rejects.toThrow(
        'Failed to parse YAML manifests',
      );
    });

    it('should handle non-Error objects', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockRejectedValue('String error message');

      const input: GenerateK8sManifestsParams = {
        sessionId: 'string-error-test',
      };

      await expect(generateKubernetesManifestsHandler.handler(input, mockContext)).rejects.toThrow(
        'String error message',
      );
    });

    it('should handle filesystem errors', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockRejectedValue(
        new Error("EACCES: permission denied, mkdir '/restricted'"),
      );

      const input: GenerateK8sManifestsParams = {
        sessionId: 'fs-error-test',
      };

      await expect(generateKubernetesManifestsHandler.handler(input, mockContext)).rejects.toThrow(
        'EACCES: permission denied',
      );
    });
  });

  describe('logging behavior', () => {
    it('should log generation start', async () => {
      const input: GenerateK8sManifestsParams = {
        sessionId: 'logging-test',
      };

      await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'logging-test' },
        'Starting K8s manifest generation',
      );
    });

    it('should log errors with context', async () => {
      const error = new Error('Generation failed');
      (mockHelper.generateK8sManifests as jest.Mock).mockRejectedValue(error);

      const input: GenerateK8sManifestsParams = {
        sessionId: 'error-logging-test',
      };

      await expect(
        generateKubernetesManifestsHandler.handler(input, mockContext),
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith({ error }, 'K8s manifest generation failed');
    });
  });

  describe('tool descriptor properties', () => {
    it('should have correct tool metadata', () => {
      expect(generateKubernetesManifestsHandler.name).toBe('generate_k8s_manifests');
      expect(generateKubernetesManifestsHandler.description).toBe(
        'Generate production-ready Kubernetes manifests for application deployment',
      );
      expect(generateKubernetesManifestsHandler.category).toBe('utility');
      expect(generateKubernetesManifestsHandler.inputSchema).toBeDefined();
      expect(generateKubernetesManifestsHandler.outputSchema).toBeDefined();
    });

    it('should have correct chain hint for next tool', () => {
      expect(generateKubernetesManifestsHandler.chainHint).toMatchObject({
        nextTool: 'deploy_application',
        reason: 'Deploy generated manifests to Kubernetes cluster',
        paramMapper: expect.any(Function),
      });
    });

    it('should provide correct parameter mapping for chaining', () => {
      const output: K8sManifestsResult = {
        success: true,
        sessionId: 'chain-test',
        manifests: 'mock manifests',
        path: './k8s/',
        resources: [],
      };

      const mappedParams = generateKubernetesManifestsHandler.chainHint!.paramMapper!(output);
      expect(mappedParams).toEqual({
        sessionId: 'chain-test',
      });
    });
  });

  describe('input validation', () => {
    it('should accept minimal valid input', () => {
      const input: GenerateK8sManifestsParams = {};

      const parsed = generateKubernetesManifestsHandler.inputSchema.parse(input);
      expect(parsed).toEqual({});
    });

    it('should accept sessionId parameter', () => {
      const input: GenerateK8sManifestsParams = {
        sessionId: 'validation-test',
      };

      const parsed = generateKubernetesManifestsHandler.inputSchema.parse(input);
      expect(parsed.sessionId).toBe('validation-test');
    });
  });

  describe('output validation', () => {
    it('should produce schema-compliant output', async () => {
      const input: GenerateK8sManifestsParams = {
        sessionId: 'output-validation-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      // Validate output against schema
      expect(() => generateKubernetesManifestsHandler.outputSchema.parse(result)).not.toThrow();
      expect(result).toMatchObject({
        success: true,
        sessionId: 'output-validation-test',
        manifests: expect.any(String),
        path: expect.any(String),
        resources: expect.any(Array),
      });
    });

    it('should handle all required fields', async () => {
      const input: GenerateK8sManifestsParams = {
        sessionId: 'required-fields-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.success).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.manifests).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.resources).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex manifest generation with multiple resources', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/complex-app',
        manifests: [
          { kind: 'Deployment', name: 'web-deployment' },
          { kind: 'Service', name: 'web-service' },
          { kind: 'Ingress', name: 'web-ingress' },
          { kind: 'ConfigMap', name: 'web-config' },
          { kind: 'Secret', name: 'web-secrets' },
          { kind: 'HorizontalPodAutoscaler', name: 'web-hpa' },
        ],
        metadata: {
          appName: 'complex-app',
          namespace: 'production',
          environment: 'prod',
        },
        warnings: ['LoadBalancer service type may incur costs', 'Consider setting resource limits'],
        resources: [
          { kind: 'Deployment', name: 'web-deployment' },
          { kind: 'Service', name: 'web-service' },
          { kind: 'Ingress', name: 'web-ingress' },
          { kind: 'ConfigMap', name: 'web-config' },
          { kind: 'Secret', name: 'web-secrets' },
          { kind: 'HorizontalPodAutoscaler', name: 'web-hpa' },
        ],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'complex-app-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.resources).toHaveLength(6);
      expect(result.resources).toContainEqual(
        expect.objectContaining({ kind: 'HorizontalPodAutoscaler' }),
      );
    });

    it('should handle microservices scenario with multiple apps', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/microservices',
        manifests: [
          { kind: 'Deployment', name: 'auth-service' },
          { kind: 'Service', name: 'auth-service' },
          { kind: 'Deployment', name: 'api-gateway' },
          { kind: 'Service', name: 'api-gateway' },
          { kind: 'Deployment', name: 'user-service' },
          { kind: 'Service', name: 'user-service' },
        ],
        metadata: {
          appName: 'microservices-suite',
          namespace: 'default',
          environment: 'prod',
        },
        warnings: [],
        resources: [
          { kind: 'Deployment', name: 'auth-service' },
          { kind: 'Service', name: 'auth-service' },
          { kind: 'Deployment', name: 'api-gateway' },
          { kind: 'Service', name: 'api-gateway' },
          { kind: 'Deployment', name: 'user-service' },
          { kind: 'Service', name: 'user-service' },
        ],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'microservices-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.resources).toHaveLength(6);
    });
  });

  describe('edge cases', () => {
    it('should handle very long sessionId', async () => {
      const longSessionId = 'a'.repeat(200);
      const input: GenerateK8sManifestsParams = {
        sessionId: longSessionId,
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.sessionId).toBe(longSessionId);
    });

    it('should handle special characters in sessionId', async () => {
      const specialSessionId = 'test-session-with-special-chars-@#$%';
      const input: GenerateK8sManifestsParams = {
        sessionId: specialSessionId,
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.sessionId).toBe(specialSessionId);
    });

    it('should handle empty manifest generation result', async () => {
      (mockHelper.generateK8sManifests as jest.Mock).mockResolvedValue({
        outputPath: './k8s/empty',
        manifests: [],
        metadata: { appName: 'app', namespace: 'default', environment: 'prod' },
        warnings: ['No resources generated'],
        resources: [],
      });

      const input: GenerateK8sManifestsParams = {
        sessionId: 'empty-result-test',
      };

      const result = await generateKubernetesManifestsHandler.handler(input, mockContext);

      expect(result.success).toBe(true);
      expect(result.resources).toEqual([]);
      expect(result.manifests).toBe(JSON.stringify([]));
    });
  });
});
