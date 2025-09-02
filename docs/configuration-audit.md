# Configuration Audit Report

## Executive Summary

Analysis of the js-mcp codebase reveals **17 different configuration interfaces** and **52 environment variable references** scattered across multiple files. This fragmentation creates maintenance overhead, inconsistent patterns, and potential configuration conflicts.

## Current Configuration Landscape

### Configuration Files & Interfaces

#### 1. Main Service Configuration
- **File**: `src/service/config/config.ts`
- **Interfaces**: `ConfigOptions`, `Config` class
- **Properties**: 18 properties (nodeEnv, logLevel, storePath, workspaceDir, etc.)
- **Environment Variables**: 15 env vars parsed
- **Usage**: Main service configuration with singleton export

#### 2. Tool Configuration  
- **File**: `src/service/tools/config.ts`
- **Interfaces**: `ToolConfig`, `ToolSchema`
- **Properties**: Tool chain definitions (396 lines)
- **Purpose**: MCP tool definitions and schemas

#### 3. Dependencies Configuration
- **File**: `src/service/interfaces.ts:174-202`
- **Interface**: `DependenciesConfig`
- **Properties**: Nested config for session, docker, kubernetes, AI, features, logging
- **Usage**: Dependency injection configuration

#### 4. Store Configuration
- **File**: `src/infrastructure/core/persistence/store-factory.ts`
- **Interface**: `StoreConfig`
- **Properties**: Store type, cleanup interval
- **Usage**: Session store configuration

### Additional Configuration Interfaces

| File | Interface | Purpose | Properties |
|------|-----------|---------|------------|
| `src/domain/types/build.ts` | `BuildConfiguration` | Build process config | Build options and settings |
| `src/domain/types/scanning.ts` | `ScannerConfig` | Security scanner config | Scanner type, options |
| `src/infrastructure/external/docker/docker-service.ts` | `ServiceConfig` | Docker service config | Service-specific settings |
| `src/infrastructure/external/docker/client.ts` | `DockerConfig` | Docker client config | Connection settings |
| `src/infrastructure/external/cli/executor.ts` | `CommandConfig` | CLI command config | Execution settings |
| `src/infrastructure/ai/factory.ts` | `SamplerConfig` | AI sampler config | AI service configuration |
| `src/infrastructure/core/logger.ts` | `LoggerConfig` | Logger config | Logging configuration |
| `src/service/session/manager.ts` | `SessionServiceConfig` | Session management | Session-specific config |
| `src/service/workflow/orchestrator.ts` | `WorkflowConfig` | Workflow config | Orchestration settings |

## Environment Variable Usage Analysis

### Total Usage: 52 References
- **Primary Files**: `config.ts` (15 vars), `factory.ts` (12 vars), `cli.ts` (6 vars)
- **Patterns**: Direct `process.env.VAR` access throughout codebase
- **Inconsistencies**: Mixed naming conventions, no central validation

### Environment Variable Categories

#### Core Application (15 variables)
```env
NODE_ENV=development|production|test
LOG_LEVEL=error|warn|info|debug|trace
MCP_STORE_PATH=/path/to/sessions.db
SESSION_TTL=24h
MAX_SESSIONS=100
WORKSPACE_DIR=/tmp/container-kit-workspace
```

#### Docker Configuration (8 variables)  
```env
DOCKER_SOCKET=/var/run/docker.sock
DOCKER_REGISTRY=localhost:5000
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_API_VERSION=1.41
```

#### Kubernetes Configuration (4 variables)
```env
KUBECONFIG=~/.kube/config
K8S_NAMESPACE=default
K8S_CONTEXT=current-context
K8S_TIMEOUT=30
```

#### AI/ML Configuration (12 variables)
```env
AI_API_KEY=key
AI_MODEL=claude-3-haiku
AI_BASE_URL=https://api.anthropic.com
MCP_SAMPLER_MODE=auto|mock|real
MCP_TEMPLATE_DIR=./prompts/templates
MCP_CACHE_ENABLED=true
MCP_RETRY_ATTEMPTS=3
MCP_RETRY_DELAY_MS=1000
MOCK_RESPONSES_DIR=/path/to/mocks
MOCK_DETERMINISTIC=false
MOCK_SIMULATE_LATENCY=true
MOCK_ERROR_RATE=0.0
```

#### Java/Build Configuration (5 variables)
```env
DEFAULT_JAVA_VERSION=17
DEFAULT_JVM_HEAP_PERCENTAGE=75
ENABLE_NATIVE_IMAGE=false
WORKFLOW_MODE=interactive|auto|batch
AUTO_RETRY=true
```

#### Development/Testing (8 variables)
```env
MOCK_MODE=true|false
FORCE_MOCK_SAMPLER=true|false
MOCK_LATENCY_MIN=100
MOCK_LATENCY_MAX=500
NON_INTERACTIVE=true|false
DEBUG_LOGS=true|false
PERF_MONITORING=true|false
TEST_MODE=true|false
```

## Configuration Issues Identified

### 1. Overlapping Concerns
- **Logging**: Defined in 3 places (`LoggerConfig`, `DependenciesConfig.logging`, `Config.logLevel`)
- **AI Settings**: Split between `SamplerConfig`, `Config.ai*`, and `DependenciesConfig.ai`
- **Session Management**: `SessionServiceConfig`, `DependenciesConfig.session`, `Config.session*`

### 2. Inconsistent Patterns
- **Environment Variable Access**: Direct `process.env.*` vs. centralized parsing
- **Naming Conventions**: Mixed camelCase/snake_case/UPPER_CASE
- **Default Values**: Scattered default logic, no single source of truth
- **Type Safety**: Some configs typed, others use `any` or `unknown`

### 3. Validation Gaps
- **No Schema Validation**: Environment variables parsed without validation
- **Runtime Errors**: Invalid config values discovered at runtime
- **Missing Required Check**: No systematic check for required configuration
- **Type Coercion**: Inconsistent string → number/boolean conversion

### 4. Maintenance Challenges
- **Configuration Drift**: Changes require updates in multiple files
- **Testing Complexity**: Hard to mock/override configuration in tests
- **Documentation Scattered**: No single place to understand all config options
- **Migration Difficulty**: Adding new config requires touching multiple files

## Dependencies Analysis

### Service Dependencies on Configuration
```typescript
// High coupling - services depend on multiple config sources
src/service/dependencies.ts:
- Uses Config class directly
- Accesses DependenciesConfig interface
- Has own configuration logic (240+ lines)

src/infrastructure/ai/factory.ts:
- Direct process.env access (12+ variables)
- Own SamplerConfig interface
- Complex configuration logic

src/service/session/manager.ts:
- SessionServiceConfig interface
- Direct environment variable access
- Configuration validation logic
```

### Circular Dependencies
- `Config` class references other config interfaces
- Service interfaces re-export domain types
- Factory classes create their own configuration logic

## Recommendations for Unification

### 1. Single Configuration Schema
Create unified `ApplicationConfig` interface consolidating all concerns:
```typescript
interface ApplicationConfig {
  server: ServerConfig;
  mcp: McpConfig;
  infrastructure: InfrastructureConfig;
  features: FeatureConfig;
}
```

### 2. Environment Variable Standardization
- Prefix: `CONTAINERKIT_*` for all variables
- Naming: Consistent snake_case for env vars, camelCase for TypeScript
- Validation: Zod schema validation on startup

### 3. Configuration Factory Pattern
- Single `ConfigFactory.create()` method
- Environment-aware defaults (dev/prod/test profiles)
- Comprehensive validation with helpful error messages

### 4. Migration Strategy
- Phase 1: Create unified config alongside existing configs
- Phase 2: Update services one by one to use unified config
- Phase 3: Remove legacy configuration files

## Configuration Usage Patterns

### Current Access Patterns
```typescript
// Pattern 1: Direct environment access (problematic)
const timeout = parseInt(process.env.TIMEOUT || '30');

// Pattern 2: Config class (better)
import { config } from './config.js';
const timeout = config.timeout;

// Pattern 3: Dependency injection (best)
constructor(private config: ApplicationConfig) {}
```

### Proposed Unified Pattern
```typescript
// Single source of truth
import { config } from '../config/index.js';

class SomeService {
  constructor(
    private config: ApplicationConfig,
    private logger: Logger
  ) {}
}
```

## Next Steps

1. **Design unified schema** (Day 2) - Consolidate all configuration interfaces
2. **Implement config factory** (Day 3) - Create type-safe configuration creation
3. **Migrate services** (Week 3) - Update all services to use unified configuration
4. **Remove legacy configs** (Week 3) - Clean up old configuration files

This audit provides the foundation for consolidating the fragmented configuration system into a maintainable, type-safe, and well-documented solution.