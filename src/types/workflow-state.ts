/**
 * Simple WorkflowState - De-Enterprise Refactoring
 *
 * Replaces Zod schema inference with direct type usage
 */

import type { WorkflowState } from './session.js';

// Re-export for compatibility
export type { WorkflowState };

// Simple helper functions
export const createWorkflowState = (partial: Partial<WorkflowState> = {}): WorkflowState => ({
  metadata: {},
  completed_steps: [],
  errors: {},
  current_step: null,
  ...partial,
});

export const updateWorkflowState = (
  current: WorkflowState | undefined,
  updates: Partial<WorkflowState>,
): WorkflowState => ({
  ...current,
  ...updates,
  metadata: { ...current?.metadata, ...updates.metadata },
  completed_steps: updates.completed_steps ?? current?.completed_steps ?? [],
  errors: { ...current?.errors, ...updates.errors },
  current_step:
    updates.current_step !== undefined ? updates.current_step : (current?.current_step ?? null),
});
