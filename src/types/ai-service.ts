/**
 * AI Service Types
 */

import type { Result } from './core';

export interface AIValidationResult {
  ok: boolean;
  error?: string;
  warnings?: string[];
  suggestions?: string[];
}

export interface AIAnalysisResult {
  insights: string[];
  optimizations: string[];
  warnings: string[];
  nextSteps: string[];
}

export interface AIContext {
  sessionId?: string;
  toolHistory?: ToolHistoryEntry[];
  repositoryAnalysis?: unknown;
}

export interface ToolHistoryEntry {
  toolName: string;
  parameters: Record<string, unknown>;
  result: unknown;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface SessionManager {
  getToolHistory(sessionId: string): Promise<ToolHistoryEntry[]>;
  addToolExecution(sessionId: string, entry: ToolHistoryEntry): Promise<void>;
  getState(sessionId: string): Promise<unknown>;
  updateSessionState(sessionId: string, state: unknown): Promise<void>;
  trackToolStart(sessionId: string, toolName: string, params: ToolParameters): Promise<void>;
  trackToolEnd(sessionId: string, toolName: string, result: Result<ToolResult>): Promise<void>;
  trackToolError(sessionId: string, toolName: string, error: unknown): Promise<void>;
}

export interface AIService {
  validateParameters(
    toolName: string,
    params: Record<string, unknown>,
    context: AIContext,
  ): Promise<Result<AIValidationResult>>;

  analyzeResults(context: {
    toolName: string;
    parameters: Record<string, unknown>;
    result: unknown;
    sessionId: string;
    context?: unknown;
  }): Promise<Result<AIAnalysisResult>>;

  generateInsights(content: unknown, context: AIContext): Promise<Result<string[]>>;
}

export interface ToolParameters extends Record<string, unknown> {
  sessionId?: string;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  metadata?: Record<string, unknown>;
  errors?: string[];
}

export interface MetricsCollector {
  recordToolExecution(
    toolName: string,
    duration: number,
    success: boolean,
    metadata?: Record<string, unknown>,
  ): void;

  recordError(toolName: string, error: string, metadata?: Record<string, unknown>): void;
}
