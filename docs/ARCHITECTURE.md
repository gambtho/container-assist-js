# Architecture Overview

## System Architecture

Container Kit MCP uses a clean 3-layer architecture optimized for maintainability and performance:

```
┌─────────────────────────────────────────┐
│              MCP Protocol               │  ← API Layer
├─────────────────────────────────────────┤
│            Service Layer                │  ← Business Services
│  ┌─────────────┐ ┌─────────────────────┐ │
│  │   Tools     │ │     Session         │ │
│  │  Registry   │ │   Management        │ │
│  └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────┤
│            Domain Layer                 │  ← Business Logic
│  ┌─────────────┐ ┌─────────────────────┐ │
│  │  Workflow   │ │      Types &        │ │
│  │Orchestration│ │     Events          │ │
│  └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────┤
│         Infrastructure Layer            │  ← External Services
│  ┌─────────┐ ┌─────────┐ ┌─────────────┐ │
│  │   AI    │ │ Docker  │ │ Kubernetes  │ │
│  │Sampling │ │   API   │ │   Client    │ │
│  └─────────┘ └─────────┘ └─────────────┘ │
└─────────────────────────────────────────┘
```

## Layer Responsibilities

### API Layer (`server.js`)
- MCP protocol implementation using `@modelcontextprotocol/sdk`
- Tool registration and request routing
- Input/output validation with Zod schemas
- Error handling and response formatting

### Service Layer (`src/service/`)
- **Tool Registry**: 15 MCP tools with automated registration
- **Session Management**: In-memory session persistence with atomic operations
- **Configuration**: Unified configuration management across components
- **Dependencies**: Dependency injection container for loose coupling

### Domain Layer (`src/domain/`)
- **Workflow Types**: Session, workflow state, and business entities
- **Event System**: Progress tracking and workflow orchestration
- **Business Logic**: Core containerization workflows and validation rules
- **Result Pattern**: Consistent error handling with `Result<T>` types

### Infrastructure Layer (`src/infrastructure/`)
- **AI Integration**: MCP sampling API for AI-powered operations
- **Docker Operations**: Container building, scanning, and registry operations
- **Kubernetes Client**: Manifest generation and deployment operations
- **Logging & Monitoring**: Structured logging with Pino, secret redaction

## Key Architectural Decisions

### 1. In-Memory Session Storage
- **Why**: MCP servers are single-process, sessions are transient
- **Benefits**: <1ms operations, no database setup, simplified development
- **Future**: Easy migration to SQLite via `SessionStoreFactory` when needed
- **Details**: See [Session Persistence](./architecture/session-persistence.md)

### 2. MCP Sampling for AI
- **Why**: Direct integration with Claude Code, Copilot, and other MCP clients
- **Benefits**: No external API keys, standardized AI operations
- **Implementation**: Structured prompts with YAML templates

### 3. Tool-Based Architecture
- **Why**: Modular, testable, and extensible tool system
- **Benefits**: Each tool is independently testable and configurable
- **15 Tools**: 10 workflow + 2 orchestration + 3 utility tools

### 4. TypeScript with Runtime Validation
- **Why**: Balance between type safety and development speed
- **Implementation**: Zod schemas for all external boundaries
- **Benefits**: Catch errors at runtime, excellent IDE support

## Performance Characteristics

Based on comprehensive benchmarking:

| Metric | Target | Achieved |
|--------|---------|----------|
| Session Operations | >1,000/sec | >10,000/sec |
| Workflow Execution | >100/sec | >400/sec |
| Memory Usage | <50MB | <10MB |
| Response Latency | <100ms | <50ms |

## Tool Categories

### Workflow Tools (10)
Sequential containerization steps:
1. `analyze_repository` - Language detection and framework analysis
2. `resolve_base_images` - Optimal base image selection
3. `generate_dockerfile` - AI-powered Dockerfile creation
4. `build_image` - Docker image building with error recovery
5. `scan_image` - Security vulnerability scanning
6. `tag_image` - Image tagging and versioning
7. `push_image` - Registry push operations
8. `generate_k8s_manifests` - Kubernetes manifest generation
9. `prepare_cluster` - Cluster preparation and validation
10. `verify_deployment` - Health checks and endpoint discovery

### Orchestration Tools (2)
- `start_workflow` - Complete containerization workflow
- `workflow_status` - Progress tracking and status reporting

### Utility Tools (3)
- `list_tools` - Tool discovery and documentation
- `ping` - Connectivity testing
- `server_status` - Server health and metrics

## Extension Points

### Adding New Tools
1. Define Zod schemas in `src/service/tools/schemas.js`
2. Add tool configuration to `src/service/tools/config.js`
3. Implement handler function with consistent error handling
4. Automatic registration via `ToolRegistry.discoverTools()`

### Adding Persistence
1. Implement `SessionStore` interface
2. Update `SessionStoreFactory` with new store type
3. Zero changes needed in consuming code

### Adding AI Providers
1. Implement `AISampler` interface
2. Add provider configuration
3. Update `AISamplerFactory` for provider selection

## Security Considerations

- **Secret Redaction**: Automatic masking of sensitive data in logs
- **Input Validation**: All external inputs validated with Zod
- **Error Boundaries**: Structured error handling prevents information leakage
- **Process Isolation**: Docker and Kubernetes operations run in isolated contexts

## Monitoring & Observability

- **Structured Logging**: JSON logs with correlation IDs
- **Performance Metrics**: Built-in benchmarking and regression detection
- **Health Checks**: Comprehensive system health validation
- **Error Tracking**: Detailed error context with stack traces

This architecture enables rapid development while maintaining production reliability and extensibility.