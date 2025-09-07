/**
 * Workflow type definitions for orchestrating containerization and deployment pipelines
 */

import type { Session } from '../types/session';

/**
 * Base workflow parameters shared by all workflows
 */
export interface BaseWorkflowParams {
  sessionId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for containerization workflow
 */
export interface ContainerizationWorkflowParams extends BaseWorkflowParams {
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

/**
 * Parameters for deployment workflow
 */
export interface DeploymentWorkflowParams extends BaseWorkflowParams {
  imageId: string;
  clusterConfig: {
    context?: string;
    namespace?: string;
    kubeconfig?: string;
  };
  deploymentOptions: {
    name: string;
    replicas?: number;
    port?: number;
    serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
    registry?: string;
    imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
    resources?: {
      limits?: {
        cpu?: string;
        memory?: string;
      };
      requests?: {
        cpu?: string;
        memory?: string;
      };
    };
    env?: Record<string, string>;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
}

/**
 * Base workflow result structure
 */
export interface WorkflowResult {
  success: boolean;
  sessionId: string;
  error?: string;
  results?: Record<string, unknown>;
  metadata?: {
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    steps?: WorkflowStep[];
  };
}

/**
 * Containerization workflow specific result
 */
export interface ContainerizationWorkflowResult extends WorkflowResult {
  results?: {
    imageId?: string;
    imageTags?: string[];
    dockerfilePath?: string;
    scanResults?: {
      vulnerabilities?: Array<{
        severity: string;
        packageName: string;
        description: string;
      }>;
      summary?: {
        critical: number;
        high: number;
        medium: number;
        low: number;
      };
    };
    analysisData?: Record<string, unknown>;
  };
}

/**
 * Deployment workflow specific result
 */
export interface DeploymentWorkflowResult extends WorkflowResult {
  results?: {
    deploymentName?: string;
    namespace?: string;
    endpoints?: string[];
    service?: {
      name: string;
      type: string;
      clusterIP?: string;
      externalIP?: string;
      ports?: Array<{
        port: number;
        targetPort: number;
        protocol: string;
      }>;
    };
    pods?: Array<{
      name: string;
      status: string;
      ready: boolean;
      restarts: number;
    }>;
    verificationStatus?: {
      deployment: boolean;
      service: boolean;
      endpoints: boolean;
      health: boolean;
    };
  };
}

/**
 * Workflow step tracking
 */
export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  output?: unknown;
}

/**
 * Workflow context for sharing state between steps
 */
export interface WorkflowContext {
  sessionId: string;
  sessionData?: Session;
  steps: WorkflowStep[];
  currentStep?: string;
  artifacts: Map<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * Workflow orchestrator interface
 */
export interface WorkflowOrchestrator {
  execute(params: BaseWorkflowParams): Promise<WorkflowResult>;
  validateParams(params: BaseWorkflowParams): boolean;
  getSteps(): WorkflowStep[];
  getCurrentStep(): string | undefined;
  getContext(): WorkflowContext;
}

/**
 * Tool execution result interface
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}
