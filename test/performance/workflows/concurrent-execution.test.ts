import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PerformanceTestBase, PerformanceThreshold } from '../helpers/performance-test-base';
import { TestRepository } from '../../fixtures/types';
import path from 'path';
import fs from 'fs/promises';

describe('Concurrent Workflow Execution Performance Tests', () => {
  let performanceFramework: PerformanceTestBase;
  let testContext: any;

  beforeAll(async () => {
    performanceFramework = new PerformanceTestBase({
      timeout: 900000, // 15 minutes for performance tests
      iterations: 20,
      warmupRounds: 5,
      useRealInfrastructure: process.env.PERF_REAL_INFRA === 'true',
      enablePersistence: process.env.PERF_PERSIST === 'true',
      thresholds: {
        maxExecutionTime: 10000, // 10 seconds max per operation
        maxMemoryUsage: 500 * 1024 * 1024, // 500MB max
        minOperationsPerSecond: 1, // At least 1 operation per second
        maxLatencyP95: 5000, // 5 second P95 latency
      }
    });

    const setupResult = await performanceFramework.setup();
    if (!setupResult.success) {
      throw new Error(`Failed to setup performance test framework: ${setupResult.error}`);
    }
    testContext = setupResult.data;

    // Create test repository structures for performance testing
    await createPerformanceTestRepositories();
  });

  afterAll(async () => {
    if (performanceFramework) {
      const report = performanceFramework.generatePerformanceReport();
      console.log('\n' + '='.repeat(80));
      console.log('PERFORMANCE TEST REPORT');
      console.log('='.repeat(80));
      console.log(report);
      
      await performanceFramework.teardown();
    }
  });

  beforeEach(() => {
    jest.setTimeout(900000); // 15 minutes per test
  });

  async function createPerformanceTestRepositories() {
    const repositories = [
      { name: 'perf-node-simple', language: 'javascript', framework: 'express' },
      { name: 'perf-python-simple', language: 'python', framework: 'flask' },
      { name: 'perf-java-simple', language: 'java', framework: 'spring-boot' },
      { name: 'perf-node-complex', language: 'javascript', framework: 'express' },
      { name: 'perf-python-complex', language: 'python', framework: 'flask' }
    ];

    for (const repo of repositories) {
      const repoPath = path.join(testContext.tempDir, repo.name);
      await fs.mkdir(repoPath, { recursive: true });

      if (repo.language === 'javascript') {
        await fs.writeFile(
          path.join(repoPath, 'package.json'),
          JSON.stringify({
            name: repo.name,
            version: '1.0.0',
            scripts: { start: 'node server.js' },
            dependencies: { express: '^4.18.0' }
          }, null, 2)
        );

        await fs.writeFile(
          path.join(repoPath, 'server.js'),
          `const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000);
`
        );
      } else if (repo.language === 'python') {
        await fs.writeFile(
          path.join(repoPath, 'requirements.txt'),
          'Flask==2.3.0\n'
        );

        await fs.writeFile(
          path.join(repoPath, 'app.py'),
          `from flask import Flask
app = Flask(__name__)
@app.route('/health')
def health():
    return {'status': 'ok'}
if __name__ == '__main__':
    app.run()
`
        );
      } else if (repo.language === 'java') {
        await fs.mkdir(path.join(repoPath, 'target'), { recursive: true });
        await fs.writeFile(
          path.join(repoPath, 'pom.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>${repo.name}</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <packaging>jar</packaging>
</project>`
        );

        await fs.writeFile(
          path.join(repoPath, 'target', 'app.jar'),
          'mock jar content'
        );
      }
    }
  }

  describe('Single Tool Performance Benchmarks', () => {
    it('should benchmark repository analysis performance', async () => {
      const { mcpClient } = testContext;
      
      const benchmarkResult = await performanceFramework.runPerformanceTest(
        'analyze-repo-performance',
        async () => {
          return await mcpClient.callTool('analyze-repo', {
            path: path.join(testContext.tempDir, 'perf-node-simple')
          });
        },
        {
          iterations: 30,
          thresholds: {
            maxExecutionTime: 2000, // 2 seconds max
            maxMemoryUsage: 100 * 1024 * 1024, // 100MB max
            minOperationsPerSecond: 5 // At least 5 analyses per second
          }
        }
      );

      expect(benchmarkResult.success).toBe(true);
      expect(benchmarkResult.data.passed).toBe(true);

      const avgTime = benchmarkResult.data.metrics.reduce((sum, m) => sum + m.executionTime, 0) / benchmarkResult.data.metrics.length;
      console.log(`Average analysis time: ${avgTime.toFixed(2)}ms`);
    });

    it('should benchmark Dockerfile generation performance', async () => {
      const { mcpClient } = testContext;
      
      const benchmarkResult = await performanceFramework.runPerformanceTest(
        'dockerfile-generation-performance',
        async () => {
          return await mcpClient.callTool('generate-dockerfile', {
            repositoryPath: path.join(testContext.tempDir, 'perf-node-simple')
          });
        },
        {
          iterations: 25,
          thresholds: {
            maxExecutionTime: 1500, // 1.5 seconds max
            maxMemoryUsage: 80 * 1024 * 1024, // 80MB max
            minOperationsPerSecond: 8 // At least 8 generations per second
          }
        }
      );

      expect(benchmarkResult.success).toBe(true);
      expect(benchmarkResult.data.passed).toBe(true);
    });

    it('should benchmark K8s manifest generation performance', async () => {
      const { mcpClient } = testContext;
      
      const benchmarkResult = await performanceFramework.runPerformanceTest(
        'k8s-manifest-generation-performance',
        async () => {
          return await mcpClient.callTool('generate-k8s-manifests', {
            repositoryPath: path.join(testContext.tempDir, 'perf-node-simple'),
            environment: 'production',
            replicas: 3,
            resourceLimits: { memory: '512Mi', cpu: '500m' }
          });
        },
        {
          iterations: 20,
          thresholds: {
            maxExecutionTime: 2000, // 2 seconds max
            maxMemoryUsage: 120 * 1024 * 1024, // 120MB max
            minOperationsPerSecond: 6 // At least 6 generations per second
          }
        }
      );

      expect(benchmarkResult.success).toBe(true);
      expect(benchmarkResult.data.passed).toBe(true);
    });
  });

  describe('Concurrent Workflow Execution', () => {
    it('should handle concurrent analysis operations', async () => {
      const { mcpClient } = testContext;
      const concurrencyLevels = [2, 5, 10];

      for (const concurrency of concurrencyLevels) {
        const benchmarkResult = await performanceFramework.runConcurrentPerformanceTest(
          `concurrent-analysis-${concurrency}`,
          async () => {
            const repositories = [
              'perf-node-simple',
              'perf-python-simple', 
              'perf-java-simple',
              'perf-node-complex',
              'perf-python-complex'
            ];
            
            const randomRepo = repositories[Math.floor(Math.random() * repositories.length)];
            return await mcpClient.callTool('analyze-repo', {
              path: path.join(testContext.tempDir, randomRepo)
            });
          },
          concurrency
        );

        expect(benchmarkResult.success).toBe(true);
        console.log(`Concurrency ${concurrency}: ${benchmarkResult.data.metrics[0].throughput?.toFixed(2)} ops/sec`);

        // Verify throughput scales reasonably with concurrency
        if (concurrency > 2) {
          expect(benchmarkResult.data.metrics[0].throughput).toBeGreaterThan(2);
        }
      }
    });

    it('should handle concurrent complete workflow execution', async () => {
      const concurrency = 3;
      
      const benchmarkResult = await performanceFramework.runConcurrentPerformanceTest(
        'concurrent-complete-workflow',
        async () => {
          const repoPath = path.join(testContext.tempDir, 'perf-node-simple');
          return await performanceFramework.runCompleteWorkflow(repoPath);
        },
        concurrency
      );

      expect(benchmarkResult.success).toBe(true);
      expect(benchmarkResult.data.metrics[0].throughput).toBeGreaterThan(0.5); // At least 0.5 workflows per second
      
      console.log(`Concurrent workflow throughput: ${benchmarkResult.data.metrics[0].throughput?.toFixed(2)} workflows/sec`);
    });

    it('should handle mixed concurrent operations', async () => {
      const { mcpClient } = testContext;
      
      const operations = [
        () => mcpClient.callTool('analyze-repo', { path: path.join(testContext.tempDir, 'perf-node-simple') }),
        () => mcpClient.callTool('generate-dockerfile', { repositoryPath: path.join(testContext.tempDir, 'perf-python-simple') }),
        () => mcpClient.callTool('generate-k8s-manifests', { repositoryPath: path.join(testContext.tempDir, 'perf-java-simple') }),
        () => mcpClient.callTool('scan', { scanType: 'vulnerability', target: path.join(testContext.tempDir, 'perf-node-complex') }),
        () => mcpClient.callTool('generate-docker-compose', { repositoryPath: path.join(testContext.tempDir, 'perf-python-complex') })
      ];

      const benchmarkResult = await performanceFramework.runConcurrentPerformanceTest(
        'mixed-concurrent-operations',
        async () => {
          const randomOperation = operations[Math.floor(Math.random() * operations.length)];
          return await randomOperation();
        },
        5
      );

      expect(benchmarkResult.success).toBe(true);
      expect(benchmarkResult.data.metrics[0].throughput).toBeGreaterThan(1); // At least 1 operation per second
    });
  });

  describe('Load Testing', () => {
    it('should handle sustained load test on analysis operations', async () => {
      const { mcpClient } = testContext;
      
      const loadTestResult = await performanceFramework.runLoadTest(
        'analysis-load-test',
        async () => {
          return await mcpClient.callTool('analyze-repo', {
            path: path.join(testContext.tempDir, 'perf-node-simple')
          });
        },
        30000, // 30 seconds
        5 // 5 requests per second target
      );

      expect(loadTestResult.success).toBe(true);
      expect(loadTestResult.data.passed).toBe(true);
      
      console.log(`Load test completed: ${loadTestResult.data.iterations} operations in 30 seconds`);
      console.log(`Actual RPS: ${loadTestResult.data.metrics[0].throughput?.toFixed(2)}`);
    });

    it('should handle sustained load on Dockerfile generation', async () => {
      const { mcpClient } = testContext;
      
      const loadTestResult = await performanceFramework.runLoadTest(
        'dockerfile-generation-load-test',
        async () => {
          const repositories = ['perf-node-simple', 'perf-python-simple', 'perf-java-simple'];
          const randomRepo = repositories[Math.floor(Math.random() * repositories.length)];
          
          return await mcpClient.callTool('generate-dockerfile', {
            repositoryPath: path.join(testContext.tempDir, randomRepo)
          });
        },
        20000, // 20 seconds
        3 // 3 requests per second target
      );

      expect(loadTestResult.success).toBe(true);
      expect(loadTestResult.data.passed).toBe(true);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not exceed memory thresholds under load', async () => {
      const { mcpClient } = testContext;
      let maxMemoryUsed = 0;

      const benchmarkResult = await performanceFramework.runPerformanceTest(
        'memory-usage-monitoring',
        async () => {
          const result = await mcpClient.callTool('generate-k8s-manifests', {
            repositoryPath: path.join(testContext.tempDir, 'perf-node-complex'),
            environment: 'production',
            replicas: 10,
            resourceLimits: { memory: '2Gi', cpu: '2000m' }
          });

          // Track peak memory usage
          const currentMemory = process.memoryUsage().heapUsed;
          maxMemoryUsed = Math.max(maxMemoryUsed, currentMemory);

          return result;
        },
        {
          iterations: 15,
          collectGCMetrics: true,
          thresholds: {
            maxExecutionTime: 3000,
            maxMemoryUsage: 200 * 1024 * 1024, // 200MB max
          }
        }
      );

      expect(benchmarkResult.success).toBe(true);
      expect(maxMemoryUsed).toBeLessThan(300 * 1024 * 1024); // 300MB absolute max

      console.log(`Peak memory usage: ${(maxMemoryUsed / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should maintain performance with memory pressure', async () => {
      const { mcpClient } = testContext;
      
      // Create memory pressure by keeping references to large objects
      const memoryPressure: any[] = [];
      for (let i = 0; i < 50; i++) {
        memoryPressure.push(new Array(100000).fill('memory-pressure-data'));
      }

      const benchmarkResult = await performanceFramework.runPerformanceTest(
        'performance-under-memory-pressure',
        async () => {
          return await mcpClient.callTool('analyze-repo', {
            path: path.join(testContext.tempDir, 'perf-python-simple')
          });
        },
        {
          iterations: 10,
          thresholds: {
            maxExecutionTime: 5000, // More lenient under memory pressure
            minOperationsPerSecond: 2 // Reduced expectations
          }
        }
      );

      expect(benchmarkResult.success).toBe(true);
      
      // Clean up memory pressure
      memoryPressure.length = 0;
      if (global.gc) global.gc();
    });
  });

  describe('Stress Testing', () => {
    it('should handle peak concurrent load', async () => {
      const { mcpClient } = testContext;
      const peakConcurrency = 15;

      const stressTestResult = await performanceFramework.runConcurrentPerformanceTest(
        'peak-stress-test',
        async () => {
          const operations = [
            () => mcpClient.callTool('analyze-repo', { 
              path: path.join(testContext.tempDir, 'perf-node-simple') 
            }),
            () => mcpClient.callTool('generate-dockerfile', { 
              repositoryPath: path.join(testContext.tempDir, 'perf-python-simple') 
            }),
            () => mcpClient.callTool('generate-k8s-manifests', { 
              repositoryPath: path.join(testContext.tempDir, 'perf-java-simple'),
              replicas: 3
            })
          ];

          const randomOperation = operations[Math.floor(Math.random() * operations.length)];
          return await randomOperation();
        },
        peakConcurrency
      );

      expect(stressTestResult.success).toBe(true);
      
      // Under stress, we expect some degradation but system should remain functional
      expect(stressTestResult.data.metrics[0].executionTime).toBeLessThan(30000); // 30 second timeout
      
      console.log(`Stress test (${peakConcurrency} concurrent): ${stressTestResult.data.metrics[0].executionTime.toFixed(2)}ms total`);
    });

    it('should recover gracefully after stress conditions', async () => {
      // After the stress test, verify system returns to normal performance
      const { mcpClient } = testContext;

      // Wait a bit for system to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      const recoveryResult = await performanceFramework.runPerformanceTest(
        'post-stress-recovery',
        async () => {
          return await mcpClient.callTool('analyze-repo', {
            path: path.join(testContext.tempDir, 'perf-node-simple')
          });
        },
        {
          iterations: 5,
          thresholds: {
            maxExecutionTime: 2500, // Should return to near-normal performance
            minOperationsPerSecond: 3
          }
        }
      );

      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.data.passed).toBe(true);
    });
  });
});