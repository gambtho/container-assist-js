/**
 * Domain types export index
 * Central export point for all domain types
 */

export type { Result } from './interfaces';

// Error types
export { ErrorCode, DomainError, InfrastructureError, ServiceError } from './errors';

// Session types
export type {
  Session,
  WorkflowState,
  AnalysisResult,
  DockerfileResult,
  K8sManifestResult,
  DeploymentResult,
  WorkflowStepType,
} from './session';
export { SessionSchema, WorkflowStep, getWorkflowSteps } from './session';

// Session store types
export type {
  SessionStore,
  SessionFilter,
  SessionNotFoundError,
  SessionAlreadyExistsError,
} from './session-store';

// Docker types (consolidated single source of truth)
export type {
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  DockerImage,
  DockerRegistry,
  DockerPushResult,
  DockerTagResult,
  DockerfileFix,
  DockerfileChange,
  AlternativeApproach,
  DockerfileFixHistory,
} from './docker';
export {
  DockerBuildOptionsSchema,
  DockerBuildResultSchema,
  DockerScanResultSchema,
  DockerPushResultSchema,
  DockerTagResultSchema,
  DockerfileFixSchema,
  DockerfileChangeSchema,
  AlternativeApproachSchema,
} from './docker';

// Build types (consolidated single source of truth)
export type {
  BuildConfiguration,
  BuildOptions,
  BuildResult,
  BuildProgress,
  BuildContext,
  BuildCache,
  BuildStage,
  BuildMetrics,
  BuildResultWithMetrics,
  BuildError,
  BuildConfigurationType,
  BuildOptionsType,
  BuildResultType,
  BuildProgressType,
  BuildErrorType,
} from './build';
export {
  BuildConfigurationSchema,
  BuildOptionsSchema,
  BuildResultSchema,
  BuildProgressSchema,
  BuildErrorSchema,
} from './build';

// Scanning types (consolidated single source of truth)
export type {
  ScannerType,
  ScannerConfig,
  SeverityLevel,
  Vulnerability,
  VulnerabilitySummary,
  ScanOptions,
  ScanResult,
  ScanProgress,
  ScanHistory,
  SecurityPolicy,
  ScanReport,
  ScannerConfigType,
  VulnerabilityType,
  VulnerabilitySummaryType,
  ScanResultType,
  SecurityPolicyType,
} from './scanning';
export {
  ScannerConfigSchema,
  VulnerabilitySchema,
  VulnerabilitySummarySchema,
  ScanResultSchema,
  SecurityPolicySchema,
} from './scanning';

// Domain service interfaces
export type {
  ProgressEmitter,
  ProgressData,
  ProgressUpdate,
  ProgressListener,
  ProgressFilter,
  EventHandler,
  SessionStore as SessionStoreInterface,
  FileSystem,
  CommandExecutor,
  EventPublisher,
  Configuration,
} from './interfaces';

// Domain events and event system
export type {
  DomainEvent,
  EventTypeName,
  SessionCreatedEventData,
  WorkflowStartedEventData,
  WorkflowStepCompletedEventData,
  WorkflowStepFailedEventData,
  AnalysisCompletedEventData,
  BuildProgressEventData,
  BuildCompletedEventData,
  ScanCompletedEventData,
  DeploymentCompletedEventData,
  ErrorOccurredEventData,
  EventBus,
  EventStore,
  DomainEventType,
  SessionCreatedEventDataType,
  WorkflowStepCompletedEventDataType,
  BuildCompletedEventDataType,
  ScanCompletedEventDataType,
  ErrorOccurredEventDataType,
} from './events';
export {
  EventType,
  createDomainEvent,
  createSessionEvent,
  createWorkflowEvent,
  createBuildEvent,
  createDeploymentEvent,
  DomainEventSchema,
  SessionCreatedEventDataSchema,
  WorkflowStepCompletedEventDataSchema,
  BuildCompletedEventDataSchema,
  ScanCompletedEventDataSchema,
  ErrorOccurredEventDataSchema,
} from './events';

// Kubernetes types
export type {
  KubernetesResource,
  KubernetesManifest,
  KubernetesManifestCollection,
  KubernetesDeploymentResult,
  KubernetesCluster,
  KubernetesPod,
  KubernetesService as K8sService,
} from './kubernetes';

// Backwards compatibility aliases for K8s types
export type {
  KubernetesManifest as K8sManifest,
  KubernetesDeploymentResult as K8sDeploymentResult,
  KubernetesService as K8sServiceStatus,
  K8sDeploymentOptions,
} from './kubernetes';

// Base Image types
export type {
  BaseImageRecommendation,
  BaseImageResolutionInput,
  ValidationResult,
  SuggestedImage,
} from './base-image';
export { BaseImageRecommendationSchema, BaseImageResolutionInputSchema } from './base-image';

// .NET types
export type {
  DotNetAnalysis,
  DotNetProjectType,
  DotNetBuildSystem,
  DotNetDependencies,
  ApplicationCharacteristics,
  RuntimeOptimizations,
  ContainerizationRecommendations,
  SecurityConsiderations,
  PerformanceOptimizations,
  CloudNativeFeatures,
  MigrationRecommendations,
} from './dotnet';
export {
  DotNetAnalysisSchema,
  DotNetProjectTypeSchema,
  DotNetBuildSystemSchema,
  DotNetDependenciesSchema,
  ApplicationCharacteristicsSchema,
  RuntimeOptimizationsSchema,
  ContainerizationRecommendationsSchema,
  SecurityConsiderationsSchema,
  PerformanceOptimizationsSchema,
  CloudNativeFeaturesSchema,
  MigrationRecommendationsSchema,
} from './dotnet';
