# Context Consolidation - Baseline Metrics

**Date:** 2025-09-09  
**Branch:** refactor/context-consolidation  
**Objective:** Document current state before consolidation

## Quantitative Metrics

| Metric | Current Value | Target | Method |
|--------|---------------|--------|---------|
| Files with Context interfaces | 11 | 3-4 | `find src/ -name "*.ts" -exec grep -l "interface.*Context" {} \; \| wc -l` |
| Total Context interface definitions | 13 | 1-2 | `grep -r "interface.*Context" src/ --include="*.ts" \| wc -l` |
| Total Context type definitions | 32 | 5-8 | `grep -r "type.*Context" src/ --include="*.ts" \| wc -l` |
| Bridge file LOC | 310 | 30-50 | `wc -l src/mcp/context/bridge.ts` |
| Context-related test failures | 56 failed | 0 | Tests currently failing unrelated to context |

## Context Interface Inventory

### Primary ToolContext Interfaces (CONFLICTING)

1. **`src/mcp/context/types.ts:103`** - MCP-focused ToolContext
   ```typescript
   interface ToolContext {
     sampling: { createMessage(request: SamplingRequest): Promise<SamplingResponse> };
     getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptWithMessages>;
     signal?: AbortSignal;
     progress?: ProgressReporter;
   }
   ```

2. **`src/tools/types.ts:11`** - Tool-focused ToolContext  
   ```typescript
   interface ToolContext {
     abortSignal?: AbortSignal;
     progressToken?: ProgressToken;
     sessionManager?: SessionManager;
     promptRegistry?: PromptRegistry;
     resourceManager?: ResourceContext;
     server?: McpServer;
     logger?: Logger;
   }
   ```

### Secondary Context Types

3. **ResourceContext** (`src/resources/manager.ts:26`)
4. **MCPContext** (`src/domain/types.ts:51`)
5. **EnhancedMCPContext** (`src/domain/types.ts:73`)
6. **ValidationContext** (`src/mcp/tools/validator.ts:14`)
7. **TemplateContext** (`src/prompts/prompt-registry.ts:21`)
8. **WorkflowContext** (`src/workflows/types.ts:26`)
9. **DockerfileContext** (`src/workflows/sampling/types.ts:11`)
10. **AnalysisContext** (`src/workflows/sampling/analysis-types.ts:11`)

### Adapter Types

11. **ExtendedToolContext** (`src/tools/shared-types.ts:15`)
    ```typescript
    type ExtendedToolContext = ToolContext | { sessionManager?: SessionManager; [key: string]: unknown } | undefined;
    ```

12. **ToolContextFactory** (`src/mcp/context/types.ts:130`)
13. **ToolContextConfig** (`src/mcp/context/types.ts:141`)

## Current Usage Patterns

### Files Using ExtendedToolContext (Main Consumer Pattern)
- `src/tools/fix-dockerfile/tool.ts`
- `src/tools/prepare-cluster/tool.ts`
- `src/tools/verify-deployment/tool.ts`
- `src/tools/push-image/tool.ts`
- `src/tools/generate-k8s-manifests/tool.ts`
- `src/tools/generate-dockerfile/tool.ts`
- `src/tools/deploy/tool.ts`
- `src/tools/workflow/tool.ts`
- `src/tools/resolve-base-images/tool.ts`
- `src/tools/analyze-repo/tool.ts`
- `src/tools/tag-image/tool.ts`
- `src/tools/build-image/tool.ts`
- `src/tools/scan/tool.ts`

### Bridge Complexity Analysis
- **File:** `src/mcp/context/bridge.ts` (310 lines)
- **Complex mappings:** Message format conversions, SDK adaptations
- **Error handling:** Elaborate try/catch with detailed logging
- **Type assertions:** Multiple complex type casts
- **Defaults:** Configuration merging and validation

## Problem Areas Identified

### 1. Competing ToolContext Definitions
- **MCP Context** (sampling-focused) vs **Tool Context** (service-focused)
- Tools import both and use `ExtendedToolContext` union type
- Confusion about which interface to implement

### 2. Bridge Over-Engineering
- 310 lines for what should be simple property mapping
- Complex message format conversions
- Elaborate error handling and logging
- Over-abstracted configuration system

### 3. Type Confusion
- `ExtendedToolContext` is a union type allowing undefined
- Tools must handle multiple possible context shapes
- Import confusion across codebase

### 4. Service Fragmentation
- Services scattered across multiple context interfaces
- No clear ownership or dependency injection pattern
- Session management mixed with other concerns

## Target State Design

### Unified Interface Goal
```typescript
interface ToolContext {
  // Core required
  logger: Logger;
  
  // AI/Sampling (optional)
  sampling?: SamplingService;
  prompts?: PromptRegistry;
  
  // Session/State (optional)  
  sessionManager?: SessionManager;
  
  // Infrastructure (optional)
  docker?: DockerAdapter;
  kubernetes?: KubernetesAdapter;
  
  // Control (optional)
  abortSignal?: AbortSignal;
  progressReporter?: ProgressReporter;
  
  // Configuration (optional)
  config?: ToolConfig;
}
```

### Bridge Simplification Goal
```typescript
// From 310 lines to ~30-50 lines
export function createToolContext(services: ServiceContainer, signal?: AbortSignal): ToolContext {
  return {
    logger: services.logger,
    sampling: services.sampling,
    prompts: services.prompts,
    sessionManager: services.sessionManager,
    abortSignal: signal,
    // ... direct assignments
  };
}
```

## Success Criteria

### Quantitative Targets
- **Context interfaces:** 13 → 1 primary interface
- **Context types:** 32 → <10 (mostly compatibility)
- **Bridge LOC:** 310 → 30-50 (75% reduction)
- **Files with Context interfaces:** 11 → 3-4

### Qualitative Goals
- Single source of truth for ToolContext
- Clear service dependency injection
- Simplified bridge with direct property mapping
- Maintained backward compatibility during transition
- Zero test regressions

## Implementation Phases

### Phase 1: Create Unified Interface (Day 1)
- Design single ToolContext interface
- Create compatibility adapters
- Update type exports

### Phase 2: Simplify Bridge (Day 1-2)  
- Replace complex mapping with direct assignment
- Reduce LOC by 75%
- Maintain MCP protocol compliance

### Phase 3: Migrate Tools (Day 2)
- Update 5+ priority tools to use new context
- Remove ExtendedToolContext usage
- Test each tool individually

### Phase 4: Cleanup (Future)
- Remove deprecated interfaces
- Clean up imports
- Documentation updates

## Risk Assessment

### High Risk
- **Breaking changes:** ExtendedToolContext removal could break tools
- **Bridge changes:** MCP protocol compliance must be maintained
- **Test failures:** Current 56 test failures may mask new issues

### Mitigation
- Maintain compatibility layer during transition
- Feature flags for bridge implementation
- Tool-by-tool migration with validation
- Comprehensive testing at each step

## Next Steps

1. ✅ Document baseline metrics
2. 🔄 Complete context audit and mapping  
3. ⏳ Design unified ToolContext interface
4. ⏳ Create compatibility layer
5. ⏳ Implement simplified bridge
6. ⏳ Migrate priority tools