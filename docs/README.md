# Containerization Assistant Documentation

Welcome to the Containerization Assistant MCP Server documentation.

## Quick Navigation

- **[Getting Started](./getting-started.md)** - Installation, setup, and first containerization
- **[Development Guide](./development.md)** - Development setup, testing, and contribution guidelines  
- **[Architecture](./architecture.md)** - System design, MCP features, and API reference

## Overview

The Containerization Assistant is a Model Context Protocol (MCP) server that provides AI-powered containerization workflows with Docker and Kubernetes support. It offers 14 enhanced tools for analyzing, building, scanning, and deploying containerized applications.

### Key Features

- 🐳 **Docker Integration**: Build, scan, and deploy container images
- ☸️ **Kubernetes Support**: Generate manifests and deploy applications
- 🤖 **AI-Powered**: Intelligent Dockerfile generation and optimization
- 🔄 **Workflow Orchestration**: Complete containerization pipelines
- 📊 **Progress Tracking**: Real-time progress updates via MCP
- 🔒 **Security Scanning**: Built-in vulnerability scanning with Trivy

## Quick Start

```bash
# Install as MCP server
npm install -g @thgamble/containerization-assist-mcp

# Run with MCP Inspector
npx @modelcontextprotocol/inspector containerization-assist-mcp start
```

For detailed setup instructions, see the [Getting Started Guide](./getting-started.md).

## Project Links

- **Main README**: [../README.md](../README.md) - Project overview and commands
- **CLAUDE.md**: [../CLAUDE.md](../CLAUDE.md) - Guidelines for Claude Code development
- **GitHub Repository**: [github.com/gambtho/container-assist-js](https://github.com/gambtho/container-assist-js)