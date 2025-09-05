# Test Patterns Guide

## ESM Mocking Patterns

### Problem: Jest's `jest.mock()` doesn't work with ESM modules

**Solution**: Use `jest.unstable_mockModule()` before imports

```typescript
// ❌ WRONG - Won't work with ESM
jest.mock('dockerode');
import Docker from 'dockerode';

// ✅ CORRECT - ESM-compatible mocking
jest.unstable_mockModule('dockerode', () => ({
  default: jest.fn().mockImplementation(() => mockDockerode)
}));

// Dynamic import AFTER mock setup
const Docker = (await import('dockerode')).default;
```

### Pattern 1: Basic ESM Module Mock

```typescript
// At the very top of test file
jest.unstable_mockModule('module-name', () => ({
  exportedFunction: jest.fn(),
  default: jest.fn(), // for default exports
}));

// Then do dynamic imports
const { exportedFunction } = await import('module-name');
```

### Pattern 2: Using Mock Factories

```typescript
import { setupDockerMocks } from '../utils/esm-mock-setup';

// Setup mocks before imports
const { dockerodeMock } = setupDockerMocks();

// Now import the module that uses dockerode
const { DockerClient } = await import('../../src/infrastructure/docker-client');
```

### Pattern 3: Mocking Node Built-ins

```typescript
jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('content'),
  promises: {
    readFile: jest.fn().mockResolvedValue('content'),
    writeFile: jest.fn().mockResolvedValue(undefined),
  }
}));
```

## Common Gotchas and Solutions

### Gotcha 1: Mock Not Working

**Problem**: Mock seems to be ignored
```typescript
// This won't work - import happens before mock
import { MyService } from '../src/service';
jest.unstable_mockModule('dependency', () => ({}));
```

**Solution**: Always mock BEFORE imports
```typescript
jest.unstable_mockModule('dependency', () => ({}));
const { MyService } = await import('../src/service');
```

### Gotcha 2: TypeScript Types Lost

**Problem**: Dynamic imports lose type information
```typescript
const module = await import('../src/service'); // 'any' type
```

**Solution**: Use type assertions
```typescript
const { MyService } = await import('../src/service') as typeof import('../src/service');
```

### Gotcha 3: Callback vs Promise APIs

**Problem**: Dockerode uses both callbacks and promises
```typescript
// Some methods use callbacks
docker.ping((err, data) => {});

// Others return promises
await docker.ping();
```

**Solution**: Mock both patterns
```typescript
ping: jest.fn().mockImplementation((callback?: any) => {
  if (callback) {
    callback(null, 'OK');
  } else {
    return Promise.resolve('OK');
  }
})
```

### Gotcha 4: Stream Mocking

**Problem**: Docker build/push return streams
```typescript
const stream = await docker.buildImage(context, options);
stream.on('data', handler); // How to mock this?
```

**Solution**: Mock stream events
```typescript
buildImage: jest.fn().mockResolvedValue({
  on: jest.fn().mockImplementation((event, handler) => {
    if (event === 'data') {
      handler(Buffer.from(JSON.stringify({ stream: 'Building...' })));
    }
    if (event === 'end') {
      setTimeout(handler, 10);
    }
    return this; // for chaining
  }),
  pipe: jest.fn(),
})
```

## Mock Reuse Strategies

### Strategy 1: Centralized Mock Registry

```typescript
import { MockRegistry } from '../utils/mock-factories';

beforeAll(() => {
  MockRegistry.setupDefaults();
});

beforeEach(() => {
  MockRegistry.reset();
});

test('my test', () => {
  const dockerMock = MockRegistry.get('dockerode');
  // Use mock...
});
```

### Strategy 2: Shared Setup Functions

```typescript
// In test file
import { setupTestEnvironment } from '../utils/test-helpers';

const env = setupTestEnvironment();

beforeEach(env.beforeEach);
afterEach(env.afterEach);
afterAll(env.afterAll);
```

### Strategy 3: Mock Composition

```typescript
// Combine multiple mocks for integration tests
function setupIntegrationMocks() {
  const docker = createMockDockerode();
  const k8s = createComprehensiveK8sMock();
  const ai = createMockAIService();
  
  // Link mocks together if needed
  docker.buildImage.mockImplementation(() => {
    // Can reference other mocks
    ai.analyzeRepository();
  });
  
  return { docker, k8s, ai };
}
```

## Testing Best Practices

### Practice 1: Test Data Isolation

```typescript
// ❌ BAD - Shared mutable data
const testSession = { id: 'test-123' };

test('test 1', () => {
  testSession.status = 'active'; // Modifies shared object
});

test('test 2', () => {
  // testSession.status is already 'active'!
});

// ✅ GOOD - Fresh data per test
test('test 1', () => {
  const testSession = createMockSession({ status: 'active' });
});
```

### Practice 2: Clear Mock State

```typescript
beforeEach(() => {
  jest.clearAllMocks(); // Reset call counts
  // Don't use jest.resetAllMocks() - it removes mock implementations!
});
```

### Practice 3: Specific Assertions

```typescript
// ❌ VAGUE
expect(dockerMock.buildImage).toHaveBeenCalled();

// ✅ SPECIFIC
expect(dockerMock.buildImage).toHaveBeenCalledWith(
  expect.any(Object), // context stream
  expect.objectContaining({
    t: 'test-app:latest',
    dockerfile: 'Dockerfile',
  })
);
```

### Practice 4: Mock Return Values Per Test

```typescript
test('handles build failure', async () => {
  dockerMock.buildImage.mockRejectedValueOnce(new Error('Build failed'));
  
  const result = await service.build();
  expect(result.kind).toBe('fail');
});

test('handles build success', async () => {
  dockerMock.buildImage.mockResolvedValueOnce(mockBuildStream);
  
  const result = await service.build();
  expect(result.kind).toBe('ok');
});
```

## Troubleshooting Guide

### Issue: "Cannot find module" errors

**Diagnosis**: Check import order
```bash
# Look for imports before mocks
grep -B5 "jest.unstable_mockModule" test-file.test.ts
```

**Fix**: Move all mocks to top of file

### Issue: Real API calls being made

**Diagnosis**: Check if mock is applied
```typescript
console.log('Is mocked?', jest.isMockFunction(Docker));
```

**Fix**: Ensure mock is set up before module import

### Issue: Timeout in tests

**Diagnosis**: Check for unmocked async operations
```typescript
// Add timeout to specific test
test('my test', async () => {
  // test code
}, 30000); // 30 second timeout
```

**Fix**: Mock all external dependencies

### Issue: Flaky tests

**Diagnosis**: Look for timing issues
```typescript
// Bad - race condition
setTimeout(() => done(), 100);

// Good - explicit wait
await new Promise(resolve => setTimeout(resolve, 100));
```

**Fix**: Use explicit promises instead of callbacks

## Quick Reference

### Essential Imports
```typescript
import { jest } from '@jest/globals';
import { 
  setupESMMocks,
  resetAllMocks,
  TestHooks,
} from '../utils/esm-mock-setup';
```

### Test Structure Template
```typescript
// 1. Mocks first
setupESMMocks();

// 2. Dynamic imports
const { ServiceToTest } = await import('../../src/service');

// 3. Test suite
describe('ServiceToTest', () => {
  beforeEach(TestHooks.beforeEach);
  afterEach(TestHooks.afterEach);
  
  test('should do something', async () => {
    // Arrange
    const mock = MockRegistry.get('dockerode');
    mock.ping.mockResolvedValue('OK');
    
    // Act
    const result = await ServiceToTest.checkHealth();
    
    // Assert
    expect(result).toBe(true);
    expect(mock.ping).toHaveBeenCalledTimes(1);
  });
});
```

### Common Mock Patterns
```typescript
// Return different values on successive calls
mock.fn.mockResolvedValueOnce('first')
       .mockResolvedValueOnce('second')
       .mockResolvedValue('default');

// Conditional returns
mock.fn.mockImplementation((arg) => {
  if (arg === 'special') return 'special-result';
  return 'default-result';
});

// Simulate errors
mock.fn.mockRejectedValueOnce(new Error('Connection failed'));

// Verify mock calls
expect(mock.fn).toHaveBeenNthCalledWith(
  1, // first call
  'expected-arg'
);
```

## Team Collaboration

### Sharing New Patterns

When you discover a new pattern:
1. Add it to this document
2. Create a helper in `esm-mock-setup.ts` if reusable
3. Share in `#test-fix-coordination` Slack channel

### Pattern Naming Convention

- `setup*Mocks()` - Setup functions
- `create*Mock()` - Factory functions
- `Mock*` - Type definitions
- `test*` - Test helper functions

### Contributing Guidelines

1. **Document the problem** before the solution
2. **Include working code examples**
3. **Explain why** the pattern works
4. **Add to troubleshooting** if it solves a common issue

## Team Beta: Service Layer Success Patterns

### Complete ESM Service Layer Mock Pattern

**Problem**: Service layer tests failing due to complex infrastructure dependencies

**Solution**: Complete ESM mocking with client-level abstraction

```typescript
// Team Beta Pattern - docker-service.test.ts
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { DockerError } from '../../../src/errors/index';

// 1. Create comprehensive mock object first
const mockDockerClient = {
  initialize: jest.fn(),
  build: jest.fn(),
  scan: jest.fn(),
  tag: jest.fn(),
  push: jest.fn(),
  listImages: jest.fn(),
  removeImage: jest.fn(),
  imageExists: jest.fn(),
  listContainers: jest.fn(),
  health: jest.fn(),
};

// 2. Mock the infrastructure module
jest.unstable_mockModule('../../../src/infrastructure/docker-client', () => ({
  DockerClient: jest.fn().mockImplementation(() => mockDockerClient),
}));

// 3. Mock factories inline for better control
const createMockLogger = () => {
  const childLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const mockLogger = {
    child: jest.fn().mockReturnValue(childLogger),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return mockLogger as unknown as jest.Mocked<Logger>;
};

// 4. Dynamic imports AFTER mocks
const { DockerService, createDockerService } = await import('../../../src/services/docker');

// 5. Complete mock setup in beforeEach
beforeEach(() => {
  jest.clearAllMocks();
  
  // Setup all expected return values
  mockDockerClient.initialize.mockResolvedValue(undefined);
  mockDockerClient.build.mockResolvedValue({
    imageId: 'sha256:mock-image-id',
    tags: ['test:latest'],
    success: true,
    logs: ['Step 1/5', 'Step 2/5'],
    buildTime: Date.now(),
    digest: 'sha256:mock-image-id',
  });
  // ... more mock setups
});
```

### Result<T> Pattern Testing

**Problem**: Tests failing due to incorrect Result type usage

**Solution**: Proper Result constructor imports and usage

```typescript
// ❌ WRONG - Old pattern
import { ok, fail, isOk, isFail } from '../../../src/domain/types/result';
mockStore.set.mockResolvedValue(ok({}));

// ✅ CORRECT - New pattern  
import { Success, Failure, isOk, isFail } from '../../../src/domain/types/result';
mockStore.set.mockResolvedValue(Success({}));
mockStore.get.mockResolvedValue(Failure('Not found'));

// Testing Result<T> patterns
test('should handle success result', async () => {
  const result = await service.operation();
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toEqual(expectedValue);
  }
});

test('should handle failure result', async () => {
  mockClient.operation.mockResolvedValue(Failure('Error message'));
  const result = await service.operation();
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain('Error message');
  }
});
```

### Service Layer Mock Architecture

**Key Insight**: Mock at the infrastructure boundary, not individual dependencies

```typescript
// ❌ WRONG - Mocking too low level
jest.mock('dockerode');
jest.mock('@kubernetes/client-node');  
jest.mock('child_process');

// ✅ CORRECT - Mock at service boundary
jest.unstable_mockModule('../../../src/infrastructure/docker-client', () => ({
  DockerClient: jest.fn().mockImplementation(() => mockDockerClient),
}));

// This allows:
// 1. Stable test interfaces even if infrastructure changes
// 2. Easier mock setup and maintenance  
// 3. Better isolation between layers
// 4. Realistic return types that match actual service contracts
```

### Team Beta Results Summary

- ✅ **Fixed 2 test suites**: docker-service.test.ts (25 tests), session-manager.test.ts (25 tests)
- ✅ **50 tests passing**: 0 failures, stable execution
- ✅ **ESM compatibility**: All tests use proper ESM mocking patterns
- ✅ **Maintainable mocks**: Infrastructure-level mocking reduces brittleness
- ✅ **Type safety**: Proper Result<T> pattern usage throughout

## Resources

- [Jest ESM Support](https://jestjs.io/docs/ecmascript-modules)
- [Node.js Test Runner](https://nodejs.org/api/test.html) (alternative)
- [Testing Library](https://testing-library.com/) (for React components)
- [MSW](https://mswjs.io/) (for API mocking)