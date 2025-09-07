# Development Guide

## Development Setup

### Prerequisites
- Node.js 18+
- Docker 20.10+
- kubectl (optional)

### Quick Setup

```bash
# Clone and setup
git clone <repository-url>
cd containerization-assist-js
npm install

# Build and start
npm run build
npm run start
```

### Development Commands

```bash
# Development mode with watch
npm run dev                # Run CLI with tsx watch mode

# Build commands
npm run build              # Standard build
npm run build:dev          # Development build (skip declarations)
npm run build:fast         # Fast build (skip test utils)
npm run build:watch        # Build with watch mode
npm run build:prod         # Production build with minification

# Clean up
npm run clean              # Remove dist, coverage, .tsbuildinfo
```

### Code Quality

```bash
# Linting and formatting
npm run lint               # Run ESLint
npm run lint:fix           # Fix linting issues
npm run format             # Format with Prettier
npm run format:check       # Check formatting

# Type checking
npm run typecheck          # TypeScript compilation check

# Quality validation
npm run validate           # Lint, typecheck, unit tests
npm run validate:pr:fast   # Quick PR validation
npm run quality:gates      # Check quality gates
```

### Testing

See the [Testing Guide](./testing.md) for comprehensive testing information.

```bash
# Run all tests
npm test

# Test specific categories
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:mcp:tools     # MCP tool tests

# Coverage and reporting
npm run test:coverage      # Run with coverage
npm run test:watch         # Watch mode for development
```

## Code Standards

### Import Rules (Mandatory)

```typescript
// ✅ CORRECT - Relative imports only
import { Config } from '../config/types'
import type { Logger } from 'pino'

// ❌ WRONG - Path aliases (banned by ESLint)
import { Config } from '@domain/config'
import { Logger } from '../../../domain/types/index'
```

### Error Handling Pattern

All functions that can fail MUST return `Result<T>`:

```typescript
import { Result, Success, Failure } from '../domain/types/result'

// ✅ CORRECT - Always use Result<T>
export async function buildImage(config: BuildConfig): Promise<Result<BuildOutput>> {
  try {
    const output = await docker.build(config);
    return Success(output);
  } catch (error) {
    return Failure(`Build failed: ${error.message}`);
  }
}

// ❌ WRONG - Never throw or return naked types
export async function buildImage(config: BuildConfig): Promise<BuildOutput> {
  return await docker.build(config); // Could throw!
}
```

### Code Style Rules

- **NO path aliases**: Use relative imports only
- **NO Logger from domain**: Always `import type { Logger } from 'pino'`
- **NO console.log**: Use structured logging with injected logger
- **NO throwing errors**: Return `Result<T>` for all operations that can fail
- **NO direct dockerode**: Use `DockerAdapterFactory.getWorkingAdapter()`

## Architecture

### File Organization

```
src/
├── config/          # ✅ Single source of truth for configuration
├── domain/          # ✅ Pure types only (NO business logic)
├── infrastructure/  # ✅ External adapters (docker, k8s, ai, core)
├── application/     # ✅ Business logic (tools, workflow, factories)
├── mcp/            # ✅ MCP server and protocol implementation
├── lib/            # ✅ Shared utilities and services
├── tools/          # ✅ Individual tool implementations
└── workflows/      # ✅ Workflow orchestration
```

### Adding New Tools

1. **Create Tool Implementation**:
   ```typescript
   // src/tools/my-new-tool.ts
   import { Tool, Result, Success, Failure } from '../domain/types'
   
   export const myNewTool: Tool = {
     name: 'my-new-tool',
     description: 'Description of what this tool does',
     inputSchema: {
       type: 'object',
       properties: {
         param1: { type: 'string', description: 'Parameter description' }
       },
       required: ['param1']
     },
     
     async execute(params, logger): Promise<Result<any>> {
       try {
         // Implementation
         return Success(result);
       } catch (error) {
         return Failure(`Tool failed: ${error.message}`);
       }
     }
   };
   ```

2. **Register Tool**:
   ```typescript
   // src/mcp/registry.ts
   import { myNewTool } from '../tools/my-new-tool'
   
   // Add to tools array
   const tools = [
     // ... existing tools
     myNewTool
   ];
   ```

3. **Add Tests**:
   ```typescript
   // test/unit/tools/my-new-tool.test.ts
   import { describe, test, expect } from '@jest/globals'
   import { myNewTool } from '../../../src/tools/my-new-tool'
   
   describe('myNewTool', () => {
     test('should execute successfully', async () => {
       const result = await myNewTool.execute({ param1: 'value' }, logger);
       expect(result.ok).toBe(true);
     });
   });
   ```

### Adding New Workflows

1. **Create Workflow Implementation**:
   ```typescript
   // src/workflows/my-workflow.ts
   export async function executeMyWorkflow(
     params: MyWorkflowParams,
     context: WorkflowContext
   ): Promise<Result<WorkflowResult>> {
     const steps = [
       { name: 'step1', tool: 'analyze-repo' },
       { name: 'step2', tool: 'build-image' }
     ];
     
     return await context.orchestrator.executeSteps(steps, params);
   }
   ```

2. **Register Workflow**:
   ```typescript
   // src/workflows/intelligent-orchestration.ts
   import { executeMyWorkflow } from './my-workflow'
   
   const workflows = {
     // ... existing workflows
     'my-workflow': executeMyWorkflow
   };
   ```

## Debugging

### Development Debugging

```bash
# Run with debug logging
DEBUG=containerization:* npm run dev

# Run specific tool test
npm test -- --testPathPattern="my-tool.test.ts"

# Debug test with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand test/unit/tools/my-tool.test.ts
```

### MCP Server Debugging

```bash
# Start server with debug logging
DEBUG=mcp:* npm run start

# Test MCP server responses
npm run test:mcp:tools

# Check server health
curl http://localhost:3001/health
```

### Common Debug Scenarios

1. **Tool Execution Issues**:
   ```typescript
   // Add detailed logging
   logger.debug({ params, sessionId }, 'Tool execution starting');
   const result = await tool.execute(params, logger);
   logger.debug({ result }, 'Tool execution completed');
   ```

2. **Session State Issues**:
   ```typescript
   // Check session state
   const session = await sessionManager.getSession(sessionId);
   logger.debug({ session }, 'Current session state');
   ```

3. **AI Service Issues**:
   ```typescript
   // Mock AI service for testing
   const mockAI = {
     validateParameters: jest.fn().mockResolvedValue(Success(params)),
     analyzeResults: jest.fn().mockResolvedValue({ insights: [] })
   };
   ```

## Release Process

### Version Management

```bash
# Update version
npm version patch  # or minor, major

# Build for release
npm run build:prod

# Run full validation
npm run validate
npm run test:coverage
```

### Publishing

```bash
# Dry run
npm run bundle:check

# Publish
npm publish
```

## Performance Optimization

### Build Performance

- Use `npm run build:fast` for development
- Enable TypeScript incremental compilation
- Use `npm run build:watch` for continuous development

### Runtime Performance

- Use Result types to avoid exception handling overhead
- Implement proper cleanup in tools and workflows
- Monitor memory usage with `--max-old-space-size=8192`

### Testing Performance

- Use `npm run test:unit:quick` for rapid feedback
- Run integration tests only when needed
- Use `--maxWorkers=4` for parallel test execution

## Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear build cache
npm run clean
npm install
npm run build
```

#### Type Errors
```bash
# Check TypeScript configuration
npm run typecheck

# Generate type declarations
npx tsc --declaration --emitDeclarationOnly
```

#### Import Resolution Issues
```bash
# Check import paths are relative
# Ensure no path aliases are used
# Verify file extensions are correct
```

## Best Practices

### Code Quality
- Write tests for all new features
- Use descriptive variable and function names
- Keep functions small and focused
- Follow the Result<T> pattern for error handling

### Git Workflow
- Use conventional commit messages
- Run quality gates before committing
- Keep commits focused and atomic
- Write descriptive pull request descriptions

### Documentation
- Update documentation when adding features
- Include examples in code comments
- Keep README files current
- Document breaking changes

## Related Documentation

- [Testing Guide](./testing.md) - Complete testing procedures
- [Quality Management](./quality-management.md) - Code quality standards
- [Architecture Guide](../ARCHITECTURE.md) - System architecture
- [MCP Server Features](../mcp-server.md) - MCP implementation details