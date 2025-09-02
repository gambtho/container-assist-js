# Troubleshooting Guide

This guide helps resolve common issues encountered during development and deployment of the Container Kit MCP server.

## TypeScript Compilation Errors

### Current Status
- **Total Errors**: 146 (reduced from 316)
- **Primary Issues**: Syntax errors in service layer tools
- **Recovery Progress**: ~54% complete

### Common TypeScript Error Patterns

#### 1. Missing Commas in Object Literals
**Error**: `TS1005: ',' expected`

**Common Locations**:
```typescript
// ❌ Incorrect - missing comma
const config = {
  timeout: 5000
  retries: 3  // Missing comma here
}

// ✅ Correct  
const config = {
  timeout: 5000,
  retries: 3
}
```

**Fix Strategy**: Search for object literals missing trailing commas, especially in:
- Tool configuration objects
- Logger context objects
- Function parameter objects

#### 2. Malformed Logger Calls  
**Error**: Various syntax errors in logger statements

**Common Patterns**:
```typescript
// ❌ Incorrect patterns
logger.error(error)                    // Missing context object
logger.info({data}, 'message'         // Missing closing parenthesis
logger.warn({}, 'message',            // Extra trailing comma

// ✅ Correct patterns
logger.error({ error }, 'Error occurred')
logger.info({ data }, 'Processing data') 
logger.warn({}, 'Warning message')
```

**Fix Strategy**: Standardize all logger calls to use `{ context }, 'message'` pattern.

#### 3. Incomplete Function Calls
**Error**: `TS1005: ')' expected` or `TS1128: Declaration or statement expected`

**Common Issues**:
```typescript
// ❌ Missing closing parentheses
func(param1, param2
const result = await someAsyncFunc(

// ❌ Missing semicolons  
const value = getValue()  // Missing semicolon
doSomething()

// ✅ Correct
func(param1, param2);
const result = await someAsyncFunc();
```

#### 4. Malformed Try-Catch Blocks
**Error**: `TS1472: 'catch' or 'finally' expected`

**Common Issues**:
```typescript
// ❌ Incomplete try-catch
try {
  await operation()
} // Missing catch or finally

// ❌ Malformed catch
try {
  await operation()  
} catch error {  // Missing parentheses
  logger.error({ error })
}

// ✅ Correct
try {
  await operation()
} catch (error) {
  logger.error({ error }, 'Operation failed')
}
```

### Files with Most Errors

#### High Priority (60+ errors per file)
1. **`src/service/tools/build/scan-image.ts`** - Previously 59 errors
2. **`src/service/tools/deployment/prepare-cluster.ts`** - Previously 38 errors
3. **`src/service/tools/deployment/generate-k8s-manifests.ts`** - Previously 32 errors

#### Medium Priority (20-30 errors per file)
1. **`src/service/tools/utilities/server-status.ts`** - Logger and syntax issues
2. **`src/service/tools/schemas.ts`** - Schema definition problems

## Debugging TypeScript Errors

### 1. Check Compilation Status
```bash
# Full typecheck with error details
npm run typecheck

# Count remaining errors
npm run typecheck 2>&1 | grep "error TS" | wc -l

# Check specific file
npx tsc --noEmit src/service/tools/specific-file.ts
```

### 2. Common Fix Workflow
1. **Identify error pattern** - Look at the TS error code (TS1005, TS1128, etc.)
2. **Locate context** - Check 2-3 lines before/after the error line
3. **Apply pattern fix** - Use the correct patterns shown above  
4. **Validate incrementally** - Run typecheck after each file fix
5. **Test functionality** - Ensure fixes don't break logic

### 3. Automated Checks
```bash
# Check for common issues
grep -r "logger\." src/ | grep -v ", '" # Find malformed logger calls
grep -r "}\s*$" src/ | head -20         # Find potential missing commas
grep -r "try\s*{" -A 10 src/            # Find try blocks without catch
```

## Build and Runtime Issues

### Build Failures
```bash
# Clean build artifacts
npm run clean

# Full clean rebuild
npm run clean && npm install && npm run build

# Build with verbose output
npm run build -- --verbose
```

### Runtime Errors

#### MCP Server Connection Issues
**Symptoms**: Server fails to start or accept connections

**Common Causes**:
1. TypeScript compilation errors preventing server startup
2. Missing environment variables
3. Port conflicts

**Debugging**:
```bash
# Check if server can start
npm run start:dev

# Test basic connectivity
echo '{"jsonrpc":"2.0","method":"tools/ping","params":{},"id":1}' | nc localhost 3000

# Check logs
npm run start:dev 2>&1 | grep -E "(error|Error)"
```

#### Tool Execution Failures  
**Symptoms**: MCP tools return errors when called

**Common Causes**:
1. Session management issues
2. Missing dependencies (Docker, Kubernetes)
3. Permission problems

**Debugging**:
```bash
# Test individual tool
echo '{"jsonrpc":"2.0","method":"tools/list_tools","params":{},"id":1}' | npm start

# Check tool availability
npm run start:dev -- --list-tools

# Verify dependencies
docker --version
kubectl version --client
```

### Development Environment Issues

#### Node.js Version Problems
**Requirement**: Node.js >= 20.0.0

```bash
# Check version
node --version

# Switch version (using nvm)
nvm install 20
nvm use 20
```

#### Package Installation Issues
```bash
# Clear npm cache
npm cache clean --force

# Remove and reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Testing Issues

### Test Failures
```bash
# Run tests with verbose output
NODE_OPTIONS='--experimental-vm-modules' npm test -- --verbose

# Run specific test file
NODE_OPTIONS='--experimental-vm-modules' npm test -- test/unit/specific.test.ts

# Run with coverage to identify issues
npm run test:coverage
```

### Integration Test Problems
**Common Issues**:
1. Docker not running
2. Kubernetes cluster not accessible
3. Network connectivity problems

**Debugging**:
```bash
# Check Docker
docker ps

# Check Kubernetes
kubectl cluster-info

# Test network
curl -I localhost:3000/health
```

## Recovery Procedures

### Emergency TypeScript Recovery
If compilation errors exceed 200+:

1. **Stop all development work**
2. **Create backup branch**: `git checkout -b backup-$(date +%Y%m%d)`
3. **Focus on top 5 error files only**
4. **Use pattern-based fixes** (see above)
5. **Validate after each file**: `npm run typecheck`

### Rollback to Last Working State
```bash
# Find last working commit
git log --oneline | head -10

# Create recovery branch
git checkout -b recovery-$(date +%Y%m%d) <last-working-commit>

# Cherry-pick essential changes only
git cherry-pick <essential-commit-hash>
```

### Communication Protocol During Recovery
- **Status update every 2 hours** during critical fixes
- **Error count tracking**: Log progress from 316 → target 0
- **Escalation threshold**: If <50% reduction in 2 days

## Monitoring and Prevention

### Pre-commit Validation
```bash
# Add to package.json scripts
"precommit": "npm run typecheck && npm run lint"

# Or use husky
npx husky add .husky/pre-commit "npm run validate"
```

### Continuous Integration Checks
Ensure CI pipeline includes:
1. TypeScript compilation (`npm run typecheck`)
2. Linting (`npm run lint`)  
3. Unit tests (`npm test`)
4. Integration tests (`npm run test:integration`)

### Code Quality Gates
- **Zero TypeScript errors** before any PR merge
- **No ESLint warnings** in production code
- **Test coverage** > 80% for service layer
- **Documentation** updated with architectural changes

## Getting Help

### Internal Resources
1. **Architecture docs**: `docs/ARCHITECTURE.md`
2. **Development setup**: `docs/DEVELOPMENT.md`
3. **Emergency recovery plan**: `EMERGENCY_TYPESCRIPT_RECOVERY_PLAN.md`

### External Resources
1. **TypeScript Handbook**: https://www.typescriptlang.org/docs/
2. **MCP Protocol Docs**: https://modelcontextprotocol.io/docs/
3. **ESLint Rules**: https://eslint.org/docs/rules/

### Escalation
If errors cannot be resolved within expected timeframes:
1. **Document the specific error patterns** encountered
2. **Create minimal reproduction case** if possible
3. **Escalate to lead architect** with error analysis
4. **Consider automated tooling** (ESLint auto-fix, AST repairs)
5. **Fallback to known working state** if critical

---

**Last Updated**: Emergency Recovery Phase - 146 TypeScript errors remaining
**Next Review**: After error count drops below 50