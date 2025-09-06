// Mock implementations for independent development
// These will be replaced with real implementations from other teams

import { Result, Success } from '../../types/core.js';
import type { Logger } from 'pino';
import {
  ResourceManager,
  ProgressNotifier,
  CandidateGenerator,
  CandidateScorer,
  WinnerSelector,
  EnhancedTool,
  ToolResult,
  Candidate,
  ScoredCandidate,
  GenerationContext,
} from './types.js';

// Mock Resource Manager (Team Alpha dependency)
export const createMockResourceManager = (logger: Logger): ResourceManager => ({
  async publish(uri: string, _content: unknown, ttl?: number): Promise<string> {
    logger.debug({ uri, ttl }, 'Mock: Publishing resource');
    return uri;
  },

  async read(uri: string): Promise<unknown> {
    logger.debug({ uri }, 'Mock: Reading resource');
    return { mockContent: `Content for ${uri}`, timestamp: new Date() };
  },

  async invalidate(pattern: string): Promise<void> {
    logger.debug({ pattern }, 'Mock: Invalidating resources');
  },

  async cleanup(olderThan: Date): Promise<void> {
    logger.debug({ olderThan }, 'Mock: Cleaning up old resources');
  },
});

// Mock Progress Notifier (Team Alpha dependency)
export const createMockProgressNotifier = (logger: Logger): ProgressNotifier => ({
  notifyProgress(progress: { token: string; value: number; message?: string }): void {
    logger.info({
      token: progress.token,
      progress: progress.value,
      message: progress.message,
    }, 'Mock: Progress notification');
  },

  notifyComplete(token: string): void {
    logger.info({ token }, 'Mock: Progress complete');
  },

  notifyError(token: string, error: string): void {
    logger.error({ token, error }, 'Mock: Progress error');
  },
});

// Mock Dockerfile Candidate Generator (Team Beta dependency)
export const createMockDockerfileCandidateGenerator = (
  logger: Logger,
): CandidateGenerator<string> => ({
  async generate(context: GenerationContext, count = 3): Promise<Candidate<string>[]> {
    logger.debug({ context, count }, 'Mock: Generating Dockerfile candidates');

    const candidates: Candidate<string>[] = [];

    for (let i = 0; i < count; i++) {
      candidates.push({
        id: `dockerfile_candidate_${i}`,
        content: `# Mock Dockerfile Candidate ${i}
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
# Strategy: ${i === 0 ? 'security-optimized' : i === 1 ? 'performance-optimized' : 'development-friendly'}`,
        metadata: {
          strategy: i === 0 ? 'security-optimized' : i === 1 ? 'performance-optimized' : 'development-friendly',
          baseImage: 'node:18-alpine',
          stages: i === 1 ? 2 : 1,
          estimatedSize: `${150 + i * 50}MB`,
        },
        generatedAt: new Date(),
      });
    }

    return candidates;
  },
});

// Mock Candidate Scorer (Team Beta dependency)
export const createMockCandidateScorer = <T>(logger: Logger): CandidateScorer<T> => ({
  async score(candidates: Candidate<T>[]): Promise<ScoredCandidate<T>[]> {
    logger.debug({ candidateCount: candidates.length }, 'Mock: Scoring candidates');

    return candidates.map((candidate, index) => {
      const baseScore = 70 + (index * 10) + Math.random() * 10;
      const scoreBreakdown = {
        security: Math.max(0, baseScore - 10 + Math.random() * 20),
        performance: Math.max(0, baseScore - 5 + Math.random() * 15),
        standards: Math.max(0, baseScore + Math.random() * 10),
        maintainability: Math.max(0, baseScore - 15 + Math.random() * 25),
      };

      return {
        ...candidate,
        score: Math.min(100, Object.values(scoreBreakdown).reduce((a, b) => a + b, 0) / 4),
        scoreBreakdown,
        rationale: `Mock scoring: Strategy ${candidate.metadata?.strategy} selected based on ${
          scoreBreakdown.security > 80 ? 'security excellence' :
          scoreBreakdown.performance > 80 ? 'performance optimization' :
          'balanced approach'
        }`,
      };
    });
  },
});

// Mock Winner Selector (Team Beta dependency)
export const createMockWinnerSelector = <T>(logger: Logger): WinnerSelector<T> => ({
  select(scored: ScoredCandidate<T>[]): ScoredCandidate<T> {
    const winner = scored.reduce((best, current) =>
      current.score > best.score ? current : best,
    );

    logger.info({
      winnerId: winner.id,
      winnerScore: winner.score,
      totalCandidates: scored.length,
    }, 'Mock: Selected winner');

    return winner;
  },
});

// Mock Enhanced Tools (Team Delta dependency)
export const createMockEnhancedTools = (logger: Logger): Record<string, EnhancedTool> => ({
  analyze_repository: {
    name: 'analyze_repository',
    supportsSampling: false,
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Analyzing repository');

      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work

      return Success({
        ok: true,
        content: {
          language: 'javascript',
          framework: 'express',
          packageManager: 'npm',
          buildSystem: 'npm',
          hasDockerfile: false,
          hasTests: true,
          dependencies: ['express', 'cors', 'helmet'],
          recommendedStrategy: 'multi-stage-node',
        },
        resources: {
          summary: 'resource://analysis/summary',
          dependencies: 'resource://analysis/dependencies',
          recommendations: 'resource://analysis/recommendations',
        },
        metadata: {
          analysisTime: 2.1,
          confidence: 0.95,
        },
      });
    },
  },

  generate_dockerfile: {
    name: 'generate_dockerfile',
    supportsSampling: true,
    samplingConfig: {
      maxCandidates: 5,
      scoringWeights: {
        security: 0.4,
        performance: 0.25,
        standards: 0.2,
        maintainability: 0.15,
      },
    },
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Generating Dockerfile');

      const useSampling = args.useSampling as boolean;
      await new Promise(resolve => setTimeout(resolve, useSampling ? 5000 : 1000));

      if (useSampling) {
        return Success({
          ok: true,
          content: {
            winner: 'resource://dockerfile/winner',
            candidates: ['resource://dockerfile/candidate_0', 'resource://dockerfile/candidate_1', 'resource://dockerfile/candidate_2'],
            candidateCount: 3,
            winnerScore: 87.5,
          },
          resources: {
            winner: 'resource://dockerfile/winner',
            candidate_0: 'resource://dockerfile/candidate_0',
            candidate_1: 'resource://dockerfile/candidate_1',
            candidate_2: 'resource://dockerfile/candidate_2',
            comparison: 'resource://dockerfile/comparison',
          },
        });
      } else {
        return Success({
          ok: true,
          content: 'resource://dockerfile/basic',
          resources: {
            dockerfile: 'resource://dockerfile/basic',
          },
        });
      }
    },
  },

  build_image: {
    name: 'build_image',
    supportsSampling: false,
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Building image');

      await new Promise(resolve => setTimeout(resolve, 8000)); // Simulate build time

      return Success({
        ok: true,
        content: {
          imageId: 'sha256:mock123456',
          imageSize: '187MB',
          buildTime: 8.2,
          layers: 12,
        },
        resources: {
          logs: 'resource://build/logs',
          metadata: 'resource://build/metadata',
        },
      });
    },
  },

  scan_image: {
    name: 'scan_image',
    supportsSampling: false,
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Scanning image');

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Simulate some vulnerabilities
      const vulnerabilities = {
        critical: Math.floor(Math.random() * 2), // 0-1 critical
        high: Math.floor(Math.random() * 3),     // 0-2 high
        medium: Math.floor(Math.random() * 5),   // 0-4 medium
        low: Math.floor(Math.random() * 8),       // 0-7 low
      };

      return Success({
        ok: true,
        content: {
          vulnerabilities,
          riskScore: vulnerabilities.critical * 10 + vulnerabilities.high * 5 + vulnerabilities.medium * 2 + vulnerabilities.low * 0.5,
          needsRemediation: vulnerabilities.critical > 0 || vulnerabilities.high > 2,
        },
        resources: {
          report: 'resource://scan/report',
          details: 'resource://scan/details',
        },
      });
    },
  },

  generate_k8s_manifests: {
    name: 'generate_k8s_manifests',
    supportsSampling: true,
    samplingConfig: {
      maxCandidates: 3,
      scoringWeights: {
        security: 0.35,
        scalability: 0.25,
        reliability: 0.25,
        efficiency: 0.15,
      },
    },
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Generating K8s manifests');

      const useSampling = args.useSampling as boolean;
      await new Promise(resolve => setTimeout(resolve, useSampling ? 3000 : 1000));

      return Success({
        ok: true,
        content: useSampling ? {
          winner: 'resource://k8s/winner',
          candidates: ['resource://k8s/candidate_0', 'resource://k8s/candidate_1', 'resource://k8s/candidate_2'],
          strategy: 'rolling-deployment',
        } : {
          manifests: 'resource://k8s/basic',
        },
        resources: useSampling ? {
          winner: 'resource://k8s/winner',
          candidate_0: 'resource://k8s/candidate_0',
          candidate_1: 'resource://k8s/candidate_1',
          candidate_2: 'resource://k8s/candidate_2',
        } : {
          manifests: 'resource://k8s/basic',
        },
      });
    },
  },

  deploy_application: {
    name: 'deploy_application',
    supportsSampling: false,
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Deploying application');

      await new Promise(resolve => setTimeout(resolve, 6000));

      return Success({
        ok: true,
        content: {
          deploymentName: 'mock-app-deployment',
          serviceName: 'mock-app-service',
          namespace: 'default',
          replicas: 3,
          readyReplicas: 3,
        },
        resources: {
          status: 'resource://deploy/status',
          events: 'resource://deploy/events',
        },
      });
    },
  },

  verify_deployment: {
    name: 'verify_deployment',
    supportsSampling: false,
    async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
      logger.info({ args }, 'Mock: Verifying deployment');

      await new Promise(resolve => setTimeout(resolve, 4000));

      return Success({
        ok: true,
        content: {
          healthy: true,
          endpoints: ['http://mock-app-service:3000/health'],
          responseTime: 145,
          uptime: '100%',
        },
        resources: {
          healthChecks: 'resource://verify/health',
          performance: 'resource://verify/performance',
        },
      });
    },
  },
});

// Mock remediation tool (conditional)
export const createMockRemediationTool = (logger: Logger): EnhancedTool => ({
  name: 'remediate_vulnerabilities',
  supportsSampling: true,
  samplingConfig: {
    maxCandidates: 3,
    scoringWeights: {
      security: 0.6,
      stability: 0.3,
      compatibility: 0.1,
    },
  },
  async execute(args: Record<string, unknown>): Promise<Result<ToolResult>> {
    logger.info({ args }, 'Mock: Remediating vulnerabilities');

    await new Promise(resolve => setTimeout(resolve, 4000));

    return Success({
      success: true,
      content: {
        remediatedDockerfile: 'resource://remediation/dockerfile',
        changesApplied: [
          'Updated base image from node:18 to node:18.19-alpine',
          'Added security patches for npm vulnerabilities',
          'Updated express to version 4.18.2',
        ],
        vulnerabilitiesFixed: {
          critical: 1,
          high: 2,
          medium: 1,
        },
      },
      resources: {
        dockerfile: 'resource://remediation/dockerfile',
        changelog: 'resource://remediation/changelog',
        verification: 'resource://remediation/verification',
      },
    });
  },
});

export const USE_MOCKS = process.env.NODE_ENV === 'development' || process.env.USE_MOCKS === 'true';
