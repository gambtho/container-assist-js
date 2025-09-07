# Workflow Orchestrator API Reference

## Overview

The `WorkflowCoordinator` class is the main entry point for executing containerization workflows. It orchestrates the entire process from repository analysis through deployment verification.

## Class: WorkflowCoordinator

### Constructor

```typescript
constructor(
  logger: Logger,
  resourceManager?: ResourceManager,
  progressNotifier?: ProgressNotifier,
  tools?: Record<string, IntelligentTool>
)
```

**Parameters:**
- `logger`: Pino logger instance for structured logging
- `resourceManager`: Optional resource management implementation (uses mock if not provided)
- `progressNotifier`: Optional progress notification handler (uses mock if not provided)
- `tools`: Optional intelligent tool implementations (uses mocks if not provided)

**Example:**
```typescript
import { pino } from 'pino'
import { WorkflowCoordinator } from './workflows/orchestration/coordinator.js'

const logger = pino({ level: 'info' })
const coordinator = new WorkflowCoordinator(logger)
```

### Methods

#### executeWorkflow

Executes the complete containerization workflow for a repository.

```typescript
async executeWorkflow(
  repositoryPath: string,
  config?: Partial<WorkflowConfig>
): Promise<Result<WorkflowResult>>
```

**Parameters:**
- `repositoryPath`: Absolute path to the repository to containerize
- `config`: Optional workflow configuration overrides

**Returns:** Promise resolving to a Result containing WorkflowResult on success

**Example:**
```typescript
const result = await coordinator.executeWorkflow('/path/to/repo', {
  enableSampling: true,
  maxCandidates: 5,
  targetEnvironment: 'staging'
})

if (result.success) {
  console.log(`Workflow completed in ${result.value.duration}ms`)
  console.log(`Session ID: ${result.value.sessionId}`)
} else {
  console.error(`Workflow failed: ${result.error}`)
}
```

#### getSessionStatus

Retrieves the current status of a workflow session.

```typescript
async getSessionStatus(sessionId: string): Promise<Result<SessionContext>>
```

**Parameters:**
- `sessionId`: Unique identifier for the workflow session

**Returns:** Promise resolving to Result containing SessionContext

**Example:**
```typescript
const status = await coordinator.getSessionStatus('session_abc123_def456')

if (status.success) {
  console.log(`Current stage: ${status.value.state.currentStage}`)
  console.log(`Completed stages: ${status.value.state.completedStages}`)
}
```

#### listActiveSessions

Lists all currently active workflow sessions.

```typescript
async listActiveSessions(): Promise<SessionContext[]>
```

**Returns:** Promise resolving to array of active SessionContext objects

**Example:**
```typescript
const sessions = await coordinator.listActiveSessions()

sessions.forEach(session => {
  console.log(`Session ${session.id}: ${session.state.currentStage}`)
})
```

#### cancelWorkflow

Cancels an active workflow session and cleans up resources.

```typescript
async cancelWorkflow(sessionId: string): Promise<Result<void>>
```

**Parameters:**
- `sessionId`: Unique identifier for the session to cancel

**Returns:** Promise resolving to Result indicating success or failure

**Example:**
```typescript
const result = await coordinator.cancelWorkflow('session_abc123_def456')

if (result.success) {
  console.log('Workflow cancelled successfully')
} else {
  console.error(`Failed to cancel workflow: ${result.error}`)
}
```

## Types

### WorkflowConfig

Configuration object for customizing workflow behavior.

```typescript
interface WorkflowConfig {
  // Sampling preferences
  enableSampling: boolean
  maxCandidates: number        // 3-10
  samplingTimeout: number      // seconds
  
  // Build preferences
  buildTimeout: number         // seconds
  enableBuildCache: boolean
  buildArgs: Record<string, string>
  
  // Security preferences
  maxVulnerabilityLevel: 'low' | 'medium' | 'high' | 'critical'
  enableAutoRemediation: boolean
  maxRemediationAttempts: number
  
  // Deployment preferences
  targetEnvironment: 'dev' | 'staging' | 'prod'
  deploymentStrategy: 'rolling' | 'blue-green' | 'canary'
  enableAutoVerification: boolean
  
  // Resource preferences
  keepIntermediateArtifacts: boolean
  resourceTTL: number          // seconds
}
```

### WorkflowResult

Result object containing information about completed workflow.

```typescript
interface WorkflowResult {
  sessionId: string
  success: boolean
  duration: number             // milliseconds
  completedStages: WorkflowStage[]
  finalArtifacts: Record<string, ResourceUri>
  metrics: WorkflowMetrics
  errors?: WorkflowError[]
}
```

### SessionContext

Complete context information for a workflow session.

```typescript
interface SessionContext {
  id: string
  repository: RepositoryInfo
  config: WorkflowConfig
  state: WorkflowState
  artifacts: Map<string, ResourceUri>
  startTime: Date
  lastActivity: Date
}
```

### WorkflowStage

Enumeration of workflow stages.

```typescript
enum WorkflowStage {
  ANALYSIS = 'analysis',
  DOCKERFILE_GENERATION = 'dockerfile_generation',
  BUILD = 'build',
  SCAN = 'scan',
  REMEDIATION = 'remediation',
  K8S_GENERATION = 'k8s_generation',
  DEPLOYMENT = 'deployment',
  VERIFICATION = 'verification'
}
```

### WorkflowMetrics

Performance and operational metrics for a workflow execution.

```typescript
interface WorkflowMetrics {
  totalDuration: number        // milliseconds
  stageDurations: Record<WorkflowStage, number>
  retryCount: number
  artifactSizes: Record<string, number>
  samplingMetrics?: SamplingMetrics
}
```

## Progress Notifications

The coordinator emits progress notifications through the `ProgressNotifier` interface. These follow the MCP progress notification standard:

```typescript
interface ProgressNotifier {
  notifyProgress(progress: { 
    token: string
    value: number        // 0-100
    message?: string 
  }): void
  notifyComplete(token: string): void
  notifyError(token: string, error: string): void
}
```

**Progress Flow:**
1. `notifyProgress` called at workflow start (value: 0)
2. `notifyProgress` called at each stage transition (increasing values)
3. `notifyComplete` called on successful completion
4. `notifyError` called on failure

## Error Handling

The coordinator implements comprehensive error handling with retry logic:

### Error Recovery Strategies

- **RETRY**: Retry the failed operation with exponential backoff
- **FALLBACK**: Use alternative tool or approach
- **SKIP**: Skip the failed stage and continue
- **MANUAL**: Require user intervention
- **ABORT**: Stop workflow execution

### Stage-Specific Recovery

Each workflow stage has a predefined recovery strategy:

```typescript
const RETRY_CONFIGS: Record<WorkflowStage, RecoveryAction> = {
  [WorkflowStage.ANALYSIS]: {
    strategy: RecoveryStrategy.RETRY,
    maxAttempts: 2,
    backoffMs: 5000
  },
  [WorkflowStage.BUILD]: {
    strategy: RecoveryStrategy.RETRY,
    maxAttempts: 2,
    backoffMs: 10000
  },
  // ... other stages
}
```

## Usage Patterns

### Basic Workflow Execution

```typescript
import { WorkflowCoordinator } from './workflows/orchestration/coordinator.js'
import { pino } from 'pino'

const logger = pino()
const coordinator = new WorkflowCoordinator(logger)

async function containerizeApp() {
  const result = await coordinator.executeWorkflow('/path/to/app')
  
  if (result.success) {
    console.log(`✅ Containerization completed!`)
    console.log(`📦 Image: ${result.value.finalArtifacts.build_image}`)
    console.log(`🚀 Service: ${result.value.finalArtifacts.deploy_service}`)
  } else {
    console.error(`❌ Failed: ${result.error}`)
  }
}
```

### Custom Configuration

```typescript
async function containerizeWithCustomConfig() {
  const config = {
    enableSampling: true,
    maxCandidates: 5,
    targetEnvironment: 'prod' as const,
    deploymentStrategy: 'blue-green' as const,
    maxVulnerabilityLevel: 'low' as const
  }
  
  const result = await coordinator.executeWorkflow('/path/to/app', config)
  // Handle result...
}
```

### Progress Monitoring

```typescript
class ProgressLogger implements ProgressNotifier {
  notifyProgress(progress: { token: string; value: number; message?: string }) {
    console.log(`[${progress.value}%] ${progress.message || 'Processing...'}`)
  }
  
  notifyComplete(token: string) {
    console.log('✅ Workflow completed!')
  }
  
  notifyError(token: string, error: string) {
    console.error(`❌ Workflow failed: ${error}`)
  }
}

const coordinator = new WorkflowCoordinator(
  logger,
  undefined, // Use default resource manager
  new ProgressLogger()
)
```

### Session Management

```typescript
async function monitorWorkflows() {
  // List all active sessions
  const sessions = await coordinator.listActiveSessions()
  
  for (const session of sessions) {
    console.log(`Session: ${session.id}`)
    console.log(`  Repository: ${session.repository.name}`)
    console.log(`  Stage: ${session.state.currentStage}`)
    console.log(`  Duration: ${Date.now() - session.startTime.getTime()}ms`)
    
    // Check for stuck sessions (running > 10 minutes)
    if (Date.now() - session.startTime.getTime() > 10 * 60 * 1000) {
      console.log(`  ⚠️  Long-running session detected`)
      
      // Optionally cancel stuck sessions
      await coordinator.cancelWorkflow(session.id)
    }
  }
}
```

## Integration Examples

### Express.js Middleware

```typescript
import express from 'express'
import { WorkflowCoordinator } from './workflows/orchestration/coordinator.js'

const app = express()
const coordinator = new WorkflowCoordinator(logger)

app.post('/containerize', async (req, res) => {
  const { repositoryPath, config } = req.body
  
  try {
    const result = await coordinator.executeWorkflow(repositoryPath, config)
    
    if (result.success) {
      res.json({
        success: true,
        sessionId: result.value.sessionId,
        duration: result.value.duration,
        artifacts: result.value.finalArtifacts
      })
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

app.get('/sessions/:sessionId', async (req, res) => {
  const status = await coordinator.getSessionStatus(req.params.sessionId)
  
  if (status.success) {
    res.json(status.value)
  } else {
    res.status(404).json({ error: status.error })
  }
})
```

### CLI Tool

```typescript
#!/usr/bin/env node
import { Command } from 'commander'
import { WorkflowCoordinator } from './workflows/orchestration/coordinator.js'

const program = new Command()
const coordinator = new WorkflowCoordinator(logger)

program
  .name('containerize')
  .description('Containerize applications with AI assistance')
  .version('1.0.0')

program
  .command('run <repository>')
  .description('Execute containerization workflow')
  .option('--config <file>', 'Configuration file path')
  .option('--env <environment>', 'Target environment (dev|staging|prod)')
  .action(async (repository, options) => {
    const config = options.config ? JSON.parse(fs.readFileSync(options.config)) : {}
    if (options.env) config.targetEnvironment = options.env
    
    const result = await coordinator.executeWorkflow(repository, config)
    
    if (result.success) {
      console.log('✅ Containerization completed successfully!')
      process.exit(0)
    } else {
      console.error('❌ Containerization failed:', result.error)
      process.exit(1)
    }
  })

program
  .command('status <sessionId>')
  .description('Check workflow session status')
  .action(async (sessionId) => {
    const status = await coordinator.getSessionStatus(sessionId)
    
    if (status.success) {
      console.log(JSON.stringify(status.value, null, 2))
    } else {
      console.error('Session not found:', status.error)
    }
  })

program.parse()
```