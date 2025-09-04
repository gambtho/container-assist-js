#!/usr/bin/env node
/**
 * Containerization Assist MCP CLI
 * Command-line interface for the Containerization Assist MCP Server
 */

import { program } from 'commander';
import { ContainerizationAssistMCPServer } from './server.js';
import { createConfig, logConfigSummaryIfDev } from '../src/config/index.js';
import { createPinoLogger } from '../src/infrastructure/logger.js';
import { exit, argv, env, cwd } from 'node:process';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Handle both development (apps/) and production (dist/apps/) paths
const packageJsonPath = __dirname.includes('dist')
  ? join(__dirname, '../../package.json') // dist/apps/ -> root
  : join(__dirname, '../package.json'); // apps/ -> root
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// Lazy logger creation to avoid cleanup issues on --help
let _logger: any = null;
function getLogger() {
  if (!_logger) {
    _logger = createPinoLogger({ service: 'cli', useStderr: true });
  }
  return _logger;
}

program
  .name('containerization-assist-mcp')
  .description('MCP server for AI-powered containerization workflows')
  .version(packageJson.version)
  .option('--config <path>', 'path to configuration file (.env)')
  .option('--log-level <level>', 'logging level: debug, info, warn, error (default: info)', 'info')
  .option('--workspace <path>', 'workspace directory path (default: current directory)', cwd())
  .option('--port <port>', 'port for HTTP transport (default: stdio)', parseInt)
  .option('--host <host>', 'host for HTTP transport (default: localhost)', 'localhost')
  .option('--dev', 'enable development mode with debug logging')
  .option('--mock', 'use mock AI sampler for testing')
  .option('--validate', 'validate configuration and exit')
  .option('--list-tools', 'list all registered MCP tools and exit')
  .option('--health-check', 'perform system health check and exit')
  .option(
    '--docker-socket <path>',
    'Docker socket path (default: /var/run/docker.sock)',
    '/var/run/docker.sock',
  )
  .option(
    '--k8s-namespace <namespace>',
    'default Kubernetes namespace (default: default)',
    'default',
  )
  .addHelpText(
    'after',
    `

Examples:
  $ containerization-assist-mcp                           Start server with stdio transport
  $ containerization-assist-mcp --port 3000              Start server on HTTP port 3000
  $ containerization-assist-mcp --dev --log-level debug  Start in development mode with debug logs
  $ containerization-assist-mcp --list-tools             Show all available MCP tools
  $ containerization-assist-mcp --health-check           Check system dependencies
  $ containerization-assist-mcp --validate               Validate configuration

Quick Start:
  1. Copy .env.example to .env and configure
  2. Run: containerization-assist-mcp --health-check
  3. Start server: containerization-assist-mcp
  4. Test with: echo '{"method":"tools/ping","params":{},"id":1}' | containerization-assist-mcp

MCP Tools Available:
  • Analysis: analyze_repository, resolve_base_images
  • Build: generate_dockerfile, build_image, scan_image
  • Registry: tag_image, push_image
  • Deploy: generate_k8s_manifests, deploy_application
  • Orchestration: start_workflow, workflow_status
  • Utilities: ping, server_status

For detailed documentation, see: docs/tools/README.md
For examples and tutorials, see: examples/README.md

Environment Variables:
  LOG_LEVEL                 Logging level (debug, info, warn, error)
  WORKSPACE_DIR            Working directory for operations
  DOCKER_SOCKET            Docker daemon socket path
  K8S_NAMESPACE            Default Kubernetes namespace
  MOCK_MODE                Enable mock mode for testing
  NODE_ENV                 Environment (development, production)
`,
  );

program.parse(argv);

const options = program.opts();

// Validation function for CLI options
function validateOptions(opts: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (opts.logLevel && !validLogLevels.includes(opts.logLevel)) {
    errors.push(`Invalid log level: ${opts.logLevel}. Valid options: ${validLogLevels.join(', ')}`);
  }

  // Validate port
  if (opts.port && (opts.port < 1 || opts.port > 65535)) {
    errors.push(`Invalid port: ${opts.port}. Must be between 1 and 65535`);
  }

  // Validate workspace directory exists
  if (opts.workspace) {
    try {
      const stat = statSync(opts.workspace);
      if (!stat.isDirectory()) {
        errors.push(`Workspace path is not a directory: ${opts.workspace}`);
      }
    } catch (error) {
      errors.push(`Workspace directory does not exist: ${opts.workspace}`);
    }
  }

  // Validate Docker socket path (if not mock mode)
  if (!opts.mock && opts.dockerSocket) {
    try {
      statSync(opts.dockerSocket);
    } catch (error) {
      errors.push(
        `Docker socket not found: ${opts.dockerSocket}. Try --mock for testing without Docker.`,
      );
    }
  }

  // Validate config file exists if specified
  if (opts.config) {
    try {
      statSync(opts.config);
    } catch (error) {
      errors.push(`Configuration file not found: ${opts.config}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

async function main(): Promise<void> {
  try {
    // Validate CLI options
    const validation = validateOptions(options);
    if (!validation.valid) {
      console.error('❌ Configuration errors:');
      validation.errors.forEach((error) => console.error(`  • ${error}`));
      console.error('\nUse --help for usage information');
      exit(1);
    }

    // Set environment variables based on CLI options
    if (options.logLevel) env.LOG_LEVEL = options.logLevel;
    if (options.workspace) env.WORKSPACE_DIR = options.workspace;
    if (options.dockerSocket) process.env.DOCKER_SOCKET = options.dockerSocket;
    if (options.k8sNamespace) process.env.K8S_NAMESPACE = options.k8sNamespace;
    if (options.dev) process.env.NODE_ENV = 'development';
    if (options.mock) process.env.MOCK_MODE = 'true';

    // Create configuration (reads from environment)
    const config = createConfig();

    // Log configuration summary in development mode
    logConfigSummaryIfDev(config);

    if (options.validate) {
      console.error('🔍 Validating Containerization Assist MCP configuration...\n');
      console.error('📋 Configuration Summary:');
      console.error(`  • Log Level: ${config.server.logLevel}`);
      console.error(`  • Workspace: ${config.workspace.workspaceDir}`);
      console.error(`  • Docker Socket: ${process.env.DOCKER_SOCKET || '/var/run/docker.sock'}`);
      console.error(`  • K8s Namespace: ${process.env.K8S_NAMESPACE || 'default'}`);
      console.error(`  • Mock Mode: ${process.env.MOCK_MODE === 'true' ? 'enabled' : 'disabled'}`);
      console.error(`  • Environment: ${process.env.NODE_ENV || 'production'}`);

      // Test Docker connection if not in mock mode
      if (!options.mock) {
        console.error('\n🐳 Testing Docker connection...');
        try {
          execSync('docker version', { stdio: 'pipe' });
          console.error('  ✅ Docker connection successful');
        } catch (error) {
          console.error('  ⚠️  Docker connection failed - consider using --mock for testing');
        }
      }

      // Test Kubernetes connection
      console.error('\n☸️  Testing Kubernetes connection...');
      try {
        execSync('kubectl version --client=true', { stdio: 'pipe' });
        console.error('  ✅ Kubernetes client available');
      } catch (error) {
        console.error('  ⚠️  Kubernetes client not found - kubectl not in PATH');
      }

      getLogger().info('Configuration validation completed');
      console.error('\n✅ Configuration validation complete!');
      console.error('\nNext steps:');
      console.error('  • Start server: containerization-assist-mcp');
      console.error('  • List tools: containerization-assist-mcp --list-tools');
      console.error('  • Health check: containerization-assist-mcp --health-check');
      process.exit(0);
    }

    // Create server
    const server = new ContainerizationAssistMCPServer(config, true);

    if (options.listTools) {
      getLogger().info('Listing available tools');
      await server.initialize();

      const toolList = await server.listTools();
      console.error('Available tools:');
      console.error('═'.repeat(60));

      if ('tools' in toolList && Array.isArray(toolList.tools)) {
        const toolsByCategory = toolList.tools.reduce((acc: Record<string, any[]>, tool: any) => {
          const category = tool.category || 'utility';
          if (!acc[category]) acc[category] = [];
          acc[category]!.push(tool);
          return acc;
        }, {});

        for (const [category, tools] of Object.entries(toolsByCategory)) {
          console.error(`\n📁 ${category.toUpperCase()}`);
          (tools as Array<{ name: string; description: string }>).forEach((tool) => {
            console.error(`  • ${tool.name.padEnd(25)} ${tool.description || 'No description'}`);
          });
        }

        console.error(`\nTotal: ${toolList.tools.length} tools registered`);
      } else {
        console.error('No tools found in registry');
      }

      await server.shutdown();
      process.exit(0);
    }

    if (options.healthCheck) {
      getLogger().info('Performing health check');
      await server.initialize();

      const health = await server.getHealth();

      console.error('🏥 Health Check Results');
      console.error('═'.repeat(40));
      console.error(`Status: ${health.status === 'healthy' ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.error(`Uptime: ${Math.floor(health.uptime)}s`);
      console.error('\nServices:');

      for (const [service, status] of Object.entries(health.services)) {
        const icon = status ? '✅' : '❌';
        console.error(`  ${icon} ${service}`);
      }

      if (health.metrics) {
        console.error('\nMetrics:');
        for (const [metric, value] of Object.entries(health.metrics)) {
          console.error(`  📊 ${metric}: ${String(value)}`);
        }
      }

      await server.shutdown();
      process.exit(health.status === 'healthy' ? 0 : 1);
    }

    getLogger().info(
      {
        config: {
          logLevel: config.server.logLevel,
          workspace: config.workspace.workspaceDir,
          mockMode: options.mock,
          devMode: options.dev,
        },
      },
      'Starting Containerization Assist MCP Server',
    );

    console.error('🚀 Starting Containerization Assist MCP Server...');
    console.error(`📦 Version: ${packageJson.version}`);
    console.error(`🏠 Workspace: ${config.workspace.workspaceDir}`);
    console.error(`📊 Log Level: ${config.server.logLevel}`);

    if (options.mock) {
      console.error('🤖 Running with mock AI sampler');
    }

    if (options.dev) {
      console.error('🔧 Development mode enabled');
    }

    await server.start();

    if (options.port) {
      console.error('✅ Server started successfully');
      console.error(`🔌 Listening on HTTP port ${options.port}`);
    } else {
      console.error('✅ Server started successfully');
      console.error('🔌 Listening on stdio transport');
    }

    const shutdown = async (signal: string): Promise<void> => {
      getLogger().info({ signal }, 'Shutting down');
      console.error(`\n🛑 Received ${signal}, shutting down gracefully...`);

      try {
        await server.shutdown();
        console.error('✅ Shutdown complete');
        process.exit(0);
      } catch (error) {
        getLogger().error({ error }, 'Shutdown error');
        console.error('❌ Shutdown error:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => {
      shutdown('SIGTERM').catch((error) => {
        getLogger().error({ error }, 'Error during SIGTERM shutdown');
        process.exit(1);
      });
    });

    process.on('SIGINT', () => {
      shutdown('SIGINT').catch((error) => {
        getLogger().error({ error }, 'Error during SIGINT shutdown');
        process.exit(1);
      });
    });
  } catch (error) {
    getLogger().error({ error }, 'Server startup failed');
    console.error('❌ Server startup failed');

    if (error instanceof Error) {
      console.error(`\n🔍 Error: ${error.message}`);

      // Provide specific troubleshooting guidance
      if (error.message.includes('Docker') || error.message.includes('ENOENT')) {
        console.error('\n💡 Docker-related issue detected:');
        console.error('  • Ensure Docker Desktop is running');
        console.error('  • Check Docker socket path: --docker-socket <path>');
        console.error('  • Try mock mode for testing: --mock');
        console.error('  • Verify Docker installation: docker version');
      }

      if (error.message.includes('EADDRINUSE')) {
        console.error('\n💡 Port already in use:');
        console.error('  • Try a different port: --port <number>');
        console.error('  • Check running processes: lsof -i :<port>');
        console.error('  • Use stdio transport (default) instead of HTTP');
      }

      if (error.message.includes('permission') || error.message.includes('EACCES')) {
        console.error('\n💡 Permission issue detected:');
        console.error('  • Check file/directory permissions');
        console.error('  • Ensure workspace is readable: --workspace <path>');
        console.error('  • Try running with appropriate permissions');
      }

      if (error.message.includes('config') || error.message.includes('Config')) {
        console.error('\n💡 Configuration issue:');
        console.error('  • Copy .env.example to .env');
        console.error('  • Validate config: --validate');
        console.error('  • Check config file path: --config <path>');
      }

      console.error('\n🛠️ Troubleshooting steps:');
      console.error('  1. Run health check: containerization-assist-mcp --health-check');
      console.error('  2. Validate config: containerization-assist-mcp --validate');
      console.error('  3. Try mock mode: containerization-assist-mcp --mock');
      console.error('  4. Enable debug logging: --log-level debug');
      console.error('  5. Check the documentation: docs/TROUBLESHOOTING.md');

      if (error.stack && options.dev) {
        console.error(`\n📍 Stack trace (dev mode):`);
        console.error(error.stack);
      } else if (!options.dev) {
        console.error('\n💡 For detailed error information, use --dev flag');
      }
    }

    exit(1);
  }
}

process.on('uncaughtException', (error) => {
  getLogger().fatal({ error }, 'Uncaught exception in CLI');
  console.error('❌ Uncaught exception:', error);
  exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  getLogger().fatal({ reason, promise }, 'Unhandled rejection in CLI');
  console.error('❌ Unhandled rejection:', reason);
  exit(1);
});

// Run the CLI
void main();
