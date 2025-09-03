/**
 * Tests for AI Error Context System
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ErrorContext,
  ErrorType,
  ErrorContextFactory,
  ErrorContextUtils,
  type FailurePattern
} from '../error-context.js';
import type { AIRequest } from '../../ai-request-builder.js';

describe('ErrorContextFactory', () => {
  const sampleRequest: Partial<AIRequest> = {
    prompt: 'Generate a Dockerfile',
    temperature: 0.2,
    maxTokens: 1500,
    model: 'claude-3-opus'
  };

  const sampleVariables = {
    language: 'python',
    framework: 'fastapi',
    port: 8000
  };

  describe('createInitial', () => {
    it('should create initial error context with correct structure', () => {
      const error = new Error('JSON parsing failed: unexpected token');

      const context = ErrorContextFactory.createInitial(
        'dockerfile-generation',
        sampleVariables,
        sampleRequest,
        error
      );

      expect(context.attempt).toBe(1);
      expect(context.previousErrors).toEqual(['JSON parsing failed: unexpected token']);
      expect(context.templateId).toBe('dockerfile-generation');
      expect(context.originalVariables).toEqual(sampleVariables);
      expect(context.originalRequest).toEqual(sampleRequest);
      expect(context.errorType).toBe(ErrorType.PARSING_ERROR);
      expect(context.strategiesUsed).toEqual([]);
      expect(context.metadata?.firstErrorTimestamp).toBeDefined();
      expect(context.metadata?.modelsAttempted).toEqual(['claude-3-opus']);
    });

    it('should classify error types correctly', () => {
      const testCases = [
        { message: 'JSON parsing failed', expected: ErrorType.PARSING_ERROR },
        {
          message: 'Schema validation error: required field missing',
          expected: ErrorType.SCHEMA_VALIDATION
        },
        { message: 'Request timed out after 30s', expected: ErrorType.TIMEOUT },
        { message: 'Rate limit exceeded', expected: ErrorType.RATE_LIMIT },
        { message: 'Content filtered by safety system', expected: ErrorType.CONTENT_FILTER },
        { message: 'Network connection failed', expected: ErrorType.NETWORK_ERROR },
        { message: 'Model returned error', expected: ErrorType.MODEL_ERROR },
        { message: 'Template variable not found', expected: ErrorType.TEMPLATE_ERROR },
        { message: 'Something went wrong', expected: ErrorType.UNKNOWN }
      ];

      testCases.forEach(({ message, expected }) => {
        const error = new Error(message);
        const context = ErrorContextFactory.createInitial('test-template', {}, {}, error);
        expect(context.errorType).toBe(expected);
      });
    });

    it('should detect failure patterns correctly', () => {
      const error = new Error('Unexpected token at position 45 in JSON');

      const context = ErrorContextFactory.createInitial('test-template', {}, {}, error);

      expect(context.patterns).toHaveLength(1);
      expect(context.patterns![0].type).toBe('json_syntax');
      expect(context.patterns![0].confidence).toBe(0.9);
      expect(context.patterns![0].description).toContain('Invalid JSON syntax');
    });
  });

  describe('updateForFailure', () => {
    let initialContext: ErrorContext;

    beforeEach(() => {
      const error = new Error('Initial error');
      initialContext = ErrorContextFactory.createInitial(
        'test-template',
        sampleVariables,
        sampleRequest,
        error
      );
    });

    it('should increment attempt number and add new error', () => {
      const newError = new Error('Second attempt failed');

      const updated = ErrorContextFactory.updateForFailure(
        initialContext,
        newError,
        'json_repair',
        { partial: 'data' }
      );

      expect(updated.attempt).toBe(2);
      expect(updated.previousErrors).toHaveLength(2);
      expect(updated.previousErrors[1]).toBe('Second attempt failed');
      expect(updated.strategiesUsed).toEqual(['json_repair']);
      expect(updated.partialResult).toEqual({ partial: 'data' });
    });

    it('should update metadata correctly', () => {
      const newError = new Error('Timeout occurred');

      // Mock timestamps for consistent testing
      const originalTimestamp = Date.now() - 1000;
      initialContext.metadata!.firstErrorTimestamp = originalTimestamp;

      const updated = ErrorContextFactory.updateForFailure(
        initialContext,
        newError,
        'retry_strategy'
      );

      expect(updated.metadata?.lastErrorTimestamp).toBeGreaterThan(originalTimestamp);
      expect(updated.metadata?.totalElapsedMs).toBeGreaterThanOrEqual(0);
      expect(updated.errorType).toBe(ErrorType.TIMEOUT); // Should update to more specific type
    });

    it('should merge failure patterns correctly', () => {
      // Initial context with JSON syntax pattern
      const jsonError = new Error('Unexpected token in JSON');
      const contextWithPattern = ErrorContextFactory.createInitial('test', {}, {}, jsonError);

      // New error with incomplete response pattern
      const incompleteError = new Error('Response was truncated');

      const updated = ErrorContextFactory.updateForFailure(
        contextWithPattern,
        incompleteError,
        'test_strategy'
      );

      expect(updated.patterns).toHaveLength(2);
      expect(updated.patterns?.map((p) => p.type)).toContain('json_syntax');
      expect(updated.patterns?.map((p) => p.type)).toContain('incomplete_response');
    });
  });

  describe('shouldAbandonRecovery', () => {
    it('should abandon recovery after too many attempts', () => {
      const context: ErrorContext = {
        attempt: 6,
        previousErrors: ['error1', 'error2', 'error3', 'error4', 'error5', 'error6'],
        templateId: 'test',
        originalVariables: {}
      };

      expect(ErrorContextFactory.shouldAbandonRecovery(context)).toBe(true);
    });

    it('should abandon recovery if taking too long', () => {
      const context: ErrorContext = {
        attempt: 3,
        previousErrors: ['error1', 'error2', 'error3'],
        templateId: 'test',
        originalVariables: {},
        metadata: {
          totalElapsedMs: 65000 // Over 60 seconds
        }
      };

      expect(ErrorContextFactory.shouldAbandonRecovery(context)).toBe(true);
    });

    it('should abandon recovery if same error repeats', () => {
      const context: ErrorContext = {
        attempt: 4,
        previousErrors: ['same error', 'same error', 'same error'],
        templateId: 'test',
        originalVariables: {}
      };

      expect(ErrorContextFactory.shouldAbandonRecovery(context)).toBe(true);
    });

    it('should abandon recovery if too many tokens used', () => {
      const context: ErrorContext = {
        attempt: 3,
        previousErrors: ['error1', 'error2', 'error3'],
        templateId: 'test',
        originalVariables: {},
        metadata: {
          tokensUsed: 12000 // Over 10k tokens
        }
      };

      expect(ErrorContextFactory.shouldAbandonRecovery(context)).toBe(true);
    });

    it('should continue recovery for reasonable context', () => {
      const context: ErrorContext = {
        attempt: 2,
        previousErrors: ['error1', 'error2'],
        templateId: 'test',
        originalVariables: {},
        metadata: {
          totalElapsedMs: 5000,
          tokensUsed: 2000
        }
      };

      expect(ErrorContextFactory.shouldAbandonRecovery(context)).toBe(false);
    });
  });

  describe('getRecoveryPriorities', () => {
    it('should prioritize strategies based on error type', () => {
      const context: ErrorContext = {
        attempt: 1,
        previousErrors: ['JSON parsing failed'],
        templateId: 'test',
        originalVariables: {},
        errorType: ErrorType.PARSING_ERROR
      };

      const priorities = ErrorContextFactory.getRecoveryPriorities(context);

      expect(priorities[0]).toBe('json_repair');
      expect(priorities[1]).toBe('simplification');
    });

    it('should add priorities based on failure patterns', () => {
      const context: ErrorContext = {
        attempt: 1,
        previousErrors: ['Schema validation failed'],
        templateId: 'test',
        originalVariables: {},
        errorType: ErrorType.SCHEMA_VALIDATION,
        patterns: [
          {
            type: 'json_syntax',
            confidence: 0.9,
            description: 'JSON syntax error'
          }
        ]
      };

      const priorities = ErrorContextFactory.getRecoveryPriorities(context);

      expect(priorities[0]).toBe('json_repair'); // From pattern (higher priority)
      expect(priorities).toContain('schema_guidance'); // From error type
    });

    it('should add fallback for high attempt numbers', () => {
      const context: ErrorContext = {
        attempt: 3,
        previousErrors: ['error1', 'error2', 'error3'],
        templateId: 'test',
        originalVariables: {},
        errorType: ErrorType.UNKNOWN
      };

      const priorities = ErrorContextFactory.getRecoveryPriorities(context);

      expect(priorities).toContain('fallback_default');
    });
  });
});

describe('ErrorContextUtils', () => {
  const sampleContext: ErrorContext = {
    attempt: 2,
    previousErrors: ['First error', 'Second error'],
    templateId: 'dockerfile-generation',
    originalVariables: { language: 'python' },
    errorType: ErrorType.PARSING_ERROR,
    patterns: [
      {
        type: 'json_syntax',
        confidence: 0.8,
        description: 'JSON syntax issues detected'
      }
    ],
    strategiesUsed: ['json_repair'],
    metadata: {
      totalElapsedMs: 5000,
      tokensUsed: 1500,
      modelsAttempted: ['claude-3-opus']
    }
  };

  describe('getSummary', () => {
    it('should create human-readable summary', () => {
      const summary = ErrorContextUtils.getSummary(sampleContext);

      expect(summary).toContain('Attempt 2 failed after 5s');
      expect(summary).toContain('parsing');
      expect(summary).toContain('JSON syntax issues detected');
    });
  });

  describe('getLastError', () => {
    it('should return most recent error', () => {
      const lastError = ErrorContextUtils.getLastError(sampleContext);
      expect(lastError).toBe('Second error');
    });

    it('should handle empty error array', () => {
      const emptyContext = { ...sampleContext, previousErrors: [] };
      const lastError = ErrorContextUtils.getLastError(emptyContext);
      expect(lastError).toBe('Unknown error');
    });
  });

  describe('hasTriedStrategy', () => {
    it('should detect tried strategies', () => {
      expect(ErrorContextUtils.hasTriedStrategy(sampleContext, 'json_repair')).toBe(true);
      expect(ErrorContextUtils.hasTriedStrategy(sampleContext, 'simplification')).toBe(false);
    });
  });

  describe('getUnusedStrategies', () => {
    it('should filter out used strategies', () => {
      const available = ['json_repair', 'simplification', 'alternative_template'];
      const unused = ErrorContextUtils.getUnusedStrategies(sampleContext, available);

      expect(unused).toEqual(['simplification', 'alternative_template']);
    });
  });

  describe('getDebugInfo', () => {
    it('should provide comprehensive debug information', () => {
      const debugInfo = ErrorContextUtils.getDebugInfo(sampleContext);

      expect(debugInfo).toMatchObject({
        attempt: 2,
        errorType: ErrorType.PARSING_ERROR,
        patterns: [{ type: 'json_syntax', confidence: 0.8 }],
        strategiesUsed: ['json_repair'],
        tokensUsed: 1500,
        elapsedMs: 5000,
        modelsAttempted: ['claude-3-opus'],
        errorCount: 2,
        hasPartialResult: false
      });
    });
  });
});
