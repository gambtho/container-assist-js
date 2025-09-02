import { 
  Session, 
  WorkflowState, 
  AnalysisResult, 
  DockerBuildResult, 
  DockerfileResult, 
  ScanResult, 
  K8sManifestResult, 
  DeploymentResult,
  WorkflowStep
} from '@domain/types/session.js';
import { nanoid } from 'nanoid';

export function createMockSession(overrides?: Partial<Session>): Session {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    created_at: now,
    updated_at: now,
    status: 'active',
    repo_path: '/test/repo',
    stage: 'analysis',
    labels: {},
    metadata: {},
    workflow_state: createMockWorkflowState(),
    version: 0,
    ...overrides
  };
}

export function createMockWorkflowState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    completed_steps: [],
    errors: {},
    metadata: {},
    ...overrides
  };
}

export function createMockAnalysisResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    language: 'javascript',
    language_version: '18.0.0',
    framework: 'express',
    framework_version: '4.18.0',
    build_system: {
      type: 'npm',
      build_file: 'package.json',
      build_command: 'npm run build'
    },
    dependencies: [
      { name: 'express', version: '4.18.0', type: 'runtime' },
      { name: 'pino', version: '8.0.0', type: 'runtime' },
      { name: 'zod', version: '3.21.0', type: 'runtime' },
      { name: '@types/node', version: '18.0.0', type: 'dev' }
    ],
    has_tests: true,
    test_framework: 'jest',
    required_ports: [3000],
    env_variables: {
      NODE_ENV: 'production',
      PORT: '3000'
    },
    docker_compose_exists: false,
    ...overrides
  };
}

export function createMockDockerfileResult(overrides?: Partial<DockerfileResult>): DockerfileResult {
  return {
    content: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]`,
    path: './Dockerfile',
    base_image: 'node:18-alpine',
    stages: ['production'],
    optimizations: ['multistage', 'layer-caching'],
    multistage: false,
    ...overrides
  };
}

export function createMockDockerBuildResult(overrides?: Partial<DockerBuildResult>): DockerBuildResult {
  return {
    image_id: 'sha256:' + 'a'.repeat(64),
    image_tag: 'test-app:latest',
    size_bytes: 52428800, // 50MB
    layers: [
      { id: 'sha256:' + 'b'.repeat(64), size: 5242880, command: 'FROM node:18-alpine' },
      { id: 'sha256:' + 'c'.repeat(64), size: 1048576, command: 'WORKDIR /app' },
      { id: 'sha256:' + 'd'.repeat(64), size: 41943040, command: 'RUN npm ci' },
      { id: 'sha256:' + 'e'.repeat(64), size: 4194304, command: 'COPY . .' }
    ],
    build_duration_ms: 45000,
    build_args: {},
    cache_used: true,
    ...overrides
  };
}

export function createMockScanResult(overrides?: Partial<ScanResult>): ScanResult {
  return {
    scanner: 'trivy',
    vulnerabilities: [
      {
        id: 'CVE-2023-1234',
        severity: 'high',
        package: 'openssl',
        version: '1.1.1k',
        fixed_version: '1.1.1l',
        description: 'Buffer overflow in OpenSSL'
      },
      {
        id: 'CVE-2023-5678',
        severity: 'medium',
        package: 'zlib',
        version: '1.2.11',
        fixed_version: '1.2.12',
        description: 'Memory corruption in zlib'
      }
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 1,
      low: 0,
      total: 2
    },
    scan_duration_ms: 12000,
    ...overrides
  };
}

export function createMockK8sManifestResult(overrides?: Partial<K8sManifestResult>): K8sManifestResult {
  return {
    manifests: [
      {
        kind: 'Deployment',
        name: 'test-app',
        namespace: 'default',
        content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: default
spec:
  replicas: 2
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
        file_path: './k8s/deployment.yaml'
      },
      {
        kind: 'Service',
        name: 'test-app-service',
        namespace: 'default',
        content: `apiVersion: v1
kind: Service
metadata:
  name: test-app-service
  namespace: default
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP`,
        file_path: './k8s/service.yaml'
      }
    ],
    deployment_strategy: 'rolling',
    replicas: 2,
    resources: {
      requests: {
        cpu: '100m',
        memory: '128Mi'
      },
      limits: {
        cpu: '500m',
        memory: '512Mi'
      }
    },
    ...overrides
  };
}

export function createMockDeploymentResult(overrides?: Partial<DeploymentResult>): DeploymentResult {
  return {
    namespace: 'default',
    deployment_name: 'test-app',
    service_name: 'test-app-service',
    endpoints: [
      {
        type: 'internal',
        url: 'http://test-app-service.default.svc.cluster.local',
        port: 80
      }
    ],
    status: {
      ready_replicas: 2,
      total_replicas: 2,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'MinimumReplicasAvailable',
          message: 'Deployment has minimum availability.'
        }
      ]
    },
    deployment_duration_ms: 30000,
    ready: true,
    ...overrides
  };
}

export const SAMPLE_DOCKERFILES = {
  node: `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]`,
  
  python: `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "app.py"]`,
  
  multistage: `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
EXPOSE 3000
CMD ["node", "dist/index.js"]`
};

export const VALID_TOOL_INPUTS = {
  analyze_repository: {
    repo_path: '/test/repo',
    session_id: 'test-session-123',
    deep_scan: false
  },
  generate_dockerfile: {
    session_id: 'test-session-123',
    base_image: 'node:18-alpine',
    port: 3000
  },
  build_image: {
    session_id: 'test-session-123',
    dockerfile_path: './Dockerfile',
    image_name: 'test-app',
    tag: 'latest'
  },
  scan_image: {
    session_id: 'test-session-123',
    scanner: 'trivy'
  },
  tag_image: {
    session_id: 'test-session-123',
    tags: ['latest', 'v1.0.0'],
    registry: 'docker.io'
  },
  push_image: {
    session_id: 'test-session-123'
  },
  generate_k8s_manifests: {
    session_id: 'test-session-123',
    namespace: 'default',
    replicas: 2
  },
  prepare_cluster: {
    session_id: 'test-session-123',
    cluster_name: 'test-cluster',
    namespace: 'default'
  },
  deploy_application: {
    session_id: 'test-session-123'
  },
  verify_deployment: {
    session_id: 'test-session-123'
  },
  start_workflow: {
    session_id: 'test-session-123',
    repo_path: '/test/repo'
  },
  workflow_status: {
    session_id: 'test-session-123'
  }
};

export const INVALID_TOOL_INPUTS = {
  analyze_repository: {
    deep_scan: 'not-a-boolean' // Wrong type
  },
  generate_dockerfile: {
    session_id: 123, // Wrong type
    port: 'not-a-number' // Wrong type
  },
  build_image: {
    session_id: 'test',
    dockerfile_path: null, // Wrong type
    image_name: '',
    tag: []
  }
};

/**
 * Create a session with completed workflow state for a specific step
 */
export function createSessionWithCompletedStep(step: keyof typeof WorkflowStep, overrides?: Partial<Session>): Session {
  const session = createMockSession(overrides);
  const workflowState = { ...session.workflow_state };
  
  // Add the step to completed steps
  workflowState.completed_steps = [...(workflowState.completed_steps || []), WorkflowStep[step]];
  
  // Add appropriate result data based on step
  switch (step) {
    case 'ANALYZE':
      workflowState.analysis_result = createMockAnalysisResult();
      break;
    case 'GENERATE_DOCKERFILE':
      workflowState.dockerfile_result = createMockDockerfileResult();
      break;
    case 'BUILD_IMAGE':
      workflowState.build_result = createMockDockerBuildResult();
      break;
    case 'SCAN_IMAGE':
      workflowState.scan_result = createMockScanResult();
      break;
    case 'GENERATE_K8S':
      workflowState.k8s_result = createMockK8sManifestResult();
      break;
    case 'DEPLOY':
      workflowState.deployment_result = createMockDeploymentResult();
      break;
  }
  
  return {
    ...session,
    workflow_state: workflowState
  };
}

/**
 * Create a session with the full workflow completed
 */
export function createCompletedWorkflowSession(overrides?: Partial<Session>): Session {
  const session = createMockSession({
    status: 'completed',
    ...overrides
  });
  
  return {
    ...session,
    workflow_state: {
      completed_steps: Object.values(WorkflowStep),
      analysis_result: createMockAnalysisResult(),
      dockerfile_result: createMockDockerfileResult(),
      build_result: createMockDockerBuildResult(),
      scan_result: createMockScanResult(),
      k8s_result: createMockK8sManifestResult(),
      deployment_result: createMockDeploymentResult(),
      errors: {},
      metadata: {}
    }
  };
}