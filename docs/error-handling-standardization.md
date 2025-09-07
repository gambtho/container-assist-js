# Error Handling Standardization Plan

## Executive Summary

This document outlines the standardization of error handling across the containerization-assist-js codebase, moving from an inconsistent mix of Result<T> types and exceptions to a unified, TypeScript-idiomatic approach using structured error classes.

## Current State Analysis

### Problems with Current Approach

1. **Inconsistent Patterns**
   - Tools/workflows: Use Result<T> pattern
   - Libraries: Mixed (some throw, some return Result)
   - MCP layer: Converts between Result<T> and exceptions

2. **Limited Error Information**
   - Result<T> only captures error as string
   - Loss of stack traces and error chains
   - No structured error metadata

3. **Development Friction**
   - Boilerplate for Result wrapping/unwrapping
   - Incompatible with TypeScript ecosystem expectations
   - Difficult debugging due to lost error context

## Recommended Approach

### Core Principles

1. **Use native TypeScript error handling** (exceptions) for internal code
2. **Structured error classes** with rich metadata
3. **Result<T> only at MCP protocol boundaries** (where required by SDK)
4. **Error boundaries** at service/workflow level

### Error Class Hierarchy

```typescript
// Base error class with structured metadata
export class ContainerizationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ContainerizationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Domain-specific error classes
export class ValidationError extends ContainerizationError { }
export class DockerError extends ContainerizationError { }
export class KubernetesError extends ContainerizationError { }
export class SessionError extends ContainerizationError { }
export class AIServiceError extends ContainerizationError { }
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. Create `src/lib/errors.ts` with error class hierarchy
2. Add error code constants and types
3. Create error conversion utilities for MCP boundaries

### Phase 2: Library Layer
1. Update `src/lib/docker.ts` - remove Result<T>, use DockerError
2. Update `src/lib/kubernetes.ts` - remove Result<T>, use KubernetesError
3. Update `src/lib/session.ts` - standardize error throwing
4. Update other libraries to use structured errors

### Phase 3: Tools Layer
1. Update tool implementations to use exceptions internally
2. Add Result<T> conversion only at MCP handler level
3. Preserve error context in conversions

### Phase 4: MCP Boundary
1. Keep Result<T> in tool interface signatures (for SDK compatibility)
2. Add conversion layer in MCP server handlers
3. Ensure error details are preserved in conversions

## Migration Examples

### Before (Current Pattern)
```typescript
export async function buildImage(config: BuildImageConfig): Promise<Result<BuildImageResult>> {
  try {
    // ... implementation
    return Success(result);
  } catch (error) {
    return Failure(error instanceof Error ? error.message : String(error));
  }
}
```

### After (Recommended Pattern)
```typescript
// Internal implementation - uses exceptions
export async function buildImage(config: BuildImageConfig): Promise<BuildImageResult> {
  if (!config.sessionId) {
    throw new ValidationError('Session ID is required', 'MISSING_SESSION_ID');
  }
  
  try {
    const result = await docker.buildImage(config);
    return result;
  } catch (error) {
    throw new DockerError(
      `Failed to build image: ${error.message}`,
      'BUILD_FAILED',
      { config, dockerfile: config.dockerfile },
      error as Error
    );
  }
}

// MCP boundary - converts to Result<T>
export const buildImageTool = {
  name: 'build-image',
  async execute(params: unknown, logger: Logger): Promise<Result<BuildImageResult>> {
    try {
      const config = validateBuildImageConfig(params);
      const result = await buildImage(config);
      return Success(result);
    } catch (error) {
      if (error instanceof ContainerizationError) {
        return Failure(`${error.code}: ${error.message}`);
      }
      return Failure(error instanceof Error ? error.message : String(error));
    }
  }
};
```

## Benefits

1. **Better Debugging**
   - Full stack traces preserved
   - Error chains maintained
   - Rich error context available

2. **TypeScript Idiomatic**
   - Works naturally with async/await
   - Compatible with all Node.js/TypeScript libraries
   - Better IDE support and type inference

3. **Reduced Boilerplate**
   - No manual Result wrapping/unwrapping
   - Cleaner async function signatures
   - Less code to maintain

4. **Improved Error Handling**
   - Structured error types enable better error recovery
   - Error codes support internationalization
   - Metadata helps with debugging and monitoring

## Success Criteria

1. All internal functions use exceptions (not Result<T>)
2. Error classes provide structured, actionable information
3. Result<T> only appears at MCP protocol boundaries
4. No loss of error information in conversions
5. All tests pass with new error handling

## Timeline

- Phase 1: Core Infrastructure - 1 hour
- Phase 2: Library Layer - 2 hours  
- Phase 3: Tools Layer - 2 hours
- Phase 4: MCP Boundary - 1 hour
- Testing & Validation - 1 hour

Total estimated effort: 7 hours