/**
 * AI Service Wrapper
 *
 * Provides a simplified, clean interface for AI operations
 * Wraps the existing AI infrastructure with consistent error handling and logging
 */

import { createTimer, type Logger } from './logger';

/**
 * AI request configuration
 */
interface AIRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeout?: number;
  context?: Record<string, unknown>;
}

/**
 * AI response result
 */
export type AIResult =
  | { success: true; text: string; tokenCount?: number; model?: string; stopReason?: string }
  | { success: false; error: string; code?: string; details?: Record<string, unknown> };

/**
 * Structured AI request for specific tasks
 */
interface StructuredAIRequest extends AIRequest {
  task: 'dockerfile' | 'analysis' | 'k8s' | 'fix' | 'optimization';
  data?: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

/**
 * AI service interface for lib layer
 */
interface AIService {
  /**
   * Generate text using AI
   */
  generate(request: AIRequest): Promise<AIResult>;

  /**
   * Generate structured content for specific tasks
   */
  generateStructured(request: StructuredAIRequest): Promise<AIResult>;

  /**
   * Validate content using AI
   */
  validate(content: string, criteria: string[]): Promise<{ valid: boolean; issues: string[] }>;

  /**
   * Generate Dockerfile content
   */
  generateDockerfile(analysis: Record<string, unknown>): Promise<AIResult>;

  /**
   * Generate Kubernetes manifests
   */
  generateK8sManifests(config: Record<string, unknown>): Promise<AIResult>;

  /**
   * Analyze repository structure
   */
  analyzeRepository(projectPath: string, files: string[]): Promise<AIResult>;

  /**
   * Fix Dockerfile issues
   */
  fixDockerfile(dockerfile: string, issues: string[]): Promise<AIResult>;

  /**
   * Check service health
   */
  ping(): Promise<boolean>;
}

/**
 * AI service implementation wrapping infrastructure layer
 */
class AIServiceWrapper implements AIService {
  private logger: Logger;

  constructor(
    private sampleFunction: (request: any) => Promise<AIResult>,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ai-service' });
  }

  /**
   * Generate text using AI
   */
  async generate(request: AIRequest): Promise<AIResult> {
    const timer = createTimer(this.logger, 'ai-generate');

    try {
      this.logger.debug(
        {
          model: request.model,
          maxTokens: request.maxTokens,
          promptLength: request.prompt.length,
        },
        'Generating AI response',
      );

      const result = await this.sampleFunction(request);

      if (result.success) {
        timer.end({
          tokenCount: result.tokenCount,
          model: result.model,
          responseLength: result.text.length,
        });
      } else {
        timer.error(new Error(result.error), {
          code: result.code,
          details: result.details,
        });
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      timer.error(error);

      this.logger.error({ error: error.message, stack: error.stack }, 'AI generation failed');
      return {
        success: false,
        error: error.message,
        code: 'AI_GENERATION_ERROR',
        details: { originalError: err },
      };
    }
  }

  /**
   * Generate structured content for specific tasks
   */
  async generateStructured(request: StructuredAIRequest): Promise<AIResult> {
    const structuredPrompt = this.buildStructuredPrompt(request);

    return this.generate({
      ...request,
      prompt: structuredPrompt,
    });
  }

  /**
   * Validate content using AI
   */
  async validate(
    content: string,
    criteria: string[],
  ): Promise<{ valid: boolean; issues: string[] }> {
    const prompt = this.buildValidationPrompt(content, criteria);

    const result = await this.generate({
      prompt,
      maxTokens: 1000,
      temperature: 0.1, // Lower temperature for validation consistency
    });

    if (!result.success) {
      return { valid: false, issues: [`Validation failed: ${result.error}`] };
    }

    return this.parseValidationResponse(result.text);
  }

  /**
   * Generate Dockerfile content
   */
  async generateDockerfile(analysis: Record<string, unknown>): Promise<AIResult> {
    return this.generateStructured({
      task: 'dockerfile',
      prompt: 'Generate an optimized Dockerfile based on the repository analysis.',
      data: analysis,
      maxTokens: 2000,
      temperature: 0.3,
    });
  }

  /**
   * Generate Kubernetes manifests
   */
  async generateK8sManifests(config: Record<string, unknown>): Promise<AIResult> {
    return this.generateStructured({
      task: 'k8s',
      prompt: 'Generate Kubernetes deployment manifests based on the application configuration.',
      data: config,
      maxTokens: 3000,
      temperature: 0.2,
    });
  }

  /**
   * Analyze repository structure
   */
  async analyzeRepository(projectPath: string, files: string[]): Promise<AIResult> {
    return this.generateStructured({
      task: 'analysis',
      prompt:
        'Analyze the repository structure and identify the technology stack, dependencies, and containerization requirements.',
      data: { projectPath, files: files.slice(0, 50) }, // Limit files to avoid token limits
      maxTokens: 2000,
      temperature: 0.1,
    });
  }

  /**
   * Fix Dockerfile issues
   */
  async fixDockerfile(dockerfile: string, issues: string[]): Promise<AIResult> {
    return this.generateStructured({
      task: 'fix',
      prompt: 'Fix the identified issues in the Dockerfile while maintaining its functionality.',
      data: { dockerfile, issues },
      maxTokens: 2000,
      temperature: 0.2,
    });
  }

  /**
   * Check service health
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.generate({
        prompt: 'Respond with "pong" if you can process this request.',
        maxTokens: 10,
        timeout: 5000,
      });

      return result.success && result.text.toLowerCase().includes('pong');
    } catch {
      return false;
    }
  }

  /**
   * Build structured prompt for specific tasks
   */
  private buildStructuredPrompt(request: StructuredAIRequest): string {
    const basePrompt = request.prompt;
    const taskContext = this.getTaskContext(request.task);
    const dataContext = request.data ? `\n\nData:\n${JSON.stringify(request.data, null, 2)}` : '';
    const schemaContext = request.schema
      ? `\n\nExpected Schema:\n${JSON.stringify(request.schema, null, 2)}`
      : '';

    return `${taskContext}\n\n${basePrompt}${dataContext}${schemaContext}`;
  }

  /**
   * Get task-specific context
   */
  private getTaskContext(task: StructuredAIRequest['task']): string {
    const contexts = {
      dockerfile:
        'You are an expert in Docker and containerization. Generate secure, optimized Dockerfiles following best practices.',
      analysis:
        'You are a software architecture analyst. Analyze codebases to identify technologies, dependencies, and containerization needs.',
      k8s: 'You are a Kubernetes expert. Generate production-ready manifests with proper resource management and security.',
      fix: 'You are a Docker expert specializing in troubleshooting and optimization. Fix issues while preserving functionality.',
      optimization:
        'You are a performance optimization expert. Improve configurations for better performance and efficiency.',
    };

    return contexts[task] || 'You are an AI assistant helping with containerization tasks.';
  }

  /**
   * Build validation prompt
   */
  private buildValidationPrompt(content: string, criteria: string[]): string {
    return `Please validate the following content against these criteria:
${criteria.map((c) => `- ${c}`).join('\n')}

Content to validate:
${content}

Respond with a JSON object containing:
- "valid": boolean indicating if content meets all criteria
- "issues": array of strings describing any problems found

Response:`;
  }

  /**
   * Parse validation response
   */
  private parseValidationResponse(response: string): { valid: boolean; issues: string[] } {
    try {
      const cleaned = response.trim().replace(/```json\n?|\n?```/g, '');
      const parsed = JSON.parse(cleaned);

      return {
        valid: Boolean(parsed.valid),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      return {
        valid: false,
        issues: ['Failed to parse validation response'],
      };
    }
  }
}

/**
 * Create an AI service instance
 */
export function createAIService(
  sampleFunction: (request: any) => Promise<AIResult>,
  logger: Logger,
): AIService {
  return new AIServiceWrapper(sampleFunction, logger);
}
