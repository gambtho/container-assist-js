# Enhanced MCP Server Architecture

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

```
apps/cli.ts (Entry Point)
    ↓
ContainerizationMCPServer (src/mcp/server.ts)
    ├── enhanceServer() - Automatically called in constructor
    │   ├── Progress Reporting (ProgressReporter)
    │   ├── Cancellation Support (AbortSignal)
    │   └── Tool Context (sessionId, logger)
    │
    ├── Session Manager (src/mcp/session/manager.ts)
    │   ├── State Tracking
    │   ├── Tool History
    │   └── Workflow Progress
    │
    ├── Intelligent AI Service (src/lib/enhanced-ai.ts)
    │   ├── Context Building
    │   ├── Parameter Validation
    │   ├── Result Analysis
    │   └── Recommendations
    │
    ├── Enhanced Tool Registry (src/mcp/registry.ts)
    │   └── 14 Enhanced Tools (all with AI, progress, cancellation)
    │
    ├── Workflow Orchestrator (src/workflows/intelligent-orchestration.ts)
    │   ├── Containerization Workflow
    │   ├── Deployment Workflow
    │   ├── Security Workflow
    │   └── Optimization Workflow
    │
    ├── Enhanced Resources (src/mcp/resources/enhanced-manager.ts)
    │   ├── AI Augmentation
    │   ├── Session Resources
    │   └── Custom URI Schemes
    │
    └── Prompt Templates (src/mcp/prompts/intelligent-templates.ts)
        ├── 6 Pre-defined Templates
        ├── Context Integration
        └── Argument Validation
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

```
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

```
src/
├── mcp/
│   ├── server.ts                    # Main server (auto-enhanced)
│   ├── enhanced-server.ts           # Enhancement logic
│   ├── session/
│   │   └── manager.ts              # Session management
│   ├── resources/
│   │   ├── manager.ts              # Base resources
│   │   └── enhanced-manager.ts     # AI-enhanced resources
│   ├── prompts/
│   │   └── intelligent-templates.ts # Prompt templates
│   └── registry.ts                  # Tool registry
│
├── lib/
│   └── enhanced-ai.ts              # AI service
│
├── application/tools/intelligent/
│   ├── intelligent-tool-wrapper.ts  # Tool enhancement
│   ├── intelligent-factory.ts       # Tool factory
│   └── factory.ts                   # Enhanced tools factory
│
├── workflows/
│   └── intelligent-orchestration.ts # Workflow orchestrator
│
└── tools/
    └── [14 tool implementations]
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