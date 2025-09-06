#!/usr/bin/env node
/**
 * Containerization Assist MCP CLI
 * Command-line interface for the Containerization Assist MCP Server
 */

import { program } from 'commander';
import { ContainerizationMCPServer } from '../src/mcp/server.js';
import { createConfig, logConfigSummaryIfDev } from '../src/config/index.js';
import { createLogger } from '../src/lib/logger.js';
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
    _logger = createLogger({ name: 'cli' });
  }
  return _logger;
}

program
  .name('containerization-assist-mcp')
  .description('MCP server for AI-powered containerization workflows')
  .version(packageJson.version)
  .argument('[command]', 'command to run (start)', 'start')
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
    '',
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
const command = program.args[0] || 'start';
const defaultDockerSockets = ['/var/run/docker.sock', '~/.colima/default/docker.socket'];

// Enhanced transport detection and logging
function getTransportInfo(options: any): { type: 'stdio' | 'http'; details: string } {
  if (options.port) {
    return {
      type: 'http',
      details: `HTTP server on ${options.host}:${options.port}`
    };
  }
  return {
    type: 'stdio',
    details: 'Standard I/O transport (MCP protocol)'
  };
}

// Enhanced Docker socket validation
function validateDockerSocket(options: any): { dockerSocket: string; warnings: string[] } {
  const warnings: string[] = [];
  let dockerSocket = "";
  
  if (!options.mock) {
    const allSocketOptions = [
      options.dockerSocket, 
      process.env.DOCKER_SOCKET, 
      ...defaultDockerSockets
    ].filter(Boolean);
    
    for (const thisSocket of allSocketOptions) {
      if (!thisSocket) continue;
      
      try {
        const stat = statSync(thisSocket);
        if (!stat.isSocket()) {
          warnings.push(`${thisSocket} exists but is not a socket`);
          continue;
        }
        
        // Only log when not in pure MCP mode
        if (!process.env.MCP_MODE) {
          console.error(`✅ Using Docker socket: ${thisSocket}`);
        }
        dockerSocket = thisSocket;
        break;
      } catch (error) {
        warnings.push(`Cannot access Docker socket: ${thisSocket}`);
      }
    }
    
    if (!dockerSocket) {
      return {
        dockerSocket: "",
        warnings: [
          `No valid Docker socket found in: ${allSocketOptions.join(', ')}`,
          'Docker operations will fail unless --mock mode is used',
          'Consider: 1) Starting Docker Desktop, 2) Using --mock flag, 3) Specifying --docker-socket <path>'
        ]
      };
    }
  }
  
  return { dockerSocket, warnings };
}

// Enhanced file operations with proper error handling (utility for future use)
// function safeFileOperation<T>(operation: () => T, fallback: T, context: string): T {
//   try {
//     return operation();
//   } catch (error) {
//     getLogger().warn({ error, context }, `File operation failed: ${context}`);
//     return fallback;
//   }
// }

// Enhanced error guidance in CLI
function provideContextualGuidance(error: Error, options: any): void {
  console.error(`\n🔍 Error: ${error.message}`);

  // Docker-related guidance
  if (error.message.includes('Docker') || error.message.includes('ENOENT')) {
    console.error('\n💡 Docker-related issue detected:');
    console.error('  • Ensure Docker Desktop/Engine is running');
    console.error('  • Verify Docker socket access permissions');
    console.error('  • Check Docker socket path with: docker context ls');
    console.error('  • Test Docker connection: docker version');
    console.error('  • Try mock mode for testing: --mock');
    console.error('  • Specify custom socket: --docker-socket <path>');
  }

  // Port/networking guidance
  if (error.message.includes('EADDRINUSE')) {
    console.error('\n💡 Port conflict detected:');
    console.error(`  • Port ${options.port} is already in use`);
    console.error('  • Try a different port: --port <number>');
    console.error('  • Check what\'s using the port: lsof -i :<port>');
    console.error('  • Use default stdio transport (no --port flag)');
  }

  // Permission guidance
  if (error.message.includes('permission') || error.message.includes('EACCES')) {
    console.error('\n💡 Permission issue detected:');
    console.error('  • Check file/directory permissions: ls -la');
    console.error('  • Verify workspace is accessible: --workspace <path>');
    console.error('  • Ensure Docker socket permissions (add user to docker group)');
    console.error('  • Consider running with appropriate permissions');
  }

  // Configuration guidance
  if (error.message.includes('config') || error.message.includes('Config')) {
    console.error('\n💡 Configuration issue:');
    console.error('  • Copy .env.example to .env: cp .env.example .env');
    console.error('  • Validate configuration: --validate');
    console.error('  • Check config file exists: --config <path>');
    console.error('  • Review configuration docs: docs/CONFIGURATION.md');
  }

  // Transport-specific guidance
  if (options.port && !error.message.includes('EADDRINUSE')) {
    console.error('\n💡 HTTP transport troubleshooting:');
    console.error('  • HTTP transport is experimental');
    console.error('  • Consider using default stdio transport');
    console.error('  • Verify host/port configuration');
    console.error('  • Check firewall/network settings');
  }

  console.error('\n🛠️ General troubleshooting steps:');
  console.error('  1. Run health check: containerization-assist-mcp --health-check');
  console.error('  2. Validate config: containerization-assist-mcp --validate');
  console.error('  3. Try mock mode: containerization-assist-mcp --mock');
  console.error('  4. Enable debug logging: --log-level debug --dev');
  console.error('  5. Check system requirements: docs/REQUIREMENTS.md');
  console.error('  6. Review troubleshooting guide: docs/TROUBLESHOOTING.md');

  if (options.dev && error.stack) {
    console.error(`\n📍 Stack trace (dev mode):`);
    console.error(error.stack);
  } else if (!options.dev) {
    console.error('\n💡 For detailed error information, use --dev flag');
  }
}

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
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('ENOENT')) {
        errors.push(`Workspace directory does not exist: ${opts.workspace}`);
      } else if (errorMsg.includes('EACCES')) {
        errors.push(`Permission denied accessing workspace: ${opts.workspace}`);
      } else {
        errors.push(`Cannot access workspace directory: ${opts.workspace} (${errorMsg})`);
      }
    }
  }

  // Enhanced Docker socket validation
  const dockerValidation = validateDockerSocket(opts);
  opts.dockerSocket = dockerValidation.dockerSocket;
  
  // Add warnings as non-fatal errors for user awareness
  if (dockerValidation.warnings.length > 0) {
    dockerValidation.warnings.forEach(warning => {
      if (warning.includes('No valid Docker socket')) {
        errors.push(warning);
      } else if (!process.env.MCP_MODE) {
        console.error(`⚠️  ${warning}`);
      }
    });
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
    // Handle the 'start' command (default behavior)
    if (command !== 'start') {
      console.error(`❌ Unknown command: ${command}`);
      console.error('Available commands: start');
      console.error('\nUse --help for usage information');
      exit(1);
    }

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
      console.error(`  • Workspace: ${config.workspace?.workspaceDir || process.cwd()}`);
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

    // Set MCP mode to redirect logs to stderr
    process.env.MCP_MODE = 'true';
    
    // Create server
    const logger = getLogger();
    const server = new ContainerizationMCPServer(logger);

    if (options.listTools) {
      getLogger().info('Listing available tools');
      await server.start();

      const status = server.getStatus();
      console.error('Available tools and workflows:');
      console.error('═'.repeat(60));
      console.error(`\n📊 Registry Status:`);
      console.error(`  • Tools: ${status.tools}`);
      console.error(`  • Workflows: ${status.workflows}`);
      console.error(`  • Server running: ${status.running}`);

      await server.stop();
      process.exit(0);
    }

    if (options.healthCheck) {
      getLogger().info('Performing health check');
      await server.start();

      const status = server.getStatus();

      console.error('🏥 Health Check Results');
      console.error('═'.repeat(40));
      console.error(`Status: ${status.running ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.error('\nServices:');
      console.error(`  ✅ MCP Server: ${status.running ? 'running' : 'stopped'}`);
      console.error(`  📊 Tools registered: ${status.tools}`);
      console.error(`  🔄 Workflows registered: ${status.workflows}`);

      await server.stop();
      process.exit(status.running ? 0 : 1);
    }

    getLogger().info(
      {
        config: {
          logLevel: config.server.logLevel,
          workspace: config.workspace?.workspaceDir || process.cwd(),
          mockMode: options.mock,
          devMode: options.dev,
        },
      },
      'Starting Containerization Assist MCP Server',
    );

    // Get transport information
    const transport = getTransportInfo(options);

    // Only show startup messages when not in pure MCP mode
    if (!process.env.MCP_QUIET) {
      console.error('🚀 Starting Containerization Assist MCP Server...');
      console.error(`📦 Version: ${packageJson.version}`);
      console.error(`🏠 Workspace: ${config.workspace?.workspaceDir || process.cwd()}`);
      console.error(`📊 Log Level: ${config.server.logLevel}`);
      console.error(`🔌 Transport: ${transport.details}`);

      if (options.mock) {
        console.error('🤖 Running with mock AI sampler');
      }

      if (options.dev) {
        console.error('🔧 Development mode enabled');
      }
    }

    await server.start();

    // Replace the misleading HTTP-specific message
    if (!process.env.MCP_QUIET) {
      console.error('✅ Server started successfully');
      
      if (transport.type === 'http') {
        console.error(`🔌 Listening on HTTP port ${options.port}`);
        console.error(`📡 Connect via: http://${options.host}:${options.port}`);
      } else {
        console.error('📡 Ready to accept MCP requests via stdio');
        console.error('💡 Send JSON-RPC messages to stdin for interaction');
      }
    }

    // Enhanced shutdown handling with timeout
    const shutdown = async (signal: string): Promise<void> => {
      const logger = getLogger();
      logger.info({ signal }, 'Shutdown initiated');
      
      if (!process.env.MCP_QUIET) {
        console.error(`\n🛑 Received ${signal}, shutting down gracefully...`);
      }

      // Set a timeout for shutdown
      const shutdownTimeout = setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        console.error('⚠️ Forced shutdown - some resources may not have cleaned up properly');
        process.exit(1);
      }, 10000); // 10 second timeout

      try {
        await server.stop();
        clearTimeout(shutdownTimeout);
        
        if (!process.env.MCP_QUIET) {
          console.error('✅ Shutdown complete');
        }
        process.exit(0);
      } catch (error) {
        clearTimeout(shutdownTimeout);
        logger.error({ error }, 'Shutdown error');
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
      provideContextualGuidance(error, options);
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
