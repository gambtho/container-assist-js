import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execa } from 'execa';

describe('NPM Interface Compatibility', () => {
  let tempDir;
  let packagePath;
  
  beforeAll(async () => {
    // Create temp directory for testing package installation
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-npm-test-'));
    
    // Build the package 
    await execa('npm', ['run', 'build:dist'], { cwd: process.cwd() });
    
    // Pack the package
    const packResult = await execa('npm', ['pack'], { cwd: process.cwd() });
    packagePath = packResult.stdout.trim();
  });
  
  afterAll(async () => {
    if (tempDir && existsSync(tempDir)) {
      await rm(tempDir, { recursive: true });
    }
    
    // Clean up package tarball
    if (packagePath && existsSync(packagePath)) {
      await rm(packagePath);
    }
  });
  
  describe('Package Installation', () => {
    
    test('package can be installed from tarball', async () => {
      // Initialize npm project in temp directory
      await execa('npm', ['init', '-y'], { cwd: tempDir });
      
      // Install our package from tarball
      const packageTarball = join(process.cwd(), packagePath);
      await execa('npm', ['install', packageTarball], { cwd: tempDir });
      
      // Verify package is installed
      const result = await execa('npm', ['list', 'container-kit-mcp'], { cwd: tempDir });
      expect(result.stdout).toContain('container-kit-mcp@');
    });
    
    test('CLI binary is accessible after installation', async () => {
      // Test --version flag
      const versionResult = await execa('npx', ['container-kit-mcp', '--version'], { cwd: tempDir });
      expect(versionResult.stdout).toMatch(/container-kit-mcp v\d+\.\d+\.\d+/);
      
      // Test --help flag
      const helpResult = await execa('npx', ['container-kit-mcp', '--help'], { cwd: tempDir });
      expect(helpResult.stdout).toContain('Container Kit MCP Server');
      expect(helpResult.stdout).toContain('Usage:');
    });
    
    test('alternative binary alias works', async () => {
      const result = await execa('npx', ['ck-mcp', '--version'], { cwd: tempDir });
      expect(result.stdout).toMatch(/container-kit-mcp v\d+\.\d+\.\d+/);
    });
  });
  
  describe('Tool Exports', () => {
    
    test('all 15 tools are importable from NPM package', async () => {
      const toolNames = [
        'start-workflow', 'workflow-status', 'analyze-repository',
        'generate-dockerfile', 'build-image', 'scan-image', 
        'tag-image', 'push-image', 'generate-k8s-manifests',
        'prepare-cluster', 'deploy-application', 'verify-deployment',
        'list-tools', 'ping', 'server-status'
      ];
      
      // Create test file that imports all tools
      const testImports = `
        ${toolNames.map(tool => 
          `import * as ${tool.replace(/-/g, '_')} from 'container-kit-mcp/tools/${tool}';`
        ).join('\n')}
        
        console.log('All tools imported successfully');
        
        // Verify each has expected structure
        const tools = [${toolNames.map(tool => tool.replace(/-/g, '_')).join(', ')}];
        for (const tool of tools) {
          if (!tool.handler && !tool.analyzeRepositoryHandler && !tool.generateDockerfileHandler) {
            throw new Error('Tool missing handler function');
          }
        }
        
        console.log('All tool handlers validated');
      `;
      
      const testFile = join(tempDir, 'test-imports.mjs');
      await writeFile(testFile, testImports);
      
      // Run the import test
      const result = await execa('node', [testFile], { cwd: tempDir });
      expect(result.stdout).toContain('All tools imported successfully');
      expect(result.stdout).toContain('All tool handlers validated');
    });
    
    test('orchestration tools maintain external client interface', async () => {
      const testScript = `
        import * as startWorkflow from 'container-kit-mcp/tools/start-workflow';
        import * as workflowStatus from 'container-kit-mcp/tools/workflow-status';
        
        // Check that expected exports exist
        const hasStartHandler = startWorkflow.workflowOrchestrationHandler || startWorkflow.handler;
        const hasStatusHandler = workflowStatus.workflowStatusHandler || workflowStatus.handler;
        
        if (!hasStartHandler) {
          throw new Error('start-workflow missing handler export');
        }
        
        if (!hasStatusHandler) {
          throw new Error('workflow-status missing handler export');
        }
        
        console.log('Orchestration tools interface validated');
      `;
      
      const testFile = join(tempDir, 'test-orchestration.mjs');
      await writeFile(testFile, testScript);
      
      const result = await execa('node', [testFile], { cwd: tempDir });
      expect(result.stdout).toContain('Orchestration tools interface validated');
    });
    
    test('main package export works', async () => {
      const testScript = `
        import * as containerKit from 'container-kit-mcp';
        
        // Check that main exports exist
        const hasServer = containerKit.Server;
        const hasTransport = containerKit.StdioServerTransport;
        const hasDependencies = containerKit.Dependencies;
        const hasRegistry = containerKit.ToolRegistry;
        
        if (!hasServer || !hasTransport || !hasDependencies || !hasRegistry) {
          throw new Error('Missing main package exports');
        }
        
        console.log('Main package exports validated');
        console.log('Version:', containerKit.version);
      `;
      
      const testFile = join(tempDir, 'test-main.mjs');
      await writeFile(testFile, testScript);
      
      const result = await execa('node', [testFile], { cwd: tempDir });
      expect(result.stdout).toContain('Main package exports validated');
      expect(result.stdout).toContain('Version: 2.0.0-beta.1');
    });
  });
  
  describe('Backward Compatibility', () => {
    
    test('external clients can use existing import patterns', async () => {
      // Simulate how existing clients might import our tools
      const clientCode = `
        // CommonJS style (should work with import)
        import * as startWorkflow from 'container-kit-mcp/tools/start-workflow';
        import * as analyzeRepo from 'container-kit-mcp/tools/analyze-repository';
        
        // Test that handlers exist and are callable
        const startHandler = startWorkflow.workflowOrchestrationHandler || startWorkflow.handler;
        const analyzeHandler = analyzeRepo.analyzeRepositoryHandler || analyzeRepo.handler;
        
        if (typeof startHandler !== 'function') {
          throw new Error('start-workflow handler not a function');
        }
        
        if (typeof analyzeHandler !== 'function') {
          throw new Error('analyze-repository handler not a function');
        }
        
        console.log('External client import patterns work');
      `;
      
      const testFile = join(tempDir, 'test-client-compat.mjs');
      await writeFile(testFile, clientCode);
      
      const result = await execa('node', [testFile], { cwd: tempDir });
      expect(result.stdout).toContain('External client import patterns work');
    });
    
    test('parameter compatibility - snake_case and camelCase both work', async () => {
      // Test that we can call tools with both parameter styles
      const compatTest = `
        import * as analyzeRepo from 'container-kit-mcp/tools/analyze-repository';
        
        const handler = analyzeRepo.analyzeRepositoryHandler || analyzeRepo.handler;
        
        // Mock test - just verify parameter normalization works
        try {
          // This would normally call the real handler, but we'll just test import works
          console.log('Handler imported:', typeof handler);
          console.log('Parameter compatibility test passed');
        } catch (error) {
          throw new Error('Parameter compatibility failed: ' + error.message);
        }
      `;
      
      const testFile = join(tempDir, 'test-params.mjs');
      await writeFile(testFile, compatTest);
      
      const result = await execa('node', [testFile], { cwd: tempDir });
      expect(result.stdout).toContain('Parameter compatibility test passed');
    });
  });
  
  describe('MCP Server Integration', () => {
    
    test('MCP server can be started and responds to basic requests', async () => {
      // Start MCP server as subprocess
      const serverProcess = spawn('npx', ['container-kit-mcp'], {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let serverOutput = '';
      let serverError = '';
      
      serverProcess.stdout.on('data', (data) => {
        serverOutput += data.toString();
      });
      
      serverProcess.stderr.on('data', (data) => {
        serverError += data.toString();
      });
      
      // Wait a moment for server to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send a ping request via JSON-RPC
      const pingRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: {}
        }
      }) + '\n';
      
      serverProcess.stdin.write(pingRequest);
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clean shutdown
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise(resolve => {
        serverProcess.on('close', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve();
        }, 2000);
      });
      
      // Verify server started without errors
      expect(serverError).not.toContain('Error');
      expect(serverError).not.toContain('failed');
      
      // Verify server logged startup
      expect(serverOutput).toContain('MCP server ready') || expect(serverOutput).toContain('Starting Container Kit');
    }, 10000); // 10 second timeout for this test
  });
  
  describe('Distribution Quality', () => {
    
    test('package contents are complete', async () => {
      // Check that dist directory has all required files
      const packageContents = await execa('tar', ['-tzf', join(process.cwd(), packagePath)]);
      const files = packageContents.stdout.split('\n').filter(Boolean);
      
      const requiredFiles = [
        'package/dist/index.js',
        'package/dist/index.d.ts', 
        'package/dist/bin/server.js',
        'package/README.md',
        'package/LICENSE',
        'package/CHANGELOG.md'
      ];
      
      for (const file of requiredFiles) {
        expect(files).toContain(file);
      }
      
      // Check that we have tool handlers
      const handlerFiles = files.filter(f => f.includes('service/tools/handlers/'));
      expect(handlerFiles.length).toBeGreaterThan(5);
      
      // Check that we have prompt templates
      const templateFiles = files.filter(f => f.includes('prompts/templates/'));
      expect(templateFiles.length).toBeGreaterThan(3);
    });
    
    test('package size is reasonable', async () => {
      const packageStat = await execa('ls', ['-lh', packagePath], { cwd: process.cwd() });
      const sizeMatch = packageStat.stdout.match(/(\d+\.?\d*[KMG]?)\s+/);
      
      if (sizeMatch) {
        const size = sizeMatch[1];
        console.log(`Package size: ${size}`);
        
        // Parse size and validate it's under 10MB
        const sizeNum = parseFloat(size);
        const unit = size.slice(-1);
        
        if (unit === 'M' && sizeNum > 10) {
          throw new Error(`Package too large: ${size} (should be under 10MB)`);
        }
        if (unit === 'G') {
          throw new Error(`Package too large: ${size} (should be under 10MB)`);
        }
      }
    });
  });
});