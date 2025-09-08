# Architecture

## Overview

The Containerization Assist MCP Server is a sophisticated, AI-powered MCP implementation that showcases advanced MCP SDK v1.17.5 features. All enhanced features are integrated directly into the main server, providing a seamless experience.

## Single Entry Point

```bash
# Main CLI entry point with all features
containerization-assist-mcp

# Short alias
ca-mcp
```

## Core Architecture

```text
src/cli/cli.ts (Entry Point)
    ↓
MCP Server (src/mcp/server/)
    ├── Main Server (index.ts)
    ├── Progress Reporting (progress.ts)
    ├── Health Monitoring (health.ts)
    ├── Middleware (middleware.ts)
    └── Schema Definitions (schemas.ts, types.ts)
    │
    ├── Session Management (src/lib/session.ts)
    │   ├── State Tracking
    │   ├── Tool History
    │   └── Workflow Progress
    │
    ├── AI Services (src/lib/ai/)
    │   ├── AI Service Implementation (ai-service.ts)
    │   └── MCP Host AI Integration (mcp-host-ai.ts)
    │
    ├── Tool Registry (src/mcp/tools/)
    │   ├── Tool Registration (registry.ts)
    │   ├── Capabilities (capabilities.ts)
    │   └── Validation (validator.ts)
    │
    ├── Workflow Orchestrator (src/workflows/)
    │   ├── Intelligent Orchestration
    │   ├── Containerization Workflows
    │   └── Sampling-based Workflows
    │
    ├── Resource Management (src/resources/)
    │   ├── Resource Manager (manager.ts)
    │   ├── Caching (cache.ts, resource-cache.ts)
    │   └── URI Schemes (uri-schemes.ts)
    │
    └── Prompt Templates (src/prompts/prompt-registry.ts)
        ├── Template Management
        ├── Context Integration
        └── Dynamic Generation
```

## Key Components

### 1. Enhanced Server (`enhanceServer()`)
- Automatically called in `ContainerizationMCPServer` constructor
- Replaces default tool handler with enhanced version
- Adds progress reporting and cancellation support
- Creates `ToolContext` for each execution

### 2. Session Manager
- Tracks state across tool executions
- Stores analysis results, generated artifacts
- Maintains tool execution history
- Enables context-aware operations

### 3. Intelligent AI Service
- Validates and optimizes parameters
- Generates contextual guidance
- Analyzes execution results
- Provides next-step recommendations

### 4. Enhanced Tools (14 total)
All tools automatically support:
- Progress reporting via `_meta.progressToken`
- Cancellation via `AbortSignal`
- AI parameter validation
- Session-aware execution
- Intelligent recommendations

### 5. Workflow Orchestrator
4 intelligent workflows that:
- Plan steps based on session state
- Support conditional execution
- Provide progress updates
- Generate AI recommendations

### 6. Enhanced Resources
- AI-augmented file resources
- Virtual session-based resources
- Custom URI schemes (repository://, dockerfile://, etc.)

### 7. Prompt Templates
- Context-aware prompt generation
- 6 pre-defined templates
- Session integration
- Type-safe arguments

## Data Flow

```text
1. Client Request → MCP Server
                      ↓
2. Enhanced Handler (with ToolContext)
                      ↓
3. Session Manager (get/update state)
                      ↓
4. AI Service (validate/optimize)
                      ↓
5. Tool Execution (with progress)
                      ↓
6. Result Analysis (AI insights)
                      ↓
7. Session Update (store results)
                      ↓
8. Client Response (with recommendations)
```

## Tool Enhancement Process

```typescript
// Every tool automatically gets:
1. Pre-execution:
   - Parameter validation with AI
   - Session context loading
   - Parameter optimization

2. During execution:
   - Progress reporting
   - Cancellation checking
   - Logging with context

3. Post-execution:
   - Result analysis
   - Recommendation generation
   - Session state update
```

## Session State Structure

```typescript
{
  sessionId: string,
  analysis_result?: RepositoryAnalysis,
  generated_dockerfile?: string,
  k8s_manifests?: K8sManifests,
  scan_results?: ScanResults,
  workflow_state?: WorkflowState,
  completed_steps?: string[],
  tool_history?: ToolExecution[],
  subscriptions?: Subscription[]
}
```

## Progress Notification Protocol

```typescript
// Client includes progress token
{
  "_meta": {
    "progressToken": "unique-token"
  }
}

// Server sends notifications
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "unique-token",
    "progress": 50,
    "total": 100,
    "message": "Building image..."
  }
}
```

## Cancellation Protocol

```typescript
// Client provides AbortSignal
const controller = new AbortController();
request.signal = controller.signal;

// Cancel anytime
controller.abort();

// Server handles gracefully
if (signal?.aborted) {
  throw new CancelledError();
}
```

## File Structure

```text
src/
├── app/                         # Application entry point
│   ├── index.ts                 # Main app interface
│   └── container.ts             # Dependency injection
│
├── cli/                         # CLI entry points
│   ├── cli.ts                   # Main CLI entry
│   └── server.ts                # Server utilities
│
├── mcp/                         # MCP server implementation
│   ├── server/                  # Core server components
│   │   ├── index.ts             # Main server
│   │   ├── progress.ts          # Progress reporting
│   │   ├── health.ts            # Health monitoring
│   │   └── middleware.ts        # Request middleware
│   ├── client/                  # MCP client implementation
│   ├── sampling/                # AI sampling services
│   ├── tools/                   # Tool registration
│   └── utils/                   # MCP utilities
│
├── infrastructure/              # External adapters
│   ├── docker/                  # Docker integration
│   └── kubernetes/              # Kubernetes integration
│
├── lib/                         # Libraries and utilities
│   ├── ai/                      # AI services
│   ├── session.ts               # Session management
│   └── [other utilities]
│
├── tools/                       # Tool implementations (co-located)
│   ├── analyze-repo/
│   │   ├── tool.ts              # Implementation
│   │   ├── schema.ts            # Validation
│   │   └── index.ts             # Exports
│   └── [other tools]/           # Same structure
│
└── workflows/                   # Workflow orchestration
    ├── orchestration/           # Complex workflows
    └── sampling/                # Sampling workflows
```

## Configuration

All enhanced features are enabled by default:

```typescript
// In server.ts constructor
constructor(logger?: Logger, options: MCPServerOptions = {}) {
  // ... initialization ...
  
  // This single line enables ALL enhanced features!
  enhanceServer(this);
}
```

## Benefits of Integrated Architecture

1. **Simplicity**: Single entry point, no configuration needed
2. **Consistency**: All tools enhanced uniformly
3. **Performance**: Shared session manager and AI service
4. **Maintainability**: Clear separation of concerns
5. **Extensibility**: Easy to add new tools or workflows
6. **Compatibility**: Backward compatible with standard MCP

## Testing

```bash
# Run integration tests
npm test

# Test enhanced features
npm run test:enhanced

# Test with mock AI
containerization-assist-mcp --mock
```

## Summary

The enhanced MCP server seamlessly integrates advanced features into the standard MCP protocol, providing:
- 🚀 AI-powered intelligence for all operations
- 📊 Real-time progress reporting
- ⏹️ Graceful cancellation support
- 🔄 Session-aware execution
- 🎯 Intelligent workflow orchestration
- 📚 Enhanced resources and prompts

All features work out of the box with zero configuration!