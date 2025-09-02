# Container Kit Examples

This directory contains complete example projects demonstrating Container Kit MCP Server capabilities across different languages and frameworks.

## Available Examples

### 📁 Application Examples
- [`java-spring-boot/`](java-spring-boot/) - Java Spring Boot REST API with database
- [`nodejs-express/`](nodejs-express/) - Node.js Express API with TypeScript  
- [`python-fastapi/`](python-fastapi/) - Python FastAPI service with async support
- [`multi-service/`](multi-service/) - Multi-service application with Docker Compose

### 📁 Workflow Examples
- [`workflows/`](workflows/) - Complete workflow JSON configurations
- [`scripts/`](scripts/) - Automation scripts for common scenarios
- [`ci-cd/`](ci-cd/) - CI/CD integration examples

## Quick Start

### 1. Choose an Example
```bash
cd examples/nodejs-express
```

### 2. Run Analysis
```bash
# Using MCP server
echo '{
  "jsonrpc": "2.0",
  "method": "tools/analyze_repository", 
  "params": {
    "repo_path": "'$(pwd)'"
  },
  "id": 1
}' | ../../dist/bin/cli.js
```

### 3. Start Complete Workflow
```bash
echo '{
  "jsonrpc": "2.0",
  "method": "tools/start_workflow",
  "params": {
    "repo_path": "'$(pwd)'",
    "workflow_type": "full"
  },
  "id": 1  
}' | ../../dist/bin/cli.js
```

## Example Structure

Each example follows this structure:
```
example-name/
├── README.md           # Specific example documentation
├── src/               # Application source code
├── package.json       # Dependencies and scripts
├── .env.example       # Environment configuration template
├── docker-compose.yml # Local development stack (if applicable)
└── k8s/              # Kubernetes manifests (generated)
    ├── deployment.yaml
    ├── service.yaml
    └── configmap.yaml
```

## Integration Patterns

### Manual Tool Calls
```javascript
// Step-by-step workflow
const tools = [
  { method: 'tools/analyze_repository', params: { repo_path: './my-app' }},
  { method: 'tools/generate_dockerfile', params: { session_id: 'session-123' }},
  { method: 'tools/build_image', params: { session_id: 'session-123' }},
  { method: 'tools/scan_image', params: { session_id: 'session-123' }}
]

for (const tool of tools) {
  const result = await callMCPTool(tool)
  console.log(`${tool.method}: ${result.success ? '✅' : '❌'}`)
}
```

### Automated Workflows
```javascript
// Complete automation
const workflow = {
  method: 'tools/start_workflow',
  params: {
    repo_path: './my-app',
    workflow_type: 'full',
    options: {
      registry_url: 'registry.example.com',
      namespace: 'production',
      auto_rollback: true
    }
  }
}

const result = await callMCPTool(workflow)
```

### Custom Workflows
```javascript
// Build-only with custom options
const customWorkflow = {
  method: 'tools/start_workflow', 
  params: {
    repo_path: './my-app',
    workflow_type: 'build-only',
    options: {
      optimization: 'size',
      security_hardening: true,
      skip_tests: false,
      custom_instructions: 'Add nginx reverse proxy'
    }
  }
}
```

## Testing Examples

Each example includes test scenarios:

### Unit Testing
```bash
cd examples/nodejs-express
npm test
```

### Integration Testing  
```bash
# Test complete workflow
npm run test:workflow

# Test Docker build
npm run test:docker

# Test Kubernetes deployment
npm run test:k8s
```

### Performance Testing
```bash
# Benchmark workflow execution
npm run benchmark
```

## CI/CD Integration

### GitHub Actions
```yaml
# .github/workflows/containerize.yml
name: Containerize with MCP
on: [push]

jobs:
  containerize:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Container Kit MCP
        run: |
          npm install -g containerization-assist-js
          container-kit-mcp --health-check
      
      - name: Containerize Application
        run: |
          echo '{
            "method": "tools/start_workflow",
            "params": {
              "repo_path": ".",
              "workflow_type": "full", 
              "options": {
                "registry_url": "${{ secrets.REGISTRY_URL }}",
                "namespace": "production"
              }
            }
          }' | container-kit-mcp
```

### GitLab CI
```yaml
# .gitlab-ci.yml  
containerize:
  image: node:18-alpine
  script:
    - npm install -g containerization-assist-js
    - container-kit-mcp --validate
    - |
      echo '{
        "method": "tools/start_workflow",
        "params": {
          "repo_path": ".",
          "workflow_type": "build-only"
        }
      }' | container-kit-mcp
  artifacts:
    paths:
      - Dockerfile
      - k8s/
```

## Advanced Scenarios

### Multi-Environment Deployment
```javascript
// Deploy to multiple environments
const environments = ['staging', 'production']

for (const env of environments) {
  await callMCPTool({
    method: 'tools/start_workflow',
    params: {
      workflow_type: 'deploy-only',
      session_id: 'build-session-123',
      options: {
        namespace: env,
        registry_url: `registry-${env}.example.com`,
        auto_rollback: env === 'production'
      }
    }
  })
}
```

### Blue/Green Deployment
```javascript
// Blue/Green deployment workflow
const blueGreenDeploy = async () => {
  // Deploy to green environment
  const greenDeploy = await callMCPTool({
    method: 'tools/deploy_application',
    params: {
      session_id: 'bg-session',
      options: {
        namespace: 'green-prod',
        deployment_strategy: 'blue-green'
      }
    }
  })

  // Health check green environment
  const healthCheck = await callMCPTool({
    method: 'tools/verify_deployment',
    params: {
      session_id: 'bg-session',
      options: {
        namespace: 'green-prod',
        timeout: 300
      }
    }
  })

  if (healthCheck.success) {
    // Switch traffic to green
    await callMCPTool({
      method: 'tools/switch_traffic',
      params: { 
        from: 'blue-prod',
        to: 'green-prod'
      }
    })
  }
}
```

## Troubleshooting

### Common Issues

#### Build Failures
```javascript
// Debug build issues
const debug = await callMCPTool({
  method: 'tools/build_image',
  params: {
    session_id: 'debug-session',
    options: {
      verbose: true,
      debug: true,
      no_cache: true
    }
  }
})
```

#### Deployment Issues  
```javascript
// Check deployment status
const status = await callMCPTool({
  method: 'tools/verify_deployment',
  params: {
    session_id: 'deploy-session',
    options: {
      detailed_status: true,
      include_events: true,
      include_logs: true
    }
  }
})
```

#### Registry Issues
```javascript
// Test registry connectivity
const registryTest = await callMCPTool({
  method: 'tools/test_registry',
  params: {
    registry_url: 'registry.example.com',
    test_push: true,
    test_pull: true
  }
})
```

## Performance Optimization

### Caching Strategies
```javascript
// Enable build caching
const optimizedBuild = {
  method: 'tools/build_image',
  params: {
    session_id: 'cached-session',
    options: {
      enable_cache: true,
      cache_from: ['my-app:latest'],
      build_args: {
        BUILDKIT_INLINE_CACHE: '1'
      }
    }
  }
}
```

### Parallel Execution
```javascript
// Parallel workflow steps
const parallelWorkflow = {
  method: 'tools/start_workflow',
  params: {
    workflow_type: 'full',
    options: {
      parallel_steps: true,
      max_concurrency: 4
    }
  }
}
```

## Next Steps

1. **Try Basic Examples**: Start with `nodejs-express` or `java-spring-boot`
2. **Customize Workflows**: Modify examples for your use case
3. **Integration Testing**: Test with your existing CI/CD pipeline
4. **Production Deployment**: Follow deployment guides for production use

For detailed documentation on each tool and workflow, see the [tools documentation](../docs/tools/).

Happy containerizing! 🚀