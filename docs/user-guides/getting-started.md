# Getting Started with Containerization Workflow

## Quick Start (5 minutes)

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **Docker** (version 20.10 or higher)
- **kubectl** (for Kubernetes deployments)
- **Git** (for repository access)

### Installation

```bash
# Install the containerization assistant
npm install -g @containerization/assistant

# Verify installation
containerize --version
```

### Basic Configuration

Create a configuration file in your project root (optional):

```yaml
# .containerize.yml
workflow:
  sampling:
    enabled: true
    maxCandidates: 3
  
  build:
    timeout: 300
    enableCache: true
  
  deployment:
    targetEnvironment: dev
    strategy: rolling
```

### Your First Containerization

Let's containerize a simple Node.js application:

```bash
# Navigate to your project directory
cd /path/to/your/node-app

# Start the containerization workflow
containerize --repo .

# Or with specific configuration
containerize --repo . --config .containerize.yml
```

The workflow will:
1. **Analyze** your repository structure
2. **Generate** multiple Dockerfile candidates
3. **Build** the selected Docker image
4. **Scan** for security vulnerabilities
5. **Create** Kubernetes manifests
6. **Deploy** to your target environment
7. **Verify** the deployment

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

## Common Use Cases

### Node.js Applications

```bash
# Express.js API
containerize --repo . --framework express

# Next.js application
containerize --repo . --framework nextjs --build-static
```

### Python Applications

```bash
# Django application
containerize --repo . --framework django

# FastAPI service
containerize --repo . --framework fastapi
```

### Java Applications

```bash
# Spring Boot application
containerize --repo . --framework spring-boot

# Maven multi-module project
containerize --repo . --build-system maven --main-module api
```

### Multi-Service Applications

```bash
# Specify which service to containerize
containerize --repo . --service api

# Containerize multiple services
containerize --repo . --services api,worker,frontend
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

Now that you've successfully containerized your first application, you can:

1. **[Explore Advanced Features](./advanced-configuration.md)** - Custom sampling, security policies, monitoring
2. **[Set Up CI/CD Integration](../integration/ci-cd-setup.md)** - Automate your containerization workflow  
3. **[Learn About Troubleshooting](./troubleshooting.md)** - Common issues and solutions
4. **[Understand the Architecture](./workflow-overview.md)** - Deep dive into how it all works

For more help, visit our [documentation](../README.md) or [open an issue](https://github.com/your-org/containerization-assistant/issues).