/**
 * MCP Inspector Sampling Decision Tests
 * 
 * Tests for validating sampling decisions, scoring, and tie-breaking
 */

import type { TestCase, MCPTestRunner, TestResult } from '../../infrastructure/test-runner.js';
import { config } from '../../../../../src/config/index.js';

export const createSamplingDecisionTests = (testRunner: MCPTestRunner): TestCase[] => {
  const client = testRunner.getClient();

  return [
    {
      name: 'deterministic-scoring-consistency',
      category: 'sampling-validation',
      description: 'Verify scoring produces consistent results',
      tags: ['sampling', 'scoring', 'deterministic'],
      timeout: 60000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `scoring-${Date.now()}`;
        
        try {
          // Run same sampling twice
          const results = [];
          for (let i = 0; i < 2; i++) {
            const result = await client.callTool({
              name: 'generate-dockerfile',
              arguments: {
                sessionId: `${sessionId}-${i}`,
                repoPath: './test/fixtures/node-express',
                enableSampling: true,
                maxCandidates: 3,
                useCache: false // Force regeneration
              }
            });
            
            const response = JSON.parse(result.content[0].text);
            results.push(response.scoringDetails);
          }
          
          // Compare scores
          const scoresMatch = 
            results[0]?.candidates?.length === results[1]?.candidates?.length &&
            results[0]?.candidates?.every((c1: any, i: number) => {
              const c2 = results[1].candidates[i];
              return Math.abs(c1.score - c2.score) < 0.01; // Allow tiny float differences
            });
          
          return {
            success: scoresMatch,
            duration: performance.now() - start,
            message: scoresMatch ? 'Scoring is deterministic' : 'Scoring inconsistent',
            details: { 
              run1: results[0], 
              run2: results[1] 
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'early-stop-mechanism',
      category: 'sampling-validation',
      description: 'Verify early stop triggers on high score',
      tags: ['sampling', 'optimization', 'early-stop'],
      timeout: 45000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `early-stop-${Date.now()}`;
        
        try {
          // Configure for early stop
          const result = await client.callTool({
            name: 'generate-dockerfile',
            arguments: {
              sessionId,
              repoPath: './test/fixtures/optimized-repo', // Well-structured repo
              enableSampling: true,
              maxCandidates: 5,
              earlyStopThreshold: config.orchestrator.earlyStopThreshold
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Check if early stop triggered
          const earlyStop = 
            response.samplingMetadata?.stoppedEarly === true &&
            response.samplingMetadata?.winnerScore >= config.orchestrator.earlyStopThreshold &&
            response.samplingMetadata?.candidatesGenerated < 5;
          
          return {
            success: earlyStop,
            duration: performance.now() - start,
            message: earlyStop ? 
              `Early stop at score ${response.samplingMetadata?.winnerScore}` : 
              'Early stop did not trigger',
            details: response.samplingMetadata
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'tiebreaker-logic',
      category: 'sampling-validation',
      description: 'Verify tie-breaking works for close scores',
      tags: ['sampling', 'tiebreaker'],
      timeout: 30000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        
        try {
          // Mock candidates with close scores
          const result = await client.callTool({
            name: 'test-tiebreaker',
            arguments: {
              candidates: [
                { id: 'c1', score: 85.0, generatedAt: new Date('2024-01-01').getTime() },
                { id: 'c2', score: 85.2, generatedAt: new Date('2024-01-02').getTime() },
                { id: 'c3', score: 70.0, generatedAt: new Date('2024-01-03').getTime() }
              ],
              tiebreakMargin: config.orchestrator.tiebreakMargin
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Should trigger tiebreak between c1 and c2
          const tiebreakerTriggered = 
            response.tiebreakerUsed === true &&
            response.winnerId === 'c2'; // Newer timestamp wins
          
          return {
            success: tiebreakerTriggered,
            duration: performance.now() - start,
            message: tiebreakerTriggered ? 'Tiebreaker worked correctly' : 'Tiebreaker failed',
            details: response
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'weighted-scoring-calculation',
      category: 'sampling-validation',
      description: 'Verify weighted scoring calculates correctly',
      tags: ['sampling', 'scoring', 'weights'],
      timeout: 30000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        
        try {
          // Test weighted scoring
          const result = await client.callTool({
            name: 'test-scoring',
            arguments: {
              scores: {
                build: 80,
                size: 90,
                security: 70,
                speed: 100
              },
              weights: config.sampling.weights.dockerfile
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Calculate expected score manually
          const weights = config.sampling.weights.dockerfile;
          const expectedScore = 
            (80 * weights.build + 
             90 * weights.size + 
             70 * weights.security + 
             100 * weights.speed) / 100;
          
          const scoreCorrect = Math.abs(response.finalScore - expectedScore) < 0.01;
          
          return {
            success: scoreCorrect,
            duration: performance.now() - start,
            message: scoreCorrect ? 
              `Weighted score calculated correctly: ${response.finalScore}` : 
              `Score mismatch: got ${response.finalScore}, expected ${expectedScore}`,
            details: { 
              calculated: response.finalScore,
              expected: expectedScore,
              weights
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'candidate-ranking',
      category: 'sampling-validation',
      description: 'Verify candidates are ranked correctly',
      tags: ['sampling', 'ranking'],
      timeout: 45000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `ranking-${Date.now()}`;
        
        try {
          // Generate and rank candidates
          const result = await client.callTool({
            name: 'generate-dockerfile',
            arguments: {
              sessionId,
              repoPath: './test/fixtures/node-express',
              enableSampling: true,
              maxCandidates: 5,
              returnAllCandidates: true
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          const candidates = response.allCandidates || [];
          
          // Verify ranking
          let correctlyRanked = true;
          for (let i = 1; i < candidates.length; i++) {
            if (candidates[i - 1].score < candidates[i].score) {
              correctlyRanked = false;
              break;
            }
            if (candidates[i].rank !== i + 1) {
              correctlyRanked = false;
              break;
            }
          }
          
          return {
            success: correctlyRanked,
            duration: performance.now() - start,
            message: correctlyRanked ? 
              'Candidates correctly ranked' : 
              'Ranking error detected',
            details: { 
              candidates: candidates.map((c: any) => ({
                id: c.id,
                score: c.score,
                rank: c.rank
              }))
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'score-breakdown-tracking',
      category: 'sampling-validation',
      description: 'Verify score breakdown is tracked for each candidate',
      tags: ['sampling', 'scoring', 'observability'],
      timeout: 45000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `breakdown-${Date.now()}`;
        
        try {
          // Generate candidates with score breakdown
          const result = await client.callTool({
            name: 'generate-dockerfile',
            arguments: {
              sessionId,
              repoPath: './test/fixtures/node-express',
              enableSampling: true,
              maxCandidates: 3,
              includeScoreBreakdown: true
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Check if score breakdown is provided
          const hasBreakdown = 
            response.winner?.scoreBreakdown &&
            Object.keys(response.winner.scoreBreakdown).length === 4 && // Should have 4 scoring criteria
            Object.values(response.winner.scoreBreakdown).every(
              (score: any) => typeof score === 'number' && score >= 0 && score <= 100
            );
          
          return {
            success: hasBreakdown,
            duration: performance.now() - start,
            message: hasBreakdown ? 
              'Score breakdown tracked correctly' : 
              'Score breakdown missing or invalid',
            details: { 
              winner: response.winner,
              scoreBreakdown: response.winner?.scoreBreakdown
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    },
    
    {
      name: 'sampling-cache-effectiveness',
      category: 'sampling-validation',
      description: 'Verify sampling cache improves performance',
      tags: ['sampling', 'cache', 'performance'],
      timeout: 90000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `cache-test-${Date.now()}`;
        
        try {
          // First run - cold cache
          const coldStart = performance.now();
          await client.callTool({
            name: 'generate-dockerfile',
            arguments: {
              sessionId: `${sessionId}-cold`,
              repoPath: './test/fixtures/node-express',
              enableSampling: true,
              maxCandidates: 3
            }
          });
          const coldDuration = performance.now() - coldStart;
          
          // Second run - warm cache
          const warmStart = performance.now();
          await client.callTool({
            name: 'generate-dockerfile',
            arguments: {
              sessionId: `${sessionId}-warm`,
              repoPath: './test/fixtures/node-express',
              enableSampling: true,
              maxCandidates: 3
            }
          });
          const warmDuration = performance.now() - warmStart;
          
          // Cache should make second run faster
          const cacheEffective = warmDuration < coldDuration * 0.7; // At least 30% faster
          
          return {
            success: cacheEffective,
            duration: performance.now() - start,
            message: cacheEffective ? 
              `Cache improved performance by ${((1 - warmDuration/coldDuration) * 100).toFixed(1)}%` : 
              'Cache did not improve performance',
            details: { 
              coldDuration,
              warmDuration,
              improvement: `${((1 - warmDuration/coldDuration) * 100).toFixed(1)}%`
            }
          };
        } catch (error) {
          return {
            success: false,
            duration: performance.now() - start,
            message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    }
  ];
};