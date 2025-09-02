# Container Kit MCP Server - TypeScript Implementation

A TypeScript MCP server for AI-powered containerization workflows with Docker and Kubernetes support. Provides 15 specialized MCP tools for complete application containerization from analysis to deployment.

## Current Status

🔧 **TypeScript Recovery in Progress** - Actively fixing compilation errors (146 remaining from initial 316).

### What's Working
- ✅ MCP server protocol with @modelcontextprotocol/sdk 
- ✅ 15 tool registry with automated registration
- ✅ Clean 3-layer architecture (API/Service/Domain/Infrastructure)
- ✅ Session management with persistence
- ✅ Configuration management system
- ✅ Workflow orchestration foundation

### Currently Being Fixed
- 🔧 TypeScript compilation errors (146 remaining)
- 🔧 Tool implementation syntax issues
- 🔧 Logger standardization across service layer

## Quick Start

### Installation

```bash
cd js-mcp
npm install
npm run build
```

### Running the Server

```bash
# Start the MCP server
npm start

# Or run in development mode with auto-reload
npm run start:dev
```

### Testing Connectivity

```bash
# Test with the ping tool
echo '{"jsonrpc":"2.0","method":"tools/ping","params":{},"id":1}' | ./dist/bin/cli.js
```

## Available Tools

### Workflow Tools
- `analyze_repository` - Analyze Java repository structure
- `resolve_base_images` - Find optimal JDK/JRE base images
- `generate_dockerfile` - Create multi-stage Dockerfile
- `build_image` - Build Docker image
- `scan_image` - Security vulnerability scanning
- `tag_image` - Tag Docker images
- `push_image` - Push to registry
- `generate_k8s_manifests` - Create Kubernetes manifests
- `prepare_cluster` - Prepare K8s cluster
- `deploy_application` - Deploy to Kubernetes
- `verify_deployment` - Verify deployment health

### Orchestration Tools
- `start_workflow` - Start complete containerization workflow
- `workflow_status` - Check workflow progress

### Utility Tools
- `list_tools` - List all available tools
- `ping` - Test connectivity
- `server_status` - Get server status

### Error Recovery Tools  
- `error_recovery` - Handle and retry failed operations
- `workflow_rollback` - Rollback partial workflow state

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# MCP Server Configuration
MCP_SERVER_NAME=container-kit-mcp
LOG_LEVEL=info
SESSION_TIMEOUT=3600000

# Docker Configuration  
DOCKER_SOCKET=/var/run/docker.sock
DOCKER_REGISTRY=localhost:5000
DOCKER_BUILD_TIMEOUT=600

# Kubernetes Configuration
KUBECONFIG=~/.kube/config
K8S_NAMESPACE=default
K8S_DEPLOYMENT_TIMEOUT=300

# AI Configuration
ENABLE_AI_OPTIMIZATION=true
AI_PROVIDER=mcp-sampling
MAX_RETRIES=3
```

## Example Usage

### Analyze a Repository

```javascript
{
  "method": "tools/analyze_repository", 
  "params": {
    "repo_path": "/path/to/project",
    "language": "java",
    "frameworks": ["spring-boot"]
  }
}
```

### Start Complete Workflow

```javascript
{
  "method": "tools/start_workflow",
  "params": {
    "repo_path": "/path/to/project",
    "session_id": "workflow-123",
    "options": {
      "scan_vulnerabilities": true,
      "deploy_to_k8s": true,
      "optimize_image": true
    }
  }
}
```

## Project Structure

```
js-mcp/
├── src/
│   ├── bin/                      # CLI entry point
│   ├── service/                  # Service layer
│   │   ├── config/               # Configuration management
│   │   ├── tools/                # 15 MCP tools with handlers
│   │   └── session/              # Session management service
│   ├── domain/                   # Domain layer
│   │   ├── types/                # Domain types (Session, Workflow, Result)
│   │   └── workflow/             # Workflow orchestration logic
│   └── infrastructure/           # Infrastructure layer
│       ├── ai/                   # AI sampling integration
│       ├── core/                 # Core utilities (Docker, K8s)  
│       └── persistence/          # Session persistence
├── test/                         # Comprehensive test suites
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── performance/              # Performance tests
├── dist/                         # Compiled TypeScript output
└── docs/                         # Architecture documentation
```

## Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design and technical architecture
- **[Development Guide](docs/DEVELOPMENT.md)** - Development setup and guidelines  
- **[Contributing](docs/CONTRIBUTING.md)** - How to contribute to the project
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Production deployment instructions
- **[Maintenance Guide](docs/MAINTENANCE_GUIDE.md)** - Operations and maintenance procedures

## Development Commands

```bash
# Quality checks
npm run typecheck     # TypeScript validation
npm run lint          # ESLint code linting  
npm run format        # Prettier code formatting
npm run validate      # Run all quality checks

# Testing
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage # Test coverage report

# Build and run
npm run build         # Build TypeScript to dist/
npm run start:dev     # Development mode with auto-reload
npm start             # Production mode
```

For detailed development setup, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Application Support

### Languages & Build Systems
- **Java**: Maven, Gradle, Ant
- **Node.js**: npm, yarn, pnpm
- **Python**: pip, poetry, pipenv
- **Go**: go.mod
- **Docker**: Multi-stage builds, optimization

### Frameworks  
- **Java**: Spring Boot, Quarkus, Micronaut, Jakarta EE
- **Node.js**: Express, NestJS, Fastify
- **Python**: FastAPI, Django, Flask
- **Go**: Gin, Echo, Fiber

### Container Optimization
- Multi-stage builds for smaller images
- Base image selection and security scanning
- JVM/runtime tuning for containerized environments
- Health check and readiness probe generation

## Architecture Benefits

- **Clean Architecture**: 3-layer separation with clear dependencies
- **Session Persistence**: Stateful workflows with BoltDB storage  
- **Type Safety**: Full TypeScript with Zod schema validation
- **MCP Protocol**: Standard tool interface for AI integration
- **Error Recovery**: Robust error handling with retry mechanisms

## License

Same as the parent Container Kit project