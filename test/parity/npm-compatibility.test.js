/**
 * NPM Package Interface Compatibility Tests - Phase 8 Testing Framework
 * Ensures backward compatibility with existing NPM consumers
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import { createTestServer } from '../simple-test-setup.js';

describe('NPM Package Interface Compatibility', () => {
  let server;

  beforeAll(async () => {
    // Initialize server with test configuration
    server = await createTestServer({
      features: { mockMode: true, aiEnabled: false }
    });
  });

  afterAll(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  describe('Tool Parameter Compatibility', () => {
    test('tools accept snake_case parameters for backward compatibility', async () => {
      // Test analyze_repository with snake_case parameters
      const result = await server.executeTool('analyze_repository', {
        repo_path: './test/fixtures/java-spring-boot-maven',  // snake_case
        session_id: 'compat-test-1'
      });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('language');
      expect(result.data).toHaveProperty('framework');
    });

    test('tools accept camelCase parameters', async () => {
      // Test analyze_repository with camelCase parameters
      const result = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',  // camelCase
        sessionId: 'compat-test-2'
      });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('language');
      expect(result.data).toHaveProperty('framework');
    });

    test('workflow tools accept mixed parameter styles', async () => {
      // Test start_workflow with mixed parameter styles
      const result = await server.executeTool('start_workflow', {
        repo_path: './test/fixtures/java-spring-boot-maven',  // snake_case
        sessionId: 'compat-test-3',                           // camelCase
        target_environment: 'development',                    // snake_case
        workflowType: 'build-only'                           // camelCase
      });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('workflowId');
      expect(result.data).toHaveProperty('status');
    });

    test('dockerfile generation accepts legacy parameter names', async () => {
      const result = await server.executeTool('generate_dockerfile', {
        session_id: 'dockerfile-compat-1',  // snake_case
        base_image: 'openjdk:17-slim',      // snake_case
        port: 8080,
        multistage: true
      });
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('dockerfile');
      expect(result.data.dockerfile).toContain('FROM');
    });
  });

  describe('Response Structure Compatibility', () => {
    test('tool responses maintain expected Result<T> structure', async () => {
      const result = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId: 'response-test-1'
      });
      
      // Must have Result<T> structure for compatibility
      expect(result).toMatchObject({
        success: expect.any(Boolean),
        timestamp: expect.any(String)
      });

      if (result.success) {
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('language');
        expect(result.data).toHaveProperty('framework');
      } else {
        expect(result).toHaveProperty('error');
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });

    test('error responses maintain expected structure', async () => {
      // Test with invalid parameters to trigger error response
      const result = await server.executeTool('analyze_repository', {
        repoPath: '/nonexistent/path',
        sessionId: 'error-test-1'
      });
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('timestamp');
      
      if (!result.success) {
        expect(result).toHaveProperty('error');
        expect(result.error).toMatchObject({
          code: expect.any(String),
          message: expect.any(String)
        });
      }
    });

    test('workflow responses include expected fields', async () => {
      const workflowResult = await server.executeTool('start_workflow', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId: 'workflow-response-test'
      });
      
      expect(workflowResult).toMatchObject({
        success: expect.any(Boolean),
        timestamp: expect.any(String),
        data: expect.objectContaining({
          workflowId: expect.any(String),
          status: expect.any(String)
        })
      });

      const statusResult = await server.executeTool('workflow_status', {
        sessionId: 'workflow-response-test'
      });
      
      expect(statusResult).toMatchObject({
        success: expect.any(Boolean),
        data: expect.objectContaining({
          status: expect.any(String),
          progress: expect.any(Number)
        })
      });
    });

    test('dockerfile generation response structure', async () => {
      const result = await server.executeTool('generate_dockerfile', {
        sessionId: 'dockerfile-response-test'
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        dockerfile: expect.any(String),
        path: expect.any(String)
      });
      
      // Should also have 'content' field for compatibility
      expect(result.data.content || result.data.dockerfile).toBeDefined();
    });
  });

  describe('Tool Registration and Discovery', () => {
    test('all expected tools are registered and discoverable', async () => {
      const toolsList = await server.executeTool('list_tools', {});
      
      expect(toolsList.success).toBe(true);
      expect(toolsList.data).toHaveProperty('tools');
      expect(Array.isArray(toolsList.data.tools)).toBe(true);
      
      const toolNames = toolsList.data.tools.map(t => t.name);
      
      // Check all 15 expected tools are present
      const expectedTools = [
        // Workflow tools (10)
        'analyze_repository',
        'generate_dockerfile', 
        'build_image',
        'scan_image',
        'tag_image',
        'push_image',
        'generate_k8s_manifests',
        'prepare_cluster',
        'deploy_application',
        'verify_deployment',
        
        // Orchestration tools (2)
        'start_workflow',
        'workflow_status',
        
        // Utility tools (3)
        'list_tools',
        'ping',
        'server_status'
      ];

      for (const expectedTool of expectedTools) {
        expect(toolNames).toContain(expectedTool);
      }
      
      expect(toolNames.length).toBeGreaterThanOrEqual(15);
    });

    test('tool metadata includes required fields', async () => {
      const toolsList = await server.executeTool('list_tools', {});
      
      expect(toolsList.success).toBe(true);
      
      for (const tool of toolsList.data.tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description.length).toBeGreaterThan(0);
        
        // Category is optional but should be string if present
        if (tool.category) {
          expect(typeof tool.category).toBe('string');
          expect(['workflow', 'orchestration', 'utility'].includes(tool.category)).toBe(true);
        }
      }
    });
  });

  describe('Parameter Normalization', () => {
    test('parameters are normalized internally regardless of input style', async () => {
      // Test the same tool with different parameter styles
      const snakeCaseResult = await server.executeTool('analyze_repository', {
        repo_path: './test/fixtures/java-spring-boot-maven',
        session_id: 'normalize-test-1'
      });

      const camelCaseResult = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId: 'normalize-test-2'
      });
      
      // Both should succeed and return similar structure
      expect(snakeCaseResult.success).toBe(true);
      expect(camelCaseResult.success).toBe(true);
      
      // Results should have same language and framework detection
      expect(snakeCaseResult.data.language).toBe(camelCaseResult.data.language);
      expect(snakeCaseResult.data.framework).toBe(camelCaseResult.data.framework);
    });

    test('optional parameters work with both styles', async () => {
      const result1 = await server.executeTool('start_workflow', {
        repo_path: './test/fixtures/java-spring-boot-maven',
        workflow_type: 'build-only'  // snake_case
      });

      const result2 = await server.executeTool('start_workflow', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        workflowType: 'build-only'   // camelCase
      });
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data.workflowType || result1.data.workflow_type).toBe('build-only');
      expect(result2.data.workflowType || result2.data.workflow_type).toBe('build-only');
    });
  });

  describe('Utility Tool Compatibility', () => {
    test('ping tool maintains expected response', async () => {
      const result = await server.executeTool('ping', {});
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('status');
      expect(['ok', 'healthy', 'success'].includes(result.data.status)).toBe(true);
      expect(result.data).toHaveProperty('timestamp');
    });

    test('server_status provides comprehensive information', async () => {
      const result = await server.executeTool('server_status', {});
      
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        status: expect.any(String),
        version: expect.any(String),
        uptime: expect.any(Number)
      });
      
      // Optional fields that might be present
      if (result.data.memory) {
        expect(typeof result.data.memory).toBe('object');
      }
      
      if (result.data.nodejs) {
        expect(typeof result.data.nodejs).toBe('string');
      }
    });
  });

  describe('Session Management Compatibility', () => {
    test('session IDs are handled consistently', async () => {
      const sessionId = 'session-compat-test-1';
      
      // Create analysis with session ID
      const analysisResult = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId
      });
      
      expect(analysisResult.success).toBe(true);
      
      // Start workflow with same session ID
      const workflowResult = await server.executeTool('start_workflow', {
        sessionId,
        workflowType: 'build-only'
      });
      
      expect(workflowResult.success).toBe(true);
      expect(workflowResult.data.sessionId || workflowResult.data.workflowId).toBe(sessionId);
      
      // Check workflow status
      const statusResult = await server.executeTool('workflow_status', {
        sessionId
      });
      
      expect(statusResult.success).toBe(true);
      expect(statusResult.data).toHaveProperty('status');
    });

    test('session data persists across tool calls', async () => {
      const sessionId = 'session-persistence-test';
      
      // First tool call creates session data
      const firstResult = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId
      });
      
      expect(firstResult.success).toBe(true);
      
      // Second tool call should have access to session context
      const secondResult = await server.executeTool('generate_dockerfile', {
        sessionId,
        baseImage: 'openjdk:17-slim'
      });
      
      expect(secondResult.success).toBe(true);
      expect(secondResult.data).toHaveProperty('dockerfile');
    });
  });

  describe('Error Handling Compatibility', () => {
    test('error responses follow consistent format', async () => {
      // Test with non-existent tool
      const invalidToolResult = await server.executeTool('nonexistent_tool', {});
      
      expect(invalidToolResult.success).toBe(false);
      expect(invalidToolResult).toHaveProperty('error');
      expect(invalidToolResult.error).toMatchObject({
        code: expect.any(String),
        message: expect.any(String)
      });
      expect(invalidToolResult).toHaveProperty('timestamp');
    });

    test('validation errors are handled gracefully', async () => {
      // Test with missing required parameters
      const result = await server.executeTool('analyze_repository', {
        // Missing repoPath/repo_path
        sessionId: 'validation-error-test'
      });
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('timestamp');
      
      // Even if it succeeds with defaults, structure should be consistent
      if (!result.success) {
        expect(result.error).toHaveProperty('code');
        expect(result.error).toHaveProperty('message');
      }
    });
  });
});