# Testing Guide

This guide provides comprehensive information about the testing infrastructure, best practices, and procedures for the containerization-assist-js project.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)  
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Test Categories](#test-categories)
- [Performance Testing](#performance-testing)
- [Maintenance & Automation](#maintenance--automation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Overview

The project uses a comprehensive 4-phase testing approach:

- **Phase 1**: Foundation (Unit tests, infrastructure)
- **Phase 2**: Integration (Real infrastructure testing)
- **Phase 3**: E2E & Performance (Complex workflows, performance benchmarking)
- **Phase 4**: Maintenance & Polish (CI integration, automation, cleanup)

### Test Technology Stack

- **Test Framework**: Jest with TypeScript support
- **Test Structure**: Multi-project configuration (unit, integration, e2e)
- **Mock Framework**: Jest built-in mocking + custom factories
- **Infrastructure**: Docker, Kubernetes (Kind), Redis for integration tests
- **Performance**: Custom performance monitoring and baseline management
- **CI/CD**: GitHub Actions with comprehensive pipeline

## Test Structure

```
test/
├── unit/                 # Unit tests
│   ├── tools/           # Tool-specific unit tests  
│   ├── workflows/       # Workflow unit tests
│   ├── lib/             # Library unit tests
│   └── mcp/             # MCP-specific unit tests
├── integration/         # Integration tests
│   ├── workflows/       # End-to-end workflow tests
│   └── mcp-server-integration.test.ts
├── e2e/                 # End-to-end tests
│   ├── workflows/       # Complete user workflows
│   └── validation/      # Output validation tests
├── performance/         # Performance tests
│   ├── workflows/       # Performance benchmarks
│   └── helpers/         # Performance test utilities
├── fixtures/            # Test data and repositories
│   ├── repositories/    # Sample repository configurations
│   ├── expected-outputs/# Expected test outputs
│   └── complex/         # Complex test scenarios
├── helpers/             # Test utilities
├── mocks/               # Mock implementations
├── setup/               # Test setup and configuration
└── baselines/           # Performance and quality baselines
```

## Running Tests

### Basic Test Commands

```bash
# Run all tests
npm test

# Run by category
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests only  
npm run test:e2e              # End-to-end tests only

# Run by module
npm run test:tools            # Tool-specific tests
npm run test:workflows        # Workflow tests
npm run test:lib              # Library tests
npm run test:mcp              # MCP tests

# Coverage reports
npm run test:coverage         # Generate coverage report
npm run test:unit:coverage    # Unit test coverage only

# CI-optimized runs
npm run test:ci               # Full CI test suite
npm run test:ci:unit          # CI unit tests
npm run test:ci:integration   # CI integration tests
```

### Advanced Test Options

```bash
# Watch mode for development
npm run test:watch
npm run test:unit:watch

# Debug mode
npm run test:debug

# Quick runs with reduced timeouts
npm run test:unit:quick
npm run test:e2e:quick

# Clear Jest cache
npm run test:clear-cache
```

### Performance and Maintenance

```bash
# Performance monitoring
npm run test:performance:monitor    # Run performance benchmarks
npm run test:performance:baseline   # Update performance baselines

# Test maintenance
npm run test:maintenance           # Run test suite maintenance
npm run test:maintenance:auto      # Auto-update test data

# Phase validation
npm run test:validate:phase4       # Validate Phase 4 completion
```
