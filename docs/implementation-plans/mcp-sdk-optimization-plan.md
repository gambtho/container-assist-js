# MCP SDK Optimization Implementation Plan

## Overview

This document outlines a comprehensive plan to optimize the MCP server implementation by leveraging more SDK capabilities, consolidating custom solutions, and improving consistency across the codebase.

## Current State Analysis

**SDK Version**: @modelcontextprotocol/sdk@1.17.5
**Key Issues Identified**:
- Mixed custom implementations alongside SDK patterns
- Inconsistent prompt management approaches
- Scattered AI enhancement patterns
- Opportunity to leverage more built-in SDK features

## Implementation Phases

### Phase 1: High Priority - Core SDK Leverage (Estimated: 2-3 days)

#### 1.1 Standardize Error Handling (src/mcp/server.ts)

**Current Issue**: Custom JSON error formatting in tool call handlers
**Target**: Use SDK's native error response patterns

**Implementation Steps**:
1. **Replace Custom Error Responses** (server.ts:142-230)
   ```typescript
   // Replace current custom error handling:
   return {
     content: [{ type: 'text', text: JSON.stringify({ error: `Tool not found: ${name}` }) }],
     isError: true,
   };
   
   // With SDK error patterns:
   throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
   ```

2. **Implement SDK Error Types**
   - Import `McpError` and `ErrorCode` from SDK
   - Replace all custom error content with proper error throws
   - Update server extensions to handle SDK errors

**Files to Modify**:
- `src/mcp/server.ts` (lines 142-230)
- `src/mcp/server-extensions.ts` (error handling sections)

#### 1.2 Consolidate Prompt Management

**Current Issue**: Dual prompt systems (custom PromptTemplatesManager + SDK prompts)
**Target**: Single SDK-based prompt system

**Implementation Steps**:
1. **Audit Current Prompt Usage**
   - Custom system: `src/application/tools/intelligent/ai-prompts.ts`
   - SDK handlers: `src/mcp/server.ts:288-358`
   - Strategy prompts: `src/workflows/sampling/strategy-engine.ts:178-202`

2. **Create SDK-Native Prompt Registry**
   ```typescript
   // New file: src/mcp/prompts/sdk-prompt-registry.ts
   export class SDKPromptRegistry {
     private prompts: Map<string, PromptDefinition> = new Map();
     
     register(prompt: PromptDefinition): void {
       this.prompts.set(prompt.name, prompt);
     }
     
     async listPrompts(category?: string): Promise<ListPromptsResult> {
       // Use SDK types directly
     }
     
     async getPrompt(name: string, args?: Record<string, any>): Promise<GetPromptResult> {
       // Use SDK types directly
     }
   }
   ```

3. **Migration Plan**:
   - Phase 1a: Create new SDK prompt registry
   - Phase 1b: Migrate existing templates to new system
   - Phase 1c: Update server.ts to use new registry
   - Phase 1d: Remove custom PromptTemplatesManager

**Files to Modify**:
- Remove: `src/application/tools/intelligent/ai-prompts.ts`
- Create: `src/mcp/prompts/sdk-prompt-registry.ts`
- Update: `src/mcp/server.ts` (prompt handlers)
- Update: `src/workflows/sampling/strategy-engine.ts` (prompt creation)

#### 1.3 Replace Custom Registry with SDK Patterns

**Current Issue**: Custom tool registry system (src/mcp/registry.ts)
**Target**: SDK-aligned tool management

**Implementation Steps**:
1. **Create SDK Tool Manager**
   ```typescript
   // New file: src/mcp/tools/sdk-tool-manager.ts
   export class SDKToolManager {
     private tools: Map<string, ToolDefinition> = new Map();
     
     register(tool: ToolDefinition): void {
       this.tools.set(tool.name, tool);
     }
     
     async listTools(): Promise<Tool[]> {
       // Return SDK-compatible tool list
     }
     
     async callTool(name: string, args: any): Promise<CallToolResult> {
       // Use SDK result types
     }
   }
   ```

2. **Migration Steps**:
   - Create new SDK tool manager
   - Update server.ts to use SDK tool manager
   - Migrate existing tool registrations
   - Update tool factory to work with new system

**Files to Modify**:
- Create: `src/mcp/tools/sdk-tool-manager.ts`
- Update: `src/mcp/server.ts` (tool handlers)
- Update: `src/application/tools/intelligent/ai-tool-factory.ts`
- Refactor: `src/mcp/registry.ts` (simplify or remove)

### Phase 2: Medium Priority - Consistency & Integration (Estimated: 3-4 days)

#### 2.1 Centralize AI Enhancement Patterns

**Current Issue**: Scattered AI integration across tools and strategies
**Target**: Unified AI enhancement pipeline

**Implementation Steps**:
1. **Create Centralized AI Enhancement Service**
   ```typescript
   // New file: src/application/ai/enhancement-service.ts
   export class AIEnhancementService {
     constructor(private mcpHostAI: MCPHostAI, private promptRegistry: SDKPromptRegistry) {}
     
     async enhanceTool(toolName: string, result: any, context: any): Promise<Result<any>> {
       // Unified AI enhancement logic
     }
     
     async enhanceStrategy(strategy: string, context: any): Promise<Result<any>> {
       // Strategy-specific AI enhancement
     }
   }
   ```

2. **Update All AI Integration Points**:
   - Tool factory AI enhancement (ai-tool-factory.ts:125-173)
   - Strategy engine prompts (strategy-engine.ts:178-202, 313-336, 460-483)
   - Analysis sampling tools (already well-integrated)

**Files to Modify**:
- Create: `src/application/ai/enhancement-service.ts`
- Update: `src/application/tools/intelligent/ai-tool-factory.ts`
- Update: `src/workflows/sampling/strategy-engine.ts`
- Update: All strategy implementations for consistent AI integration

#### 2.2 Standardize Tool Enhancement Pipeline

**Current Issue**: Inconsistent enhancement patterns across tools
**Target**: All tools use same enhancement patterns from tool-capabilities.ts

**Implementation Steps**:
1. **Apply Consistent Enhancement to All Tools**
   ```typescript
   // In ai-tool-factory.ts
   export const createProductionTool = (baseTool: Tool, config: Config) => {
     return pipe(
       withLogging(config.logger),
       withMetrics(config.metricsCollector),
       withRetry({ attempts: 3, delay: 1000, backoff: true }),
       withAI(config.mcpHostAI),
       withSessionTracking(config.sessionManager)
     )(baseTool);
   };
   ```

2. **Update Tool Registration**:
   - Apply consistent enhancements to all tools during registration
   - Ensure sampling tools use same patterns as regular tools
   - Add missing enhancements to analysis perspective tools

**Files to Modify**:
- Update: `src/application/tools/intelligent/ai-tool-factory.ts`
- Update: All tool implementations for consistent enhancement
- Update: `src/tools/analysis-perspectives-tools.ts` (newly added)

#### 2.3 Improve Resource Management with SDK Patterns

**Current Issue**: Custom resource manager with mixed SDK usage
**Target**: Full SDK resource management patterns

**Implementation Steps**:
1. **Audit Current Resource Implementation**
   - `src/mcp/resources/manager.ts` - `createResourceAPI` function
   - `src/mcp/resources/containerization-resource-manager.ts`
   - Server integration in `src/mcp/server.ts:56-64`

2. **Align with SDK Resource Patterns**
   ```typescript
   // Update resource manager to use SDK types more consistently
   export class SDKResourceManager implements ResourceManager {
     async listResources(cursor?: string): Promise<ListResourcesResult> {
       // Use SDK types directly
     }
     
     async readResource(uri: string): Promise<ReadResourceResult> {
       // Use SDK types directly
     }
   }
   ```

**Files to Modify**:
- Update: `src/mcp/resources/manager.ts`
- Update: `src/mcp/resources/containerization-resource-manager.ts`
- Update: `src/mcp/server.ts` (resource handlers)

### Phase 3: Low Priority - Optimization & Advanced Features (Estimated: 2-3 days)

#### 3.1 Implement SDK Progress Tracking

**Current Issue**: Custom progress reporting in server extensions
**Target**: SDK-native progress tracking for long-running operations

**Implementation Steps**:
1. **Update Server Extensions for SDK Progress**
   ```typescript
   // In server-extensions.ts
   export const withSDKProgress = (server: any) => {
     server.setRequestHandler(CallToolRequestSchema, async (request) => {
       const progress = server.createProgress();
       
       try {
         await progress.start();
         // Tool execution with progress updates
         await progress.update(50, "Processing...");
         // Completion
         await progress.complete();
       } catch (error) {
         await progress.error(error);
       }
     });
   };
   ```

2. **Update Long-Running Tools**:
   - Dockerfile sampling tools
   - Analysis tools
   - Build and deployment operations

**Files to Modify**:
- Update: `src/mcp/server-extensions.ts`
- Update: `src/tools/sampling-tools.ts`
- Update: `src/tools/build-image.ts`
- Update: `src/tools/deploy.ts`

#### 3.2 Implement SDK Metrics and Observability

**Current Issue**: Custom metrics collection
**Target**: SDK-native metrics and observability

**Implementation Steps**:
1. **Create SDK Metrics Integration**
   ```typescript
   // New file: src/mcp/observability/sdk-metrics.ts
   export class SDKMetricsCollector {
     constructor(private server: Server) {}
     
     recordToolExecution(name: string, duration: number, success: boolean): void {
       // Use SDK metrics capabilities
     }
     
     recordSamplingOperation(strategy: string, variants: number, duration: number): void {
       // Strategy-specific metrics
     }
   }
   ```

2. **Integration Points**:
   - Tool execution metrics
   - Sampling performance metrics
   - Resource access metrics
   - AI enhancement metrics

**Files to Modify**:
- Create: `src/mcp/observability/sdk-metrics.ts`
- Update: `src/application/tools/intelligent/tool-capabilities.ts`
- Update: `src/workflows/sampling/generation-pipeline.ts`

#### 3.3 Enhanced Request Validation

**Current Issue**: Manual parameter validation
**Target**: SDK-native request validation middleware

**Implementation Steps**:
1. **Implement SDK Validation Middleware**
   ```typescript
   // New file: src/mcp/middleware/validation.ts
   export const createValidationMiddleware = () => {
     return (request: any, next: Function) => {
       // Use SDK validation patterns
       const validation = validateRequest(request);
       if (!validation.valid) {
         throw new McpError(ErrorCode.InvalidParams, validation.error);
       }
       return next();
     };
   };
   ```

2. **Update Schema Definitions**:
   - Convert current toolSchemas to SDK schema format
   - Add validation for all tool parameters
   - Implement runtime validation

**Files to Modify**:
- Create: `src/mcp/middleware/validation.ts`
- Update: `src/mcp/registry.ts` (schema definitions)
- Update: `src/mcp/server.ts` (middleware integration)

## Implementation Timeline

### Week 1: Foundation (Phase 1)
- **Day 1-2**: Error handling standardization
- **Day 3-4**: Prompt system consolidation
- **Day 5**: Registry system migration

### Week 2: Integration (Phase 2)
- **Day 1-2**: AI enhancement centralization
- **Day 3-4**: Tool enhancement standardization
- **Day 5**: Resource management optimization

### Week 3: Advanced Features (Phase 3)
- **Day 1**: Progress tracking implementation
- **Day 2**: Metrics and observability
- **Day 3**: Request validation enhancement

## Testing Strategy

### Phase 1 Testing
- Unit tests for SDK error handling
- Integration tests for prompt system migration
- Regression tests for tool registry changes

### Phase 2 Testing
- AI enhancement integration tests
- Tool pipeline consistency tests
- Resource management validation

### Phase 3 Testing
- Progress tracking validation
- Metrics collection verification
- End-to-end validation tests

## Risk Assessment & Mitigation

### High Risk Areas
1. **Tool Registry Migration**: Core functionality change
   - Mitigation: Gradual migration with fallback support
   - Testing: Comprehensive tool execution tests

2. **Prompt System Consolidation**: Major architectural change
   - Mitigation: Parallel systems during transition
   - Testing: Prompt generation and execution validation

### Medium Risk Areas
1. **AI Enhancement Centralization**: Complex integration points
   - Mitigation: Feature flags for gradual rollout
   - Testing: AI enhancement comparison tests

2. **Resource Management Changes**: Data access patterns
   - Mitigation: Backward compatibility layer
   - Testing: Resource access and caching tests

### Low Risk Areas
1. **Progress Tracking**: Additive feature
2. **Metrics Collection**: Non-critical path
3. **Request Validation**: Security improvement

## Success Criteria

### Technical Metrics
- [ ] All custom error handling replaced with SDK patterns
- [ ] Single prompt system using SDK types
- [ ] Consistent tool enhancement across all tools
- [ ] SDK-native progress tracking for long operations
- [ ] Centralized metrics collection using SDK capabilities

### Quality Metrics
- [ ] No reduction in test coverage
- [ ] Performance maintained or improved
- [ ] Memory usage optimized through SDK efficiencies
- [ ] Code complexity reduced through SDK leverage

### Functional Metrics
- [ ] All existing functionality preserved
- [ ] Enhanced error messages and debugging
- [ ] Improved AI integration consistency
- [ ] Better observability and monitoring

## Post-Implementation

### Documentation Updates
- [ ] Update architecture documentation
- [ ] Revise MCP server deployment guide
- [ ] Create SDK usage best practices guide
- [ ] Update troubleshooting documentation

### Monitoring & Maintenance
- [ ] Set up SDK-native metrics dashboards
- [ ] Create alerts for core functionality
- [ ] Establish performance baselines
- [ ] Plan regular SDK updates and migrations

## Conclusion

This implementation plan addresses all identified gaps in MCP SDK usage while maintaining system stability and functionality. The phased approach allows for gradual migration with proper testing and validation at each step.

The expected outcomes include:
- Reduced maintenance overhead through SDK leverage
- Improved consistency across the codebase
- Better error handling and debugging capabilities
- Enhanced observability and metrics collection
- Foundation for future SDK feature adoption