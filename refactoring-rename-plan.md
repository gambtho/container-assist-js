# File and Method Rename Plan

## Overview
This document outlines the renaming strategy to eliminate transitory and inappropriate names from the codebase, replacing them with domain-specific, descriptive names that follow the project's containerization and MCP architecture patterns.

## Files to Rename

### MCP Module Files

| Current Path | New Path | Rationale |
|-------------|----------|-----------|
| `src/mcp/enhanced-server.ts` | `src/mcp/server-extensions.ts` | Describes actual functionality: server capability extensions |
| `src/mcp/enhanced-registry.ts` | `src/mcp/tool-registry-extensions.ts` | Clearly indicates tool registry extensions |
| `src/mcp/resources/enhanced-manager.ts` | `src/mcp/resources/ai-resource-manager.ts` | Emphasizes AI-powered resource management |
| `src/mcp/resources/enhanced-resource-manager.ts` | `src/mcp/resources/containerization-resource-manager.ts` | Domain-specific resource manager |
| `src/lib/enhanced-ai.ts` | `src/lib/ai-client.ts` | Clear, concise AI client naming |

### Application Tools Directory

| Current Path | New Path | Rationale |
|-------------|----------|-----------|
| `src/application/tools/enhanced/` | `src/application/tools/intelligent/` | Better describes AI-powered tools |
| `src/application/tools/enhanced/factory.ts` | `src/application/tools/intelligent/tool-factory.ts` | Clear factory pattern |
| `src/application/tools/enhanced/tool-enhancers.ts` | `src/application/tools/intelligent/tool-capabilities.ts` | Describes what it adds |
| `src/application/tools/enhanced/intelligent-factory.ts` | `src/application/tools/intelligent/ai-tool-factory.ts` | Explicit AI tool factory |
| `src/application/tools/enhanced/intelligent-tool-wrapper.ts` | `src/application/tools/intelligent/tool-wrapper.ts` | Simpler, clearer name |
| `src/application/tools/enhanced/prompt-templates.ts` | `src/application/tools/intelligent/ai-prompts.ts` | Concise AI prompt management |

### Workflow Files

| Current Path | New Path | Rationale |
|-------------|----------|-----------|
| `src/workflows/orchestrated-workflow.ts` | `src/workflows/containerization-workflow.ts` | Domain-specific workflow |
| `src/workflows/orchestration/coordinator.ts` | `src/workflows/orchestration/workflow-coordinator.ts` | More explicit naming |

### Test Files

| Current Path | New Path | Rationale |
|-------------|----------|-----------|
| `test/enhanced-integration.test.ts` | `test/mcp-integration.test.ts` | Focus on MCP integration testing |
| `test/integration/simplified-orchestrator.test.ts` | `test/integration/workflow-coordinator.test.ts` | Match production naming |

## Classes, Interfaces, and Functions to Rename

### Core Types and Interfaces

| Current Name | New Name | File Location |
|--------------|----------|---------------|
| `EnhancedResource` | `AIResource` | `src/mcp/resources/ai-resource-manager.ts` |
| `EnhancedResourceManager` | `AIResourceManager` | `src/mcp/resources/ai-resource-manager.ts` |
| `createEnhancedResourceManager` | `createAIResourceManager` | `src/mcp/resources/ai-resource-manager.ts` |
| `EnhancedUriSchemes` | `ResourceUriSchemes` | `src/mcp/resources/ai-resource-manager.ts` |

### Tool-Related Types

| Current Name | New Name | File Location |
|--------------|----------|---------------|
| `EnhancedTool` | `IntelligentTool` | `src/application/tools/intelligent/tool-capabilities.ts` |
| `EnhancedToolsConfig` | `IntelligentToolsConfig` | `src/application/tools/intelligent/tool-factory.ts` |
| `EnhancedTools` | `IntelligentTools` | `src/application/tools/intelligent/tool-factory.ts` |
| `createEnhancedTools` | `createIntelligentTools` | `src/application/tools/intelligent/tool-factory.ts` |
| `getOrCreateEnhancedTools` | `getOrCreateIntelligentTools` | `src/application/tools/intelligent/tool-factory.ts` |
| `getEnhancedToolsInstance` | `getIntelligentToolsInstance` | `src/application/tools/intelligent/tool-factory.ts` |
| `resetEnhancedToolsInstance` | `resetIntelligentToolsInstance` | `src/application/tools/intelligent/tool-factory.ts` |
| `createEnhancedTool` | `createIntelligentTool` | `src/application/tools/intelligent/tool-capabilities.ts` |
| `createAIEnhancedTools` | `createAIPoweredTools` | `src/application/tools/intelligent/ai-tool-factory.ts` |
| `createEnhancedToolRegistry` | `createIntelligentToolRegistry` | `src/application/tools/intelligent/ai-tool-factory.ts` |
| `isEnhancedTool` | `isIntelligentTool` | `src/application/tools/intelligent/tool-wrapper.ts` |

### Workflow Types

| Current Name | New Name | File Location |
|--------------|----------|---------------|
| `EnhancedWorkflowConfig` | `ContainerizationWorkflowConfig` | `src/workflows/containerization-workflow.ts` |
| `EnhancedWorkflowResult` | `ContainerizationWorkflowResult` | `src/workflows/containerization-workflow.ts` |
| `runEnhancedWorkflow` | `runContainerizationWorkflow` | `src/workflows/containerization-workflow.ts` |
| `runEnhancedBuildWorkflow` | `runContainerBuildWorkflow` | `src/workflows/containerization-workflow.ts` |
| `createEnhancedWorkflowConfig` | `createContainerizationWorkflowConfig` | `src/application/tools/intelligent/tool-factory.ts` |
| `createSimpleWorkflowCoordinator` | `createWorkflowCoordinator` | `src/workflows/orchestration/workflow-coordinator.ts` |

### Server Functions

| Current Name | New Name | File Location |
|--------------|----------|---------------|
| `enhanceServer` | `extendServerCapabilities` | `src/mcp/server-extensions.ts` |
| `enhanceToolRegistry` | `extendToolRegistry` | `src/mcp/tool-registry-extensions.ts` |
| `createEnhancedRegistry` | `createExtendedRegistry` | `src/mcp/tool-registry-extensions.ts` |

### Prompt Templates

| Current Name | New Name | File Location |
|--------------|----------|---------------|
| `EnhancedPromptTemplate` | `AIPromptTemplate` | `src/application/tools/intelligent/ai-prompts.ts` |

## Migration Steps

### Phase 1: Preparation
1. Create a feature branch: `refactor/eliminate-transitory-names`
2. Run full test suite to establish baseline
3. Document all current imports and exports

### Phase 2: File Renames (Using git mv)
```bash
# MCP module renames
git mv src/mcp/enhanced-server.ts src/mcp/server-extensions.ts
git mv src/mcp/enhanced-registry.ts src/mcp/tool-registry-extensions.ts
git mv src/mcp/resources/enhanced-manager.ts src/mcp/resources/ai-resource-manager.ts
git mv src/mcp/resources/enhanced-resource-manager.ts src/mcp/resources/containerization-resource-manager.ts
git mv src/lib/enhanced-ai.ts src/lib/ai-client.ts

# Application tools directory rename
git mv src/application/tools/enhanced src/application/tools/intelligent
git mv src/application/tools/intelligent/factory.ts src/application/tools/intelligent/tool-factory.ts
git mv src/application/tools/intelligent/tool-enhancers.ts src/application/tools/intelligent/tool-capabilities.ts
git mv src/application/tools/intelligent/intelligent-factory.ts src/application/tools/intelligent/ai-tool-factory.ts
git mv src/application/tools/intelligent/intelligent-tool-wrapper.ts src/application/tools/intelligent/tool-wrapper.ts
git mv src/application/tools/intelligent/prompt-templates.ts src/application/tools/intelligent/ai-prompts.ts

# Workflow renames
git mv src/workflows/orchestrated-workflow.ts src/workflows/containerization-workflow.ts
git mv src/workflows/orchestration/coordinator.ts src/workflows/orchestration/workflow-coordinator.ts

# Test file renames
git mv test/enhanced-integration.test.ts test/mcp-integration.test.ts
git mv test/integration/simplified-orchestrator.test.ts test/integration/workflow-coordinator.test.ts
```

### Phase 3: Update Imports
1. Update all import statements in renamed files
2. Search and replace imports across the codebase:
   - `from './enhanced-server'` → `from './server-extensions'`
   - `from './enhanced-registry'` → `from './tool-registry-extensions'`
   - `from './resources/enhanced-manager'` → `from './resources/ai-resource-manager'`
   - `from './resources/enhanced-resource-manager'` → `from './resources/containerization-resource-manager'`
   - `from '../lib/enhanced-ai'` → `from '../lib/ai-client'`
   - `from './tools/enhanced/'` → `from './tools/intelligent/'`
   - `from './orchestrated-workflow'` → `from './containerization-workflow'`

### Phase 4: Update Exports
1. Update `src/mcp/index.ts` exports
2. Update `src/application/tools/intelligent/index.ts` exports
3. Update `src/workflows/index.ts` exports

### Phase 5: Update Type/Interface/Function Names
1. Use find-and-replace for each renamed type, interface, and function
2. Ensure consistency across the codebase
3. Update JSDoc comments and documentation

### Phase 6: Validation
1. Run TypeScript compilation: `npm run typecheck`
2. Run linting: `npm run lint`
3. Run full test suite: `npm test`
4. Run integration tests: `npm run test:integration`
5. Validate MCP server functionality

### Phase 7: Documentation Updates
1. Update README.md with new file structure
2. Update API documentation
3. Update developer guides
4. Update ARCHITECTURE.md if present

## Import Update Examples

### Before:
```typescript
import { EnhancedResourceManager } from './resources/enhanced-manager.js';
import { enhanceServer } from './enhanced-server.js';
import { EnhancedTool } from '../tools/enhanced/tool-enhancers.js';
import { runEnhancedWorkflow } from '../workflows/orchestrated-workflow.js';
```

### After:
```typescript
import { AIResourceManager } from './resources/ai-resource-manager.js';
import { extendServerCapabilities } from './server-extensions.js';
import { IntelligentTool } from '../tools/intelligent/tool-capabilities.js';
import { runContainerizationWorkflow } from '../workflows/containerization-workflow.js';
```

## Risk Assessment

### Low Risk
- File renames using `git mv` preserve history
- TypeScript compiler will catch import errors
- Test suite will validate functionality

### Medium Risk
- External dependencies or configurations referencing old names
- Docker or deployment scripts with hardcoded paths
- CI/CD pipelines with specific file references

### Mitigation
- Search for string references in non-TypeScript files
- Review Docker, CI/CD, and deployment configurations
- Create comprehensive test plan before migration
- Consider phased rollout with backwards compatibility exports

## Backwards Compatibility (Optional)

If needed for gradual migration, create temporary re-exports:

```typescript
// src/mcp/enhanced-server.ts (temporary)
export * from './server-extensions.js';
console.warn('Deprecated: Import from server-extensions.ts instead of enhanced-server.ts');
```

## Success Criteria

1. ✅ All files renamed following domain-specific conventions
2. ✅ All imports and exports updated
3. ✅ TypeScript compilation passes
4. ✅ All tests pass
5. ✅ No runtime errors in development or production
6. ✅ Documentation updated
7. ✅ Git history preserved through proper renames

## Timeline

- **Phase 1-2**: 30 minutes (file renames)
- **Phase 3-5**: 2-3 hours (code updates)
- **Phase 6**: 30 minutes (validation)
- **Phase 7**: 1 hour (documentation)

**Total Estimated Time**: 4-5 hours