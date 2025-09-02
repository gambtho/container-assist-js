/**
 * AI Service Type Definitions
 * Core types for AI/ML functionality
 */

import type { MCPSampler } from './mcp-sampler';

// Re-export MCPSampler for backward compatibility
export type { MCPSampler, MCPSampleResponse, MCPSampleError } from './mcp-sampler';

/**
 * Anthropic-like client interface for AI operations
 */
export interface AIClient {
  messages: {
    create(request: AIRequest): Promise<AIClientResponse>;
  };
}

/**
 * AI Request structure
 */
export interface AIRequest {
  model?: string;
  messages: AIMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

/**
 * AI Message structure
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * AI Client Response
 */
export interface AIClientResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * AI Service Configuration
 */
export interface AIServiceConfig {
  sampler?: MCPSampler;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  cache?: {
    enabled: boolean;
    ttl?: number;
    maxSize?: number;
  };
}

/**
 * AI Analysis Result
 */
export interface AIAnalysisResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    model: string;
    tokensUsed?: number;
    executionTime?: number;
    cached?: boolean;
  };
}

/**
 * AI Content Generation Result
 */
export interface AIGenerationResult {
  content: string;
  format?: 'text' | 'json' | 'markdown' | 'yaml';
  confidence?: number;
  metadata?: {
    model: string;
    tokensUsed?: number;
    executionTime?: number;
  };
}
