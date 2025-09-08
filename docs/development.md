# Development Guide

This guide covers development setup, coding standards, testing, and contribution guidelines.

## Development Setup

### Prerequisites

- Node.js 18+ and npm 9+
- Docker Desktop or Docker Engine
- Git
- VS Code (recommended) with extensions:
  - ESLint
  - Prettier
  - TypeScript

### Initial Setup

```bash
# Clone repository
git clone https://github.com/gambtho/container-assist-js.git
cd container-assist-js

# Install dependencies
npm install

# Build project
npm run build

# Run tests to verify setup
npm test
```

### Development Workflow

```bash
# Start development with watch mode
npm run dev

# In another terminal, run tests in watch mode
npm run test:watch

# Before committing
npm run validate:pr:fast
```

## Project Structure

```text
src/
├── cli/              # CLI entry points
│   ├── cli.ts       # Main MCP server CLI
│   └── server.ts    # Server utilities
├── config/          # Configuration management
├── core/            # Core utilities and types
├── lib/             # Libraries (AI service, utilities)
├── mcp/             # MCP server implementation
│   ├── server.ts    # Main MCP server
│   ├── session/     # Session management
│   ├── resources/   # Resource providers
│   └── prompts/     # Prompt templates
├── tools/           # Tool implementations
└── workflows/       # Workflow orchestration
```

## Coding Standards

### TypeScript Guidelines

```typescript
// Use type imports for type-only imports
import type { Logger } from 'pino';
import { Config } from '../config/types';

// Always use Result<T> for operations that can fail
import { Result, Success, Failure } from '../core/result';

export async function buildImage(config: BuildConfig): Promise<Result<BuildOutput>> {
  try {
    const output = await docker.build(config);
    return Success(output);
  } catch (error) {
    return Failure(`Build failed: ${error.message}`);
  }
}
```

### Import Rules

```typescript
// ✅ CORRECT - Relative imports
import { Config } from '../config/types';
import { DockerAdapter } from '../lib/docker-adapter';

// ❌ WRONG - Path aliases (banned by ESLint)
import { Config } from '@config/types';
import { DockerAdapter } from '@lib/docker-adapter';
```

### Error Handling

Never throw errors. Always return `Result<T>`:

```typescript
// ✅ CORRECT
export async function analyzeRepo(path: string): Promise<Result<Analysis>> {
  if (!fs.existsSync(path)) {
    return Failure('Repository path does not exist');
  }
  // ... analysis logic
  return Success(analysis);
}

// ❌ WRONG
export async function analyzeRepo(path: string): Promise<Analysis> {
  if (!fs.existsSync(path)) {
    throw new Error('Repository path does not exist');
  }
  // ... analysis logic
  return analysis;
}
```

### Logging

Use structured logging with the injected logger:

```typescript
// ✅ CORRECT
logger.info({ sessionId, tool: 'build_image' }, 'Starting image build');

// ❌ WRONG
console.log('Starting image build');
```

## Testing

### Test Structure

```text
test/
├── __tests__/
│   ├── unit/        # Unit tests
│   ├── integration/ # Integration tests
│   └── e2e/        # End-to-end tests
├── __fixtures__/    # Test fixtures
└── __mocks__/      # Mock implementations
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run specific test file
npm test -- --testPathPattern=server.test.ts

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect, jest } from '@jest/globals';
import { analyzeRepository } from '../tools/analyze-repository';

describe('analyzeRepository', () => {
  it('should detect Node.js projects', async () => {
    const result = await analyzeRepository({
      repoPath: './test-fixtures/node-app',
      sessionId: 'test-session'
    });
    
    expect(result.isSuccess()).toBe(true);
    expect(result.value.language).toBe('javascript');
    expect(result.value.framework).toBe('express');
  });

  it('should handle missing repositories', async () => {
    const result = await analyzeRepository({
      repoPath: './non-existent',
      sessionId: 'test-session'
    });
    
    expect(result.isFailure()).toBe(true);
    expect(result.error).toContain('does not exist');
  });
});
```

## Quality Management

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Fix all issues (lint + format)
npm run fix:all
```

### Type Checking

```bash
# Check TypeScript compilation
npm run typecheck

# Watch mode for TypeScript
npm run typecheck:watch
```

### Pre-commit Validation

```bash
# Quick validation (recommended before commits)
npm run validate:pr:fast

# Full validation (runs in CI)
npm run validate:pr
```

### Managing Baselines

When improving code quality:

```bash
# Update ESLint baseline after fixing issues
npm run baseline:lint

# Check current baseline status
npm run lint:check-baseline
```

## Adding New Features

### Adding a New Tool

1. Create tool implementation in `src/tools/`:

```typescript
// src/tools/my-new-tool.ts
import { Result, Success, Failure } from '../core/result';
import type { ToolContext } from '../mcp/types';

export interface MyToolInput {
  sessionId: string;
  // ... other parameters
}

export async function myNewTool(
  input: MyToolInput,
  context: ToolContext
): Promise<Result<MyToolOutput>> {
  const { logger, progressReporter } = context;
  
  try {
    await progressReporter?.report(0, 100, 'Starting operation...');
    // ... implementation
    await progressReporter?.report(100, 100, 'Complete');
    return Success(output);
  } catch (error) {
    return Failure(`Operation failed: ${error.message}`);
  }
}
```

2. Register in tool registry (`src/mcp/registry.ts`):

```typescript
import { myNewTool } from '../tools/my-new-tool';

export const TOOL_REGISTRY = {
  // ... existing tools
  my_new_tool: {
    handler: myNewTool,
    schema: {
      // ... JSON schema for parameters
    }
  }
};
```

3. Add tests in `test/__tests__/unit/tools/`:

```typescript
describe('myNewTool', () => {
  // ... test cases
});
```

### Adding a New Workflow

1. Create workflow in `src/workflows/`:

```typescript
// src/workflows/my-workflow.ts
export class MyWorkflow extends BaseWorkflow {
  async execute(): Promise<Result<WorkflowResult>> {
    // ... workflow steps
  }
}
```

2. Register in orchestrator (`src/workflows/intelligent-orchestration.ts`)

3. Add integration tests

## Debugging

### VS Code Configuration

The project includes `.vscode/launch.json` for debugging:

```json
{
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug MCP Server",
      "program": "${workspaceFolder}/src/cli/cli.ts",
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "MCP_MODE": "true",
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

### Debug Logging

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Debug specific module
DEBUG=mcp:* npm run dev
```

### Testing with MCP Inspector

```bash
# Start server with inspector
npx @modelcontextprotocol/inspector npx tsx src/cli/cli.ts

# Test specific tool
# Use the Inspector UI to call tools with test parameters
```

## Common Commands Reference

```bash
# Development
npm run dev              # Start with watch mode
npm run build           # Build project
npm run clean           # Clean build artifacts

# Testing
npm test                # Run all tests
npm run test:unit       # Unit tests only
npm run test:watch      # Watch mode
npm run test:coverage   # Generate coverage

# Quality
npm run lint            # Check linting
npm run lint:fix        # Fix linting issues
npm run typecheck       # TypeScript check
npm run format          # Format code
npm run fix:all         # Fix all issues

# Validation
npm run validate:pr:fast  # Quick PR validation
npm run validate:pr       # Full validation

# Utilities
npm run analyze:deps    # Analyze dependencies
npm run baseline:lint   # Update lint baseline
```

## Troubleshooting

### Common Issues

**TypeScript errors after adding new files:**
```bash
npm run clean && npm run build
```

**ESLint not recognizing new rules:**
```bash
npm run lint:fix
npm run baseline:lint  # If improvements made
```

**Tests failing with module resolution:**
```bash
# Check jest.config.js moduleNameMapper
# Ensure using relative imports, not aliases
```

**Docker connection issues in tests:**
```bash
# Ensure Docker is running
docker ps

# Check mock mode
USE_MOCK_DOCKER=true npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes following coding standards
4. Add tests for new functionality
5. Run validation: `npm run validate:pr:fast`
6. Commit with descriptive message
7. Push and create pull request

### Commit Message Format

```text
type(scope): description

- Detail 1
- Detail 2

Fixes #123
```

Types: feat, fix, docs, style, refactor, test, chore

## Resources

- [Main README](../README.md) - Project overview
- [Architecture Guide](./architecture.md) - System design
- [Getting Started](./getting-started.md) - Usage guide
- [CLAUDE.md](../CLAUDE.md) - Claude Code guidelines