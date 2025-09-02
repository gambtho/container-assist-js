/**
 * Unit tests for AIRequestBuilder
 * Tests the fluent interface and intelligent defaults
 */

import { describe, it, expect } from '@jest/globals';
import { AIRequestBuilder } from '../../../../src/infrastructure/ai-request-builder';
import type { AnalysisResult } from '../../../../src/contracts/types/session';

describe('AIRequestBuilder', () => {
  describe('Static factory method', () => {
    it('should create builder with template', () => {
      const builder = AIRequestBuilder.for('dockerfile-generation');
      const request = builder.build();
      
      expect(request.prompt).toContain('Dockerfile for');
      expect(request.temperature).toBe(0.2); // Should apply template defaults
      expect(request.maxTokens).toBe(1500); // Should apply template defaults
    });
  });

  describe('Fluent interface', () => {
    it('should chain methods fluently', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .withVariables({ test: 'value' })
        .withSampling(0.5, 1000)
        .build();

      expect(request.prompt).toContain('Analyze repository');
      expect(request.context?.test).toBe('value');
      expect(request.temperature).toBe(0.5);
      expect(request.maxTokens).toBe(1000);
    });

    it('should merge variables correctly', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withVariables({ first: 'value1' })
        .withVariables({ second: 'value2' })
        .build();

      expect(request.context?.first).toBe('value1');
      expect(request.context?.second).toBe('value2');
    });
  });

  describe('Context extraction', () => {
    it('should extract context from analysis result', () => {
      const analysis: AnalysisResult = {
        language: 'javascript',
        language_version: '18',
        framework: 'express',
        framework_version: '4.18.0',
        dependencies: [
          { name: 'express', type: 'runtime', version: '4.18.0' },
          { name: 'nodemon', type: 'dev', version: '2.0.0' }
        ],
        build_system: {
          type: 'npm',
          build_file: 'package.json',
          build_command: 'npm run build'
        },
        ports: [3000],
        entry_points: ['index.js']
      };

      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withContext(analysis)
        .build();

      expect(request.context?.language).toBe('javascript');
      expect(request.context?.languageVersion).toBe('18');
      expect(request.context?.framework).toBe('express');
      expect(request.context?.frameworkVersion).toBe('4.18.0');
      expect(request.context?.dependencies).toBe('express');
      expect(request.context?.devDependencies).toBe('nodemon');
      expect(request.context?.buildSystemType).toBe('npm');
      expect(request.context?.port).toBe(3000);
      expect(request.context?.entryPoint).toBe('index.js');
    });

    it('should handle missing optional fields in analysis', () => {
      const analysis: AnalysisResult = {
        language: 'python'
      };

      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withContext(analysis)
        .build();

      expect(request.context?.language).toBe('python');
      expect(request.context?.languageVersion).toBe('');
      expect(request.context?.dependencies).toBe('');
      expect(request.context?.devDependencies).toBe('');
    });
  });

  describe('Docker context', () => {
    it('should add Docker-specific variables', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withDockerContext({
          baseImage: 'node:18-alpine',
          optimization: 'security',
          multistage: true,
          securityHardening: true,
          includeHealthcheck: false
        })
        .build();

      expect(request.context?.baseImage).toBe('node:18-alpine');
      expect(request.context?.optimization).toBe('security');
      expect(request.context?.multistage).toBe(true);
      expect(request.context?.securityHardening).toBe(true);
      expect(request.context?.includeHealthcheck).toBe(false);
    });

    it('should apply Docker context defaults', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withDockerContext({})
        .build();

      expect(request.context?.baseImage).toBe('default');
      expect(request.context?.optimization).toBe('balanced');
      expect(request.context?.multistage).toBe(true);
      expect(request.context?.securityHardening).toBe(true);
      expect(request.context?.includeHealthcheck).toBe(true);
    });
  });

  describe('Error context', () => {
    it('should add error recovery variables', () => {
      const request = AIRequestBuilder
        .for('dockerfile-fix')
        .withErrorContext({
          previousError: 'JSON parsing failed',
          malformedContent: '{"invalid": json}',
          attempt: 2,
          previousAttempts: ['attempt 1', 'attempt 2']
        })
        .build();

      expect(request.context?.error_message).toBe('JSON parsing failed');
      expect(request.context?.malformed_content).toBe('{"invalid": json}');
      expect(request.context?.attempt).toBe(2);
      expect(request.context?.previous_attempts).toBe('attempt 1; attempt 2');
      expect(request.context?.repair_instruction).toBe('Fix the content and return only valid output');
    });
  });

  describe('Session context', () => {
    it('should add session variables', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withSession('session-123', { extra: 'data' })
        .build();

      expect(request.context?.sessionId).toBe('session-123');
      expect(request.context?.extra).toBe('data');
    });
  });

  describe('Template-specific defaults', () => {
    it('should apply defaults for dockerfile-generation', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .build();

      expect(request.temperature).toBe(0.2);
      expect(request.maxTokens).toBe(1500);
      expect(request.prompt).toContain('Dockerfile for');
    });

    it('should apply defaults for repository-analysis', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .build();

      expect(request.temperature).toBe(0.1); // Updated from SamplingStrategy
      expect(request.maxTokens).toBe(800); // Updated from SamplingStrategy
      expect(request.prompt).toContain('Analyze repository');
    });

    it('should apply defaults for dockerfile-fix', () => {
      const request = AIRequestBuilder
        .for('dockerfile-fix')
        .build();

      expect(request.temperature).toBe(0.3);
      expect(request.maxTokens).toBe(1000); // Updated from SamplingStrategy
      expect(request.prompt).toContain('Fix Dockerfile error');
    });
  });

  describe('Error handling', () => {
    it('should throw error when no template ID is set', () => {
      const builder = new (AIRequestBuilder as any)();
      
      expect(() => {
        builder.build();
      }).toThrow('Template ID is required');
    });
  });

  describe('Method overrides', () => {
    it('should allow overriding template defaults', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation') // defaults: temp=0.2, tokens=1500
        .withSampling(0.5, 2000)
        .build();

      expect(request.temperature).toBe(0.5);
      expect(request.maxTokens).toBe(2000);
      expect(request.prompt).toContain('Dockerfile for');
    });

    it('should preserve explicit undefined values', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withSampling(undefined, 1000) // Only override maxTokens
        .build();

      expect(request.temperature).toBe(0.2); // Should keep template default
      expect(request.maxTokens).toBe(1000); // Should use override
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete Dockerfile generation scenario', () => {
      const analysis: AnalysisResult = {
        language: 'javascript',
        language_version: '18',
        framework: 'express',
        dependencies: [{ name: 'express', type: 'runtime' }],
        build_system: { type: 'npm', build_file: 'package.json' },
        ports: [3000],
        entry_points: ['server.js']
      };

      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withContext(analysis)
        .withSession('session-456')
        .withDockerContext({
          baseImage: 'node:18-alpine',
          optimization: 'balanced',
          multistage: true
        })
        .withVariables({
          customInstructions: 'Use multi-stage build',
          customCommands: 'RUN apt-get update'
        })
        .build();

      // Verify all context is properly set
      expect(request.prompt).toContain('Dockerfile for javascript');
      expect(request.context?.language).toBe('javascript');
      expect(request.context?.sessionId).toBe('session-456');
      expect(request.context?.baseImage).toBe('node:18-alpine');
      expect(request.context?.customInstructions).toBe('Use multi-stage build');
      expect(request.temperature).toBe(0.2);
      expect(request.maxTokens).toBe(1500);
    });
  });
});