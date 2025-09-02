# Tool Development Guide

## Overview
This guide explains how to create new MCP tools for the Container Kit server.

## Tool Structure

### Basic Tool Template
```typescript
import { z } from 'zod';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';

// 1. Define input schema
const InputSchema = z.object({
  path: z.string().describe('Repository path'),
  options: z.object({
    deep: z.boolean().optional().describe('Deep analysis'),
    exclude: z.array(z.string()).optional().describe('Paths to exclude')
  }).optional()
});

// 2. Define output schema
const OutputSchema = z.object({
  result: z.string(),
  metadata: z.record(z.any()).optional()
});

// 3. Create tool descriptor
export const myToolDescriptor: MCPToolDescriptor<
  z.infer<typeof InputSchema>,
  z.infer<typeof OutputSchema>
> = {
  name: 'my_tool_name',
  description: 'Clear description of what the tool does',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  
  handler: async (input, context) => {
    const { logger, dockerService, aiService, progressToken } = context;
    
    try {
      // Report progress if token provided
      if (progressToken) {
        await context.reportProgress(0.1, 'Starting operation...');
      }
      
      // Tool implementation
      const result = await performOperation(input);
      
      if (progressToken) {
        await context.reportProgress(1.0, 'Complete');
      }
      
      return {
        result: result.data,
        metadata: { timestamp: new Date().toISOString() }
      };
      
    } catch (error) {
      logger.error({ error }, 'Tool execution failed');
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to execute: ${error.message}`
      );
    }
  }
};
```

## Step-by-Step Guide

### Step 1: Plan Your Tool
1. Define clear purpose and scope
2. Identify required services (Docker, K8s, AI)
3. Design input/output structure
4. Consider error cases

### Step 2: Create Tool File
Location: `src/application/tools/category/tool-name.ts`

Categories:
- `analysis/` - Repository and code analysis
- `build/` - Docker image building
- `deploy/` - Kubernetes deployment
- `workflow/` - Orchestration tools
- `ops/` - Operational tools

### Step 3: Define Schemas
```typescript
// Use descriptive field names
const InputSchema = z.object({
  sourcePath: z.string().describe('Path to source code'),
  targetRegistry: z.string().optional().describe('Docker registry URL'),
  buildArgs: z.record(z.string()).optional().describe('Build arguments')
});

// Include all relevant output data
const OutputSchema = z.object({
  imageId: z.string(),
  imageTags: z.array(z.string()),
  size: z.number(),
  layers: z.number(),
  vulnerabilities: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number()
  }).optional()
});
```

### Step 4: Implement Handler
```typescript
handler: async (input, context) => {
  const { logger, dockerService } = context;
  
  // 1. Validate preconditions
  const dockerAvailable = await dockerService.health();
  if (!dockerAvailable.available) {
    throw new McpError(
      ErrorCode.ServiceUnavailable,
      'Docker is not available'
    );
  }
  
  // 2. Execute main logic
  const buildResult = await dockerService.buildImage({
    path: input.sourcePath,
    buildArgs: input.buildArgs,
    onProgress: (progress) => {
      if (context.progressToken) {
        context.reportProgress(progress.percent, progress.message);
      }
    }
  });
  
  // 3. Post-process results
  const scanResult = await dockerService.scanImage(buildResult.imageId);
  
  // 4. Return structured output
  return {
    imageId: buildResult.imageId,
    imageTags: buildResult.tags,
    size: buildResult.size,
    layers: buildResult.layers,
    vulnerabilities: scanResult.vulnerabilities
  };
}
```

### Step 5: Add Progress Reporting
```typescript
// For long-running operations
const steps = [
  { percent: 0.1, message: 'Preparing build context' },
  { percent: 0.3, message: 'Building base layers' },
  { percent: 0.6, message: 'Installing dependencies' },
  { percent: 0.8, message: 'Creating final image' },
  { percent: 1.0, message: 'Build complete' }
];

for (const step of steps) {
  await performStep();
  if (context.progressToken) {
    await context.reportProgress(step.percent, step.message);
  }
}
```

### Step 6: Register Tool
```typescript
// src/application/tools/factory.ts
import { myToolDescriptor } from './category/my-tool.js';

export const tools = [
  // ... existing tools
  myToolDescriptor
];
```

### Step 7: Test Your Tool

#### Unit Test
```typescript
// test/unit/tools/my-tool.test.ts
import { describe, it, expect, vi } from 'vitest';
import { myToolDescriptor } from '../../../src/application/tools/category/my-tool.js';
import { createMockContext } from '../../helpers/mock-context.js';

describe('MyTool', () => {
  it('should execute successfully', async () => {
    const mockContext = createMockContext();
    const input = { path: '/test' };
    
    const result = await myToolDescriptor.handler(
      input,
      mockContext
    );
    
    expect(result.result).toBeDefined();
  });
  
  it('should handle errors gracefully', async () => {
    const mockContext = createMockContext();
    mockContext.dockerService.health.mockResolvedValue({
      available: false
    });
    
    await expect(
      myToolDescriptor.handler({}, mockContext)
    ).rejects.toThrow();
  });
});
```

#### Integration Test
```typescript
// test/integration/tools/my-tool.test.ts
import { describe, it, expect } from 'vitest';
import { createTestServer } from '../../helpers/test-server.js';

describe('MyTool Integration', () => {
  it('should work with real services', async () => {
    const server = await createTestServer();
    
    const result = await server.callTool('my_tool_name', {
      path: './test-repo'
    });
    
    expect(result.content[0].text).toContain('success');
  });
});
```

## Tool Architecture Patterns

### Input/Output Transformation
Support both snake_case and camelCase for better compatibility:

```typescript
const BuildImageInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    build_args: z.record(z.string(), z.string()).optional(),
    buildArgs: z.record(z.string(), z.string()).optional()
  })
  .transform((data) => ({
    sessionId: data.session_id || data.sessionId || '',
    buildArgs: data.build_args || data.buildArgs || {}
  }));
```

### Service Integration
Tools should use dependency injection for services:

```typescript
export class MyToolHandler {
  constructor(
    private dockerService: DockerService,
    private aiService: EnhancedAIService,
    private logger: Logger
  ) {}
  
  async execute(input: MyToolInput, context: MCPToolContext): Promise<MyToolOutput> {
    // Use injected services
    const dockerHealth = await this.dockerService.health();
    
    if (context.aiService) {
      const aiAnalysis = await context.aiService.analyze(input);
      // Process AI results
    }
    
    return result;
  }
}
```

### Error Handling Strategy
Implement comprehensive error handling:

```typescript
export async function executeToolWithErrorHandling<T>(
  operation: () => Promise<T>,
  context: MCPToolContext,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    context.logger.error({ 
      error: error.message,
      operation: operationName,
      sessionId: context.sessionId
    }, 'Tool execution failed');
    
    // Convert to appropriate MCP error
    if (error instanceof ValidationError) {
      throw new McpError(ErrorCode.InvalidRequest, error.message);
    }
    
    if (error instanceof NotFoundError) {
      throw new McpError(ErrorCode.NotFound, error.message);
    }
    
    throw new McpError(ErrorCode.InternalError, `${operationName} failed`);
  }
}
```

### Progress Tracking
Implement detailed progress tracking for long operations:

```typescript
export class ProgressTracker {
  private steps: ProgressStep[] = [];
  private currentStep = 0;
  
  constructor(
    private context: MCPToolContext,
    private totalSteps: number
  ) {}
  
  async reportStep(message: string): Promise<void> {
    this.currentStep++;
    const progress = this.currentStep / this.totalSteps;
    
    if (this.context.progressToken) {
      await this.context.reportProgress(progress, message);
    }
    
    this.context.logger.info({ 
      progress, 
      message,
      step: this.currentStep,
      totalSteps: this.totalSteps
    }, 'Tool progress');
  }
}

// Usage in tool handler
const tracker = new ProgressTracker(context, 5);

await tracker.reportStep('Analyzing repository');
// ... perform analysis ...

await tracker.reportStep('Generating Dockerfile');
// ... generate dockerfile ...

await tracker.reportStep('Building image');
// ... build image ...
```

## AI Integration in Tools

### Using AI Service
```typescript
export const aiPoweredTool: MCPToolDescriptor = {
  name: 'ai_powered_analysis',
  description: 'Analyze code using AI',
  inputSchema: AnalysisInputSchema,
  outputSchema: AnalysisOutputSchema,
  
  handler: async (input, context) => {
    const { aiService, logger } = context;
    
    if (!aiService) {
      logger.warn('AI service not available, using fallback');
      return fallbackAnalysis(input);
    }
    
    try {
      const aiResult = await aiService.generateStructured(
        `Analyze this ${input.language} project structure and suggest containerization approach`,
        {
          schema: ContainerizationSuggestionSchema,
          context: {
            projectPath: input.path,
            files: input.files,
            dependencies: input.dependencies
          }
        }
      );
      
      return {
        analysis: aiResult.data,
        confidence: aiResult.confidence,
        suggestions: aiResult.suggestions
      };
      
    } catch (error) {
      logger.error({ error }, 'AI analysis failed, using fallback');
      return fallbackAnalysis(input);
    }
  }
};
```

### Structured Output Generation
```typescript
const DockerfileSuggestionSchema = z.object({
  dockerfile: z.string().describe('Complete Dockerfile content'),
  baseImage: z.string().describe('Recommended base image'),
  optimizations: z.array(z.string()).describe('Applied optimizations'),
  securityRecommendations: z.array(z.string()).describe('Security improvements'),
  estimatedSize: z.string().describe('Estimated final image size')
});

export const generateDockerfileAI: MCPToolDescriptor = {
  name: 'generate_dockerfile_ai',
  description: 'Generate optimized Dockerfile using AI',
  inputSchema: DockerfileGenerationInput,
  outputSchema: DockerfileSuggestionSchema,
  
  handler: async (input, context) => {
    const { aiService } = context;
    
    const prompt = `Generate an optimized, production-ready Dockerfile for:
    
    Language: ${input.language}
    Framework: ${input.framework || 'none'}
    Entry Point: ${input.entryPoint}
    Dependencies: ${input.dependencies.join(', ')}
    
    Requirements:
    - Multi-stage build for size optimization
    - Security best practices (non-root user, minimal attack surface)
    - Efficient layer caching
    - Health checks where appropriate
    `;
    
    const result = await aiService?.generateStructured(
      prompt,
      {
        schema: DockerfileSuggestionSchema,
        temperature: 0.2,
        maxTokens: 3000
      }
    );
    
    return result?.data || generateFallbackDockerfile(input);
  }
};
```

## Best Practices

### Naming Conventions
- Tool names: `snake_case` (e.g., `build_image`)
- File names: `kebab-case` (e.g., `build-image.ts`)
- Schema names: `PascalCase` (e.g., `BuildImageInput`)

### Error Handling
```typescript
// Be specific about errors
if (!file.exists) {
  throw new McpError(
    ErrorCode.InvalidRequest,
    `File not found: ${input.path}`
  );
}

// Include helpful context
catch (error) {
  throw new McpError(
    ErrorCode.InternalError,
    'Docker build failed',
    { 
      dockerfile: input.dockerfilePath,
      error: error.message 
    }
  );
}
```

### Documentation
```typescript
/**
 * Builds a Docker image from source code
 * 
 * @param input.sourcePath - Path to source code directory
 * @param input.dockerfile - Optional Dockerfile path
 * @param input.tags - Image tags to apply
 * 
 * @returns Built image details including ID, size, and tags
 * 
 * @throws {McpError} When Docker is unavailable
 * @throws {McpError} When build fails
 * 
 * @example
 * const result = await buildImage({
 *   sourcePath: './my-app',
 *   tags: ['myapp:latest', 'myapp:v1.0.0']
 * });
 */
```

### Performance
1. Use progress tokens for operations > 2 seconds
2. Implement timeouts for external calls
3. Cache expensive computations
4. Batch related operations

### Security
1. Validate all input paths
2. Sanitize user-provided values
3. Don't expose sensitive information
4. Use least-privilege principles

## Tool Registration and Discovery

### Factory Pattern
```typescript
// src/application/tools/factory.ts
export class ToolFactory {
  constructor(private services: CoreServices) {}
  
  createTools(): MCPToolDescriptor[] {
    return [
      this.createAnalysisTools(),
      this.createBuildTools(),
      this.createDeploymentTools(),
      this.createOperationalTools()
    ].flat();
  }
  
  private createAnalysisTools(): MCPToolDescriptor[] {
    return [
      new AnalyzeRepositoryTool(this.services),
      new DetectFrameworkTool(this.services)
    ];
  }
  
  private createBuildTools(): MCPToolDescriptor[] {
    return [
      new BuildImageTool(this.services),
      new ScanImageTool(this.services),
      new TagImageTool(this.services)
    ];
  }
}
```

### Dynamic Registration
```typescript
export class DynamicToolRegistry {
  private tools = new Map<string, MCPToolDescriptor>();
  
  register(tool: MCPToolDescriptor): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    
    this.tools.set(tool.name, tool);
  }
  
  unregister(toolName: string): boolean {
    return this.tools.delete(toolName);
  }
  
  getTool(name: string): MCPToolDescriptor | undefined {
    return this.tools.get(name);
  }
  
  getAllTools(): MCPToolDescriptor[] {
    return Array.from(this.tools.values());
  }
  
  getToolsByCategory(category: string): MCPToolDescriptor[] {
    return this.getAllTools().filter(tool => 
      tool.category === category
    );
  }
}
```

## Testing Strategies

### Mock Context Creation
```typescript
// test/helpers/mock-context.ts
export function createMockContext(): MockMCPToolContext {
  return {
    logger: createMockLogger(),
    dockerService: {
      health: vi.fn().mockResolvedValue({ available: true }),
      buildImage: vi.fn().mockResolvedValue({ imageId: 'mock-id' }),
      scanImage: vi.fn().mockResolvedValue({ vulnerabilities: {} })
    },
    aiService: {
      generateStructured: vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'mock-analysis' }
      })
    },
    progressToken: 'mock-token',
    reportProgress: vi.fn(),
    sessionId: 'test-session'
  };
}
```

### Integration Test Helpers
```typescript
// test/helpers/test-server.ts
export class TestMCPServer {
  private server: MCPServer;
  
  constructor(private tools: MCPToolDescriptor[]) {
    this.server = new MCPServer('test-server', '1.0.0');
    this.registerTools();
  }
  
  async callTool(name: string, args: any): Promise<any> {
    return await this.server.callTool({ name, arguments: args });
  }
  
  private registerTools(): void {
    for (const tool of this.tools) {
      this.server.setRequestHandler(
        'tools/call',
        async (request) => {
          if (request.params.name === tool.name) {
            return await tool.handler(
              request.params.arguments,
              this.createContext()
            );
          }
        }
      );
    }
  }
}
```

## Advanced Patterns

### Composite Tools
Tools that orchestrate multiple operations:

```typescript
export const fullContainerizationWorkflow: MCPToolDescriptor = {
  name: 'full_containerization_workflow',
  description: 'Complete containerization workflow',
  inputSchema: WorkflowInputSchema,
  outputSchema: WorkflowOutputSchema,
  
  handler: async (input, context) => {
    const results = [];
    const tracker = new ProgressTracker(context, 5);
    
    // Step 1: Analyze repository
    await tracker.reportStep('Analyzing repository structure');
    const analysis = await callTool('analyze_repository', {
      path: input.projectPath
    }, context);
    results.push({ step: 'analysis', result: analysis });
    
    // Step 2: Generate Dockerfile
    await tracker.reportStep('Generating Dockerfile');
    const dockerfile = await callTool('generate_dockerfile', {
      language: analysis.language,
      framework: analysis.framework
    }, context);
    results.push({ step: 'dockerfile', result: dockerfile });
    
    // Step 3: Build image
    await tracker.reportStep('Building Docker image');
    const build = await callTool('build_image', {
      context: input.projectPath,
      tags: input.tags
    }, context);
    results.push({ step: 'build', result: build });
    
    // Step 4: Scan for vulnerabilities
    await tracker.reportStep('Scanning for security vulnerabilities');
    const scan = await callTool('scan_image', {
      imageId: build.imageId
    }, context);
    results.push({ step: 'scan', result: scan });
    
    // Step 5: Generate K8s manifests (optional)
    if (input.generateKubernetes) {
      await tracker.reportStep('Generating Kubernetes manifests');
      const manifests = await callTool('generate_k8s_manifests', {
        imageId: build.imageId,
        appName: input.appName
      }, context);
      results.push({ step: 'kubernetes', result: manifests });
    }
    
    return {
      success: true,
      steps: results,
      summary: {
        imageId: build.imageId,
        vulnerabilities: scan.summary,
        ready: scan.criticalCount === 0
      }
    };
  }
};
```

### Tool Chaining
Enable tools to suggest next steps:

```typescript
export interface ToolChainHint {
  nextTools: string[];
  requiredData: string[];
  reasoning: string;
}

export const chainAwareTool: MCPToolDescriptor = {
  // ... tool definition
  
  handler: async (input, context) => {
    const result = await performOperation(input);
    
    // Add chain hints to the result
    const chainHints: ToolChainHint = {
      nextTools: ['build_image', 'scan_image'],
      requiredData: ['dockerfile_path', 'build_context'],
      reasoning: 'After generating Dockerfile, typically build and scan the image'
    };
    
    return {
      ...result,
      _chainHints: chainHints
    };
  }
};
```

This comprehensive guide provides everything needed to create robust, well-tested MCP tools that integrate seamlessly with the Container Kit server architecture.