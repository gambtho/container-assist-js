/**
 * Session utility functions
 */

import {
  Session,
  WorkflowState,
  SessionSchema,
  WorkflowStep,
  getWorkflowSteps,
} from '../../contracts/types/session.js';
import { randomBytes } from 'crypto';

export class SessionUtils {
  /**
   * Generate a unique session ID
   */
  static generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `ses_${timestamp}_${random}`;
  }

  /**
   * Create a new session with defaults
   */
  static createSession(repoPath: string, partial?: Partial<Session>): Session {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    const session: Session = {
      id: SessionUtils.generateId(),
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
      status: 'active',
      repo_path: repoPath,
      version: 0,
      workflow_state: {
        current_step: null,
        completed_steps: [],
        errors: {},
        metadata: {},
        dockerfile_fix_history: [],
      },
      ...partial,
    };

    // Validate the session
    return SessionSchema.parse(session);
  }

  /**
   * Check if session is expired
   */
  static isExpired(session: Session): boolean {
    if (!session.expires_at) return false;
    return new Date(session.expires_at) < new Date();
  }

  /**
   * Calculate workflow progress
   */
  static calculateProgress(state: WorkflowState): {
    current: number;
    total: number;
    percentage: number;
  } {
    const allSteps = getWorkflowSteps();
    const completed = state.completed_steps?.length ?? 0;

    return {
      current: completed,
      total: allSteps.length,
      percentage: Math.round((completed / allSteps.length) * 100),
    };
  }

  /**
   * Get current workflow stage from state
   */
  static getCurrentStage(state: WorkflowState): string {
    const stageMap: Record<string, string> = {
      analysis_result: 'analysis',
      dockerfile_result: 'dockerfile_generation',
      build_result: 'image_building',
      scan_result: 'security_scanning',
      tag_result: 'image_tagging',
      push_result: 'registry_push',
      k8s_result: 'k8s_generation',
      cluster_result: 'cluster_preparation',
      deployment_result: 'deployment',
      verification_result: 'verification',
    };

    // Find the last completed stage
    for (const [key, stage] of Object.entries(stageMap).reverse()) {
      if (state[key as keyof WorkflowState] !== undefined) {
        return stage;
      }
    }

    if (state.current_step) {
      const stepToStage: Record<string, string> = {
        [WorkflowStep.ANALYZE]: 'analysis',
        [WorkflowStep.GENERATE_DOCKERFILE]: 'dockerfile_generation',
        [WorkflowStep.BUILD_IMAGE]: 'image_building',
        [WorkflowStep.SCAN_IMAGE]: 'security_scanning',
        [WorkflowStep.TAG_IMAGE]: 'image_tagging',
        [WorkflowStep.PUSH_IMAGE]: 'registry_push',
        [WorkflowStep.GENERATE_K8S]: 'k8s_generation',
        [WorkflowStep.PREPARE_CLUSTER]: 'cluster_preparation',
        [WorkflowStep.DEPLOY]: 'deployment',
        [WorkflowStep.VERIFY]: 'verification',
      };
      return stepToStage[state.current_step] ?? 'initialized';
    }

    return 'initialized';
  }

  /**
   * Merge workflow states (for updates)
   */
  static mergeWorkflowState(current: WorkflowState, update: Partial<WorkflowState>): WorkflowState {
    // Deep merge, preserving arrays
    const merged = {
      ...current,
      ...update,
    };

    // Special handling for arrays to avoid overwriting
    if (update.completed_steps && current.completed_steps) {
      // Merge completed steps
      const allSteps = new Set([...current.completed_steps, ...update.completed_steps]);
      merged.completed_steps = Array.from(allSteps);
    }

    // Merge errors
    if (update.errors && current.errors) {
      merged.errors = {
        ...current.errors,
        ...update.errors,
      };
    }

    // Merge metadata
    if (update.metadata && current.metadata) {
      merged.metadata = {
        ...current.metadata,
        ...update.metadata,
      };
    }

    return merged;
  }

  /**
   * Mark a step as completed
   */
  static markStepCompleted(session: Session, step: string): Session {
    const completedSteps = session.workflow_state.completed_steps ?? [];

    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }

    return {
      ...session,
      workflow_state: {
        ...session.workflow_state,
        completed_steps: completedSteps,
        current_step: null,
      },
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Set the current step
   */
  static setCurrentStep(session: Session, step: string | null): Session {
    return {
      ...session,
      workflow_state: {
        ...session.workflow_state,
        current_step: step,
      },
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Add an error for a step
   */
  static addStepError(session: Session, step: string, error: Error | string): Session {
    const errorMessage = error instanceof Error ? error.message : error;

    return {
      ...session,
      workflow_state: {
        ...session.workflow_state,
        errors: {
          ...session.workflow_state.errors,
          [step]: errorMessage,
        },
      },
      status: 'failed',
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Update session status based on workflow state
   */
  static updateSessionStatus(session: Session): Session {
    const state = session.workflow_state;
    const allSteps = getWorkflowSteps();

    // Check if failed
    if (state.errors && Object.keys(state.errors).length > 0) {
      return { ...session, status: 'failed' };
    }

    // Check if completed
    if (state.completed_steps?.length === allSteps.length) {
      return { ...session, status: 'completed' };
    }

    if (state.current_step) {
      if (state.current_step.includes('analyze')) {
        return { ...session, status: 'analyzing' };
      }
      if (state.current_step.includes('build') || state.current_step.includes('dockerfile')) {
        return { ...session, status: 'building' };
      }
      if (state.current_step.includes('deploy') || state.current_step.includes('k8s')) {
        return { ...session, status: 'deploying' };
      }
    }

    return { ...session, status: 'active' };
  }
}
