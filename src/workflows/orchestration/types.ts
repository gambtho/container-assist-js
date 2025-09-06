import { Result } from '../../types/core.js'

// Core workflow types
export interface WorkflowConfig {
  // Sampling preferences
  enableSampling: boolean
  maxCandidates: number // 3-10
  samplingTimeout: number // seconds
  
  // Build preferences
  buildTimeout: number
  enableBuildCache: boolean
  buildArgs: Record<string, string>
  
  // Security preferences
  maxVulnerabilityLevel: 'low' | 'medium' | 'high' | 'critical'
  enableAutoRemediation: boolean
  maxRemediationAttempts: number
  
  // Deployment preferences
  targetEnvironment: 'dev' | 'staging' | 'prod'
  deploymentStrategy: 'rolling' | 'blue-green' | 'canary'
  enableAutoVerification: boolean
  
  // Resource preferences
  keepIntermediateArtifacts: boolean
  resourceTTL: number // seconds
}

export interface SessionContext {
  id: string
  repository: RepositoryInfo
  config: WorkflowConfig
  state: WorkflowState
  artifacts: Map<string, ResourceUri>
  startTime: Date
  lastActivity: Date
}

export interface RepositoryInfo {
  path: string
  name: string
  url?: string
  branch?: string
  commit?: string
}

export interface WorkflowState {
  currentStage: WorkflowStage
  completedStages: WorkflowStage[]
  failedStages: WorkflowStage[]
  retryCount: Record<WorkflowStage, number>
  errors: WorkflowError[]
}

export enum WorkflowStage {
  ANALYSIS = 'analysis',
  DOCKERFILE_GENERATION = 'dockerfile_generation',
  BUILD = 'build',
  SCAN = 'scan',
  REMEDIATION = 'remediation',
  K8S_GENERATION = 'k8s_generation',
  DEPLOYMENT = 'deployment',
  VERIFICATION = 'verification'
}

export interface WorkflowResult {
  sessionId: string
  success: boolean
  duration: number
  completedStages: WorkflowStage[]
  finalArtifacts: Record<string, ResourceUri>
  metrics: WorkflowMetrics
  errors?: WorkflowError[]
}

export interface WorkflowMetrics {
  totalDuration: number
  stageDurations: Record<WorkflowStage, number>
  retryCount: number
  artifactSizes: Record<string, number>
  samplingMetrics?: SamplingMetrics
}

export interface SamplingMetrics {
  candidatesGenerated: number
  scoringTime: number
  winnerScore: number
  cacheHitRate: number
}

export interface WorkflowError {
  stage: WorkflowStage
  error: string
  recoverable: boolean
  suggestedAction?: string
  timestamp: Date
}

export interface WorkflowProgress {
  stage: WorkflowStage
  stepName: string
  progress: number // 0-100
  message?: string
  artifacts?: ResourceUri[]
  timestamp: Date
}

// Resource URI type (from Team Alpha)
export type ResourceUri = string

// Progress notification interface (MCP-compatible)
export interface ProgressNotifier {
  notifyProgress(progress: { 
    token: string
    value: number
    message?: string 
  }): void
  notifyComplete(token: string): void
  notifyError(token: string, error: string): void
}

// Resource management interface (from Team Alpha)
export interface ResourceManager {
  publish(uri: string, content: unknown, ttl?: number): Promise<string>
  read(uri: string): Promise<unknown>
  invalidate(pattern: string): Promise<void>
  cleanup(olderThan: Date): Promise<void>
}

// Sampling interfaces (from Team Beta)
export interface CandidateGenerator<T> {
  generate(context: GenerationContext, count?: number): Promise<Candidate<T>[]>
}

export interface CandidateScorer<T> {
  score(candidates: Candidate<T>[]): Promise<ScoredCandidate<T>[]>
}

export interface WinnerSelector<T> {
  select(scored: ScoredCandidate<T>[]): ScoredCandidate<T>
}

export interface Candidate<T> {
  id: string
  content: T
  metadata: Record<string, unknown>
  generatedAt: Date
}

export interface ScoredCandidate<T> extends Candidate<T> {
  score: number
  scoreBreakdown: Record<string, number>
  rationale: string
}

export interface GenerationContext {
  sessionId: string
  repository: RepositoryInfo
  analysisResults?: unknown
  previousStageResults?: unknown
  userPreferences?: Record<string, unknown>
}

// Enhanced tool interfaces (from Team Delta)
export interface EnhancedTool {
  name: string
  supportsSampling: boolean
  samplingConfig?: {
    maxCandidates: number
    scoringWeights: Record<string, number>
  }
  execute(args: Record<string, unknown>): Promise<Result<ToolResult>>
}

export interface ToolResult {
  ok: boolean
  content: unknown
  resources?: Record<string, ResourceUri>
  metadata?: Record<string, unknown>
}

// Error recovery strategies
export enum RecoveryStrategy {
  RETRY = 'retry',
  SKIP = 'skip',
  FALLBACK = 'fallback',
  MANUAL = 'manual',
  ABORT = 'abort'
}

export interface RecoveryAction {
  strategy: RecoveryStrategy
  maxAttempts: number
  backoffMs: number
  fallbackTool?: string
  userPrompt?: string
}

// Configuration defaults
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  enableSampling: true,
  maxCandidates: 3,
  samplingTimeout: 60,
  buildTimeout: 300,
  enableBuildCache: true,
  buildArgs: {},
  maxVulnerabilityLevel: 'medium',
  enableAutoRemediation: true,
  maxRemediationAttempts: 2,
  targetEnvironment: 'dev',
  deploymentStrategy: 'rolling',
  enableAutoVerification: true,
  keepIntermediateArtifacts: false,
  resourceTTL: 3600
}

// Stage timeout configurations
export const STAGE_TIMEOUTS: Record<WorkflowStage, number> = {
  [WorkflowStage.ANALYSIS]: 60,
  [WorkflowStage.DOCKERFILE_GENERATION]: 90,
  [WorkflowStage.BUILD]: 300,
  [WorkflowStage.SCAN]: 180,
  [WorkflowStage.REMEDIATION]: 120,
  [WorkflowStage.K8S_GENERATION]: 60,
  [WorkflowStage.DEPLOYMENT]: 300,
  [WorkflowStage.VERIFICATION]: 120
}

// Retry configurations
export const RETRY_CONFIGS: Record<WorkflowStage, RecoveryAction> = {
  [WorkflowStage.ANALYSIS]: {
    strategy: RecoveryStrategy.RETRY,
    maxAttempts: 2,
    backoffMs: 5000
  },
  [WorkflowStage.DOCKERFILE_GENERATION]: {
    strategy: RecoveryStrategy.FALLBACK,
    maxAttempts: 1,
    backoffMs: 0,
    fallbackTool: 'generate_dockerfile_basic'
  },
  [WorkflowStage.BUILD]: {
    strategy: RecoveryStrategy.RETRY,
    maxAttempts: 2,
    backoffMs: 10000
  },
  [WorkflowStage.SCAN]: {
    strategy: RecoveryStrategy.SKIP,
    maxAttempts: 2,
    backoffMs: 5000
  },
  [WorkflowStage.REMEDIATION]: {
    strategy: RecoveryStrategy.MANUAL,
    maxAttempts: 2,
    backoffMs: 0,
    userPrompt: 'Remediation failed. Please review vulnerabilities manually.'
  },
  [WorkflowStage.K8S_GENERATION]: {
    strategy: RecoveryStrategy.FALLBACK,
    maxAttempts: 1,
    backoffMs: 0,
    fallbackTool: 'generate_k8s_manifests_basic'
  },
  [WorkflowStage.DEPLOYMENT]: {
    strategy: RecoveryStrategy.RETRY,
    maxAttempts: 1,
    backoffMs: 30000
  },
  [WorkflowStage.VERIFICATION]: {
    strategy: RecoveryStrategy.MANUAL,
    maxAttempts: 1,
    backoffMs: 0,
    userPrompt: 'Verification failed. Please check deployment manually.'
  }
}