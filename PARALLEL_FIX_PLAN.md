# Parallel TypeScript Error Fix Plan

## Current State
- **Total Errors**: 526
- **Affected Files**: ~80 files across the codebase
- **Critical Issue**: Resource file syntax fixes exposed deeper type mismatches

## ⚠️ CRITICAL RULES FOR ALL TEAMS

1. **NO AUTOMATED SCRIPTS OR SED TRANSFORMATIONS**
   - All fixes must be done manually with careful review
   - Automated transformations are what caused our current problems
   
2. **TEST AFTER EVERY CHANGE**
   - Run `npm run typecheck` after each file fix
   - Ensure error count doesn't increase
   
3. **UNDERSTAND BEFORE FIXING**
   - Read the surrounding code context
   - Understand why the error exists
   - Fix the root cause, not just the symptom

## Error Categories and Distribution

### Category A: Unused Imports/Variables (57 errors - TS6133)
**Team: Cleanup Squad**
- Simple to fix: Remove unused imports and variables
- Low risk of breaking functionality
- Files: Spread across all layers

### Category B: Missing Properties (45 errors - TS2339) 
**Team: Interface Team**
- Properties don't exist on types
- Requires adding missing properties or fixing type definitions
- Critical areas: Session service, resource providers

### Category C: Type Mismatches (40 errors - TS2345)
**Team: Type Alignment Team**  
- Arguments not matching parameter types
- Return types not matching expectations
- Focus areas: AI services, infrastructure layer

### Category D: Strict Type Issues (35 errors - TS2375, TS2379)
**Team: Strict Types Team**
- exactOptionalPropertyTypes conflicts
- Optional vs undefined type issues
- Areas: Config resources, service initialization

### Category E: Null/Undefined Checks (32 errors - TS18047, TS18048)
**Team: Safety Team**
- Possibly null/undefined values
- Need null checks or type assertions
- Areas: Resource providers, workflow handlers

### Category F: Missing Overrides (18 errors - TS4114)
**Team: Inheritance Team**
- Missing 'override' modifiers on inherited methods
- Areas: Tool handlers (analyze-repository-v2, etc.)

### Category G: Import Resolution (18 errors - TS2307)
**Team: Module Team**
- Cannot find modules
- Import path issues
- Areas: Cross-layer imports

## Detailed Team Assignments

### Team 1: Cleanup Squad (1-2 developers)
**Priority**: HIGH (Quick wins)
**Time Estimate**: 2-3 hours

**Files to Fix**:
```
src/application/tools/analysis/analyze-repository-v2.ts (TS6133)
src/application/tools/build/*.ts (TS6133 errors)
src/infrastructure/enhanced-ai-service.ts (TS6133)
src/contracts/types/interfaces.ts (TS6133)
```

**Fix Strategy**:
1. Remove unused imports
2. Remove unused variables
3. Comment out (don't delete) if unsure about future use

---

### Team 2: Interface Team (2-3 developers)
**Priority**: CRITICAL
**Time Estimate**: 4-6 hours

**Files to Fix**:
```
src/application/resources/session-resource.ts
- Line 30: Property 'query' does not exist on SessionService
- Line 90: Properties 'success', 'data' missing

src/application/resources/tools-resource.ts  
- Line 44: Property 'tools' missing on Promise return
- Lines 192, 379: Similar issues

src/services/session.ts
- Missing updateAtomic and query implementations
```

**Fix Strategy**:
1. Check if methods were renamed or moved
2. Add missing method signatures to interfaces
3. Implement stub methods if needed
4. Ensure SessionService from /services/session matches /application/session/manager

---

### Team 3: Type Alignment Team (2-3 developers)
**Priority**: HIGH
**Time Estimate**: 6-8 hours

**Focus Areas**:
```
apps/server.ts
- Line 90: DockerServiceConfig type mismatch
- Line 99: KubernetesConfig type mismatch  
- Line 109: Logger/MCPSampler type confusion

src/infrastructure/ai/*.ts
- Multiple type mismatches in AI services
- Recovery strategy type issues
```

**Fix Strategy**:
1. Review type definitions vs actual usage
2. Add type guards where needed
3. Fix function signatures to match expected types
4. Consider creating adapter functions for type conversions

---

### Team 4: Strict Types Team (2 developers)
**Priority**: MEDIUM
**Time Estimate**: 4-5 hours

**Files to Fix**:
```
src/application/resources/config-resource.ts
- Lines 295, 332, 363, 385: exactOptionalPropertyTypes issues
- Fix: Change `string[] | undefined` to `string[] | undefined`
- Or omit properties when undefined

src/application/tools/build/generate-dockerfile-v2.ts
src/application/workflow/orchestrator.ts
```

**Fix Strategy**:
1. Either add `| undefined` to optional property types
2. Or filter out undefined values before assignment
3. Use type assertions where safe
4. Consider disabling exactOptionalPropertyTypes if too problematic

---

### Team 5: Safety Team (2 developers)  
**Priority**: MEDIUM
**Time Estimate**: 3-4 hours

**Files to Fix**:
```
src/application/resources/workflow-resource.ts
- Multiple possibly undefined checks needed
- Lines 36, 49, 55-63, 101, 154, 166

src/application/resources/session-resource.ts
- Lines 90, 103: Null checks needed
```

**Fix Strategy**:
1. Add explicit null/undefined checks
2. Use optional chaining (?.)
3. Provide default values
4. Add type guards where appropriate

---

### Team 6: Inheritance Team (1-2 developers)
**Priority**: LOW
**Time Estimate**: 2 hours

**Files to Fix**:
```
src/application/tools/analysis/analyze-repository-v2.ts
src/application/tools/build/*-v2.ts files
```

**Fix Strategy**:
1. Add 'override' keyword to overridden methods
2. Verify method signatures match parent class
3. Check that inheritance is intentional

---

### Team 7: Module Team (1-2 developers)
**Priority**: HIGH  
**Time Estimate**: 3-4 hours

**Problem Areas**:
```
- Import path resolution issues
- Circular dependencies
- Missing type exports
```

**Fix Strategy**:
1. Check all import paths are relative and correct
2. Ensure all types are properly exported
3. Break circular dependencies by moving shared types
4. Update barrel exports (index.ts files)

## Coordination Strategy

### Phase 1: Quick Wins (Hour 1-2)
- Team 1 completes cleanup (TS6133)
- Team 6 adds override modifiers
- Expected reduction: ~75 errors

### Phase 2: Critical Fixes (Hour 2-6)
- Team 2 fixes interface issues
- Team 3 aligns types
- Team 7 resolves imports
- Expected reduction: ~200 errors

### Phase 3: Type Safety (Hour 6-10)
- Team 4 handles strict type issues
- Team 5 adds null safety
- Expected reduction: ~150 errors

### Phase 4: Final Pass (Hour 10-12)
- All teams review remaining errors
- Cross-team code review
- Integration testing

## Testing Protocol

After each team completes a file:
1. Run `npm run typecheck` - verify error count decreased
2. Run `npm run lint` - ensure no new lint errors
3. Run `npm test` for affected modules
4. Commit with message: `fix(team-X): resolve TS#### errors in [file]`

## Success Metrics

- **Hour 4**: Error count < 400
- **Hour 8**: Error count < 200  
- **Hour 12**: Error count = 0
- **Final**: All tests passing

## Common Pitfalls to Avoid

1. **Don't suppress errors with @ts-ignore**
   - Fix the actual problem

2. **Don't use 'any' type**
   - Find the correct type definition

3. **Don't delete code that looks unused**
   - Comment it out with explanation

4. **Don't change business logic**
   - Only fix type issues

5. **Don't use automated refactoring tools**
   - Manual fixes only

## Communication Channels

- **Slack Channel**: #typescript-fixes
- **Blocker Thread**: Pin any blocking issues
- **Progress Updates**: Every 2 hours
- **Merge Coordination**: Through team leads

## Final Checklist Before Declaring Complete

- [ ] `npm run typecheck` shows 0 errors
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] No @ts-ignore comments added
- [ ] No 'any' types introduced
- [ ] All changes reviewed by another team member
- [ ] Documentation updated if interfaces changed

## Recovery Plan if Things Go Wrong

If error count increases or breaks:
1. `git stash` current changes
2. `git checkout main`
3. Start with smaller, isolated fixes
4. One file at a time
5. Commit working fixes frequently

Remember: **Patient, careful, manual fixes** - no scripts, no shortcuts!