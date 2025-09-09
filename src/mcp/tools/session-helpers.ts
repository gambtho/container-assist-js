/**
 * Session Helpers Module
 *
 * Provides standardized session management utilities for all tools,
 * ensuring consistent parameter handling and safe session mutations.
 */

import { randomUUID, createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { Result, Success, Failure, WorkflowState } from '../../domain/types.js';
import { createSessionManager, type SessionManager } from '../../lib/session.js';
import type { ExtendedToolContext } from '../../tools/shared-types.js';

/**
 * Options for session resolution
 */
export interface SessionResolutionOptions {
  /** Optional session ID from tool parameters */
  sessionId?: string;
  /** Hint for generating default session ID if needed */
  defaultIdHint?: string;
  /** Whether to create session if it doesn't exist */
  createIfNotExists?: boolean;
}

/**
 * Resolved session information
 */
export interface ResolvedSession {
  /** Session identifier */
  id: string;
  /** Full workflow state */
  state: WorkflowState;
  /** Whether this is a newly created session */
  isNew: boolean;
}

/**
 * Get or create session manager from context
 */
function getSessionManager(logger: Logger, context?: ExtendedToolContext): SessionManager {
  // Check if context has a shared session manager
  if (context && typeof context === 'object' && 'sessionManager' in context) {
    const manager = context.sessionManager;
    if (manager && typeof manager === 'object') {
      logger.debug('Using shared session manager from context');
      return manager;
    }
  }

  // Create a new session manager if not found
  logger.debug('Creating new session manager');
  return createSessionManager(logger);
}

/**
 * Resolve session with smart defaults and optional creation
 *
 * @param logger - Logger instance for debugging
 * @param context - Tool context that may contain session manager
 * @param options - Session resolution options
 * @returns Result with resolved session information
 */
export async function resolveSession(
  logger: Logger,
  context?: ExtendedToolContext,
  options: SessionResolutionOptions = {},
): Promise<Result<ResolvedSession>> {
  const { sessionId, defaultIdHint, createIfNotExists = true } = options;

  try {
    const sessionManager = getSessionManager(logger, context);

    // Determine the session ID to use
    const targetSessionId =
      sessionId || (defaultIdHint ? `session-${defaultIdHint}` : randomUUID());

    logger.info(
      {
        sessionId,
        targetSessionId,
        defaultIdHint,
        createIfNotExists,
      },
      'Resolving session',
    );

    // Try to get existing session
    const existingSession = await sessionManager.get(targetSessionId);

    if (existingSession) {
      logger.info({ sessionId: targetSessionId }, 'Found existing session');
      return Success({
        id: targetSessionId,
        state: existingSession,
        isNew: false,
      });
    }

    // Create new session if allowed
    if (createIfNotExists) {
      logger.info({ sessionId: targetSessionId }, 'Creating new session');
      const newSession = await sessionManager.create(targetSessionId);
      return Success({
        id: targetSessionId,
        state: newSession,
        isNew: true,
      });
    }

    // Session not found and creation not allowed
    return Failure(
      `Session ${targetSessionId} not found. Run analyze-repo or provide an existing sessionId.`,
    );
  } catch (error) {
    logger.error({ error }, 'Failed to resolve session');
    return Failure(
      `Failed to resolve session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Append a completed step to session state
 *
 * @param sessionId - Session identifier
 * @param stepName - Name of the completed step
 * @param logger - Logger instance
 * @param context - Tool context with session manager
 * @returns Result indicating success or failure
 */
export async function appendCompletedStep(
  sessionId: string,
  stepName: string,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<WorkflowState>> {
  try {
    const sessionManager = getSessionManager(logger, context);

    // Get current session
    const currentSession = await sessionManager.get(sessionId);
    if (!currentSession) {
      return Failure(`Session ${sessionId} not found`);
    }

    // Append step to completed_steps array
    const updatedSteps = [...(currentSession.completed_steps || [])];
    if (!updatedSteps.includes(stepName)) {
      updatedSteps.push(stepName);
    }

    // Update session
    await sessionManager.update(sessionId, {
      completed_steps: updatedSteps,
      current_step: stepName,
      updatedAt: new Date(),
    });

    logger.info(
      { sessionId, stepName, totalSteps: updatedSteps.length },
      'Appended completed step',
    );

    // Return updated session
    const updatedSession = await sessionManager.get(sessionId);
    if (!updatedSession) {
      return Failure(`Session ${sessionId} lost after update`);
    }

    return Success(updatedSession);
  } catch (error) {
    logger.error({ error, sessionId, stepName }, 'Failed to append completed step');
    return Failure(
      `Failed to append step: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Set workflow manifests in session
 *
 * @param sessionId - Session identifier
 * @param manifests - Generated manifests to store
 * @param logger - Logger instance
 * @param context - Tool context with session manager
 * @returns Result indicating success or failure
 */
export async function setWorkflowManifests(
  sessionId: string,
  manifests: Record<string, unknown>,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<WorkflowState>> {
  try {
    const sessionManager = getSessionManager(logger, context);

    // Get current session
    const currentSession = await sessionManager.get(sessionId);
    if (!currentSession) {
      return Failure(`Session ${sessionId} not found`);
    }

    // Update session with manifests in metadata
    await sessionManager.update(sessionId, {
      metadata: {
        ...currentSession.metadata,
        manifests,
      },
      updatedAt: new Date(),
    });

    logger.info(
      { sessionId, manifestCount: Object.keys(manifests).length },
      'Set workflow manifests',
    );

    // Return updated session
    const updatedSession = await sessionManager.get(sessionId);
    if (!updatedSession) {
      return Failure(`Session ${sessionId} lost after update`);
    }

    return Success(updatedSession);
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to set workflow manifests');
    return Failure(
      `Failed to set manifests: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get current session state safely
 *
 * @param sessionId - Session identifier
 * @param logger - Logger instance
 * @param context - Tool context with session manager
 * @returns Result with session state or error
 */
export async function getSessionState(
  sessionId: string,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<WorkflowState>> {
  try {
    const sessionManager = getSessionManager(logger, context);
    const session = await sessionManager.get(sessionId);

    if (!session) {
      return Failure(`Session ${sessionId} not found`);
    }

    return Success(session);
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to get session state');
    return Failure(
      `Failed to get session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Update arbitrary session data
 *
 * @param sessionId - Session identifier
 * @param updates - Partial updates to apply
 * @param logger - Logger instance
 * @param context - Tool context with session manager
 * @returns Result with updated session state
 */
export async function updateSessionData(
  sessionId: string,
  updates: Partial<WorkflowState> & Record<string, unknown>,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<WorkflowState>> {
  try {
    const sessionManager = getSessionManager(logger, context);

    // Get current session
    const currentSession = await sessionManager.get(sessionId);
    if (!currentSession) {
      return Failure(`Session ${sessionId} not found`);
    }

    // Apply updates with proper merging
    const mergedUpdates: Partial<WorkflowState> = {
      ...updates,
      metadata: {
        ...currentSession.metadata,
        ...(updates.metadata || {}),
      },
      updatedAt: new Date(),
    };

    await sessionManager.update(sessionId, mergedUpdates);

    logger.info(
      {
        sessionId,
        updatedKeys: Object.keys(updates),
        hasMetadata: !!updates.metadata,
      },
      'Updated session data',
    );

    // Return updated session
    const updatedSession = await sessionManager.get(sessionId);
    if (!updatedSession) {
      return Failure(`Session ${sessionId} lost after update`);
    }

    // Merge any additional properties that aren't in WorkflowState
    const fullSession = { ...updatedSession } as WorkflowState & Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      if (!(key in updatedSession)) {
        fullSession[key] = value;
      }
    }

    return Success(fullSession as WorkflowState);
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to update session data');
    return Failure(
      `Failed to update session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Clear session errors
 *
 * @param sessionId - Session identifier
 * @param logger - Logger instance
 * @param context - Tool context with session manager
 * @returns Result indicating success or failure
 */
export async function clearSessionErrors(
  sessionId: string,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<WorkflowState>> {
  try {
    const sessionManager = getSessionManager(logger, context);

    await sessionManager.update(sessionId, {
      errors: {},
      updatedAt: new Date(),
    });

    logger.info({ sessionId }, 'Cleared session errors');

    // Return updated session
    const updatedSession = await sessionManager.get(sessionId);
    if (!updatedSession) {
      return Failure(`Session ${sessionId} lost after update`);
    }

    return Success(updatedSession);
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to clear session errors');
    return Failure(
      `Failed to clear errors: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Add an error to session state
 *
 * @param sessionId - Session identifier
 * @param errorKey - Key for the error (e.g., step name)
 * @param errorMessage - Error message to store
 * @param logger - Logger instance
 * @param context - Tool context with session manager
 * @returns Result indicating success or failure
 */
export async function addSessionError(
  sessionId: string,
  errorKey: string,
  errorMessage: string,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<WorkflowState>> {
  try {
    const sessionManager = getSessionManager(logger, context);

    // Get current session
    const currentSession = await sessionManager.get(sessionId);
    if (!currentSession) {
      return Failure(`Session ${sessionId} not found`);
    }

    // Add error to errors map
    await sessionManager.update(sessionId, {
      errors: {
        ...(currentSession.errors || {}),
        [errorKey]: errorMessage,
      },
      updatedAt: new Date(),
    });

    logger.info({ sessionId, errorKey }, 'Added session error');

    // Return updated session
    const updatedSession = await sessionManager.get(sessionId);
    if (!updatedSession) {
      return Failure(`Session ${sessionId} lost after update`);
    }

    return Success(updatedSession);
  } catch (error) {
    logger.error({ error, sessionId, errorKey }, 'Failed to add session error');
    return Failure(
      `Failed to add error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Generate a deterministic session ID from input data
 * Useful for creating predictable session IDs based on parameters
 *
 * @param data - Data to hash for ID generation
 * @returns Deterministic session ID
 */
export function computeSessionHash(data: unknown): string {
  // Sort keys for consistent hashing
  const sortedData =
    typeof data === 'object' && data !== null
      ? JSON.stringify(data, Object.keys(data).sort())
      : JSON.stringify(data);
  const hash = createHash('sha256').update(sortedData).digest('hex');
  return hash.substring(0, 8); // Use first 8 chars for brevity
}
