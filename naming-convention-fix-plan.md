# Naming Convention Fix Plan

## Summary of Findings

### 1. Transitory Qualifiers Found
- **"enhanced"/"enhancement"**: Used extensively in AI/tool enhancement contexts (56 files)
- **"simplified"**: Found in tool-enhancement.ts header comment
- **"unified"**: Not found as problematic naming
- **"consolidated"**: Not found as problematic naming

### 2. Version Indicators Found
- **"legacy"**: Found in 5 locations, used for backward compatibility markers
- **"v2"**: Only found in legitimate API endpoints (Docker Hub API)
- **"new-/old-"**: Not found as problematic naming

### 3. Temporary Markers Found
- **"test-"**: Found only in legitimate context (test-runner tool detection)
- **"temp-/tmp-"**: Not found in production code

### 4. Team/Phase References
- **None found**

## Rename Plan with Before/After Mappings

### Priority 1: Remove "enhanced"/"enhancement" qualifiers

| File | Current Name | Proposed Name | Rationale |
|------|-------------|---------------|-----------|
| src/lib/tool-enhancement.ts | tool-enhancement.ts | tool-capabilities.ts | Already exists in mcp/tools/, merge functionality |
| src/lib/tool-enhancement.ts | `enhanceTool()` | `applyCapabilities()` | More descriptive of actual function |
| src/mcp/tools/enhancement.ts | enhancement.ts | tool-composition.ts | Describes the functional composition pattern |
| src/lib/ai/ai-service.ts | `enhanceTool()` | `augmentToolResult()` | More specific about what it does |
| src/lib/ai/ai-service.ts | `enhanceStrategy()` | `optimizeStrategy()` | Clearer intent |
| Types | `enhanced: boolean` | `aiAugmented: boolean` | More specific about the augmentation source |
| Types | `enhancementType` | `augmentationType` | Consistent with above |
| Config | `aiEnhancementService` | `aiAugmentationService` | Consistent naming |
| Config | `securityLevel: 'enhanced'` | `securityLevel: 'standard'` | Better middle-ground term |

### Priority 2: Remove "simplified" qualifier

| File | Current Usage | Proposed Change | Rationale |
|------|--------------|-----------------|-----------|
| src/lib/tool-enhancement.ts | "Simplified Tool Enhancement" comment | "Tool Capability Manager" | Descriptive without qualifier |

### Priority 3: Remove "legacy" markers

| File | Current Usage | Proposed Change | Rationale |
|------|--------------|-----------------|-----------|
| Comments | "Legacy - for backward compatibility" | "Deprecated - use X instead" | Clearer deprecation notice |
| src/mcp/tools/registry.ts | `legacyTools` variable | `baseTools` | Neutral naming |
| Functions | Comments with "Legacy" | Add `@deprecated` JSDoc tag | Standard deprecation marking |

## Migration Steps

### Phase 1: Update Core Types and Interfaces
1. Create new type definitions with improved names
2. Add type aliases for backward compatibility
3. Update internal implementations to use new types

### Phase 2: Refactor Enhancement/Augmentation System
1. Rename enhancement.ts → tool-composition.ts
2. Update all imports from enhancement to tool-composition
3. Rename enhancement functions to use "augment" terminology
4. Update AI service methods to use "augment" instead of "enhance"

### Phase 3: Update Configuration
1. Add new configuration properties alongside old ones
2. Add deprecation warnings for old property names
3. Update all internal usage to new properties

### Phase 4: Clean up Comments and Documentation
1. Replace "enhanced" with domain-specific terms
2. Replace "simplified" with descriptive terms
3. Replace "legacy" with proper deprecation notices

### Phase 5: Remove Deprecated Code
1. After migration period, remove type aliases
2. Remove old configuration properties
3. Remove backward compatibility shims

## Git Migration Strategy

```bash
# Use git mv to preserve history
git mv src/lib/tool-enhancement.ts src/lib/tool-capabilities.ts
git mv src/mcp/tools/enhancement.ts src/mcp/tools/tool-composition.ts

# Commit with clear message
git commit -m "refactor: improve naming conventions

- Replace 'enhancement' with 'augmentation' for AI features
- Replace 'enhanced' security level with 'standard'
- Remove 'simplified' qualifiers from comments
- Mark deprecated code with proper annotations

BREAKING CHANGE: Configuration properties renamed:
- aiEnhancementService → aiAugmentationService
- enhanced → aiAugmented"
```

## Updated Import Statements

### Before
```typescript
import { enhanceTool } from '../lib/tool-enhancement';
import { withEnhancement } from '../mcp/tools/enhancement';
import { AIEnhancementService } from '../lib/ai/ai-service';
```

### After
```typescript
import { applyCapabilities } from '../lib/tool-capabilities';
import { withAugmentation } from '../mcp/tools/tool-composition';
import { AIAugmentationService } from '../lib/ai/ai-service';
```

## Validation Checklist

- [ ] All imports updated and working
- [ ] TypeScript compilation passes
- [ ] Tests updated with new names
- [ ] Linting passes
- [ ] No broken references in comments
- [ ] Documentation updated
- [ ] Deprecation notices added where needed
- [ ] Git history preserved with proper renames

## Notes

1. The term "enhanced" is heavily used throughout the codebase (56 files), making this a significant refactoring effort
2. Most usage is legitimate (AI augmentation features), but the naming could be more specific
3. Consider keeping some uses where "enhanced" accurately describes an improved version (e.g., security levels)
4. The refactoring should be done incrementally to minimize disruption