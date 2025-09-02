/**
 * Domain service interfaces - Abstract contracts for cross-boundary communication
 * These interfaces define what the domain needs without depending on implementation details
 */

import { Session } from './session';

// Simple Result type for legacy compatibility
export type Result<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Progress update structure (aligned with infrastructure)
export interface ProgressUpdate {
  sessionId: string;
  step: string;
  status: 'starting' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// Progress listener interface
export interface ProgressListener {
  onProgress(update: ProgressUpdate): void | Promise<void>;
}

// Progress filter interface
export interface ProgressFilter {
  sessionId?: string;
  step?: string;
  status?: ProgressUpdate['status'];
  since?: Date;
  limit?: number;
}

// Progress emitter interface for workflow tracking (DEPRECATED - Phase 5)
// Being replaced with callback-based progress reporting
// @deprecated Use ProgressCallback from application/workflow/types.ts instead
export interface ProgressEmitter {
  emit(update: Partial<ProgressUpdate>): Promise<void>;
  addListener(listener: ProgressListener): void;
  removeListener(listener: ProgressListener): void;
  getHistory(sessionId: string, filter?: ProgressFilter): ProgressUpdate[];
  getCurrentProgress(sessionId: string): {
    currentStep?: string;
    progress: number;
    completedSteps: string[];
    failedSteps: string[];
  };
  shutdown(): void;
}

export interface ProgressData {
  step: string;
  progress: number;
  total: number;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// NOTE: RepositoryAnalyzer interface removed
// Had single implementation, replaced by concrete RepoAnalyzer class

// NOTE: DockerService, BuildService, and ScanningService interfaces removed
// These had single implementations and are replaced by concrete classes:
// - DockerService -> DockerService class in src/services/docker.ts
// - BuildService -> Functionality merged into DockerService
// - ScanningService -> Functionality merged into DockerService

// Session store interface - domain contract
export interface SessionStore {
  create(session: Session): Promise<Result<Session>>;
  get(sessionId: string): Promise<Result<Session>>;
  update(session: Session): Promise<Result<Session>>;
  delete(sessionId: string): Promise<Result<void>>;
  list(): Promise<Result<Session[]>>;
  findByStatus(status: string): Promise<Result<Session[]>>;
  cleanup(olderThan: Date): Promise<Result<number>>;
}

// NOTE: WorkflowManager, AIService, and KubernetesService interfaces removed
// These had single implementations and are replaced by concrete classes:
// - WorkflowManager -> WorkflowOrchestrator class in src/application/workflow/orchestrator.ts
// - AIService -> AIService class in src/services/ai.ts
// - KubernetesService -> KubernetesService class in src/services/kubernetes.ts

// File system interface - domain contract
export interface FileSystem {
  readFile(path: string): Promise<Result<string>>;
  writeFile(path: string, content: string): Promise<Result<void>>;
  exists(path: string): Promise<Result<boolean>>;
  mkdir(path: string, recursive?: boolean): Promise<Result<void>>;
  readdir(path: string): Promise<Result<string[]>>;
  stat(path: string): Promise<Result<any>>;
  copy(src: string, dest: string): Promise<Result<void>>;
  remove(path: string): Promise<Result<void>>;
}

// Command executor interface - domain contract
export interface CommandExecutor {
  execute(
    command: string,
    args?: string[],
    options?: unknown
  ): Promise<
    Result<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>
  >;
  spawn(command: string, args?: string[], options?: unknown): Promise<Result<any>>;
}

// Event handler type
export type EventHandler<T = any> = (data: T) => void;

// Event publisher interface - aligned with infrastructure
export interface EventPublisher {
  publish<T = any>(eventType: string, data: T): void;
  subscribe<T = any>(eventType: string, handler: EventHandler<T>): void;
  unsubscribe<T = any>(eventType: string, handler: EventHandler<T>): void;
  removeAllSubscribers(eventType?: string): void;
  getSubscriberCount(eventType: string): number;
}

// Configuration interface - domain contract
export interface Configuration {
  get<T>(key: string): T;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  getAll(): Record<string, any>;
  validate(): Result<void>;
}

// NOTE: MetricsService, CacheService, RegistryService, and BaseService interfaces removed
// These were over-engineered abstractions not needed for current implementation:
// - MetricsService -> Simple logging used instead
// - CacheService -> Not currently implemented
// - RegistryService -> Registry operations handled by DockerService
// - BaseService -> Eliminated inheritance pattern, use composition
