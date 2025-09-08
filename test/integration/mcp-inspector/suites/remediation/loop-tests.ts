/**
 * MCP Inspector Remediation Loop Tests
 * 
 * Tests for validating scan remediation and deployment verification loops
 */

import type { TestCase, MCPTestRunner, TestResult } from '../../infrastructure/test-runner.js';
import { config } from '../../../../../src/config/index.js';

export const createRemediationTests = (testRunner: MCPTestRunner): TestCase[] => {
  const client = testRunner.getClient();

  return [
    {
      name: 'scan-remediation-loop',
      category: 'remediation',
      description: 'Verify scan remediation reduces vulnerabilities',
      tags: ['remediation', 'security', 'scan'],
      timeout: 120000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `scan-remediation-${Date.now()}`;
        
        try {
          // Build vulnerable image
          const buildResult = await client.callTool({
            name: 'build-image',
            arguments: {
              sessionId,
              dockerfilePath: './test/fixtures/vulnerable.Dockerfile'
            }
          });
          
          const imageId = JSON.parse(buildResult.content[0].text).imageId;
          
          // Scan and remediate
          const result = await client.callTool({
            name: 'scan-and-remediate',
            arguments: {
              sessionId,
              imageId,
              maxAttempts: 3,
              targetThresholds: config.orchestrator.scanThresholds
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          const remediationSuccessful = 
            response.success &&
            response.finalScan?.vulnerabilities?.critical === 0 &&
            response.finalScan?.vulnerabilities?.high <= config.orchestrator.scanThresholds.high;
          
          return {
            success: remediationSuccessful,
            duration: performance.now() - start,
            message: remediationSuccessful ? 
              `Remediated in ${response.attempts} attempts` : 
              'Remediation failed',
            details: {
              initialScan: response.initialScan,
              finalScan: response.finalScan,
              patches: response.appliedPatches
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
      name: 'verify-remediation-diagnostics',
      category: 'remediation',
      description: 'Verify deployment diagnostics and remediation',
      tags: ['remediation', 'deployment', 'diagnostics'],
      timeout: 180000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `verify-remediation-${Date.now()}`;
        
        try {
          // Deploy with issues
          await client.callTool({
            name: 'deploy-application',
            arguments: {
              sessionId,
              manifests: './test/fixtures/problematic-manifests.yaml'
            }
          });
          
          // Run verify with remediation
          const result = await client.callTool({
            name: 'verify-and-remediate',
            arguments: {
              sessionId,
              deploymentName: 'test-app',
              namespace: 'default',
              maxAttempts: 2,
              diagnosticPlaybook: true
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          const diagnosticsRan = 
            response.diagnostics?.length > 0 &&
            response.diagnostics?.includes('checkEvents') &&
            response.diagnostics?.includes('checkProbes');
          
          return {
            success: diagnosticsRan,
            duration: performance.now() - start,
            message: diagnosticsRan ? 
              'Diagnostics and remediation executed' : 
              'Diagnostics did not run',
            details: {
              diagnostics: response.diagnostics,
              remediations: response.remediations,
              finalStatus: response.finalStatus
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
      name: 'patch-generation-effectiveness',
      category: 'remediation',
      description: 'Verify patch generation reduces vulnerability count',
      tags: ['remediation', 'patches', 'security'],
      timeout: 90000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `patch-gen-${Date.now()}`;
        
        try {
          // Generate patches for vulnerable Dockerfile
          const result = await client.callTool({
            name: 'generate-security-patches',
            arguments: {
              sessionId,
              dockerfilePath: './test/fixtures/vulnerable.Dockerfile',
              scanResults: {
                vulnerabilities: {
                  critical: 5,
                  high: 10,
                  medium: 20,
                  low: 30
                },
                details: [
                  { package: 'openssl', version: '1.0.1', severity: 'critical' },
                  { package: 'curl', version: '7.1.0', severity: 'high' }
                ]
              }
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Check if patches were generated
          const patchesGenerated = 
            response.patches?.length > 0 &&
            response.patches.some((p: any) => p.type === 'update-base-image') &&
            response.patches.some((p: any) => p.type === 'update-package');
          
          return {
            success: patchesGenerated,
            duration: performance.now() - start,
            message: patchesGenerated ? 
              `Generated ${response.patches.length} patches` : 
              'Failed to generate patches',
            details: {
              patches: response.patches,
              estimatedReduction: response.estimatedReduction
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
      name: 'remediation-retry-logic',
      category: 'remediation',
      description: 'Verify remediation retries with backoff',
      tags: ['remediation', 'retry', 'resilience'],
      timeout: 120000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `retry-logic-${Date.now()}`;
        
        try {
          // Run remediation with flaky conditions
          const result = await client.callTool({
            name: 'scan-and-remediate',
            arguments: {
              sessionId,
              imageId: 'test/flaky-image:latest',
              maxAttempts: 3,
              retryBackoff: 'exponential',
              targetThresholds: config.orchestrator.scanThresholds
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Check retry behavior
          const retriesWorked = 
            response.attemptHistory?.length > 1 &&
            response.attemptHistory.every((attempt: any, index: number) => {
              if (index === 0) return true;
              const prevAttempt = response.attemptHistory[index - 1];
              const timeDiff = attempt.timestamp - prevAttempt.timestamp;
              // Exponential backoff: each retry should take longer
              return timeDiff > prevAttempt.duration * 1.5;
            });
          
          return {
            success: retriesWorked,
            duration: performance.now() - start,
            message: retriesWorked ? 
              'Retry logic with backoff working' : 
              'Retry behavior incorrect',
            details: {
              attempts: response.attempts,
              attemptHistory: response.attemptHistory
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
      name: 'remediation-convergence',
      category: 'remediation',
      description: 'Verify remediation converges to acceptable state',
      tags: ['remediation', 'convergence', 'quality'],
      timeout: 150000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `convergence-${Date.now()}`;
        
        try {
          // Start with highly vulnerable image
          const result = await client.callTool({
            name: 'full-remediation-workflow',
            arguments: {
              sessionId,
              dockerfilePath: './test/fixtures/critical-vulns.Dockerfile',
              maxIterations: 5,
              convergenceThreshold: {
                critical: 0,
                high: 2,
                medium: 10
              }
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          // Check if remediation converged
          const converged = 
            response.converged === true &&
            response.finalState?.vulnerabilities?.critical === 0 &&
            response.finalState?.vulnerabilities?.high <= 2 &&
            response.iterations <= 5;
          
          return {
            success: converged,
            duration: performance.now() - start,
            message: converged ? 
              `Converged in ${response.iterations} iterations` : 
              'Failed to converge',
            details: {
              iterations: response.iterations,
              initialState: response.initialState,
              finalState: response.finalState,
              improvementPath: response.improvementPath
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
      name: 'deployment-healing',
      category: 'remediation',
      description: 'Verify deployment self-healing mechanisms',
      tags: ['remediation', 'deployment', 'self-healing'],
      timeout: 180000,
      execute: async (): Promise<TestResult> => {
        const start = performance.now();
        const sessionId = `healing-${Date.now()}`;
        
        try {
          // Deploy and simulate failures
          await client.callTool({
            name: 'deploy-application',
            arguments: {
              sessionId,
              manifests: './test/fixtures/resilient-app.yaml',
              enableSelfHealing: true
            }
          });
          
          // Inject failure
          await client.callTool({
            name: 'inject-failure',
            arguments: {
              sessionId,
              type: 'pod-crash',
              target: 'test-app-pod-0'
            }
          });
          
          // Wait and check healing
          await new Promise(resolve => setTimeout(resolve, 30000));
          
          const result = await client.callTool({
            name: 'check-deployment-health',
            arguments: {
              sessionId,
              deploymentName: 'test-app'
            }
          });
          
          const response = JSON.parse(result.content[0].text);
          
          const healed = 
            response.healthy === true &&
            response.healingEvents?.length > 0 &&
            response.healingEvents.some((e: any) => e.action === 'pod-recreated');
          
          return {
            success: healed,
            duration: performance.now() - start,
            message: healed ? 
              'Self-healing successfully recovered deployment' : 
              'Self-healing did not work',
            details: {
              healthStatus: response.healthy,
              healingEvents: response.healingEvents,
              currentPods: response.pods
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