# Integration Testing Guide

## Overview

This guide provides comprehensive documentation for the containerization-assist integration testing framework. The integration tests are designed to work in multiple environments with proper fallback strategies and containerized dependencies.

## Architecture

### Test Environment Strategy
The integration testing framework uses a **multi-layered approach** with environment detection and fallback strategies:

1. **Environment Detection**: Automatic detection of available services (Docker, Registry, Trivy, Kubernetes)
2. **Containerized Dependencies**: Docker Compose services provide consistent test environments
3. **Graceful Fallbacks**: Tests adapt based on available services with mock alternatives
4. **Proper Isolation**: Each test uses unique identifiers and cleanup strategies

### Test Categories

#### 1. Docker Workflow Integration (`docker-workflow-integration.test.ts`)
- **Purpose**: End-to-end Docker container lifecycle testing
- **Coverage**: Build, tag, scan, push, cleanup workflows
- **Dependencies**: Docker daemon
- **Key Features**:
  - Build reproducibility testing
  - Concurrent build safety
  - Enhanced error detection and handling
  - Comprehensive cleanup with retry logic

#### 2. Docker Registry Integration (`docker-registry-integration.test.ts`)
- **Purpose**: Container registry operations and workflows
- **Coverage**: Push/pull, authentication simulation, tag management
- **Dependencies**: Docker daemon + test registry (localhost:5000)
- **Key Features**:
  - Local test registry integration
  - Multiple registry format support
  - Authentication failure simulation
  - Registry metadata validation

#### 3. Trivy Security Scanner Integration (`trivy-scanner-integration.test.ts`)
- **Purpose**: Security vulnerability scanning workflows
- **Coverage**: Multiple scanner strategies with fallbacks
- **Dependencies**: Trivy (binary/container/server) or mock
- **Key Features**:
  - Strategy selection (binary → server → container → mock)
  - Concurrent scanning support
  - Performance benchmarking
  - Comprehensive vulnerability result parsing

#### 4. Kubernetes Integration (`kubernetes-integration.test.ts`)
- **Purpose**: Kubernetes deployment and management workflows
- **Coverage**: Pod/deployment lifecycle, services, resource quotas
- **Dependencies**: Kubernetes cluster (kind preferred)
- **Key Features**:
  - Namespace isolation
  - Resource management testing
  - Service networking validation
  - Deployment scaling scenarios

## Quick Start

### Prerequisites
```bash
# Required services
docker --version
kubectl version --client
kind version  # Optional but recommended

# Start test services
docker compose -f docker-compose.test.yml up -d
```

### Basic Test Execution
```bash
# Run all integration tests
npm test -- --testPathPattern="integration/"

# Run specific test suite
npm test -- --testPathPattern="docker-workflow-integration.test.ts"

# Run specific test
npm test -- --testNamePattern="should build image with basic options"

# Run with verbose output
npm test -- --testPathPattern="integration/" --verbose
```

## Test Services

### Docker Compose Test Environment
The `docker-compose.test.yml` provides containerized test dependencies:

```yaml
Services:
  test-registry:5000    # Docker registry for push/pull tests
  trivy-scanner:4954    # Security scanner server
  test-db:5432         # PostgreSQL for session testing
```

### Service Health Checks
```bash
# Check all services
docker compose -f docker-compose.test.yml ps

# Test registry
curl http://localhost:5000/v2/

# Test Trivy scanner  
curl http://localhost:4954/version

# Test database
pg_isready -h localhost -p 5432 -U test_user
```

## Environment Configuration

### Local Development
```bash
# Standard setup with all services
docker compose -f docker-compose.test.yml up -d
npm test -- --testPathPattern="integration/"
```

### CI/CD Environment
```bash
# Use environment variables for service configuration
export DOCKER_SOCKET=/var/run/docker.sock
export REGISTRY_HOST=localhost
export REGISTRY_PORT=5000
export TRIVY_SERVER_URL=http://localhost:4954

# Run with containerized dependencies
docker compose -f docker-compose.test.yml up -d
npm run test:integration
```

### Minimal Environment (Docker only)
```bash
# Will use mock fallbacks for registry and security scanning
npm test -- --testPathPattern="docker-workflow-integration.test.ts"
```

## Test Configuration

### Environment Detection Options
Tests use the `describeWithEnvironment` utility with configurable requirements:

```typescript
describeWithEnvironment(
  'Test Suite Name',
  {
    requirements: ['docker', 'registry', 'kubernetes'], // Services needed
    timeout: 10000,                                     // Detection timeout
    skipMessage: 'Custom skip message'                  // Optional skip message
  },
  (testEnv) => {
    // Test implementation with testEnv.capabilities
  }
);
```

### Available Requirements
- `docker`: Docker daemon availability
- `registry`: Container registry (localhost:5000)
- `trivy`: Security scanner (binary/container/server)
- `kubernetes`: Kubernetes cluster access
- `ai`: AI service integration

## Test Utilities

### Core Utilities (`integration-test-utils.ts`)

#### `createTestLogger(prefix: string)`
Creates a test-appropriate logger with optional console forwarding.

#### `createTestContext(prefix?: string)`
Creates isolated temporary directories for test contexts.

#### `IntegrationTestCleanup`
Manages cleanup of temporary resources:
```typescript
const cleanup = new IntegrationTestCleanup();
cleanup.addTempDir('/tmp/test-context');
cleanup.addCleanupTask(async () => {
  await dockerService.removeImage(imageId);
});
await cleanup.cleanup(); // Runs all cleanup tasks
```

#### `waitFor(condition, options)`
Waits for conditions with configurable timeout and interval:
```typescript
await waitFor(async () => {
  const status = await getServiceStatus();
  return status === 'ready';
}, { timeout: 30000, interval: 1000 });
```

#### `retryWithBackoff(operation, options)`
Retries operations with exponential backoff:
```typescript
await retryWithBackoff(async () => {
  await flakeyOperation();
}, { maxAttempts: 3, baseDelay: 1000 });
```

### Specialized Utilities

#### `generateTestId()`
Generates unique test identifiers for resource isolation.

#### `getStandardDockerFiles()`
Provides standard Dockerfile and supporting files for testing.

#### `createTestFiles(contextDir, files)`
Creates test files in a directory with proper structure.

## Best Practices

### 1. Test Isolation
- Always use unique test IDs: `const testId = generateTestId()`
- Create isolated namespaces/contexts for each test
- Use proper cleanup strategies with retry logic

### 2. Resource Management
```typescript
// Good: Proper cleanup tracking
const cleanup = new IntegrationTestCleanup();
testImageId = result.imageId;
cleanup.addCleanupTask(async () => {
  if (testImageId) {
    await dockerService.removeImage(testImageId, { force: true });
  }
});

// Good: Label resources for identification
const buildOptions = {
  context: testContext,
  tags: [`test-image-${testId}:latest`],
  labels: {
    'test.id': testId,
    'test.type': 'integration'
  }
};
```

### 3. Error Handling
```typescript
// Good: Expect and handle specific errors
try {
  await dockerService.pushImage('invalid-registry/image:tag');
} catch (error) {
  expect(error.message).toMatch(/(registry|network|authentication)/i);
}

// Good: Use proper timeout handling
await waitFor(condition, {
  timeout: 30000,
  errorMessage: 'Service did not become ready within 30 seconds'
});
```

### 4. Performance Optimization
- Use parallel test execution where safe
- Implement proper timeout values (not too short, not too long)
- Clean up resources immediately after use
- Use appropriate test categorization

## Troubleshooting

### Common Issues

#### 1. Docker Socket Permission Errors
```bash
# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock
# Or add user to docker group
sudo usermod -aG docker $USER
```

#### 2. Test Services Not Starting
```bash
# Check service logs
docker compose -f docker-compose.test.yml logs

# Restart services
docker compose -f docker-compose.test.yml restart

# Check port conflicts
netstat -tulpn | grep -E ':(5000|4954|5432)'
```

#### 3. Kubernetes Context Issues
```bash
# List available contexts
kubectl config get-contexts

# Set correct context
kubectl config use-context kind-containerization-assist

# Verify cluster access
kubectl cluster-info
```

#### 4. Test Timeouts
- Increase timeout values in test configuration
- Check system resource availability
- Verify service health before running tests
- Use `--detectOpenHandles` to find hanging processes

### Debug Mode
```bash
# Run with debug output
DEBUG=1 npm test -- --testPathPattern="integration/" --verbose

# Check for open handles
npm test -- --detectOpenHandles --testPathPattern="integration/"

# Run single test with detailed output  
npm test -- --testNamePattern="specific test" --verbose --no-coverage
```

### Performance Monitoring
```bash
# Monitor test execution time
time npm test -- --testPathPattern="integration/"

# Check resource usage during tests
docker stats

# Monitor service health
watch -n 2 'docker compose -f docker-compose.test.yml ps'
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      registry:
        image: registry:2
        ports:
          - 5000:5000
      
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Start test services
        run: docker compose -f docker-compose.test.yml up -d
        
      - name: Wait for services
        run: |
          timeout 60s bash -c 'until curl -f http://localhost:5000/v2/; do sleep 2; done'
          
      - name: Run integration tests
        run: npm run test:integration
        
      - name: Cleanup
        if: always()
        run: docker compose -f docker-compose.test.yml down -v
```

### Local Development Workflow
```bash
# Daily development cycle
docker compose -f docker-compose.test.yml up -d  # Start services
npm test -- --testPathPattern="integration/" --watch  # Run tests in watch mode

# Before commits
npm run validate:pr:fast  # Quick validation including integration tests
npm run validate:pr       # Full validation with coverage
```

## Performance Targets

### Execution Time Targets
- **Individual test**: < 30 seconds
- **Full docker workflow suite**: < 2 minutes  
- **All integration suites**: < 5 minutes
- **Complete test suite**: < 10 minutes

### Resource Usage
- **Memory**: Tests should not exceed 512MB peak usage
- **Disk**: Temporary resources cleaned up within 1GB total
- **Network**: Minimize external dependencies, use local services

## Extending the Framework

### Adding New Test Suites
1. Create test file in `test/integration/`
2. Use `describeWithEnvironment` for service detection
3. Implement proper cleanup with `IntegrationTestCleanup`
4. Add unique test ID generation and resource labeling
5. Document new requirements and setup steps

### Adding New Service Dependencies
1. Add service to `docker-compose.test.yml`
2. Update environment detector in `environment-detector.ts`
3. Add capability detection and fallback strategies
4. Update documentation and troubleshooting guide

---

*Team Delta Phase 3 - Integration Excellence*  
*Complete integration testing framework for containerization workflows*