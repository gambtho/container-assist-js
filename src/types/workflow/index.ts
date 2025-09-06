/**
 * Workflow Types
 *
 * Re-export from consolidated workflow types
 * These types are now available in the main workflows and core types
 */

// Re-export workflow-related types from consolidated locations
export type { ProgressUpdate, ProgressEmitter } from '../core.js';
export type {
  ContainerizationWorkflowParams,
  ContainerizationWorkflowResult,
  DeploymentWorkflowParams,
  DeploymentWorkflowResult,
} from '../../workflows/types.js';
