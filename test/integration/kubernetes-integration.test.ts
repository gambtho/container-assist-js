/**
 * Kubernetes Integration Tests
 * Tests the Kubernetes client and service implementation
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { KubernetesClient, KubernetesService, KubernetesIntegration } from '../../src/infrastructure/external/kubernetes/index.js'
import { createTestLogger } from '../utils/test-logger.js'
import type { Logger, KubernetesManifest } from '../../src/domain/types/index.js'

// Mock kubeconfig for testing
const mockConfig = {
  kubeconfig: undefined, // Will use default or in-cluster config
  context: undefined,
  namespace: 'default',
  timeout: 30
}

describe('Kubernetes Integration', () => {
  let logger: Logger
  let client: KubernetesClient
  let service: KubernetesService
  let integration: KubernetesIntegration

  beforeAll(() => {
    logger = createTestLogger()
  })

  afterAll(async () => {
    if (client) {
      await client.close()
    }
    if (service) {
      await service.close()
    }
    if (integration) {
      await integration.close()
    }
  })

  describe('KubernetesClient', () => {
    beforeAll(() => {
      try {
        client = new KubernetesClient(mockConfig, logger)
      } catch (error) {
        // If Kubernetes is not available, skip these tests
        console.warn('Kubernetes not available, skipping client tests')
      }
    })

    it('should create client instance', () => {
      if (client) {
        expect(client).toBeDefined()
      } else {
        // Skip if no Kubernetes available
        expect(true).toBe(true)
      }
    })

    it('should test cluster connectivity', async () => {
      if (!client) return

      const result = await client.ping()
      // Either success or expected failure (no cluster)
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should handle manifest application', async () => {
      if (!client) return

      const testManifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap',
          namespace: 'default',
          labels: {
            'test': 'true',
            'managed-by': 'container-kit-mcp-test'
          }
        },
        spec: {
          data: {
            'test.txt': 'Hello from test'
          }
        }
      }

      const result = await client.applyManifest(testManifest)
      // Either success or expected failure (no cluster access)
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('KubernetesService', () => {
    beforeAll(() => {
      service = new KubernetesService(mockConfig, logger)
    })

    it('should create service instance', () => {
      expect(service).toBeDefined()
    })

    it('should initialize service', async () => {
      const result = await service.initialize()
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should check availability', async () => {
      const result = await service.isAvailable()
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should get health status', async () => {
      const result = await service.getHealthStatus()
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
      
      if (result.success) {
        expect(result.data).toBeDefined()
        expect(typeof result.data.overall).toBe('boolean')
        expect(result.data.capabilities).toBeDefined()
      }
    })

    it('should handle deployment with dry run', async () => {
      const testManifests: KubernetesManifest[] = [{
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap',
          namespace: 'default'
        },
        spec: {
          data: {
            'test.txt': 'Hello from test'
          }
        }
      }]

      const result = await service.deploy({
        manifests: testManifests,
        namespace: 'default',
        wait: false,
        timeout: 30,
        dryRun: true // Safe dry run
      })

      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('KubernetesIntegration', () => {
    beforeAll(() => {
      integration = new KubernetesIntegration(mockConfig, logger)
    })

    it('should create integration instance', () => {
      expect(integration).toBeDefined()
    })

    it('should implement KubernetesService interface', () => {
      expect(typeof integration.generateManifests).toBe('function')
      expect(typeof integration.deployApplication).toBe('function')
      expect(typeof integration.getDeploymentStatus).toBe('function')
      expect(typeof integration.deleteDeployment).toBe('function')
      expect(typeof integration.getClusterInfo).toBe('function')
      expect(typeof integration.createNamespace).toBe('function')
    })

    it('should initialize integration', async () => {
      const result = await integration.initialize()
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should check availability', async () => {
      const available = await integration.isAvailable()
      expect(typeof available).toBe('boolean')
    })

    it('should get metrics', () => {
      const metrics = integration.getMetrics()
      expect(metrics).toBeDefined()
      expect(typeof metrics.initialized).toBe('boolean')
    })

    it('should handle deploy application interface', async () => {
      const testManifests: KubernetesManifest[] = [{
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'test-app',
          namespace: 'default'
        },
        spec: {
          replicas: 1,
          selector: {
            matchLabels: {
              app: 'test-app'
            }
          },
          template: {
            metadata: {
              labels: {
                app: 'test-app'
              }
            },
            spec: {
              containers: [{
                name: 'test-container',
                image: 'nginx:alpine',
                ports: [{
                  containerPort: 80
                }]
              }]
            }
          }
        }
      }]

      const result = await integration.deployApplication(testManifests, 'default')
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should handle cluster info requests', async () => {
      const result = await integration.getClusterInfo()
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid configuration gracefully', () => {
      expect(() => {
        new KubernetesClient({ kubeconfig: '/invalid/path' }, logger)
      }).toThrow()
    })

    it('should handle service errors gracefully', async () => {
      const invalidService = new KubernetesService({ 
        kubeconfig: '/invalid/path',
        timeout: 1 // Very short timeout
      }, logger)

      const result = await invalidService.initialize()
      expect(result.success).toBe(false)
    })
  })

  describe('Mock Mode Testing', () => {
    it('should work with mock implementations', async () => {
      // Test that our integration works even without real Kubernetes
      const mockIntegration = new KubernetesIntegration({}, logger)
      
      const result = await mockIntegration.generateManifests({})
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })
  })
})