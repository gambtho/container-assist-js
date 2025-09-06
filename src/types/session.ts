/**
 * Simple Session Types - De-Enterprise Refactoring
 *
 * Replaces complex Zod schemas with simple TypeScript types
 * From 358 lines of schema validation to clean type definitions
 */

// Simple types for containerization workflows

export type AnalysisResult = {
  language: string;
  language_version?: string;
  framework?: string;
  framework_version?: string;
  build_system?: {
    type: string;
    build_file: string;
    build_command?: string;
  };
  dependencies?: Array<{
    name: string;
    version?: string;
    type?: 'runtime' | 'dev' | 'test';
  }>;
  has_tests?: boolean;
  test_framework?: string;
  database?: string | null;
  required_ports?: number[];
  ports?: number[];
  env_variables?: Record<string, string>;
  docker_compose_exists?: boolean;
  ci_cd_platform?: string;
  java_version?: string;
  build_tool_version?: string;
  packaging?: 'jar' | 'war' | 'ear';
  recommendations?: {
    baseImage?: string;
    buildStrategy?: string;
    securityNotes?: string[];
  };
};

export type DockerfileResult = {
  content: string;
  path: string;
  base_image?: string;
  stages?: string[];
  optimizations?: string[];
  multistage?: boolean;
};

export type DockerBuildResult = {
  success: boolean;
  imageId: string;
  tags?: string[];
  size?: number;
  metadata?: Record<string, unknown>;
};

export type ScanResult = {
  success: boolean;
  vulnerabilities?: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    package: string;
    version: string;
    description: string;
    fixedVersion?: string;
  }>;
  summary?: {
    total: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
};

export type K8sManifestResult = {
  manifests: Array<{
    kind: string;
    name: string;
    namespace?: string;
    content: string;
    file_path: string;
  }>;
  deployment_strategy?: 'rolling' | 'recreate' | 'blue-green' | 'canary';
  replicas?: number;
  resources?: {
    requests?: {
      cpu?: string;
      memory?: string;
    };
    limits?: {
      cpu?: string;
      memory?: string;
    };
  };
  output_path?: string;
};

export type DeploymentResult = {
  namespace: string;
  deployment_name: string;
  service_name?: string;
  endpoints?: Array<{
    type: 'internal' | 'external' | 'nodeport' | 'loadbalancer';
    url: string;
    port: number;
  }>;
  status: {
    ready_replicas: number;
    total_replicas: number;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
  deployment_duration_ms?: number;
  ready?: boolean;
};

// Simple session type
export type Session = {
  id: string;
  repo_path: string;
  metadata: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
};

// Simple workflow state type
export type WorkflowState = {
  metadata: Record<string, unknown>;
  completed_steps: string[];
  errors: Record<string, string>;
  current_step: string | null;
  analysis_result?: AnalysisResult;
  dockerfile_result?: DockerfileResult;
  build_result?: DockerBuildResult;
  scan_result?: ScanResult;
  k8s_result?: K8sManifestResult;
  deployment_result?: DeploymentResult;
  // Additional properties used by tools
  workflow_state?: Record<string, unknown>;
  repo_path?: string;
  status?: string;
  stage?: string;
};


// Simple session filter interface
export interface SessionFilter {
  includeMetadata?: boolean;
  since?: Date;
  status?: string;
  limit?: number;
  repo_path?: string;
  labels?: Record<string, string>;
  created_after?: Date;
  created_before?: Date;
}
