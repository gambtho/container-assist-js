/**
 * Kubernetes service mocks for MCP tool testing
 */

import { jest } from '@jest/globals';
import { Success, Failure, type Result } from '../../../../domain/types/result';

/**
 * Simple hash function for deterministic test behavior
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

export interface KubernetesApplyOptions {
  manifests: string[];
  namespace?: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface KubernetesApplyResult {
  applied: Array<{
    apiVersion: string;
    kind: string;
    name: string;
    namespace: string;
    action: 'created' | 'updated' | 'unchanged';
  }>;
  warnings?: string[];
}

export interface KubernetesGetOptions {
  apiVersion: string;
  kind: string;
  name?: string;
  namespace?: string;
  selector?: Record<string, string>;
}

export interface KubernetesDeleteOptions {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
  force?: boolean;
}

/**
 * Mock Kubernetes service with realistic responses
 */
export function createMockKubernetesService(): {
  apply: jest.MockedFunction<(options: unknown) => Promise<Result<unknown>>>;
  getResource: jest.MockedFunction<(options: unknown) => Promise<Result<unknown>>>;
  deleteResource: jest.MockedFunction<(options: unknown) => Promise<Result<unknown>>>;
  isAvailable: jest.MockedFunction<() => Promise<boolean>>;
  getClusterInfo: jest.MockedFunction<() => Promise<Result<unknown>>>;
} {
  return {
    // Apply manifests
    apply: jest.fn((options: unknown) => {
      const typedOptions = options as KubernetesApplyOptions;
      if (!typedOptions.manifests || typedOptions.manifests.length === 0) {
        return Promise.resolve(Failure('No manifests provided'));
      }

      // Parse manifests to determine what resources are being applied
      const applied: KubernetesApplyResult['applied'] = [];
      const warnings: string[] = [];

      for (const manifest of typedOptions.manifests) {
        if (!manifest.trim()) continue;

        // Simulate parsing YAML
        if (manifest.includes('fail-apply')) {
          return Promise.resolve(Failure('Failed to apply manifest: invalid resource definition'));
        }

        // Extract basic info from manifest
        const lines = manifest.split('\n');
        const apiVersionLine = lines.find((l) => l.startsWith('apiVersion:'));
        const kindLine = lines.find((l) => l.startsWith('kind:'));
        const nameLine = lines.find((l) => l.trim().startsWith('name:'));

        const apiVersion = apiVersionLine?.split(':')[1]?.trim() ?? 'unknown/v1';
        const kind = kindLine?.split(':')[1]?.trim() ?? 'Unknown';
        const name = nameLine?.split(':')[1]?.trim() ?? 'unknown-resource';

        // Simulate different actions based on resource
        let action: 'created' | 'updated' | 'unchanged' = 'created';
        if (name.includes('existing')) {
          // Use deterministic hash-based selection
          action = simpleHash(name) % 2 === 0 ? 'updated' : 'unchanged';
        }

        applied.push({
          apiVersion,
          kind,
          name,
          namespace: typedOptions.namespace ?? 'default',
          action,
        });

        // Add some warnings for certain scenarios
        if (kind === 'Deployment' && !manifest.includes('resources:')) {
          warnings.push(`${kind}/${name}: no resource limits specified`);
        }
      }

      const result: KubernetesApplyResult = {
        applied,
        ...(warnings.length > 0 && { warnings }),
      };

      return Promise.resolve(Success(result));
    }),

    // Get resources
    getResource: jest.fn((options: unknown) => {
      const typedOptions = options as KubernetesGetOptions;
      if (typedOptions.name?.includes('not-found')) {
        return Promise.resolve(Failure(`${typedOptions.kind}/${typedOptions.name} not found`));
      }

      // Generate mock resources based on request
      const resources: KubernetesResource[] = [];

      if (typedOptions.name) {
        // Get specific resource
        const resource: KubernetesResource = {
          apiVersion: typedOptions.apiVersion,
          kind: typedOptions.kind,
          metadata: {
            name: typedOptions.name,
            namespace: typedOptions.namespace ?? 'default',
            labels: {
              app: typedOptions.name,
            },
          },
        };

        // Add kind-specific spec and status
        if (typedOptions.kind === 'Deployment') {
          resource.spec = {
            replicas: 3,
            selector: {
              matchLabels: { app: typedOptions.name },
            },
            template: {
              metadata: {
                labels: { app: typedOptions.name },
              },
              spec: {
                containers: [
                  {
                    name: typedOptions.name,
                    image: `${typedOptions.name}:latest`,
                    ports: [{ containerPort: 3000 }],
                  },
                ],
              },
            },
          };
          resource.status = {
            replicas: 3,
            readyReplicas: simpleHash(typedOptions.name) % 4, // 0-3, deterministic based on name
            availableReplicas: 3,
            updatedReplicas: 3,
          };
        } else if (typedOptions.kind === 'Service') {
          resource.spec = {
            selector: { app: typedOptions.name },
            ports: [
              {
                protocol: 'TCP',
                port: 80,
                targetPort: 3000,
              },
            ],
            type: 'ClusterIP',
          };
        } else if (typedOptions.kind === 'Pod') {
          resource.spec = {
            containers: [
              {
                name: typedOptions.name,
                image: `${typedOptions.name}:latest`,
              },
            ],
          };
          resource.status = {
            phase: ['Pending', 'Running', 'Succeeded', 'Failed'][simpleHash(typedOptions.name) % 4],
            conditions: [
              {
                type: 'Ready',
                status: simpleHash(`${typedOptions.name}ready`) % 10 > 3 ? 'True' : 'False',
                lastTransitionTime: new Date().toISOString(),
              },
            ],
          };
        }

        resources.push(resource);
      } else {
        // List resources (generate 1-3 mock resources deterministically)
        const count =
          (simpleHash(typedOptions.kind + (typedOptions.namespace ?? 'default')) % 3) + 1;
        for (let i = 0; i < count; i++) {
          const name = `${typedOptions.kind.toLowerCase()}-${i + 1}`;
          const resource: KubernetesResource = {
            apiVersion: typedOptions.apiVersion,
            kind: typedOptions.kind,
            metadata: {
              name,
              namespace: typedOptions.namespace ?? 'default',
              labels: {
                app: name,
              },
            },
          };
          resources.push(resource);
        }
      }

      return Promise.resolve(Success(resources));
    }),

    // Delete resources
    deleteResource: jest.fn((options: unknown) => {
      const typedOptions = options as KubernetesDeleteOptions;
      if (!typedOptions.name) {
        return Promise.resolve(Failure('Resource name is required for deletion'));
      }

      if (typedOptions.name.includes('not-found')) {
        return Promise.resolve(Failure(`${typedOptions.kind}/${typedOptions.name} not found`));
      }

      if (typedOptions.name.includes('protected') && !typedOptions.force) {
        return Promise.resolve(
          Failure(`${typedOptions.kind}/${typedOptions.name} has finalizers - use force deletion`),
        );
      }

      // Simulate successful deletion
      return Promise.resolve(Success(undefined));
    }),

    // Check cluster connectivity
    isAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),

    // Get cluster info
    getClusterInfo: jest.fn<() => Promise<Result<unknown>>>().mockResolvedValue(
      Success({
        version: {
          major: '1',
          minor: '25',
          gitVersion: 'v1.25.0',
        },
        nodes: [
          {
            name: 'node-1',
            status: 'Ready',
            roles: ['control-plane'],
          },
          {
            name: 'node-2',
            status: 'Ready',
            roles: ['worker'],
          },
        ],
        namespaces: ['default', 'kube-system', 'kube-public'],
      }),
    ),
  };
}

/**
 * Helper to create Kubernetes resource scenarios for testing
 */
export function createKubernetesScenarios(): Record<string, unknown> {
  return {
    // Deployment scenarios
    deployment: {
      apply: {
        manifests: [
          `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  labels:
    app: test-app
spec:
  replicas: 3
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
        image: test-app:latest
        ports:
        - containerPort: 3000`,
        ],
        expected: {
          applied: [
            {
              apiVersion: 'apps/v1',
              kind: 'Deployment',
              name: 'test-app',
              namespace: 'default',
              action: 'created',
            },
          ],
        },
      },
      get: {
        options: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'test-app',
        },
        expected: {
          kind: 'Deployment',
          metadata: {
            name: 'test-app',
          },
          spec: expect.objectContaining({
            replicas: 3,
          }) as { replicas: number },
          status: expect.objectContaining({
            replicas: expect.any(Number) as number,
          }) as { replicas: number },
        },
      },
    },

    // Service scenarios
    service: {
      apply: {
        manifests: [
          `apiVersion: v1
kind: Service
metadata:
  name: test-app-service
spec:
  selector:
    app: test-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: ClusterIP`,
        ],
        expected: {
          applied: [
            {
              apiVersion: 'v1',
              kind: 'Service',
              name: 'test-app-service',
              namespace: 'default',
              action: 'created',
            },
          ],
        },
      },
    },

    // Error scenarios
    errors: {
      applyFail: {
        manifests: ['apiVersion: fail-apply\nkind: BadResource'],
        expectError: 'Failed to apply manifest: invalid resource definition',
      },
      notFound: {
        options: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'not-found',
        },
        expectError: 'Deployment/not-found not found',
      },
      deleteFail: {
        options: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'not-found',
        },
        expectError: 'Deployment/not-found not found',
      },
    },

    // Wait scenarios
    waitReady: {
      success: {
        options: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'ready-app',
        },
        expected: true,
      },
      timeout: {
        options: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'never-ready',
        },
        expectError: 'Timeout waiting for Deployment/never-ready to be ready',
      },
    },
  };
}

/**
 * Mock Kubernetes CLI (kubectl) for fallback scenarios
 */
export function createMockKubernetesCLI(): {
  apply: jest.MockedFunction<(args: unknown) => Promise<Result<unknown>>>;
  get: jest.MockedFunction<(args: unknown) => Promise<Result<unknown>>>;
  delete: jest.MockedFunction<(args: unknown) => Promise<Result<unknown>>>;
  exec: jest.MockedFunction<(args: string) => Promise<Result<unknown>>>;
} {
  return {
    apply: jest.fn((args: unknown) => {
      const [_manifests, _options] = args as [string[], Record<string, unknown>];
      const command = `kubectl apply -f -`;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: 'deployment.apps/test-app created\nservice/test-app-service created',
          stderr: '',
        }),
      );
    }),

    get: jest.fn((args: unknown) => {
      const [resource, _options] = args as [string, Record<string, unknown>];
      const command = `kubectl get ${resource}`;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout:
            'NAME       READY   STATUS    RESTARTS   AGE\ntest-app   3/3     Running   0          5m',
          stderr: '',
        }),
      );
    }),

    delete: jest.fn((args: unknown) => {
      const [resource, name, _options] = args as [string, string, Record<string, unknown>];
      const command = `kubectl delete ${resource} ${name}`;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: `${resource} "${name}" deleted`,
          stderr: '',
        }),
      );
    }),

    exec: jest.fn((args: string) => {
      const command = args;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: 'Command executed successfully',
          stderr: '',
        }),
      );
    }),
  };
}

/**
 * Helper to create pod status scenarios for testing
 */
export function createPodStatusScenarios(): Record<string, Record<string, unknown>> {
  return {
    running: {
      phase: 'Running',
      conditions: [
        {
          type: 'Ready',
          status: 'True',
          lastTransitionTime: new Date().toISOString(),
        },
        {
          type: 'ContainersReady',
          status: 'True',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
    pending: {
      phase: 'Pending',
      conditions: [
        {
          type: 'PodScheduled',
          status: 'False',
          reason: 'Unschedulable',
          message: 'No nodes available',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
    failed: {
      phase: 'Failed',
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'ContainersNotReady',
          message: 'containers with unready status: [app]',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
    succeeded: {
      phase: 'Succeeded',
      conditions: [
        {
          type: 'Ready',
          status: 'False',
          reason: 'PodCompleted',
          message: 'Pod completed successfully',
          lastTransitionTime: new Date().toISOString(),
        },
      ],
    },
  };
}
