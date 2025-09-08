# Containerization Assist MCP Server

A Model Context Protocol (MCP) server for AI-powered containerization workflows with Docker and Kubernetes support.

## Features

- 🐳 **Docker Integration**: Build, scan, and deploy container images
- ☸️ **Kubernetes Support**: Generate manifests and deploy applications
- 🤖 **AI-Powered**: Intelligent Dockerfile generation and optimization
- 🔄 **Workflow Orchestration**: Complete containerization pipelines
- 📊 **Progress Tracking**: Real-time progress updates via MCP
- 🔒 **Security Scanning**: Built-in vulnerability scanning with Trivy

## Quick Start

### Installation

#### As an MCP Server
```bash
npm install -g @thgamble/containerization-assist-mcp
```

#### For Development
```bash
git clone https://github.com/gambtho/container-assist-js.git
cd container-assist-js
npm install
npm run build
```

### Usage

#### With Claude Desktop

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

For Windows users:
```json
{
  "mcpServers": {
    "containerization-assist": {
      "command": "containerization-assist-mcp",
      "args": ["start"],
      "env": {
        "DOCKER_SOCKET": "//./pipe/docker_engine",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

#### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector containerization-assist-mcp start
```

#### Programmatic Usage

```typescript
import { ContainerizationAssistMCPServer } from '@thgamble/containerization-assist-mcp';

const server = new ContainerizationAssistMCPServer();
await server.start();
```

## Available Tools

| Tool | Category | Description |
|------|----------|-------------|
| `analyze_repository` | Analysis | Analyze repository structure and detect language/framework |
| `resolve_base_images` | Build | Find optimal base images for applications |
| `generate_dockerfile` | Build | Create optimized Dockerfiles |
| `generate_dockerfile_ext` | Build | Extended Dockerfile generation with AI |
| `fix_dockerfile` | Build | Fix and optimize existing Dockerfiles |
| `build_image` | Build | Build Docker images with progress tracking |
| `scan_image` | Build | Security vulnerability scanning with Trivy |
| `tag_image` | Build | Tag Docker images |
| `push_image` | Build | Push images to registry |
| `generate_k8s_manifests` | Deploy | Create Kubernetes deployment configurations |
| `prepare_cluster` | Deploy | Prepare Kubernetes cluster for deployment |
| `deploy_application` | Deploy | Deploy applications to Kubernetes |
| `verify_deployment` | Deploy | Verify deployment health and status |
| `start_workflow` | Workflow | Start complete containerization workflow |
| `workflow_status` | Workflow | Check workflow progress and status |
| `ping` | Ops | Test server connectivity |
| `server_status` | Ops | Get server health status |
| `registry` | Ops | Tool registry operations |
| `error_recovery` | Ops | Handle and retry failed operations |

## System Requirements

- Node.js 20+
- Docker or Docker Desktop
- Optional: Kubernetes (for deployment features)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_SOCKET` | Docker daemon socket path | `/var/run/docker.sock` |
| `KUBECONFIG` | Kubernetes config path | `~/.kube/config` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `SESSION_DIR` | Session storage directory | `~/.containerization-assist/sessions` |
| `AI_CACHE_TTL` | AI response cache duration (ms) | `900000` (15 min) |
| `K8S_NAMESPACE` | Default Kubernetes namespace | `default` |
| `DOCKER_REGISTRY` | Default Docker registry | `docker.io` |

### Advanced Configuration

```json
{
  "mcpServers": {
    "containerization-assist": {
      "command": "containerization-assist-mcp",
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
        "SESSION_DIR": "/home/user/.containerization-assist",
        "ENABLE_CACHE": "true",
        "AI_CACHE_TTL": "1800000"
      }
    }
  }
}
```

## Architecture

### System Design

```
┌─────────────────────────────────────────┐
│            MCP Client (Claude)          │
└─────────────────┬───────────────────────┘
                  │ MCP Protocol
┌─────────────────▼───────────────────────┐
│          MCP Server Layer               │
│  ┌─────────────────────────────────┐    │
│  │     Tool Registry & Router      │    │
│  └─────────────────────────────────┘    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Application Layer               │
│  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │  Tools   │ │Workflow  │ │Session │  │
│  └──────────┘ └──────────┘ └────────┘  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Infrastructure Layer            │
│  ┌──────┐ ┌──────┐ ┌─────┐ ┌────────┐  │
│  │Docker│ │ K8s  │ │ AI  │ │Session │  │
│  └──────┘ └──────┘ └─────┘ └────────┘  │
└─────────────────────────────────────────┘
```

### Project Structure

```
src/
├── app/             # Application entry point and dependency injection
├── cli/             # CLI entry points
├── config/          # Configuration management
├── domain/          # Core types and business logic
├── infrastructure/  # External system adapters (Docker, Kubernetes)
├── lib/             # Libraries and shared utilities
├── mcp/             # MCP server implementation
│   ├── client/      # MCP client implementation
│   ├── sampling/    # AI sampling services
│   ├── server/      # MCP server core
│   ├── tools/       # Tool registration and validation
│   └── utils/       # MCP utilities
├── prompts/         # AI prompt management
├── resources/       # Resource management and caching
├── tools/           # Tool implementations (co-located pattern)
│   ├── analyze-repo/
│   │   ├── tool.ts    # Tool implementation
│   │   ├── schema.ts  # Zod schema definition
│   │   └── index.ts   # Public exports
│   └── [tool-name]/   # Same structure for each tool
└── workflows/       # Workflow orchestration
    ├── orchestration/ # Complex workflow coordination
    └── sampling/      # Sampling-based workflows
dist/                # Built output (ESM modules)
scripts/             # Build and automation scripts
test/                # Test files
```

## Example Usage

### Basic Workflow

Ask Claude to:
- "Analyze my Node.js application for containerization"
- "Generate a Dockerfile for this Python project"
- "Build and scan a Docker image"
- "Create Kubernetes deployment manifests"

### Step-by-Step Example

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

## Supported Technologies

### Languages
- Java (8-21)
- Node.js/TypeScript
- Python (3.8+)
- Go (1.19+)
- .NET/C# (6.0+)
- Ruby, PHP, Rust

### Frameworks
- **Java**: Spring Boot, Quarkus, Micronaut
- **Node.js**: Express, NestJS, Fastify, Next.js
- **Python**: FastAPI, Django, Flask
- **Go**: Gin, Echo, Fiber
- **.NET**: ASP.NET Core, Blazor

### Build Systems
- Maven, Gradle (Java)
- npm, yarn, pnpm (Node.js)
- pip, poetry, pipenv (Python)
- go mod (Go)
- dotnet CLI (.NET)

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
**Error**: Claude doesn't see Containerization Assist tools

**Solution**:
1. Verify server is installed: `containerization-assist-mcp --version`
2. Check configuration file syntax (valid JSON)
3. Restart Claude Desktop
4. Check logs: `~/.containerization-assist/logs/`

## Documentation

Comprehensive documentation is available in the [docs](./docs) directory:

- **[Getting Started](./docs/getting-started.md)** - Installation, setup, and first use
- **[Development Guide](./docs/development.md)** - Development setup, testing, and contribution
- **[Architecture](./docs/architecture.md)** - System design, MCP features, and API reference
- **[Claude Code Guidelines](./CLAUDE.md)** - Specific guidelines for Claude Code development

## Development

### Commands

#### Build & Development
```bash
npm run build          # Fast development build with tsdown
npm run build:prod     # Production build with minification
npm run build:watch    # Watch mode with auto-rebuild
npm run dev            # Development server with auto-reload
npm start              # Start production server
npm run clean          # Clean dist directory
```

#### Code Quality
```bash
npm run lint           # ESLint code linting
npm run lint:fix       # Auto-fix ESLint issues
npm run typecheck      # TypeScript type checking
npm run format         # Prettier code formatting
npm run format:check   # Check formatting without changes
npm run validate       # Run lint + typecheck + test
```

#### Quality Gates & Validation
```bash
npm run validate:pr:fast   # Quick PR validation (30s)
npm run validate:pr        # Full PR validation with coverage
npm run quality:check      # Comprehensive quality analysis
npm run quality:gates      # TypeScript + quality analysis
npm run baseline:report    # Quick quality summary
npm run baseline:lint      # Set new lint baseline
npm run check:quick        # Fast type + lint check
npm run fix:all           # Auto-fix lint + format
```

#### Testing
```bash
npm test                   # Run all tests
npm run test:unit          # Unit tests with bail
npm run test:unit:quick    # Unit tests with 10s timeout
npm run test:integration   # Integration tests
npm run test:coverage      # Generate coverage report
npm run test:ci            # Fast CI tests
npm run test:watch         # Watch mode for development
```

### Code Standards

- **Build System**: Ultra-fast tsdown (esbuild-based) - 10-100x faster than tsc
- **TypeScript**: Strict mode with ES2022 modules and native ESM support
- **Imports**: Path aliases supported (@app, @mcp, @tools, etc.) for clean imports
- **Architecture**: Clean layered separation with strict boundaries
- **Error Handling**: Result<T> monad pattern throughout
- **Quality Gates**: Automated lint ratcheting prevents regression
- **Testing**: Comprehensive unit and integration tests

### Project Health

- **ESLint Warnings**: 700 (baseline enforced, 46% reduction from initial)
- **ESLint Errors**: 9 (must be fixed before PR)
- **TypeScript Errors**: 45 (work in progress)
- **Dead Code**: 234 unused exports (47% reduction)
- **Build Time**: < 1 second
- **Test Coverage**: > 70%


## License

MIT License - See [LICENSE](LICENSE) file for details.

## Support

- GitHub Issues: https://github.com/gambtho/container-assist-js/issues
- Documentation: https://github.com/gambtho/container-assist-js#readme