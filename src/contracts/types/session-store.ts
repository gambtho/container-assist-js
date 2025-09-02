/**
 * Session store interface and related types
 * Defines the contract for session persistence implementations
 */

import { Session } from './session';

/**
 * Filter options for listing sessions
 */
export interface SessionFilter {
  status?: Session['status'];
  createdAfter?: Date;
  createdBefore?: Date;
  labels?: Record<string, string>;
  stage?: string;
  limit?: number;
}

/**
 * Session store interface - can be implemented by different backends
 */
export interface SessionStore {
  // Basic CRUD operations
  create(session: Session): Promise<void>;
  get(id: string): Promise<Session | null>;
  update(id: string, session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  list(filter?: SessionFilter): Promise<Session[]>;

  // Atomic operations for concurrent safety
  updateAtomic(id: string, updater: (current: Session) => Session): Promise<void>;

  // Bulk operations
  createBatch(sessions: Session[]): Promise<void>;
  deleteExpired(): Promise<number>;

  // Query operations
  getActiveCount(): Promise<number>;
  getByStatus(status: Session['status']): Promise<Session[]>;
  getRecentlyUpdated(limit: number): Promise<Session[]>;

  // Maintenance
  close(): Promise<void>;
  vacuum(): Promise<void>;
}

/**
 * Session service error types
 */
export class SessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Session ${id} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionAlreadyExistsError extends Error {
  constructor(id: string) {
    super(`Session ${id} already exists`);
    this.name = 'SessionAlreadyExistsError';
  }
}

export class OptimisticLockError extends Error {
  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic lock failed for session ${id}: expected version ${expectedVersion}, got ${actualVersion}`
    );
    this.name = 'OptimisticLockError';
  }
}

export class SessionExpiredError extends Error {
  constructor(id: string) {
    super(`Session ${id} has expired`);
    this.name = 'SessionExpiredError';
  }
}
