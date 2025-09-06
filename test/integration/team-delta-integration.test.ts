/**
 * Team Delta Integration Tests
 *
 * Comprehensive tests for Team Delta's enhanced tools with Team Alpha and Team Beta integrations.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { pino } from 'pino';
import { createEnhancedToolFactory } from '../../src/application/tools/enhanced-tool-factory';
import { createTeamAlphaResourcePublisher } from '../../src/application/tools/integrations/team-alpha-integration';
import { createTeamBetaIntegration } from '../../src/application/tools/integrations/team-beta-integration';
import { McpResourceManager } from '../../src/mcp/resources/manager';
import { MemoryResourceCache } from '../../src/mcp/resources/cache';
import type { EnhancedToolFactory } from '../../src/application/tools/interfaces';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Team Delta Integration Tests', () => {
  let logger: ReturnType<typeof pino>;
  let toolFactory: EnhancedToolFactory;
  let tempDir: string;
  let sessionId: string;

  beforeEach(async () => {
    logger = pino({ level: 'debug' });
    toolFactory = createEnhancedToolFactory(logger);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'team-delta-test-'));
    sessionId = `test-session-${Date.now()}`;
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Enhanced Tool Factory', () => {
    it('should create and list enhanced tools', () => {
      const tools = toolFactory.listTools();
      
      expect(tools).toContain('analyze-repo');
      expect(tools).toContain('generate-dockerfile');
      expect(tools).toContain('build-image');
      expect(tools).toContain('scan-image');
      expect(tools).toContain('generate-k8s-manifests');
      expect(tools).toContain('deploy-application');
    });

    it('should report tool capabilities correctly', () => {
      const capabilities = toolFactory.getToolCapabilities();
      
      expect(capabilities['analyze-repo']).toEqual({
        sampling: false,
        resources: true,
        progress: true,
        recovery: true,
      });

      expect(capabilities['generate-dockerfile']).toEqual({
        sampling: true,
        resources: true,
        progress: true,
        recovery: true,
      });
    });

    it('should provide health status for tools', async () => {
      const health = await toolFactory.getToolHealth('analyze-repo');
      
      expect(health.name).toBe('analyze-repo');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.features).toHaveProperty('sampling');
      expect(health.features).toHaveProperty('resources');
      expect(health.features).toHaveProperty('progress');
    });
  });

  describe('Team Alpha Integration', () => {
    let resourcePublisher: ReturnType<typeof createTeamAlphaResourcePublisher>;
    let resourceManager: McpResourceManager;

    beforeEach(() => {
      const cache = new MemoryResourceCache(3600, logger);
      resourceManager = new McpResourceManager(
        {
          defaultTtl: 3600000, // 1 hour in ms
          maxResourceSize: 10 * 1024 * 1024, // 10MB
        },
        logger,
        cache,
      );

      resourcePublisher = createTeamAlphaResourcePublisher(
        logger,
        sessionId,
        {
          defaultTTL: 3600,
          maxResourceSize: 10 * 1024 * 1024,
        },
        resourceManager,
      );
    });

    it('should publish and retrieve resources via Team Alpha', async () => {
      const testData = {
        message: 'Hello from Team Delta',
        timestamp: new Date().toISOString(),
        data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` })),
      };

      // Publish resource
      const resourceRef = await resourcePublisher.publish(testData, 'application/json', 1800);
      
      expect(resourceRef.uri).toMatch(/^mcp:\/\/test-session-\d+\/resources\/[a-f0-9]{16}$/);
      expect(resourceRef.mimeType).toBe('application/json');
      expect(resourceRef.description).toContain('JSON object');
      expect(resourceRef.size).toBeGreaterThan(0);
      expect(resourceRef.metadata?.teamAlphaManaged).toBe(true);

      // Read resource back
      const readResult = await (resourcePublisher as any).read(resourceRef.uri);
      expect(readResult.ok).toBe(true);
      expect(readResult.value).toEqual(testData);
    });

    it('should handle large resources correctly', async () => {
      const largeData = {
        items: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          data: `Large data item ${i}`.repeat(10),
          metadata: { created: new Date().toISOString(), index: i },
        })),
      };

      const resourceRef = await resourcePublisher.publishLarge(largeData, 'application/json');
      
      expect(resourceRef.uri).toMatch(/^mcp:\/\//);
      expect(resourceRef.size).toBeGreaterThan(1000000); // > 1MB
      expect(resourceRef.ttl).toBe(7200); // Double TTL for large resources
    });

    it('should cleanup resources with patterns', async () => {
      // Publish multiple resources
      await resourcePublisher.publish({ test: 1 }, 'application/json');
      await resourcePublisher.publish({ test: 2 }, 'application/json');
      await resourcePublisher.publish({ test: 3 }, 'application/json');

      // Cleanup all session resources
      await expect(resourcePublisher.cleanup()).resolves.not.toThrow();

      // Cleanup with specific pattern
      await expect(resourcePublisher.cleanup(`mcp://${sessionId}/*`)).resolves.not.toThrow();
    });
  });

  describe('Team Beta Integration', () => {
    let betaIntegration: ReturnType<typeof createTeamBetaIntegration>;

    beforeEach(() => {
      betaIntegration = createTeamBetaIntegration(logger);
    });

    it('should create mock sampling service', () => {
      const samplingService = betaIntegration.createMockSamplingService(sessionId);
      
      expect(samplingService).toBeDefined();
      expect(typeof samplingService.generateCandidates).toBe('function');
      expect(typeof samplingService.scoreCandidates).toBe('function');
      expect(typeof samplingService.selectWinner).toBe('function');
    });

    it('should generate and score candidates', async () => {
      const samplingService = betaIntegration.createMockSamplingService(sessionId);
      
      const mockGenerator = {
        generate: async (input: unknown, count: number) => 
          Array.from({ length: Math.min(count, 3) }, (_, i) => ({
            id: `candidate-${i}`,
            content: `Generated content ${i} for ${JSON.stringify(input)}`,
            metadata: {},
            generatedAt: new Date(),
          })),
        validate: async () => true,
      };

      const input = { language: 'node.js', framework: 'express' };
      const config = {
        maxCandidates: 3,
        scoringWeights: { security: 0.3, performance: 0.3, maintainability: 0.4 },
        timeoutMs: 10000,
        cachingEnabled: true,
      };

      // Generate candidates
      const candidates = await samplingService.generateCandidates(input, config, mockGenerator);
      expect(candidates).toHaveLength(3);
      expect(candidates[0].id).toMatch(/^candidate-\d+$/);
      expect(candidates[0].content).toContain('Generated content');

      // Score candidates
      const scoredCandidates = await samplingService.scoreCandidates(candidates, config.scoringWeights);
      expect(scoredCandidates).toHaveLength(3);
      expect(scoredCandidates[0].score).toBeGreaterThan(0);
      expect(scoredCandidates[0].scores).toHaveProperty('security');
      expect(scoredCandidates[0].scores).toHaveProperty('performance');

      // Select winner
      const winner = samplingService.selectWinner(scoredCandidates);
      expect(winner).toBeDefined();
      expect(winner.score).toBeGreaterThanOrEqual(scoredCandidates[1]?.score || 0);
    });
  });

  describe('Enhanced Repository Analysis', () => {
    it('should analyze repository with resource publishing', async () => {
      // Create a simple test repository structure
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { express: '^4.18.0' },
        }),
      );
      await fs.writeFile(
        path.join(tempDir, 'src', 'index.js'),
        'const express = require("express");\nconst app = express();\napp.listen(3000);',
      );

      // Execute enhanced analyze-repo tool
      const result = await toolFactory.executeTool(
        'analyze-repo',
        { path: tempDir },
        sessionId,
        { useTeamIntegrations: true },
      );

      expect(result.ok).toBe(true);
      expect(result.value).toHaveProperty('content');
      
      const content = result.value.content[0];
      if (content.type === 'text') {
        const analysisResult = JSON.parse(content.text);
        expect(analysisResult.language).toBe('javascript');
        expect(analysisResult.summary).toContain('Node.js');
      } else if (content.type === 'resource') {
        expect(content.resource?.uri).toMatch(/^mcp:\/\//);
        expect(content.resource?.mimeType).toBe('application/json');
      }
    });
  });

  describe('Enhanced Dockerfile Generation', () => {
    it('should generate dockerfile with sampling', async () => {
      // Create test analysis result
      const analysisResult = {
        language: 'javascript',
        framework: 'express',
        hasPackageJson: true,
        dependencies: ['express', 'cors'],
        ports: [3000],
      };

      // Execute enhanced generate-dockerfile tool
      const result = await toolFactory.executeTool(
        'generate-dockerfile',
        { 
          analysisResult,
          optimization: 'balanced',
          enableSampling: true,
        },
        sessionId,
        { useTeamIntegrations: true },
      );

      expect(result.ok).toBe(true);
      expect(result.value).toHaveProperty('content');

      // Check if sampling was used (either in response metadata or resources)
      const content = result.value.content;
      const hasResourceContent = content.some((item: any) => item.type === 'resource');
      const hasTextContent = content.some((item: any) => item.type === 'text');

      expect(hasResourceContent || hasTextContent).toBe(true);
    });
  });

  describe('Dynamic Configuration', () => {
    it('should update tool configuration dynamically', async () => {
      const initialHealth = await toolFactory.getToolHealth('generate-dockerfile');
      expect(initialHealth.features.sampling).toBe('available');

      // Update configuration to disable sampling
      await toolFactory.updateDynamicConfig('generate-dockerfile', {
        features: {
          sampling: false,
          resourcePublishing: true,
          progressReporting: true,
          errorRecovery: true,
          dynamicConfig: true,
          mcpIntegration: true,
        },
      });

      const updatedHealth = await toolFactory.getToolHealth('generate-dockerfile');
      expect(updatedHealth.features.sampling).toBe('unavailable');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid repository path gracefully', async () => {
      const result = await toolFactory.executeTool(
        'analyze-repo',
        { path: '/nonexistent/path' },
        sessionId,
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle resource publishing failures', async () => {
      const resourceManager = new McpResourceManager(
        {
          defaultTtl: 3600000,
          maxResourceSize: 100, // Very small limit to force failure
        },
        logger,
      );

      const resourcePublisher = createTeamAlphaResourcePublisher(
        logger,
        sessionId,
        { maxResourceSize: 100 },
        resourceManager,
      );

      const largeData = { data: 'x'.repeat(1000) }; // Exceeds limit

      await expect(
        resourcePublisher.publish(largeData, 'application/json'),
      ).rejects.toThrow('Resource publishing failed');
    });
  });
});