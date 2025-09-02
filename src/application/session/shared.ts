/**
 * Shared Session Types and Utilities
 * Common interfaces and types used across session management
 */

import type { WorkflowState, Session } from '../../contracts/types/index';

/**
 * Session metadata
 */
export interface SessionMetadata {
  createdAt: Date;
  updatedAt: Date;
  version: string;
  userId?: string;
  tags?: string[];
}

/**
 * Session configuration options
 */
export interface SessionConfig {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum session data size
  compression?: boolean;
  encryption?: boolean;
  backup?: boolean;
}

/**
 * Session data structure
 */
export interface SessionData {
  id: string;
  metadata: SessionMetadata;
  config: SessionConfig;
  state: WorkflowState;
  data: Record<string, any>;
}

/**
 * Session update operation
 */
export interface SessionUpdate {
  id: string;
  updates: Partial<SessionData>;
  merge?: boolean; // Whether to merge or replace
}

/**
 * Session query options
 */
export interface SessionQuery {
  id?: string;
  userId?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Session operation result
 */
export interface SessionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    operationType: string;
  };
}

/**
 * Session event types
 */
export type SessionEvent =
  | { type: 'created'; sessionId: string; data: SessionData }
  | { type: 'updated'; sessionId: string; changes: Partial<SessionData> }
  | { type: 'deleted'; sessionId: string }
  | { type: 'expired'; sessionId: string };

/**
 * Session listener callback
 */
export type SessionEventListener = (event: SessionEvent) => void;

/**
 * Common session utilities
 */
export class SessionUtils {
  /**
   * Generate a unique session ID
   */
  static generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate session data
   */
  static isValidSessionData(data: unknown): data is SessionData {
    return (
      typeof data === 'object' &&
      typeof data.id === 'string' &&
      data.metadata &&
      typeof data.metadata.createdAt !== 'undefined' &&
      data.state
    );
  }

  /**
   * Calculate session age
   */
  static getSessionAge(session: SessionData): number {
    return Date.now() - session.metadata.createdAt.getTime();
  }

  /**
   * Check if session has expired
   */
  static isExpired(session: Session | SessionData): boolean {
    // Handle Session type (from contracts/types/session.ts)
    if ('expires_at' in session) {
      if (!session.expires_at) {
        return false;
      }
      return new Date(session.expires_at).getTime() < Date.now();
    }

    // Handle SessionData type (legacy)
    const sessionData = session as SessionData;
    if (!sessionData.config?.ttl) {
      return false;
    }

    return SessionUtils.getSessionAge(sessionData) > sessionData.config.ttl;
  }

  /**
   * Merge session data
   */
  static mergeSessionData(existing: SessionData, updates: Partial<SessionData>): SessionData {
    return {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      },
      config: {
        ...existing.config,
        ...updates.config
      },
      state: {
        ...existing.state,
        ...updates.state
      },
      data: {
        ...existing.data,
        ...updates.data
      }
    };
  }

  /**
   * Create default session config
   */
  static createDefaultConfig(): SessionConfig {
    return {
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      maxSize: 10 * 1024 * 1024, // 10MB
      compression: true,
      encryption: false,
      backup: true
    };
  }

  /**
   * Create session metadata
   */
  static createMetadata(userId?: string, tags?: string[]): SessionMetadata {
    const result: SessionMetadata = {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    };

    if (userId) {
      result.userId = userId;
    }

    if (tags && tags.length > 0) {
      result.tags = tags;
    }

    return result;
  }

  /**
   * Calculate session progress
   */
  static calculateProgress(_session: unknown): { current: number; total: number } {
    // Stub implementation - session parameter will be used in future
    return { current: 0, total: 100 };
  }

  /**
   * Get current workflow stage
   */
  static getCurrentStage(workflowState: unknown): string {
    // Handle WorkflowState type
    if (workflowState?.current_step) {
      return workflowState.current_step;
    }
    return workflowState?.stage ?? 'pending';
  }

  /**
   * Update session status based on workflow state
   */
  static updateSessionStatus(session: Session | any, status?: string): Session | any {
    if (status && status.length > 0) {
      session.status = status;
    }
    return session;
  }
}

/**
 * Session constants
 */
export const SESSION_CONSTANTS = {
  DEFAULT_TTL: 24 * 60 * 60 * 1000, // 24 hours
  MAX_SESSION_SIZE: 10 * 1024 * 1024, // 10MB
  CLEANUP_INTERVAL: 60 * 60 * 1000, // 1 hour
  MAX_SESSIONS_PER_USER: 10,
  ID_PREFIX: 'session_'
} as const;

/**
 * Session error types
 */
export class SessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly sessionId?: string
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND', sessionId);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionExpiredError extends SessionError {
  constructor(sessionId: string) {
    super(`Session expired: ${sessionId}`, 'SESSION_EXPIRED', sessionId);
    this.name = 'SessionExpiredError';
  }
}

export class SessionSizeLimitError extends SessionError {
  constructor(sessionId: string, size: number, limit: number) {
    super(`Session size ${size} exceeds limit ${limit}`, 'SESSION_SIZE_LIMIT', sessionId);
    this.name = 'SessionSizeLimitError';
  }
}
