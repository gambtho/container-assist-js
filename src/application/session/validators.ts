/**
 * Session data validator utilities for Team 4 improvements
 * Provides safe access to session workflow state
 */

import type { Session, AnalysisResult, DockerBuildResult } from '../../contracts/types/index.js';

/**
 * Get analysis result from session workflow state
 * @param session The session object
 * @returns Analysis result or null if not available
 */
export function getSessionAnalysis(session: Session): AnalysisResult | null {
  return session.workflow_state?.analysis_result ?? null;
}

/**
 * Get build result from session workflow state
 * @param session The session object
 * @returns Build result or null if not available
 */
export function getSessionBuildResult(session: Session): DockerBuildResult | null {
  const buildResult = session.workflow_state?.build_result;
  if (!buildResult) return null;

  // Type for the build result from workflow state
  interface WorkflowBuildResult {
    image_id?: string;
    imageId?: string;
    tags?: string[];
    image_tag?: string;
    logs?: string[];
    size_bytes?: number;
    size?: number;
    layers?: number | any[]; // Can be number or array from different sources
    build_duration_ms?: number;
    buildTime?: number;
    success?: boolean;
  }

  const result = buildResult as WorkflowBuildResult;

  // Transform snake_case properties to camelCase to match DockerBuildResult interface
  // Handle layers - convert array length to number if needed
  const layersValue = result.layers;
  const layersCount = Array.isArray(layersValue) ? layersValue.length : layersValue;

  const dockerResult: DockerBuildResult = {
    imageId: result.image_id ?? (result.imageId || ''),
    tags: result.tags ?? (result.image_tag ? [result.image_tag] : []),
    logs: result.logs ?? [],
    success: result.success !== false
  };

  // Only add optional properties if they have defined values
  const size = result.size_bytes ?? result.size;
  if (size !== undefined) {
    dockerResult.size = size;
  }

  if (layersCount !== undefined) {
    dockerResult.layers = layersCount;
  }

  const buildTime = result.build_duration_ms ?? result.buildTime;
  if (buildTime !== undefined) {
    dockerResult.buildTime = buildTime;
  }

  return dockerResult;
}

/**
 * Check if session has analysis completed
 * @param session The session object
 * @returns True if analysis is complete
 */
export function hasAnalysisCompleted(session: Session): boolean {
  return session.workflow_state?.completed_steps.includes('analyze_repository') || false;
}

/**
 * Check if session has build completed
 * @param session The session object
 * @returns True if build is complete
 */
export function hasBuildCompleted(session: Session): boolean {
  return session.workflow_state?.completed_steps.includes('build_image') || false;
}

/**
 * Get safe property access for nested workflow state
 * @param session The session object
 * @param property The property path as dot notation
 * @returns The property value or undefined
 */
export function getWorkflowProperty(session: Session, property: string): unknown {
  const parts = property.split('.');
  let current: unknown = session.workflow_state;

  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }

  return current;
}
