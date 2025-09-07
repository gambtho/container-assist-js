import { Success, Failure, type Result } from '../../types/core/index.js';
import type { Prompt } from '@modelcontextprotocol/sdk/types.js';

// AI context for prompt enhancement
type AIContext = {
  sessionId?: string;
  repositoryAnalysis?: any;
  toolHistory?: any[];
};

// Template argument definition
type TemplateArgument = {
  name: string;
  description: string;
  required: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array';
  default?: any;
};

// Prompt template definition
type PromptTemplate = {
  name: string;
  description: string;
  arguments: TemplateArgument[];
  basePrompt?: string;
  examples?: string[];
};

// Template definitions as constants
const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  'dockerfile-generation': {
    name: 'dockerfile-generation',
    description: 'Generate optimized Dockerfile with AI assistance',
    arguments: [
      {
        name: 'language',
        description: 'Primary programming language',
        required: true,
        type: 'string',
      },
      { name: 'framework', description: 'Application framework', required: false, type: 'string' },
      {
        name: 'buildSystem',
        description: 'Build system (maven, gradle, npm)',
        required: false,
        type: 'string',
      },
      {
        name: 'securityLevel',
        description: 'Security level (basic, enhanced, strict)',
        required: false,
        type: 'string',
        default: 'enhanced',
      },
      {
        name: 'optimizationLevel',
        description: 'Optimization level (size, speed, balanced)',
        required: false,
        type: 'string',
        default: 'balanced',
      },
    ],
    basePrompt:
      'Generate a production-ready Dockerfile with security best practices and optimizations.',
    examples: [
      'Create a multi-stage Dockerfile for a Node.js application',
      'Generate a Dockerfile for a Java Spring Boot application with Maven',
      'Build a Python FastAPI Dockerfile with Poetry dependency management',
    ],
  },
  'k8s-manifest-generation': {
    name: 'k8s-manifest-generation',
    description: 'Generate Kubernetes manifests with best practices',
    arguments: [
      { name: 'appName', description: 'Application name', required: true, type: 'string' },
      {
        name: 'environment',
        description: 'Target environment (dev, staging, prod)',
        required: true,
        type: 'string',
      },
      {
        name: 'replicas',
        description: 'Number of replicas',
        required: false,
        type: 'number',
        default: 3,
      },
      { name: 'resources', description: 'Resource requirements', required: false },
      {
        name: 'ingress',
        description: 'Enable ingress configuration',
        required: false,
        type: 'boolean',
        default: true,
      },
      {
        name: 'autoscaling',
        description: 'Enable horizontal pod autoscaling',
        required: false,
        type: 'boolean',
        default: true,
      },
    ],
    basePrompt:
      'Generate Kubernetes manifests with security contexts, resource limits, and production best practices.',
    examples: [
      'Create K8s deployment with HPA and ingress',
      'Generate stateful application manifests with persistent volumes',
      'Build microservice deployment with service mesh configuration',
    ],
  },
  'vulnerability-analysis': {
    name: 'vulnerability-analysis',
    description: 'Analyze and provide remediation for security vulnerabilities',
    arguments: [
      { name: 'scanResults', description: 'Security scan results', required: true },
      {
        name: 'severity',
        description: 'Minimum severity level (LOW, MEDIUM, HIGH, CRITICAL)',
        required: false,
        type: 'string',
        default: 'MEDIUM',
      },
      {
        name: 'autoFix',
        description: 'Apply automatic fixes when possible',
        required: false,
        type: 'boolean',
        default: false,
      },
      {
        name: 'compliance',
        description: 'Compliance framework (CIS, PCI-DSS, HIPAA)',
        required: false,
        type: 'string',
      },
    ],
    basePrompt:
      'Analyze security vulnerabilities, prioritize critical issues, and provide actionable remediation steps.',
    examples: [
      'Analyze container scan results and suggest fixes',
      'Review dependency vulnerabilities with upgrade paths',
      'Assess infrastructure security with compliance checks',
    ],
  },
  'repository-analysis': {
    name: 'repository-analysis',
    description: 'Comprehensive repository analysis for containerization',
    arguments: [
      {
        name: 'repoPath',
        description: 'Repository path to analyze',
        required: true,
        type: 'string',
      },
      {
        name: 'depth',
        description: 'Analysis depth (quick, standard, deep)',
        required: false,
        type: 'string',
        default: 'standard',
      },
      {
        name: 'includeTests',
        description: 'Include test file analysis',
        required: false,
        type: 'boolean',
        default: false,
      },
      {
        name: 'detectSecrets',
        description: 'Scan for hardcoded secrets',
        required: false,
        type: 'boolean',
        default: true,
      },
    ],
    basePrompt:
      'Analyze repository structure, detect frameworks and dependencies, and provide containerization recommendations.',
    examples: [
      'Analyze monorepo with multiple services',
      'Review legacy application for modernization',
      'Assess microservices architecture readiness',
    ],
  },
  'build-optimization': {
    name: 'build-optimization',
    description: 'Optimize Docker build process and image size',
    arguments: [
      { name: 'dockerfilePath', description: 'Path to Dockerfile', required: true, type: 'string' },
      {
        name: 'targetSize',
        description: 'Target image size in MB',
        required: false,
        type: 'number',
      },
      {
        name: 'cacheStrategy',
        description: 'Cache optimization strategy',
        required: false,
        type: 'string',
        default: 'aggressive',
      },
      {
        name: 'layerOptimization',
        description: 'Optimize layer structure',
        required: false,
        type: 'boolean',
        default: true,
      },
    ],
    basePrompt: 'Analyze and optimize Docker build for size, speed, and security.',
    examples: [
      'Reduce image size by 50% using multi-stage builds',
      'Optimize build cache for CI/CD pipelines',
      'Minimize attack surface with distroless images',
    ],
  },
  'deployment-strategy': {
    name: 'deployment-strategy',
    description: 'Design deployment strategy and rollout plan',
    arguments: [
      { name: 'application', description: 'Application details', required: true },
      {
        name: 'targetEnvironment',
        description: 'Target deployment environment',
        required: true,
        type: 'string',
      },
      {
        name: 'strategy',
        description: 'Deployment strategy (rolling, blue-green, canary)',
        required: false,
        type: 'string',
        default: 'rolling',
      },
      {
        name: 'monitoring',
        description: 'Include monitoring configuration',
        required: false,
        type: 'boolean',
        default: true,
      },
    ],
    basePrompt: 'Design comprehensive deployment strategy with rollback plans and monitoring.',
    examples: [
      'Implement blue-green deployment with traffic management',
      'Design canary deployment with automated rollback',
      'Create GitOps-based continuous deployment pipeline',
    ],
  },
};

// Functional approach to prompt generation
const generateContextualPrompt = async (
  template: PromptTemplate,
  args: any,
  context: AIContext | undefined,
  aiService: any,
  sessionManager: any,
): Promise<Result<any>> => {
  const sessionState = context?.sessionId
    ? await sessionManager.getState(context.sessionId)
    : undefined;

  return aiService.generateContextualPrompt({
    template,
    arguments: args,
    context,
    sessionState,
  });
};

const buildPromptMessages = (
  template: PromptTemplate,
  args: any,
  sessionState?: any,
): Array<{ role: string; content: string }> => {
  const messages = [];

  // System message with template context
  messages.push({
    role: 'system',
    content: `You are an AI assistant specialized in ${template.name}. ${template.description}\n\nBase instruction: ${template.basePrompt || ''}`,
  });

  // Add context from session if available
  if (sessionState?.analysis_result) {
    messages.push({
      role: 'system',
      content: `Repository context:\n${JSON.stringify(sessionState.analysis_result, null, 2)}`,
    });
  }

  // User message with arguments
  const userContent = [`Please help with ${template.name}.`];

  // Add provided arguments
  template.arguments.forEach((arg) => {
    if (args[arg.name] !== undefined) {
      userContent.push(`${arg.description}: ${args[arg.name]}`);
    } else if (arg.required) {
      userContent.push(`${arg.description}: [Required - please provide]`);
    } else if (arg.default !== undefined) {
      userContent.push(`${arg.description}: ${arg.default} (default)`);
    }
  });

  messages.push({
    role: 'user',
    content: userContent.join('\n'),
  });

  // Add examples if no specific args provided
  if (template.examples && Object.keys(args).length === 0) {
    messages.push({
      role: 'assistant',
      content: `Here are some examples of what I can help with:\n- ${template.examples.join('\n- ')}`,
    });
  }

  return messages;
};

const validateArguments = (
  template: PromptTemplate,
  args: any,
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check required arguments
  template.arguments.forEach((arg) => {
    if (arg.required && (args[arg.name] === undefined || args[arg.name] === null)) {
      errors.push(`Missing required argument: ${arg.name}`);
    }

    // Type validation
    if (args[arg.name] !== undefined && arg.type) {
      const actualType = typeof args[arg.name];
      if (actualType !== arg.type) {
        errors.push(`Invalid type for ${arg.name}: expected ${arg.type}, got ${actualType}`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

export class IntelligentPromptManager {
  constructor(
    private aiService: any,
    private sessionManager: any,
  ) {}

  async getPromptWithAI(name: string, args: any, context?: AIContext): Promise<Result<Prompt>> {
    const template = PROMPT_TEMPLATES[name];
    if (!template) {
      return Failure(`Template not found: ${name}`);
    }

    // Validate arguments
    const validation = validateArguments(template, args);
    if (!validation.valid) {
      return Failure(`Invalid arguments: ${validation.errors.join(', ')}`);
    }

    // Get session state if available
    const sessionState = context?.sessionId
      ? await this.sessionManager.getState(context.sessionId)
      : undefined;

    // Generate AI-enhanced prompt if AI service is available
    if (this.aiService && (context || sessionState)) {
      const aiPromptResult = await generateContextualPrompt(
        template,
        args,
        context,
        this.aiService,
        this.sessionManager,
      );

      if (aiPromptResult.ok && aiPromptResult.value.messages) {
        return Success({
          name: template.name,
          description: template.description,
          messages: aiPromptResult.value.messages,
          arguments: template.arguments.map((arg) => ({
            name: arg.name,
            description: arg.description,
            required: arg.required,
          })),
          metadata: {
            aiGenerated: true,
            contextUsed: !!context,
            sessionAware: !!sessionState,
            ...aiPromptResult.value.metadata,
          },
        } as Prompt);
      }
    }

    // Fallback to template-based prompt generation
    const messages = buildPromptMessages(template, args, sessionState);

    return Success({
      name: template.name,
      description: template.description,
      messages,
      arguments: template.arguments.map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })),
      metadata: {
        aiGenerated: false,
        contextUsed: !!context,
        sessionAware: !!sessionState,
      },
    } as Prompt);
  }

  listTemplates(): PromptTemplate[] {
    return Object.values(PROMPT_TEMPLATES);
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return PROMPT_TEMPLATES[name];
  }

  async getPromptSuggestions(context?: AIContext): Promise<string[]> {
    const suggestions: string[] = [];

    if (context?.repositoryAnalysis) {
      // Suggest relevant templates based on repository analysis
      if (context.repositoryAnalysis.language) {
        suggestions.push('dockerfile-generation');
        suggestions.push('build-optimization');
      }

      if (context.repositoryAnalysis.hasKubernetesConfig) {
        suggestions.push('k8s-manifest-generation');
        suggestions.push('deployment-strategy');
      }

      if (context.repositoryAnalysis.vulnerabilities) {
        suggestions.push('vulnerability-analysis');
      }
    } else {
      // Default suggestions
      suggestions.push('repository-analysis');
      suggestions.push('dockerfile-generation');
    }

    return suggestions;
  }

  async enhancePrompt(prompt: Prompt, context?: AIContext): Promise<Result<Prompt>> {
    if (!context || !this.aiService) {
      return Success(prompt);
    }

    // Enhance existing prompt with additional context
    const enhancementResult = await this.aiService.generateWithContext({
      prompt: `Enhance the following prompt with additional context:\n${JSON.stringify(prompt.messages)}`,
      sessionId: context.sessionId,
      context: context.repositoryAnalysis,
    });

    if (!enhancementResult.ok) {
      return Success(prompt); // Return original if enhancement fails
    }

    return Success({
      ...prompt,
      messages: [
        ...(prompt.messages || []),
        {
          role: 'system',
          content: `Additional context: ${enhancementResult.value.context.guidance}`,
        },
      ],
      metadata: {
        ...prompt.metadata,
        enhanced: true,
        enhancementContext: enhancementResult.value.metadata,
      },
    } as Prompt);
  }
}

// Factory function for creating intelligent prompt manager
export const createIntelligentPromptManager = (
  aiService: any,
  sessionManager: any,
): IntelligentPromptManager => {
  return new IntelligentPromptManager(aiService, sessionManager);
};

// Export types and constants
export type { PromptTemplate, TemplateArgument, AIContext };
export { PROMPT_TEMPLATES };
