/**
 * Shared Session Types and Utilities
 * Common interfaces and types used across session management
 */

import type { Session } from '../../domain/types/index';

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
export interface SessionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    executionTime: number;
    operationType: string;
  };
}

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
   * Check if session has expired
   * Supports both ISO string and timestamp formats
   */
  static isExpired(session: Session): boolean {
    if (session.expires_at == null || session.expires_at === '') {
      return false;
    }

    // Handle both ISO string and timestamp formats
    let expirationTime: number;
    if (typeof session.expires_at === 'string') {
      // ISO string format
      expirationTime = new Date(session.expires_at).getTime();
    } else if (typeof session.expires_at === 'number') {
      // Timestamp format
      expirationTime = session.expires_at;
    } else {
      // Unknown format, assume not expired
      return false;
    }

    return expirationTime < Date.now();
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
      backup: true,
    };
  }

  /**
   * Create session metadata
   */
  static createMetadata(userId?: string, tags?: string[]): SessionMetadata {
    const result: SessionMetadata = {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
    };

    if (userId != null && userId !== '') {
      result.userId = userId;
    }

    if (tags && tags.length > 0) {
      result.tags = tags;
    }

    return result;
  }

  /**
   * Calculate session progress based on workflow state
   */
  static calculateProgress(session: Session): { current: number; total: number } {
    // Define the standard workflow steps
    const WORKFLOW_STEPS = [
      'analysis',
      'base_images',
      'dockerfile',
      'build',
      'scan',
      'tag',
      'push',
      'k8s_manifests',
      'deployment',
      'verification',
    ];

    // If no session or workflow_state, return initial state
    if (
      session == null ||
      typeof session !== 'object' ||
      !('workflow_state' in session) ||
      session.workflow_state == null
    ) {
      return { current: 0, total: WORKFLOW_STEPS.length };
    }

    const workflowState = session.workflow_state as Record<string, unknown>;
    let completedSteps = 0;

    // Check each step for completion based on result presence
    if (workflowState.analysis_result != null) completedSteps++;
    if (
      workflowState.base_images_result != null ||
      (workflowState.dockerfile_result != null &&
        typeof workflowState.dockerfile_result === 'object' &&
        'base_image' in workflowState.dockerfile_result)
    )
      completedSteps++;
    if (workflowState.dockerfile_result != null) completedSteps++;
    if (workflowState.build_result != null) completedSteps++;
    if (workflowState.scan_result != null) completedSteps++;
    if (workflowState.tag_result != null) completedSteps++;
    if (workflowState.push_result != null) completedSteps++;
    if (workflowState.k8s_result != null) completedSteps++;
    if (workflowState.deployment_result != null) completedSteps++;
    if (workflowState.verification_result != null) completedSteps++;

    // Alternative: Use completed_steps array if available
    if (workflowState.completed_steps != null && Array.isArray(workflowState.completed_steps)) {
      // Use the maximum of explicit completed steps and detected results
      completedSteps = Math.max(completedSteps, workflowState.completed_steps.length);
    }

    return {
      current: Math.min(completedSteps, WORKFLOW_STEPS.length),
      total: WORKFLOW_STEPS.length,
    };
  }

  /**
   * Get current workflow stage
   */
  static getCurrentStage(workflowState: unknown): string {
    // Handle WorkflowState type
    if (typeof workflowState === 'object' && workflowState !== null) {
      const state = workflowState as Record<string, unknown>;
      if (state.current_step != null) {
        return String(state.current_step);
      }
      if (state.stage != null) {
        return String(state.stage);
      }
    }
    return 'pending';
  }

  /**
   * Update session status based on workflow state
   */
  static updateSessionStatus(
    session: Session | Record<string, unknown>,
    status?: string,
  ): Session | Record<string, unknown> {
    if (status != null && status.length > 0) {
      if (typeof session === 'object' && session != null) {
        (session as Record<string, unknown>).status = status;
      }
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
  ID_PREFIX: 'session_',
} as const;

/**
 * Session error types
 */
export class SessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly sessionId?: string,
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
