# Testing Guide

Comprehensive guide for all testing in the containerization-assist project, including unit tests, integration tests, and quality validation.

## Quick Start

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
```

### Validate Code Quality
```bash
# Quick validation before PR
npm run validate:pr:fast

# Full validation with coverage
npm run validate:pr
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

# Run with bail on first failure
npm run test:ci
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
- **Coverage Threshold**: 70% (statements, branches, functions, lines)
- **Timeout**: 30s default, configurable per suite

### Environment Variables
```bash
# Skip integration tests
SKIP_INTEGRATION_TESTS=true

# Custom test timeout
TEST_TIMEOUT=60000

# Use local registry
TEST_REGISTRY_HOST=localhost:5000
```

## CI/CD Integration

### GitHub Actions
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
```

### Pre-commit Validation
```bash
# Add to .git/hooks/pre-commit
#!/bin/bash
npm run validate:pr:fast
```

## Troubleshooting

### Common Issues

#### Docker Permission Errors
```bash
# Fix socket permissions
sudo chmod 666 /var/run/docker.sock
# Or add user to docker group
sudo usermod -aG docker $USER
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

## Related Documentation
- [Quality Management](./quality-management.md)
- [Development Workflow](../../README.md#development)
- [Documentation Index](../README.md)