# AI Integration Guide

## Overview
The Enhanced AI Service provides intelligent assistance for containerization tasks through the MCP protocol.

## Core Components

### AIRequestBuilder
Fluent interface for constructing AI requests:

```typescript
const request = new AIRequestBuilder()
  .withModel('claude-3-haiku-20240307')
  .withSystemPrompt('You are a Docker expert')
  .withUserPrompt('Generate Dockerfile for Node.js app')
  .withTemperature(0.2)
  .withMaxTokens(1500)
  .build();
```

### StructuredSampler
Context-aware structured output generation:

```typescript
const sampler = new StructuredSampler(mcpSampler, logger);

const result = await sampler.generateStructured<DockerfileResult>(
  'Generate optimized Dockerfile for Node.js Express app',
  {
    schema: DockerfileSchema,
    format: 'json',
    validateSecurity: true,
    temperature: 0.2,
    maxTokens: 3000
  }
);
```

### Response Caching
Automatic caching for similar requests:

```typescript
// Cached automatically for 15 minutes based on content hash
const response = await aiService.generateStructured(request, schema);
console.log(`Cached: ${response.metadata?.cached}`);
```

## AI Request Patterns

### Basic Request Structure
```typescript
import { AIRequestBuilder } from '../infrastructure/ai/builders/ai-request-builder.js';

const request = new AIRequestBuilder()
  .withModel('claude-3-haiku-20240307')
  .withSystemPrompt(`You are an expert DevOps engineer specializing in containerization.
    Generate production-ready configurations following best practices.`)
  .withUserPrompt(userInput)
  .withTemperature(0.3) // Low temperature for consistent results
  .withMaxTokens(2000)
  .build();
```

### Dockerfile Generation
```typescript
const dockerfileRequest = new AIRequestBuilder()
  .withSystemPrompt(`Generate optimized Dockerfiles following these principles:
    - Use multi-stage builds for size optimization
    - Run as non-root user for security
    - Minimize layer count
    - Use specific base image tags
    - Include health checks`)
  .withUserPrompt(`Create Dockerfile for ${language} ${framework} application:
    Entry point: ${entryPoint}
    Port: ${port}
    Dependencies: ${dependencies.join(', ')}`)
  .withTemperature(0.2)
  .withMaxTokens(3000)
  .build();
```

### Kubernetes Manifest Generation
```typescript
const k8sRequest = new AIRequestBuilder()
  .withSystemPrompt(`Generate production-ready Kubernetes manifests including:
    - Deployment with proper resource limits
    - Service configuration
    - ConfigMap for environment variables
    - Ingress if external access needed
    - SecurityContext for least privilege`)
  .withUserPrompt(`Generate K8s manifests for:
    Application: ${appName}
    Image: ${imageName}
    Port: ${port}
    Environment: ${environment}
    Replicas: ${replicas}`)
  .withTemperature(0.2)
  .withMaxTokens(4000)
  .build();
```

## Structured Output Schemas

### Dockerfile Schema
```typescript
import { z } from 'zod';

const DockerfileSchema = z.object({
  dockerfile: z.string().describe('Complete Dockerfile content'),
  stages: z.array(z.object({
    name: z.string(),
    baseImage: z.string(),
    description: z.string()
  })).describe('Build stages information'),
  estimatedSize: z.string().describe('Estimated final image size'),
  optimizations: z.array(z.string()).describe('Applied optimizations'),
  securityFeatures: z.array(z.string()).describe('Security measures implemented')
});
```

### Repository Analysis Schema
```typescript
const AnalysisSchema = z.object({
  language: z.string(),
  framework: z.string().optional(),
  buildSystem: z.string().optional(),
  entryPoint: z.string(),
  port: z.number().optional(),
  dependencies: z.array(z.string()),
  testFramework: z.string().optional(),
  dockerizable: z.boolean(),
  recommendations: z.array(z.object({
    category: z.string(),
    suggestion: z.string(),
    priority: z.enum(['low', 'medium', 'high'])
  }))
});
```

## Error Recovery Strategies

### Progressive Recovery
The AI service implements multiple recovery strategies:

1. **JSON Repair**: Fix malformed JSON responses
2. **Simplification**: Reduce request complexity
3. **Alternative Models**: Try different AI models
4. **Fallback Generation**: Use simpler prompts

```typescript
export class EnhancedErrorRecovery {
  async recoverFromError(
    originalRequest: AIRequest,
    error: AIError,
    attempt: number
  ): Promise<RecoveryAction> {
    
    if (this.isJSONParseError(error)) {
      return {
        type: 'repair-json',
        modifiedRequest: originalRequest,
        repairInstructions: 'Fix JSON syntax and structure'
      };
    }
    
    if (this.isComplexityError(error)) {
      return {
        type: 'simplify',
        modifiedRequest: this.simplifyRequest(originalRequest),
        reason: 'Request too complex, reducing scope'
      };
    }
    
    if (attempt < 3) {
      return {
        type: 'retry',
        modifiedRequest: this.adjustSamplingParams(originalRequest),
        reason: 'Temporary failure, adjusting parameters'
      };
    }
    
    return {
      type: 'fallback',
      modifiedRequest: this.createFallbackRequest(originalRequest),
      reason: 'Using simplified fallback approach'
    };
  }
}
```

## Token Optimization

### Prompt Engineering
1. **Concise Instructions**: Remove redundant words
2. **Structured Format**: Use clear section headers
3. **Example-Driven**: Provide concrete examples
4. **Context Compression**: Summarize large contexts

```typescript
// Optimized prompt structure
const optimizedPrompt = `
TASK: Generate Dockerfile for ${language} application

REQUIREMENTS:
- Multi-stage build
- Security hardening
- Size optimization
- Health checks

INPUT:
${JSON.stringify(context, null, 2)}

OUTPUT FORMAT:
{
  "dockerfile": "complete dockerfile content",
  "explanation": "key optimizations applied"
}
`;
```

### Caching Strategy
```typescript
export class ResponseCache {
  private cache = new Map<string, CachedResponse>();
  
  generateCacheKey(request: AIRequest): string {
    // Create hash from normalized request content
    const normalized = this.normalizeRequest(request);
    return this.hashContent(JSON.stringify(normalized));
  }
  
  async get(key: string): Promise<CachedResponse | null> {
    const cached = this.cache.get(key);
    if (!cached || this.isExpired(cached)) {
      return null;
    }
    return cached;
  }
  
  set(key: string, response: any, ttl: number = 900000): void {
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl
    });
  }
}
```

## Adding AI to New Tools

### Step 1: Define Request Template
Create specialized request builders for your tool:

```typescript
export class CustomToolAI {
  constructor(private sampler: StructuredSampler) {}
  
  async generateCustomOutput(input: CustomInput): Promise<CustomOutput> {
    const request = new AIRequestBuilder()
      .withSystemPrompt(this.getSystemPrompt())
      .withUserPrompt(this.buildUserPrompt(input))
      .withTemperature(0.3)
      .withMaxTokens(2000)
      .build();
    
    const result = await this.sampler.generateStructured<CustomOutput>(
      request,
      CustomOutputSchema
    );
    
    if (!result.success) {
      throw new Error(`AI generation failed: ${result.error}`);
    }
    
    return result.data!;
  }
  
  private getSystemPrompt(): string {
    return `You are an expert in ${domain}. 
    Generate production-ready configurations following best practices.
    Always include security considerations and performance optimizations.`;
  }
  
  private buildUserPrompt(input: CustomInput): string {
    return `Generate ${outputType} for:
    Context: ${JSON.stringify(input.context)}
    Requirements: ${input.requirements.join(', ')}
    Constraints: ${JSON.stringify(input.constraints)}`;
  }
}
```

### Step 2: Integration Pattern
```typescript
// In your tool handler
export class MyTool implements MCPTool {
  constructor(
    private dockerService: DockerService,
    private aiService: CustomToolAI
  ) {}
  
  async execute(input: MyToolInput): Promise<MyToolOutput> {
    // Use AI for intelligent processing
    const aiResult = await this.aiService.generateCustomOutput({
      context: input.context,
      requirements: input.requirements,
      constraints: input.constraints
    });
    
    // Combine AI output with service operations
    const serviceResult = await this.dockerService.performOperation(
      aiResult.configuration
    );
    
    return {
      result: serviceResult,
      aiInsights: aiResult.insights,
      recommendations: aiResult.recommendations
    };
  }
}
```

## Performance Guidelines

### Request Optimization
```typescript
// Efficient batching for multiple related requests
export class BatchAIProcessor {
  async processBatch(requests: AIRequest[]): Promise<AIResponse[]> {
    // Group similar requests
    const groups = this.groupSimilarRequests(requests);
    
    // Process groups concurrently with rate limiting
    const results = await Promise.all(
      groups.map(group => this.processGroup(group))
    );
    
    return results.flat();
  }
  
  private async processGroup(requests: AIRequest[]): Promise<AIResponse[]> {
    // Process with controlled concurrency
    const concurrency = 3;
    const semaphore = new Semaphore(concurrency);
    
    return Promise.all(
      requests.map(request => 
        semaphore.acquire().then(async () => {
          try {
            return await this.processRequest(request);
          } finally {
            semaphore.release();
          }
        })
      )
    );
  }
}
```

### Memory Management
```typescript
// Implement streaming for large responses
export class StreamingAIProcessor {
  async processLargeRequest(request: AIRequest): Promise<AsyncIterable<string>> {
    const stream = await this.sampler.sampleStream(request);
    
    return this.processStream(stream);
  }
  
  private async* processStream(stream: ReadableStream): AsyncIterable<string> {
    const reader = stream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Process and yield chunks
        const processed = this.processChunk(value);
        if (processed) {
          yield processed;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

## Security Considerations

### Input Sanitization
```typescript
export class PromptSanitizer {
  sanitizePrompt(prompt: string): string {
    // Remove potential injection patterns
    let sanitized = prompt
      .replace(/\b(exec|eval|system|shell)\s*\(/gi, '[REMOVED]')
      .replace(/\$\{[^}]*\}/g, '[TEMPLATE_REMOVED]')
      .replace(/<script[^>]*>.*?<\/script>/gi, '[SCRIPT_REMOVED]');
    
    // Limit prompt length
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000) + '...[TRUNCATED]';
    }
    
    return sanitized;
  }
  
  validateRequest(request: AIRequest): ValidationResult {
    const issues: string[] = [];
    
    // Check for sensitive patterns
    const messages = request.messages || [];
    for (const message of messages) {
      if (this.containsSensitiveData(message.content)) {
        issues.push('Potential sensitive data detected');
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
}
```

### Output Validation
```typescript
export class OutputValidator {
  validateDockerfile(content: string): SecurityValidation {
    const issues: SecurityIssue[] = [];
    
    // Check for security anti-patterns
    if (content.includes('USER root')) {
      issues.push({
        type: 'security',
        severity: 'high',
        message: 'Running as root user detected',
        suggestion: 'Use non-root user for security'
      });
    }
    
    if (content.includes('--no-check-certificate')) {
      issues.push({
        type: 'security',
        severity: 'critical',
        message: 'Certificate validation bypass detected',
        suggestion: 'Remove --no-check-certificate flag'
      });
    }
    
    return {
      valid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      recommendations: this.generateRecommendations(issues)
    };
  }
}
```

## Monitoring and Metrics

### Usage Tracking
```typescript
export class AIMetrics {
  private metrics = {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    totalTokens: 0,
    averageResponseTime: 0,
    cacheHitRate: 0
  };
  
  recordRequest(request: AIRequest, response: AIResponse, duration: number): void {
    this.metrics.requestCount++;
    
    if (response.success) {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
    }
    
    if (response.tokenCount) {
      this.metrics.totalTokens += response.tokenCount;
    }
    
    // Update moving average
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * 0.9) + (duration * 0.1);
  }
  
  getMetrics(): AIMetrics {
    return { ...this.metrics };
  }
}
```

## Best Practices

### 1. Prompt Design
- Keep system prompts focused and specific
- Use clear, actionable language
- Provide concrete examples
- Structure output requirements clearly

### 2. Error Handling
- Always implement fallback strategies
- Validate AI-generated content
- Provide meaningful error messages
- Log failures for debugging

### 3. Performance
- Cache similar requests
- Use appropriate temperature settings
- Limit token usage where possible
- Implement request batching for bulk operations

### 4. Security
- Sanitize all inputs
- Validate all outputs
- Never expose sensitive data in prompts
- Implement rate limiting

### 5. Testing
- Test with various input scenarios
- Mock AI responses for unit tests
- Validate schema compliance
- Test error recovery paths