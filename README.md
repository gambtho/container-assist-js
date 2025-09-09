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

See the [Getting Started Guide](./docs/getting-started.md) for detailed setup instructions including Claude Desktop, MCP Inspector, and programmatic usage.

## Available Tools

| Tool | Category | Description |
|------|----------|-------------|
| `analyze_repository` | Analysis | Analyze repository structure and detect language/framework |
| `resolve_base_images` | Build | Find optimal base images for applications |
| `generate_dockerfile` | Build | Create optimized Dockerfiles |
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
| `ops` | Ops | Operational tools (ping, health, registry)

## System Requirements

- Node.js 20+
- Docker or Docker Desktop
- Optional: Kubernetes (for deployment features)

## Configuration

See the [Getting Started Guide](./docs/getting-started.md) for detailed configuration options including environment variables and advanced configurations.

## Architecture

See the [Architecture Guide](./docs/architecture.md) for detailed system design, component breakdown, and technical implementation details.

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

For common issues and solutions, see the [Getting Started Guide](./docs/getting-started.md#troubleshooting).

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
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests via MCP Inspector
npm run test:coverage      # Generate coverage report
npm run test:mcp           # MCP server integration tests
npm run validate:pr:fast   # Complete validation pipeline
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