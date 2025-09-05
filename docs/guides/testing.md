# Testing Guide

Comprehensive guide for all testing in the containerization-assist project, including unit tests, integration tests, and quality validation.

## Quick Start

### Development Commands
```bash
# Clean build artifacts
npm run clean              # Remove dist, coverage, .tsbuildinfo

# Development mode with watch
npm run dev                # Run CLI with tsx watch mode

# Start built CLI
npm run start              # Run dist/apps/cli.js
```

### Run Tests
```bash
# All tests
npm test

# Unit tests only (fast)
npm run test:unit
npm run test:unit:quick    # With 10s timeout

# Integration tests (requires Docker)
npm run test:integration

# With coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Validate Code Quality
```bash
# Standard validation (lint, typecheck, unit tests)
npm run validate

# Run quality gates check
npm run quality:gates

# Check formatting
npm run format:check
```

## Test Categories

### Unit Tests
- **Location**: `test/unit/`
- **Speed**: Fast (< 30s total)
- **Dependencies**: None
- **Purpose**: Test individual components in isolation

```bash
# Run specific unit test
npm test -- test/unit/specific.test.ts

# Quick unit tests with 10s timeout
npm run test:unit:quick
```

### Integration Tests
- **Location**: `test/integration/`
- **Speed**: Slower (2-5 minutes)
- **Dependencies**: Docker, optional Registry/Trivy/K8s
- **Purpose**: Test cross-component workflows

```bash
# Setup test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Run specific integration suite
npm test -- --testPathPattern="docker-workflow"
```

## Integration Test Environment

### Prerequisites
```bash
# Required
docker --version

# Optional but recommended
kubectl version --client
trivy --version
```

### Test Services Setup
```bash
# Start all test services
docker-compose -f docker-compose.test.yml up -d

# Services provided:
# - Registry (localhost:5000)
# - Trivy Scanner (localhost:4954)
# - PostgreSQL (localhost:5432)
```

### Environment Detection
Tests automatically detect available services and adapt:
- ✅ **Docker available**: Run real container tests
- 🔄 **Registry unavailable**: Use mock push/pull
- 🎭 **Trivy missing**: Use mock scanner
- ☁️ **No K8s**: Skip deployment tests

## Writing Tests

### Unit Test Template
```typescript
import { describe, test, expect, beforeEach } from '@jest/globals';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup
  });

  test('should do something', () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Integration Test Template
```typescript
import { 
  describeWithEnvironment,
  createTestLogger,
  IntegrationTestCleanup
} from '../utils/integration-test-utils';

describeWithEnvironment(
  'Feature Integration',
  {
    requirements: ['docker', 'registry'],
    timeout: 10000
  },
  (testEnv) => {
    let cleanup: IntegrationTestCleanup;
    
    beforeAll(async () => {
      cleanup = new IntegrationTestCleanup();
    });

    afterAll(async () => {
      await cleanup.cleanup();
    });

    test('should integrate components', async () => {
      // Test with testEnv.capabilities
    });
  }
);
```

## Test Configuration

### Jest Configuration
- **Config File**: `jest.config.js`
- **Test Match**: `**/*.test.ts`
- **Coverage**: Tracked but no hard thresholds enforced
- **Timeout**: 30s default for unit tests, 120s for integration tests

### Environment Variables
```bash
# Node options for ES modules
NODE_OPTIONS='--experimental-vm-modules'

# Skip typecheck in quality gates
SKIP_TYPECHECK=true

# Use local registry
TEST_REGISTRY_HOST=localhost:5000
USE_LOCAL_REGISTRY=true

# Docker availability
DOCKER_AVAILABLE=true

# CI environment
CI=true
```

## CI/CD Integration

### GitHub Actions
The project uses multiple GitHub Actions workflows:

1. **CI/CD** (`ci.yml`):
   - Quality checks (format, lint, typecheck)
   - Unit tests (Node 18 and 20)
   - Integration tests with Docker registry
   - Test coverage reporting
   - Security scanning
   - MCP protocol compatibility

2. **PR Quality** (`pr-quality.yml`):
   - Quality metrics analysis
   - PR comment with quality report
   - Gate enforcement (non-blocking)

3. **Release** (`release.yml`):
   - NPM publishing
   - GitHub release creation
   - Docker image building

### Pre-commit Validation
**Husky Pre-commit Hook** (`.husky/pre-commit`):
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🛡️ Running pre-commit quality gates..."
set -eu

# Run lint-staged for incremental checks
npx lint-staged

# Run quality gates
./scripts/quality-gates.sh

# Auto-stage updated quality-gates.json if modified
if git diff --name-only | grep -q "quality-gates.json"; then
    echo "📊 Staging updated quality-gates.json metrics..."
    git add quality-gates.json
fi

echo "✅ Pre-commit checks passed!"
```

**Lint-staged Configuration** (`package.json`):
```json
"lint-staged": {
  "src/**/*.ts": [
    "eslint --fix --max-warnings 750",
    "prettier --write"
  ]
}
```

## Troubleshooting

### Common Issues

#### Docker Permission Errors
```bash
# Add current user to the docker group (log out/in or start a new shell)
sudo usermod -aG docker $USER
newgrp docker
# Alternatively (temporary): grant user-specific access with ACLs
# sudo setfacl -m user:$USER:rw /var/run/docker.sock
```

#### Test Timeouts
```bash
# Increase timeout for slow tests
npm test -- --testTimeout=60000

# Check for hanging processes
npm test -- --detectOpenHandles
```

#### Registry Connection Issues
```bash
# Check registry is running
curl http://localhost:5000/v2/

# Restart registry
docker-compose -f docker-compose.test.yml restart test-registry
```

## Performance Optimization

### Speed Up Tests
1. Use `test.only()` during development
2. Run tests in parallel: `--maxWorkers=4`
3. Skip integration tests when not needed
4. Use `npm run test:unit:quick` for rapid feedback

### Resource Management
- Clean up Docker images after tests
- Use temporary directories for test files
- Implement proper cleanup in afterEach/afterAll
- Monitor with `docker system df`

## Best Practices

### Do's ✅
- Write tests for new features
- Use descriptive test names
- Clean up resources after tests
- Test both success and failure cases
- Use proper async/await handling

### Don'ts ❌
- Don't use hardcoded paths
- Don't leave console.log in tests
- Don't skip cleanup
- Don't use real external services
- Don't commit .only() or .skip()

## Build and Bundle Management

### Build Commands
```bash
# Production build with minification
npm run build:prod

# Fast development build (skip declarations)
npm run build:fast

# Development build with watch mode
npm run build:watch

# Development build (skip declarations)
npm run build:dev

# Standard build with test utils
npm run build
```

### Bundle Analysis
```bash
# Check bundle size
npm run bundle:size

# Dry run npm publish
npm run bundle:check

# Release process
npm run release  # Runs validation, builds prod, and publishes
```

## Related Documentation
- [Quality Management](./quality-management.md)
- [Development Workflow](../../README.md#development)
- [Documentation Index](../README.md)