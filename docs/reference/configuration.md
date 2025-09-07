# Configuration Reference

## Overview

The Containerization Assistant MCP Server supports various configuration options for customizing AI services, Docker operations, Kubernetes integration, and workflow behavior.

## Configuration Files

### Environment Variables

```bash
# AI Service Configuration
AI_MODEL=gpt-4                    # AI model to use
AI_API_KEY=your-api-key          # API key for AI service
AI_TIMEOUT=30000                 # AI request timeout (ms)

# Docker Configuration  
DOCKER_HOST=unix:///var/run/docker.sock  # Docker daemon socket
DOCKER_REGISTRY=docker.io        # Default registry
DOCKER_BUILD_TIMEOUT=300         # Build timeout (seconds)

# Kubernetes Configuration
KUBERNETES_CONFIG_PATH=~/.kube/config  # Kubeconfig file path
KUBERNETES_CONTEXT=default       # Default context
KUBERNETES_NAMESPACE=default     # Default namespace

# Logging Configuration
LOG_LEVEL=info                   # Log level (debug, info, warn, error)
LOG_FORMAT=json                  # Log format (json, text)

# Development Configuration
NODE_ENV=development             # Environment (development, production)
DEBUG=containerization:*         # Debug namespaces
```

### Configuration File (.containerization-config.json)

```json
{
  "ai": {
    "enabled": true,
    "model": "gpt-4",
    "timeout": 30000,
    "maxRetries": 3,
    "mock": false
  },
  "docker": {
    "registry": "docker.io",
    "timeout": 300,
    "buildArgs": {
      "NODE_ENV": "production"
    },
    "enableBuildCache": true
  },
  "kubernetes": {
    "context": "default",
    "namespace": "default",
    "timeout": 120,
    "dryRun": false
  },
  "security": {
    "scanImages": true,
    "maxVulnerabilityLevel": "medium",
    "autoRemediation": true
  },
  "logging": {
    "level": "info",
    "format": "json",
    "enableMetrics": true
  },
  "session": {
    "ttl": 3600,
    "maxSessions": 100,
    "persistState": false
  }
}
```

## Configuration Sections

### AI Service Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable AI-powered features |
| `model` | string | "gpt-4" | AI model to use |
| `timeout` | number | 30000 | Request timeout in milliseconds |
| `maxRetries` | number | 3 | Maximum retry attempts |
| `mock` | boolean | false | Use mock AI responses for testing |

**Example**:
```json
{
  "ai": {
    "enabled": true,
    "model": "gpt-4",
    "timeout": 30000,
    "maxRetries": 3,
    "mock": false
  }
}
```

### Docker Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `registry` | string | "docker.io" | Default Docker registry |
| `timeout` | number | 300 | Build timeout in seconds |
| `buildArgs` | object | {} | Default build arguments |
| `enableBuildCache` | boolean | true | Enable Docker build cache |

**Example**:
```json
{
  "docker": {
    "registry": "gcr.io/my-project",
    "timeout": 600,
    "buildArgs": {
      "NODE_ENV": "production",
      "BUILD_VERSION": "1.0.0"
    },
    "enableBuildCache": true
  }
}
```

### Kubernetes Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `context` | string | "default" | Kubernetes context to use |
| `namespace` | string | "default" | Default namespace |
| `timeout` | number | 120 | Operation timeout in seconds |
| `dryRun` | boolean | false | Enable dry-run mode |

**Example**:
```json
{
  "kubernetes": {
    "context": "production-cluster",
    "namespace": "my-app",
    "timeout": 300,
    "dryRun": false
  }
}
```

### Security Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scanImages` | boolean | true | Enable vulnerability scanning |
| `maxVulnerabilityLevel` | string | "medium" | Maximum acceptable vulnerability level |
| `autoRemediation` | boolean | true | Enable automatic remediation |

**Vulnerability Levels**: `critical`, `high`, `medium`, `low`

**Example**:
```json
{
  "security": {
    "scanImages": true,
    "maxVulnerabilityLevel": "high",
    "autoRemediation": true
  }
}
```

### Logging Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | string | "info" | Log level |
| `format` | string | "json" | Log format |
| `enableMetrics` | boolean | true | Enable performance metrics |

**Log Levels**: `debug`, `info`, `warn`, `error`
**Log Formats**: `json`, `text`

**Example**:
```json
{
  "logging": {
    "level": "debug",
    "format": "text",
    "enableMetrics": true
  }
}
```

### Session Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | number | 3600 | Session TTL in seconds |
| `maxSessions` | number | 100 | Maximum concurrent sessions |
| `persistState` | boolean | false | Persist session state to disk |

**Example**:
```json
{
  "session": {
    "ttl": 7200,
    "maxSessions": 50,
    "persistState": true
  }
}
```

## Tool-Specific Configuration

### Repository Analysis

```json
{
  "tools": {
    "analyze-repo": {
      "timeout": 60,
      "excludePatterns": [
        "node_modules/**",
        ".git/**",
        "dist/**"
      ],
      "includeLanguages": ["javascript", "typescript", "python", "go"],
      "enableAI": true
    }
  }
}
```

### Dockerfile Generation

```json
{
  "tools": {
    "generate-dockerfile": {
      "baseImageStrategy": "minimal",
      "securityOptimized": true,
      "multiStage": true,
      "enableCache": true
    }
  }
}
```

### Image Building

```json
{
  "tools": {
    "build-image": {
      "timeout": 600,
      "buildArgs": {
        "BUILD_ENV": "production"
      },
      "enableProgress": true,
      "cleanup": true
    }
  }
}
```

### Vulnerability Scanning

```json
{
  "tools": {
    "scan": {
      "scanners": ["trivy", "grype"],
      "timeout": 300,
      "failOnVulnerabilities": true,
      "ignoreUnfixed": false
    }
  }
}
```

## Workflow Configuration

### Containerization Workflow

```json
{
  "workflows": {
    "containerization": {
      "steps": {
        "analyze": { "timeout": 60 },
        "generate": { "strategy": "optimized" },
        "build": { "timeout": 600 },
        "scan": { "failOnCritical": true },
        "push": { "cleanup": true }
      },
      "enableParallel": true,
      "enableRollback": true
    }
  }
}
```

### Deployment Workflow

```json
{
  "workflows": {
    "deployment": {
      "strategy": "rolling",
      "replicas": 3,
      "healthCheck": {
        "enabled": true,
        "timeout": 300,
        "retries": 5
      },
      "autoRollback": true
    }
  }
}
```

## Environment-Specific Configuration

### Development Environment

```json
{
  "environments": {
    "development": {
      "docker": {
        "enableCache": true,
        "buildArgs": { "NODE_ENV": "development" }
      },
      "kubernetes": {
        "dryRun": true,
        "namespace": "dev"
      },
      "logging": {
        "level": "debug"
      }
    }
  }
}
```

### Production Environment

```json
{
  "environments": {
    "production": {
      "docker": {
        "registry": "gcr.io/prod-project",
        "timeout": 1200
      },
      "kubernetes": {
        "context": "production-cluster",
        "namespace": "production"
      },
      "security": {
        "maxVulnerabilityLevel": "high",
        "scanImages": true
      },
      "logging": {
        "level": "warn",
        "enableMetrics": true
      }
    }
  }
}
```

## Configuration Loading

### Priority Order

1. Environment variables (highest priority)
2. Configuration file (`.containerization-config.json`)
3. Command line arguments
4. Default values (lowest priority)

### Configuration File Locations

The system searches for configuration files in the following order:

1. `./containerization-config.json` (current directory)
2. `~/.containerization/config.json` (user home)
3. `/etc/containerization/config.json` (system-wide)

### Runtime Configuration

```javascript
// Programmatic configuration
import { createMCPServer } from './src/mcp/server';

const server = createMCPServer({
  ai: {
    enabled: true,
    model: 'gpt-4'
  },
  docker: {
    registry: 'my-registry.io'
  }
});
```

## Validation

### Configuration Validation

The system automatically validates configuration on startup:

```bash
# Validate configuration
npm run config:validate

# Show current configuration
npm run config:show
```

### Schema Validation

Configuration is validated against JSON schemas:

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "ai": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "model": { "type": "string" },
        "timeout": { "type": "number", "minimum": 1000 }
      }
    }
  }
}
```

## Troubleshooting

### Common Configuration Issues

1. **Invalid JSON format**:
   - Use a JSON validator to check syntax
   - Ensure proper escaping of strings

2. **Missing environment variables**:
   - Check that required variables are set
   - Use `.env` files for development

3. **Path resolution issues**:
   - Use absolute paths where possible
   - Check file permissions and access

4. **Network configuration**:
   - Verify Docker daemon accessibility
   - Check Kubernetes cluster connectivity
   - Validate registry access and credentials

### Debug Configuration

```bash
# Debug configuration loading
DEBUG=config:* npm run start

# Show resolved configuration
npm run config:debug

# Validate against schema
npm run config:validate --verbose
```

## Related Documentation

- [Development Guide](../guides/development.md) - Development setup and workflow
- [MCP Server Features](../mcp-server.md) - Server capabilities and usage
- [Architecture Guide](../ARCHITECTURE.md) - System architecture overview