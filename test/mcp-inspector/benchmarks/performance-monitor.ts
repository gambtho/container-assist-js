/**
 * Performance Monitoring and Benchmarking Framework
 */

export interface PerformanceBenchmark {
  name: string;
  target: number;
  max: number;
  unit: string;
  description: string;
}

export interface BenchmarkResult {
  name: string;
  value: number;
  target: number;
  max: number;
  unit: string;
  withinTarget: boolean;
  withinMax: boolean;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  percentOfTarget: number;
}

export interface SystemMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  cpuUsage?: number;
  timestamp: number;
}

export const PERFORMANCE_BENCHMARKS: Record<string, PerformanceBenchmark> = {
  toolResponseTime: {
    name: 'Tool Response Time',
    target: 100, // ms
    max: 500,
    unit: 'ms',
    description: 'Time for tool to return (metadata only)'
  },
  candidateGeneration: {
    name: 'Candidate Generation Time',
    target: 15000, // 15s
    max: 30000,
    unit: 'ms', 
    description: 'Time to generate multiple candidates'
  },
  resourceAccessTime: {
    name: 'Resource Access Time',
    target: 500, // ms
    max: 2000,
    unit: 'ms',
    description: 'Time to read a resource by URI'
  },
  memoryPerOperation: {
    name: 'Memory per Operation',
    target: 100, // KB
    max: 1000,
    unit: 'KB',
    description: 'Memory increase per operation'
  },
  endToEndWorkflow: {
    name: 'End-to-End Workflow',
    target: 180000, // 3 minutes
    max: 300000, // 5 minutes
    unit: 'ms',
    description: 'Complete containerization workflow'
  },
  concurrentOperations: {
    name: 'Concurrent Operations',
    target: 60000, // 1 minute for 10 concurrent
    max: 120000, // 2 minutes
    unit: 'ms',
    description: '10 concurrent tool operations'
  }
};

export class PerformanceMonitor {
  private baselines: Map<string, number> = new Map();
  private results: BenchmarkResult[] = [];

  /**
   * Measure performance of an operation
   */
  async measure<T>(
    operationName: string, 
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number; memoryDelta: number }> {
    const initialMemory = process.memoryUsage().heapUsed;
    const start = performance.now();
    
    const result = await operation();
    
    const duration = performance.now() - start;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDelta = finalMemory - initialMemory;

    return { result, duration, memoryDelta };
  }

  /**
   * Benchmark an operation against performance targets
   */
  async benchmark<T>(
    benchmarkName: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; benchmarkResult: BenchmarkResult }> {
    const benchmark = PERFORMANCE_BENCHMARKS[benchmarkName];
    if (!benchmark) {
      throw new Error(`Unknown benchmark: ${benchmarkName}`);
    }

    const measurement = await this.measure(benchmarkName, operation);
    const value = benchmark.unit === 'KB' ? measurement.memoryDelta / 1024 : measurement.duration;

    const benchmarkResult: BenchmarkResult = {
      name: benchmark.name,
      value,
      target: benchmark.target,
      max: benchmark.max,
      unit: benchmark.unit,
      withinTarget: value <= benchmark.target,
      withinMax: value <= benchmark.max,
      status: this.calculateStatus(value, benchmark.target, benchmark.max),
      percentOfTarget: (value / benchmark.target) * 100
    };

    this.results.push(benchmarkResult);
    return { result: measurement.result, benchmarkResult };
  }

  /**
   * Establish performance baselines by running operations multiple times
   */
  async establishBaseline<T>(
    operationName: string,
    operation: () => Promise<T>,
    iterations = 3
  ): Promise<{ average: number; min: number; max: number; stdDev: number }> {
    const measurements: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const measurement = await this.measure(operationName, operation);
      measurements.push(measurement.duration);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const average = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);
    const stdDev = Math.sqrt(
      measurements.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / measurements.length
    );

    this.baselines.set(operationName, average);
    
    return { average, min, max, stdDev };
  }

  /**
   * Detect performance regression by comparing to baseline
   */
  detectRegression(
    operationName: string, 
    currentValue: number, 
    threshold = 1.2 // 20% regression threshold
  ): { isRegression: boolean; baselineValue: number; regressionPercent: number } {
    const baselineValue = this.baselines.get(operationName);
    
    if (!baselineValue) {
      return { isRegression: false, baselineValue: 0, regressionPercent: 0 };
    }

    const regressionPercent = currentValue / baselineValue;
    const isRegression = regressionPercent > threshold;

    return { isRegression, baselineValue, regressionPercent: (regressionPercent - 1) * 100 };
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    const memory = process.memoryUsage();
    // Note: CPU usage requires additional dependencies, not implemented for now
    
    return {
      memoryUsage: {
        used: memory.heapUsed,
        total: memory.heapTotal,
        percentage: (memory.heapUsed / memory.heapTotal) * 100
      },
      timestamp: Date.now()
    };
  }

  /**
   * Get all benchmark results
   */
  getBenchmarkResults(): BenchmarkResult[] {
    return [...this.results];
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalBenchmarks: number;
    excellent: number;
    good: number;
    warning: number;
    critical: number;
    averagePercentOfTarget: number;
  } {
    const statusCounts = {
      excellent: 0,
      good: 0,
      warning: 0,
      critical: 0
    };

    let totalPercentOfTarget = 0;

    for (const result of this.results) {
      statusCounts[result.status]++;
      totalPercentOfTarget += result.percentOfTarget;
    }

    return {
      totalBenchmarks: this.results.length,
      ...statusCounts,
      averagePercentOfTarget: this.results.length > 0 ? totalPercentOfTarget / this.results.length : 0
    };
  }

  /**
   * Clear all results (for fresh benchmarking)
   */
  reset(): void {
    this.results = [];
  }

  private calculateStatus(value: number, target: number, max: number): 'excellent' | 'good' | 'warning' | 'critical' {
    if (value <= target * 0.8) return 'excellent'; // Within 80% of target
    if (value <= target) return 'good';             // Within target
    if (value <= max) return 'warning';             // Within max but over target
    return 'critical';                              // Over maximum acceptable
  }
}

/**
 * Utility function for load testing
 */
export async function runConcurrentBenchmark<T>(
  operations: Array<() => Promise<T>>,
  concurrency = 5
): Promise<{
  results: T[];
  totalDuration: number;
  averageDuration: number;
  maxDuration: number;
  minDuration: number;
  successCount: number;
  failureCount: number;
}> {
  const startTime = performance.now();
  const results: T[] = [];
  const durations: number[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Run operations in batches to control concurrency
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (operation) => {
      const opStart = performance.now();
      try {
        const result = await operation();
        const opDuration = performance.now() - opStart;
        durations.push(opDuration);
        successCount++;
        return result;
      } catch (error) {
        const opDuration = performance.now() - opStart;
        durations.push(opDuration);
        failureCount++;
        throw error;
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  }

  const totalDuration = performance.now() - startTime;
  
  return {
    results,
    totalDuration,
    averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
    maxDuration: Math.max(...durations),
    minDuration: Math.min(...durations),
    successCount,
    failureCount
  };
}