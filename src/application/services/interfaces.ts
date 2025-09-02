/**
 * Service Interfaces for Dependency Injection
 * Clean contracts for each service to enable constructor injection
 */

import type { Logger } from 'pino';
import type { DockerBuildOptions, DockerBuildResult } from '../../contracts/types/docker';
import type { Session } from '../../contracts/types/index';

/**
 * Docker service interface for container operations
 */
export interface DockerService {
  /**
   * Build Docker image from context and Dockerfile
   */
  build(options: DockerBuildOptions): Promise<DockerBuildResult>;

  /**
   * Scan Docker image for vulnerabilities
   */
  scan(options: { image: string; severity?: string; format?: string }): Promise<any>;

  /**
   * Push image to registry
   */
  push(options: { image: string; registry?: string }): Promise<void>;

  /**
   * Tag image with new tag
   */
  tag(options: { image: string; tag: string }): Promise<void>;

  /**
   * Get service health status
   */
  health(): Promise<{ healthy: boolean; version?: string; info?: unknown }>;

  /**
   * Initialize the service (async setup)
   */
  initialize(): Promise<void>;
}

/**
 * Kubernetes service interface for orchestration
 */
export interface KubernetesService {
  /**
   * Deploy application to cluster
   */
  deploy(manifests: any[]): Promise<{ success: boolean; resources: any[] }>;

  /**
   * Generate Kubernetes manifests from application spec
   */
  generateManifests(spec: unknown): Promise<any[]>;

  /**
   * Check cluster connectivity and access
   */
  checkClusterAccess(): Promise<boolean>;

  /**
   * Verify deployment status
   */
  verifyDeployment(options: { namespace: string; name: string }): Promise<any>;

  /**
   * Prepare cluster (create namespaces, etc.)
   */
  prepareCluster(options: { namespace?: string }): Promise<void>;

  /**
   * Initialize the service (async setup)
   */
  initialize(): Promise<void>;
}

/**
 * AI service interface for intelligent assistance
 */
export interface AIService {
  /**
   * Generate Dockerfile from repository analysis
   */
  generateDockerfile(analysis: unknown): Promise<string>;

  /**
   * Enhance Kubernetes manifests with best practices
   */
  enhanceManifests(manifests: any[]): Promise<any[]>;

  /**
   * Analyze repository structure and dependencies
   */
  analyzeRepository(path: string): Promise<any>;

  /**
   * Fix Dockerfile issues
   */
  fixDockerfile(dockerfile: string, issues: string[]): Promise<string>;

  /**
   * Check if AI service is available
   */
  isAvailable(): boolean;

  /**
   * Initialize the service (async setup)
   */
  initialize(): Promise<void>;
}

/**
 * Session service interface for state management
 */
export interface SessionService {
  /**
   * Get session by ID
   */
  get(sessionId: string): Promise<Session | null>;

  /**
   * Create new session
   */
  create(data: Partial<Session>): Promise<Session>;

  /**
   * Update session atomically
   */
  updateAtomic(sessionId: string, updater: (session: Session) => Session): Promise<void>;

  /**
   * Update session data
   */
  update(sessionId: string, data: Partial<Session>): Promise<void>;

  /**
   * Delete session
   */
  delete(sessionId: string): Promise<void>;

  /**
   * Initialize the service (async setup)
   */
  initialize(): Promise<void>;
}

/**
 * Progress emitter interface for workflow tracking
 */
export interface ProgressEmitter {
  /**
   * Emit progress update
   */
  emit(update: {
    sessionId: string;
    step: string;
    status: 'in_progress' | 'completed' | 'failed';
    message: string;
    progress: number;
    data?: unknown;
  }): Promise<void>;
}

/**
 * Core services bundle for dependency injection
 * All services a tool handler might need
 */
export interface CoreServices {
  docker: DockerService;
  kubernetes: KubernetesService;
  ai: AIService;
  session: SessionService;
  logger: Logger;
  progress?: ProgressEmitter;
}

/**
 * Health status for service monitoring
 */
export interface HealthStatus {
  healthy: boolean;
  version?: string;
  info?: unknown;
  error?: string;
}

/**
 * Service initialization result
 */
export interface ServiceStatus {
  initialized: boolean;
  healthy: boolean;
  error?: string;
}
