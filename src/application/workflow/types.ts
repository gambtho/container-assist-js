/**
 * Progress callback and workflow types for simplified async patterns
 */

export interface ProgressUpdate {
  step: string;
  status: 'starting' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ProgressCallback {
  (update: ProgressUpdate): void | Promise<void>;
}

export interface WorkflowOptions {
  onProgress?: ProgressCallback;
  timeout?: number;
  signal?: AbortSignal;
}

export interface ContainerizationParams {
  repositoryPath: string;
  baseImage?: string;
  buildContext?: string;
  outputPath?: string;
  includeSecurityScan?: boolean;
}

export interface ContainerizationResult {
  dockerfilePath: string;
  imageId?: string;
  buildLogs?: string[];
  securityScanResults?: unknown;
  manifestPaths?: string[];
}

export interface DeploymentParams {
  imageId: string;
  environment: 'development' | 'staging' | 'production';
  namespace?: string;
  replicas?: number;
  resources?: {
    cpu?: string;
    memory?: string;
  };
}

export interface DeploymentResult {
  manifestPaths: string[];
  deploymentName: string;
  serviceName?: string;
  ingressName?: string;
  status: 'deployed' | 'failed';
}

export interface SecurityScanParams {
  imageId: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  format?: 'json' | 'table';
}

export interface SecurityScanResult {
  vulnerabilities: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    fixedVersion?: string;
  }>;
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}
