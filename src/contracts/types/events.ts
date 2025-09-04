/**
 * Domain events for cross-boundary communication
 * Clean event system without infrastructure dependencies
 */

import { z } from 'zod';

// Base event interface
export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

// Event types enum
export const EventType = {
  // Session events
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_DELETED: 'session.deleted',
  SESSION_EXPIRED: 'session.expired',

  // Workflow events
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_STEP_STARTED: 'workflow.step.started',
  WORKFLOW_STEP_COMPLETED: 'workflow.step.completed',
  WORKFLOW_STEP_FAILED: 'workflow.step.failed',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  WORKFLOW_PAUSED: 'workflow.paused',
  WORKFLOW_RESUMED: 'workflow.resumed',
  WORKFLOW_CANCELLED: 'workflow.cancelled',

  // Analysis events
  ANALYSIS_STARTED: 'analysis.started',
  ANALYSIS_COMPLETED: 'analysis.completed',
  ANALYSIS_FAILED: 'analysis.failed',

  // Build events
  BUILD_STARTED: 'build.started',
  BUILD_PROGRESS: 'build.progress',
  BUILD_COMPLETED: 'build.completed',
  BUILD_FAILED: 'build.failed',

  // Dockerfile events
  DOCKERFILE_GENERATED: 'dockerfile.generated',
  DOCKERFILE_FIXED: 'dockerfile.fixed',
  DOCKERFILE_VALIDATED: 'dockerfile.validated',

  // Scan events
  SCAN_STARTED: 'scan.started',
  SCAN_PROGRESS: 'scan.progress',
  SCAN_COMPLETED: 'scan.completed',
  SCAN_FAILED: 'scan.failed',

  // Image events
  IMAGE_TAGGED: 'image.tagged',
  IMAGE_PUSHED: 'image.pushed',
  IMAGE_PULLED: 'image.pulled',
  IMAGE_DELETED: 'image.deleted',

  // Deployment events
  DEPLOYMENT_STARTED: 'deployment.started',
  DEPLOYMENT_PROGRESS: 'deployment.progress',
  DEPLOYMENT_COMPLETED: 'deployment.completed',
  DEPLOYMENT_FAILED: 'deployment.failed',
  DEPLOYMENT_VERIFIED: 'deployment.verified',

  // Cluster events
  CLUSTER_PREPARED: 'cluster.prepared',
  CLUSTER_HEALTH_CHECK: 'cluster.health_check',

  // Error events
  ERROR_OCCURRED: 'error.occurred',
  ERROR_RECOVERED: 'error.recovered',

  // System events
  SYSTEM_HEALTH_CHECK: 'system.health_check',
  SYSTEM_MAINTENANCE: 'system.maintenance',
  CACHE_CLEARED: 'cache.cleared',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

// Specific event data interfaces

export interface SessionCreatedEventData {
  sessionId: string;
  repoPath: string;
  createdBy?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowStartedEventData {
  sessionId: string;
  workflowType: string;
  steps: string[];
  automated: boolean;
  options: Record<string, unknown>;
}

export interface WorkflowStepCompletedEventData {
  sessionId: string;
  step: string;
  stepIndex: number;
  totalSteps: number;
  duration: number;
  output: unknown;
  nextStep?: string;
}

export interface WorkflowStepFailedEventData {
  sessionId: string;
  step: string;
  stepIndex: number;
  error: string;
  retryable: boolean;
  suggestions?: string[];
}

export interface AnalysisCompletedEventData {
  sessionId: string;
  language: string;
  framework?: string;
  dependencies: number;
  recommendations: string[];
  duration: number;
}

export interface BuildProgressEventData {
  sessionId: string;
  imageId?: string;
  step: string;
  progress: number;
  message: string;
  logs: string[];
}

export interface BuildCompletedEventData {
  sessionId: string;
  imageId: string;
  tags: string[];
  size: number;
  duration: number;
  layers: number;
}

export interface ScanCompletedEventData {
  sessionId: string;
  imageId: string;
  scanner: string;
  vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  duration: number;
}

export interface DeploymentCompletedEventData {
  sessionId: string;
  namespace: string;
  deploymentName: string;
  replicas: number;
  endpoints: string[];
  duration: number;
}

export interface ErrorOccurredEventData {
  sessionId?: string;
  component: string;
  operation: string;
  error: string;
  stack?: string;
  context: Record<string, unknown>;
  recoverable: boolean;
}

// Event factory functions
export function createDomainEvent(
  type: EventTypeName,
  aggregateId: string,
  aggregateType: string,
  data: unknown,
  metadata?: Record<string, unknown>,
): DomainEvent {
  return {
    id: crypto.randomUUID(),
    type,
    aggregateId,
    aggregateType,
    version: 1,
    timestamp: new Date().toISOString(),
    data,
    metadata: metadata ?? {},
  };
}

export function createSessionEvent(
  type: EventTypeName,
  sessionId: string,
  data: unknown,
  metadata?: Record<string, unknown>,
): DomainEvent {
  return createDomainEvent(type, sessionId, 'session', data, metadata);
}

export function createWorkflowEvent(
  type: EventTypeName,
  sessionId: string,
  data: unknown,
  metadata?: Record<string, unknown>,
): DomainEvent {
  return createDomainEvent(type, sessionId, 'workflow', data, metadata);
}

export function createBuildEvent(
  type: EventTypeName,
  sessionId: string,
  data: unknown,
  metadata?: Record<string, unknown>,
): DomainEvent {
  return createDomainEvent(type, sessionId, 'build', data, metadata);
}

export function createDeploymentEvent(
  type: EventTypeName,
  sessionId: string,
  data: unknown,
  metadata?: Record<string, unknown>,
): DomainEvent {
  return createDomainEvent(type, sessionId, 'deployment', data, metadata);
}

// Event validation schemas
export const DomainEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  aggregateId: z.string(),
  aggregateType: z.string(),
  version: z.number(),
  timestamp: z.string().datetime(),
  data: z.any(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const SessionCreatedEventDataSchema = z.object({
  sessionId: z.string(),
  repoPath: z.string(),
  createdBy: z.string().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export const WorkflowStepCompletedEventDataSchema = z.object({
  sessionId: z.string(),
  step: z.string(),
  stepIndex: z.number(),
  totalSteps: z.number(),
  duration: z.number(),
  output: z.any(),
  nextStep: z.string().optional(),
});

export const BuildCompletedEventDataSchema = z.object({
  sessionId: z.string(),
  imageId: z.string(),
  tags: z.array(z.string()),
  size: z.number(),
  duration: z.number(),
  layers: z.number(),
});

export const ScanCompletedEventDataSchema = z.object({
  sessionId: z.string(),
  imageId: z.string(),
  scanner: z.string(),
  vulnerabilities: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  duration: z.number(),
});

export const ErrorOccurredEventDataSchema = z.object({
  sessionId: z.string().optional(),
  component: z.string(),
  operation: z.string(),
  error: z.string(),
  stack: z.string().optional(),
  context: z.record(z.string(), z.any()),
  recoverable: z.boolean(),
});

// Event handler interface
export interface EventHandler {
  handle(event: DomainEvent): Promise<void>;
  canHandle(eventType: string): boolean;
  priority?: number;
}

// Event bus interface for domain layer
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
  subscribe(eventType: EventTypeName, handler: EventHandler): void;
  unsubscribe(eventType: EventTypeName, handler: EventHandler): void;
  clear(): void;
  getSubscribers(eventType: EventTypeName): EventHandler[];
}

// Event store interface for persistence
export interface EventStore {
  append(event: DomainEvent): Promise<void>;
  appendAll(events: DomainEvent[]): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getEventsByType(eventType: EventTypeName, limit?: number): Promise<DomainEvent[]>;
  getEventsSince(timestamp: Date): Promise<DomainEvent[]>;
  getLatestEvents(limit: number): Promise<DomainEvent[]>;
}

// Type exports
export type DomainEventType = z.infer<typeof DomainEventSchema>;
export type SessionCreatedEventDataType = z.infer<typeof SessionCreatedEventDataSchema>;
export type WorkflowStepCompletedEventDataType = z.infer<
  typeof WorkflowStepCompletedEventDataSchema
>;
export type BuildCompletedEventDataType = z.infer<typeof BuildCompletedEventDataSchema>;
export type ScanCompletedEventDataType = z.infer<typeof ScanCompletedEventDataSchema>;
export type ErrorOccurredEventDataType = z.infer<typeof ErrorOccurredEventDataSchema>;
