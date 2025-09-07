/**
 * Unit Tests: Generate Kubernetes Manifests Tool
 * Tests the generate-k8s-manifests tool functionality with mock filesystem and sessions
 */

import { jest } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { generateK8sManifests, type GenerateK8sManifestsConfig } from '../../../../src/tools/generate-k8s-manifests';
import { createMockLogger, createSuccessResult } from '../../../helpers/mock-infrastructure';

// Mock filesystem functions with proper structure
jest.mock('node:fs', () => ({
  promises: {
    mkdir: jest.fn(),
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

describe('generateK8sManifests', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: GenerateK8sManifestsConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      appName: 'myapp',
      namespace: 'production',
      replicas: 2,
      port: 3000,
      serviceType: 'ClusterIP',
      ingressEnabled: false,
      environment: 'production',
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Default mock implementations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockSessionManager.update.mockResolvedValue(true);

    // Default successful AI service response
    mockAIService.generate.mockResolvedValue(createSuccessResult({
      context: { guidance: 'AI-enhanced K8s manifests' },
    }));
  });

  describe('Basic Manifest Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0', 'myapp:latest'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate basic Kubernetes manifests with defaults', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(true);
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.path).toBe('/test/repo/k8s/manifests.yaml');
        expect(result.value.resources).toEqual([
          { kind: 'Deployment', name: 'myapp', namespace: 'production' },
          { kind: 'Service', name: 'myapp', namespace: 'production' },
        ]);
        expect(result.value.manifests).toContain('"apiVersion": "apps/v1"');
        expect(result.value.manifests).toContain('"kind": "Deployment"');
        expect(result.value.manifests).toContain('"kind": "Service"');
        expect(result.value.manifests).toContain('myapp:v1.0');
      }
    });

    it('should use default values when not specified', async () => {
      const minimalConfig: GenerateK8sManifestsConfig = {
        sessionId: 'test-session-123',
      };

      const result = await generateK8sManifests(minimalConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.resources).toEqual([
          { kind: 'Deployment', name: 'app', namespace: 'default' },
          { kind: 'Service', name: 'app', namespace: 'default' },
        ]);
        expect(result.value.manifests).toContain('"name": "app"');
        expect(result.value.manifests).toContain('"namespace": "default"');
        expect(result.value.manifests).toContain('"replicas": 1');
        expect(result.value.manifests).toContain('"containerPort": 8080');
      }
    });

    it('should use image from build result', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"image": "myapp:v1.0"');
      }
    });

    it('should use fallback image when no build result', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {},
        repo_path: '/test/repo',
      });

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"image": "myapp:latest"');
      }
    });
  });

  describe('Deployment Configuration', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should configure replicas correctly', async () => {
      config.replicas = 5;

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"replicas": 5');
      }
    });

    it('should configure container port correctly', async () => {
      config.port = 8080;

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"containerPort": 8080');
        expect(result.value.manifests).toContain('"port": 8080');
        expect(result.value.manifests).toContain('"targetPort": 8080');
      }
    });

    it('should include resource limits and requests', async () => {
      config.resources = {
        requests: {
          memory: '256Mi',
          cpu: '100m',
        },
        limits: {
          memory: '512Mi',
          cpu: '200m',
        },
      };

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"memory": "256Mi"');
        expect(result.value.manifests).toContain('"cpu": "100m"');
        expect(result.value.manifests).toContain('"memory": "512Mi"');
        expect(result.value.manifests).toContain('"cpu": "200m"');
      }
    });
  });

  describe('Service Configuration', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate ClusterIP service by default', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"type": "ClusterIP"');
      }
    });

    it('should generate NodePort service when specified', async () => {
      config.serviceType = 'NodePort';

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"type": "NodePort"');
      }
    });

    it('should generate LoadBalancer service when specified', async () => {
      config.serviceType = 'LoadBalancer';

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"type": "LoadBalancer"');
        expect(result.value.warnings).toContain('LoadBalancer service type may incur cloud provider costs');
      }
    });
  });

  describe('Ingress Configuration', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should not generate ingress by default', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.resources).toHaveLength(2); // Only Deployment and Service
        expect(result.value.manifests).not.toContain('"kind": "Ingress"');
      }
    });

    it('should generate ingress when enabled', async () => {
      config.ingressEnabled = true;
      config.ingressHost = 'myapp.example.com';

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.resources).toEqual([
          { kind: 'Deployment', name: 'myapp', namespace: 'production' },
          { kind: 'Service', name: 'myapp', namespace: 'production' },
          { kind: 'Ingress', name: 'myapp-ingress', namespace: 'production' },
        ]);
        expect(result.value.manifests).toContain('"kind": "Ingress"');
        expect(result.value.manifests).toContain('"host": "myapp.example.com"');
        expect(result.value.manifests).toContain('kubernetes.io/ingress.class');
      }
    });

    it('should generate ingress without host', async () => {
      config.ingressEnabled = true;

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('"kind": "Ingress"');
        expect(result.value.warnings).toContain('Ingress enabled but no host specified');
      }
    });
  });

  describe('Horizontal Pod Autoscaler Configuration', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should not generate HPA by default', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.resources).toHaveLength(2); // Only Deployment and Service
        expect(result.value.manifests).not.toContain('HorizontalPodAutoscaler');
      }
    });

    it('should generate HPA when autoscaling enabled', async () => {
      config.autoscaling = {
        enabled: true,
        minReplicas: 2,
        maxReplicas: 10,
        targetCPU: 70,
      };

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.resources).toEqual([
          { kind: 'Deployment', name: 'myapp', namespace: 'production' },
          { kind: 'Service', name: 'myapp', namespace: 'production' },
          { kind: 'HorizontalPodAutoscaler', name: 'myapp-hpa', namespace: 'production' },
        ]);
        expect(result.value.manifests).toContain('HorizontalPodAutoscaler');
        expect(result.value.manifests).toContain('"minReplicas": 2');
        expect(result.value.manifests).toContain('"maxReplicas": 10');
        expect(result.value.manifests).toContain('"averageUtilization": 70');
      }
    });

    it('should use default HPA values when not specified', async () => {
      config.autoscaling = {
        enabled: true,
      };

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('HorizontalPodAutoscaler');
        expect(result.value.manifests).toContain('"minReplicas": 2'); // Uses replicas from config
        expect(result.value.manifests).toContain('"maxReplicas": 6'); // replicas * 3
        expect(result.value.manifests).toContain('"averageUtilization": 80'); // default
      }
    });
  });

  describe('Warnings Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should warn about single replica configuration', async () => {
      config.replicas = 1;

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain(
          'Single replica configuration - consider increasing for production'
        );
      }
    });

    it('should warn about missing resource limits', async () => {
      // No resources specified

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain(
          'No resource limits specified - may cause resource contention'
        );
      }
    });

    it('should not warn when resource limits are specified', async () => {
      config.resources = {
        limits: {
          memory: '512Mi',
          cpu: '200m',
        },
      };

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings || []).not.toContain(
          'No resource limits specified - may cause resource contention'
        );
      }
    });

    it('should warn about LoadBalancer costs', async () => {
      config.serviceType = 'LoadBalancer';

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain(
          'LoadBalancer service type may incur cloud provider costs'
        );
      }
    });

    it('should warn about ingress without host', async () => {
      config.ingressEnabled = true;
      // No ingressHost specified

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.warnings).toContain('Ingress enabled but no host specified');
      }
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should create k8s directory and write manifests', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/repo/k8s', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/repo/k8s/manifests.yaml',
        expect.stringContaining('"apiVersion": "apps/v1"'),
        'utf-8'
      );
    });

    it('should use current directory when repo_path is not available', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: null,
      });

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith('k8s', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'k8s/manifests.yaml',
        expect.any(String),
        'utf-8'
      );
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should update session with K8s manifest results', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockSessionManager.update).toHaveBeenCalledWith('test-session-123', {
        workflow_state: expect.objectContaining({
          k8s_result: expect.objectContaining({
            manifests: expect.arrayContaining([
              expect.objectContaining({
                kind: 'Deployment',
                name: 'myapp',
                namespace: 'production',
              }),
              expect.objectContaining({
                kind: 'Service',
                name: 'myapp',
                namespace: 'production',
              }),
            ]),
            replicas: 2,
            output_path: '/test/repo/k8s/manifests.yaml',
          }),
          completed_steps: expect.arrayContaining(['generate-k8s-manifests']),
        }),
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should handle filesystem errors', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });

      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Permission denied');
      }
    });

    it('should handle file write errors', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });

      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Disk full');
      }
    });

    it('should handle AI service failures gracefully', async () => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });

      mockAIService.generate.mockRejectedValue(new Error('AI service unavailable'));

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      // Should still generate manifests even if AI fails
      if (result.ok) {
        expect(result.value.manifests).toContain('"apiVersion": "apps/v1"');
      }
    });
  });

  describe('YAML Generation', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        workflow_state: {
          build_result: {
            tags: ['myapp:v1.0'],
          },
        },
        repo_path: '/test/repo',
      });
    });

    it('should generate properly formatted YAML with separators', async () => {
      config.ingressEnabled = true;

      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.manifests).toContain('---');
        const manifestParts = result.value.manifests.split('---');
        expect(manifestParts.length).toBe(3); // Deployment, Service, Ingress
      }
    });

    it('should include all required Kubernetes fields', async () => {
      const result = await generateK8sManifests(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Check required Kubernetes fields
        expect(result.value.manifests).toContain('apiVersion');
        expect(result.value.manifests).toContain('kind');
        expect(result.value.manifests).toContain('metadata');
        expect(result.value.manifests).toContain('spec');
        expect(result.value.manifests).toContain('selector');
      }
    });
  });
});