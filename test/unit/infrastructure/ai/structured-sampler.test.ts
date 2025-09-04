/**
 * Structured Sampler Tests
 * Comprehensive test coverage for AI-driven structured content generation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { StructuredSampler } from '../../../../src/infrastructure/ai/structured-sampler';
import type { SampleFunction } from '../../../../src/infrastructure/ai/sampling';
import type { AIRequest, AIResponse } from '../../../../src/infrastructure/ai/requests';
import type { Logger } from 'pino';
import { z } from 'zod';

// Test schemas for validation
const TestUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0).max(120),
});

const DockerfileSchema = z.object({
  baseImage: z.string(),
  workdir: z.string(),
  commands: z.array(z.string()),
});

// Mock AI Service responses
class MockAIService {
  private responses: Map<string, AIResponse> = new Map();
  private callCount = 0;

  setResponse(prompt: string, response: AIResponse): void {
    this.responses.set(prompt, response);
  }

  setDefaultResponse(response: AIResponse): void {
    this.responses.set('__default__', response);
  }

  getMockSampler(): SampleFunction {
    return async (request: AIRequest): Promise<AIResponse> => {
      this.callCount++;

      const response = this.responses.get(request.prompt) ||
                      this.responses.get('__default__') ||
                      {
                        success: true,
                        text: '{"success": true}',
                        model: 'mock-model',
                        tokenCount: 100,
                      };

      return response;
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.responses.clear();
    this.callCount = 0;
  }
}

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as any;

describe('StructuredSampler', () => {
  let mockAI: MockAIService;
  let sampler: StructuredSampler;

  beforeEach(() => {
    mockAI = new MockAIService();
    sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockAI.reset();
  });

  describe('generateStructured', () => {
    it('should generate valid JSON with schema validation', async () => {
      const validUserData = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };

      mockAI.setDefaultResponse({
        success: true,
        text: JSON.stringify(validUserData),
        model: 'test-model',
        tokenCount: 50,
      });

      const result = await sampler.generateStructured('Create a user', {
        schema: TestUserSchema,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validUserData);
      expect(result.validation?.valid).toBe(true);
      expect(result.metadata?.attempts).toBe(1);
    });

    it('should retry on schema validation failures', async () => {
      const invalidData = { name: 'John', email: 'invalid-email' };
      const validData = { name: 'John', email: 'john@example.com', age: 25 };

      let callCount = 0;
      mockAI.getMockSampler = () => async (): Promise<AIResponse> => {
        callCount++;
        return {
          success: true,
          text: JSON.stringify(callCount === 1 ? invalidData : validData),
          model: 'test-model',
          tokenCount: 50,
        };
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      const result = await sampler.generateStructured('Create a user', {
        schema: TestUserSchema,
        format: 'json',
        maxRetries: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
      expect(result.metadata?.attempts).toBe(2);
    });

    it('should handle AI service failures with retry', async () => {
      let callCount = 0;
      mockAI.getMockSampler = () => async (): Promise<AIResponse> => {
        callCount++;
        if (callCount === 1) {
          return { success: false, error: 'Service unavailable', text: '' };
        }
        return {
          success: true,
          text: '{"result": "success"}',
          model: 'test-model',
          tokenCount: 30,
        };
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      const result = await sampler.generateStructured('Generate data', {
        maxRetries: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
      expect(result.metadata?.attempts).toBe(2);
    });

    it('should fail after max retries exceeded', async () => {
      mockAI.setDefaultResponse({
        success: false,
        error: 'Persistent failure',
        text: '',
      });

      const result = await sampler.generateStructured('Generate data', {
        maxRetries: 2,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Max retries exceeded (2 attempts). Last error: Persistent failure');
      expect(result.metadata?.attempts).toBe(2);
    });

    it('should parse YAML format responses', async () => {
      const yamlData = 'name: John\nemail: john@example.com\nage: 30';

      mockAI.setDefaultResponse({
        success: true,
        text: yamlData,
        model: 'test-model',
        tokenCount: 40,
      });

      const result = await sampler.generateStructured('Create YAML user', {
        format: 'yaml',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(yamlData);
      expect(result.raw).toBe(yamlData);
    });

    it('should handle text format responses', async () => {
      const textData = 'This is a plain text response';

      mockAI.setDefaultResponse({
        success: true,
        text: textData,
        model: 'test-model',
        tokenCount: 20,
      });

      const result = await sampler.generateStructured('Generate text', {
        format: 'text',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe(textData);
    });

    it('should strip markdown code blocks from responses', async () => {
      const jsonData = { test: 'value' };
      const markdownResponse = `\`\`\`json\n${JSON.stringify(jsonData)}\n\`\`\``;

      mockAI.setDefaultResponse({
        success: true,
        text: markdownResponse,
        model: 'test-model',
        tokenCount: 60,
      });

      const result = await sampler.generateStructured('Generate JSON', {
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(jsonData);
    });
  });

  describe('Security Validation', () => {
    it('should detect credential exposure', async () => {
      const unsafeContent = 'api_key = "sk-1234567890abcdef123456"'; // 22 characters

      mockAI.setDefaultResponse({
        success: true,
        text: unsafeContent,
        model: 'test-model',
        tokenCount: 30,
      });

      const result = await sampler.generateStructured('Generate config', {
        format: 'text',
        validateSecurity: true,
      });

      expect(result.success).toBe(true);
      expect(result.validation?.valid).toBe(false);
      expect(result.validation?.securityIssues).toHaveLength(1);
      expect(result.validation?.securityIssues?.[0].type).toBe('credential');
      expect(result.validation?.securityIssues?.[0].severity).toBe('high');
    });

    it('should detect vulnerable patterns', async () => {
      const vulnerableContent = 'eval(userInput); exec("rm -rf /");';

      mockAI.setDefaultResponse({
        success: true,
        text: vulnerableContent,
        model: 'test-model',
        tokenCount: 25,
      });

      const result = await sampler.generateStructured('Generate code', {
        format: 'text',
        validateSecurity: true,
      });

      expect(result.success).toBe(true);
      expect(result.validation?.warnings).toContain('eval() usage detected');
      expect(result.validation?.warnings).toContain('exec() usage detected');
    });

    it('should pass security validation for safe content', async () => {
      const safeContent = '{"message": "Hello world", "status": "ok"}';

      mockAI.setDefaultResponse({
        success: true,
        text: safeContent,
        model: 'test-model',
        tokenCount: 20,
      });

      const result = await sampler.generateStructured('Generate safe data', {
        format: 'json',
        validateSecurity: true,
      });

      expect(result.success).toBe(true);
      expect(result.validation?.valid).toBe(true);
      expect(result.validation?.securityIssues).toBeUndefined();
    });

    it('should skip security validation when disabled', async () => {
      const unsafeContent = 'password = "admin123"';

      mockAI.setDefaultResponse({
        success: true,
        text: unsafeContent,
        model: 'test-model',
        tokenCount: 15,
      });

      const result = await sampler.generateStructured('Generate config', {
        format: 'text',
        validateSecurity: false,
      });

      expect(result.success).toBe(true);
      expect(result.validation?.valid).toBe(true);
      expect(result.validation?.securityIssues).toBeUndefined();
    });
  });

  describe('Specialized Generation Methods', () => {
    describe('generateDockerfile', () => {
      it('should generate Dockerfile with security validation', async () => {
        const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
USER node
EXPOSE 3000
CMD ["npm", "start"]`;

        mockAI.setDefaultResponse({
          success: true,
          text: dockerfile,
          model: 'test-model',
          tokenCount: 150,
        });

        const result = await sampler.generateDockerfile('Node.js app with Alpine base');

        expect(result.success).toBe(true);
        expect(result.data).toBe(dockerfile);
        expect(result.validation?.valid).toBe(true);
        expect(mockAI.getCallCount()).toBe(1);
      });

      it('should handle constraints in Dockerfile generation', async () => {
        const constraints = { baseImage: 'ubuntu:20.04', port: 8080 };

        mockAI.setDefaultResponse({
          success: true,
          text: 'FROM ubuntu:20.04\nEXPOSE 8080',
          model: 'test-model',
          tokenCount: 80,
        });

        const result = await sampler.generateDockerfile('Custom app', constraints);

        expect(result.success).toBe(true);
        expect(typeof result.data).toBe('string');
      });
    });

    describe('generateKubernetesManifests', () => {
      it('should generate K8s manifests in YAML format', async () => {
        const manifests = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: test-app`;

        mockAI.setDefaultResponse({
          success: true,
          text: manifests,
          model: 'test-model',
          tokenCount: 200,
        });

        const result = await sampler.generateKubernetesManifests('Web application');

        expect(result.success).toBe(true);
        expect(result.data).toBe(manifests);
        expect(result.validation?.valid).toBe(true);
      });

      it('should include options in manifest generation', async () => {
        const options = { replicas: 5, namespace: 'production' };

        mockAI.setDefaultResponse({
          success: true,
          text: 'apiVersion: v1\nkind: Service',
          model: 'test-model',
          tokenCount: 120,
        });

        const result = await sampler.generateKubernetesManifests('Production app', options);

        expect(result.success).toBe(true);
        expect(typeof result.data).toBe('string');
      });
    });

    describe('sampleJSON', () => {
      it('should generate JSON format by default', async () => {
        const jsonData = { type: 'test', value: 42 };

        mockAI.setDefaultResponse({
          success: true,
          text: JSON.stringify(jsonData),
          model: 'test-model',
          tokenCount: 40,
        });

        const result = await sampler.sampleJSON('Generate test data');

        expect(result.success).toBe(true);
        expect(result.data).toEqual(jsonData);
      });

      it('should accept all options except format', async () => {
        const result = await sampler.sampleJSON('Test', {
          schema: z.object({ test: z.string() }),
          temperature: 0.5,
          maxTokens: 100,
        });

        expect(mockAI.getCallCount()).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', async () => {
      mockAI.setDefaultResponse({
        success: true,
        text: 'invalid json content {',
        model: 'test-model',
        tokenCount: 20,
      });

      const result = await sampler.generateStructured('Generate JSON', {
        format: 'json',
        maxRetries: 2,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Max retries exceeded');
    });

    it('should handle exceptions during generation', async () => {
      mockAI.getMockSampler = () => async (): Promise<AIResponse> => {
        throw new Error('Network timeout');
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      const result = await sampler.generateStructured('Test', { maxRetries: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Max retries exceeded (1 attempts). Last error: Network timeout');
    });

    it('should handle undefined/null responses gracefully', async () => {
      mockAI.getMockSampler = () => async (): Promise<AIResponse> => {
        return null as any;
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      const result = await sampler.generateStructured('Test', { maxRetries: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Configuration Options', () => {
    it('should respect temperature settings', async () => {
      let capturedRequest: AIRequest | undefined;

      mockAI.getMockSampler = () => async (request: AIRequest): Promise<AIResponse> => {
        capturedRequest = request;
        return {
          success: true,
          text: '{"test": true}',
          model: 'test-model',
          tokenCount: 30,
        };
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      await sampler.generateStructured('Test', { temperature: 0.7 });

      expect(capturedRequest?.temperature).toBe(0.7);
    });

    it('should respect maxTokens settings', async () => {
      let capturedRequest: AIRequest | undefined;

      mockAI.getMockSampler = () => async (request: AIRequest): Promise<AIResponse> => {
        capturedRequest = request;
        return {
          success: true,
          text: '{"test": true}',
          model: 'test-model',
          tokenCount: 30,
        };
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      await sampler.generateStructured('Test', { maxTokens: 1500 });

      expect(capturedRequest?.maxTokens).toBe(1500);
    });

    it('should use default values for optional parameters', async () => {
      let capturedRequest: AIRequest | undefined;

      mockAI.getMockSampler = () => async (request: AIRequest): Promise<AIResponse> => {
        capturedRequest = request;
        return {
          success: true,
          text: '{"test": true}',
          model: 'test-model',
          tokenCount: 30,
        };
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      const result = await sampler.generateStructured('Test');

      expect(capturedRequest?.temperature).toBe(0.3);
      expect(capturedRequest?.maxTokens).toBe(2000);
      expect(result.validation?.valid).toBe(true); // validateSecurity defaults to true
    });
  });

  describe('Logging', () => {
    it('should log validation failures', async () => {
      mockAI.setDefaultResponse({
        success: true,
        text: '{"invalid": "schema"}',
        model: 'test-model',
        tokenCount: 30,
      });

      await sampler.generateStructured('Test', {
        schema: TestUserSchema,
        maxRetries: 1,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          errors: expect.any(Array),
        }),
        'Schema validation failed',
      );
    });

    it('should log sampling failures', async () => {
      mockAI.setDefaultResponse({
        success: false,
        error: 'API limit exceeded',
        text: '',
      });

      await sampler.generateStructured('Test', { maxRetries: 1 });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          error: 'API limit exceeded',
        }),
        'Sampling failed',
      );
    });

    it('should log generation errors', async () => {
      mockAI.getMockSampler = () => async (): Promise<AIResponse> => {
        throw new Error('Connection failed');
      };

      sampler = new StructuredSampler(mockAI.getMockSampler(), mockLogger);

      await sampler.generateStructured('Test', { maxRetries: 1 });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          error: 'Connection failed',
        }),
        'Structured generation error',
      );
    });
  });
});
