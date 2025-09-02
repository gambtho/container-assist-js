# Changelog

All notable changes to Container Kit MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-beta.1] - 2025-09-02

### Added
- **Complete JavaScript Implementation**: Full rewrite of Go MCP server in JavaScript/Node.js
- **MCP Sampling Integration**: AI operations powered by MCP's sampling API (Claude Code, Copilot)
- **15 MCP Tools**: All workflow, orchestration, and utility tools implemented
  - 10 Workflow tools: analyze_repository, generate_dockerfile, build_image, scan_image, tag_image, push_image, generate_k8s_manifests, prepare_cluster, deploy_application, verify_deployment
  - 2 Orchestration tools: start_workflow, workflow_status  
  - 3 Utility tools: list_tools, ping, server_status
- **In-Memory Session Management**: Fast session storage with atomic updates
- **NPM Package Exports**: Individual tool handlers exportable for flexible usage
- **Docker Integration**: Dockerode library with CLI fallback support
- **Kubernetes Integration**: @kubernetes/client-node with kubectl fallback
- **Multi-Language Support**: Java, JavaScript, Python, .NET Core analysis
- **Comprehensive Testing**: 39/39 tests passing with feature parity validation
- **Production Build System**: Optimized distribution with asset copying
- **CLI Binary**: Compatible command-line interface

### Changed
- **Runtime**: Node.js 20+ (from Go runtime)
- **AI Integration**: MCP Sampling API (from external API calls)
- **Session Storage**: In-memory store (from BoltDB, SQLite available when needed)
- **Package Structure**: NPM-optimized exports and distribution

### Compatibility
- **Backward Compatible**: NPM interface maintains compatibility with existing consumers
- **Parameter Support**: Both snake_case and camelCase parameters accepted
- **Response Structure**: Maintains Result<T> pattern from Go implementation
- **Feature Parity**: All functionality equivalent to Go version

### Technical Details
- **Dependencies**: @modelcontextprotocol/sdk ^0.5.0, dockerode ^4.0.0, @kubernetes/client-node ^0.20.0
- **Build Target**: ES modules with Node.js 20+
- **Type Safety**: Zod schemas for runtime validation
- **Logging**: Pino structured logging with secret redaction
- **Testing**: Jest with ES modules support
- **Distribution Size**: ~495KB

## [1.0.0] - 2024 (Go Implementation)

### Initial Release
- Go-based MCP server implementation
- 15 containerization tools
- BoltDB session persistence
- External AI API integration
- Complete Docker and Kubernetes support

---

For detailed migration information, see [MIGRATION.md](MIGRATION.md).