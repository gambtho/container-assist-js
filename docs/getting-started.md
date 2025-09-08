# Getting Started

This guide will help you install, configure, and use the Containerization Assistant MCP Server.

## Prerequisites

- **Node.js** 18 or higher
- **Docker** 20.10 or higher  
- **kubectl** (optional, for Kubernetes deployments)
- **Git** (for development setup)

## Installation

### As an MCP Server (Recommended)

```bash
npm install -g @thgamble/containerization-assist-mcp
```

### For Development

```bash
git clone https://github.com/gambtho/container-assist-js.git
cd container-assist-js
npm install
npm run build
```

## Configuration

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "containerization-assist": {
      "command": "containerization-assist-mcp",
      "args": ["start"],
      "env": {
        "DOCKER_SOCKET": "/var/run/docker.sock",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

For Windows users, use:
```json
"DOCKER_SOCKET": "//./pipe/docker_engine"
```

### With VS Code / GitHub Copilot

For local development with hot reload, the project includes `.vscode/mcp.json`:

```json
{
  "servers": {
    "containerization-assist-dev": {
      "command": "npx",
      "args": ["tsx", "watch", "./src/cli/cli.ts"],
      "env": {
        "MCP_MODE": "true",
        "MCP_QUIET": "true",
        "NODE_ENV": "development"
      }
    }
  }
}
```

Simply restart VS Code to enable the MCP server in GitHub Copilot.

### With MCP Inspector

```bash
# Using installed package
npx @modelcontextprotocol/inspector containerization-assist-mcp start

# Using local development
npx @modelcontextprotocol/inspector npx tsx src/cli/cli.ts
```

## First Containerization

### Using MCP Tools

The server provides 14 enhanced tools that work together seamlessly:

```javascript
// 1. Analyze your repository
const analysis = await client.callTool({
  name: 'analyze_repository',
  arguments: {
    repoPath: './my-app',
    sessionId: 'session-123'
  }
});

// 2. Generate optimized Dockerfile
const dockerfile = await client.callTool({
  name: 'generate_dockerfile',
  arguments: {
    sessionId: 'session-123'
    // Parameters inferred from analysis
  }
});

// 3. Build and scan image
const build = await client.callTool({
  name: 'build_image',
  arguments: {
    sessionId: 'session-123',
    imageName: 'my-app:latest'
  }
});

// 4. Deploy to Kubernetes (optional)
const deployment = await client.callTool({
  name: 'deploy_application',
  arguments: {
    sessionId: 'session-123',
    namespace: 'default'
  }
});
```

### Using Workflows

For complete containerization pipelines:

```javascript
const workflow = await client.callTool({
  name: 'start_workflow',
  arguments: {
    workflowType: 'containerization',
    repoPath: './my-app',
    sessionId: 'session-123'
  }
});
```

Available workflows:
- **containerization**: Complete flow from analysis to deployment
- **deployment**: Kubernetes deployment with verification
- **security**: Vulnerability scanning and remediation
- **optimization**: Image size and performance optimization

## Available Tools

| Tool | Description |
|------|-------------|
| `analyze_repository` | Analyze repository structure and detect language/framework |
| `resolve_base_images` | Find optimal base images for applications |
| `generate_dockerfile` | Create optimized Dockerfiles |
| `generate_dockerfile_ext` | Extended Dockerfile generation with AI |
| `fix_dockerfile` | Fix and optimize existing Dockerfiles |
| `build_image` | Build Docker images with progress tracking |
| `scan_image` | Security vulnerability scanning with Trivy |
| `tag_image` | Tag Docker images |
| `push_image` | Push images to registry |
| `generate_k8s_manifests` | Create Kubernetes deployment configurations |
| `prepare_cluster` | Prepare Kubernetes cluster for deployment |
| `deploy_application` | Deploy applications to Kubernetes |
| `verify_deployment` | Verify deployment health and status |
| `start_workflow` | Start complete containerization workflow |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_SOCKET` | Docker socket path | `/var/run/docker.sock` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `MCP_MODE` | Enable MCP mode | `true` |
| `MCP_QUIET` | Suppress non-MCP output | `true` |
| `NODE_ENV` | Environment (development, production) | `production` |

## Configuration File

Create `.containerization-config.json` in your project root:

```json
{
  "ai": {
    "enabled": true,
    "model": "gpt-4"
  },
  "docker": {
    "registry": "docker.io",
    "timeout": 300,
    "buildkit": true
  },
  "kubernetes": {
    "context": "default",
    "namespace": "default"
  },
  "security": {
    "scanOnBuild": true,
    "blockOnCritical": false
  }
}
```

## Troubleshooting

### Docker Connection Issues

```bash
# Check Docker is running
docker ps

# Check socket permissions (Linux/Mac)
ls -la /var/run/docker.sock

# For Windows, ensure Docker Desktop is running
```

### MCP Connection Issues

```bash
# Test with MCP Inspector
npx @modelcontextprotocol/inspector containerization-assist-mcp start

# Check logs
containerization-assist-mcp start --log-level debug
```

### Build Issues

```bash
# Clean build
npm run clean
npm run build

# Check TypeScript compilation
npm run typecheck

# Run tests
npm test
```

## Next Steps

- Review the [Architecture Guide](./architecture.md) to understand the system design
- Check the [Development Guide](./development.md) for contributing
- Explore the [Main README](../README.md) for all available commands