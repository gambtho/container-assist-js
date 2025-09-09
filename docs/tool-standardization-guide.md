# Tool Standardization Guide

## Overview: The Golden Path Pattern

The Golden Path pattern is our standardized approach for implementing tools in the MCP ecosystem. All tools in this codebase have been migrated to follow this pattern, ensuring consistent behavior, improved maintainability, and better developer experience.

**Migration Status: ✅ COMPLETE** - All 15+ tools now use standardized helpers

### Key Principles

1. **Consistent Parameter Handling**: SessionId is always optional with intelligent defaults
2. **Uniform Return Shapes**: All tools return structured objects, never JSON-in-text
3. **Standardized Progress Reporting**: 4-stage pattern (Validating → Executing → Finalizing → Complete)
4. **Centralized AI Invocation**: All AI calls go through a single helper with fallback logic
5. **Typed Session Mutations**: Type-safe session state updates with atomic operations
6. **Registry-Based Prompts**: All prompts accessed via centralized registry

### Benefits

- **Reduced Boilerplate**: 30-40% less duplicated code
- **Consistent API**: Single pattern to learn for all tools
- **Better Error Handling**: Centralized error recovery and fallback mechanisms
- **Improved Testing**: Standardized helpers are easier to test and mock
- **Enhanced Maintainability**: Changes in one place affect all tools

## Before/After Comparison

### Before: Inconsistent Tool Implementation

```typescript
// OLD: Direct implementation with mixed concerns
export async function generateDockerfile(
  config: GenerateDockerfileConfig,
  logger: Logger,
  context?: ToolContext
): Promise<Result<GenerateDockerfileResult>> {
  try {
    // Manual session handling
    const sessionManager = createSessionManager(logger);
    const session = await sessionManager.get(config.sessionId);
    
    if (!session) {
      return Failure(`Session ${config.sessionId} not found`);
    }
    
    // Direct AI invocation with custom error handling
    try {
      const prompt = await context.getPrompt('generate-dockerfile', args);
      const response = await context.sampling.createMessage({
        messages: prompt.messages,
        maxTokens: 2048,
      });
      
      // Custom response processing
      const text = response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      
      // Manual progress reporting
      if (context.progressReporter) {
        await context.progressReporter.report({
          message: 'Generating Dockerfile',
          percentage: 50
        });
      }
      
      // Process and return
      const dockerfile = processResponse(text);
      
      // Manual session update
      await sessionManager.update(config.sessionId, {
        workflow_state: {
          ...session.workflow_state,
          dockerfile_result: dockerfile
        }
      });
      
      return Success({
        ok: true,
        sessionId: config.sessionId,
        content: dockerfile,
        path: '/app/Dockerfile'
      });
      
    } catch (aiError) {
      // Fallback logic duplicated in each tool
      logger.warn('AI failed, using template');
      const fallback = generateTemplate(analysis);
      return Success({
        ok: true,
        sessionId: config.sessionId,
        content: fallback,
        path: '/app/Dockerfile'
      });
    }
  } catch (error) {
    return Failure(error.message);
  }
}
```

### After: Golden Path Implementation

```typescript
// NEW: Standardized implementation using helpers
import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession } from '@mcp/tools/session-helpers';
import { aiGenerate } from '@mcp/tools/ai-helpers';
import { formatStandardResponse } from '@mcp/tools/response-formatter';

export const generateDockerfileTool = wrapTool('generate-dockerfile', 
  async (params, context, logger) => {
    // 1. Session resolution with smart defaults
    const sess = await resolveSession(logger, context, {
      sessionId: params.sessionId,  // Optional parameter
      defaultIdHint: computeHash(params.repoPath)
    });
    
    // 2. Centralized AI generation with automatic fallback
    const result = await aiGenerate(logger, context, {
      promptName: 'dockerfile-generation',
      promptArgs: {
        framework: params.framework,
        requirements: params.requirements
      },
      expectation: 'dockerfile',
      fallbackBehavior: 'retry',
      maxRetries: 3
    });
    
    // 3. Type-safe session mutation
    if (result.ok) {
      await appendCompletedStep(sess.value.id, 'dockerfile-generated');
      await setWorkflowManifests(sess.value.id, {
        dockerfile: result.value
      });
    }
    
    // 4. Standardized response format
    return formatStandardResponse(result, sess.value.id);
  }
);
```

## Step-by-Step Migration Instructions

### Step 1: Analyze Current Tool Structure

Before migrating, understand your tool's current implementation:

```bash
# Review the tool's current structure
cat src/tools/your-tool/tool.ts

# Check for:
# - Session handling patterns
# - AI invocation methods
# - Progress reporting
# - Return value structure
# - Error handling approach
```

### Step 2: Install Helper Dependencies

Ensure all helper modules are available:

```typescript
// Add imports at the top of your tool file
import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession, appendCompletedStep, setWorkflowManifests } from '@mcp/tools/session-helpers';
import { aiGenerate, withAIFallback } from '@mcp/tools/ai-helpers';
import { formatStandardResponse, responseFormatters } from '@mcp/tools/response-formatter';
import { createStandardProgress, STANDARD_STAGES } from '@mcp/utils/progress-helper';
```

### Step 3: Update Parameter Interface

Make sessionId optional in your tool's parameters:

```typescript
// BEFORE
export interface MyToolParams {
  sessionId: string;  // Required
  otherParam: string;
}

// AFTER
export interface MyToolParams {
  sessionId?: string;  // Optional with ?
  otherParam: string;
}
```

### Step 4: Wrap Tool Implementation

Convert your tool to use the wrapper pattern:

```typescript
// BEFORE: Direct export
export async function myTool(
  params: MyToolParams,
  logger: Logger,
  context?: ToolContext
): Promise<Result<MyToolResult>> {
  // Implementation
}

// AFTER: Wrapped export
export const myTool = wrapTool('my-tool', 
  async (params, context, logger) => {
    // Implementation using helpers
  }
);
```

### Step 5: Implement Session Resolution

Replace manual session handling with the helper:

```typescript
// BEFORE: Manual session management
const sessionManager = createSessionManager(logger);
const session = await sessionManager.get(params.sessionId);
if (!session) {
  return Failure('Session not found');
}

// AFTER: Automatic session resolution
const sess = await resolveSession(logger, context, {
  sessionId: params.sessionId,
  defaultIdHint: computeDefaultId(params)
});
// sess.value is guaranteed to exist
```

### Step 6: Standardize AI Invocations

Replace direct AI calls with the centralized helper:

```typescript
// BEFORE: Direct AI invocation
const prompt = await context.getPrompt('my-prompt', args);
const response = await context.sampling.createMessage({
  messages: prompt.messages,
  maxTokens: 2048
});
const text = extractText(response);

// AFTER: Centralized AI helper
const result = await aiGenerate(logger, context, {
  promptName: 'my-prompt',
  promptArgs: args,
  expectation: 'json',  // or 'dockerfile', 'yaml', 'text'
  fallbackBehavior: 'retry',
  maxRetries: 3
});
// result.value contains processed response or fallback
```

### Step 7: Update Progress Reporting

Use the standardized 4-stage pattern:

```typescript
// BEFORE: Custom progress reporting
if (context.progressReporter) {
  await context.progressReporter.report({ 
    message: 'Starting...', 
    percentage: 10 
  });
}
// ... more custom progress calls

// AFTER: Standardized stages (handled by wrapper)
// The wrapper automatically reports:
// - VALIDATING (10%)
// - EXECUTING (50%)
// - FINALIZING (90%)
// - COMPLETE (100%)
// No manual progress calls needed!
```

### Step 8: Standardize Return Values

Use the response formatter for consistent shapes:

```typescript
// BEFORE: Custom return structure
return Success({
  ok: true,
  sessionId: params.sessionId,
  data: JSON.stringify(result),
  message: 'Success'
});

// AFTER: Standardized formatter
return formatStandardResponse(result, sess.value.id);

// Or use specific formatters for known types:
return Success(responseFormatters.dockerfile(
  dockerfileContent,
  sess.value.id
));
```

### Step 9: Update Session State

Use typed session mutation helpers:

```typescript
// BEFORE: Manual state updates
await sessionManager.update(sessionId, {
  workflow_state: {
    ...oldState,
    my_result: result,
    completed_steps: [...oldSteps, 'my-step']
  }
});

// AFTER: Typed helpers
await appendCompletedStep(sess.value.id, 'my-step');
await setWorkflowManifests(sess.value.id, {
  myArtifact: result
});
```

### Step 10: Test the Migration

Create comprehensive tests for your migrated tool:

```typescript
describe('myTool (migrated)', () => {
  it('should handle optional sessionId', async () => {
    const result = await myTool(
      { otherParam: 'value' },  // No sessionId
      mockContext
    );
    expect(result.ok).toBe(true);
    expect(result.value.sessionId).toBeDefined();
  });
  
  it('should use AI with fallback', async () => {
    // Mock AI to fail
    mockContext.sampling.createMessage.mockRejectedValue(
      new Error('AI unavailable')
    );
    
    const result = await myTool(params, mockContext);
    expect(result.ok).toBe(true);
    // Should have used fallback
  });
  
  it('should report standard progress stages', async () => {
    const progressSpy = jest.spyOn(
      mockContext.progressReporter, 
      'report'
    );
    
    await myTool(params, mockContext);
    
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ 
        message: 'Validating', 
        percentage: 10 
      })
    );
    // ... check other stages
  });
});
```

## Common Pitfalls and Solutions

### Pitfall 1: Required SessionId Breaking Clients

**Problem**: Existing clients expect sessionId to be required and may not handle it being optional.

**Solution**: 
```typescript
// Add backward compatibility in your tool
const actualSessionId = params.sessionId || generateDefaultSessionId();

// Log deprecation warning
if (!params.sessionId) {
  logger.warn(
    '[DEPRECATED] sessionId will be required in v2.0. ' +
    'Please provide explicit sessionId.'
  );
}
```

### Pitfall 2: JSON-in-Text Response Format

**Problem**: Tool returns JSON as a string in the response, requiring client-side parsing.

**Solution**:
```typescript
// WRONG: JSON as string
return Success({
  ok: true,
  data: JSON.stringify({ foo: 'bar' })  // ❌ Don't stringify
});

// RIGHT: Structured object
return Success({
  ok: true,
  data: { foo: 'bar' }  // ✅ Return object directly
});
```

### Pitfall 3: Inconsistent Progress Reporting

**Problem**: Custom progress percentages don't match user expectations.

**Solution**: Always use the standard 4-stage pattern:
```typescript
// Let the wrapper handle progress automatically
// Only override if you have long-running operations:

export const myTool = wrapTool('my-tool', 
  async (params, context, logger, progress) => {
    await progress('VALIDATING');
    // validation logic
    
    await progress('EXECUTING');
    // main logic - can add sub-progress here if needed
    for (let i = 0; i < items.length; i++) {
      await processItem(items[i]);
      // Optional: sub-progress within EXECUTING stage
      const subProgress = 50 + (40 * i / items.length);
      await reportProgress(context.progressReporter, 
        `Processing item ${i+1}/${items.length}`, 
        subProgress
      );
    }
    
    await progress('FINALIZING');
    // cleanup logic
    
    await progress('COMPLETE');
    return result;
  }
);
```

### Pitfall 4: AI Calls Without Fallback

**Problem**: Tool fails completely when AI service is unavailable.

**Solution**: Always provide fallback logic:
```typescript
// Use withAIFallback for critical operations
const result = await withAIFallback(
  // Primary: Try AI generation
  async () => {
    return await aiGenerate(logger, context, {
      promptName: 'my-prompt',
      promptArgs: params
    });
  },
  // Fallback: Use template or heuristics
  () => {
    return generateTemplateBasedResult(params);
  },
  logger
);
```

### Pitfall 5: Session State Conflicts

**Problem**: Multiple tools updating session state can cause conflicts.

**Solution**: Use atomic session operations:
```typescript
// WRONG: Read-modify-write pattern
const session = await sessionManager.get(id);
session.myData = newValue;
await sessionManager.update(id, session);  // ❌ Race condition

// RIGHT: Atomic updates via helpers
await appendCompletedStep(id, 'my-step');  // ✅ Atomic
await setWorkflowManifests(id, { 
  myArtifact: data 
});  // ✅ Atomic
```

## Testing Strategies

### Unit Testing Helpers

Test each helper in isolation:

```typescript
describe('Session Helpers', () => {
  describe('resolveSession', () => {
    it('should create session when not provided', async () => {
      const result = await resolveSession(logger, context, {
        defaultIdHint: 'test-hint'
      });
      expect(result.ok).toBe(true);
      expect(result.value.id).toMatch(/test-hint/);
    });
    
    it('should use existing session when provided', async () => {
      const result = await resolveSession(logger, context, {
        sessionId: 'existing-123'
      });
      expect(result.value.id).toBe('existing-123');
    });
  });
});
```

### Integration Testing

Test complete tool flows:

```typescript
describe('Tool Integration', () => {
  it('should complete full workflow', async () => {
    // 1. Analyze repository
    const analysis = await analyzeRepoTool(
      { repoPath: '/test/repo' },
      context
    );
    expect(analysis.ok).toBe(true);
    
    const sessionId = analysis.value.sessionId;
    
    // 2. Generate Dockerfile using same session
    const dockerfile = await generateDockerfileTool(
      { sessionId },  // Reuse session
      context
    );
    expect(dockerfile.ok).toBe(true);
    expect(dockerfile.value.sessionId).toBe(sessionId);
    
    // 3. Verify session state
    const session = await getSessionState(sessionId);
    expect(session.completed_steps).toContain('analyze-repo');
    expect(session.completed_steps).toContain('generate-dockerfile');
  });
});
```

### Mock Strategies

Create reusable mocks for testing:

```typescript
// Mock AI service
export const mockAIService = {
  createMessage: jest.fn().mockResolvedValue({
    content: [
      { type: 'text', text: 'Generated content' }
    ]
  })
};

// Mock context with all required properties
export const createMockContext = (overrides = {}): ToolContext => ({
  sampling: mockAIService,
  getPrompt: jest.fn().mockResolvedValue({
    description: 'Test prompt',
    messages: []
  }),
  progressReporter: {
    report: jest.fn()
  },
  ...overrides
});

// Use in tests
it('should handle AI generation', async () => {
  const context = createMockContext();
  const result = await myTool(params, context);
  expect(context.sampling.createMessage).toHaveBeenCalled();
  expect(result.ok).toBe(true);
});
```

### Performance Testing

Ensure no regression in tool performance:

```typescript
describe('Performance', () => {
  it('should complete within acceptable time', async () => {
    const start = Date.now();
    const result = await myTool(params, context);
    const duration = Date.now() - start;
    
    expect(result.ok).toBe(true);
    expect(duration).toBeLessThan(2000); // 2 seconds max
  });
  
  it('should handle concurrent executions', async () => {
    const promises = Array(10).fill(null).map((_, i) => 
      myTool({ ...params, sessionId: `session-${i}` }, context)
    );
    
    const results = await Promise.all(promises);
    results.forEach(result => {
      expect(result.ok).toBe(true);
    });
  });
});
```

## Troubleshooting

### Issue: "Session not found" Errors

**Symptoms**: Tools fail with session not found even when sessionId is provided.

**Debug Steps**:
```typescript
// Add debug logging
const sess = await resolveSession(logger, context, {
  sessionId: params.sessionId,
  defaultIdHint: 'debug-hint'
});

logger.debug({
  providedId: params.sessionId,
  resolvedId: sess.value?.id,
  sessionExists: sess.ok
}, 'Session resolution debug');
```

**Common Causes**:
1. Session expired or was cleared
2. SessionId format mismatch
3. Different session managers between tools

**Solution**: Ensure all tools use shared session manager from context.

### Issue: AI Responses Not Processing Correctly

**Symptoms**: AI generates content but tool fails to process it.

**Debug Steps**:
```typescript
// Log raw AI response
const result = await aiGenerate(logger, context, {
  promptName: 'my-prompt',
  promptArgs: params,
  debug: true  // Enable debug logging
});

if (!result.ok) {
  logger.error({
    error: result.error,
    promptName: 'my-prompt',
    args: params
  }, 'AI generation failed');
}
```

**Common Causes**:
1. Incorrect expectation type (e.g., expecting 'json' but getting 'text')
2. Response exceeds token limit
3. Prompt template issues

### Issue: Progress Not Updating in UI

**Symptoms**: Tool executes but progress bar doesn't move.

**Debug Steps**:
```typescript
// Verify progress reporter is provided
if (!context.progressReporter) {
  logger.warn('No progress reporter provided by client');
}

// Test progress manually
await reportProgress(
  context.progressReporter,
  'Test progress',
  50
);
```

**Common Causes**:
1. Client doesn't provide progressReporter
2. Progress updates too fast for UI
3. Wrapper not properly configured

### Issue: Type Errors After Migration

**Symptoms**: TypeScript compilation fails after migration.

**Common Fixes**:
```typescript
// 1. Update import paths
import type { ToolContext } from '@mcp/context/types';
import type { ExtendedToolContext } from '@tools/shared-types';

// 2. Fix parameter types
interface MyToolParams {
  sessionId?: string;  // Make optional
  // other params...
}

// 3. Update return types
import type { StandardToolResponse } from '@mcp/tools/response-formatter';

export async function myTool(
  params: MyToolParams,
  context: ToolContext
): Promise<Result<StandardToolResponse<MyData>>> {
  // implementation
}
```

## Performance Considerations

### Optimization Tips

1. **Cache AI Responses**: Avoid redundant AI calls for identical inputs
```typescript
const cacheKey = computeHash(params);
const cached = await cache.get(cacheKey);
if (cached) {
  return Success(cached);
}

const result = await aiGenerate(logger, context, params);
if (result.ok) {
  await cache.set(cacheKey, result.value, { ttl: 300 });
}
```

2. **Batch Session Operations**: Reduce round trips
```typescript
// Instead of multiple calls:
await appendCompletedStep(id, 'step1');
await appendCompletedStep(id, 'step2');

// Use batch update:
await updateSession(id, {
  completed_steps: ['step1', 'step2'],
  manifests: { ... }
});
```

3. **Lazy Load Heavy Dependencies**: Import only when needed
```typescript
export const myTool = wrapTool('my-tool', 
  async (params, context, logger) => {
    // Only import heavy library when actually used
    if (params.useAdvancedFeature) {
      const { processAdvanced } = await import('./heavy-processor');
      return processAdvanced(params);
    }
    // Light path doesn't load heavy deps
    return processSimple(params);
  }
);
```

4. **Stream Large Responses**: For tools generating large outputs
```typescript
// Use streaming for large file generation
export const generateLargeFile = wrapTool('generate-large', 
  async (params, context, logger) => {
    const stream = createWriteStream(params.outputPath);
    
    // Stream content as it's generated
    for await (const chunk of generateChunks(params)) {
      stream.write(chunk);
      // Report incremental progress
      await reportProgress(
        context.progressReporter,
        `Generated ${stream.bytesWritten} bytes`,
        calculatePercentage(stream.bytesWritten, estimatedSize)
      );
    }
    
    stream.end();
    return formatStandardResponse(Success({ 
      path: params.outputPath 
    }));
  }
);
```

### Memory Management

1. **Clean Up After Large Operations**:
```typescript
export const processLargeDataset = wrapTool('process-large', 
  async (params, context, logger) => {
    let largeData = await loadData(params.path);
    
    try {
      const result = await processData(largeData);
      return formatStandardResponse(Success(result));
    } finally {
      // Explicitly release memory
      largeData = null;
      if (global.gc) global.gc();
    }
  }
);
```

2. **Use Weak References for Caches**:
```typescript
const sessionCache = new WeakMap<string, Session>();
```

## Migration Checklist

Use this checklist to ensure complete migration:

### Pre-Migration
- [ ] Review current tool implementation
- [ ] Identify all AI invocation points
- [ ] Document current return value structure
- [ ] List all session state mutations
- [ ] Note custom progress reporting logic

### Core Migration
- [ ] Import all required helpers
- [ ] Make sessionId parameter optional
- [ ] Wrap tool with `wrapTool` helper
- [ ] Replace session handling with `resolveSession`
- [ ] Convert AI calls to use `aiGenerate`
- [ ] Remove custom progress reporting (let wrapper handle it)
- [ ] Use `formatStandardResponse` for returns
- [ ] Update session with typed helpers

### Testing
- [ ] Unit tests for helper integration
- [ ] Integration tests with full workflow
- [ ] Backward compatibility tests
- [ ] Performance benchmarks
- [ ] Error scenario coverage

### Documentation
- [ ] Update tool JSDoc comments
- [ ] Add migration notes to changelog
- [ ] Update API documentation
- [ ] Create usage examples
- [ ] Document any breaking changes

### Validation
- [ ] TypeScript compilation passes
- [ ] Linting passes (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] Manual testing with real scenarios
- [ ] Client compatibility verified

### Post-Migration
- [ ] Remove deprecated code paths
- [ ] Update dependent tools
- [ ] Monitor error rates
- [ ] Gather performance metrics
- [ ] Document lessons learned

## Conclusion

The Golden Path standardization brings consistency, maintainability, and reliability to our tool ecosystem. By following this guide, you can successfully migrate any tool to the new pattern while maintaining backward compatibility and improving the overall quality of the codebase.

Remember:
- **Start Small**: Migrate one tool at a time
- **Test Thoroughly**: Each migration should include comprehensive tests
- **Document Changes**: Keep changelog and migration notes updated
- **Monitor Impact**: Watch for performance and error rate changes
- **Iterate**: The pattern will evolve based on learnings

For questions or issues, refer to the [Part A Implementation Plan](../plans/part-a-implementation-plan.md) or reach out to the platform team.