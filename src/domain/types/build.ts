/**
 * Build process types consolidated from multiple locations
 * Single source of truth for all build-related interfaces
 */

import { z } from 'zod'

// Build configuration and options
export interface BuildConfiguration {
  projectPath: string
  buildTool: 'docker' | 'buildah' | 'kaniko' | 'podman'
  strategy: 'single-stage' | 'multi-stage' | 'buildkit'
  outputFormat: 'oci' | 'docker'
  cacheStrategy?: 'inline' | 'registry' | 'local'
}

// Build configuration options
export interface BuildOptions {
  // Core options
  dockerfile?: string
  context: string
  tags?: string[]
  target?: string

  // Build arguments and environment
  buildArgs?: Record<string, string>
  labels?: Record<string, string>

  // Build behavior options
  noCache?: boolean
  pull?: boolean
  compress?: boolean
  squash?: boolean
  forcerm?: boolean
  rm?: boolean
  quiet?: boolean

  // Advanced options
  platform?: string | string[]
  secrets?: Array<{
    id: string
    src: string
  }>
  ssh?: string[]
  outputs?: string[]

  // Performance options
  memory?: number
  cpus?: number
  cgroupParent?: string
  isolation?: string

  // Network options
  networkMode?: string
  addHost?: string[]

  // Security options
  securityOpt?: string[]
  ulimit?: Array<{
    name: string
    soft: number
    hard: number
  }>
}

// Build execution result
export interface BuildResult {
  // Core result data
  imageId: string
  tags: string[]
  digest?: string

  // Build metadata
  size?: number
  layers?: number
  buildTime?: number
  buildId?: string

  // Build output
  logs: string[]
  warnings?: string[]
  stream?: string

  // Status and error handling
  success: boolean
  error?: string
  exitCode?: number

  // Additional metadata
  aux?: Record<string, unknown>
  platform?: string
  created?: string
  author?: string
  config?: {
    env?: string[]
    cmd?: string[]
    entrypoint?: string[]
    workingDir?: string
    user?: string
    exposedPorts?: Record<string, Record<string, unknown>>
  }
}

// Build progress tracking
export interface BuildProgress {
  step: number
  totalSteps: number
  currentOperation: string
  progress?: number
  detail?: string
  id?: string
  status?: string
  progressDetail?: {
    current?: number
    total?: number
  }
}

// Build context information
export interface BuildContext {
  path: string
  size?: number
  files?: string[]
  dockerignore?: string[]
  dockerfile?: string
  gitContext?: {
    repository: string
    branch: string
    commit: string
    tag?: string
  }
}

// Build cache information
export interface BuildCache {
  type: 'inline' | 'registry' | 'local' | 'gha' | 's3'
  location?: string
  mode?: 'min' | 'max'
  compression?: 'gzip' | 'estargz' | 'zstd'
  ociMediatypes?: boolean
}

// Build stage information for multi-stage builds
export interface BuildStage {
  name: string
  from: string
  index: number
  size?: number
  duration?: number
  cached?: boolean
}

// Build metrics and statistics
export interface BuildMetrics {
  totalDuration: number
  contextTransferTime?: number
  buildTime: number
  finalImageSize: number
  layers: number
  cacheHits: number
  cacheMisses: number
  stages?: BuildStage[]
  resourceUsage?: {
    maxMemory?: number
    maxCpu?: number
    diskUsage?: number
  }
}

// Extended build result with metrics
export interface BuildResultWithMetrics extends BuildResult {
  metrics: BuildMetrics
  context: BuildContext
  cache?: BuildCache
}

// Build error types
export interface BuildError {
  code: string
  message: string
  step?: number
  stage?: string
  line?: number
  context?: string
  suggestions?: string[]
}

// Zod schemas for validation
export const BuildConfigurationSchema = z.object({
  projectPath: z.string(),
  buildTool: z.enum(['docker', 'buildah', 'kaniko', 'podman']),
  strategy: z.enum(['single-stage', 'multi-stage', 'buildkit']),
  outputFormat: z.enum(['oci', 'docker']),
  cacheStrategy: z.enum(['inline', 'registry', 'local']).optional(),
})

export const BuildOptionsSchema = z.object({
  dockerfile: z.string().optional(),
  context: z.string(),
  tags: z.array(z.string()).optional(),
  target: z.string().optional(),
  buildArgs: z.record(z.string(), z.string()).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  noCache: z.boolean().optional(),
  pull: z.boolean().optional(),
  compress: z.boolean().optional(),
  squash: z.boolean().optional(),
  forcerm: z.boolean().optional(),
  rm: z.boolean().optional(),
  quiet: z.boolean().optional(),
  platform: z.union([z.string(), z.array(z.string())]).optional(),
  secrets: z.array(z.object({
    id: z.string(),
    src: z.string(),
  })).optional(),
  ssh: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  memory: z.number().optional(),
  cpus: z.number().optional(),
  cgroupParent: z.string().optional(),
  isolation: z.string().optional(),
  networkMode: z.string().optional(),
  addHost: z.array(z.string()).optional(),
  securityOpt: z.array(z.string()).optional(),
  ulimit: z.array(z.object({
    name: z.string(),
    soft: z.number(),
    hard: z.number(),
  })).optional(),
})

export const BuildResultSchema = z.object({
  imageId: z.string(),
  tags: z.array(z.string()),
  digest: z.string().optional(),
  size: z.number().optional(),
  layers: z.number().optional(),
  buildTime: z.number().optional(),
  buildId: z.string().optional(),
  logs: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
  stream: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
  aux: z.any().optional(),
  platform: z.string().optional(),
  created: z.string().optional(),
  author: z.string().optional(),
  config: z.object({
    env: z.array(z.string()).optional(),
    cmd: z.array(z.string()).optional(),
    entrypoint: z.array(z.string()).optional(),
    workingDir: z.string().optional(),
    user: z.string().optional(),
    exposedPorts: z.record(z.string(), z.any()).optional(),
  }).optional(),
})

export const BuildProgressSchema = z.object({
  step: z.number(),
  totalSteps: z.number(),
  currentOperation: z.string(),
  progress: z.number().optional(),
  detail: z.string().optional(),
  id: z.string().optional(),
  status: z.string().optional(),
  progressDetail: z.object({
    current: z.number().optional(),
    total: z.number().optional(),
  }).optional(),
})

export const BuildErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  step: z.number().optional(),
  stage: z.string().optional(),
  line: z.number().optional(),
  context: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
})

// Type exports
export type BuildConfigurationType = z.infer<typeof BuildConfigurationSchema>
export type BuildOptionsType = z.infer<typeof BuildOptionsSchema>
export type BuildResultType = z.infer<typeof BuildResultSchema>
export type BuildProgressType = z.infer<typeof BuildProgressSchema>
export type BuildErrorType = z.infer<typeof BuildErrorSchema>


