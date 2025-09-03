/**
 * Structured Sampler Tests
 * Comprehensive tests for AI reliability features
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import { StructuredSampler } from '../../../../src/infrastructure/ai/structured-sampler.js';
import type { MCPSampler, AIResponse } from '../../../../src/infrastructure/ai/types.js';
import { createMockLogger } from '../../../utils/test-helpers.js';
import type { Logger } from 'pino';

// Test schema for validation
const TestSchema = z.object({
  language: z.string(),
  framework: z.string().optional(),
  version: z.string().optional(),
  dependencies: z.array(z.string()).default([])
});

type TestData = z.infer<typeof TestSchema>;

// Mock MCP Sampler
class MockMCPSampler implements MCPSampler {
  private responses: AIResponse[] = [];
  private currentIndex = 0;
  
  setResponses(responses: AIResponse[]) {
    this.responses = responses;
    this.currentIndex = 0;
  }
  
  async sample<T = any>(): Promise<AIResponse<T>> {
    if (this.currentIndex >= this.responses.length) {
      return {
        success: false,
        content: null as T,
        error: new Error('No more mock responses')
      };
    }
    
    return this.responses[this.currentIndex++] as AIResponse<T>;
  }
}

describe('StructuredSampler', () => {
  let mockSampler: MockMCPSampler;
  let structuredSampler: StructuredSampler;
  let mockLogger: Logger;

  beforeEach(() => {
    mockSampler = new MockMCPSampler();
    mockLogger = createMockLogger();
    structuredSampler = new StructuredSampler(mockSampler, mockLogger);
  });

  describe('sampleJSON', () => {
    it('should parse valid JSON successfully', async () => {
      const validJson = {
        language: 'typescript',
        framework: 'express',
        version: '4.18.0',
        dependencies: ['express', 'helmet']
      };

      mockSampler.setResponses([{
        success: true,
        content: JSON.stringify(validJson),
        metadata: { tokensUsed: 100 }
      }]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' },
        format: 'json'
      }, TestSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validJson);
      }
    });

    it('should handle JSON with markdown code fences', async () => {
      const validJson = {
        language: 'nodejs',
        framework: 'express',
        dependencies: ['express']
      };

      const contentWithFences = `\`\`\`json
${JSON.stringify(validJson, null, 2)}
\`\`\``;

      mockSampler.setResponses([{
        success: true,
        content: contentWithFences,
        metadata: { tokensUsed: 150 }
      }]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      }, TestSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validJson);
      }
    });

    it('should auto-repair malformed JSON', async () => {
      const malformedJson = `{
        "language": "nodejs",
        "framework": "express"
      }`; // Missing closing brace

      const repairedJson = {
        language: 'nodejs',
        framework: 'express',
        dependencies: []
      };

      mockSampler.setResponses([
        // First response - malformed JSON
        {
          success: true,
          content: malformedJson,
          metadata: { tokensUsed: 100 }
        },
        // Second response - repaired JSON
        {
          success: true,
          content: JSON.stringify(repairedJson),
          metadata: { tokensUsed: 120 }
        }
      ]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      }, TestSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(repairedJson);
      }
    });

    it('should validate with Zod schema and retry on validation errors', async () => {
      const invalidData = {
        language: 'nodejs',
        // Missing required fields, invalid types
        dependencies: 'should-be-array'
      };

      const validData = {
        language: 'nodejs',
        framework: 'express',
        dependencies: ['express']
      };

      mockSampler.setResponses([
        // First response - schema validation fails
        {
          success: true,
          content: JSON.stringify(invalidData),
          metadata: { tokensUsed: 100 }
        },
        // Second response - valid data
        {
          success: true,
          content: JSON.stringify(validData),
          metadata: { tokensUsed: 120 }
        }
      ]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      }, TestSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should fail after maximum repair attempts', async () => {
      const malformedJson = '{ "language": "nodejs", "invalid": json }';

      mockSampler.setResponses([
        // All responses are malformed
        { success: true, content: malformedJson, metadata: { tokensUsed: 100 } },
        { success: true, content: malformedJson, metadata: { tokensUsed: 110 } },
        { success: true, content: malformedJson, metadata: { tokensUsed: 120 } }
      ]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      }, TestSchema, { maxRepairAttempts: 2 });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Failed to get valid JSON after repair attempts');
    });

    it('should handle sampler failures', async () => {
      mockSampler.setResponses([{
        success: false,
        content: null,
        error: new Error('AI service unavailable')
      }]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('AI service unavailable');
    });

    it('should work without schema validation', async () => {
      const jsonData = { any: 'data', works: true, count: 42 };

      mockSampler.setResponses([{
        success: true,
        content: JSON.stringify(jsonData),
        metadata: { tokensUsed: 80 }
      }]);

      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      }); // No schema provided

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(jsonData);
      }
    });
  });

  describe('sampleStructured', () => {
    it('should handle Dockerfile format', async () => {
      const dockerfileContent = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node
CMD ["npm", "start"]`;

      mockSampler.setResponses([{
        success: true,
        content: dockerfileContent,
        metadata: { tokensUsed: 200 }
      }]);

      const result = await structuredSampler.sampleStructured({
        templateId: 'dockerfile-generation',
        variables: { language: 'nodejs' }
      }, 'dockerfile');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(dockerfileContent);
      }
    });

    it('should clean markdown code fences from structured content', async () => {
      const yamlContent = `apiVersion: v1
kind: Service
metadata:
  name: test-service`;

      const contentWithFences = `\`\`\`yaml
${yamlContent}
\`\`\``;

      mockSampler.setResponses([{
        success: true,
        content: contentWithFences,
        metadata: { tokensUsed: 150 }
      }]);

      const result = await structuredSampler.sampleStructured({
        templateId: 'k8s-generation',
        variables: { language: 'nodejs' }
      }, 'yaml');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(yamlContent);
      }
    });

    it('should handle sampler failures in structured format', async () => {
      mockSampler.setResponses([{
        success: false,
        content: null,
        error: new Error('Template not found')
      }]);

      const result = await structuredSampler.sampleStructured({
        templateId: 'k8s-generation',
        variables: { language: 'nodejs' }
      }, 'kubernetes');

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Template not found');
    });
  });
});