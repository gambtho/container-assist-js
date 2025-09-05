# Integration Testing Guide

This guide covers the comprehensive integration testing system for the containerization assistant, including environment detection, fallback strategies, and CI/CD integration.

## Quick Start

### Auto-Detection and Testing
```bash
# Diagnose your environment
npm run diagnose:integration

# Run tests automatically based on available services  
npm run test:integration:auto

# Start all test services
npm run setup:integration
```

### Manual Service Testing
```bash
# Test specific services
npm run test:integration:docker    # Docker workflow tests
npm run test:integration:registry  # Registry push/pull tests
npm run test:integration:trivy     # Security scanning tests
npm run test:integration:k8s       # Kubernetes deployment tests
```

## Architecture Overview

### Environment Detection System

The integration testing system uses a sophisticated environment detection mechanism that automatically identifies available services and selects appropriate testing strategies.

```typescript
// Environment capabilities are detected automatically
const capabilities = await detectEnvironment();

// Tests adapt based on what's available
if (capabilities.docker.available) {
  // Run real Docker tests
} else {
  // Use mocks or skip
}
```

#### Supported Services
- **Docker**: Container building, tagging, scanning
- **Registry**: Image push/pull operations
- **Trivy**: Security vulnerability scanning
- **Kubernetes**: Deployment and service management
- **AI**: Workflow integration testing

### Fallback Strategy System

Each service has multiple implementation strategies:

1. **Docker Testing**
   - ✅ **Native**: Uses local Docker daemon
   - 🔄 **Mock**: Simulated responses for CI

2. **Security Scanning**
   - ✅ **Binary**: Uses installed Trivy binary
   - 🔄 **Container**: Uses Trivy Docker image
   - 🎭 **Mock**: Realistic vulnerability simulation

3. **Registry Operations**
   - ✅ **Local Registry**: Test registry on localhost:5000
   - 🎭 **Mock**: Simulated push/pull operations

4. **Kubernetes**
   - ✅ **Local Cluster**: kind, minikube, Docker Desktop
   - ☁️ **Remote**: Connected K8s cluster
   - 🎭 **Mock**: Simulated deployments and services

## Environment Setup

### Prerequisites

#### Docker (Required for most tests)
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verify installation
docker --version
docker info
```

#### Test Registry (Optional but recommended)
```bash
# Quick setup
npm run registry:start

# Manual setup
./scripts/setup-test-registry.sh

# Or use Docker Compose
docker-compose -f docker-compose.test.yml up -d test-registry
```

#### Trivy Security Scanner (Optional)
```bash
# Install Trivy (Linux)
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb generic main" | sudo tee -a /etc/apt/sources.list
sudo apt-get update && sudo apt-get install trivy

# Verify installation
trivy --version
```

#### Kubernetes (Optional)
```bash
# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/

# Setup local cluster (choose one)
# Kind
kind create cluster

# Minikube  
minikube start

# Docker Desktop K8s (enable in settings)
```

### Environment Configuration

Create `.env` file with your specific settings:

```bash
# Docker Configuration
DOCKER_SOCKET=/var/run/docker.sock

# Registry Configuration  
TEST_REGISTRY_HOST=localhost:5000
USE_LOCAL_REGISTRY=true
DOCKER_REGISTRY_INSECURE=true

# Integration Test Settings
SKIP_INTEGRATION_TESTS=false
DOCKER_AVAILABLE=true
REGISTRY_AVAILABLE=true
TRIVY_AVAILABLE=true

# CI Environment (auto-detected)
CI=false
```

## Test Execution

### Automated Testing

The system automatically detects your environment and runs appropriate tests:

```bash
# Auto-detect and run all possible tests
npm run test:integration:auto

# With coverage
npm run test:integration:auto -- --coverage

# Watch mode for development
npm run test:integration:auto -- --watch
```

### Service-Specific Testing

Run tests for specific services:

```bash
# Docker workflow tests (requires Docker)
npm run test:integration:docker

# Registry operations (requires Docker + Registry)  
npm run test:integration:registry

# Security scanning (Trivy binary, container, or mock)
npm run test:integration:trivy

# Kubernetes deployments (cluster, kind, minikube, or mock)
npm run test:integration:k8s
```

### Manual Test Selection

Run specific test files:

```bash
# Single test file
npm test -- test/integration/docker-workflow-integration.test.ts

# Pattern matching
npm test -- --testMatch="**/integration/**/docker*.test.ts"

# With specific timeout
npm test -- --testTimeout=180000 test/integration/trivy-scanner-integration.test.ts
```

## Writing Integration Tests

### Using the Standard Test Framework

```typescript
import { 
  describeWithEnvironment,
  createTestLogger,
  generateTestId,
  IntegrationTestCleanup
} from '../utils/integration-test-utils';

describeWithEnvironment(
  'My Service Integration Tests',
  {
    requirements: ['docker', 'registry'], // Required services
    timeout: 10000, // Detection timeout
    skipMessage: 'Custom skip message'
  },
  (testEnv) => {
    let cleanup: IntegrationTestCleanup;
    let testId: string;
    
    beforeAll(async () => {
      cleanup = new IntegrationTestCleanup();
      testId = generateTestId();
      
      // testEnv.capabilities contains detected services
      console.log('Docker version:', testEnv.capabilities.docker.version);
    });

    beforeEach(async () => {
      // Setup for each test
      const tempDir = await createTestContext('my-test');
      cleanup.addTempDir(tempDir);
    });

    afterAll(async () => {
      await cleanup.cleanup();
    });

    test('should do something with available services', async () => {
      // Your test implementation
      expect(testEnv.capabilities.docker.available).toBe(true);
    });
  }
);
```

### Environment-Aware Testing

Tests automatically adapt to available services:

```typescript
test('should scan with appropriate scanner', async () => {
  const scannerFactory = new TrivyScannerFactory(logger);
  await scannerFactory.initialize();
  
  const result = await scannerFactory.scan('alpine:latest');
  
  // Works with binary, container, or mock scanner
  expect(result.kind).toBe('ok');
  expect(result.value.vulnerabilities).toBeDefined();
});
```

### Resource Cleanup

Always use the cleanup system to avoid resource leaks:

```typescript
afterEach(async () => {
  // Cleanup Docker images
  cleanup.addCleanupTask(async () => {
    if (imageId && dockerService) {
      await dockerService.removeImage(imageId, { force: true });
    }
  });
  
  // Cleanup Kubernetes resources
  cleanup.addCleanupTask(async () => {
    await k8sClient.deleteDeployment(deploymentName);
  });
});
```

## CI/CD Integration

### GitHub Actions Configuration

The system works seamlessly in CI environments:

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      registry:
        image: registry:2
        ports:
          - 5000:5000

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v2
        
      - name: Diagnose test environment
        run: npm run diagnose:integration
        
      - name: Run integration tests
        run: npm run test:integration:auto
        env:
          TEST_REGISTRY_HOST: localhost:5000
          USE_LOCAL_REGISTRY: true
```

### Environment Variables for CI

```bash
# CI Detection (automatic)
CI=true
GITHUB_ACTIONS=true

# Service Configuration
SKIP_INTEGRATION_TESTS=false  # Enable integration tests
DOCKER_AVAILABLE=true         # Docker available in CI
USE_LOCAL_REGISTRY=true       # Use CI registry service
TEST_REGISTRY_HOST=localhost:5000

# Timeouts (CI often slower)
TEST_TIMEOUT=300000  # 5 minutes
```

## Development Workflow

### Day-to-Day Development

1. **Environment Setup** (once)
   ```bash
   npm run setup:integration
   npm run diagnose:integration
   ```

2. **Development Loop**
   ```bash
   # Start watching tests
   npm run test:integration:auto -- --watch
   
   # Make changes to code
   
   # Tests re-run automatically with available services
   ```

3. **Pre-commit Validation**
   ```bash
   npm run test:integration:auto
   npm run validate:pr:fast
   ```

### Debugging Test Issues

#### Environment Issues
```bash
# Detailed environment report
npm run diagnose:integration

# Check Docker connectivity
docker info
docker ps

# Test registry connectivity
curl http://localhost:5000/v2/

# Check Kubernetes
kubectl cluster-info
kubectl get nodes
```

#### Test Failures
```bash
# Run with verbose output
npm test -- --verbose test/integration/problematic-test.test.ts

# Check logs from test containers
docker logs test-registry

# Cleanup stuck resources
npm run teardown:integration
```

#### Performance Issues
```bash
# Run single test with profiling
npm test -- --testTimeout=300000 --verbose specific-test.test.ts

# Check system resources
docker system df
docker image prune
```

## Service Management

### Local Registry

```bash
# Start registry
npm run registry:start
# or
./scripts/setup-test-registry.sh

# Check registry health
curl http://localhost:5000/v2/
curl http://localhost:5000/v2/_catalog

# Stop registry
npm run registry:stop
# or  
./scripts/teardown-test-registry.sh
```

### Test Services (Docker Compose)

```bash
# Start all test services
docker-compose -f docker-compose.test.yml up -d

# Check service status
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs

# Stop services
docker-compose -f docker-compose.test.yml down
```

### Resource Monitoring

```bash
# Monitor Docker resources
docker system df
docker container ls -a
docker image ls

# Clean up test artifacts
docker system prune -f
docker volume prune -f
```

## Troubleshooting

### Common Issues

#### "Docker daemon not accessible"
```bash
# Check Docker is running
sudo systemctl status docker

# Check user permissions
sudo usermod -aG docker $USER
# Logout/login required

# Check socket permissions
ls -la /var/run/docker.sock
```

#### "Registry not available"
```bash
# Start registry
npm run registry:start

# Check port availability
lsof -i :5000

# Test connectivity
curl -v http://localhost:5000/v2/
```

#### "Trivy not found"
```bash
# Check Trivy installation
which trivy
trivy version

# Use container fallback (automatic)
docker run --rm aquasec/trivy:latest version
```

#### "Kubernetes cluster not accessible"
```bash
# Check kubectl configuration
kubectl config current-context
kubectl cluster-info

# Start local cluster
kind create cluster
# or
minikube start
```

### Performance Optimization

#### Reduce Test Execution Time
```bash
# Use faster test timeouts for development
export TEST_TIMEOUT=30000

# Skip slow external scans in development
export SKIP_EXTERNAL_SCANS=true

# Use parallel test execution
npm test -- --maxWorkers=4
```

#### Resource Management
```bash
# Clean up before running tests
./scripts/cleanup-test-resources.sh

# Monitor resource usage during tests
docker stats
```

## Advanced Usage

### Custom Scanner Strategies

Create custom scanner implementations:

```typescript
class CustomSecurityScanner implements ScannerStrategy {
  name = 'custom';
  available = true;

  async scan(image: string): Promise<Result<DockerScanResult>> {
    // Custom scanning logic
    return Success(customScanResult);
  }

  getInfo() {
    return { available: true, type: 'custom', version: '1.0.0' };
  }
}

// Register with factory
scannerFactory.addStrategy(new CustomSecurityScanner());
```

### Environment-Specific Configuration

Create environment-specific test configurations:

```typescript
// test/config/environments/development.ts
export const developmentConfig = {
  timeouts: {
    default: 30000,
    docker: 60000,
    scan: 120000
  },
  skipExternalDeps: true,
  useLocalServices: true
};
```

### Custom Mock Services

Implement mock services for testing:

```typescript
class MockDockerService {
  async buildImage(options: BuildOptions): Promise<BuildResult> {
    // Mock implementation
    return {
      success: true,
      imageId: 'mock-image-id',
      tags: options.tags
    };
  }
}
```

## Best Practices

### Test Design
- ✅ Use environment detection for adaptive tests
- ✅ Always implement cleanup in afterEach/afterAll
- ✅ Use unique identifiers to avoid conflicts
- ✅ Test both success and failure scenarios
- ❌ Don't assume specific services are available
- ❌ Don't leave test resources behind
- ❌ Don't use hardcoded timeouts

### Resource Management
- ✅ Clean up Docker images after tests
- ✅ Use temporary directories for test files
- ✅ Remove Kubernetes resources after tests
- ✅ Monitor and limit resource consumption

### CI/CD Integration
- ✅ Use service containers for external dependencies
- ✅ Set appropriate timeouts for CI environments
- ✅ Cache Docker layers when possible
- ✅ Run diagnostics before tests

### Performance
- ✅ Use smaller base images for testing
- ✅ Parallel test execution where safe
- ✅ Skip expensive operations in fast test modes
- ✅ Reuse resources when possible

## Maintenance

### Regular Tasks

#### Weekly
- Update base images used in tests
- Clean up accumulated test artifacts
- Review and update timeouts based on CI performance

#### Monthly  
- Update security scanner databases
- Review and optimize slow-running tests
- Update documentation with new patterns

#### Quarterly
- Review and update external service dependencies
- Performance analysis of test suite
- Update CI/CD configurations

### Monitoring

Set up monitoring for:
- Test execution times
- Resource usage patterns
- CI/CD success rates
- External service availability

This integration testing system provides comprehensive coverage while being resilient to varying environments and external dependencies. It automatically adapts to what's available and provides meaningful fallbacks when services are unavailable.

For more specific usage examples, see the individual test files in `test/integration/`.