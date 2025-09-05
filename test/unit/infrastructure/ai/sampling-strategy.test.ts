/**
 * Unit tests for SamplingStrategy
 * Tests intelligent parameter selection and context-aware adjustments
 */

import { describe, it, expect } from '@jest/globals';
import { SamplingStrategy, type SamplingContext } from '../../../../src/infrastructure/sampling-strategy';

describe('SamplingStrategy', () => {
  describe('Template-specific defaults', () => {
    it('should provide appropriate parameters for dockerfile-generation', () => {
      const params = SamplingStrategy.getParameters('dockerfile-generation');

      expect(params.temperature).toBe(0.2); // Moderate creativity
      expect(params.maxTokens).toBe(1500); // Adequate for Dockerfile
      expect(params.topP).toBe(0.95);
    });

    it('should provide appropriate parameters for repository-analysis', () => {
      const params = SamplingStrategy.getParameters('repository-analysis');

      expect(params.temperature).toBe(0.1); // High accuracy needed
      expect(params.maxTokens).toBe(800); // Concise analysis
      expect(params.topP).toBe(0.9);
    });

    it('should provide appropriate parameters for json-repair', () => {
      const params = SamplingStrategy.getParameters('json-repair');

      expect(params.temperature).toBe(0.1); // Very precise
      expect(params.maxTokens).toBe(500); // Short repairs
      expect(params.topP).toBe(1.0); // Maximum precision
    });

    it('should provide default parameters for unknown templates', () => {
      const params = SamplingStrategy.getParameters('unknown-template');

      expect(params.temperature).toBe(0.2);
      expect(params.maxTokens).toBe(1000);
      expect(params.topP).toBe(0.9);
    });
  });

  describe('Retry adjustments', () => {
    it('should increase temperature for retry attempts', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const retryParams = SamplingStrategy.getParameters('dockerfile-generation', {
        isRetry: true,
        attemptNumber: 2,
      });

      expect(retryParams.temperature).toBeGreaterThan(baseParams.temperature);
      expect(retryParams.maxTokens).toBeGreaterThanOrEqual(baseParams.maxTokens);
    });

    it('should progressively increase temperature with more attempts', () => {
      const attempt2 = SamplingStrategy.getParameters('dockerfile-generation', {
        attemptNumber: 2,
      });
      const attempt3 = SamplingStrategy.getParameters('dockerfile-generation', {
        attemptNumber: 3,
      });
      const attempt4 = SamplingStrategy.getParameters('dockerfile-generation', {
        attemptNumber: 4,
      });

      expect(attempt3.temperature).toBeGreaterThan(attempt2.temperature);
      expect(attempt4.temperature).toBeGreaterThan(attempt3.temperature);
    });

    it('should cap temperature increases', () => {
      const highAttempt = SamplingStrategy.getParameters('dockerfile-generation', {
        attemptNumber: 10,
      });

      expect(highAttempt.temperature).toBeLessThanOrEqual(0.8);
    });
  });

  describe('Error-based adjustments', () => {
    it('should reduce temperature when errors are frequent', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const errorParams = SamplingStrategy.getParameters('dockerfile-generation', {
        errorCount: 3,
      });

      expect(errorParams.temperature).toBeLessThan(baseParams.temperature);
      expect(errorParams.topP).toBeLessThan(baseParams.topP);
    });

    it('should maintain minimum temperature bounds', () => {
      const highErrorParams = SamplingStrategy.getParameters('dockerfile-generation', {
        errorCount: 10,
      });

      expect(highErrorParams.temperature).toBeGreaterThanOrEqual(0.05);
      expect(highErrorParams.topP).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Complexity adjustments', () => {
    it('should reduce parameters for low complexity', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const lowComplexityParams = SamplingStrategy.getParameters('dockerfile-generation', {
        complexity: 'low',
      });

      expect(lowComplexityParams.temperature).toBeLessThan(baseParams.temperature);
      expect(lowComplexityParams.maxTokens).toBeLessThan(baseParams.maxTokens);
    });

    it('should increase parameters for high complexity', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const highComplexityParams = SamplingStrategy.getParameters('dockerfile-generation', {
        complexity: 'high',
      });

      expect(highComplexityParams.temperature).toBeGreaterThan(baseParams.temperature);
      expect(highComplexityParams.maxTokens).toBeGreaterThan(baseParams.maxTokens);
    });

    it('should keep medium complexity unchanged', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const mediumComplexityParams = SamplingStrategy.getParameters('dockerfile-generation', {
        complexity: 'medium',
      });

      expect(mediumComplexityParams.temperature).toBe(baseParams.temperature);
      expect(mediumComplexityParams.maxTokens).toBe(baseParams.maxTokens);
    });
  });

  describe('Task type adjustments', () => {
    it('should reduce temperature for analysis tasks', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const analysisParams = SamplingStrategy.getParameters('dockerfile-generation', {
        taskType: 'analysis',
      });

      expect(analysisParams.temperature).toBeLessThan(baseParams.temperature);
    });

    it('should increase temperature for optimization tasks', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const optimizationParams = SamplingStrategy.getParameters('dockerfile-generation', {
        taskType: 'optimization',
      });

      expect(optimizationParams.temperature).toBeGreaterThan(baseParams.temperature);
      expect(optimizationParams.maxTokens).toBeGreaterThan(baseParams.maxTokens);
    });
  });

  describe('Content length adjustments', () => {
    it('should increase tokens for large content', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const largeContentParams = SamplingStrategy.getParameters('dockerfile-generation', {
        contentLength: 10000,
      });

      expect(largeContentParams.maxTokens).toBeGreaterThan(baseParams.maxTokens);
      expect(largeContentParams.temperature).toBeLessThan(baseParams.temperature); // More focused
    });

    it('should reduce tokens for small content', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const smallContentParams = SamplingStrategy.getParameters('dockerfile-generation', {
        contentLength: 200,
      });

      expect(smallContentParams.maxTokens).toBeLessThan(baseParams.maxTokens);
    });
  });

  describe('Time constraint adjustments', () => {
    it('should reduce parameters for fast requests', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const fastParams = SamplingStrategy.getParameters('dockerfile-generation', {
        timeConstraint: 'fast',
      });

      expect(fastParams.maxTokens).toBeLessThan(baseParams.maxTokens);
      expect(fastParams.temperature).toBeLessThan(baseParams.temperature);
    });

    it('should increase parameters for thorough requests', () => {
      const baseParams = SamplingStrategy.getParameters('dockerfile-generation');
      const thoroughParams = SamplingStrategy.getParameters('dockerfile-generation', {
        timeConstraint: 'thorough',
      });

      expect(thoroughParams.maxTokens).toBeGreaterThan(baseParams.maxTokens);
      expect(thoroughParams.temperature).toBeGreaterThan(baseParams.temperature);
    });
  });

  describe('Parameter constraints', () => {
    it('should enforce minimum temperature bounds', () => {
      const extremeParams = SamplingStrategy.getParameters('dockerfile-generation', {
        errorCount: 100, // Should drive temperature very low
        complexity: 'low', // Additional temperature reduction
      });

      expect(extremeParams.temperature).toBeGreaterThanOrEqual(0.05);
    });

    it('should enforce maximum temperature bounds', () => {
      const extremeParams = SamplingStrategy.getParameters('dockerfile-generation', {
        attemptNumber: 100, // Should drive temperature very high
        complexity: 'high', // Additional temperature increase
        taskType: 'optimization',
      });

      expect(extremeParams.temperature).toBeLessThanOrEqual(0.9);
    });

    it('should enforce token bounds', () => {
      const lowTokenParams = SamplingStrategy.getParameters('json-repair', {
        contentLength: 10,
        timeConstraint: 'fast',
      });

      const highTokenParams = SamplingStrategy.getParameters('dockerfile-generation', {
        complexity: 'high',
        contentLength: 20000,
        timeConstraint: 'thorough',
      });

      expect(lowTokenParams.maxTokens).toBeGreaterThanOrEqual(100);
      expect(highTokenParams.maxTokens).toBeLessThanOrEqual(4000);
    });

    it('should round token values to integers', () => {
      const params = SamplingStrategy.getParameters('dockerfile-generation', {
        contentLength: 1000, // Might cause fractional token calculation
      });

      expect(Number.isInteger(params.maxTokens)).toBe(true);
    });
  });

  describe('Combined context scenarios', () => {
    it('should handle multiple context factors together', () => {
      const complexContext: SamplingContext = {
        isRetry: true,
        attemptNumber: 3,
        complexity: 'high',
        taskType: 'optimization',
        contentLength: 5000,
        timeConstraint: 'thorough',
        errorCount: 1,
      };

      const params = SamplingStrategy.getParameters('dockerfile-generation', complexContext);

      // Should balance multiple factors
      expect(params.temperature).toBeGreaterThan(0.1);
      expect(params.temperature).toBeLessThan(0.8);
      expect(params.maxTokens).toBeGreaterThan(1500); // Increased for complexity and content
      expect(params.maxTokens).toBeLessThan(4000);
    });
  });

  describe('Utility methods', () => {
    it('should create default sampling context', () => {
      const context = SamplingStrategy.createContext();

      expect(context.complexity).toBe('medium');
      expect(context.taskType).toBe('generation');
      expect(context.timeConstraint).toBe('normal');
    });

    it('should merge options in createContext', () => {
      const context = SamplingStrategy.createContext({
        complexity: 'high',
        isRetry: true,
      });

      expect(context.complexity).toBe('high');
      expect(context.isRetry).toBe(true);
      expect(context.taskType).toBe('generation'); // Should keep defaults
    });

    it('should return template defaults for inspection', () => {
      const defaults = SamplingStrategy.getTemplateDefaults('dockerfile-generation');

      expect(defaults).not.toBeNull();
      expect(defaults?.temperature).toBe(0.2);
      expect(defaults?.maxTokens).toBe(1500);
    });

    it('should return null for unknown template defaults', () => {
      const defaults = SamplingStrategy.getTemplateDefaults('unknown-template');
      expect(defaults).toBeNull();
    });

    it('should provide consistent default parameters', () => {
      const defaults1 = SamplingStrategy.getDefaultParameters();
      const defaults2 = SamplingStrategy.getDefaultParameters();

      expect(defaults1).toEqual(defaults2);
      expect(defaults1.temperature).toBe(0.2);
      expect(defaults1.maxTokens).toBe(1000);
    });
  });
});
