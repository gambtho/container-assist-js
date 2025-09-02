/**
 * Kubernetes Client Unit Tests
 * Tests the KubernetesClient class functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { KubernetesClient } from '../../../../src/infrastructure/external/kubernetes/client.js'
import { createTestLogger } from '../../../utils/test-logger.js'
import type { Logger, KubernetesManifest } from '../../../../src/domain/types/index.js'

// Mock @kubernetes/client-node
jest.mock('@kubernetes/client-node', () => {
  const mockKubeConfig = {
    loadFromDefault: jest.fn(),
    loadFromFile: jest.fn(),
    setCurrentContext: jest.fn(),
    getCurrentContext: jest.fn().mockReturnValue('test-context'),
    makeApiClient: jest.fn().mockReturnValue({
      getAPIVersions: jest.fn().mockResolvedValue({ body: { versions: ['v1'] } }),
      listNamespace: jest.fn().mockResolvedValue({ body: { items: [] } }),
      readNamespace: jest.fn().mockRejectedValue(new Error('Not found')),
      createNamespace: jest.fn().mockResolvedValue({ body: {} }),
      readNamespacedConfigMap: jest.fn().mockRejectedValue(new Error('Not found')),
      createNamespacedConfigMap: jest.fn().mockResolvedValue({ body: {} })
    })
  }

  return {
    KubeConfig: jest.fn().mockImplementation(() => mockKubeConfig),
    CoreV1Api: jest.fn(),
    AppsV1Api: jest.fn(),
    NetworkingV1Api: jest.fn(),
    BatchV1Api: jest.fn(),
    AutoscalingV2Api: jest.fn(),
    PolicyV1Api: jest.fn(),
    CustomObjectsApi: jest.fn()
  }
})

describe('KubernetesClient', () => {
  let logger: Logger
  let client: KubernetesClient

  beforeEach(() => {
    logger = createTestLogger()
    jest.clearAllMocks()
  })

  describe('Constructor', () => {
    it('should create client with default config', () => {
      client = new KubernetesClient({}, logger)
      expect(client).toBeDefined()
    })

    it('should create client with custom config', () => {
      client = new KubernetesClient({
        kubeconfig: '/custom/path',
        context: 'custom-context',
        namespace: 'custom-namespace',
        timeout: 60
      }, logger)
      expect(client).toBeDefined()
    })
  })

  describe('Cluster Operations', () => {
    beforeEach(() => {
      client = new KubernetesClient({}, logger)
    })

    it('should ping cluster successfully', async () => {
      const result = await client.ping()
      expect(result.success).toBe(true)
    })

    it('should get cluster info', async () => {
      const result = await client.getClusterInfo()
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.version).toBeDefined()
      expect(result.data.currentContext).toBe('test-context')
    })
  })

  describe('Manifest Operations', () => {
    beforeEach(() => {
      client = new KubernetesClient({}, logger)
    })

    it('should apply namespace manifest', async () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name: 'test-namespace'
        }
      }

      const result = await client.applyManifest(manifest)
      expect(result.success).toBe(true)
      expect(result.data.kind).toBe('Namespace')
      expect(result.data.name).toBe('test-namespace')
      expect(result.data.status).toBe('created')
    })

    it('should apply configmap manifest', async () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap',
          namespace: 'default'
        },
        spec: {
          data: {
            'config.yaml': 'test: true'
          }
        }
      }

      const result = await client.applyManifest(manifest)
      expect(result.success).toBe(true)
      expect(result.data.kind).toBe('ConfigMap')
      expect(result.data.name).toBe('test-configmap')
      expect(result.data.status).toBe('created')
    })

    it('should handle deployment with dry run', async () => {
      const manifests: KubernetesManifest[] = [{
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap',
          namespace: 'default'
        }
      }]

      const result = await client.deploy({
        manifests,
        namespace: 'default',
        wait: false,
        timeout: 30,
        dryRun: true
      })

      expect(result.success).toBe(true)
      expect(result.data.deployed).toHaveLength(1)
      expect(result.data.deployed[0]).toBe('ConfigMap/test-configmap')
    })
  })

  describe('Resource Status', () => {
    beforeEach(() => {
      client = new KubernetesClient({}, logger)
    })

    it('should handle unsupported resource types', async () => {
      const result = await client.getStatus('unknown/test', 'default')
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Unsupported resource type')
    })

    it('should handle service deletion for unsupported types', async () => {
      const result = await client.delete('unknown/test', 'default')
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Unsupported resource type')
    })
  })

  describe('Error Handling', () => {
    it('should handle kubeconfig loading errors', () => {
      const mockConfig = require('@kubernetes/client-node')
      mockConfig.KubeConfig.mockImplementation(() => ({
        loadFromDefault: jest.fn().mockImplementation(() => {
          throw new Error('Failed to load kubeconfig')
        })
      }))

      expect(() => {
        new KubernetesClient({}, logger)
      }).toThrow('Failed to load kubeconfig')
    })

    it('should handle API errors gracefully', async () => {
      const mockConfig = require('@kubernetes/client-node')
      mockConfig.KubeConfig.mockImplementation(() => ({
        loadFromDefault: jest.fn(),
        loadFromFile: jest.fn(),
        setCurrentContext: jest.fn(),
        getCurrentContext: jest.fn().mockReturnValue('test-context'),
        makeApiClient: jest.fn().mockReturnValue({
          getAPIVersions: jest.fn().mockRejectedValue(new Error('API Error')),
        })
      }))

      client = new KubernetesClient({}, logger)
      const result = await client.ping()
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('API Error')
    })
  })

  describe('Cleanup', () => {
    beforeEach(() => {
      client = new KubernetesClient({}, logger)
    })

    it('should close client cleanly', async () => {
      await expect(client.close()).resolves.toBeUndefined()
    })
  })
})