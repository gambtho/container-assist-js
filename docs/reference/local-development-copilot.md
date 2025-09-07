# Running MCP Server Locally with GitHub Copilot

This guide explains how to run the Containerization Assist MCP server using your local development code instead of the published npm package in GitHub Copilot.

## Prerequisites

- VS Code version 1.102 or later
- Node.js 18+ installed
- GitHub Copilot extension installed
- MCP support enabled in VS Code (default: `chat.mcp.enabled: true`)

## Quick Start (Hot Reload)

The project includes a pre-configured `.vscode/mcp.json` file that enables hot reload development:

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

### Steps to Use

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Restart VS Code** to load the MCP configuration

3. **Open GitHub Copilot Chat** - the server will start automatically

4. **Start coding** - any changes to TypeScript files will automatically restart the server

## Alternative Configurations

### Using Built JavaScript Files

If you prefer to build first and run the compiled JavaScript:

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Update `.vscode/mcp.json`**:
   ```json
   {
     "servers": {
       "containerization-assist": {
         "command": "node",
         "args": ["./dist/src/cli/cli.js"],
         "env": {
           "MCP_MODE": "true",
           "MCP_QUIET": "true"
         }
       }
     }
   }
   ```

### Using npm run dev

For development with the project's dev script:

```json
{
  "servers": {
    "containerization-assist-dev": {
      "command": "npm",
      "args": ["run", "dev"],
      "env": {
        "MCP_MODE": "true",
        "MCP_QUIET": "true"
      }
    }
  }
}
```

## Available Tools

Once running, the following 14 enhanced tools are available in Copilot Chat:

- `analyze-repo` - Repository structure analysis
- `generate-dockerfile` - Dockerfile generation
- `build-image` - Docker image building
- `scan` - Vulnerability scanning
- `push` - Registry push operations
- `tag` - Image tagging
- `workflow` - Orchestrated workflows
- `fix-dockerfile` - Dockerfile issue resolution
- `resolve-base-images` - Base image selection
- `prepare-cluster` - Kubernetes cluster preparation
- `ops` - Operational tasks
- `deploy` - Application deployment
- `generate-k8s-manifests` - Kubernetes manifest generation
- `verify-deployment` - Deployment verification

## Configuration File Locations

MCP servers can be configured in different locations:

- **Workspace-specific**: `.vscode/mcp.json` (recommended for development)
- **User settings**: Use command **MCP: Open User Configuration** in VS Code
- **Remote settings**: Use **MCP: Open Remote User Configuration** for remote development

## Troubleshooting

### Server Not Starting

1. Check VS Code version is 1.102+
2. Verify MCP is enabled: `chat.mcp.enabled: true`
3. Restart VS Code after configuration changes
4. Check the Output panel for MCP-related errors

### Hot Reload Not Working

1. Ensure `tsx` is installed: `npm install`
2. Check file paths are correct in `mcp.json`
3. Verify the `watch` argument is included in the args array

### Permission Issues

If you encounter permission issues on Unix-like systems:
```bash
chmod +x scripts/mcp-start.sh
```

## Development Workflow

1. **Make code changes** in any `.ts` file under `src/`
2. **Server auto-restarts** with hot reload
3. **Test in Copilot Chat** immediately
4. **Check logs** in VS Code Output panel (select "MCP" from dropdown)

## Security Notes

- MCP servers run with local system access
- Only use trusted server configurations
- VS Code will prompt for confirmation on first run
- Review tool permissions before allowing execution

## Related Documentation

- [MCP Server Features](../mcp-server.md) - Complete feature documentation
- [Getting Started](../getting-started.md) - General setup guide
- [Development Guide](../guides/development.md) - Development best practices
- [Testing Guide](../guides/testing.md) - Testing MCP functionality

## Additional Resources

- [VS Code MCP Documentation](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [GitHub MCP Server Guide](https://github.blog/ai-and-ml/generative-ai/a-practical-guide-on-how-to-use-the-github-mcp-server/)