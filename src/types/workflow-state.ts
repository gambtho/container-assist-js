/**
 * WorkflowState type definition for session management
 * This provides the structure expected by session.update()
 */

import type { z } from 'zod';
import type { WorkflowStateSchema } from './session';

// Infer the type from the schema
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/**
 * Helper function to create a valid WorkflowState object
 * Ensures required fields are present
 */
export function createWorkflowState(partial: Partial<WorkflowState> = {}): WorkflowState {
  return {
    metadata: partial.metadata ?? {},
    completed_steps: partial.completed_steps ?? [],
    errors: partial.errors ?? {},
    current_step: partial.current_step ?? null,
    ...partial,
  };
}

/**
 * Helper function to update workflow state immutably
 */
export function updateWorkflowState(
  current: unknown,
  updates: Partial<WorkflowState>,
): WorkflowState {
  const base = (current as WorkflowState | undefined) ?? createWorkflowState();
  return {
    ...base,
    ...updates,
    metadata: {
      ...base.metadata,
      ...(updates.metadata ?? {}),
    },
    completed_steps: updates.completed_steps ?? base.completed_steps,
    errors: {
      ...base.errors,
      ...(updates.errors ?? {}),
    },
  };
}
