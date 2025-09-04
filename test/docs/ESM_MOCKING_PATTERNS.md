# ESM Mocking Patterns for Infrastructure Tests

## Executive Summary
This document outlines the successful ESM mocking patterns implemented by Team Alpha to fix infrastructure test failures. These patterns enable proper mocking of external dependencies in Jest when using ES modules.

## The Problem
- Jest's traditional `jest.mock()` doesn't work with ESM modules
- Tests were making real API calls to Docker and Kubernetes
- Module imports were being evaluated before mocks were set up
- This caused test failures, timeouts, and unpredictable behavior

## The Solution: `jest.unstable_mockModule()`

### Key Pattern
Use `jest.unstable_mockModule()` at the very top of test files, BEFORE any imports:

```typescript
// 1. Import Jest utilities first
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';

// 2. Mock external modules BEFORE any other imports
jest.unstable_mockModule('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn().mockImplementation(() => mockKubeConfig),
  CoreV1Api: jest.fn().mockImplementation(() => mockCoreV1Api),
  // ... other exports
}));

// 3. Import mocks
import * as mocks from '../../utils/mocks/kubernetes-mock';

// 4. Use dynamic imports for everything else
const { KubernetesClient } = await import('../../../src/infrastructure/kubernetes-client');
```

## Infrastructure-Specific Patterns

### Docker Client Mocking

```typescript
// Mock dockerode with default export
jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => dockerMocks.mockDockerode)
}));

// Mock tar-fs for build context
jest.unstable_mockModule('tar-fs', () => ({
  pack: dockerMocks.mockTarFs.pack
}));

// Mock Trivy scanner
jest.unstable_mockModule('../../../../src/infrastructure/scanners/trivy-scanner', () => ({
  TrivyScanner: jest.fn().mockImplementation(() => trivyMocks.mockTrivyScanner)
}));
```

### Kubernetes Client Mocking

```typescript
jest.unstable_mockModule('@kubernetes/client-node', () => {
  const { mockKubeConfig, mockCoreV1Api, mockAppsV1Api } = mocks;
  
  return {
    KubeConfig: jest.fn().mockImplementation(() => mockKubeConfig),
    CoreV1Api: jest.fn().mockImplementation(() => mockCoreV1Api),
    AppsV1Api: jest.fn().mockImplementation(() => mockAppsV1Api),
    CustomObjectsApi: jest.fn().mockImplementation(() => mockCustomObjectsApi),
  };
});
```

## Comprehensive Mock Structure

### File Organization
```
test/utils/
├── mocks/
│   ├── kubernetes-mock.ts    # Kubernetes client mocks
│   ├── docker-mock.ts        # Docker client mocks
│   └── trivy-mock.ts         # Trivy scanner mocks
└── mock-factories.ts         # Central mock registry
```

### Mock Module Structure

Each mock module should export:
1. Mock objects with Jest functions
2. Factory functions for creating mock data
3. Setup function to reset and configure mocks
4. Helper functions for common scenarios

Example:
```typescript
// kubernetes-mock.ts
export const mockKubeConfig = {
  loadFromDefault: jest.fn(),
  makeApiClient: jest.fn(),
  // ... other methods
};

export function createMockPodList(pods = []) {
  return {
    body: { items: pods },
    response: { statusCode: 200 }
  };
}

export function setupKubernetesMocks() {
  // Reset all mocks
  Object.values(mockKubeConfig).forEach(mock => {
    if (typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  // Set default behaviors
  mockKubeConfig.makeApiClient.mockImplementation((ApiType) => {
    if (ApiType.name === 'CoreV1Api') return mockCoreV1Api;
    // ... other API types
  });
}
```

## Best Practices

### 1. Mock Setup Order
- Always mock BEFORE importing the module under test
- Import mocks before dynamic imports
- Use dynamic imports for modules that depend on mocked modules

### 2. Mock Reset Pattern
```typescript
beforeEach(() => {
  setupDockerMocks();    // Reset Docker mocks
  setupKubernetesMocks(); // Reset K8s mocks
  setupTrivyMocks();     // Reset Trivy mocks
});

afterEach(() => {
  jest.clearAllMocks();
});
```

### 3. Realistic Mock Data
- Keep mock data minimal but realistic
- Include required fields that the code expects
- Use factory functions for complex objects

### 4. Error Scenario Testing
```typescript
// Simulate Docker connection failure
mockDockerode.ping.mockRejectedValue(new Error('Connection failed'));

// Simulate Kubernetes API error
mockCoreV1Api.listNamespace.mockRejectedValue(
  createMockError('Forbidden', 403)
);
```

### 5. Stream and Event Handling
For Docker operations that return streams:
```typescript
export class MockStream extends EventEmitter {
  pipe = jest.fn().mockReturnThis();
  
  constructor() {
    super();
    this.on = jest.fn().mockImplementation((event, handler) => {
      if (event === 'end') {
        process.nextTick(() => handler());
      }
      return super.on(event, handler);
    });
  }
}
```

## Common Issues and Solutions

### Issue 1: "Module does not provide export"
**Solution**: Ensure the mock module exports match the actual module's exports exactly, including default exports.

### Issue 2: Mock not being applied
**Solution**: Verify that `jest.unstable_mockModule()` is called BEFORE any imports.

### Issue 3: Tests timing out
**Solution**: Check that mocked async functions are properly resolving/rejecting.

### Issue 4: Flaky tests
**Solution**: Use `beforeEach` to reset mocks consistently, avoid shared state between tests.

## Migration Checklist

When converting a test file to ESM mocking:

- [ ] Move all `jest.mock()` calls to `jest.unstable_mockModule()`
- [ ] Place mock setup BEFORE any imports
- [ ] Convert static imports to dynamic imports for modules under test
- [ ] Create comprehensive mock modules in `test/utils/mocks/`
- [ ] Add setup functions to reset mocks between tests
- [ ] Test both success and error scenarios
- [ ] Verify no real API calls are made

## Results

### Before Implementation
- ~35 infrastructure test failures
- Tests making real API calls
- Timeouts and flaky behavior
- `jest.mock()` not working with ESM

### After Implementation
- Reduced failures to ~25 (significant improvement)
- No real API calls
- Consistent, fast test execution
- Reusable mock infrastructure

## Team Alpha Deliverables

1. ✅ Created comprehensive ESM mock modules:
   - `test/utils/mocks/kubernetes-mock.ts`
   - `test/utils/mocks/docker-mock.ts`
   - `test/utils/mocks/trivy-mock.ts`

2. ✅ Fixed test files with ESM mocking:
   - `test/unit/infrastructure/kubernetes-client.test.ts`
   - `test/unit/infrastructure/docker/docker-client.test.ts`

3. ✅ Updated mock registry:
   - Added `InfrastructureMockRegistry` to `mock-factories.ts`

4. ✅ Documented patterns (this document)

## Next Steps for Other Teams

Teams can use these patterns and mock modules as a foundation for fixing other test failures:

1. **Team Beta**: Apply patterns to service layer tests
2. **Team Gamma**: Use for integration test setup
3. **Team Delta**: Reference for domain/schema tests
4. **Team Echo**: Incorporate into shared mock registry

## References

- [Jest ESM Documentation](https://jestjs.io/docs/ecmascript-modules)
- [Node.js ESM Support](https://nodejs.org/api/esm.html)
- Project's `jest.config.js` for ESM configuration