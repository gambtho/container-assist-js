# Enhanced MCP Server Usage Guide

## Overview

The Enhanced MCP Server provides advanced AI-powered features for containerization assistance, including:

- **AI-Powered Parameter Inference**: Automatically infers and optimizes tool parameters
- **Progress Reporting**: Real-time progress updates for long-running operations
- **Cancellation Support**: Cancel operations via AbortSignal
- **Session Management**: Maintains state across tool executions
- **Intelligent Workflows**: AI-driven workflow planning and execution
- **Enhanced Resources**: AI-augmented resource management
- **Prompt Templates**: Context-aware prompt generation

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Enhanced MCP Server                 │
├─────────────────────────────────────────────────┤
│  Progress Reporting & Cancellation (Enhanced)   │
├─────────────────────────────────────────────────┤
│         Intelligent Tool Factory                 │
│  ┌─────────────┐  ┌─────────────┐              │
│  │ AI Service  │  │Session Mgr  │              │
│  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────┤
│         14 Enhanced Tools                        │
│  • analyze-repo       • scan                    │
│  • generate-dockerfile• push                    │
│  • build-image       • tag                      │
│  • fix-dockerfile    • deploy                   │
│  • resolve-base-images• verify-deployment       │
│  • prepare-cluster   • generate-k8s-manifests   │
│  • ops               • workflow                 │
├─────────────────────────────────────────────────┤
│       Intelligent Workflow Orchestrator          │
│  • Containerization  • Security                 │
│  • Deployment        • Optimization             │
├─────────────────────────────────────────────────┤
│    Enhanced Resources & Prompt Templates         │
└─────────────────────────────────────────────────┘
```

## Key Components

### 1. Enhanced Server (`src/mcp/enhanced-server.ts`)
- Adds progress reporting via `ProgressReporter`
- Supports cancellation through `AbortSignal`
- Creates `ToolContext` with session information

### 2. Intelligent AI Service (`src/lib/enhanced-ai.ts`)
- Builds context from session state and tool history
- Validates and optimizes parameters
- Analyzes results and provides recommendations
- Generates guidance based on task type

### 3. Intelligent Tool Wrapper (`src/application/tools/enhanced/intelligent-tool-wrapper.ts`)
- Pre-execution AI validation
- Parameter optimization based on context
- Post-execution analysis with insights
- Automatic session tracking

### 4. Session Manager (`src/mcp/session/manager.ts`)
- Tracks tool execution history
- Stores workflow state
- Maintains repository analysis results
- Manages subscriptions

### 5. Intelligent Workflow Orchestrator (`src/workflows/intelligent-orchestration.ts`)
- Plans workflow steps based on session state
- Supports conditional step execution
- Provides progress updates
- Generates AI-powered recommendations

## Usage Examples

### Starting the Enhanced Server

```bash
# Run the enhanced MCP server
node dist/platform/enhanced-mcp.js
```

### Tool Execution with Progress

```typescript
// Client example with progress reporting
const response = await client.callTool({
  name: 'build-image',
  arguments: {
    sessionId: 'user-123',
    dockerfilePath: './Dockerfile',
    contextPath: '.',
  },
  _meta: {
    progressToken: 'build-progress-123'
  }
});

// Server will send progress notifications:
// { progress: 10, message: 'Validating parameters with AI...' }
// { progress: 30, message: 'Executing build-image...' }
// { progress: 80, message: 'Analyzing results with AI...' }
// { progress: 100, message: 'Complete' }
```

### Workflow Execution

```typescript
// Execute containerization workflow
const response = await client.callTool({
  name: 'workflow',
  arguments: {
    workflowType: 'containerization',
    sessionId: 'user-123',
    repoPath: './my-app',
    buildImage: true,
    scanImage: true,
    pushImage: true,
    registry: 'docker.io/myorg',
  }
});

// Workflow will:
// 1. Analyze repository (if not done)
// 2. Generate optimized Dockerfile
// 3. Build Docker image
// 4. Scan for vulnerabilities
// 5. Push to registry
// Each step includes AI validation and recommendations
```

### Session-Aware Execution

```typescript
// First call - analyzes repository
await client.callTool({
  name: 'analyze-repo',
  arguments: {
    sessionId: 'user-123',
    repoPath: './my-app'
  }
});

// Second call - uses analysis from session
await client.callTool({
  name: 'generate-dockerfile',
  arguments: {
    sessionId: 'user-123'
    // Language, framework, etc. inferred from session
  }
});
```

### Using Prompt Templates

```typescript
// Get AI-powered containerization prompt
const prompt = await client.getPrompt({
  name: 'dockerfile-generation',
  arguments: {
    language: 'node',
    framework: 'express',
    securityLevel: 'enhanced'
  }
});

// Returns context-aware prompt with:
// - Base instructions
// - Repository context (if available)
// - Security best practices
// - Optimization recommendations
```

### Enhanced Resources

```typescript
// Access session-based resources
const resource = await client.readResource({
  uri: 'repository://user-123/analysis'
});

// Returns repository analysis with AI insights:
// - Language and framework detection
// - Dependency analysis
// - Security recommendations
// - Containerization strategy
```

## Workflow Types

### 1. Containerization Workflow
Complete containerization from analysis to deployment:
- Repository analysis
- Dockerfile generation
- Image building
- Security scanning
- Registry push

### 2. Deployment Workflow
Deploy application to Kubernetes:
- Generate K8s manifests
- Prepare cluster
- Deploy application
- Verify deployment

### 3. Security Workflow
Security analysis and remediation:
- Repository security scan
- Vulnerability assessment
- Dockerfile fixes
- Remediation recommendations

### 4. Optimization Workflow
Optimize Docker images:
- Repository analysis
- Base image resolution
- Optimized Dockerfile generation
- Size-optimized build

## AI Features

### Parameter Inference
- Automatically infers missing parameters from session context
- Suggests optimal values based on repository analysis
- Validates parameters before execution

### Error Recovery
- Provides intelligent error recovery suggestions
- Analyzes failure patterns
- Suggests alternative approaches

### Context Awareness
- Maintains session state across executions
- Uses tool history for better recommendations
- Learns from previous executions

### Recommendations
- Post-execution insights and analysis
- Next step suggestions
- Security and optimization recommendations

## Advanced Features

### Cancellation Support
```typescript
const controller = new AbortController();

// Start long-running operation
const promise = client.callTool({
  name: 'build-image',
  arguments: { ... },
  signal: controller.signal
});

// Cancel if needed
controller.abort();
```

### Progress Monitoring
```typescript
// Subscribe to progress updates
client.on('progress', (update) => {
  console.log(`${update.progress}% - ${update.message}`);
});
```

### Session Management
```typescript
// Create persistent session
const sessionId = 'user-123';

// All tools in session share state
await client.callTool({ 
  name: 'analyze-repo',
  arguments: { sessionId, ... }
});

// State persists across calls
await client.callTool({
  name: 'generate-dockerfile', 
  arguments: { sessionId }  // Uses analysis from previous call
});
```

## Benefits

1. **Reduced Configuration**: AI infers parameters from context
2. **Better User Experience**: Real-time progress and cancellation
3. **Intelligent Assistance**: AI-powered recommendations and validation
4. **Workflow Automation**: Complete workflows with single command
5. **Error Prevention**: Pre-execution validation catches issues early
6. **Context Preservation**: Session state reduces redundant operations

## Implementation Status

✅ **Completed:**
- Enhanced MCP server with progress reporting
- Intelligent AI service with context building
- Tool wrapper for AI-enhanced execution
- Enhanced resource manager
- Prompt template system
- Intelligent tool factory (14 tools)
- Workflow orchestrator (4 workflows)
- Enhanced tool registry
- Session manager

## Future Enhancements

- Real AI integration (currently using structured mocks)
- Persistent session storage
- Multi-user session isolation
- Advanced workflow templates
- Custom prompt template creation
- Metrics and analytics dashboard