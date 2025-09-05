/**
 * Generate K8s Manifests Tool Tests
 * Comprehensive tests for Kubernetes manifest generation functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import type { Logger } from 'pino';
import pino from 'pino';

// Create explicit mock functions
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockReadFile = jest.fn();
const mockYamlLoadAll = jest.fn();
const mockYamlDump = jest.fn();

// Mock file system operations
jest.mock('node:fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
  },
}));

// Mock YAML parsing
jest.mock('js-yaml', () => ({
  loadAll: mockYamlLoadAll,
  dump: mockYamlDump,
}));

import { promises as fs } from 'node:fs';
import * as yaml from 'js-yaml';

// Note: Testing the actual helper function with mocked AI service

// Import modules after mocking
import generateKubernetesManifestsHandler from '../../../../src/application/tools/generate-k8s-manifests/generate-k8s-manifests';
import type { GenerateK8sManifestsParams, K8sManifestsResult, ToolContext } from '../../../../src/application/tools/tool-types';

describe('Generate K8s Manifests Tool', () => {
  let mockLogger: Logger;
  let mockContext: ToolContext;
  let mockProgressEmitter: any;
  let mockAiService: any;
  let mockSampleFunction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
    } as any;
    
    mockProgressEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    mockAiService = {
      generate: jest.fn().mockResolvedValue({
        data: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: test-app
        image: app:latest
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: test-app-service
  namespace: default
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP`
      }),
    };

    mockSampleFunction = jest.fn().mockResolvedValue({
      success: true,
      text: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: test-app
        image: app:latest
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: test-app-service
  namespace: default
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP`
    });

    mockContext = {
      logger: mockLogger,
      progressEmitter: mockProgressEmitter,
      aiService: mockAiService,
      sampleFunction: mockSampleFunction,
    } as ToolContext;

    // Setup YAML mocks
    mockYamlDump.mockReturnValue('mocked-yaml-content');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Handler Basic Functionality', () => {
    it('should have correct tool metadata', () => {
      expect(generateKubernetesManifestsHandler.name).toBe('generate_k8s_manifests');
      expect(generateKubernetesManifestsHandler.description).toContain('Kubernetes manifests');
      expect(generateKubernetesManifestsHandler.category).toBe('utility');
      expect(generateKubernetesManifestsHandler.inputSchema).toBeDefined();
      expect(generateKubernetesManifestsHandler.outputSchema).toBeDefined();
    });

    it('should have chain hint for deployment', () => {
      expect(generateKubernetesManifestsHandler.chainHint).toBeDefined();
      expect(generateKubernetesManifestsHandler.chainHint?.nextTool).toBe('deploy_application');
      expect(generateKubernetesManifestsHandler.chainHint?.reason).toContain('Deploy generated manifests');
    });
  });

  describe('Handler Execution', () => {
    const mockInput: GenerateK8sManifestsParams = {
      sessionId: 'test-session-123',
    };

    const mockGenerationResult = {
      outputPath: '/test/k8s/test-session-123',
      manifests: [
        {
          kind: 'Deployment',
          name: 'test-app',
          path: '/test/k8s/test-session-123/deployment-test-app.yaml',
        },
        {
          kind: 'Service',
          name: 'test-app-service',
          path: '/test/k8s/test-session-123/service-test-app-service.yaml',
        },
      ],
      metadata: {
        appName: 'app',
        namespace: 'default',
        environment: 'prod',
      },
      warnings: ['No image specified, using default app:latest'],
    };

    it('should generate manifests successfully', async () => {
      const result = await generateKubernetesManifestsHandler.handler(mockInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      expect(result.manifests).toBeDefined();
      expect(typeof result.manifests).toBe('string');
      expect(result.path).toBe('./k8s/');
      expect(result.resources).toEqual([]);
      
      // Parse the manifests to verify structure
      const parsedManifests = JSON.parse(result.manifests);
      expect(Array.isArray(parsedManifests)).toBe(true);
      expect(parsedManifests).toHaveLength(2); // Deployment and Service
      expect(parsedManifests[0].kind).toBe('Deployment');
      expect(parsedManifests[1].kind).toBe('Service');
    });

    it('should handle different AI service responses', async () => {
      // Test with a different YAML structure  
      mockSampleFunction.mockResolvedValueOnce({
        success: true,
        text: `apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
  namespace: default
data:
  config.yaml: |
    setting: value`
      });

      const result = await generateKubernetesManifestsHandler.handler(mockInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.manifests).toBeDefined();
      const parsedManifests = JSON.parse(result.manifests);
      expect(parsedManifests[0].kind).toBe('ConfigMap');
    });

    it('should handle missing sessionId', async () => {
      const inputWithoutSession: GenerateK8sManifestsParams = {};

      const result = await generateKubernetesManifestsHandler.handler(inputWithoutSession, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('');
      expect(result.manifests).toBeDefined();
    });

    it('should use correct default parameters', async () => {
      const result = await generateKubernetesManifestsHandler.handler(mockInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-123');
      
      // Verify sample function was called
      expect(mockSampleFunction).toHaveBeenCalled();
    });

    it('should handle AI service errors', async () => {
      const error = new Error('AI service not available');
      // Reset the mock and set rejection
      mockSampleFunction.mockReset();
      mockSampleFunction.mockRejectedValue(error);

      await expect(
        generateKubernetesManifestsHandler.handler(mockInput, mockContext)
      ).rejects.toThrow('AI service not available');
    });

    it('should handle invalid AI response', async () => {
      // Reset the mock and set invalid response
      mockSampleFunction.mockReset();
      mockSampleFunction.mockResolvedValue({
        success: false,
        error: 'Invalid response'
      });

      await expect(
        generateKubernetesManifestsHandler.handler(mockInput, mockContext)
      ).rejects.toThrow('Failed to generate manifests');
    });

    it('should return empty resources by default', async () => {
      const result = await generateKubernetesManifestsHandler.handler(mockInput, mockContext);

      expect(result.success).toBe(true);
      expect(result.resources).toEqual([]);
    });
  });

  describe('Chain Hint Parameter Mapping', () => {
    it('should map output parameters correctly', () => {
      const mockOutput: K8sManifestsResult = {
        success: true,
        sessionId: 'test-session-456',
        manifests: 'mock-manifests',
        path: './k8s/',
        resources: [],
      };

      const mappedParams = generateKubernetesManifestsHandler.chainHint?.paramMapper?.(mockOutput);

      expect(mappedParams).toEqual({
        sessionId: 'test-session-456',
      });
    });
  });

  describe('Logging', () => {
    it('should log start of manifest generation', async () => {
      const mockInput: GenerateK8sManifestsParams = {
        sessionId: 'test-session-123',
      };

      await generateKubernetesManifestsHandler.handler(mockInput, mockContext);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { sessionId: 'test-session-123' },
        'Starting K8s manifest generation'
      );
    });
  });
});