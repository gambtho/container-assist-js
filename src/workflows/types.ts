// Workflow types - simplified for core functionality

import type { Logger } from 'pino';

export interface BaseWorkflowParams {
  sessionId: string;
  repoPath: string;
  logger: Logger;
}

export interface WorkflowResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  output?: any;
}

export interface WorkflowContext {
  sessionId: string;
  steps: WorkflowStep[];
  artifacts: Map<string, any>;
  metadata: {
    startTime: Date;
    [key: string]: any;
  };
  currentStep?: string;
}

// Containerization workflow types
export interface ContainerizationWorkflowParams {
  sessionId: string;
  projectPath: string;
  buildOptions?: {
    dockerfilePath?: string;
    contextPath?: string;
    buildArgs?: Record<string, string>;
    target?: string;
    platform?: string;
    tags?: string[];
    noCache?: boolean;
  };
  scanOptions?: {
    severity?: 'low' | 'medium' | 'high' | 'critical';
    ignoreUnfixed?: boolean;
  };
}

export interface ContainerizationWorkflowResult {
  success: boolean;
  sessionId: string;
  error?: string;
  data?: {
    imageId?: string;
    imageTags?: string[];
    dockerfilePath?: string;
    scanResults?: {
      vulnerabilities: any[];
      summary: any;
    };
    analysisData: {
      language: string;
    };
  };
  metadata: {
    startTime: Date;
    endTime: Date;
    duration: number;
    steps: WorkflowStep[];
  };
}

// Deployment workflow types
export interface DeploymentWorkflowParams {
  sessionId: string;
  imageId: string;
  clusterConfig: {
    namespace?: string;
    context?: string;
    kubeconfig?: string;
  };
  deploymentOptions: {
    name: string;
    replicas?: number;
    port?: number;
    env?: Record<string, string>;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
  };
}

export interface DeploymentWorkflowResult {
  success: boolean;
  sessionId: string;
  error?: string;
  data?: {
    namespace: string;
    deploymentName: string;
    serviceName: string;
    resources: Array<{
      kind: string;
      name: string;
      namespace: string;
    }>;
    status?: {
      ready: boolean;
      replicas: number;
      availableReplicas: number;
    };
  };
  metadata: {
    startTime: Date;
    endTime: Date;
    duration: number;
    steps: WorkflowStep[];
  };
}
