/**
 * Mock Sampler for Testing and Development
 * Provides predictable AI responses for testing purposes
 */

import type { Logger } from 'pino';
import type { MCPSampler, MCPSampleResponse, MCPSampleError } from './mcp-sampler';
import type { AIRequest } from '../ai-request-builder.js';

/**
 * Mock response template
 */
export interface MockResponseTemplate {
  pattern: string | RegExp;
  response: MCPSampleResponse;
  delay?: number;
  failureRate?: number;
}

/**
 * Mock Sampler implementation
 */
export class MockSampler implements MCPSampler {
  private templates: MockResponseTemplate[] = [];
  private defaultResponse: MCPSampleResponse;
  private available: boolean = true;
  private logger: Logger;
  private callCount: number = 0;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'mock-sampler' });
    this.defaultResponse = {
      text: 'This is a mock AI response.',
      tokenCount: 10,
      model: 'mock-model'
    };

    // Initialize with common templates
    this.initializeDefaultTemplates();
  }

  /**
   * Add a mock response template
   */
  addTemplate(template: MockResponseTemplate): void {
    this.templates.push(template);
    this.logger.debug(
      {
        pattern: template.pattern.toString(),
        hasDelay: !!template.delay
      },
      'Added mock template'
    );
  }

  /**
   * Clear all templates
   */
  clearTemplates(): void {
    this.templates = [];
    this.logger.debug('Cleared all mock templates');
  }

  /**
   * Set default response
   */
  setDefaultResponse(response: MCPSampleResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Set availability status
   */
  setAvailable(available: boolean): void {
    this.available = available;
    this.logger.debug({ available }, 'Set availability');
  }

  /**
   * Sample implementation
   */
  async sample(request: AIRequest): Promise<MCPSampleResponse | MCPSampleError> {
    this.callCount++;

    this.logger.debug(
      {
        callCount: this.callCount,
        promptLength: request.prompt.length,
        temperature: request.temperature,
        available: this.available
      },
      'Mock sampling'
    );

    if (!this.available) {
      return {
        error: 'Mock sampler is not available',
        code: 'SAMPLER_UNAVAILABLE'
      };
    }

    // Find matching template
    for (const template of this.templates) {
      const matches =
        typeof template.pattern === 'string'
          ? request.prompt.includes(template.pattern)
          : template.pattern.test(request.prompt);

      if (matches && matches.length > 0) {
        // Check for artificial failure
        if (template.failureRate && Math.random() < template.failureRate) {
          return {
            error: 'Mock failure triggered',
            code: 'MOCK_FAILURE'
          };
        }

        // Artificial delay
        if (template.delay && template.delay > 0) {
          await this.delay(template.delay);
        }

        return {
          ...template.response,
          model: request.model ?? template.response.model
        };
      }
    }

    // Return default response
    return {
      ...this.defaultResponse,
      model: request.model ?? this.defaultResponse.model
    };
  }

  /**
   * Check if sampler is available
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return 'mock-model';
  }

  /**
   * Get supported models
   */
  getSupportedModels(): string[] {
    return ['mock-model', 'mock-model-fast', 'mock-model-large'];
  }

  /**
   * Get call statistics
   */
  getStats(): { callCount: number; templatesCount: number } {
    return {
      callCount: this.callCount,
      templatesCount: this.templates.length
    };
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.callCount = 0;
    this.templates = [];
    this.available = true;
    this.initializeDefaultTemplates();
    this.logger.debug('Mock sampler reset');
  }

  /**
   * Initialize default response templates
   */
  private initializeDefaultTemplates(): void {
    // Dockerfile generation
    this.addTemplate({
      pattern: /dockerfile|docker|container/i,
      response: {
        text: `FROM node:18-alpine``

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]`,
        tokenCount: 150,
        model: 'mock-model'
      }
    });

    // Kubernetes manifests
    this.addTemplate({
      pattern: /kubernetes|k8s|deployment|service/i,
      response: {
        text: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: app
        image: my-app:latest
        ports:
        - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: my-app-service
spec:
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 3000`,
        tokenCount: 200,
        model: 'mock-model'
      }
    });

    // Repository analysis
    this.addTemplate({
      pattern: /analyze|analysis|repository|code/i,
      response: {
        text: JSON.stringify(
          {
            language: 'typescript',
            framework: 'node',
            dependencies: ['express', 'typescript', 'jest'],
            buildTool: 'npm',
            hasDockerfile: false,
            hasTests: true,
            recommendations: [
              'Add Dockerfile for containerization',
              'Consider using multi-stage builds',
              'Add health check endpoint'
            ]
          },
          null,
          2
        ),
        tokenCount: 120,
        model: 'mock-model'
      }
    });

    // Configuration generation
    this.addTemplate({
      pattern: /config|configuration|setup/i,
      response: {
        text: JSON.stringify(
          {
            version: '1.0',
            services: {
              web: {
                build: '.',
                ports: ['3000:3000'],
                environment: {
                  NODE_ENV: 'production'
                }
              }
            }
          },
          null,
          2
        ),
        tokenCount: 80,
        model: 'mock-model'
      }
    });

    // Error responses
    this.addTemplate({
      pattern: /error|fail|invalid/i,
      response: {
        text: 'I apologize, but I encountered an error processing your request. Please try again with more specific instructions.',
        tokenCount: 25,
        model: 'mock-model'
      },
      failureRate: 0.1 // 10% chance of failure
    });

    this.logger.debug(
      {
        count: this.templates.length
      },
      'Initialized default templates'
    );
  }

  /**
   * Artificial delay for testing
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
