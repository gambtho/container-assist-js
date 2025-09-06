/**
 * Integration tests for the simplified orchestrator
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

describe('Simplified Orchestrator', () => {
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
  
  it('should log structured events during execution', async () => {
    const logs: unknown[] = [];
    const originalInfo = logger.info.bind(logger);
    logger.info = jest.fn((data: any, ...args: any[]) => {
      if (typeof data === 'object') {
        logs.push(data);
      }
      return originalInfo(data, ...args);
    }) as any;
    
    await orchestrator.executeWorkflow('/test/repo');
    
    // Verify event structure
    const samplingEvents = logs.filter((l: any) => l.event_type === 'sampling');
    const orchestratorEvents = logs.filter((l: any) => l.event_type === 'orchestrator');
    
    expect(samplingEvents).toContainEqual(
      expect.objectContaining({
        event_name: 'score/start'
      })
    );
    
    expect(orchestratorEvents).toContainEqual(
      expect.objectContaining({
        phase: 'analysis',
        event: 'start'
      })
    );
  });
  
  it('should enforce phase gates', async () => {
    // Mock analysis to return missing required fields
    mockTools.analyzeRepository.execute = jest.fn().mockResolvedValue(Success({
      // Missing required fields: language, framework, entrypoint
      ports: [3000],
    }));
    
    const result = await orchestrator.executeWorkflow('/test/repo');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Missing required fields');
    }
  });
  
  it('should publish artifacts to resource manager', async () => {
    const result = await orchestrator.executeWorkflow('/test/repo');
    
    expect(mockResourceManager.publish).toHaveBeenCalled();
    
    // Check that artifacts were published with proper URIs
    const publishCalls = mockResourceManager.publish.mock.calls;
    const artifactUris = publishCalls.map((call: any[]) => call[0]);
    
    // Should have artifacts for different phases
    const hasAnalysisArtifact = artifactUris.some((uri: string) => 
      uri.includes(ARTIFACT_SCHEMES.ANALYSIS)
    );
    const hasDockerfileArtifact = artifactUris.some((uri: string) => 
      uri.includes(ARTIFACT_SCHEMES.DOCKERFILE)
    );
    
    expect(hasAnalysisArtifact).toBe(true);
    expect(hasDockerfileArtifact).toBe(true);
  });
  
  it('should apply deterministic scoring to candidates', async () => {
    const scorer = new DeterministicScorer(logger, ORCHESTRATOR_CONFIG.DOCKERFILE_WEIGHTS);
    
    const candidates = [
      {
        id: 'candidate-1',
        data: 'dockerfile-content-1',
        generatedAt: Date.now(),
        metadata: { score: 85 },
      },
      {
        id: 'candidate-2',
        data: 'dockerfile-content-2',
        generatedAt: Date.now() + 1000,
        metadata: { score: 90 },
      },
    ];
    
    const scoringResult = await scorer.score(
      candidates,
      async () => ({
        staticLint: 80,
        imageSize: 85,
        buildTime: 75,
        warnings: 90,
      }),
    );
    
    expect(scoringResult.ok).toBe(true);
    if (scoringResult.ok) {
      expect(scoringResult.value).toHaveLength(2);
      expect(scoringResult.value[0].rank).toBe(1);
      expect(scoringResult.value[1].rank).toBe(2);
    }
  });
  
  it('should select winner with tie-breaking when scores are close', () => {
    const candidates = [
      {
        id: 'candidate-1',
        data: 'content-1',
        generatedAt: 1000,
        score: 85,
        scoreBreakdown: {},
        rank: 1,
      },
      {
        id: 'candidate-2',
        data: 'content-2',
        generatedAt: 2000,
        score: 86, // Within tie-break margin
        scoreBreakdown: {},
        rank: 2,
      },
    ];
    
    const logSpy = jest.spyOn(logger, 'info');
    const winner = selectWinner(candidates, logger);
    
    expect(winner).toBeDefined();
    expect(winner?.id).toBe('candidate-2'); // Newer timestamp wins
    
    // Check that tie-breaking was logged
    const tiebreakerLogs = logSpy.mock.calls.filter((call: any[]) => {
      const data = call[0];
      return data?.event_name === 'tiebreak/needed';
    });
    
    expect(tiebreakerLogs.length).toBeGreaterThan(0);
  });
  
  it('should validate gate thresholds for scan results', async () => {
    const gates = new PhaseGates(logger);
    
    // Test passing gate
    const passingResult = await gates.checkScanGate({
      vulnerabilities: { critical: 0, high: 1, medium: 5, low: 10 },
      imageSize: 50000000,
      layers: 10,
    });
    
    expect(passingResult.ok).toBe(true);
    if (passingResult.ok) {
      expect(passingResult.value.passed).toBe(true);
    }
    
    // Test failing gate
    const failingResult = await gates.checkScanGate({
      vulnerabilities: { critical: 5, high: 10, medium: 20, low: 30 },
      imageSize: 200000000,
      layers: 20,
    });
    
    expect(failingResult.ok).toBe(true);
    if (failingResult.ok) {
      expect(failingResult.value.passed).toBe(false);
      expect(failingResult.value.reason).toContain('exceed thresholds');
    }
  });
  
  it('should build and parse artifact URIs correctly', () => {
    const uri = buildArtifactUri(
      ARTIFACT_SCHEMES.DOCKERFILE,
      'session-123',
      'candidate',
      1,
    );
    
    expect(uri).toBe('dockerfile://session-123://candidate://1');
    
    const parsed = parseArtifactUri(uri);
    expect(parsed).toEqual({
      scheme: 'dockerfile',
      sessionId: 'session-123',
      type: 'candidate',
      id: '1',
    });
  });
});