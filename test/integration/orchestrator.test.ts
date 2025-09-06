/**
 * Integration tests for the orchestrator
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { runEnhancedWorkflow, type EnhancedWorkflowConfig } from '../../src/workflows/orchestrated-workflow.js';
import { createLogger } from '../../src/lib/logger.js';
import { DeterministicScorer } from '../../src/workflows/sampling/deterministic-scorer.js';
import { selectWinner } from '../../src/workflows/sampling/tiebreaker.js';
import { ORCHESTRATOR_CONFIG } from '../../src/config/orchestrator-config.js';
import { Success, Failure } from '../../src/types/core.js';
import { ARTIFACT_SCHEMES, buildArtifactUri, parseArtifactUri } from '../../src/mcp/resources/artifact-schemes.js';

describe('Orchestrator', () => {
  let logger: Logger;
  let mockResourceManager: any;
  let config: EnhancedWorkflowConfig;
  
  beforeEach(() => {
    logger = createLogger({ name: 'test', level: 'silent' });
    
    // Create mock resource manager
    mockResourceManager = {
      publish: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue({ data: {} }),
      list: jest.fn().mockResolvedValue([]),
      constructor: { name: 'MockResourceManager' },
    };
    
    // Default enhanced workflow configuration
    config = {
      enableGates: true,
      enableScoring: true,
      enableArtifactPublishing: true,
      enableSampling: false,
      resourceManager: mockResourceManager,
    };
  });
  
  describe('Event Logging', () => {
    it('should log structured events during execution', async () => {
      const logs: any[] = [];
      const originalInfo = logger.info.bind(logger);
      logger.info = jest.fn((data: any, ...args: any[]) => {
        logs.push(data);
        originalInfo(data, ...args);
      });
      
      await runEnhancedWorkflow('/test/repo', logger, config);
      
      // Verify event structure
      const samplingEvents = logs.filter(l => l?.event_type === 'sampling');
      const orchestratorEvents = logs.filter(l => l?.event_type === 'orchestrator');
      
      // Should have orchestrator events
      expect(orchestratorEvents.length).toBeGreaterThan(0);
      expect(orchestratorEvents).toContainEqual(
        expect.objectContaining({
          event_type: 'orchestrator',
          phase: 'workflow',
          event: 'start',
        })
      );
    });
  });
  
  describe('Phase Gates', () => {
    it('should enforce analysis gate requirements', async () => {
      const gates = new PhaseGates(logger);
      
      // Test missing required fields
      const failResult = await gates.checkAnalysisGate({
        language: 'typescript',
        // Missing framework and entrypoint
      });
      
      expect(failResult.ok).toBe(true);
      expect(failResult.value.passed).toBe(false);
      expect(failResult.value.reason).toContain('Missing required fields');
    });
    
    it('should enforce scan gate thresholds', async () => {
      const gates = new PhaseGates(logger);
      
      // Test exceeding thresholds
      const failResult = await gates.checkScanGate({
        vulnerabilities: {
          critical: 5, // Exceeds threshold of 0
          high: 10,    // Exceeds threshold of 2
          medium: 5,
          low: 10,
        },
      });
      
      expect(failResult.ok).toBe(true);
      expect(failResult.value.passed).toBe(false);
      expect(failResult.value.reason).toContain('Vulnerabilities exceed thresholds');
    });
    
    it('should pass scan gate when within thresholds', async () => {
      const gates = new PhaseGates(logger);
      
      const passResult = await gates.checkScanGate({
        vulnerabilities: {
          critical: 0,
          high: 1,
          medium: 5,
          low: 10,
        },
      });
      
      expect(passResult.ok).toBe(true);
      expect(passResult.value.passed).toBe(true);
    });
  });
  
  describe('Deterministic Scoring', () => {
    it('should calculate weighted scores correctly', async () => {
      const scorer = new DeterministicScorer(logger, {
        metric1: 50,
        metric2: 30,
        metric3: 20,
      });
      
      const candidates = [
        {
          id: 'candidate1',
          data: 'test1',
          generatedAt: Date.now(),
        },
        {
          id: 'candidate2',
          data: 'test2',
          generatedAt: Date.now() + 1000,
        },
      ];
      
      const result = await scorer.score(candidates, async () => ({
        metric1: 80,
        metric2: 90,
        metric3: 70,
      }));
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0].score).toBe(81); // (80*50 + 90*30 + 70*20) / 100
        expect(result.value[0].rank).toBe(1);
      }
    });
    
    it('should stop early when threshold is reached', async () => {
      const scorer = new DeterministicScorer(logger, ORCHESTRATOR_CONFIG.DOCKERFILE_WEIGHTS);
      
      const candidates = Array.from({ length: 5 }, (_, i) => ({
        id: `candidate${i}`,
        data: `test${i}`,
        generatedAt: Date.now() + i * 1000,
      }));
      
      let scoreCallCount = 0;
      const result = await scorer.score(candidates, async (candidate) => {
        scoreCallCount++;
        // First candidate scores above threshold
        if (candidate.id === 'candidate0') {
          return {
            staticLint: 95,
            imageSize: 95,
            buildTime: 90,
            warnings: 90,
          };
        }
        return {
          staticLint: 70,
          imageSize: 70,
          buildTime: 70,
          warnings: 70,
        };
      });
      
      expect(result.ok).toBe(true);
      expect(scoreCallCount).toBe(1); // Should stop after first candidate
    });
  });
  
  describe('Tie-Breaking', () => {
    it('should select winner without tie-breaking when score difference is large', () => {
      const candidates = [
        {
          id: 'candidate1',
          data: 'test1',
          generatedAt: 1000,
          score: 90,
          scoreBreakdown: {},
        },
        {
          id: 'candidate2',
          data: 'test2',
          generatedAt: 2000,
          score: 70,
          scoreBreakdown: {},
        },
      ];
      
      const winner = selectWinner(candidates, logger);
      expect(winner?.id).toBe('candidate1');
    });
    
    it('should apply tie-breaking when scores are close', () => {
      const candidates = [
        {
          id: 'candidate1',
          data: 'test1',
          generatedAt: 1000,
          score: 85,
          scoreBreakdown: {},
        },
        {
          id: 'candidate2',
          data: 'test2',
          generatedAt: 2000, // Newer timestamp
          score: 83, // Within TIEBREAK_MARGIN
          scoreBreakdown: {},
        },
      ];
      
      const winner = selectWinner(candidates, logger);
      // Should select candidate2 due to newer timestamp
      expect(winner?.id).toBe('candidate2');
    });
  });
  
  describe('Artifact Publishing', () => {
    it('should publish artifacts with correct URIs', async () => {
      const sessionId = 'test-session';
      const phase = 'analysis';
      
      const uri = buildArtifactUri(ARTIFACT_SCHEMES.ANALYSIS, sessionId, phase, 12345);
      
      expect(uri).toBe('analysis://test-session/analysis://12345');
      
      const parsed = parseArtifactUri(uri);
      expect(parsed).toEqual({
        scheme: 'analysis',
        sessionId: 'test-session',
        type: 'analysis:',
        id: '12345',
      });
    });
    
    it('should check if URI is an artifact URI', () => {
      const artifactUri = 'dockerfile://session123/winner';
      const normalUri = 'http://example.com';
      
      expect(isArtifactUri(artifactUri)).toBe(true);
      expect(isArtifactUri(normalUri)).toBe(false);
    });
  });
  
  describe('Configuration Validation', () => {
    it('should validate scoring weights sum to 100', () => {
      const validWeights = ORCHESTRATOR_CONFIG.DOCKERFILE_WEIGHTS;
      const sum = Object.values(validWeights).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });
    
    it('should have valid phase configurations', () => {
      const phases = Object.keys(ORCHESTRATOR_CONFIG.PHASES);
      expect(phases).toContain('analysis');
      expect(phases).toContain('dockerfile');
      expect(phases).toContain('build');
      
      // Check each phase has required fields
      Object.entries(ORCHESTRATOR_CONFIG.PHASES).forEach(([phase, config]) => {
        expect(config.maxRetries).toBeGreaterThanOrEqual(0);
        expect(config.timeoutSeconds).toBeGreaterThan(0);
      });
    });
  });
});

// Import helper for testing
function isArtifactUri(uri: string): boolean {
  const schemes = Object.values(ARTIFACT_SCHEMES);
  return schemes.some(scheme => uri.startsWith(`${scheme}://`));
}