# Tools Reference

## Overview
This document provides comprehensive documentation for all MCP tools available in the Container Kit server.

## Tool Categories

### Analysis Tools
- [`analyze_repository`](#analyze_repository) - Analyze repository structure and detect language/framework

### Build Tools
- [`generate_dockerfile`](#generate_dockerfile) - Create optimized Dockerfiles
- [`build_image`](#build_image) - Build Docker images with progress tracking
- [`scan_image`](#scan_image) - Security vulnerability scanning with Trivy
- [`tag_image`](#tag_image) - Tag Docker images
- [`push_image`](#push_image) - Push images to registry

### Deployment Tools
- [`generate_k8s_manifests`](#generate_k8s_manifests) - Create Kubernetes deployment configurations
- [`deploy_application`](#deploy_application) - Deploy applications to Kubernetes

### Operational Tools
- [`ping`](#ping) - Test server connectivity
- [`list_tools`](#list_tools) - List all available tools
- [`server_status`](#server_status) - Get server health status

---

## Tool Specifications

### analyze_repository

**Category**: Analysis  
**Description**: Analyze repository structure and detect language/framework

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "repoPath": {
      "type": "string",
      "description": "Path to the repository to analyze"
    },
    "sessionId": {
      "type": "string",
      "description": "Optional session ID for tracking"
    },
    "depth": {
      "type": "string",
      "enum": ["shallow", "deep"],
      "default": "shallow",
      "description": "Analysis depth level"
    },
    "includeTests": {
      "type": "boolean",
      "default": false,
      "description": "Whether to include test file analysis"
    }
  },
  "required": ["repoPath"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether analysis was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used for analysis"
    },
    "language": {
      "type": "string",
      "description": "Primary programming language detected"
    },
    "languageVersion": {
      "type": "string",
      "description": "Version of the programming language"
    },
    "framework": {
      "type": "string",
      "description": "Framework detected (if any)"
    },
    "frameworkVersion": {
      "type": "string",
      "description": "Version of the framework"
    },
    "buildSystem": {
      "type": "object",
      "properties": {
        "type": {"type": "string"},
        "buildFile": {"type": "string"},
        "buildCommand": {"type": "string"},
        "testCommand": {"type": "string"}
      },
      "description": "Build system information"
    },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "version": {"type": "string"},
          "type": {"type": "string", "enum": ["runtime", "dev", "test"]}
        }
      },
      "description": "Project dependencies"
    },
    "ports": {
      "type": "array",
      "items": {"type": "number"},
      "description": "Detected application ports"
    },
    "hasDockerfile": {
      "type": "boolean",
      "description": "Whether Dockerfile exists"
    },
    "hasDockerCompose": {
      "type": "boolean",
      "description": "Whether docker-compose.yml exists"
    },
    "hasKubernetes": {
      "type": "boolean",
      "description": "Whether Kubernetes manifests exist"
    },
    "recommendations": {
      "type": "object",
      "properties": {
        "baseImage": {"type": "string"},
        "buildStrategy": {"type": "string"},
        "securityNotes": {
          "type": "array",
          "items": {"type": "string"}
        }
      },
      "description": "Containerization recommendations"
    }
  },
  "required": ["success", "language"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Analyze the repository at /path/to/my-app with deep analysis including tests"
```

#### Chain Hint
**Next Tool**: `generate_dockerfile`  
**Reason**: Generate Dockerfile based on analysis results

---

### generate_dockerfile

**Category**: Build  
**Description**: Create optimized Dockerfiles

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID from repository analysis"
    },
    "language": {
      "type": "string",
      "description": "Programming language (if not from analysis)"
    },
    "framework": {
      "type": "string",
      "description": "Framework (if not from analysis)"
    },
    "baseImage": {
      "type": "string",
      "description": "Custom base image to use"
    },
    "optimizations": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Optimization strategies to apply"
    },
    "multistage": {
      "type": "boolean",
      "default": true,
      "description": "Use multi-stage builds"
    }
  },
  "required": ["sessionId"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether generation was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used"
    },
    "dockerfile": {
      "type": "string",
      "description": "Generated Dockerfile content"
    },
    "explanation": {
      "type": "string",
      "description": "Explanation of Dockerfile structure"
    },
    "recommendations": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Additional recommendations"
    }
  },
  "required": ["success", "dockerfile"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Generate an optimized multi-stage Dockerfile for this Node.js Express application"
```

#### Chain Hint
**Next Tool**: `build_image`  
**Reason**: Build Docker image from generated Dockerfile

---

### build_image

**Category**: Build  
**Description**: Build Docker image from Dockerfile with progress tracking

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for tracking"
    },
    "context": {
      "type": "string",
      "default": ".",
      "description": "Build context path"
    },
    "dockerfile": {
      "type": "string",
      "default": "Dockerfile",
      "description": "Path to Dockerfile"
    },
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Tags to apply to built image"
    },
    "buildArgs": {
      "type": "object",
      "additionalProperties": {"type": "string"},
      "description": "Build arguments"
    },
    "target": {
      "type": "string",
      "description": "Build target for multi-stage builds"
    },
    "noCache": {
      "type": "boolean",
      "default": false,
      "description": "Disable build cache"
    },
    "platform": {
      "type": "string",
      "description": "Target platform (e.g., linux/amd64)"
    },
    "push": {
      "type": "boolean",
      "default": false,
      "description": "Push to registry after build"
    },
    "registry": {
      "type": "string",
      "description": "Registry to push to"
    }
  },
  "required": ["sessionId"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether build was successful"
    },
    "imageId": {
      "type": "string",
      "description": "Built image ID"
    },
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Applied tags"
    },
    "size": {
      "type": "number",
      "description": "Image size in bytes"
    },
    "layers": {
      "type": "number",
      "description": "Number of layers"
    },
    "buildTime": {
      "type": "number",
      "description": "Build time in milliseconds"
    },
    "digest": {
      "type": "string",
      "description": "Image digest"
    },
    "warnings": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Security or optimization warnings"
    },
    "metadata": {
      "type": "object",
      "properties": {
        "baseImage": {"type": "string"},
        "platform": {"type": "string"},
        "dockerfile": {"type": "string"},
        "context": {"type": "string"},
        "cached": {"type": "boolean"}
      },
      "description": "Build metadata"
    }
  },
  "required": ["success", "imageId"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Build a Docker image with tags myapp:latest and myapp:v1.0.0"
```

#### Chain Hint
**Next Tool**: `scan_image`  
**Reason**: Scan built image for vulnerabilities

---

### scan_image

**Category**: Build  
**Description**: Security vulnerability scanning with Trivy

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for tracking"
    },
    "imageTag": {
      "type": "string",
      "description": "Image tag to scan"
    },
    "scanner": {
      "type": "string",
      "enum": ["trivy", "grype"],
      "default": "trivy",
      "description": "Scanner to use"
    },
    "severity": {
      "type": "array",
      "items": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
      "description": "Severity levels to include"
    },
    "ignoreUnfixed": {
      "type": "boolean",
      "default": false,
      "description": "Ignore vulnerabilities without fixes"
    },
    "format": {
      "type": "string",
      "enum": ["json", "table"],
      "default": "json",
      "description": "Output format"
    }
  },
  "required": ["sessionId", "imageTag"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether scan was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used"
    },
    "imageTag": {
      "type": "string",
      "description": "Scanned image tag"
    },
    "vulnerabilities": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "severity": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW"]},
          "package": {"type": "string"},
          "version": {"type": "string"},
          "fixedVersion": {"type": "string"},
          "title": {"type": "string"},
          "description": {"type": "string"}
        }
      },
      "description": "Found vulnerabilities"
    },
    "summary": {
      "type": "object",
      "properties": {
        "total": {"type": "number"},
        "critical": {"type": "number"},
        "high": {"type": "number"},
        "medium": {"type": "number"},
        "low": {"type": "number"}
      },
      "description": "Vulnerability summary"
    }
  },
  "required": ["success", "vulnerabilities", "summary"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Scan the myapp:latest image for security vulnerabilities"
```

#### Chain Hint
**Next Tool**: `tag_image` or `push_image`  
**Reason**: Tag or push image if scan results are acceptable

---

### tag_image

**Category**: Build  
**Description**: Tag Docker images

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for tracking"
    },
    "sourceTag": {
      "type": "string",
      "description": "Source image tag"
    },
    "targetTag": {
      "type": "string",
      "description": "Target image tag"
    }
  },
  "required": ["sessionId", "sourceTag", "targetTag"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether tagging was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used"
    },
    "sourceTag": {
      "type": "string",
      "description": "Source image tag"
    },
    "targetTag": {
      "type": "string",
      "description": "Target image tag"
    }
  },
  "required": ["success", "sourceTag", "targetTag"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Tag the myapp:latest image as myapp:v1.0.0"
```

---

### push_image

**Category**: Build  
**Description**: Push images to registry

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for tracking"
    },
    "tag": {
      "type": "string",
      "description": "Image tag to push"
    },
    "registry": {
      "type": "string",
      "description": "Registry URL"
    },
    "username": {
      "type": "string",
      "description": "Registry username"
    },
    "password": {
      "type": "string",
      "description": "Registry password"
    }
  },
  "required": ["sessionId", "tag"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether push was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used"
    },
    "tag": {
      "type": "string",
      "description": "Pushed image tag"
    },
    "registry": {
      "type": "string",
      "description": "Registry used"
    },
    "digest": {
      "type": "string",
      "description": "Push digest"
    }
  },
  "required": ["success", "tag"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Push the myapp:v1.0.0 image to Docker Hub"
```

---

### generate_k8s_manifests

**Category**: Deployment  
**Description**: Create Kubernetes deployment configurations

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for tracking"
    },
    "imageTag": {
      "type": "string",
      "description": "Container image tag"
    },
    "appName": {
      "type": "string",
      "description": "Application name"
    },
    "namespace": {
      "type": "string",
      "default": "default",
      "description": "Kubernetes namespace"
    },
    "replicas": {
      "type": "number",
      "default": 3,
      "description": "Number of replicas"
    },
    "ports": {
      "type": "array",
      "items": {"type": "number"},
      "description": "Application ports"
    },
    "envVars": {
      "type": "object",
      "additionalProperties": {"type": "string"},
      "description": "Environment variables"
    },
    "resources": {
      "type": "object",
      "properties": {
        "requests": {
          "type": "object",
          "properties": {
            "cpu": {"type": "string"},
            "memory": {"type": "string"}
          }
        },
        "limits": {
          "type": "object",
          "properties": {
            "cpu": {"type": "string"},
            "memory": {"type": "string"}
          }
        }
      },
      "description": "Resource requirements"
    }
  },
  "required": ["sessionId", "imageTag"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether generation was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used"
    },
    "manifests": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "apiVersion": {"type": "string"},
          "kind": {"type": "string"},
          "metadata": {
            "type": "object",
            "properties": {
              "name": {"type": "string"},
              "namespace": {"type": "string"},
              "labels": {"type": "object"}
            }
          },
          "spec": {"type": "object"}
        }
      },
      "description": "Generated Kubernetes manifests"
    },
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "content": {"type": "string"}
        }
      },
      "description": "Manifest files"
    }
  },
  "required": ["success", "manifests"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Generate Kubernetes manifests for myapp:v1.0.0 with 3 replicas"
```

#### Chain Hint
**Next Tool**: `deploy_application`  
**Reason**: Deploy the generated manifests to Kubernetes

---

### deploy_application

**Category**: Deployment  
**Description**: Deploy applications to Kubernetes

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Session ID for tracking"
    },
    "manifests": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "apiVersion": {"type": "string"},
          "kind": {"type": "string"},
          "metadata": {"type": "object"},
          "spec": {"type": "object"}
        }
      },
      "description": "Kubernetes manifests to deploy"
    },
    "namespace": {
      "type": "string",
      "default": "default",
      "description": "Target namespace"
    },
    "wait": {
      "type": "boolean",
      "default": true,
      "description": "Wait for deployment to complete"
    },
    "timeout": {
      "type": "number",
      "default": 300,
      "description": "Timeout in seconds"
    }
  },
  "required": ["sessionId"]
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether deployment was successful"
    },
    "sessionId": {
      "type": "string",
      "description": "Session ID used"
    },
    "deployedResources": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": {"type": "string"},
          "name": {"type": "string"},
          "namespace": {"type": "string"},
          "status": {"type": "string"}
        }
      },
      "description": "Deployed resources"
    },
    "services": {
      "type": "array",
      "items": {"type": "string"},
      "description": "Service endpoints"
    },
    "endpoints": {
      "type": "array",
      "items": {"type": "string"},
      "description": "External endpoints"
    }
  },
  "required": ["success", "deployedResources"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Deploy the generated Kubernetes manifests to the production namespace"
```

---

### ping

**Category**: Operational  
**Description**: Test server connectivity

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "default": "ping",
      "description": "Custom message to echo"
    }
  }
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Always true for ping"
    },
    "message": {
      "type": "string",
      "description": "Echo of input message"
    },
    "timestamp": {
      "type": "string",
      "description": "Server timestamp"
    },
    "serverStatus": {
      "type": "string",
      "enum": ["healthy", "degraded"],
      "description": "Server health status"
    }
  },
  "required": ["success", "message", "timestamp", "serverStatus"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Ping the Container Kit server"
```

---

### list_tools

**Category**: Operational  
**Description**: List all available tools

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "enum": ["workflow", "orchestration", "utility"],
      "description": "Filter by tool category"
    }
  }
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether listing was successful"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "description": {"type": "string"},
          "category": {"type": "string"},
          "inputSchema": {"type": "object"}
        }
      },
      "description": "Available tools"
    },
    "count": {
      "type": "number",
      "description": "Total number of tools"
    }
  },
  "required": ["success", "tools", "count"]
}
```

#### Example Usage
```bash
# Claude Desktop
"List all available Container Kit tools"
```

---

### server_status

**Category**: Operational  
**Description**: Get server health status

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "includeMetrics": {
      "type": "boolean",
      "default": false,
      "description": "Include performance metrics"
    }
  }
}
```

#### Output Schema
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether status check was successful"
    },
    "status": {
      "type": "string",
      "enum": ["healthy", "degraded", "down"],
      "description": "Overall server status"
    },
    "version": {
      "type": "string",
      "description": "Server version"
    },
    "uptime": {
      "type": "number",
      "description": "Server uptime in milliseconds"
    },
    "services": {
      "type": "object",
      "additionalProperties": {"type": "boolean"},
      "description": "Service availability status"
    },
    "metrics": {
      "type": "object",
      "description": "Performance metrics (if requested)"
    }
  },
  "required": ["success", "status", "version", "uptime", "services"]
}
```

#### Example Usage
```bash
# Claude Desktop
"Check the Container Kit server status with metrics"
```

---

## Error Responses

All tools return errors in a consistent format:

```json
{
  "error": {
    "code": "TOOL_ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "context": "Additional error context",
      "suggestions": ["Possible solutions"]
    }
  }
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Input validation failed
- `SERVICE_UNAVAILABLE`: Required service (Docker, K8s) not available
- `NOT_FOUND`: Resource (file, image, session) not found
- `PERMISSION_DENIED`: Insufficient permissions
- `TIMEOUT`: Operation timed out
- `INTERNAL_ERROR`: Unexpected server error

## Progress Reporting

Tools that support progress reporting will send progress updates when a `progressToken` is provided:

```json
{
  "method": "notifications/progress",
  "params": {
    "progressToken": "token-123",
    "progress": 0.5,
    "total": 1.0
  }
}
```

Progress values:
- `0.0` - Operation starting
- `0.1` - Validation complete
- `0.3` - Preparation complete
- `0.5` - Main operation in progress
- `0.8` - Finalizing
- `1.0` - Complete

## Tool Chaining

Many tools provide chain hints to suggest the next logical tool to use:

```typescript
interface ChainHint {
  nextTool: string;
  reason: string;
  paramMapper?: (output: any) => Record<string, any>;
}
```

### Common Chains
1. **Full Containerization**: `analyze_repository` → `generate_dockerfile` → `build_image` → `scan_image` → `push_image`
2. **Kubernetes Deployment**: `build_image` → `generate_k8s_manifests` → `deploy_application`
3. **Image Management**: `build_image` → `tag_image` → `push_image`

## Session Management

Most tools use session IDs to maintain state across operations:

1. **Session Creation**: Automatically created during `analyze_repository`
2. **State Persistence**: Tool outputs saved to session
3. **State Access**: Subsequent tools can access previous results
4. **Session Cleanup**: Automatic cleanup after inactivity

## Best Practices

### Input Validation
- Always validate required parameters
- Use appropriate data types
- Check file/path existence before operations

### Error Handling
- Provide meaningful error messages
- Include recovery suggestions
- Log errors with context

### Progress Reporting
- Report progress for operations > 2 seconds
- Use descriptive progress messages
- Update progress at logical milestones

### Security
- Validate all input paths
- Don't expose sensitive information
- Use secure defaults

### Performance
- Cache results where appropriate
- Use efficient algorithms
- Implement timeouts for external calls

## Integration Examples

### Claude Desktop Configuration
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

### Programmatic Usage
```typescript
import { ContainerKitMCPServer } from '@thgamble/containerization-assist-mcp';

const server = new ContainerKitMCPServer();
await server.start();

const result = await server.callTool('analyze_repository', {
  repoPath: '/path/to/project',
  depth: 'deep'
});
```

This comprehensive reference provides all the information needed to effectively use the Container Kit MCP server tools.