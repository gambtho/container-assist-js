# Getting Started with Containerization Assistant

## Quick Start (5 minutes)

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **Docker** (version 20.10 or higher)
- **kubectl** (optional, for Kubernetes deployments)
- **Git** (for repository access)

### Installation

```bash
# Clone and build the project
git clone <repository-url>
cd containerization-assist-js
npm install
npm run build

# Start the MCP server
npm run start
```

### Basic Configuration

The MCP server automatically enhances all tools with AI capabilities. No additional configuration is required for basic usage.

Optional configuration file (`.containerization-config.json`):

```json
{
  "ai": {
    "enabled": true,
    "model": "gpt-4"
  },
  "docker": {
    "registry": "docker.io",
    "timeout": 300
  },
  "kubernetes": {
    "context": "default",
    "namespace": "default"
  }
}
```

### Your First Containerization

Using the MCP tools through your MCP client:

```javascript
// Analyze a repository
const analysis = await client.callTool({
  name: 'analyze-repo',
  arguments: {
    repoPath: './my-app',
    sessionId: 'session-123'
  }
});

// Generate Dockerfile
const dockerfile = await client.callTool({
  name: 'generate-dockerfile', 
  arguments: {
    sessionId: 'session-123'
    // Language and framework inferred from previous analysis
  }
});
```

The MCP server provides 14 enhanced tools that can:
1. **Analyze** your repository structure with AI insights
2. **Generate** optimized Dockerfiles
3. **Build** Docker images with progress tracking
4. **Scan** for security vulnerabilities
5. **Create** Kubernetes manifests
6. **Deploy** applications with verification
7. **Orchestrate** complete workflows

### Understanding the Output

During execution, you'll see progress updates:

```
✓ Analyzing repository structure... (2.1s)
✓ Generating Dockerfile candidates... (15.3s)
  → Generated 3 candidates
  → Selected winner (score: 87.5/100)
✓ Building Docker image... (45.2s)
  → Image size: 187MB
  → Build successful
✓ Scanning for vulnerabilities... (8.7s)
  → Found 2 medium, 1 low vulnerabilities
  → No critical issues
✓ Generating Kubernetes manifests... (3.4s)
  → Created deployment, service, configmap
✓ Deploying to development environment... (25.6s)
  → 3/3 replicas ready
✓ Verifying deployment... (12.1s)
  → Health checks passing
  → API endpoints responding

🎉 Containerization completed successfully!

📋 Summary:
   Session ID: session_abc123_def456
   Total time: 2m 32s
   Image: your-app:latest
   Service: http://your-app-service:3000
   
📁 Artifacts saved to: ./containerization-output/
```

### Next Steps

- **Customize the workflow**: Edit `.containerize.yml` for your needs
- **Review artifacts**: Check generated files in `./containerization-output/`
- **Deploy to staging**: Use `--target-env staging`
- **Set up CI/CD**: Integrate with your pipeline

## MCP Tools Overview

### Repository Analysis Tools

```javascript
// Analyze repository structure and dependencies
await client.callTool({
  name: 'analyze-repo',
  arguments: { repoPath: './my-app', sessionId: 'session-123' }
});

// Resolve optimal base images
await client.callTool({
  name: 'resolve-base-images',
  arguments: { language: 'node', sessionId: 'session-123' }
});
```

### Docker Management Tools

```javascript
// Generate optimized Dockerfile
await client.callTool({
  name: 'generate-dockerfile',
  arguments: { sessionId: 'session-123' }
});

// Build Docker image with progress
await client.callTool({
  name: 'build-image',
  arguments: {
    dockerfilePath: './Dockerfile',
    tag: 'my-app:latest',
    sessionId: 'session-123'
  }
});

// Security scan
await client.callTool({
  name: 'scan',
  arguments: { imageName: 'my-app:latest', sessionId: 'session-123' }
});
```

### Kubernetes Tools

```javascript
// Generate K8s manifests
await client.callTool({
  name: 'generate-k8s-manifests',
  arguments: {
    appName: 'my-app',
    imageName: 'my-app:latest',
    sessionId: 'session-123'
  }
});

// Deploy to cluster
await client.callTool({
  name: 'deploy',
  arguments: {
    manifestPath: './k8s/',
    namespace: 'default',
    sessionId: 'session-123'
  }
});
```

### Workflow Orchestration

```javascript
// Complete containerization workflow
await client.callTool({
  name: 'workflow',
  arguments: {
    workflowType: 'containerization',
    repoPath: './my-app',
    buildImage: true,
    scanImage: true,
    sessionId: 'session-123'
  }
});
```

## Configuration Options

### Workflow Preferences

```yaml
workflow:
  # Sampling configuration
  sampling:
    enabled: true          # Enable candidate generation
    maxCandidates: 3       # Number of candidates to generate
    timeout: 60            # Timeout in seconds
  
  # Build configuration
  build:
    timeout: 300           # Build timeout in seconds
    enableCache: true      # Enable Docker layer caching
    buildArgs:             # Custom build arguments
      NODE_ENV: production
  
  # Security configuration
  security:
    maxVulnerabilityLevel: medium  # high, medium, low, critical
    autoRemediation: true          # Auto-fix vulnerabilities
    maxRemediationAttempts: 2      # Max remediation tries
  
  # Deployment configuration
  deployment:
    targetEnvironment: dev         # dev, staging, prod
    strategy: rolling             # rolling, blue-green, canary
    autoVerification: true        # Auto-verify deployment
  
  # Resource management
  resources:
    keepArtifacts: false          # Keep intermediate artifacts
    ttl: 3600                     # Resource TTL in seconds
```

### Environment-Specific Settings

```yaml
environments:
  development:
    deployment:
      replicas: 1
      resources:
        cpu: 100m
        memory: 256Mi
      debug: true
  
  staging:
    deployment:
      replicas: 2
      resources:
        cpu: 500m
        memory: 512Mi
      monitoring: true
  
  production:
    deployment:
      replicas: 3
      resources:
        cpu: 1000m
        memory: 1Gi
      monitoring: true
      security:
        enforceSecurityPolicies: true
```

## Troubleshooting

### Common Issues

#### "Repository analysis failed"
- **Cause**: Unsupported project structure or missing files
- **Solution**: Ensure your project has standard configuration files (package.json, requirements.txt, etc.)
- **Example**: 
  ```bash
  # Add missing package.json for Node.js projects
  npm init -y
  ```

#### "Build failed: dependency installation"
- **Cause**: Network issues or missing dependencies
- **Solution**: Check internet connection and dependency specifications
- **Example**:
  ```bash
  # Test dependency installation locally
  npm install
  # or
  pip install -r requirements.txt
  ```

#### "Deployment failed: insufficient resources"
- **Cause**: Kubernetes cluster doesn't have enough resources
- **Solution**: Reduce resource requests or scale your cluster
- **Example**:
  ```yaml
  # Reduce resource requests in .containerize.yml
  environments:
    dev:
      deployment:
        resources:
          cpu: 50m      # Reduced from 100m
          memory: 128Mi # Reduced from 256Mi
  ```

### Getting Help

#### Command Line Help
```bash
# General help
containerize --help

# Command-specific help
containerize build --help

# Check configuration
containerize config --validate
```

#### Debug Mode
```bash
# Enable verbose logging
containerize --repo . --debug

# Save logs to file
containerize --repo . --log-file containerize.log
```

#### Status and Monitoring
```bash
# Check workflow status
containerize status --session session_abc123_def456

# List active workflows
containerize list --active

# View session artifacts
containerize artifacts --session session_abc123_def456
```

## What's Next?

Now that you've started with the containerization assistant:

1. **[Learn about MCP Server Features](./mcp-server.md)** - Explore all 14 enhanced tools
2. **[Read the Architecture Guide](./ARCHITECTURE.md)** - Understand the system design
3. **[Check the Testing Guide](./guides/testing.md)** - Learn how to test your setup
4. **[Review Quality Management](./guides/quality-management.md)** - Code quality best practices

For more help, visit our [documentation index](./README.md) or check the main project [README](../README.md).