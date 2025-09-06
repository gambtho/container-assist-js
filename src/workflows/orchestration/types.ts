/**
 * Simple Workflow Types - De-Enterprise Refactoring
 *
 * Replaces 15+ complex interfaces with simple types
 * From enterprise over-specification to TypeScript idiomatic patterns
 */

import { Result } from '../../types/core.js';
import type { Logger } from 'pino';
import type {
  Candidate,
  ScoredCandidate,
  GenerationContext,
} from '../../lib/sampling.js';

// Re-export types that are still needed for compatibility
export type { Candidate, ScoredCandidate, GenerationContext };

// Simple workflow types - no interface explosion
export type WorkflowConfig = {
  enableSampling?: boolean;
  maxCandidates?: number;
  buildArgs?: Record<string, string>;
};

export type WorkflowResult = {
  success: boolean;
  artifacts: Record<string, string>;
  duration: number;
  errors?: string[];
};

export type Tool = {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<Result<unknown>>;
};

export type ToolContext = {
  logger: Logger;
  sessionId: string;
  signal?: AbortSignal;
};

// Simple enums for essential workflow stages
export enum WorkflowStage {
  ANALYSIS = 'analysis',
  DOCKERFILE_GENERATION = 'dockerfile_generation',
  BUILD = 'build',
  SCAN = 'scan',
  K8S_GENERATION = 'k8s_generation',
  DEPLOYMENT = 'deployment',
  VERIFICATION = 'verification',
}

// Simple types needed for compatibility
export type SessionContext = {
  id: string;
  repository: RepositoryInfo;
  config: WorkflowConfig;
  state: WorkflowState;
  artifacts: Map<string, ResourceUri>;
  startTime: Date;
  lastActivity: Date;
};

export type WorkflowState = {
  currentStage: WorkflowStage;
  completedStages: WorkflowStage[];
  failedStages: WorkflowStage[];
  retryCount: Record<WorkflowStage, number>;
  errors?: string[];
};

export type RepositoryInfo = {
  path: string;
  name: string;
  url?: string;
};

// Keep only essential types for compatibility
export type ResourceUri = string;

export type EnhancedTool = {
  name: string;
  supportsSampling: boolean;
  samplingConfig?: {
    maxCandidates: number;
    scoringWeights: Record<string, number>;
  };
  execute(args: Record<string, unknown>): Promise<Result<ToolResult>>;
};

export type ToolResult = {
  ok: boolean;
  content: unknown;
  resources?: Record<string, ResourceUri>;
  metadata?: Record<string, unknown>;
};

// Simple defaults - no complex configuration objects
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  enableSampling: true,
  maxCandidates: 3,
  buildArgs: {},
};
