import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { ContainerKitMCPServer } from '../../../src/index.js';
import { Config } from '../../../src/application/config/config.js';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';
import { createTempDir, waitFor, measureTime } from '../../utils/test-helpers.js';

describe('Full Containerization Workflow Integration', () => {
  let server: ContainerKitMCPServer;
  let testRepoPath: string;
  let sessionId: string;
  
  beforeAll(async () => {
    // Setup test repository
    testRepoPath = createTempDir();
    await fs.mkdir(testRepoPath, { recursive: true });
    
    // Create sample Node.js application
    await createSampleNodeApp(testRepoPath);
    
    // Initialize server with test configuration
    const config = new Config({
      features: {
        mockMode: true,
        dockerMock: true,
        k8sMock: true,
        aiEnabled: false // Use mocked AI responses
      },
      nodeEnv: 'test',
      logLevel: 'error'
    });
    
    server = new ContainerKitMCPServer(config);
    await server.start();
    
    sessionId = nanoid();
  });
  
  afterAll(async () => {
    if (server) {
      await server.shutdown();
    }
    if (testRepoPath) {
      await fs.rm(testRepoPath, { recursive: true, force: true });
    }
  });
  
  beforeEach(() => {
    // Reset session ID for each test
    sessionId = nanoid();
  });
  
  describe('Complete Workflow Execution', () => {
    it('should execute full workflow from analysis to deployment', async () => {
      // Step 1: Analyze repository
      const { result: analysisResult, duration: analysisDuration } = await measureTime(async () => {
        return await executeTool('analyze_repository', {
          repo_path: testRepoPath,
          session_id: sessionId,
          deep_scan: false
        });
      });
      
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data.language).toBe('javascript');
      expect(analysisResult.data.framework).toBe('express');
      expect(analysisDuration).toBeLessThan(5000); // Should complete in under 5 seconds
      
      // Step 2: Generate Dockerfile
      const dockerfileResult = await executeTool('generate_dockerfile', {
        session_id: sessionId,
        base_image: 'node:18-alpine',
        port: 3000
      });
      
      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toContain('FROM node');
      expect(dockerfileResult.data.dockerfile).toContain('EXPOSE 3000');
      expect(dockerfileResult.data.path).toBe('./Dockerfile');
      
      // Step 3: Build Docker image
      const buildResult = await executeTool('build_image', {
        session_id: sessionId,
        image_name: 'test-app',
        tag: 'latest',
        build_args: { NODE_ENV: 'production' }
      });
      
      expect(buildResult.success).toBe(true);
      expect(buildResult.data.image_tag).toBe('test-app:latest');
      expect(buildResult.data.size_bytes).toBeGreaterThan(0);
      
      // Step 4: Scan image for vulnerabilities
      const scanResult = await executeTool('scan_image', {
        session_id: sessionId,
        scanner: 'trivy'
      });
      
      expect(scanResult.success).toBe(true);
      expect(scanResult.data.vulnerabilities).toBeDefined();
      expect(scanResult.data.summary.total).toBeGreaterThanOrEqual(0);
      
      // Step 5: Tag image
      const tagResult = await executeTool('tag_image', {
        session_id: sessionId,
        tags: ['latest', 'v1.0.0', 'test'],
        registry: 'docker.io/myorg'
      });
      
      expect(tagResult.success).toBe(true);
      expect(tagResult.data.tags).toContain('latest');
      expect(tagResult.data.tags).toContain('v1.0.0');
      
      // Step 6: Generate Kubernetes manifests
      const k8sResult = await executeTool('generate_k8s_manifests', {
        session_id: sessionId,
        namespace: 'test-namespace',
        replicas: 3,
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' }
        }
      });
      
      expect(k8sResult.success).toBe(true);
      expect(k8sResult.data.manifests).toHaveLength(2); // Deployment and Service
      expect(k8sResult.data.replicas).toBe(3);
      
      // Step 7: Deploy application
      const deployResult = await executeTool('deploy_application', {
        session_id: sessionId,
        dry_run: true // Don't actually deploy in tests
      });
      
      expect(deployResult.success).toBe(true);
      expect(deployResult.data.namespace).toBe('test-namespace');
      expect(deployResult.data.deployment_name).toBe('test-app');
      
      // Step 8: Verify deployment
      const verifyResult = await executeTool('verify_deployment', {
        session_id: sessionId,
        timeout: 30
      });
      
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.data.ready).toBe(true);
      expect(verifyResult.data.health_checks).toBeDefined();
      
      // Verify session state contains all results
      const sessionStatus = await executeTool('workflow_status', {
        session_id: sessionId
      });
      
      expect(sessionStatus.success).toBe(true);
      expect(sessionStatus.data.completed_steps).toHaveLength(8);
      expect(sessionStatus.data.workflow_state.analysis_result).toBeDefined();
      expect(sessionStatus.data.workflow_state.deployment_result).toBeDefined();
    });
    
    it('should handle workflow with custom configuration', async () => {
      const customSessionId = nanoid();
      
      // Start workflow with custom settings
      const workflowResult = await executeTool('start_workflow', {
        session_id: customSessionId,
        repo_path: testRepoPath,
        config: {
          auto_push: false,
          skip_scan: true,
          registry: 'custom.registry.com',
          namespace: 'custom-ns'
        }
      });
      
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.data.session_id).toBe(customSessionId);
      expect(workflowResult.data.config.skip_scan).toBe(true);
      expect(workflowResult.data.config.registry).toBe('custom.registry.com');
    });
    
    it('should handle workflow interruption and recovery', async () => {
      const interruptedSessionId = nanoid();
      
      // Start workflow and complete first few steps
      await executeTool('analyze_repository', {
        repo_path: testRepoPath,
        session_id: interruptedSessionId
      });
      
      await executeTool('generate_dockerfile', {
        session_id: interruptedSessionId
      });
      
      // Check intermediate state
      const intermediateStatus = await executeTool('workflow_status', {
        session_id: interruptedSessionId
      });
      
      expect(intermediateStatus.success).toBe(true);
      expect(intermediateStatus.data.completed_steps).toHaveLength(2);
      expect(intermediateStatus.data.current_step).toBe('build_image');
      
      // Continue from where we left off
      const buildResult = await executeTool('build_image', {
        session_id: interruptedSessionId,
        image_name: 'recovered-app'
      });
      
      expect(buildResult.success).toBe(true);
      
      // Verify recovery worked
      const finalStatus = await executeTool('workflow_status', {
        session_id: interruptedSessionId
      });
      
      expect(finalStatus.data.completed_steps).toHaveLength(3);
      expect(finalStatus.data.workflow_state.build_result).toBeDefined();
    });
  });
  
  describe('Error Handling and Recovery', () => {
    it('should handle tool execution failures gracefully', async () => {
      const errorSessionId = nanoid();
      
      // Try to generate Dockerfile without analysis
      const dockerfileResult = await executeTool('generate_dockerfile', {
        session_id: errorSessionId
      });
      
      expect(dockerfileResult.success).toBe(false);
      expect(dockerfileResult.error?.code).toMatch(/ANALYSIS_REQUIRED|SESSION_NOT_FOUND/);
    });
    
    it('should handle invalid tool parameters', async () => {
      const result = await executeTool('build_image', {
        session_id: sessionId,
        image_name: '', // Invalid empty name
        tag: null // Invalid null tag
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('validation');
    });
    
    it('should handle missing session gracefully', async () => {
      const result = await executeTool('workflow_status', {
        session_id: 'non-existent-session'
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.code).toMatch(/SESSION_NOT_FOUND/);
    });
  });
  
  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent workflows', async () => {
      const sessionIds = Array.from({ length: 5 }, () => nanoid();
      
      // Start multiple workflows concurrently
      const promises = sessionIds.map(id => 
        executeTool('analyze_repository', {
          repo_path: testRepoPath,
          session_id: id
        })
      );
      
      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      
      // Verify all sessions exist
      const statusPromises = sessionIds.map(id =>
        executeTool('workflow_status', { session_id: id })
      );
      
      const statusResults = await Promise.all(statusPromises);
      statusResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.completed_steps).toContain('analyze_repository');
      });
    });
    
    it('should maintain performance under load', async () => {
      const iterations = 20;
      const sessionIds = Array.from({ length: iterations }, () => nanoid();
      
      const { duration } = await measureTime(async () => {
        const promises = sessionIds.map(id => 
          executeTool('ping', { message: `test-${id}` })
        );
        
        const results = await Promise.all(promises);
        
        results.forEach(result => {
          expect(result.success).toBe(true);
        });
      });
      
      const averageTime = duration / iterations;
      expect(averageTime).toBeLessThan(100); // Average less than 100ms per request
    });
  });
  
  describe('Workflow State Consistency', () => {
    it('should maintain consistent state across tool calls', async () => {
      const consistencySessionId = nanoid();
      
      // Execute workflow steps
      await executeTool('analyze_repository', {
        repo_path: testRepoPath,
        session_id: consistencySessionId
      });
      
      await executeTool('generate_dockerfile', {
        session_id: consistencySessionId
      });
      
      await executeTool('build_image', {
        session_id: consistencySessionId,
        image_name: 'consistency-test'
      });
      
      // Check that each step has access to previous results
      const status = await executeTool('workflow_status', {
        session_id: consistencySessionId
      });
      
      expect(status.success).toBe(true);
      
      const workflowState = status.data.workflow_state;
      expect(workflowState.analysis_result).toBeDefined();
      expect(workflowState.dockerfile_result).toBeDefined();
      expect(workflowState.build_result).toBeDefined();
      
      // Verify data flow between steps
      expect(workflowState.dockerfile_result.base_image).toBeDefined();
      expect(workflowState.build_result.image_tag).toContain('consistency-test');
    });
    
    it('should handle concurrent updates to same session', async () => {
      const sharedSessionId = nanoid();
      
      // Initialize session
      await executeTool('analyze_repository', {
        repo_path: testRepoPath,
        session_id: sharedSessionId
      });
      
      // Perform concurrent operations on same session
      const concurrentOperations = [
        executeTool('generate_dockerfile', { session_id: sharedSessionId }),
        executeTool('workflow_status', { session_id: sharedSessionId }),
        executeTool('workflow_status', { session_id: sharedSessionId })
      ];
      
      const results = await Promise.all(concurrentOperations);
      
      // First operation (dockerfile generation) should succeed
      expect(results[0].success).toBe(true);
      
      // Status checks should always succeed
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });
  });
  
  // Helper functions
  async function createSampleNodeApp(repoPath: string): Promise<void> {
    // Create package.json
    const packageJson = {
      name: 'test-app',
      version: '1.0.0',
      description: 'Test Node.js application',
      main: 'index.js',
      scripts: {
        start: 'node index.js',
        dev: 'nodemon index.js',
        test: 'jest'
      },
      dependencies: {
        express: '^4.18.0',
        pino: '^8.0.0'
      },
      devDependencies: {
        '@types/node': '^18.0.0',
        nodemon: '^2.0.0',
        jest: '^29.0.0'
      }
    };
    
    await fs.writeFile(
      path.join(repoPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create main application file
    const appCode = `const express = require('express');
const pino = require('pino');

const logger = pino();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json();

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

app.listen(port, () => {
  logger.info(\`Server running on port \${port}\`);
});

module.exports = app;
`;
    
    await fs.writeFile(path.join(repoPath, 'index.js'), appCode);
    
    // Create basic test file
    const testCode = `const request = require('supertest');
const app = require('./index');

describe('API Tests', () => {
  test('GET / should return hello message', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Hello World!');
  });
  
  test('GET /health should return health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });
});
`;
    
    await fs.writeFile(path.join(repoPath, 'app.test.js'), testCode);
    
    // Create README
    const readme = `# Test Application

A simple Express.js application for testing containerization workflows.

## Features
- REST API with health endpoint
- Structured logging with Pino
- Jest test suite
- Docker ready

## Usage
\`\`\`bash
npm install
npm start
\`\`\`

## Testing
\`\`\`bash
npm test
\`\`\`
`;
    
    await fs.writeFile(path.join(repoPath, 'README.md'), readme);
  }
  
  async function executeTool(toolName: string, args: any): Promise<any> {
    try {
      // This would normally call the server's MCP interface
      // For integration tests, we'll call the tool registry directly
      const registry = (server as any).registry;
      
      const result = await registry.handleToolCall({
        name: toolName,
        arguments: args
      });
      
      if (!result.success) {
        return {
          success: false,
          error: {
            message: result.content[0].text,
            code: 'TOOL_ERROR'
          }
        };
      }
      
      const data = JSON.parse(result.content[0].text);
      return {
        success: true,
        data
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'EXECUTION_ERROR'
        }
      };
    }
  }
});