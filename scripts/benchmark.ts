#!/usr/bin/env tsx
/**
 * Performance Benchmark Script for Container Kit MCP
 * Tests startup time, memory usage, and tool execution performance
 */

import { performance } from 'perf_hooks';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url);
const rootDir = join(__dirname, '..');

interface BenchmarkResult {
  operation: string;
  duration: number;
  memory: number;
  success: boolean;
  error?: string;
}

interface BenchmarkSummary {
  results: BenchmarkResult[];
  totalTime: number;
  passed: number;
  failed: number;
  averageMemory: number;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];
  private startTime: number = performance.now();
  
  async run(): Promise<BenchmarkSummary> {
    console.log('🏃 Container Kit MCP Performance Benchmarks');
    console.log('═'.repeat(50);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    await this.benchmarkModuleImport();
    await this.benchmarkServerCreation();
    await this.benchmarkDependencyInitialization();
    await this.benchmarkToolRegistration();
    await this.benchmarkServerStartup();
    await this.benchmarkMemoryUsage();
    await this.benchmarkToolExecution();
    
    return this.generateSummary();
  }
  
  private async benchmarkModuleImport(): Promise<void> {
    console.log('📦 Benchmarking module import...');
    
    const start = performance.now();
    let success = true;
    let error: string | undefined;
    
    try {
      // Clear module cache to get accurate import time
      const modulePath = join(rootDir, 'dist/index.js');
      delete require.cache[modulePath];
      
      const startImport = performance.now();
      await import(modulePath);
      const duration = performance.now() - startImport;
      
      this.results.push({
        operation: 'Module Import',
        duration,
        memory: this.getMemoryUsage(),
        success: true
      });
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      
      this.results.push({
        operation: 'Module Import',
        duration: performance.now() - start,
        memory: this.getMemoryUsage(),
        success: false,
        error
      });
    }
  }
  
  private async benchmarkServerCreation(): Promise<void> {
    console.log('🏗️  Benchmarking server creation...');
    
    const start = performance.now();
    let success = true;
    let error: string | undefined;
    let server: any = null;
    
    try {
      const { ContainerKitMCPServer, Config } = await import(join(rootDir, 'dist/index.js');
      
      const createStart = performance.now();
      const config = new Config({ 
        nodeEnv: 'test',
        features: { mockMode: true }
      });
      server = new ContainerKitMCPServer(config);
      const duration = performance.now() - createStart;
      
      this.results.push({
        operation: 'Server Creation',
        duration,
        memory: this.getMemoryUsage(),
        success: true
      });
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      
      this.results.push({
        operation: 'Server Creation',
        duration: performance.now() - start,
        memory: this.getMemoryUsage(),
        success: false,
        error
      });
    }
    
    return server;
  }
  
  private async benchmarkDependencyInitialization(): Promise<void> {
    console.log('⚡ Benchmarking dependency initialization...');
    
    const start = performance.now();
    let success = true;
    let error: string | undefined;
    
    try {
      const { Dependencies } = await import(join(rootDir, 'dist/service/dependencies.js');
      const { createLogger } = await import(join(rootDir, 'dist/infrastructure/core/logger.js');
      
      const initStart = performance.now();
      const logger = createLogger({ level: 'error' }); // Quiet logger
      const deps = new Dependencies({
        config: {
          workspaceDir: '/tmp',
          session: { store: 'memory', ttl: 3600, maxSessions: 100 },
          docker: { socketPath: '/var/run/docker.sock' },
          kubernetes: { namespace: 'default' },
          features: { aiEnabled: false, mockMode: true }
        },
        logger,
        mcpServer: null as any
      });
      
      await deps.initialize();
      const duration = performance.now() - initStart;
      
      await deps.cleanup();
      
      this.results.push({
        operation: 'Dependency Initialization',
        duration,
        memory: this.getMemoryUsage(),
        success: true
      });
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      
      this.results.push({
        operation: 'Dependency Initialization',
        duration: performance.now() - start,
        memory: this.getMemoryUsage(),
        success: false,
        error
      });
    }
  }
  
  private async benchmarkToolRegistration(): Promise<void> {
    console.log('🛠️  Benchmarking tool registration...');
    
    const start = performance.now();
    let success = true;
    let error: string | undefined;
    
    try {
      const { ToolRegistry } = await import(join(rootDir, 'dist/service/tools/registry.js');
      const { createLogger } = await import(join(rootDir, 'dist/infrastructure/core/logger.js');
      
      const regStart = performance.now();
      const logger = createLogger({ level: 'error' });
      const registry = new ToolRegistry({} as any, logger);
      
      await registry.registerAll();
      const duration = performance.now() - regStart;
      
      const toolCount = registry.getToolCount();
      
      this.results.push({
        operation: `Tool Registration (${toolCount} tools)`,
        duration,
        memory: this.getMemoryUsage(),
        success: true
      });
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      
      this.results.push({
        operation: 'Tool Registration',
        duration: performance.now() - start,
        memory: this.getMemoryUsage(),
        success: false,
        error
      });
    }
  }
  
  private async benchmarkServerStartup(): Promise<void> {
    console.log('🚀 Benchmarking full server startup...');
    
    const start = performance.now();
    let success = true;
    let error: string | undefined;
    let server: any = null;
    
    try {
      const { ContainerKitMCPServer, Config } = await import(join(rootDir, 'dist/index.js');
      
      const startupStart = performance.now();
      const config = new Config({ 
        nodeEnv: 'test',
        features: { mockMode: true }
      });
      server = new ContainerKitMCPServer(config);
      
      // Note: We can't actually call start() in test mode as it would try to connect stdio transport
      // So we'll measure up to the point where server would be ready
      await server['deps'].initialize();
      await server['registry'].registerAll();
      
      const duration = performance.now() - startupStart;
      
      this.results.push({
        operation: 'Server Startup (Mock)',
        duration,
        memory: this.getMemoryUsage(),
        success: true
      });
      
      // Cleanup
      await server.shutdown();
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      
      this.results.push({
        operation: 'Server Startup',
        duration: performance.now() - start,
        memory: this.getMemoryUsage(),
        success: false,
        error
      });
      
      if (server) {
        try {
          await server.shutdown();
        } catch (cleanupError) {
          // Ignore cleanup errors in benchmark
        }
      }
    }
  }
  
  private async benchmarkMemoryUsage(): Promise<void> {
    console.log('💾 Benchmarking memory usage...');
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    const baseMemory = this.getMemoryUsage();
    
    try {
      const { ContainerKitMCPServer, Config } = await import(join(rootDir, 'dist/index.js');
      
      const config = new Config({ 
        nodeEnv: 'test',
        features: { mockMode: true }
      });
      const server = new ContainerKitMCPServer(config);
      
      await server['deps'].initialize();
      await server['registry'].registerAll();
      
      const loadedMemory = this.getMemoryUsage();
      const memoryDelta = loadedMemory - baseMemory;
      
      this.results.push({
        operation: `Memory Usage (Δ+${this.formatBytes(memoryDelta * 1024 * 1024)})`,
        duration: 0,
        memory: loadedMemory,
        success: true
      });
      
      await server.shutdown();
      
    } catch (err) {
      this.results.push({
        operation: 'Memory Usage',
        duration: 0,
        memory: this.getMemoryUsage(),
        success: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  
  private async benchmarkToolExecution(): Promise<void> {
    console.log('⚙️  Benchmarking tool execution...');
    
    try {
      const { ContainerKitMCPServer, Config } = await import(join(rootDir, 'dist/index.js');
      
      const config = new Config({ 
        nodeEnv: 'test',
        features: { mockMode: true }
      });
      const server = new ContainerKitMCPServer(config);
      
      await server['deps'].initialize();
      await server['registry'].registerAll();
      
      // Test utility tools that should execute quickly
      const utilityTools = ['ping', 'server_status', 'list_tools'];
      
      for (const toolName of utilityTools) {
        const start = performance.now();
        
        try {
          await server['registry'].handleToolCall({
            params: {
              name: toolName,
              arguments: {}
            }
          });
          
          const duration = performance.now() - start;
          
          this.results.push({
            operation: `Tool Execution: ${toolName}`,
            duration,
            memory: this.getMemoryUsage(),
            success: true
          });
          
        } catch (err) {
          this.results.push({
            operation: `Tool Execution: ${toolName}`,
            duration: performance.now() - start,
            memory: this.getMemoryUsage(),
            success: false,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      
      await server.shutdown();
      
    } catch (err) {
      this.results.push({
        operation: 'Tool Execution Setup',
        duration: 0,
        memory: this.getMemoryUsage(),
        success: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100; // MB with 2 decimal places
  }
  
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k);
    
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
  
  private generateSummary(): BenchmarkSummary {
    const totalTime = performance.now() - this.startTime;
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const averageMemory = this.results.reduce((sum, r) => sum + r.memory, 0) / this.results.length;
    
    return {
      results: this.results,
      totalTime,
      passed,
      failed,
      averageMemory
    };
  }
}

// CLI interface
async function main(): Promise<void> {
  const benchmark = new PerformanceBenchmark();
  
  try {
    const summary = await benchmark.run();
    
    console.log('\n📊 Benchmark Results');
    console.log('═'.repeat(60);
    console.log('Operation'.padEnd(35) + 'Duration (ms)'.padEnd(15) + 'Memory (MB)'.padEnd(12) + 'Status');
    console.log('─'.repeat(60);
    
    for (const result of summary.results) {
      const status = result.success ? '✅' : '❌';
      const duration = result.duration.toFixed(2);
      const memory = result.memory.toFixed(1);
      
      console.log(
        result.operation.padEnd(35) +
        duration.padEnd(15) +
        memory.padEnd(12) +
        status
      );
      
      if (!result.success && result.error) {
        console.log(`    Error: ${result.error}`);
      }
    }
    
    console.log('─'.repeat(60);
    console.log(`Total Time: ${summary.totalTime.toFixed(2)}ms`);
    console.log(`Results: ${summary.passed}/${summary.results.length} passed`);
    console.log(`Average Memory: ${summary.averageMemory.toFixed(1)} MB`);
    
    // Performance thresholds
    const thresholds = {
      moduleImport: 100,      // ms
      serverCreation: 50,     // ms
      toolRegistration: 200,  // ms
      serverStartup: 500,     // ms
      memoryUsage: 150,       // MB
      toolExecution: 100      // ms
    };
    
    console.log('\n🎯 Performance Analysis');
    console.log('═'.repeat(40);
    
    const warnings: string[] = [];
    const successes: string[] = [];
    
    for (const result of summary.results) {
      if (!result.success) continue;
      
      const operation = result.operation.toLowerCase();
      
      if (operation.includes('import') && result.duration > thresholds.moduleImport) {
        warnings.push(`Module import slow: ${result.duration.toFixed(2)}ms > ${thresholds.moduleImport}ms`);
      } else if (operation.includes('creation') && result.duration > thresholds.serverCreation) {
        warnings.push(`Server creation slow: ${result.duration.toFixed(2)}ms > ${thresholds.serverCreation}ms`);
      } else if (operation.includes('registration') && result.duration > thresholds.toolRegistration) {
        warnings.push(`Tool registration slow: ${result.duration.toFixed(2)}ms > ${thresholds.toolRegistration}ms`);
      } else if (operation.includes('startup') && result.duration > thresholds.serverStartup) {
        warnings.push(`Server startup slow: ${result.duration.toFixed(2)}ms > ${thresholds.serverStartup}ms`);
      } else if (operation.includes('memory') && result.memory > thresholds.memoryUsage) {
        warnings.push(`High memory usage: ${result.memory.toFixed(1)} MB > ${thresholds.memoryUsage} MB`);
      } else if (operation.includes('tool execution') && result.duration > thresholds.toolExecution) {
        warnings.push(`Tool execution slow: ${result.operation} ${result.duration.toFixed(2)}ms > ${thresholds.toolExecution}ms`);
      } else {
        successes.push(`✅ ${result.operation} performance acceptable`);
      }
    }
    
    if (successes.length > 0) {
      console.log('\n✅ Good Performance:');
      successes.forEach(s => console.log(`  ${s}`);
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️  Performance Warnings:');
      warnings.forEach(w => console.log(`  • ${w}`);
    } else {
      console.log('\n🎉 All performance metrics within acceptable thresholds!');
    }
    
    console.log(`\n${summary.failed === 0 && warnings.length === 0 ? '✅' : '⚠️'} Benchmark ${summary.failed === 0 ? 'PASSED' : 'COMPLETED WITH ISSUES'}`);
    
    process.exit(summary.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('💥 Benchmark failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PerformanceBenchmark };