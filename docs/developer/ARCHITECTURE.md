# System Architecture

## Overview
Container Kit MCP Server follows a layered architecture with clear separation of concerns.

## Architecture Diagram
```
┌─────────────────────────────────────────┐
│            MCP Client (Claude)          │
└─────────────────┬───────────────────────┘
                  │ MCP Protocol
┌─────────────────▼───────────────────────┐
│          MCP Server Layer               │
│  ┌─────────────────────────────────┐    │
│  │     Tool Registry & Router      │    │
│  └─────────────────────────────────┘    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Application Layer               │
│  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  Tools   │ │Workflow  │ │Session │  │
│  └──────────┘ └──────────┘ └────────┘  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Infrastructure Layer            │
│  ┌──────┐ ┌──────┐ ┌─────┐ ┌────────┐  │
│  │Docker│ │ K8s  │ │ AI  │ │Session │  │
│  └──────┘ └──────┘ └─────┘ └────────┘  │
└─────────────────────────────────────────┘
```

## Layer Responsibilities

### MCP Server Layer
- Protocol handling
- Request/response formatting
- Tool registration and discovery
- Progress notification

### Application Layer
- Business logic implementation
- Workflow orchestration
- Tool implementations
- Session management

### Infrastructure Layer
- External service abstractions
- Error handling
- Retry logic
- Caching

## Data Flow

### Tool Execution Flow
1. MCP Client sends tool call request
2. Server validates request against schema
3. Tool handler executes with services
4. Progress updates sent if token provided
5. Result formatted and returned

### Workflow Orchestration
1. Workflow initiated via tool
2. Session created for state tracking
3. Steps executed sequentially
4. State persisted after each step
5. Final result returned

## Key Design Patterns

### Dependency Injection
Services injected into tools via constructor

### Builder Pattern
AI requests built using fluent interface

### Strategy Pattern
Different sampling strategies for AI

### Observer Pattern
Progress updates via MCP notifications

## Configuration Management

### Environment Variables
- Docker socket path
- Kubernetes config
- AI service endpoints
- Session storage location

### Runtime Configuration
- Tool-specific parameters
- Workflow defaults
- Timeout values

## Security Considerations

### Input Validation
- All inputs validated via Zod schemas
- SQL injection prevention in session queries
- Path traversal protection

### Secret Management
- No secrets in code
- Environment variable usage
- Secure credential storage

### Resource Limits
- Timeout enforcement
- Memory limits
- Rate limiting considerations

## Directory Structure

### Strict Layer Boundaries
```
src/
├── config/          # Single source of truth for configuration
├── domain/          # Pure types only (no business logic!)
├── infrastructure/  # External adapters (docker, k8s, ai, core)
├── application/     # Business logic (tools, workflow, factories)
└── platform/        # Entry points (bin, server)
```

#### Directory Boundaries (ENFORCED)
- **Domain Layer** (`src/domain/`): Pure types & interfaces ONLY
  - ✅ Type definitions, interfaces, Zod schemas
  - ❌ NO business logic, NO logger exports, NO implementations
- **Infrastructure Layer** (`src/infrastructure/`): External adapters & clients
  - Docker/K8s/AI integration
  - NO dependencies on application layer
- **Application Layer** (`src/application/`): Business logic & tool implementations
  - MCP tools, workflow orchestration, session management
  - Can import from domain & infrastructure
- **Platform Layer** (`src/platform/`): Entry points & servers
  - CLI (`src/platform/bin/`), server setup
  - Top-level orchestration only

## Core Components

### MCP Server
The main server implementation that:
- Handles MCP protocol communication
- Manages tool registry
- Routes requests to appropriate handlers
- Provides progress tracking capabilities

### Tool Registry
Central registry for all available tools:
- Dynamic tool registration
- Metadata management
- Schema validation
- Tool discovery

### Session Management
Persistent state management:
- Workflow state tracking
- Progress persistence
- Session cleanup
- State recovery

### Docker Integration
Docker service abstractions:
- Multiple adapter support (dockerode, CLI)
- Connection health monitoring
- Operation progress tracking
- Error handling and recovery

### Kubernetes Integration
Kubernetes client abstractions:
- Manifest generation
- Deployment orchestration
- Health checking
- Resource management

### AI Integration
AI service integration:
- Structured output generation
- Content validation
- Caching mechanisms
- Error recovery strategies

## Error Handling Strategy

### Result Monad Pattern
All operations return Result<T> types:
```typescript
import { Result, Success, Failure } from '../domain/types/result.js'

export async function buildImage(config: BuildConfig): Promise<Result<BuildOutput>> {
  try {
    const output = await docker.build(config);
    return Success(output);
  } catch (error) {
    return Failure(`Build failed: ${error.message}`);
  }
}
```

### Error Recovery
- Graceful degradation for all operations
- Automatic retry with exponential backoff
- Structured error context
- User-friendly error messages

## Performance Optimizations

### Caching Strategy
- AI response caching (15-minute TTL)
- Docker image layer caching
- Session state caching
- Configuration caching

### Concurrent Operations
- Parallel tool execution where possible
- Async/await throughout
- Stream-based processing for large operations
- Connection pooling

### Resource Management
- Memory usage monitoring
- Connection cleanup
- Timeout handling
- Resource limits enforcement

## Monitoring and Observability

### Logging Strategy
- Structured logging with Pino
- Component-specific loggers
- Error context preservation
- Performance metrics

### Health Checks
- Service availability monitoring
- Docker daemon health
- Kubernetes cluster connectivity
- AI service status

## Testing Architecture

### Test Structure
```
test/
├── unit/            # Pure unit tests
├── integration/     # Service integration tests
└── e2e/            # End-to-end workflow tests
```

### Testing Strategies
- Mock external dependencies
- Test each layer independently
- Integration tests for service boundaries
- E2E tests for complete workflows

## Scalability Considerations

### Horizontal Scaling
- Stateless tool execution
- Session storage externalization
- Load balancing capability
- Service discovery

### Vertical Scaling
- Memory-efficient operations
- CPU optimization
- I/O optimization
- Resource pooling

## Development Guidelines

### Code Organization
- Single responsibility principle
- Clear dependency boundaries
- Minimal public interfaces
- Comprehensive error handling

### TypeScript Configuration
- Strict mode enabled
- ES2022 module system
- Bundler resolution
- Exact optional properties

### Import Strategy
- Relative imports only
- No path aliases
- Explicit file extensions for non-bundler environments
- Clear dependency direction