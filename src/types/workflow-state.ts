// Workflow state utilities - simplified

export type { WorkflowState } from './session';

export function updateWorkflowState(
  state: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return { ...state, ...updates };
}
