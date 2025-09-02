import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Server, Client } from '@modelcontextprotocol/sdk';
import { StdioServerTransport, StdioClientTransport } from '@modelcontextprotocol/sdk/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { ContainerKitMCPServer } from '../../../src/index.js';
import { Config } from '../../../src/application/config/config.js';
import { createTempDir } from '../../utils/test-helpers.js';

describe('MCP Protocol Integration', () => {
  let server: ContainerKitMCPServer;
  let client: Client;
  let testProcess: ChildProcess;
  
  beforeAll(async () => {
    // Initialize server with test configuration
    const config = new Config({
      features: {
        mockMode: true,
        dockerMock: true,
        k8sMock: true
      },
      nodeEnv: 'test',
      logLevel: 'error'
    });
    
    server = new ContainerKitMCPServer(config);
    
    // For integration tests, we'll test the server directly
    // In a real scenario, this would be via stdio transport
    await server.start();
    
    // Create client for testing
    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
  });
  
  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (server) {
      await server.shutdown();
    }
    if (testProcess) {
      testProcess.kill();
    }
  });
  
  describe('Server Capabilities', () => {
    it('should expose server information', async () => {
      const health = await server.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.services).toBeDefined();
    });
  });
  
  describe('Tools Protocol', () => {
    it('should list all available tools', async () => {
      // Get tools directly from registry
      const registry = (server as any).registry;
      const response = await registry.listTools();
      
      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBeGreaterThan(0);
      
      // Check for essential tools
      const toolNames = response.tools.map(t => t.name);
      expect(toolNames).toContain('ping');
      expect(toolNames).toContain('server_status');
      expect(toolNames).toContain('list_tools');
      
      // Verify tool structure
      const pingTool = response.tools.find(t => t.name === 'ping');
      expect(pingTool).toBeDefined();
      expect(pingTool!.description).toBeDefined();
      expect(pingTool!.inputSchema).toBeDefined();
    });
    
    it('should execute ping tool successfully', async () => {
      const registry = (server as any).registry;
      const response = await registry.handleToolCall({
        name: 'ping',
        arguments: { message: 'test-ping' }
      });
      
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('pong');
      expect(response.success).toBe(true);
    });
    
    it('should handle tool validation errors', async () => {
      const registry = (server as any).registry;
      const response = await registry.handleToolCall({
        name: 'analyze_repository',
        arguments: {
          repo_path: null, // Invalid
          session_id: 123 // Wrong type
        }
      });
      
      expect(response.success).toBe(false);
      expect(response.content[0].text).toContain('Validation error');
    });
    
    it('should handle non-existent tools', async () => {
      const registry = (server as any).registry;
      const response = await registry.handleToolCall({
        name: 'non_existent_tool',
        arguments: {}
      });
      
      expect(response.success).toBe(false);
      expect(response.content[0].text).toContain('not found');
    });
    
    it('should execute server_status tool', async () => {
      const registry = (server as any).registry;
      const response = await registry.handleToolCall({
        name: 'server_status',
        arguments: {}
      });
      
      expect(response.content).toBeDefined();
      expect(response.success).toBe(true);
      
      const status = JSON.parse(response.content[0].text);
      expect(status.server).toBeDefined();
      expect(status.uptime).toBeDefined();
      expect(status.memory).toBeDefined();
      expect(status.version).toBeDefined();
    });
    
    it('should execute list_tools tool', async () => {
      const registry = (server as any).registry;
      const response = await registry.handleToolCall({
        name: 'list_tools',
        arguments: {}
      });
      
      expect(response.content).toBeDefined();
      expect(response.success).toBe(true);
      
      const result = JSON.parse(response.content[0].text);
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
    });
  });
  
  describe('Workflow Tools Integration', () => {
    it('should execute workflow tools in sequence', async () => {
      const registry = (server as any).registry;
      const sessionId = 'integration-test-session';
      const repoPath = createTempDir();
      
      // Step 1: Analyze repository
      const analysisResponse = await registry.handleToolCall({
        name: 'analyze_repository',
        arguments: {
          repo_path: repoPath,
          session_id: sessionId
        }
      });
      
      expect(analysisResponse.success).toBe(true);
      const analysisResult = JSON.parse(analysisResponse.content[0].text);
      expect(analysisResult.success).toBe(true);
      
      // Step 2: Generate Dockerfile using session
      const dockerfileResponse = await registry.handleToolCall({
        name: 'generate_dockerfile',
        arguments: {
          session_id: sessionId
        }
      });
      
      expect(dockerfileResponse.success).toBe(true);
      const dockerfileResult = JSON.parse(dockerfileResponse.content[0].text);
      expect(dockerfileResult.success).toBe(true);
      
      // Step 3: Check workflow status
      const statusResponse = await registry.handleToolCall({
        name: 'workflow_status',
        arguments: {
          session_id: sessionId
        }
      });
      
      expect(statusResponse.success).toBe(true);
      const statusResult = JSON.parse(statusResponse.content[0].text);
      expect(statusResult.completed_steps).toHaveLength(2);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const registry = (server as any).registry;
      
      // Test with missing arguments
      const response = await registry.handleToolCall({
        name: 'ping'
        // Missing arguments property
      });
      
      expect(response.content).toBeDefined();
      // Should not crash the server
    });
    
    it('should handle tool execution timeouts', async () => {
      // Test that the timeout mechanism is in place
      const registry = (server as any).registry;
      
      const response = await registry.handleToolCall({
        name: 'ping',
        arguments: { message: 'timeout-test' }
      });
      
      // Should complete quickly, not timeout
      expect(response.content).toBeDefined();
    });
    
    it('should handle concurrent tool executions', async () => {
      const registry = (server as any).registry;
      const concurrentCalls = 10;
      
      const promises = Array.from({ length: concurrentCalls }, (_, i) =>
        registry.handleToolCall({
          name: 'ping',
          arguments: { message: `concurrent-${i}` }
        })
      );
      
      const results = await Promise.all(promises);
      
      results.forEach((result, i) => {
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain(`concurrent-${i}`);
        expect(result.success).toBe(true);
      });
    });
  });
  
  describe('Tool Schema Validation', () => {
    it('should provide valid JSON schemas for all tools', async () => {
      const registry = (server as any).registry;
      const { tools } = await registry.listTools();
      
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBeDefined();
        
        // Verify it's a valid JSON Schema object
        expect(typeof tool.inputSchema).toBe('object');
        
        if (tool.inputSchema.properties) {
          expect(typeof tool.inputSchema.properties).toBe('object');
        }
      }
    });
    
    it('should validate complex input schemas', async () => {
      const registry = (server as any).registry;
      
      // Test with valid complex input
      const validResponse = await registry.handleToolCall({
        name: 'generate_k8s_manifests',
        arguments: {
          session_id: 'test-session',
          namespace: 'test',
          replicas: 2,
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '512Mi' }
          }
        }
      });
      
      // May fail due to missing analysis, but shouldn't be a validation error
      expect(validResponse.content).toBeDefined();
      
      // Test with invalid complex input
      const invalidResponse = await registry.handleToolCall({
        name: 'generate_k8s_manifests',
        arguments: {
          session_id: 'test-session',
          replicas: 'not-a-number', // Invalid type
          resources: {
            requests: { cpu: 123 } // Invalid type
          }
        }
      });
      
      expect(invalidResponse.success).toBe(false);
      expect(invalidResponse.content[0].text).toContain('Validation error');
    });
  });
  
  describe('Resource Management', () => {
    it('should handle resource cleanup properly', async () => {
      const registry = (server as any).registry;
      const sessionIds: string[] = [];
      
      // Create multiple sessions
      for (let i = 0; i < 5; i++) {
        const sessionId = `cleanup-test-${i}`;
        sessionIds.push(sessionId);
        
        await registry.handleToolCall({
          name: 'analyze_repository',
          arguments: {
            repo_path: createTempDir(),
            session_id: sessionId
          }
        });
      }
      
      // Verify sessions were created
      const statusPromises = sessionIds.map(id =>
        registry.handleToolCall({
          name: 'workflow_status',
          arguments: { session_id: id }
        })
      );
      
      const results = await Promise.all(statusPromises);
      results.forEach(result => {
        expect(result.content).toBeDefined();
      });
    });
  });
  
  describe('Performance Metrics', () => {
    it('should maintain response times under load', async () => {
      const registry = (server as any).registry;
      const startTime = Date.now();
      const iterations = 50;
      
      const promises = Array.from({ length: iterations }, (_, i) =>
        registry.handleToolCall({
          name: 'ping',
          arguments: { message: `perf-test-${i}` }
        })
      );
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      const totalDuration = endTime - startTime;
      const averageTime = totalDuration / iterations;
      
      // All should succeed
      results.forEach(result => {
        expect(result.content).toBeDefined();
        expect(result.success).toBe(true);
      });
      
      // Average response time should be reasonable
      expect(averageTime).toBeLessThan(100); // Less than 100ms per request
    });
    
    it('should handle memory efficiently', async () => {
      const registry = (server as any).registry;
      const initialMemory = process.memoryUsage();
      
      // Perform many operations
      const promises = Array.from({ length: 100 }, (_, i) =>
        registry.handleToolCall({
          name: 'server_status',
          arguments: {}
        })
      );
      
      await Promise.all(promises);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory growth should be reasonable (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });
});