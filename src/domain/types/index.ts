export type { Result } from './result';
export { Success, Failure, isOk, isFail } from './result';

// Legacy aliases for backwards compatibility
export { Success as ok, Failure as fail } from './result';

export type { ProgressEmitter, EventPublisher } from './interfaces';

export { ErrorCode, DomainError, InfrastructureError, ServiceError } from './errors';

export type { Session, WorkflowState, AnalysisResult, DeploymentResult } from './session';

export type { SessionStore } from './session-store';

export type {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  ScanOptions,
} from './docker';

export type {
  KubernetesManifest,
  KubernetesDeploymentResult,
  K8sDeploymentOptions,
  KubernetesService as K8sServiceStatus,
} from './kubernetes';
export type {
  KubernetesManifest as K8sManifest,
  KubernetesDeploymentResult as K8sDeploymentResult,
} from './kubernetes';

export type {
  BaseImageRecommendation,
  BaseImageResolutionInput,
  ValidationResult,
  SuggestedImage,
} from './base-image';
export { BaseImageRecommendationSchema, BaseImageResolutionInputSchema } from './base-image';
