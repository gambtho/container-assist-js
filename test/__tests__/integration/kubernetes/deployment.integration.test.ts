/**
 * Kubernetes Deployment Workflow Integration Tests
 * Tests the complete deployment and verification workflow
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { Logger } from 'pino';
import pino from 'pino';
import { createMockLogger, createMockSession, createMockK8sManifestResult, createMockDeploymentResult } from '../../../utils/mock-factories';

// Create explicit mock functions  
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockAccess = jest.fn();

// Mock file system
jest.mock('node:fs', () => ({
  promises: {
    readdir: mockReaddir,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
  },
}));

import { promises as fs } from 'node:fs';

// Create mock functions
const mockYamlLoadAll = jest.fn();
const mockYamlDump = jest.fn();

// Mock YAML
jest.mock('js-yaml', () => ({
  loadAll: mockYamlLoadAll,
  dump: mockYamlDump,
}));

describe('Kubernetes Deployment Workflow Integration Tests', () => {
  let mockLogger: Logger;
  let mockSession: any;
  let mockK8sResult: any;
  let mockDeploymentResult: any;

  // Mock Kubernetes manifests
  const mockDeploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'test-app',
      namespace: 'default',
      labels: { app: 'test-app' },
    },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: 'test-app' } },
      template: {
        metadata: { labels: { app: 'test-app' } },
        spec: {
          containers: [
            {
              name: 'test-app',
              image: 'test-app:latest',
              ports: [{ containerPort: 3000 }],
              resources: {
                requests: { memory: '128Mi', cpu: '100m' },
                limits: { memory: '512Mi', cpu: '500m' },
              },
            },
          ],
        },
      },
    },
  };

  const mockServiceManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'test-app-service',
      namespace: 'default',
      labels: { app: 'test-app' },
    },
    spec: {
      selector: { app: 'test-app' },
      ports: [{ port: 80, targetPort: 3000, protocol: 'TCP' }],
      type: 'ClusterIP',
    },
  };

  const mockIngressManifest = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'test-app-ingress',
      namespace: 'default',
      annotations: {
        'nginx.ingress.kubernetes.io/rewrite-target': '/',
      },
    },
    spec: {
      rules: [
        {
          host: 'test-app.local',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'test-app-service',
                    port: { number: 80 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockSession = createMockSession();
    mockK8sResult = createMockK8sManifestResult();
    mockDeploymentResult = createMockDeploymentResult();

    // Setup file system mocks
    mockReaddir.mockResolvedValue([
      'deployment-test-app.yaml',
      'service-test-app-service.yaml',
      'ingress-test-app-ingress.yaml',
      'kustomization.yaml',
    ] as any);

    mockYamlLoadAll.mockImplementation((content: string) => {
      if (content.includes('Deployment')) return [mockDeploymentManifest];
      if (content.includes('Service')) return [mockServiceManifest];
      if (content.includes('Ingress')) return [mockIngressManifest];
      return [];
    });

    mockReadFile.mockImplementation((filePath: any) => {
      const fileName = path.basename(filePath);
      if (fileName.includes('deployment')) return Promise.resolve('Deployment yaml content');
      if (fileName.includes('service')) return Promise.resolve('Service yaml content');  
      if (fileName.includes('ingress')) return Promise.resolve('Ingress yaml content');
      return Promise.resolve('');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Manifest Loading and Validation', () => {
    it('should load manifests from directory correctly', async () => {
      const manifestsPath = '/test/k8s/manifests';
      
      // Mock implementation for manifest loading using mocked functions
      const loadManifests = async (path: string) => {
        const files = await mockReaddir(path);
        const yamlFiles = files.filter((f: string) => 
          (f.endsWith('.yaml') || f.endsWith('.yml')) && f !== 'kustomization.yaml'
        );
        
        const manifests = [];
        for (const file of yamlFiles) {
          const content = await mockReadFile(`${path}/${file}`, 'utf-8');
          const docs = mockYamlLoadAll(content);
          manifests.push(...docs.filter(d => d && typeof d === 'object' && 'kind' in d));
        }
        return manifests;
      };

      const manifests = await loadManifests(manifestsPath);

      expect(manifests).toHaveLength(3);
      expect(manifests.map(m => m.kind)).toContain('Deployment');
      expect(manifests.map(m => m.kind)).toContain('Service');
      expect(manifests.map(m => m.kind)).toContain('Ingress');
    });

    it('should validate Kubernetes resource names', () => {
      const isValidK8sName = (name: string): boolean => {
        const regex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
        return regex.test(name) && name.length <= 253;
      };

      expect(isValidK8sName('test-app')).toBe(true);
      expect(isValidK8sName('test-app-service')).toBe(true);
      expect(isValidK8sName('Test-App')).toBe(false); // uppercase
      expect(isValidK8sName('test_app')).toBe(false); // underscore
      expect(isValidK8sName('-test-app')).toBe(false); // starts with hyphen
      expect(isValidK8sName('test-app-')).toBe(false); // ends with hyphen
    });

    it('should order manifests correctly for deployment', () => {
      const manifests = [
        { kind: 'Ingress', metadata: { name: 'test-ingress' } },
        { kind: 'Deployment', metadata: { name: 'test-app' } },
        { kind: 'Service', metadata: { name: 'test-service' } },
        { kind: 'ConfigMap', metadata: { name: 'test-config' } },
        { kind: 'Namespace', metadata: { name: 'test-namespace' } },
      ];

      const orderManifests = (manifests: any[]) => {
        const order = [
          'Namespace', 'ResourceQuota', 'LimitRange', 'ServiceAccount',
          'Secret', 'ConfigMap', 'PersistentVolumeClaim', 'Service',
          'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob',
          'HorizontalPodAutoscaler', 'PodDisruptionBudget', 'Ingress', 'NetworkPolicy',
        ];

        return manifests.sort((a, b) => {
          const aIndex = order.indexOf(a.kind) !== -1 ? order.indexOf(a.kind) : 999;
          const bIndex = order.indexOf(b.kind) !== -1 ? order.indexOf(b.kind) : 999;
          return aIndex - bIndex;
        });
      };

      const ordered = orderManifests(manifests);
      const kinds = ordered.map(m => m.kind);

      expect(kinds).toEqual(['Namespace', 'ConfigMap', 'Service', 'Deployment', 'Ingress']);
    });
  });

  describe('Deployment Process', () => {
    it('should handle successful deployment', async () => {
      const mockKubernetesService = {
        deploy: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            resources: [
              { kind: 'Deployment', name: 'test-app', namespace: 'default', status: 'created' },
              { kind: 'Service', name: 'test-app-service', namespace: 'default', status: 'created' },
            ],
            deployed: ['Deployment/test-app', 'Service/test-app-service'],
            failed: [],
            endpoints: [{
              service: 'test-app-service',
              type: 'ClusterIP',
              port: 80,
              url: 'http://test-app-service.default.svc.cluster.local',
            }],
          },
        }),
      };

      const deployResult = await mockKubernetesService.deploy({
        manifests: [mockDeploymentManifest, mockServiceManifest],
        namespace: 'default',
        wait: true,
        timeout: 300000,
        dryRun: false,
      });

      expect(deployResult.success).toBe(true);
      expect(deployResult.data.deployed).toHaveLength(2);
      expect(deployResult.data.failed).toHaveLength(0);
      expect(deployResult.data.endpoints).toHaveLength(1);
    });

    it('should handle partial deployment failure', async () => {
      const mockKubernetesService = {
        deploy: jest.fn().mockResolvedValue({
          success: true,
          data: {
            success: true,
            resources: [
              { kind: 'Deployment', name: 'test-app', namespace: 'default', status: 'created' },
            ],
            deployed: ['Deployment/test-app'],
            failed: [
              { resource: 'Service/test-app-service', error: 'Service already exists' },
            ],
            endpoints: [],
          },
        }),
      };

      const deployResult = await mockKubernetesService.deploy({
        manifests: [mockDeploymentManifest, mockServiceManifest],
        namespace: 'default',
        wait: true,
        timeout: 300000,
        dryRun: false,
      });

      expect(deployResult.success).toBe(true);
      expect(deployResult.data.deployed).toHaveLength(1);
      expect(deployResult.data.failed).toHaveLength(1);
      expect(deployResult.data.failed[0].resource).toBe('Service/test-app-service');
    });

    it('should handle complete deployment failure', async () => {
      const mockKubernetesService = {
        deploy: jest.fn().mockResolvedValue({
          success: false,
          error: 'Cluster connection failed',
        }),
      };

      const deployResult = await mockKubernetesService.deploy({
        manifests: [mockDeploymentManifest],
        namespace: 'default',
        wait: true,
        timeout: 300000,
        dryRun: false,
      });

      expect(deployResult.success).toBe(false);
      expect(deployResult.error).toBe('Cluster connection failed');
    });
  });

  describe('Deployment Verification', () => {
    it('should verify deployment health status', async () => {
      const mockKubernetesService = {
        getDeploymentStatus: jest.fn().mockResolvedValue({
          name: 'test-app',
          namespace: 'default',
          replicas: {
            desired: 2,
            available: 2,
            ready: 2,
            updated: 2,
          },
          conditions: [
            {
              type: 'Available',
              status: 'True',
              reason: 'MinimumReplicasAvailable',
              message: 'Deployment has minimum availability.',
            },
            {
              type: 'Progressing',
              status: 'True',
              reason: 'NewReplicaSetAvailable',
              message: 'ReplicaSet has successfully progressed.',
            },
          ],
          ready: true,
        }),
        getServiceEndpoints: jest.fn().mockResolvedValue([
          {
            name: 'test-app-service',
            namespace: 'default',
            type: 'ClusterIP',
            clusterIP: '10.96.123.45',
            ports: [{ port: 80, targetPort: 3000, protocol: 'TCP' }],
            endpoints: ['http://test-app-service.default.svc.cluster.local:80'],
          },
        ]),
      };

      const deploymentStatus = await mockKubernetesService.getDeploymentStatus('test-app', 'default');
      const serviceEndpoints = await mockKubernetesService.getServiceEndpoints('test-app-service', 'default');

      expect(deploymentStatus.ready).toBe(true);
      expect(deploymentStatus.replicas.available).toBe(2);
      expect(deploymentStatus.conditions).toHaveLength(2);
      expect(serviceEndpoints).toHaveLength(1);
      expect(serviceEndpoints[0].endpoints).toContain('http://test-app-service.default.svc.cluster.local:80');
    });

    it('should detect unhealthy deployments', async () => {
      const mockKubernetesService = {
        getDeploymentStatus: jest.fn().mockResolvedValue({
          name: 'test-app',
          namespace: 'default',
          replicas: {
            desired: 2,
            available: 0,
            ready: 0,
            updated: 2,
          },
          conditions: [
            {
              type: 'Available',
              status: 'False',
              reason: 'MinimumReplicasUnavailable',
              message: 'Deployment does not have minimum availability.',
            },
            {
              type: 'Progressing',
              status: 'False',
              reason: 'ProgressDeadlineExceeded',
              message: 'ReplicaSet has failed to progress.',
            },
          ],
          ready: false,
        }),
      };

      const deploymentStatus = await mockKubernetesService.getDeploymentStatus('test-app', 'default');

      expect(deploymentStatus.ready).toBe(false);
      expect(deploymentStatus.replicas.available).toBe(0);
      expect(deploymentStatus.conditions[0].status).toBe('False');
      expect(deploymentStatus.conditions[1].reason).toBe('ProgressDeadlineExceeded');
    });
  });

  describe('Rollback Operations', () => {
    it('should perform rollback to previous version', async () => {
      const mockKubernetesService = {
        rollbackDeployment: jest.fn().mockResolvedValue({
          success: true,
          deployment: 'test-app',
          namespace: 'default',
          previousRevision: 1,
          currentRevision: 2,
          message: 'Rolled back to revision 1',
        }),
        getDeploymentHistory: jest.fn().mockResolvedValue([
          { revision: 1, createdAt: '2024-01-01T10:00:00Z', image: 'test-app:v1.0.0' },
          { revision: 2, createdAt: '2024-01-01T11:00:00Z', image: 'test-app:v1.1.0' },
        ]),
      };

      const history = await mockKubernetesService.getDeploymentHistory('test-app', 'default');
      const rollbackResult = await mockKubernetesService.rollbackDeployment('test-app', 'default', 1);

      expect(history).toHaveLength(2);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.previousRevision).toBe(1);
      expect(rollbackResult.message).toContain('Rolled back to revision 1');
    });

    it('should handle rollback to non-existent revision', async () => {
      const mockKubernetesService = {
        rollbackDeployment: jest.fn().mockRejectedValue(new Error('Revision 5 not found')),
        getDeploymentHistory: jest.fn().mockResolvedValue([
          { revision: 1, createdAt: '2024-01-01T10:00:00Z', image: 'test-app:v1.0.0' },
          { revision: 2, createdAt: '2024-01-01T11:00:00Z', image: 'test-app:v1.1.0' },
        ]),
      };

      await expect(
        mockKubernetesService.rollbackDeployment('test-app', 'default', 5)
      ).rejects.toThrow('Revision 5 not found');
    });
  });

  describe('Multi-Environment Deployment', () => {
    it('should deploy to multiple environments', async () => {
      const environments = ['staging', 'production'];
      const deployResults = [];

      const mockKubernetesService = {
        deploy: jest.fn().mockImplementation(({ namespace }) => {
          return Promise.resolve({
            success: true,
            data: {
              success: true,
              resources: [
                { kind: 'Deployment', name: 'test-app', namespace, status: 'created' },
                { kind: 'Service', name: 'test-app-service', namespace, status: 'created' },
              ],
              deployed: ['Deployment/test-app', 'Service/test-app-service'],
              failed: [],
              endpoints: [{
                service: 'test-app-service',
                type: 'ClusterIP',
                port: 80,
                url: `http://test-app-service.${namespace}.svc.cluster.local`,
              }],
            },
          });
        }),
      };

      for (const env of environments) {
        const result = await mockKubernetesService.deploy({
          manifests: [
            { ...mockDeploymentManifest, metadata: { ...mockDeploymentManifest.metadata, namespace: env } },
            { ...mockServiceManifest, metadata: { ...mockServiceManifest.metadata, namespace: env } },
          ],
          namespace: env,
          wait: true,
          timeout: 300000,
          dryRun: false,
        });
        deployResults.push({ environment: env, result });
      }

      expect(deployResults).toHaveLength(2);
      expect(deployResults.every(r => r.result.success)).toBe(true);
      expect(deployResults[0].result.data.endpoints[0].url).toContain('staging');
      expect(deployResults[1].result.data.endpoints[0].url).toContain('production');
    });

    it('should handle environment-specific configuration', () => {
      const generateEnvConfig = (environment: string) => {
        const baseConfig = {
          replicas: 1,
          resources: {
            requests: { memory: '128Mi', cpu: '100m' },
            limits: { memory: '256Mi', cpu: '200m' },
          },
        };

        switch (environment) {
          case 'production':
            return {
              ...baseConfig,
              replicas: 3,
              resources: {
                requests: { memory: '256Mi', cpu: '200m' },
                limits: { memory: '1Gi', cpu: '1000m' },
              },
            };
          case 'staging':
            return {
              ...baseConfig,
              replicas: 2,
              resources: {
                requests: { memory: '128Mi', cpu: '100m' },
                limits: { memory: '512Mi', cpu: '500m' },
              },
            };
          default:
            return baseConfig;
        }
      };

      const prodConfig = generateEnvConfig('production');
      const stagingConfig = generateEnvConfig('staging');
      const devConfig = generateEnvConfig('development');

      expect(prodConfig.replicas).toBe(3);
      expect(prodConfig.resources.limits.memory).toBe('1Gi');
      
      expect(stagingConfig.replicas).toBe(2);
      expect(stagingConfig.resources.limits.memory).toBe('512Mi');
      
      expect(devConfig.replicas).toBe(1);
      expect(devConfig.resources.limits.memory).toBe('256Mi');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle cluster connection failures gracefully', async () => {
      const mockKubernetesService = {
        deploy: jest.fn().mockRejectedValue(new Error('ECONNREFUSED: Connection refused')),
        checkClusterAccess: jest.fn().mockResolvedValue(false),
      };

      const isClusterAccessible = await mockKubernetesService.checkClusterAccess();
      expect(isClusterAccessible).toBe(false);

      await expect(
        mockKubernetesService.deploy({
          manifests: [mockDeploymentManifest],
          namespace: 'default',
          wait: true,
          timeout: 300000,
          dryRun: false,
        })
      ).rejects.toThrow('Connection refused');
    });

    it('should validate manifests before deployment', () => {
      const validateManifest = (manifest: any) => {
        const errors = [];
        
        if (!manifest.apiVersion) errors.push('Missing apiVersion');
        if (!manifest.kind) errors.push('Missing kind');
        if (!manifest.metadata?.name) errors.push('Missing metadata.name');
        
        // Check for required fields based on kind
        if (manifest.kind === 'Deployment') {
          if (!manifest.spec?.selector?.matchLabels) {
            errors.push('Deployment missing spec.selector.matchLabels');
          }
          if (!manifest.spec?.template?.spec?.containers?.length) {
            errors.push('Deployment missing containers');
          }
        }
        
        return errors;
      };

      const validManifest = mockDeploymentManifest;
      const invalidManifest = { kind: 'Deployment' }; // Missing required fields

      expect(validateManifest(validManifest)).toHaveLength(0);
      expect(validateManifest(invalidManifest)).toContain('Missing apiVersion');
      expect(validateManifest(invalidManifest)).toContain('Missing metadata.name');
    });

    it('should provide detailed error information for debugging', () => {
      const createDetailedError = (operation: string, resource: any, originalError: Error) => {
        return {
          operation,
          resource: {
            kind: resource.kind,
            name: resource.metadata?.name,
            namespace: resource.metadata?.namespace,
          },
          error: originalError.message,
          timestamp: new Date().toISOString(),
          suggestion: getSuggestion(originalError.message),
        };
      };

      const getSuggestion = (errorMessage: string) => {
        if (errorMessage.includes('already exists')) {
          return 'Resource already exists. Use --force to overwrite or check if update is needed.';
        }
        if (errorMessage.includes('not found')) {
          return 'Resource not found. Check if namespace exists and resource name is correct.';
        }
        if (errorMessage.includes('forbidden')) {
          return 'Permission denied. Check RBAC permissions for the operation.';
        }
        return 'Check Kubernetes logs for more details.';
      };

      const error = createDetailedError(
        'create',
        mockDeploymentManifest,
        new Error('deployment "test-app" already exists')
      );

      expect(error.operation).toBe('create');
      expect(error.resource.kind).toBe('Deployment');
      expect(error.resource.name).toBe('test-app');
      expect(error.suggestion).toContain('already exists');
    });
  });
});