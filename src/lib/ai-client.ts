import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core/index.js';

type AIRequest = {
  sessionId?: string;
  toolName?: string;
  parameters?: any;
  prompt: string;
  context?: any;
};

type AIContextPayload = {
  prompt: string;
  sessionState?: any;
  toolHistory?: any[];
  repositoryAnalysis?: any;
  guidance?: string;
  template?: string;
  parameters?: any;
};

type ValidationResult = {
  isValid: boolean;
  suggestions: string[];
  warnings: string[];
  contextPrepared?: AIContextPayload;
};

type ToolContext = {
  sessionId?: string;
  repositoryPath?: string;
  toolHistory?: any[];
};

const buildContextForTool = async (request: AIRequest, sessionManager: any): Promise<any> => ({
  sessionState: request.sessionId ? await sessionManager.getState(request.sessionId) : undefined,
  toolHistory: request.sessionId ? await sessionManager.getToolHistory(request.sessionId) : [],
  repositoryAnalysis: request.sessionId
    ? await sessionManager.getRepositoryAnalysis(request.sessionId)
    : undefined,
  parameters: request.parameters,
});

const generateGuidance = (prompt: string, _context: any): string => {
  if (prompt.toLowerCase().includes('dockerfile')) {
    return 'Generate an optimized Dockerfile following security best practices, using multi-stage builds when appropriate, and creating non-root users';
  }
  if (prompt.toLowerCase().includes('kubernetes') || prompt.toLowerCase().includes('k8s')) {
    return 'Generate Kubernetes manifests following best practices with proper resource limits, security contexts, and deployment strategies';
  }
  if (prompt.toLowerCase().includes('analyze') || prompt.toLowerCase().includes('repository')) {
    return 'Analyze the repository structure, identify the primary language and framework, detect dependencies, and suggest appropriate containerization strategies';
  }
  if (prompt.toLowerCase().includes('scan') || prompt.toLowerCase().includes('vulnerability')) {
    return 'Analyze security scan results, prioritize critical vulnerabilities, and provide actionable remediation steps';
  }
  if (prompt.toLowerCase().includes('build')) {
    return 'Optimize the build process for faster execution, smaller image size, and better layer caching';
  }
  return '';
};

const selectTemplate = (prompt: string, _context: any): string => {
  if (prompt.toLowerCase().includes('dockerfile')) {
    return `FROM {baseImage}
WORKDIR /app
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser
{buildCommands}
{healthCheck}
USER appuser
{startCommand}`;
  }
  if (prompt.toLowerCase().includes('kubernetes') || prompt.toLowerCase().includes('k8s')) {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {appName}
  namespace: {namespace}
spec:
  replicas: {replicas}
  selector:
    matchLabels:
      app: {appName}
  template:
    metadata:
      labels:
        app: {appName}
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
      - name: {containerName}
        image: {image}
        resources:
          limits:
            memory: {memoryLimit}
            cpu: {cpuLimit}
          requests:
            memory: {memoryRequest}
            cpu: {cpuRequest}`;
  }
  return '';
};

/**
 * Intelligent AI service that provides context-aware generation
 * for containerization tools using session state and history
 */
export class IntelligentAIService {
  constructor(
    private readonly logger: Logger,
    private sessionManager: any,
  ) {}

  /**
   * Generate AI response with full session context and tool history
   */
  async generateWithContext(request: AIRequest): Promise<Result<any>> {
    try {
      const context = await buildContextForTool(request, this.sessionManager);

      const structuredContext: AIContextPayload = {
        prompt: request.prompt,
        sessionState: context.sessionState,
        toolHistory: context.toolHistory,
        repositoryAnalysis: context.repositoryAnalysis,
        guidance: generateGuidance(request.prompt, context),
        template: selectTemplate(request.prompt, context),
        parameters: context.parameters,
      };

      return Success({
        context: structuredContext,
        metadata: {
          contextSize: JSON.stringify(structuredContext).length,
          sessionAware: !!request.sessionId,
          toolContext: request.toolName,
        },
      });
    } catch (error: any) {
      return Failure(`Context preparation failed: ${error.message}`);
    }
  }

  async validateParameters(
    toolName: string,
    params: any,
    context: ToolContext,
  ): Promise<Result<ValidationResult>> {
    const validationPrompt = `
Analyze the following tool parameters for ${toolName}:
${JSON.stringify(params, null, 2)}

Context:
- Session: ${context.sessionId}
- Repository: ${context.repositoryPath}
- Previous tools: ${context.toolHistory?.map((t) => t.name).join(', ')}

Provide validation results and optimization suggestions.
`;

    const contextResponse = await this.generateWithContext({
      prompt: validationPrompt,
      sessionId: context.sessionId || '',
      toolName,
      parameters: params,
    });

    if (!contextResponse.ok) return contextResponse as Result<ValidationResult>;

    return Success({
      isValid: this.validateBasicParams(toolName, params),
      suggestions: this.generateSuggestions(toolName, params, context),
      warnings: this.detectWarnings(toolName, params, context),
      contextPrepared: contextResponse.value.context,
    });
  }

  async analyzeResults(request: {
    toolName: string;
    parameters: any;
    result: any;
    sessionId?: string;
    context?: any;
  }): Promise<Result<any>> {
    const analysisPrompt = `
Analyze the execution results for ${request.toolName}:
Parameters: ${JSON.stringify(request.parameters, null, 2)}
Result: ${JSON.stringify(request.result, null, 2)}

Provide insights and recommendations for next steps.
`;

    const contextResponse = await this.generateWithContext({
      prompt: analysisPrompt,
      sessionId: request.sessionId || '',
      toolName: request.toolName,
      parameters: request.parameters,
      context: request.context,
    });

    if (!contextResponse.ok) return contextResponse;

    return Success({
      insights: this.generateInsights(request.toolName, request.result),
      nextSteps: this.suggestNextSteps(request.toolName, request.result, request.context),
      warnings: this.detectResultWarnings(request.toolName, request.result),
      context: contextResponse.value.context,
    });
  }

  async enhanceResourceContent(request: {
    uri: string;
    content: any;
    context?: any;
    schema?: string;
  }): Promise<Result<any>> {
    const enhancementPrompt = `
Enhance the following resource content:
URI: ${request.uri}
Schema: ${request.schema || 'unknown'}
Content preview: ${JSON.stringify(request.content).substring(0, 500)}

Provide insights and optimization suggestions.
`;

    const contextResponse = await this.generateWithContext({
      prompt: enhancementPrompt,
      context: request.context,
    });

    if (!contextResponse.ok) return contextResponse;

    return Success({
      enhancedContent: request.content,
      insights: this.generateResourceInsights(request.uri, request.content, request.schema),
      optimizations: this.suggestResourceOptimizations(request.uri, request.content),
    });
  }

  async generateContextualPrompt(request: {
    template: any;
    arguments: any;
    context?: any;
    sessionState?: any;
  }): Promise<Result<any>> {
    const { template, arguments: args, context, sessionState } = request;

    const messages = [
      {
        role: 'system',
        content: `You are an AI assistant helping with ${template.name}. ${template.description}`,
      },
      {
        role: 'user',
        content: this.buildUserPrompt(template, args, sessionState),
      },
    ];

    if (context && sessionState?.analysis_result) {
      messages.push({
        role: 'assistant',
        content: `Based on the repository analysis, I recommend: ${this.generateContextualRecommendations(template.name, sessionState.analysis_result)}`,
      });
    }

    return Success({
      messages,
      metadata: {
        templateUsed: template.name,
        contextEnhanced: !!context,
        sessionAware: !!sessionState,
      },
    });
  }

  private validateBasicParams(toolName: string, params: any): boolean {
    const toolRequiredParams: Record<string, string[]> = {
      'analyze-repo': ['repoPath'],
      'generate-dockerfile': [],
      'build-image': [],
      scan: ['imageId'],
      push: ['imageId', 'registry'],
      tag: ['imageId', 'newTag'],
    };

    const required = toolRequiredParams[toolName] || [];
    return required.every((param) => params[param] !== undefined && params[param] !== null);
  }

  private generateSuggestions(toolName: string, params: any, context: ToolContext): string[] {
    const suggestions: string[] = [];

    if (toolName === 'generate-dockerfile' && !params.baseImage && context.repositoryPath) {
      suggestions.push('Consider specifying a base image for optimal compatibility');
    }

    if (toolName === 'build-image' && !params.contextPath) {
      suggestions.push('Specify build context path for optimal build performance');
    }

    if (toolName === 'scan' && !params.severity) {
      suggestions.push('Consider setting severity threshold to filter results');
    }

    if (toolName === 'push' && !params.tags) {
      suggestions.push('Add semantic version tags for better image management');
    }

    return suggestions;
  }

  private detectWarnings(toolName: string, params: any, _context: ToolContext): string[] {
    const warnings: string[] = [];

    if (toolName === 'build-image' && params.noCache) {
      warnings.push('Building without cache may significantly increase build time');
    }

    if (toolName === 'push' && params.registry && !params.registry.includes('https')) {
      warnings.push('Using insecure registry protocol');
    }

    if (toolName === 'generate-dockerfile' && params.rootUser) {
      warnings.push('Running container as root user is a security risk');
    }

    return warnings;
  }

  private generateInsights(toolName: string, result: any): string[] {
    const insights: string[] = [];

    if (toolName === 'analyze-repo' && result.language) {
      insights.push(
        `Detected ${result.language} project with ${result.dependencies?.length || 0} dependencies`,
      );
    }

    if (toolName === 'scan' && result.vulnerabilities) {
      const critical = result.vulnerabilities.filter((v: any) => v.severity === 'CRITICAL').length;
      if (critical > 0) {
        insights.push(`Found ${critical} critical vulnerabilities requiring immediate attention`);
      }
    }

    if (toolName === 'build-image' && result.size) {
      const sizeMB = result.size / (1024 * 1024);
      if (sizeMB > 500) {
        insights.push(`Image size (${sizeMB.toFixed(2)}MB) is large, consider optimization`);
      }
    }

    return insights;
  }

  private suggestNextSteps(toolName: string, result: any, _context: any): string[] {
    const nextSteps: string[] = [];

    if (toolName === 'analyze-repo') {
      nextSteps.push('Generate Dockerfile based on analysis results');
      nextSteps.push('Review detected dependencies for security issues');
    }

    if (toolName === 'generate-dockerfile') {
      nextSteps.push('Build Docker image from generated Dockerfile');
      nextSteps.push('Review Dockerfile for optimization opportunities');
    }

    if (toolName === 'build-image') {
      nextSteps.push('Scan image for security vulnerabilities');
      nextSteps.push('Test image functionality before deployment');
    }

    if (toolName === 'scan' && result.vulnerabilities?.length > 0) {
      nextSteps.push('Fix critical vulnerabilities before deployment');
      nextSteps.push('Update base image to latest secure version');
    }

    return nextSteps;
  }

  private detectResultWarnings(toolName: string, result: any): string[] {
    const warnings: string[] = [];

    if (result.error) {
      warnings.push(`Tool execution completed with errors: ${result.error}`);
    }

    if (
      toolName === 'scan' &&
      result.vulnerabilities?.some((v: any) => v.severity === 'CRITICAL')
    ) {
      warnings.push('Critical security vulnerabilities detected');
    }

    if (toolName === 'build-image' && result.warnings) {
      warnings.push(...result.warnings);
    }

    return warnings;
  }

  private generateResourceInsights(uri: string, content: any, schema?: string): string[] {
    const insights: string[] = [];

    if (uri.includes('dockerfile') || uri.toLowerCase().includes('dockerfile')) {
      insights.push('Dockerfile detected - review for security best practices');
    }

    if (uri.includes('k8s') || uri.includes('kubernetes')) {
      insights.push('Kubernetes manifest detected - ensure resource limits are set');
    }

    if (schema === 'application/json' && content) {
      insights.push('JSON configuration detected - validate schema compliance');
    }

    return insights;
  }

  private suggestResourceOptimizations(uri: string, _content: any): string[] {
    const optimizations: string[] = [];

    if (uri.includes('dockerfile')) {
      optimizations.push('Use multi-stage builds to reduce image size');
      optimizations.push('Order commands to maximize layer caching');
    }

    if (uri.includes('k8s') || uri.includes('kubernetes')) {
      optimizations.push('Add health checks and readiness probes');
      optimizations.push('Configure horizontal pod autoscaling');
    }

    return optimizations;
  }

  private buildUserPrompt(template: any, args: any, sessionState?: any): string {
    const parts = [`Please help with ${template.name}.`];

    if (args) {
      parts.push(`Parameters: ${JSON.stringify(args, null, 2)}`);
    }

    if (sessionState?.analysis_result) {
      parts.push(`Repository context: ${JSON.stringify(sessionState.analysis_result, null, 2)}`);
    }

    return parts.join('\n\n');
  }

  private generateContextualRecommendations(templateName: string, analysisResult: any): string {
    const recommendations: string[] = [];

    if (templateName === 'dockerfile-generation' && analysisResult.language) {
      recommendations.push(`Use ${analysisResult.language}-optimized base image`);

      if (analysisResult.framework) {
        recommendations.push(`Configure for ${analysisResult.framework} framework`);
      }
    }

    if (templateName === 'k8s-manifest-generation') {
      recommendations.push('Configure appropriate resource limits based on application profile');
      recommendations.push('Include security contexts and network policies');
    }

    return recommendations.join('; ');
  }
}

/**
 * Create an intelligent AI service instance
 * @param logger - Logger instance for service operations
 * @param sessionManager - Session manager for context and history
 * @returns IntelligentAIService instance
 */
export const createIntelligentAIService = (logger: Logger, sessionManager: any): IntelligentAIService =>
  new IntelligentAIService(logger, sessionManager);
