/**
 * Session data validator utilities for Team 4 improvements
 * Provides safe access to session workflow state
 */

import type { Session, AnalysisResult, DockerBuildResult } from '../../domain/types/index.js'

/**
 * Get analysis result from session workflow state
 * @param session The session object
 * @returns Analysis result or null if not available
 */
export function getSessionAnalysis(session: Session): AnalysisResult | null {
  return session.workflow_state?.analysis_result || null
}

/**
 * Get build result from session workflow state
 * @param session The session object
 * @returns Build result or null if not available
 */
export function getSessionBuildResult(session: Session): DockerBuildResult | null {
  const buildResult = session.workflow_state?.build_result
  if (!buildResult) return null

  // Transform snake_case properties to camelCase to match DockerBuildResult interface
  return {
    imageId: (buildResult as any).image_id || (buildResult as any).imageId || '',
    tags: (buildResult as any).tags || [(buildResult as any).image_tag].filter(Boolean),
    logs: (buildResult as any).logs || [],
    size: (buildResult as any).size_bytes || (buildResult as any).size,
    layers: (buildResult as any).layers,
    buildTime: (buildResult as any).build_duration_ms || (buildResult as any).buildTime
  }
}

/**
 * Check if session has analysis completed
 * @param session The session object
 * @returns True if analysis is complete
 */
export function hasAnalysisCompleted(session: Session): boolean {
  return session.workflow_state?.completed_steps.includes('analyze_repository') || false
}

/**
 * Check if session has build completed
 * @param session The session object
 * @returns True if build is complete
 */
export function hasBuildCompleted(session: Session): boolean {
  return session.workflow_state?.completed_steps.includes('build_image') || false
}

/**
 * Get safe property access for nested workflow state
 * @param session The session object
 * @param property The property path as dot notation
 * @returns The property value or undefined
 */
export function getWorkflowProperty(session: Session, property: string): unknown {
  const parts = property.split('.')
  let current: any = session.workflow_state

  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined
    }
    current = current[part]
  }

  return current
}


