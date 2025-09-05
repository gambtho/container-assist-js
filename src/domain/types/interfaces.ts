/**
 * Domain service interfaces - Abstract contracts for cross-boundary communication
 * These interfaces define what the domain needs without depending on implementation details
 */

import { Session } from './session';

export type Result<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface ProgressUpdate {
  sessionId: string;
  step: string;
  status: 'starting' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ProgressListener {
  onProgress(update: ProgressUpdate): void | Promise<void>;
}

export interface ProgressFilter {
  sessionId?: string;
  step?: string;
  status?: ProgressUpdate['status'];
  since?: Date;
  limit?: number;
}

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

export interface SessionStore {
  create(session: Session): Promise<Result<Session>>;
  get(sessionId: string): Promise<Result<Session>>;
  update(session: Session): Promise<Result<Session>>;
  delete(sessionId: string): Promise<Result<void>>;
  list(): Promise<Result<Session[]>>;
  findByStatus(status: string): Promise<Result<Session[]>>;
  cleanup(olderThan: Date): Promise<Result<number>>;
}

export interface FileSystem {
  readFile(path: string): Promise<Result<string>>;
  writeFile(path: string, content: string): Promise<Result<void>>;
  exists(path: string): Promise<Result<boolean>>;
  mkdir(path: string, recursive?: boolean): Promise<Result<void>>;
  readdir(path: string): Promise<Result<string[]>>;
  stat(
    path: string,
  ): Promise<Result<{ isFile(): boolean; isDirectory(): boolean; size: number; mtime: Date }>>;
  copy(src: string, dest: string): Promise<Result<void>>;
  remove(path: string): Promise<Result<void>>;
}

export interface CommandExecutor {
  execute(
    command: string,
    args?: string[],
    options?: unknown,
  ): Promise<
    Result<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>
  >;
  spawn(
    command: string,
    args?: string[],
    options?: unknown,
  ): Promise<Result<{ pid: number; kill: (signal?: string) => boolean }>>;
}

export type EventHandler<T = unknown> = (data: T) => void;

export interface EventPublisher {
  publish<T = unknown>(eventType: string, data: T): void;
  subscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void;
  unsubscribe<T = unknown>(eventType: string, handler: EventHandler<T>): void;
  removeAllSubscribers(eventType?: string): void;
  getSubscriberCount(eventType: string): number;
}

export interface Configuration {
  get<T>(key: string): T;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  getAll(): Record<string, unknown>;
  validate(): Result<void>;
}
