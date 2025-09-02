/**
 * Property mapping utilities for workflow state compatibility
 * Handles the property naming inconsistencies between snake_case and camelCase
 */

import type { WorkflowState, AnalysisResult, DockerBuildResult, Session, DeploymentResult } from '../../domain/types/index.js'

/**
 * Maps workflow state properties to handle naming inconsistencies
 */
export function mapWorkflowStateProperties(state: Partial<WorkflowState>): {
  repoPath: string | undefined
  namespace: string
  analysisResult: AnalysisResult | undefined
  buildResult: DockerBuildResult | undefined
  deploymentName: string | undefined
  deploymentNamespace: string | undefined
  projectName: string | undefined
  imageTag: string | undefined
} {
  // Use the actual property names from WorkflowState type
  return {
    repoPath: state.analysis_result?.language != null &&
      state.analysis_result.language.trim() !== '' ? 'unknown' : undefined, // AnalysisResult doesn't have repo_path
    namespace: state.deployment_result?.namespace ?? 'default',
    analysisResult: state.analysis_result,
    buildResult: state.build_result as DockerBuildResult | undefined,
    deploymentName: state.deployment_result?.deployment_name,
    deploymentNamespace: state.deployment_result?.namespace ?? 'default',
    projectName: state.analysis_result?.framework ?? 'unknown', // Use framework as project name proxy
    imageTag: state.tag_result?.tags?.[0] ?? state.build_result?.tags?.[0]
  }
}

/**
 * Maps session property names for compatibility
 */
export function mapSessionProperties(session: Session): {
  workflowState: WorkflowState
  analysisResult: AnalysisResult | undefined
  buildResult: DockerBuildResult | undefined
} {
  return {
    workflowState: session.workflow_state,
    analysisResult: session.workflow_state.analysis_result,
    buildResult: session.workflow_state.build_result as DockerBuildResult | undefined
  }
}

/**
 * Normalizes property names in workflow state updates
 */
export function normalizeWorkflowStateUpdate(
  update: Partial<WorkflowState> & { last_completed_step?: string }
): Partial<WorkflowState> {
  const normalized: Partial<WorkflowState> & { last_completed_step?: string } = { ...update }

  // Handle last_completed_step -> completed_steps
  if ('last_completed_step' in normalized && normalized.last_completed_step) {
    if (!normalized.completed_steps) {
      normalized.completed_steps = []
    }
    if (!normalized.completed_steps.includes(normalized.last_completed_step!)) {
      normalized.completed_steps.push(normalized.last_completed_step!)
    }
    delete normalized.last_completed_step
  }

  // Ensure required properties exist with proper types
  if (!normalized.completed_steps) {
    normalized.completed_steps = []
  }
  if (!normalized.errors) {
    normalized.errors = {}
  }
  if (!normalized.metadata) {
    normalized.metadata = {}
  }

  const { last_completed_step: _lastCompletedStep, ...result } = normalized
  return result
}

/**
 * Gets the current step from workflow state
 */
export function getCurrentStep(state: WorkflowState): string | null {
  if (state.current_step !== undefined && state.current_step !== null) {
    return state.current_step
  }

  // Fallback to last completed step
  if (state.completed_steps.length > 0) {
    return state.completed_steps[state.completed_steps.length - 1] ?? null
  }

  return null
}

/**
 * Safely gets analysis result from session or state
 */
type WorkflowEntity = Session | WorkflowState | Partial<WorkflowState>

export function getAnalysisResult(sessionOrState: WorkflowEntity): AnalysisResult | null {
  // Check if it's a session object
  if ('workflow_state' in sessionOrState && sessionOrState.workflow_state != null) {
    const session = sessionOrState
    return session.workflow_state.analysis_result ?? null
  }

  // Check if it's already a workflow state with analysis_result
  if ('analysis_result' in sessionOrState && sessionOrState.analysis_result) {
    return sessionOrState.analysis_result
  }

  return null
}

/**
 * Safely gets build result from session or state
 */
export function getBuildResult(sessionOrState: WorkflowEntity): DockerBuildResult | null {
  // Check if it's a session object
  if ('workflow_state' in sessionOrState && sessionOrState.workflow_state != null) {
    const session = sessionOrState
    return (session.workflow_state.build_result as DockerBuildResult | undefined) ?? null
  }

  // Check if it's already a workflow state with build_result
  if ('build_result' in sessionOrState && sessionOrState.build_result) {
    return sessionOrState.build_result as DockerBuildResult
  }

  return null
}

/**
 * Safely gets deployment result from session or state
 */
export function getDeploymentResult(sessionOrState: WorkflowEntity): DeploymentResult | null {
  // Check if it's a session object
  if ('workflow_state' in sessionOrState && sessionOrState.workflow_state != null) {
    const session = sessionOrState
    return session.workflow_state.deployment_result ?? null
  }

  // Check if it's already a workflow state with deployment_result
  if ('deployment_result' in sessionOrState && sessionOrState.deployment_result) {
    return sessionOrState.deployment_result
  }

  return null
}



