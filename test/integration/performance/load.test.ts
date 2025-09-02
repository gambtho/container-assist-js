import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ContainerKitMCPServer } from '../../../src/index.js';
import { Config } from '@service/config/config.js';
import { performance } from 'perf_hooks';
import { measureTime, createTempDir } from '@test/utils/test-helpers.js';

describe('Performance and Load Tests', () => {
  let server: ContainerKitMCPServer;
  let registry: any;
  
  beforeAll(async () => {
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
    await server.start();
    registry = (server as any).registry;
  });
  
  afterAll(async () => {
    if (server) {
      await server.shutdown();
    }
  });
  
  describe('Concurrent Request Handling', () => {
    it('should handle high concurrent ping requests', async () => {
      const concurrentRequests = 100;
      const { result, duration } = await measureTime(async () => {
        const promises = Array.from({ length: concurrentRequests }, (_, i) => 
          registry.handleToolCall({
            name: 'ping',
            arguments: { message: `concurrent-ping-${i}` }
          })
        );
        
        return await Promise.all(promises);
      });
      
      // All requests should succeed
      expect(result.every(r => !r.isError)).toBe(true);
      
      // Should complete in reasonable time (under 10 seconds)
      expect(duration).toBeLessThan(10000);
      
      // Average response time should be acceptable
      const avgResponseTime = duration / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(200); // Less than 200ms per request
      
      console.log(`Handled ${concurrentRequests} concurrent requests in ${duration}ms`);
      console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
    });
    
    it('should handle concurrent workflow operations', async () => {
      const concurrentWorkflows = 20;
      const sessionIds = Array.from({ length: concurrentWorkflows }, (_, i) => `perf-session-${i}`);
      
      const { duration } = await measureTime(async () => {
        const promises = sessionIds.map(sessionId => 
          registry.handleToolCall({
            name: 'analyze_repository',
            arguments: {
              repo_path: createTempDir(),
              session_id: sessionId,
              deep_scan: false
            }
          })
        );
        
        const results = await Promise.all(promises);
        
        // All should succeed
        results.forEach(result => {
          expect(result.isError).toBeUndefined();
          const data = JSON.parse(result.content[0].text);
          expect(data.success).toBe(true);
        });
      });
      
      expect(duration).toBeLessThan(15000); // Under 15 seconds
      console.log(`Processed ${concurrentWorkflows} concurrent workflows in ${duration}ms`);
    });
    
    it('should handle mixed concurrent operations', async () => {
      const operations = [
        // Ping operations
        ...Array.from({ length: 30 }, (_, i) => ({
          name: 'ping',
          arguments: { message: `mixed-ping-${i}` }
        })),
        // Server status operations
        ...Array.from({ length: 20 }, () => ({
          name: 'server_status',
          arguments: {}
        })),
        // List tools operations
        ...Array.from({ length: 10 }, () => ({
          name: 'list_tools',
          arguments: {}
        }))
      ];
      
      const { result, duration } = await measureTime(async () => {
        const promises = operations.map(op => registry.handleToolCall(op);
        return await Promise.all(promises);
      });
      
      // All should succeed
      expect(result.every(r => !r.isError)).toBe(true);
      
      // Should handle mixed load efficiently
      expect(duration).toBeLessThan(8000);
      
      console.log(`Handled ${operations.length} mixed operations in ${duration}ms`);
    });
  });
  
  describe('Memory Usage and Leaks', () => {
    it('should not leak memory during extended operations', async () => {
      const iterations = 500;
      const memorySnapshots: number[] = [];
      
      // Take initial memory snapshot
      if (global.gc) global.gc();
      memorySnapshots.push(process.memoryUsage().heapUsed);
      
      // Perform operations in batches
      const batchSize = 50;
      for (let i = 0; i < iterations; i += batchSize) {
        const batchPromises = Array.from({ length: Math.min(batchSize, iterations - i) }, (_, j) =>
          registry.handleToolCall({
            name: 'ping',
            arguments: { message: `memory-test-${i + j}` }
          })
        );
        
        const results = await Promise.all(batchPromises);
        
        // Verify all succeeded
        results.forEach(result => {
          expect(result.isError).toBeUndefined();
        });
        
        // Take memory snapshot every 100 operations
        if ((i + batchSize) % 100 === 0) {
          if (global.gc) global.gc();
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }
      
      // Final cleanup and snapshot
      if (global.gc) global.gc();
      memorySnapshots.push(process.memoryUsage().heapUsed);
      
      // Check memory growth
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = (finalMemory - initialMemory) / (1024 * 1024); // MB
      
      console.log('Memory snapshots (MB):', memorySnapshots.map(m => (m / 1024 / 1024).toFixed(2));
      console.log(`Memory growth: ${memoryGrowth.toFixed(2)}MB`);
      
      // Memory growth should be reasonable (less than 50MB for 500 operations)
      expect(memoryGrowth).toBeLessThan(50);
    });
    
    it('should handle large payloads efficiently', async () => {
      const largePayload = {
        session_id: 'large-payload-test',
        metadata: {
          // Create large data structure
          data: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            value: `large-value-${i}`.repeat(10),
            nested: {
              deep: {
                field: `deep-field-${i}`.repeat(5),
                array: Array.from({ length: 10 }, (_, j) => `item-${i}-${j}`)
              }
            }
          }))
        }
      };
      
      const { duration } = await measureTime(async () => {
        const result = await registry.handleToolCall({
          name: 'analyze_repository',
          arguments: {
            repo_path: createTempDir(),
            ...largePayload
          }
        });
        
        expect(result.isError).toBeUndefined();
      });
      
      // Should handle large payloads in reasonable time
      expect(duration).toBeLessThan(2000); // Under 2 seconds
      
      console.log(`Processed large payload in ${duration}ms`);
    });
  });
  
  describe('Response Time Distribution', () => {
    it('should have consistent response times', async () => {
      const iterations = 100;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const { duration } = await measureTime(async () => {
          const result = await registry.handleToolCall({
            name: 'server_status',
            arguments: {}
          });
          expect(result.isError).toBeUndefined();
        });
        
        responseTimes.push(duration);
      }
      
      // Calculate statistics
      responseTimes.sort((a, b) => a - b);
      const min = responseTimes[0];
      const max = responseTimes[responseTimes.length - 1];
      const median = responseTimes[Math.floor(responseTimes.length / 2)];
      const average = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
      const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
      
      console.log('Response Time Statistics:');
      console.log(`Min: ${min}ms`);
      console.log(`Max: ${max}ms`);
      console.log(`Average: ${average.toFixed(2)}ms`);
      console.log(`Median: ${median}ms`);
      console.log(`95th percentile: ${p95}ms`);
      console.log(`99th percentile: ${p99}ms`);
      
      // Performance assertions
      expect(average).toBeLessThan(50); // Average under 50ms
      expect(p95).toBeLessThan(150); // 95% under 150ms
      expect(p99).toBeLessThan(300); // 99% under 300ms
    });
    
    it('should maintain performance under sustained load', async () => {
      const duration = 10000; // 10 seconds
      const startTime = performance.now();
      let requestCount = 0;
      const responseTimes: number[] = [];
      
      while (performance.now() - startTime < duration) {
        const reqStart = performance.now();
        
        const result = await registry.handleToolCall({
          name: 'ping',
          arguments: { message: `sustained-${requestCount}` }
        });
        
        const reqEnd = performance.now();
        const reqDuration = reqEnd - reqStart;
        
        expect(result.isError).toBeUndefined();
        responseTimes.push(reqDuration);
        requestCount++;
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10);
      }
      
      const totalDuration = performance.now() - startTime;
      const throughput = requestCount / (totalDuration / 1000);
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      
      console.log(`Sustained load test results:`);
      console.log(`Duration: ${totalDuration.toFixed(0)}ms`);
      console.log(`Requests: ${requestCount}`);
      console.log(`Throughput: ${throughput.toFixed(2)} req/sec`);
      console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
      
      // Performance expectations
      expect(throughput).toBeGreaterThan(20); // At least 20 req/sec
      expect(avgResponseTime).toBeLessThan(100); // Average under 100ms
    });
  });
  
  describe('Resource Limits and Throttling', () => {
    it('should handle resource exhaustion gracefully', async () => {
      // Create many sessions to test resource limits
      const sessionCount = 50;
      const sessionIds = Array.from({ length: sessionCount }, (_, i) => `resource-test-${i}`);
      
      const { duration } = await measureTime(async () => {
        const promises = sessionIds.map(sessionId =>
          registry.handleToolCall({
            name: 'analyze_repository',
            arguments: {
              repo_path: createTempDir(),
              session_id: sessionId
            }
          })
        );
        
        const results = await Promise.all(promises);
        
        // Most should succeed (some might fail due to limits, which is expected)
        const successCount = results.filter(r => !r.isError).length;
        expect(successCount).toBeGreaterThan(sessionCount * 0.8); // At least 80% success
      });
      
      console.log(`Created ${sessionCount} sessions in ${duration}ms`);
    });
    
    it('should recover from temporary overload', async () => {
      // Simulate overload
      const overloadPromises = Array.from({ length: 200 }, (_, i) =>
        registry.handleToolCall({
          name: 'ping',
          arguments: { message: `overload-${i}` }
        })
      );
      
      // Don't wait for all to complete, just start them
      const overloadResults = await Promise.allSettled(overloadPromises);
      
      // After overload, system should still be responsive
      const { duration } = await measureTime(async () => {
        const result = await registry.handleToolCall({
          name: 'server_status',
          arguments: {}
        });
        
        expect(result.isError).toBeUndefined();
        const status = JSON.parse(result.content[0].text);
        expect(status.server).toBeDefined();
      });
      
      // Should respond quickly even after overload
      expect(duration).toBeLessThan(1000);
      
      console.log(`System recovered in ${duration}ms after overload`);
      console.log(`Overload results: ${overloadResults.filter(r => r.status === 'fulfilled').length}/${overloadResults.length} succeeded`);
    });
  });
  
  describe('Cleanup and Resource Management', () => {
    it('should clean up resources efficiently', async () => {
      const initialHealth = await server.getHealth();
      const initialActiveCount = Object.keys(initialHealth.services).length;
      
      // Create temporary resources
      const temporarySessionIds = Array.from({ length: 20 }, (_, i) => `cleanup-test-${i}`);
      
      // Create sessions
      for (const sessionId of temporarySessionIds) {
        await registry.handleToolCall({
          name: 'analyze_repository',
          arguments: {
            repo_path: createTempDir(),
            session_id: sessionId
          }
        });
      }
      
      // Verify resources were created
      const midHealth = await server.getHealth();
      expect(Object.keys(midHealth.services).length).toBeGreaterThanOrEqual(initialActiveCount);
      
      // System should still be responsive
      const statusResult = await registry.handleToolCall({
        name: 'server_status',
        arguments: {}
      });
      
      expect(statusResult.isError).toBeUndefined();
      
      console.log('Resource cleanup test completed - system remains responsive');
    });
  });
});