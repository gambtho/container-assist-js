/**
 * Shared test utilities for MCP Tools
 */

import { jest } from '@jest/globals';
import type { Logger } from 'pino';
import type {
  DockerService,
  KubernetesService,
  AIService,
  SessionService,
  ProgressEmitter,
} from '../../../services/interfaces.js';
import type { ToolContext } from '../../tool-types.js';
import type { EventEmitter } from 'events';

/**
 * Mock logger factory for consistent testing
 */
export function createMockLogger(): Logger {
  return {
    child: jest.fn(() => createMockLogger()),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    level: 'info',
    silent: false,
  } as unknown as Logger;
}

/**
 * Mock core services for tool testing
 */
interface CoreServices {
  docker: DockerService;
  kubernetes: KubernetesService;
  ai: AIService;
  session: SessionService;
  logger: Logger;
  progress?: ProgressEmitter;
}

export function createMockCoreServices(overrides?: Partial<CoreServices>): CoreServices {
  const mockLogger = createMockLogger();

  const mockDockerService = {
    build: jest.fn().mockImplementation(() =>
      Promise.resolve({
        imageId: 'test-image',
        tags: ['test-image:latest'],
        logs: [],
        success: true,
      }),
    ),
    tag: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    push: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    scan: jest.fn().mockImplementation(() => Promise.resolve({ vulnerabilities: [] })),
    health: jest.fn().mockImplementation(() => Promise.resolve({ healthy: true })),
    initialize: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  } as jest.Mocked<DockerService>;

  const mockKubernetesService = {
    deploy: jest.fn().mockImplementation(() => Promise.resolve({ success: true, resources: [] })),
    generateManifests: jest.fn().mockImplementation(() => Promise.resolve([])),
    checkClusterAccess: jest.fn().mockImplementation(() => Promise.resolve(true)),
    verifyDeployment: jest.fn().mockImplementation(() => Promise.resolve({ status: 'ready' })),
    prepareCluster: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    initialize: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  } as jest.Mocked<KubernetesService>;

  const mockAIService = {
    generateDockerfile: jest
      .fn()
      .mockImplementation(() => Promise.resolve('FROM node:16\nWORKDIR /app')),
    enhanceManifests: jest.fn().mockImplementation(() => Promise.resolve([])),
    analyzeRepository: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ language: 'javascript' })),
    fixDockerfile: jest
      .fn()
      .mockImplementation(() => Promise.resolve('FROM node:16\nWORKDIR /app')),
    isAvailable: jest.fn().mockImplementation(() => true),
    initialize: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  } as jest.Mocked<AIService>;

  const mockSessionService = {
    get: jest.fn().mockImplementation(() => Promise.resolve(null)),
    create: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: 'test-session',
        status: 'active',
        version: 1,
        created_at: '2023-01-01T00:00:00.000Z',
        updated_at: '2023-01-01T00:00:00.000Z',
        repo_path: '/test/repo',
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
          dockerfile_fix_history: [],
        },
      }),
    ),
    updateAtomic: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    update: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    delete: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    initialize: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  } as jest.Mocked<SessionService>;

  const mockProgressEmitter = {
    emit: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  } as jest.Mocked<ProgressEmitter>;

  return {
    logger: mockLogger,
    progress: mockProgressEmitter,
    session: mockSessionService,
    ai: mockAIService,
    docker: mockDockerService,
    kubernetes: mockKubernetesService,
    ...overrides,
  };
}

/**
 * Type-safe mock interfaces for ToolContext components
 */
type MockEventEmitter = jest.Mocked<EventEmitter>;

/**
 * Create a mock EventEmitter with all methods properly typed
 */
function createMockEventEmitter(): MockEventEmitter {
  return {
    emit: jest.fn().mockReturnValue(true),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    removeAllListeners: jest.fn().mockReturnThis(),
    addListener: jest.fn().mockReturnThis(),
    removeListener: jest.fn().mockReturnThis(),
    setMaxListeners: jest.fn().mockReturnThis(),
    getMaxListeners: jest.fn().mockReturnValue(10),
    listeners: jest.fn().mockReturnValue([]),
    rawListeners: jest.fn().mockReturnValue([]),
    listenerCount: jest.fn().mockReturnValue(0),
    prependListener: jest.fn().mockReturnThis(),
    prependOnceListener: jest.fn().mockReturnThis(),
    eventNames: jest.fn().mockReturnValue([]),
  } as MockEventEmitter;
}

/**
 * Mock tool context for testing
 */
export function createMockToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const mockLogger = createMockLogger();

  const mockWorkflowOrchestrator = {
    startWorkflow: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ executionId: 'test-exec' })),
    getWorkflowStatus: jest.fn().mockImplementation(() => Promise.resolve({ status: 'running' })),
    cancelWorkflow: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  };

  const mockWorkflowManager = {
    getSession: jest.fn().mockImplementation(() => Promise.resolve(null)),
    updateSession: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    deleteSession: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  };

  const mockEventPublisher = createMockEventEmitter();
  const mockProgressEmitter = createMockEventEmitter();

  const mockSampleFunction = jest.fn().mockImplementation(() =>
    Promise.resolve({
      text: 'test result',
      success: true,
    }),
  );

  // Type assertions for complex types that are properly mocked but need type casting
  const typedWorkflowOrchestrator =
    mockWorkflowOrchestrator as unknown as ToolContext['workflowOrchestrator'];
  const typedWorkflowManager = mockWorkflowManager as unknown as ToolContext['workflowManager'];
  const typedSampleFunction = mockSampleFunction as unknown as ToolContext['sampleFunction'];

  const structuredSampler = {
    generateStructured: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ success: true, data: 'test' })),
    generateDockerfile: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ success: true, data: 'test' })),
    generateKubernetesManifests: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ success: true, data: 'test' })),
    sampleStructured: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ success: true, data: 'test' })),
    sampleJSON: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ success: true, data: 'test' })),
  };

  const contentValidator = {
    validate: jest.fn().mockImplementation(() => ({ valid: true })),
    validateDockerfile: jest.fn().mockImplementation(() => ({ valid: true })),
    validateKubernetes: jest.fn().mockImplementation(() => ({ valid: true })),
  };

  const context: ToolContext = {
    server: {},
    logger: mockLogger,
    workflowOrchestrator: typedWorkflowOrchestrator,
    workflowManager: typedWorkflowManager,
    eventPublisher: mockEventPublisher,
    progressEmitter: mockProgressEmitter,
    ...(typedSampleFunction && { sampleFunction: typedSampleFunction }),
    structuredSampler: structuredSampler as unknown as NonNullable<
      ToolContext['structuredSampler']
    >,
    contentValidator: contentValidator as unknown as NonNullable<ToolContext['contentValidator']>,
    config: {
      aiServices: {
        ai: {
          model: 'claude-3-opus',
          apiKey: 'test-key',
          baseUrl: 'https://api.anthropic.com',
        },
        sampler: {
          mode: 'mock' as const,
          templateDir: '/tmp/templates',
          cacheEnabled: false,
          retryAttempts: 1,
          retryDelayMs: 100,
        },
        mock: {
          enabled: true,
          deterministicMode: true,
          simulateLatency: false,
          errorRate: 0,
        },
      },
      infrastructure: {
        docker: {
          socketPath: '/var/run/docker.sock',
          registry: 'docker.io',
        },
        kubernetes: {
          kubeconfig: '~/.kube/config',
          namespace: 'default',
        },
        scanning: {
          enabled: false,
          scanner: 'trivy' as const,
          severityThreshold: 'medium' as const,
          failOnVulnerabilities: false,
        },
        build: {
          enableCache: true,
          parallel: false,
        },
        java: {
          defaultVersion: '17',
          defaultJvmHeapPercentage: 75,
          enableNativeImage: false,
          enableJmx: false,
          enableProfiling: false,
        },
      },
      session: {
        store: 'memory' as const,
        ttl: 3600000,
        maxSessions: 100,
      },
      server: {
        nodeEnv: 'test' as const,
        logLevel: 'error' as const,
      },
      mcp: {
        storePath: '/tmp/mcp',
        sessionTTL: '1h',
        maxSessions: 100,
        enableMetrics: false,
        enableEvents: false,
      },
      workspace: {
        workspaceDir: '/tmp/workspace',
      },
      logging: {
        level: 'error' as const,
        format: 'json' as const,
        destination: 'console' as const,
      },
      workflow: {
        mode: 'auto' as const,
        autoRetry: true,
        maxRetries: 3,
        retryDelayMs: 1000,
        parallelSteps: false,
        skipOptionalSteps: false,
      },
      features: {
        aiEnabled: false,
        mockMode: true,
        enableMetrics: false,
        enableEvents: false,
        enablePerformanceMonitoring: false,
        enableDebugLogs: false,
        enableTracing: false,
        nonInteractive: true,
      },
    },
    sessionService: {
      get: jest.fn().mockImplementation(() => Promise.resolve(null)),
      create: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      update: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      delete: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      updateAtomic: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      initialize: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    } as jest.Mocked<SessionService>,
    aiService: {
      generateStructured: jest.fn().mockImplementation(() => Promise.resolve('structured output')),
      generateText: jest.fn().mockImplementation(() => Promise.resolve('text output')),
      isAvailable: jest.fn().mockImplementation(() => Promise.resolve(true)),
      validateContent: jest.fn().mockImplementation(() => Promise.resolve(true)),
      getModelInfo: jest.fn().mockImplementation(() => Promise.resolve({ model: 'test' })),
    } as unknown as jest.Mocked<AIService>,
    dockerService: {
      build: jest.fn().mockImplementation(() => Promise.resolve({ imageId: 'test-image' })),
      tag: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      push: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      pull: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      inspect: jest.fn().mockImplementation(() => Promise.resolve({})),
      remove: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
      isAvailable: jest.fn().mockImplementation(() => Promise.resolve(true)),
    } as unknown as jest.Mocked<DockerService>,
    kubernetesService: {
      apply: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
      get: jest.fn().mockImplementation(() => Promise.resolve({})),
      delete: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
      create: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
      isAvailable: jest.fn().mockImplementation(() => Promise.resolve(true)),
    } as unknown as jest.Mocked<KubernetesService>,
    ...overrides,
  };

  return context;
}

/**
 * Helper to create sample file system structure for testing
 */
export function createSampleProject(): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: 'test-app',
      version: '1.0.0',
      main: 'index',
      scripts: {
        start: 'node index',
      },
      dependencies: {
        express: '^4.18.0',
      },
    }),
    index: `
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello World' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
    `,
    Dockerfile: `FROM node:16
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`,
  };
}

/**
 * Helper to create sample Dockerfile content
 */
export function createSampleDockerfile(): string {
  return `FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node
CMD ["node", "index"]`;
}

/**
 * Helper to create sample Kubernetes manifests
 */
export function createSampleK8sManifests(): {
  deployment: string;
  service: string;
} {
  return {
    deployment: `apiVersion: apps/v1
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
    service: `apiVersion: v1
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
  };
}
