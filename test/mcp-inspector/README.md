# Team Gamma - MCP Inspector Testing Infrastructure

## Overview
This directory contains the comprehensive testing infrastructure for MCP (Model Context Protocol) tool validation, performance benchmarking, and integration testing.

## Quick Start

### Basic Usage
```bash
# Run all tests
npm run test:mcp

# Run only tool validation tests  
npm run test:mcp:tools

# Run in watch mode for development
npm run test:mcp:watch
```

### Manual MCP Inspector
```bash
# Interactive Inspector with real server
npm run mcp:inspect

# Interactive Inspector with mock server
npm run mcp:inspect:mock
```

## Framework Components

### Test Runner (`infrastructure/test-runner.ts`)
Core testing framework that:
- Connects to MCP server via SDK
- Manages test execution and reporting
- Provides performance metrics
- Supports parallel execution for load testing

### Test Suites (`suites/`)
- **tool-validation**: Basic tool functionality tests
- **resource-management**: Resource system validation (future)
- **sampling-validation**: Sampling algorithm tests (future)
- **integration-flows**: End-to-end workflows (future)
- **load-testing**: Concurrent operations (future)

## Current Test Coverage

### ✅ Working Test Suites

#### Tool Validation (3/4 tests passing - 75%)
1. **ops-status-tool** ✅ - Ops tool status operation validation
2. **analyze-repository-basic** ✅ - Repository analysis with test fixture  
3. **tool-response-time-validation** ✅ - Performance baseline validation
4. **ops-ping-responds** ⚠️ - Response format needs adjustment

#### Resource Management (4/5 tests passing - 80%)
1. **resource-size-limits** ✅ - Validates 5MB resource size limits
2. **resource-mime-types** ✅ - MIME type validation for resources
3. **resource-caching-behavior** ✅ - Basic caching validation
4. **resource-uri-scheme-validation** ✅ - URI scheme format validation
5. **resource-accessibility** ⚠️ - Resource access validation (tool interface issue)

#### Load Testing (5/5 tests passing - 100%)
1. **concurrent-tool-calls** ✅ - 10 concurrent operations (7ms)
2. **concurrent-analysis-operations** ✅ - 5 concurrent analysis (9ms)
3. **memory-leak-detection** ✅ - 20 iterations memory stability (1017ms)
4. **stress-test-rapid-requests** ✅ - 50 rapid requests (5ms)
5. **resource-intensive-load-test** ✅ - 3 heavy operations (1ms)

#### Sampling Validation (1/5 tests passing - 20%)
1. **sampling-error-handling** ✅ - Error handling validation
2. **dockerfile-candidate-generation** ⚠️ - Tool interface needs adjustment
3. **dockerfile-scoring-determinism** ⚠️ - Tool interface needs adjustment  
4. **sampling-performance-benchmark** ⚠️ - Tool interface needs adjustment
5. **multi-candidate-validation** ⚠️ - Tool interface needs adjustment

### 📊 Overall Status: 13/19 tests passing (68%)

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Tool Response Time | < 100ms | ~2ms ✅ |
| Memory per Operation | < 100KB | ~106KB ⚠️ |
| Repository Analysis | < 30s | ~4ms ✅ |

## Team Gamma Development Plan

### Week 1-2 ✅ COMPLETE
- [x] MCP Inspector environment setup
- [x] Basic test runner framework
- [x] Tool validation test suite
- [x] CI/CD npm scripts

### Week 3-4 (Next Steps)
- [ ] Sampling algorithm validation tests
- [ ] Resource management tests
- [ ] Enhanced performance benchmarking
- [ ] Edge case and error scenario coverage

### Week 5-6 (Future)
- [ ] End-to-end integration tests
- [ ] Load testing with concurrent operations
- [ ] Performance regression detection
- [ ] Complete documentation and training

## Adding New Tests

### 1. Create Test Function
```typescript
// test/mcp-inspector/suites/[category]/my-new-tests.ts
export const createMyTests = (testRunner: MCPTestRunner): TestCase[] => [
  {
    name: 'my-test-name',
    category: 'tool-validation',
    description: 'What this test validates',
    execute: async () => {
      const client = testRunner.getClient();
      const result = await client.callTool({
        name: 'tool-name',
        arguments: { /* ... */ }
      });
      
      return {
        success: !result.isError,
        duration: performance.now() - start,
        message: result.isError ? 'Error' : 'Success'
      };
    }
  }
];
```

### 2. Register Tests
```typescript
// test/mcp-inspector/runner.ts
import { createMyTests } from './suites/[category]/my-new-tests.js';

const myTests = createMyTests(testRunner);
myTests.forEach(test => testRunner.register(test));
```

## Available NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run test:mcp` | Run all MCP tests |
| `npm run test:mcp:setup` | Verify framework setup |
| `npm run test:mcp:tools` | Tool validation only |
| `npm run test:mcp:sampling` | Sampling tests (future) |
| `npm run test:mcp:integration` | Integration tests (future) |
| `npm run test:mcp:performance` | Performance tests (future) |
| `npm run test:mcp:watch` | Watch mode for development |

## Integration with Other Teams

### Team Alpha (Core Infrastructure)
- Tests resource management APIs
- Validates event emitter functionality
- Performance impact measurement

### Team Beta (Sampling & Scoring)
- Algorithm determinism validation
- Candidate generation testing
- Performance benchmarking

### Team Delta (Tools Enhancement) 
- Enhanced tool behavior validation
- Resource link integration testing
- Regression detection

### Team Epsilon (Integration)
- End-to-end workflow validation
- Deployment verification testing
- User journey testing

## Future Enhancements

### Advanced Testing Features
- [ ] Visual regression testing for resources
- [ ] Memory leak detection
- [ ] Network failure simulation
- [ ] Security vulnerability testing
- [ ] Cross-platform compatibility testing

### Performance Monitoring
- [ ] Real-time performance dashboards
- [ ] Automated performance alerts
- [ ] Historical trend analysis
- [ ] A/B testing framework

---

**Team Gamma Lead**: Contact for questions about testing infrastructure
**Last Updated**: Initial implementation complete
**Status**: ✅ Ready for parallel development with other teams