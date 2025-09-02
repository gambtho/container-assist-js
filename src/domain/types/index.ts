/**
 * Domain types export index
 * Central export point for all domain types
 */

// Result types
export type { AppError, Result } from './result.js'
export { ok, fail, isOk, isFail, map, chain, unwrap, unwrapOr, all, tryAsync, trySync } from './result.js'

// Error types
export { ErrorCode, DomainError, InfrastructureError } from './errors.js'

// Session types
export type {
  Session,
  WorkflowState,
  AnalysisResult,
  DockerfileResult,
  K8sManifestResult,
  DeploymentResult,
  WorkflowStepType
} from './session.js'
export { SessionSchema, WorkflowStep, getWorkflowSteps } from './session.js'

// Session store types
export type {
  SessionStore,
  SessionFilter,
  SessionNotFoundError,
  SessionAlreadyExistsError
} from './session-store.js'

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
  DockerfileFixHistory
} from './docker.js'
export {
  DockerBuildOptionsSchema,
  DockerBuildResultSchema,
  DockerScanResultSchema,
  DockerPushResultSchema,
  DockerTagResultSchema,
  DockerfileFixSchema,
  DockerfileChangeSchema,
  AlternativeApproachSchema
} from './docker.js'

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
  BuildErrorType
} from './build.js'
export {
  BuildConfigurationSchema,
  BuildOptionsSchema,
  BuildResultSchema,
  BuildProgressSchema,
  BuildErrorSchema
} from './build.js'

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
  SecurityPolicyType
} from './scanning.js'
export {
  ScannerConfigSchema,
  VulnerabilitySchema,
  VulnerabilitySummarySchema,
  ScanResultSchema,
  SecurityPolicySchema
} from './scanning.js'

// Domain service interfaces (abstraction layer)
export type {
  Logger,
  ProgressEmitter,
  ProgressData,
  ProgressUpdate,
  ProgressListener,
  ProgressFilter,
  EventHandler,
  IRepositoryAnalyzer,
  IDockerService,
  IBuildService,
  IScanningService,
  ISessionStore,
  IWorkflowManager,
  IAIService,
  IKubernetesService,
  IFileSystem,
  ICommandExecutor,
  IEventPublisher,
  IConfiguration,
  IMetricsService,
  ICacheService,
  IRegistryService,
  BaseService
} from './interfaces.js'

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
  IEventBus,
  IEventStore,
  DomainEventType,
  SessionCreatedEventDataType,
  WorkflowStepCompletedEventDataType,
  BuildCompletedEventDataType,
  ScanCompletedEventDataType,
  ErrorOccurredEventDataType
} from './events.js'
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
  ErrorOccurredEventDataSchema
} from './events.js'

// Kubernetes types
export type {
  KubernetesResource,
  KubernetesManifest,
  KubernetesManifestCollection,
  KubernetesDeploymentResult,
  KubernetesCluster,
  KubernetesPod,
  KubernetesService
} from './kubernetes.js'

// Base Image types
export type {
  BaseImageRecommendation,
  BaseImageResolutionInput,
  ValidationResult,
  SuggestedImage
} from './base-image.js'
export { BaseImageRecommendationSchema, BaseImageResolutionInputSchema } from './base-image.js'

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
  MigrationRecommendations
} from './dotnet.js'
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
  MigrationRecommendationsSchema
} from './dotnet.js'


