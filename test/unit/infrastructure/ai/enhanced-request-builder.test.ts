/**
 * Tests for enhanced AIRequestBuilder with dynamic sampling
 * Verifies integration with SamplingStrategy
 */

import { describe, it, expect } from '@jest/globals';
import { AIRequestBuilder } from '../../../../src/infrastructure/ai-request-builder';
import type { AnalysisResult } from '../../../../src/contracts/types/session';

describe('Enhanced AIRequestBuilder with Dynamic Sampling', () => {
  const mockAnalysis: AnalysisResult = {
    language: 'python',
    language_version: '3.11',
    framework: 'fastapi',
    dependencies: [{ name: 'fastapi', type: 'runtime' }],
    build_system: { type: 'pip', build_file: 'requirements.txt' },
    ports: [8000],
    entry_points: ['main.py']
  };

  describe('Sampling context integration', () => {
    it('should use dynamic sampling parameters by default', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .build();

      // Should use sampling strategy defaults, not hardcoded template defaults
      expect(request.temperature).toBe(0.1); // From SamplingStrategy, not template
      expect(request.maxTokens).toBe(800);
    });

    it('should allow explicit parameter override', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .withSampling(0.5, 1500)
        .build();

      expect(request.temperature).toBe(0.5); // Explicit override
      expect(request.maxTokens).toBe(1500); // Explicit override
    });

    it('should apply sampling context adjustments', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withSamplingContext({
          complexity: 'high',
          taskType: 'optimization'
        })
        .build();

      const baseRequest = AIRequestBuilder
        .for('dockerfile-generation')
        .build();

      // Should adjust parameters based on context
      expect(request.temperature).toBeGreaterThan(baseRequest.temperature);
      expect(request.maxTokens).toBeGreaterThan(baseRequest.maxTokens);
    });
  });

  describe('Retry scenarios', () => {
    it('should configure retry parameters automatically', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .forRetry(3, ['Error 1', 'Error 2'])
        .build();

      const baseRequest = AIRequestBuilder
        .for('dockerfile-generation')
        .build();

      // Should increase temperature and tokens for retry
      expect(request.temperature).toBeGreaterThan(baseRequest.temperature);
      expect(request.context?._samplingContext?.isRetry).toBe(true);
      expect(request.context?._samplingContext?.attemptNumber).toBe(3);
      expect(request.context?._samplingContext?.errorCount).toBe(2);
    });

    it('should handle retry with no previous errors', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .forRetry(2)
        .build();

      expect(request.context?._samplingContext?.isRetry).toBe(true);
      expect(request.context?._samplingContext?.attemptNumber).toBe(2);
      expect(request.context?._samplingContext?.errorCount).toBe(0);
    });
  });

  describe('Complexity configuration', () => {
    it('should adjust for low complexity', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withComplexity('low')
        .build();

      const baseRequest = AIRequestBuilder
        .for('dockerfile-generation')
        .build();

      expect(request.temperature).toBeLessThanOrEqual(baseRequest.temperature);
      expect(request.maxTokens).toBeLessThan(baseRequest.maxTokens);
    });

    it('should adjust for high complexity', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withComplexity('high')
        .build();

      const baseRequest = AIRequestBuilder
        .for('dockerfile-generation')
        .build();

      expect(request.temperature).toBeGreaterThan(baseRequest.temperature);
      expect(request.maxTokens).toBeGreaterThan(baseRequest.maxTokens);
    });
  });

  describe('Time constraint configuration', () => {
    it('should optimize for fast responses', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withTimeConstraint('fast')
        .build();

      const baseRequest = AIRequestBuilder
        .for('dockerfile-generation')
        .build();

      expect(request.maxTokens).toBeLessThan(baseRequest.maxTokens);
      expect(request.temperature).toBeLessThanOrEqual(baseRequest.temperature);
    });

    it('should configure for thorough analysis', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .withTimeConstraint('thorough')
        .build();

      const baseRequest = AIRequestBuilder
        .for('repository-analysis')
        .build();

      expect(request.maxTokens).toBeGreaterThan(baseRequest.maxTokens);
    });
  });

  describe('Context chaining', () => {
    it('should chain sampling context methods', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withContext(mockAnalysis)
        .withComplexity('high')
        .withTimeConstraint('thorough')
        .forRetry(2, ['Previous error'])
        .withDockerContext({
          optimization: 'security',
          multistage: true
        })
        .build();

      // Should contain all context information
      expect(request.context?.language).toBe('python');
      expect(request.context?.optimization).toBe('security');
      expect(request.context?._samplingContext?.complexity).toBe('high');
      expect(request.context?._samplingContext?.timeConstraint).toBe('thorough');
      expect(request.context?._samplingContext?.isRetry).toBe(true);
      expect(request.context?._samplingContext?.attemptNumber).toBe(2);
    });

    it('should merge sampling context with explicit context', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withSamplingContext({
          complexity: 'low',
          taskType: 'analysis'
        })
        .withComplexity('high') // Should override
        .build();

      expect(request.context?._samplingContext?.complexity).toBe('high');
      expect(request.context?._samplingContext?.taskType).toBe('analysis');
    });
  });

  describe('Template-specific optimization', () => {
    it('should optimize json-repair for precision', () => {
      const request = AIRequestBuilder
        .for('json-repair')
        .withErrorContext({
          malformedContent: '{"invalid": json}',
          previousError: 'Parse error'
        })
        .build();

      // Should use very low temperature for JSON repair
      expect(request.temperature).toBe(0.1);
      expect(request.maxTokens).toBe(500);
    });

    it('should optimize optimization-suggestion for creativity', () => {
      const request = AIRequestBuilder
        .for('optimization-suggestion')
        .withVariables({
          dockerfile: 'FROM ubuntu\\nRUN apt-get update'
        })
        .build();

      // Should use higher temperature for creative suggestions
      expect(request.temperature).toBe(0.4);
      expect(request.maxTokens).toBe(800);
    });
  });

  describe('Error scenario handling', () => {
    it('should handle JSON repair with retry context', () => {
      const request = AIRequestBuilder
        .for('json-repair')
        .forRetry(2, ['Invalid JSON format'])
        .withErrorContext({
          malformedContent: '{"broken": json}',
          previousError: 'Syntax error at position 12'
        })
        .build();

      // Should balance precision needs with retry adjustments
      expect(request.temperature).toBeGreaterThan(0.1); // Increased from base
      expect(request.temperature).toBeLessThan(0.5); // But still precise
      expect(request.context?.malformed_content).toBe('{"broken": json}');
    });

    it('should optimize dockerfile fixes with error context', () => {
      const request = AIRequestBuilder
        .for('dockerfile-fix')
        .withComplexity('high')
        .withErrorContext({
          malformedContent: 'FROM node\\nRUN broken command',
          previousError: 'Command failed'
        })
        .forRetry(1)
        .build();

      expect(request.prompt).toContain('Fix Dockerfile error');
      expect(request.context?.dockerfile).toBe('FROM node\\nRUN broken command');
      expect(request.context?.error_message).toBe('Command failed');
    });
  });

  describe('Parameter bounds enforcement', () => {
    it('should enforce bounds with extreme context', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .forRetry(10) // High retry count
        .withComplexity('high') // High complexity
        .withSamplingContext({
          errorCount: 5, // Many errors
          taskType: 'optimization'
        })
        .build();

      // Should stay within bounds despite extreme context
      expect(request.temperature).toBeGreaterThanOrEqual(0.05);
      expect(request.temperature).toBeLessThanOrEqual(0.9);
      expect(request.maxTokens).toBeGreaterThanOrEqual(100);
      expect(request.maxTokens).toBeLessThanOrEqual(4000);
    });
  });

  describe('Debugging and inspection', () => {
    it('should include sampling context in request context', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withComplexity('high')
        .forRetry(2)
        .build();

      const samplingContext = request.context?._samplingContext;
      expect(samplingContext).toBeDefined();
      expect(samplingContext?.complexity).toBe('high');
      expect(samplingContext?.isRetry).toBe(true);
      expect(samplingContext?.attemptNumber).toBe(2);
    });

    it('should preserve all variable context alongside sampling context', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withContext(mockAnalysis)
        .withVariables({ customVar: 'test' })
        .withComplexity('medium')
        .build();

      expect(request.context?.language).toBe('python');
      expect(request.context?.customVar).toBe('test');
      expect(request.context?._samplingContext?.complexity).toBe('medium');
    });
  });
});