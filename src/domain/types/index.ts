/**
 * Domain Types
 * Core type definitions and patterns used throughout the application
 */

// Result monad pattern for error handling
export * from './result';

// Session and workflow types - export all except conflicting types
export {
  // Session types
  type Session,
  SessionSchema,
  type WorkflowState,
  WorkflowStateSchema,
  // Analysis types
  type AnalysisResult,
  AnalysisResultSchema,
  // Dockerfile types (non-conflicting)
  type DockerfileResult,
  DockerfileResultSchema,
  // Manifest types
  type K8sManifestResult,
  K8sManifestResultSchema,
  // Deployment types
  type DeploymentResult,
  DeploymentResultSchema,
  // Workflow enum
  WorkflowStep,
} from './session';

// Explicitly export session-specific build and scan types with aliases
export {
  type DockerBuildResult as SessionDockerBuildResult,
  DockerBuildResultSchema as SessionDockerBuildResultSchema,
  type ScanResult as SessionScanResult,
  ScanResultSchema as SessionScanResultSchema,
} from './session';

// Error handling types
export * from './errors';

// Re-export contract types (these take precedence for external interfaces)
export * from '../../contracts/types/docker.js';
export * from '../../contracts/types/kubernetes.js';
export {
  type ScanOptions,
  type Vulnerability,
  type ScanResult as SecurityScanResult,
} from '../../contracts/types/scanning.js';
export * from '../../contracts/types/dotnet.js';
