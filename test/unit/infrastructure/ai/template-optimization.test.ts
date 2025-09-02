/**
 * Template optimization validation
 * Verifies token reduction and prompt effectiveness
 */

import { describe, it, expect } from '@jest/globals';
import { AIRequestBuilder, PROMPT_TEMPLATES } from '../../../../src/infrastructure/ai-request-builder';
import type { AnalysisResult } from '../../../../src/contracts/types/session';

describe('Template Optimization', () => {
  const mockAnalysis: AnalysisResult = {
    language: 'javascript',
    language_version: '18',
    framework: 'express',
    framework_version: '4.18.0',
    dependencies: [
      { name: 'express', type: 'runtime' },
      { name: 'cors', type: 'runtime' },
      { name: 'nodemon', type: 'dev' }
    ],
    build_system: { type: 'npm', build_file: 'package.json' },
    ports: [3000],
    entry_points: ['server.js']
  };

  describe('Token efficiency', () => {
    it('should generate concise dockerfile prompts', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withContext(mockAnalysis)
        .withDockerContext({
          baseImage: 'node:18-alpine',
          optimization: 'balanced',
          multistage: true,
          securityHardening: true,
          includeHealthcheck: true
        })
        .build();

      // The optimized prompt should be significantly shorter
      const promptLength = request.prompt.length;
      expect(promptLength).toBeLessThan(300); // Should be much shorter than original
      
      // But still contain essential information
      expect(request.prompt).toContain('javascript');
      expect(request.prompt).toContain('express');
      expect(request.prompt).toContain('npm');
      expect(request.prompt).toContain('server.js');
      expect(request.prompt).toContain('3000');
      expect(request.prompt).toContain('balanced optimization');
      expect(request.prompt).toContain('multi-stage');
      expect(request.prompt).toContain('security-hardened');
      expect(request.prompt).toContain('health check');
    });

    it('should generate concise repository analysis prompts', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .withVariables({
          fileList: 'package.json\\nsrc/index.js\\nsrc/routes.js',
          configFiles: '{"package.json": "{\\"name\\": \\"test\\"}"}',
          directoryTree: 'src/\\n├── index.js\\n└── routes.js'
        })
        .build();

      const promptLength = request.prompt.length;
      expect(promptLength).toBeLessThan(400); // Still shorter but more realistic
      
      // Should still contain key elements
      expect(request.prompt).toContain('Analyze repository');
      expect(request.prompt).toContain('JSON only');
      expect(request.prompt).toContain('Files:');
      expect(request.prompt).toContain('Config:');
      expect(request.prompt).toContain('Tree:');
    });

    it('should generate concise error fix prompts', () => {
      const request = AIRequestBuilder
        .for('dockerfile-fix')
        .withErrorContext({
          malformedContent: 'FROM node:18\\nRUN invalid command',
          previousError: 'Command failed with exit code 1'
        })
        .build();

      const promptLength = request.prompt.length;
      expect(promptLength).toBeLessThan(250); // Shorter but more realistic
      
      // Should contain fix essentials
      expect(request.prompt).toContain('Fix Dockerfile error');
      expect(request.prompt).toContain('Current:');
      expect(request.prompt).toContain('Error:');
      expect(request.prompt).toContain('security');
    });
  });

  describe('Template defaults optimization', () => {
    it('should use reduced token limits for analysis', () => {
      const request = AIRequestBuilder
        .for('repository-analysis')
        .build();
        
      expect(request.maxTokens).toBe(800); // Reduced from 1200
    });

    it('should use reduced token limits for fixes', () => {
      const request = AIRequestBuilder
        .for('dockerfile-fix')
        .build();
        
      expect(request.maxTokens).toBe(1000); // Reduced from 1200
    });

    it('should have appropriate temperature for each task', () => {
      const dockerfileRequest = AIRequestBuilder.for('dockerfile-generation').build();
      const analysisRequest = AIRequestBuilder.for('repository-analysis').build();
      const fixRequest = AIRequestBuilder.for('dockerfile-fix').build();

      expect(dockerfileRequest.temperature).toBe(0.2); // Low for consistency
      expect(analysisRequest.temperature).toBe(0.1); // Very low for accuracy
      expect(fixRequest.temperature).toBe(0.3); // Slightly higher for creativity
    });
  });

  describe('New optimized templates', () => {
    it('should include optimization-suggestion template', () => {
      const request = AIRequestBuilder
        .for('optimization-suggestion')
        .withVariables({
          dockerfile: 'FROM ubuntu:latest\\nRUN apt-get update'
        })
        .build();

      expect(request.prompt).toContain('Suggest Docker optimizations');
      expect(request.temperature).toBe(0.4); // Higher for creative suggestions
      expect(request.maxTokens).toBe(800);
    });

    it('should include error-analysis template', () => {
      const request = AIRequestBuilder
        .for('error-analysis')
        .withVariables({
          command: 'docker build .',
          error_output: 'Step 3/5 : RUN npm install\\nERROR: Package not found',
          build_context: 'Node.js application'
        })
        .build();

      expect(request.prompt).toContain('Analyze build error');
      expect(request.temperature).toBe(0.2); // Updated to match SamplingStrategy
      expect(request.maxTokens).toBe(600); // Compact error analysis
    });
  });

  describe('Conditional rendering', () => {
    it('should handle missing optional values gracefully', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withVariables({
          language: 'python',
          buildSystemType: 'pip',
          entryPoint: 'app.py',
          port: 8000,
          optimization: 'size'
          // No languageVersion, framework, etc.
        })
        .build();

      // Should not have empty conditional blocks
      expect(request.prompt).not.toContain('+ '); // No framework
      expect(request.prompt).not.toContain('python '); // No version after python
      expect(request.prompt).toContain('python'); // But should contain language
      expect(request.prompt).toContain('size optimization');
    });

    it('should include conditional values when present', () => {
      const request = AIRequestBuilder
        .for('dockerfile-generation')
        .withVariables({
          language: 'javascript',
          languageVersion: '18',
          framework: 'express',
          buildSystemType: 'npm',
          entryPoint: 'server.js',
          port: 3000,
          optimization: 'balanced',
          multistage: true,
          securityHardening: true,
          includeHealthcheck: false
        })
        .build();

      expect(request.prompt).toContain('javascript 18');
      expect(request.prompt).toContain('+ express');
      expect(request.prompt).toContain('multi-stage');
      expect(request.prompt).toContain('security-hardened');
      expect(request.prompt).not.toContain('health check'); // Should be omitted when false
    });
  });

  describe('Prompt structure validation', () => {
    it('should maintain essential structure elements', () => {
      const templates = Object.keys(PROMPT_TEMPLATES);
      
      templates.forEach(templateId => {
        const request = AIRequestBuilder
          .for(templateId as any)
          .build();

        // Every prompt should end with clear output instruction
        expect(request.prompt).toContain('Output:');
        
        // Should be concise
        expect(request.prompt.length).toBeLessThan(400);
        
        // Should not contain verbose explanations
        expect(request.prompt).not.toContain('explanation');
        expect(request.prompt).not.toContain('Generate a production-ready');
        expect(request.prompt).not.toContain('**Technology Stack:**');
      });
    });
  });
});