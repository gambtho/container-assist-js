/**
 * Domain service interfaces - Abstract contracts for cross-boundary communication
 * These interfaces define what the domain needs without depending on implementation details
 */

import { Result } from './result.js'
import { DockerBuildOptions, DockerBuildResult, DockerScanResult, DockerPushResult, DockerTagResult, DockerImage } from './docker.js'
import { BuildOptions, BuildResult } from './build.js'
import { ScanOptions, ScanResult } from './scanning.js'
import { Session, WorkflowState, AnalysisResult } from './session.js'


// Progress update structure (aligned with infrastructure)
export interface ProgressUpdate {
  sessionId: string
  step: string
  status: 'starting' | 'in_progress' | 'completed' | 'failed'
  progress: number
  message?: string
  metadata?: Record<string, unknown>
  timestamp: string
}

// Progress listener interface
export interface ProgressListener {
  onProgress(update: ProgressUpdate): void | Promise<void>
}

// Progress filter interface
export interface ProgressFilter {
  sessionId?: string
  step?: string
  status?: ProgressUpdate['status']
  since?: Date
  limit?: number
}

// Progress emitter interface for workflow tracking (aligned with infrastructure)
export interface ProgressEmitter {
  emit(update: Partial<ProgressUpdate>): Promise<void>
  addListener(listener: ProgressListener): void
  removeListener(listener: ProgressListener): void
  getHistory(sessionId: string, filter?: ProgressFilter): ProgressUpdate[]
  getCurrentProgress(sessionId: string): {
    currentStep?: string
    progress: number
    completedSteps: string[]
    failedSteps: string[]
  }
  shutdown(): void
}

// Legacy progress data structure (deprecated - use ProgressUpdate)
export interface ProgressData {
  step: string
  progress: number
  total: number
  message: string
  details?: Record<string, unknown>
  timestamp: string
}

// Repository analyzer interface - domain contract
export interface IRepositoryAnalyzer {
  analyzeRepository(repoPath: string): Promise<Result<AnalysisResult>>
  detectLanguage(repoPath: string): Promise<Result<string>>
  findBuildFiles(repoPath: string): Promise<Result<string[]>>
  analyzeDependencies(repoPath: string): Promise<Result<{
    dependencies: Array<{
      name: string
      version?: string
      type?: 'runtime' | 'dev' | 'test'
    }>
    buildTool?: string
    languageVersion?: string
  }>>
}

// Docker service interface - domain contract
export interface IDockerService {
  buildImage(options: DockerBuildOptions): Promise<Result<DockerBuildResult>>
  scanImage(image: string, options?: ScanOptions): Promise<Result<DockerScanResult>>
  tagImage(imageId: string, tags: string[]): Promise<Result<DockerTagResult>>
  pushImage(tag: string, registry?: string): Promise<Result<DockerPushResult>>
  listImages(): Promise<Result<DockerImage[]>>
  removeImage(imageId: string): Promise<Result<void>>
  imageExists(imageId: string): Promise<Result<boolean>>
}

// Generic build service interface - domain contract
export interface IBuildService {
  build(options: BuildOptions): Promise<Result<BuildResult>>
  validateBuildContext(contextPath: string): Promise<Result<boolean>>
  estimateBuildTime(options: BuildOptions): Promise<Result<number>>
}

// Scanning service interface - domain contract
export interface IScanningService {
  scanImage(image: string, options?: ScanOptions): Promise<Result<ScanResult>>
  scanFilesystem(path: string, options?: ScanOptions): Promise<Result<ScanResult>>
  updateDatabase(): Promise<Result<void>>
  getAvailableScanners(): Promise<Result<string[]>>
}

// Session store interface - domain contract
export interface ISessionStore {
  create(session: Session): Promise<Result<Session>>
  get(sessionId: string): Promise<Result<Session>>
  update(session: Session): Promise<Result<Session>>
  delete(sessionId: string): Promise<Result<void>>
  list(): Promise<Result<Session[]>>
  findByStatus(status: string): Promise<Result<Session[]>>
  cleanup(olderThan: Date): Promise<Result<number>>
}

// Workflow manager interface - domain contract
export interface IWorkflowManager {
  startWorkflow(sessionId: string, options: any): Promise<Result<WorkflowState>>
  getWorkflowStatus(sessionId: string): Promise<Result<WorkflowState>>
  pauseWorkflow(sessionId: string): Promise<Result<void>>
  resumeWorkflow(sessionId: string): Promise<Result<void>>
  cancelWorkflow(sessionId: string): Promise<Result<void>>
  executeStep(sessionId: string, step: string, input: any): Promise<Result<any>>
}

// AI/LLM service interface - domain contract
export interface IAIService {
  generateDockerfile(context: any): Promise<Result<string>>
  fixDockerfile(dockerfile: string, error: string): Promise<Result<string>>
  generateManifests(context: any): Promise<Result<any>>
  analyzeProject(projectPath: string): Promise<Result<AnalysisResult>>
  suggestOptimizations(context: any): Promise<Result<string[]>>
}

// Kubernetes service interface - domain contract
export interface IKubernetesService {
  generateManifests(options: any): Promise<Result<any>>
  deployApplication(manifests: any[], namespace?: string): Promise<Result<any>>
  getDeploymentStatus(deploymentName: string, namespace?: string): Promise<Result<any>>
  deleteDeployment(deploymentName: string, namespace?: string): Promise<Result<void>>
  getClusterInfo(): Promise<Result<any>>
  createNamespace(name: string): Promise<Result<void>>
}

// File system interface - domain contract
export interface IFileSystem {
  readFile(path: string): Promise<Result<string>>
  writeFile(path: string, content: string): Promise<Result<void>>
  exists(path: string): Promise<Result<boolean>>
  mkdir(path: string, recursive?: boolean): Promise<Result<void>>
  readdir(path: string): Promise<Result<string[]>>
  stat(path: string): Promise<Result<any>>
  copy(src: string, dest: string): Promise<Result<void>>
  remove(path: string): Promise<Result<void>>
}

// Command executor interface - domain contract
export interface ICommandExecutor {
  execute(command: string, args?: string[], options?: any): Promise<Result<{
    stdout: string
    stderr: string
    exitCode: number
  }>>
  spawn(command: string, args?: string[], options?: any): Promise<Result<any>>
}

// Event handler type
export type EventHandler<T = any> = (data: T) => void

// Event publisher interface - aligned with infrastructure
export interface IEventPublisher {
  publish<T = any>(eventType: string, data: T): void
  subscribe<T = any>(eventType: string, handler: EventHandler<T>): void
  unsubscribe<T = any>(eventType: string, handler: EventHandler<T>): void
  removeAllSubscribers(eventType?: string): void
  getSubscriberCount(eventType: string): number
}

// Configuration interface - domain contract
export interface IConfiguration {
  get<T>(key: string): T
  set<T>(key: string, value: T): void
  has(key: string): boolean
  getAll(): Record<string, any>
  validate(): Result<void>
}

// Metrics and monitoring interface - domain contract
export interface IMetricsService {
  recordMetric(name: string, value: number, tags?: Record<string, string>): void
  incrementCounter(name: string, tags?: Record<string, string>): void
  recordTimer(name: string, duration: number, tags?: Record<string, string>): void
  recordError(error: Error, context?: any): void
  getMetrics(): Promise<Result<any>>
}

// Cache interface - domain contract
export interface ICacheService {
  get<T>(key: string): Promise<Result<T | null>>
  set<T>(key: string, value: T, ttl?: number): Promise<Result<void>>
  delete(key: string): Promise<Result<void>>
  clear(): Promise<Result<void>>
  exists(key: string): Promise<Result<boolean>>
}

// Registry interface - domain contract for container registries
export interface IRegistryService {
  authenticate(registry: string, credentials: any): Promise<Result<void>>
  getImageManifest(image: string): Promise<Result<any>>
  listTags(repository: string): Promise<Result<string[]>>
  deleteImage(image: string): Promise<Result<void>>
  getImageSize(image: string): Promise<Result<number>>
}

// Logger interface must be defined before BaseService
export interface Logger {
  trace(msg: string, ...args: any[]): void
  debug(msg: string, ...args: any[]): void
  info(msg: string, ...args: any[]): void
  warn(msg: string, ...args: any[]): void
  error(msg: string | Error, ...args: any[]): void
  fatal(msg: string | Error, ...args: any[]): void
  child(bindings: Record<string, any>): Logger
}

// For backward compatibility
interface ServiceLogger extends Logger {}

// Base service interface - common functionality
export interface BaseService {
  logger: ServiceLogger
  config: IConfiguration
  initialize?(): Promise<Result<void>>
  cleanup?(): Promise<Result<void>>
  healthCheck?(): Promise<Result<boolean>>
}


