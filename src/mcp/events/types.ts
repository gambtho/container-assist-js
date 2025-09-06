export interface ProgressEvent {
  token: string;
  type: 'progress' | 'complete' | 'error';
  value?: number;
  message?: string;
  error?: string;
  result?: unknown;
  timestamp: Date;
}

export interface ProgressNotifier {
  /**
   * Notify progress for a long-running operation
   */
  notifyProgress(progress: { token: string; value: number; message?: string }): void;

  /**
   * Notify completion of an operation
   */
  notifyComplete(token: string, result?: unknown): void;

  /**
   * Notify error in an operation
   */
  notifyError(token: string, error: string): void;

  /**
   * Subscribe to progress events
   */
  subscribe(callback: (event: ProgressEvent) => void): () => void;

  /**
   * Generate a unique progress token
   */
  generateToken(operation?: string): string;
}

export const PROGRESS_EVENTS = {
  // Repository analysis
  ANALYZING_REPOSITORY: 'analyzing_repository',
  ANALYZING_FILES: 'analyzing_files',
  ANALYZING_DEPENDENCIES: 'analyzing_dependencies',

  // Dockerfile operations
  GENERATING_DOCKERFILE: 'generating_dockerfile',
  SAMPLING_CANDIDATES: 'sampling_candidates',
  SCORING_CANDIDATES: 'scoring_candidates',
  SELECTING_WINNER: 'selecting_winner',
  VALIDATING_DOCKERFILE: 'validating_dockerfile',

  // Build operations
  BUILDING_IMAGE: 'building_image',
  UPLOADING_CONTEXT: 'uploading_context',
  EXECUTING_BUILD: 'executing_build',

  // Scan operations
  SCANNING_IMAGE: 'scanning_image',
  ANALYZING_VULNERABILITIES: 'analyzing_vulnerabilities',
  GENERATING_REPORT: 'generating_report',

  // Remediation operations
  REMEDIATING_VULNERABILITIES: 'remediating_vulnerabilities',
  UPDATING_DOCKERFILE: 'updating_dockerfile',
  RETESTING_IMAGE: 'retesting_image',

  // K8s operations
  GENERATING_MANIFESTS: 'generating_manifests',
  VALIDATING_MANIFESTS: 'validating_manifests',
  APPLYING_MANIFESTS: 'applying_manifests',

  // Deployment operations
  DEPLOYING_APPLICATION: 'deploying_application',
  MONITORING_ROLLOUT: 'monitoring_rollout',
  VERIFYING_DEPLOYMENT: 'verifying_deployment',
} as const;

export type ProgressEventType = (typeof PROGRESS_EVENTS)[keyof typeof PROGRESS_EVENTS];
