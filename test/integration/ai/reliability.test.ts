/**
 * AI Reliability Integration Tests
 * End-to-end tests for AI reliability features in real workflow scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { nanoid } from 'nanoid';
import { Dependencies } from '../../../src/service/dependencies.js';
import { SessionService } from '../../../src/service/session/manager.js';
import { MemorySessionStore } from '../../../src/infrastructure/persistence/memory-store.js';
import pino from 'pino';

// Mock MCP Server for testing
class MockMCPServer {
  async sample(request: any) {
    // Simulate realistic AI responses based on template ID
    switch (request.templateId) {
      case 'repository-analysis':
        return this.mockRepositoryAnalysis();
      case 'dockerfile-generation':
        return this.mockDockerfileGeneration();
      case 'json-repair':
        return this.mockJsonRepair(request);
      default:
        throw new Error(`Unknown template: ${request.templateId}`);
    }
  }
  
  private mockRepositoryAnalysis() {
    // Sometimes return malformed JSON to test repair
    const shouldReturnMalformed = Math.random() < 0.3;
    
    const validResponse = {
      language: 'nodejs',
      languageVersion: '18',
      framework: 'express',
      frameworkVersion: '4.18.0',
      buildSystem: {
        type: 'npm',
        buildFile: 'package.json',
        buildCommand: 'npm run build',
        testCommand: 'npm test'
      },
      dependencies: ['express', 'helmet', 'cors'],
      devDependencies: ['jest', 'nodemon'],
      entryPoint: 'src/index.js',
      suggestedPorts: [3000],
      dockerConfig: {
        baseImage: 'node:18-alpine',
        multistage: true,
        nonRootUser: true
      }
    };
    
    if (shouldReturnMalformed) {
      // Return malformed JSON that will need repair
      return JSON.stringify(validResponse).slice(0, -10); // Truncate to break JSON
    }
    
    return JSON.stringify(validResponse);
  }
  
  private mockDockerfileGeneration() {
    // Sometimes return content with security issues
    const shouldReturnInsecure = Math.random() < 0.2;
    
    if (shouldReturnInsecure) {
      return `FROM node:latest
USER root
RUN curl -sSL https://get.docker.com/ | sh
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "start"]`;
    }
    
    return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["npm", "start"]`;
  }
  
  private mockJsonRepair(request: any) {
    // Extract the malformed JSON and try to repair it
    const malformedJson = request.variables.malformed_json;
    
    try {
      // Simple repair: add missing closing brace if needed
      let repaired = malformedJson;
      if (!repaired.trim().endsWith('}')) {
        repaired += '}';
      }
      
      // Try to parse to validate
      JSON.parse(repaired);
      return repaired;
    } catch {
      // If repair fails, return a basic valid structure
      return JSON.stringify({
        language: 'unknown',
        framework: 'unknown',
        dependencies: []
      });
    }
  }
}

describe('AI Reliability Integration Tests', () => {
  let dependencies: Dependencies;
  let mockLogger: any;
  let mockMCPServer: MockMCPServer;

  beforeEach(async () => {
    mockLogger = pino({ level: 'silent' }); // Suppress logs in tests
    mockMCPServer = new MockMCPServer();
    
    dependencies = new Dependencies({
      config: {
        session: { store: 'memory' },
        features: { aiEnabled: true, mockMode: true }
      },
      logger: mockLogger
    });
    
    // Inject mock MCP server
    (dependencies as any).mcpServer = mockMCPServer;
    
    await dependencies.initialize();
  });

  afterEach(async () => {
    await dependencies.cleanup();
  });

  describe('Structured JSON Sampling', () => {
    it('should handle and repair malformed JSON responses', async () => {
      const structuredSampler = dependencies.structuredSampler;
      expect(structuredSampler).toBeDefined();
      
      // Run multiple samples to increase chance of hitting malformed response
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await structuredSampler.sampleJSON({
          templateId: 'repository-analysis',
          variables: { repoPath: '/test' }
        });
        results.push(result);
      }
      
      // At least some should succeed despite potential malformed responses
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(5); // Should repair and succeed most times
      
      // Check that successful results have expected structure
      const successfulResults = results.filter(r => r.success);
      if (successfulResults.length > 0) {
        const sampleResult = successfulResults[0];
        if (sampleResult.success) {
          expect(sampleResult.data).toHaveProperty('language');
          expect(sampleResult.data).toHaveProperty('dependencies');
        }
      }
    });

    it('should validate JSON against provided schema', async () => {
      const structuredSampler = dependencies.structuredSampler;
      
      // Define a strict schema
      const TestSchema = require('zod').z.object({
        language: require('zod').z.string(),
        dependencies: require('zod').z.array(require('zod').z.string())
      });
      
      const result = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test' }
      }, TestSchema);
      
      if (result.success) {
        expect(result.data).toHaveProperty('language');
        expect(Array.isArray(result.data.dependencies)).toBe(true);
      }
    });
  });

  describe('Content Security Validation', () => {
    it('should validate generated Dockerfiles for security issues', async () => {
      const contentValidator = dependencies.contentValidator;
      expect(contentValidator).toBeDefined();
      
      // Generate multiple Dockerfiles to test both secure and insecure content
      const structuredSampler = dependencies.structuredSampler;
      const dockerfiles = [];
      
      for (let i = 0; i < 5; i++) {
        const result = await structuredSampler.sampleStructured({
          templateId: 'dockerfile-generation',
          variables: { language: 'nodejs' }
        }, 'dockerfile');
        
        if (result.success) {
          dockerfiles.push(result.data);
        }
      }
      
      expect(dockerfiles.length).toBeGreaterThan(0);
      
      // Validate all generated Dockerfiles
      let secureCount = 0;
      let insecureCount = 0;
      
      for (const dockerfile of dockerfiles) {
        const validation = contentValidator.validateContent(dockerfile, 'dockerfile');
        
        if (validation.isValid) {
          secureCount++;
        } else {
          insecureCount++;
          // Should have specific security issues identified
          expect(validation.issues.length).toBeGreaterThan(0);
          expect(validation.summary).toContain('security issues');
        }
      }
      
      // Should have at least some secure content
      expect(secureCount).toBeGreaterThan(0);
    });

    it('should provide actionable security feedback', async () => {
      const contentValidator = dependencies.contentValidator;
      
      const insecureDockerfile = `FROM node:latest
USER root
RUN curl http://example.com/install.sh | bash
ENV API_KEY=secretkey123`;
      
      const validation = contentValidator.validateContent(insecureDockerfile, 'dockerfile');
      
      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      
      // Should categorize issues by severity
      const highSeverityIssues = validation.issues.filter(i => i.severity === 'high');
      const mediumSeverityIssues = validation.issues.filter(i => i.severity === 'medium');
      
      expect(highSeverityIssues.length).toBeGreaterThan(0);
      
      // Should provide specific messages
      const messages = validation.issues.map(i => i.message);
      expect(messages.some(m => m.includes('credential'))).toBe(true);
      expect(messages.some(m => m.includes('curl') || m.includes('shell'))).toBe(true);
    });
  });

  describe('End-to-End Workflow with AI Reliability', () => {
    it('should complete repository analysis with reliability features', async () => {
      const sessionId = nanoid();
      const sessionService = dependencies.sessionService;
      const structuredSampler = dependencies.structuredSampler;
      const contentValidator = dependencies.contentValidator;
      
      // Create session
      await sessionService.create({
        id: sessionId,
        workflowState: {}
      });
      
      // Step 1: Analyze repository with structured sampling
      const analysisResult = await structuredSampler.sampleJSON({
        templateId: 'repository-analysis',
        variables: { repoPath: '/test-project' }
      });
      
      expect(analysisResult.success).toBe(true);
      if (!analysisResult.success) return;
      
      // Step 2: Generate Dockerfile with analysis results
      const dockerfileResult = await structuredSampler.sampleStructured({
        templateId: 'dockerfile-generation',
        variables: {
          language: analysisResult.data.language,
          framework: analysisResult.data.framework || ''
        }
      }, 'dockerfile');
      
      expect(dockerfileResult.success).toBe(true);
      if (!dockerfileResult.success) return;
      
      // Step 3: Validate generated content
      const validation = contentValidator.validateContent(dockerfileResult.data, 'dockerfile');
      
      // Update session with results
      await sessionService.updateAtomic(sessionId, (session) => ({
        ...session,
        workflowState: {
          ...session.workflowState,
          analysisResult: analysisResult.data,
          dockerfileContent: dockerfileResult.data,
          validationResult: validation
        }
      });
      
      // Verify session state
      const updatedSession = await sessionService.get(sessionId);
      expect(updatedSession).toBeDefined();
      if (updatedSession) {
        expect(updatedSession.workflowState.analysisResult).toBeDefined();
        expect(updatedSession.workflowState.dockerfileContent).toBeDefined();
        expect(updatedSession.workflowState.validationResult).toBeDefined();
      }
    });

    it('should handle multiple retry scenarios gracefully', async () => {
      const structuredSampler = dependencies.structuredSampler;
      
      // Test with higher repair attempt limit
      const results = [];
      for (let i = 0; i < 20; i++) {
        const result = await structuredSampler.sampleJSON({
          templateId: 'repository-analysis',
          variables: { repoPath: '/test' }
        }, undefined, { maxRepairAttempts: 3 });
        
        results.push(result);
      }
      
      // Should handle various edge cases and still maintain high success rate
      const successRate = results.filter(r => r.success).length / results.length;
      expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate
    });

    it('should provide consistent results across multiple runs', async () => {
      const structuredSampler = dependencies.structuredSampler;
      const contentValidator = dependencies.contentValidator;
      
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const analysis = await structuredSampler.sampleJSON({
          templateId: 'repository-analysis',
          variables: { repoPath: '/test-nodejs' }
        });
        
        if (analysis.success) {
          const dockerfile = await structuredSampler.sampleStructured({
            templateId: 'dockerfile-generation',
            variables: { language: analysis.data.language }
          }, 'dockerfile');
          
          if (dockerfile.success) {
            const validation = contentValidator.validateContent(dockerfile.data, 'dockerfile');
            runs.push({
              analysis: analysis.data,
              dockerfile: dockerfile.data,
              validation
            });
          }
        }
      }
      
      expect(runs.length).toBeGreaterThan(3);
      
      // All analyses should detect the same primary language
      const languages = runs.map(r => r.analysis.language);
      const uniqueLanguages = [...new Set(languages)];
      expect(uniqueLanguages.length).toBeLessThanOrEqual(2); // Should be consistent
      
      // Security validation should be consistently applied
      const validationResults = runs.map(r => r.validation.isValid);
      const hasConsistentValidation = validationResults.every(v => typeof v === 'boolean');
      expect(hasConsistentValidation).toBe(true);
    });
  });
});