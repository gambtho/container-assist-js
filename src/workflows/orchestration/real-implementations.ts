// Real implementation factory for Team Epsilon integration
// Replaces mocks with actual implementations from Team Alpha and Beta

import type { Logger } from 'pino';
import { McpResourceManager } from '../../mcp/resources/manager.js';
import { McpProgressNotifier } from '../../mcp/events/emitter.js';
import { ResourceManagerAdapter, ProgressNotifierAdapter } from './adapters.js';
import type { ResourceManager, ProgressNotifier } from './types.js';

// Team Alpha: Core Infrastructure Integration
export const createRealResourceManager = (logger: Logger): ResourceManager => {
  const config = {
    defaultTtl: 3600, // 1 hour default TTL
    maxResourceSize: 5 * 1024 * 1024, // 5MB max resource size
    cacheConfig: {
      defaultTtl: 3600,
    },
  };

  const mcpResourceManager = new McpResourceManager(config, logger);
  return new ResourceManagerAdapter(mcpResourceManager, logger);
};

export const createRealProgressNotifier = (logger: Logger): ProgressNotifier => {
  const mcpProgressNotifier = new McpProgressNotifier(logger);
  return new ProgressNotifierAdapter(mcpProgressNotifier, logger);
};

// Team Beta: Sampling Integration
import { DockerfileGenerator } from '../../workflows/sampling/dockerfile/generators.js';
import { DockerfileScorer } from '../../workflows/sampling/dockerfile/scorers.js';
import type { CandidateGenerator, CandidateScorer, WinnerSelector } from '../../lib/sampling.js';

export const createRealDockerfileGenerator = (logger: Logger): CandidateGenerator<string> => {
  return new DockerfileGenerator(logger);
};

export const createRealDockerfileScorer = (logger: Logger): CandidateScorer<string> => {
  return new DockerfileScorer(logger);
};

export const createRealWinnerSelector = <T>(logger: Logger): WinnerSelector<T> => {
  // Simple winner selector that picks highest score
  return {
    strategy: 'highest-score',
    select: (scored) => {
      if (scored.length === 0) {
        return { ok: false, error: 'No candidates to select from' };
      }

      const winner = scored.reduce((best, current) =>
        current.score > best.score ? current : best,
      );

      logger.debug({
        winnerId: winner.id,
        winnerScore: winner.score,
        totalCandidates: scored.length,
      }, 'Selected winner using highest-score strategy');

      return { ok: true, value: winner };
    },
    selectTop: (scored, count) => {
      const sorted = [...scored].sort((a, b) => b.score - a.score);
      const top = sorted.slice(0, count);

      logger.debug({
        selectedCount: top.length,
        requestedCount: count,
        totalCandidates: scored.length,
      }, 'Selected top candidates');

      return { ok: true, value: top };
    },
  };
};

export const createRealSamplingServices = (logger: Logger) => {
  return {
    dockerfileGenerator: createRealDockerfileGenerator(logger),
    dockerfileScorer: createRealDockerfileScorer(logger),
    winnerSelector: createRealWinnerSelector(logger),
  };
};

// Configuration flags
export const USE_REAL_IMPLEMENTATIONS = process.env.USE_REAL_IMPLEMENTATIONS === 'true' || process.env.NODE_ENV === 'production';

// Factory function for creating real or mock dependencies
export const createDependencies = (logger: Logger) => {
  if (USE_REAL_IMPLEMENTATIONS) {
    logger.info('Using real implementations from Team Alpha and Beta');
    return {
      resourceManager: createRealResourceManager(logger),
      progressNotifier: createRealProgressNotifier(logger),
      useMocks: false,
    };
  } else {
    logger.info('Using mock implementations for development');
    return {
      resourceManager: null, // Will fall back to mocks in coordinator
      progressNotifier: null, // Will fall back to mocks in coordinator
      useMocks: true,
    };
  }
};
