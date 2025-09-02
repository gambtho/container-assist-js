# User Setup Guide

## Overview
This guide will help you set up the Container Kit MCP Server to work with Claude Desktop or other MCP clients.

## Prerequisites

### Required Software
1. **Node.js 20 or higher**
   - Download from [nodejs.org](https://nodejs.org)
   - Verify: Open terminal and type `node --version`

2. **Docker Desktop**
   - Download from [docker.com](https://docker.com/products/docker-desktop)
   - Start Docker Desktop and ensure it's running

3. **Claude Desktop** (or another MCP client)
   - Download from [claude.ai](https://claude.ai/desktop)

### Optional Software
- **Kubernetes** (for deployment features)
  - Docker Desktop includes Kubernetes
  - Enable in Docker Desktop settings

## Installation Steps

### Step 1: Install the MCP Server

Open terminal/command prompt and run:
```bash
npm install -g @thgamble/containerization-assist-mcp
```

Verify installation:
```bash
container-kit-mcp --version
```

### Step 2: Configure Claude Desktop

1. **Find your configuration file:**
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Edit the configuration:**

Open the file in a text editor and add:

```json
{
  "mcpServers": {
    "container-kit": {
      "command": "container-kit-mcp",
      "args": ["start"],
      "env": {
        "DOCKER_SOCKET": "/var/run/docker.sock",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

For Windows users, adjust the Docker socket:
```json
"env": {
  "DOCKER_SOCKET": "//./pipe/docker_engine"
}
```

3. **Restart Claude Desktop**

### Step 3: Verify Setup

1. Open Claude Desktop
2. Start a new conversation
3. Type: "Can you list the available MCP tools?"
4. Claude should show Container Kit tools

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_SOCKET` | Docker daemon socket path | `/var/run/docker.sock` |
| `KUBECONFIG` | Kubernetes config path | `~/.kube/config` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `SESSION_DIR` | Session storage directory | `~/.container-kit/sessions` |
| `AI_CACHE_TTL` | AI response cache duration (ms) | `900000` (15 min) |

### Advanced Configuration

```json
{
  "mcpServers": {
    "container-kit": {
      "command": "container-kit-mcp",
      "args": [
        "start",
        "--mode", "production",
        "--tools", "all",
        "--progress", "true"
      ],
      "env": {
        "DOCKER_SOCKET": "/var/run/docker.sock",
        "KUBECONFIG": "/home/user/.kube/config",
        "LOG_LEVEL": "debug",
        "SESSION_DIR": "/home/user/.container-kit",
        "ENABLE_CACHE": "true",
        "AI_CACHE_TTL": "1800000"
      }
    }
  }
}
```

## Using Container Kit

### Basic Commands

Ask Claude to:
- "Analyze my Node.js application for containerization"
- "Generate a Dockerfile for this Python project"
- "Build and scan a Docker image"
- "Create Kubernetes deployment manifests"

### Example Workflow

1. **Analyze your project:**
   ```
   "Analyze the repository at /path/to/my-app"
   ```

2. **Generate Dockerfile:**
   ```
   "Create an optimized Dockerfile for this Node.js app"
   ```

3. **Build image:**
   ```
   "Build a Docker image with tag myapp:latest"
   ```

4. **Scan for vulnerabilities:**
   ```
   "Scan the image for security issues"
   ```

5. **Deploy to Kubernetes:**
   ```
   "Generate Kubernetes manifests and deploy the application"
   ```

## Complete Example Session

Here's a typical conversation flow with Claude using Container Kit:

**User:** "I have a Node.js Express application at /home/user/my-app. Can you help me containerize it?"

**Claude:** I'll help you containerize your Node.js Express application. Let me start by analyzing your project structure.

*[Claude calls analyze_repository tool]*

**Claude:** I found a Node.js Express application with the following structure:
- Language: Node.js
- Framework: Express
- Entry point: server.js
- Port: 3000
- Package manager: npm

Now let me generate an optimized Dockerfile for your application.

*[Claude calls generate_dockerfile tool]*

**Claude:** I've created an optimized multi-stage Dockerfile. Now let's build the Docker image.

*[Claude calls build_image tool]*

**Claude:** The image has been built successfully! Let me scan it for security vulnerabilities.

*[Claude calls scan_image tool]*

**Claude:** Great! The security scan found no critical vulnerabilities. Would you like me to create Kubernetes deployment manifests for this application?

**User:** "Yes, please create Kubernetes manifests"

*[Claude calls generate_k8s_manifests tool]*

**Claude:** I've generated complete Kubernetes manifests including Deployment, Service, and ConfigMap. Your application is now ready for containerized deployment!

## Available Tools Reference

### Analysis Tools
- **analyze_repository**: Analyze repository structure and detect language/framework
- **resolve_base_images**: Find optimal base images for applications

### Build Tools
- **generate_dockerfile**: Create optimized Dockerfiles
- **fix_dockerfile**: Fix and optimize existing Dockerfiles
- **build_image**: Build Docker images with progress tracking
- **scan_image**: Security vulnerability scanning with Trivy
- **tag_image**: Tag Docker images
- **push_image**: Push images to registry

### Deployment Tools
- **generate_k8s_manifests**: Create Kubernetes deployment configurations
- **prepare_cluster**: Prepare Kubernetes cluster for deployment
- **deploy_application**: Deploy applications to Kubernetes
- **verify_deployment**: Verify deployment health and status

### Workflow Tools
- **start_workflow**: Start complete containerization workflow
- **workflow_status**: Check workflow progress and status

### Operational Tools
- **list_tools**: List all available tools
- **ping**: Test server connectivity
- **server_status**: Get server health status
- **error_recovery**: Handle and retry failed operations

## Troubleshooting

### Docker Not Found
**Error**: "Docker is not available"

**Solution**:
1. Ensure Docker Desktop is running
2. Check Docker socket path in configuration
3. On Windows, ensure Docker is set to "Linux containers"

### Permission Denied
**Error**: "Permission denied accessing Docker socket"

**Solution** (Linux/Mac):
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### Tools Not Available
**Error**: Claude doesn't see Container Kit tools

**Solution**:
1. Verify server is installed: `container-kit-mcp --version`
2. Check configuration file syntax (valid JSON)
3. Restart Claude Desktop
4. Check logs: `~/.container-kit/logs/`

### Slow Performance
**Solution**:
1. Enable caching in configuration
2. Increase `AI_CACHE_TTL` value
3. Ensure Docker has sufficient resources

### Common Configuration Issues

#### Invalid JSON Syntax
Make sure your `claude_desktop_config.json` is valid JSON:
```json
{
  "mcpServers": {
    "container-kit": {
      "command": "container-kit-mcp",
      "args": ["start"]
    }
  }
}
```

#### Wrong File Path
Ensure you're editing the correct configuration file:
- Check the path matches your operating system
- File should be named exactly `claude_desktop_config.json`
- Create the file if it doesn't exist

#### Command Not Found
If `container-kit-mcp` command is not found:
```bash
# Check if installed globally
npm list -g @thgamble/containerization-assist-mcp

# Reinstall if needed
npm uninstall -g @thgamble/containerization-assist-mcp
npm install -g @thgamble/containerization-assist-mcp
```

## Getting Help

### Logs Location
- **Server logs**: `~/.container-kit/logs/server.log`
- **Session data**: `~/.container-kit/sessions/`

### Debug Mode
Enable debug logging for troubleshooting:
```json
{
  "mcpServers": {
    "container-kit": {
      "command": "container-kit-mcp",
      "args": ["start", "--verbose"],
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Support Resources
- **GitHub Issues**: https://github.com/gambtho/container-assist-js/issues
- **Documentation**: https://github.com/gambtho/container-assist-js#readme

## Security Notes

1. **Never share your configuration file** - it may contain sensitive paths
2. **Review Dockerfiles before building** - AI-generated content should be verified
3. **Scan images before deployment** - Use the built-in scanning tools
4. **Keep software updated** - Regularly update Node.js, Docker, and the MCP server

## Performance Tips

### Optimize for Speed
1. **Use caching**: Enable AI response caching for faster repeated operations
2. **Parallel operations**: Claude can run multiple tools simultaneously
3. **Batch requests**: Combine related operations in single conversations

### Resource Management
1. **Monitor disk space**: Docker images and build contexts can consume significant space
2. **Clean up regularly**: Remove unused images and containers
3. **Limit concurrent builds**: Avoid running multiple builds simultaneously

### Network Optimization
1. **Use local registries**: Reduce push/pull times with local registries
2. **Optimize base images**: Choose smaller, more specific base images
3. **Layer caching**: Structure Dockerfiles for optimal layer reuse

## Updates and Maintenance

### Updating the Server
```bash
# Check current version
container-kit-mcp --version

# Update to latest version
npm update -g @thgamble/containerization-assist-mcp

# Verify update
container-kit-mcp --version
```

### Backup and Restore
Important data locations:
- **Session data**: `~/.container-kit/sessions/`
- **Configuration**: Claude Desktop config file
- **Logs**: `~/.container-kit/logs/`

Create backups before major updates:
```bash
# Create backup directory
mkdir ~/container-kit-backup

# Backup session data
cp -r ~/.container-kit ~/container-kit-backup/

# Backup Claude config
cp "$APPDATA/Claude/claude_desktop_config.json" ~/container-kit-backup/ # Windows
cp "~/Library/Application Support/Claude/claude_desktop_config.json" ~/container-kit-backup/ # Mac
cp ~/.config/Claude/claude_desktop_config.json ~/container-kit-backup/ # Linux
```

Your Container Kit MCP Server is now ready to help you containerize applications efficiently!