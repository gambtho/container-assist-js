# MCP Server Testing Guide for MCP Inspector

## Overview
This guide helps you test the containerization-assist MCP server using MCP Inspector, including how to chain tools together with proper parameters.

## Available Tools and Their Parameters

### 1. Core Analysis Tool
**Tool: `analyze-repo`**
```json
{
  "sessionId": "test-session-001",
  "repoPath": "/path/to/your/project",
  "depth": 3,
  "includeTests": true
}
```
Output provides: `language`, `framework`, `buildSystem`, and `recommendations.baseImage`

### 2. Dockerfile Generation
**Tool: `generate-dockerfile`**
```json
{
  "sessionId": "test-session-001",
  "baseImage": "node:18-alpine",
  "optimization": true,
  "multistage": true,
  "securityHardening": true
}
```
Output provides: `path` (to generated Dockerfile), `content`

### 3. Build Docker Image
**Tool: `build-image`**
```json
{
  "sessionId": "test-session-001",
  "dockerfilePath": "/path/to/Dockerfile",
  "contextPath": "/path/to/project",
  "buildArgs": {},
  "noCache": false
}
```
Output provides: `imageId`, `tags`, `size`

### 4. Scan Image for Vulnerabilities
**Tool: `scan`**
```json
{
  "sessionId": "test-session-001",
  "imageId": "sha256:abc123...",
  "severity": "high",
  "ignoreUnfixed": false
}
```
Output provides: `vulnerabilities`, `summary`

### 5. Tag Docker Image
**Tool: `tag`**
```json
{
  "sessionId": "test-session-001",
  "imageId": "sha256:abc123...",
  "tags": ["myapp:v1.0.0", "myapp:latest"]
}
```
Output provides: `tags`, `imageId`

### 6. Operations Tools
**Tool: `ops`**
```json
{
  "sessionId": "test-session-001",
  "operation": "status"
}
```
Operations: "ping", "status", "health"

### 7. Kubernetes Deployment Tools

#### Generate K8s Manifests
**Tool: `generate-k8s-manifests`**
```json
{
  "sessionId": "test-session-001",
  "deploymentName": "my-app",
  "image": "myregistry/myapp:v1.0.0",
  "namespace": "default",
  "replicas": 3,
  "port": 8080
}
```

#### Prepare Cluster
**Tool: `prepare-cluster`**
```json
{
  "sessionId": "test-session-001",
  "context": "docker-desktop",
  "namespace": "my-app",
  "createNamespace": true
}
```

#### Deploy Application
**Tool: `deploy`**
```json
{
  "sessionId": "test-session-001",
  "manifestPaths": ["/path/to/deployment.yaml"],
  "namespace": "my-app",
  "context": "docker-desktop",
  "wait": true,
  "timeout": 300
}
```

#### Verify Deployment
**Tool: `verify-deployment`**
```json
{
  "sessionId": "test-session-001",
  "deploymentName": "my-app",
  "namespace": "my-app",
  "timeout": 60
}
```

### 8. Registry Operations

#### Push Image
**Tool: `push`**
```json
{
  "sessionId": "test-session-001",
  "imageId": "sha256:abc123...",
  "registry": "docker.io/myusername",
  "tag": "v1.0.0"
}
```

#### Resolve Base Images
**Tool: `resolve-base-images`**
```json
{
  "sessionId": "test-session-001",
  "language": "javascript",
  "framework": "express"
}
```

#### Fix Dockerfile Issues
**Tool: `fix-dockerfile`**
```json
{
  "sessionId": "test-session-001",
  "dockerfilePath": "/path/to/Dockerfile",
  "issues": ["security", "optimization"]
}
```

## Workflow Tools

### Complete Containerization Workflow
**Tool: `containerization-workflow`**
```json
{
  "sessionId": "test-session-001",
  "projectPath": "/path/to/your/project",
  "buildOptions": {
    "contextPath": "/path/to/project",
    "buildArgs": {},
    "tags": ["myapp:latest"],
    "noCache": false
  },
  "scanOptions": {
    "severity": "high",
    "ignoreUnfixed": false
  }
}
```

### Deployment Workflow
**Tool: `deployment-workflow`**
```json
{
  "sessionId": "test-session-001",
  "imageId": "sha256:abc123...",
  "deploymentName": "my-app",
  "namespace": "production",
  "replicas": 3,
  "port": 8080
}
```

## Manual Tool Chaining Examples

### Example 1: Basic Containerization Flow
Chain these tools in sequence:

1. **Start with analysis:**
```json
// Tool: analyze-repo
{
  "sessionId": "manual-chain-001",
  "repoPath": "/home/user/my-node-app",
  "includeTests": true
}
```

2. **Generate Dockerfile (use baseImage from step 1's output):**
```json
// Tool: generate-dockerfile
{
  "sessionId": "manual-chain-001",
  "baseImage": "node:18-alpine",  // From analysis recommendations
  "optimization": true,
  "multistage": true
}
```

3. **Build the image (use dockerfile path from step 2):**
```json
// Tool: build-image
{
  "sessionId": "manual-chain-001",
  "dockerfilePath": "/home/user/my-node-app/Dockerfile",  // From step 2 output
  "contextPath": "/home/user/my-node-app"
}
```

4. **Scan the built image (imageId will be in session from step 3):**
```json
// Tool: scan
{
  "sessionId": "manual-chain-001",
  "imageId": "sha256:xyz789...",  // From step 3 output
  "severity": "high"
}
```

5. **Tag the image:**
```json
// Tool: tag
{
  "sessionId": "manual-chain-001",
  "imageId": "sha256:xyz789...",  // From step 3 output
  "tags": ["my-app:v1.0.0", "my-app:latest"]
}
```

### Example 2: Deployment Flow
After containerization:

1. **Generate K8s manifests:**
```json
// Tool: generate-k8s-manifests
{
  "sessionId": "deploy-chain-001",
  "deploymentName": "my-node-app",
  "image": "my-app:v1.0.0",  // From tagging step
  "namespace": "production",
  "replicas": 2,
  "port": 3000
}
```

2. **Prepare the cluster:**
```json
// Tool: prepare-cluster
{
  "sessionId": "deploy-chain-001",
  "context": "docker-desktop",
  "namespace": "production",
  "createNamespace": true
}
```

3. **Deploy the application:**
```json
// Tool: deploy
{
  "sessionId": "deploy-chain-001",
  "manifestPaths": ["/path/to/deployment.yaml"],  // From step 1
  "namespace": "production",
  "wait": true
}
```

4. **Verify deployment:**
```json
// Tool: verify-deployment
{
  "sessionId": "deploy-chain-001",
  "deploymentName": "my-node-app",
  "namespace": "production"
}
```

## Important Notes for Testing

### Session Management
- **sessionId** is REQUIRED for all tools
- Use the same sessionId across chained tools to maintain state
- The session stores intermediate results that later tools can access

### Finding Output Values
When chaining tools, outputs from previous steps provide inputs for next steps:
- `analyze-repo` → provides `recommendations.baseImage`
- `generate-dockerfile` → provides `path` to Dockerfile
- `build-image` → provides `imageId` and initial `tags`
- `scan` → provides vulnerability report (doesn't affect chain)
- `tag` → provides final `tags` array

### Common Testing Scenarios

#### Quick Test (using workflow)
Use the containerization-workflow for a complete test:
```json
{
  "sessionId": "quick-test-001",
  "projectPath": "/path/to/test/project"
}
```

#### Step-by-Step Test
Test each tool individually to understand the flow:
1. Create a test sessionId: "step-test-001"
2. Run analyze-repo first
3. Use outputs to populate next tool's inputs
4. Continue through the chain

#### Error Testing
Test with invalid parameters to see error handling:
```json
{
  "sessionId": "error-test-001",
  "repoPath": "/nonexistent/path"
}
```

### Tips for MCP Inspector Usage

1. **Start Simple**: Begin with the `ops` tool to verify connection:
```json
{
  "sessionId": "test",
  "operation": "ping"
}
```

2. **Use Workflows for Complete Flows**: The workflow tools handle all the parameter passing automatically

3. **Check Session State**: Some tools read from session state (like `scan` can find imageId from previous `build-image`)

4. **Watch Logs**: The server logs will show what's happening internally

5. **Validate Paths**: Ensure all file paths are absolute and exist on your system

## Troubleshooting

### Missing Parameters
If you get "missing required parameter" errors:
- Check the tool schema in the registry
- Ensure sessionId is always provided
- Some tools have conditional requirements

### Session Not Found
If tools can't find session data:
- Ensure you're using the same sessionId
- Run tools in the correct order
- Check that previous tools completed successfully

### Docker/Kubernetes Errors
- Ensure Docker daemon is running for image operations
- Ensure kubectl is configured for K8s operations
- Check that you have necessary permissions

## Testing Workflow

1. Start MCP server
2. Connect MCP Inspector
3. List available tools to verify registration
4. Run a simple `ops` ping test
5. Try a complete workflow
6. Test individual tools with manual chaining
7. Verify error handling with invalid inputs