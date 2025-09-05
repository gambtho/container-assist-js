/**
 * Docker service mocks for MCP tool testing
 */

import { jest } from '@jest/globals';
import { Success, Failure, type Result } from '../../../../domain/types/result';

/**
 * Simple hash function for deterministic test behavior
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export interface DockerBuildOptions {
  context: string;
  dockerfile?: string;
  tags?: string[];
  buildArgs?: Record<string, string>;
  target?: string;
}

export interface DockerBuildResult {
  imageId: string;
  tags: string[];
  size: number;
  buildLog: string[];
}

export interface DockerScanOptions {
  image: string;
  format?: 'json' | 'table';
  severity?: string[];
}

export interface DockerScanResult {
  vulnerabilities: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description: string;
    package: string;
    version: string;
    fixedVersion?: string;
  }>;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface DockerTagOptions {
  source: string;
  target: string;
}

export interface DockerPushOptions {
  image: string;
  registry?: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface DockerPushResult {
  digest: string;
  size: number;
  repository: string;
  tag: string;
}

/**
 * Mock Docker service with realistic responses
 */
export function createMockDockerService(): {
  build: jest.MockedFunction<(options: DockerBuildOptions) => Promise<Result<DockerBuildResult>>>;
  tag: jest.MockedFunction<(options: DockerTagOptions) => Promise<Result<void>>>;
  push: jest.MockedFunction<(options: DockerPushOptions) => Promise<Result<DockerPushResult>>>;
  scan: jest.MockedFunction<(options: DockerScanOptions) => Promise<Result<DockerScanResult>>>;
  isAvailable: jest.MockedFunction<() => Promise<boolean>>;
  getImageInfo: jest.MockedFunction<(image: string) => Promise<Result<unknown>>>;
  listImages: jest.MockedFunction<() => Promise<Result<unknown[]>>>;
  removeImage: jest.MockedFunction<(image: string, force?: boolean) => Promise<Result<void>>>;
} {
  return {
    // Build image mock
    build: jest
      .fn<(options: DockerBuildOptions) => Promise<Result<DockerBuildResult>>>()
      .mockImplementation((options) => {
        if (!options.context) {
          return Promise.resolve(Failure('Build context is required'));
        }

        if (options.tags?.includes('failing-build')) {
          return Promise.resolve(Failure('Docker build failed: syntax error in Dockerfile'));
        }

        // Generate deterministic values based on context path
        const contextHash = simpleHash(options.context);
        const buildId = (contextHash % 999999).toString(16).padStart(6, '0');

        const result: DockerBuildResult = {
          imageId: `sha256:${buildId}${buildId}${buildId}`, // Deterministic based on context
          tags: options.tags ?? [`test-image:${contextHash}`],
          size: 50000000 + (contextHash % 500000000), // Deterministic size 50MB-550MB
          buildLog: [
            'Step 1/6 : FROM node:16-alpine',
            ' ---> abc123def456',
            'Step 2/6 : WORKDIR /app',
            ' ---> Using cache',
            ' ---> def456ghi789',
            'Step 3/6 : COPY package*.json ./',
            ' ---> ghi789jkl012',
            `Successfully built ${buildId}`,
            `Successfully tagged ${options.tags?.[0] ?? 'test-image:latest'}`,
          ],
        };

        return Promise.resolve(Success(result));
      }),

    // Tag image mock
    tag: jest
      .fn<(options: DockerTagOptions) => Promise<Result<void>>>()
      .mockImplementation((options) => {
        if (!options.source || !options.target) {
          return Promise.resolve(Failure('Source and target images are required'));
        }

        if (options.source.includes('non-existent')) {
          return Promise.resolve(Failure('Source image not found'));
        }

        return Promise.resolve(Success(undefined));
      }),

    // Push image mock
    push: jest
      .fn<(options: DockerPushOptions) => Promise<Result<DockerPushResult>>>()
      .mockImplementation((options) => {
        if (!options.image) {
          return Promise.resolve(Failure('Image name is required'));
        }

        if (options.image.includes('unauthorized')) {
          return Promise.resolve(Failure('Authentication required'));
        }

        const [repository, tag] = options.image.split(':');
        const imageHash = simpleHash(options.image);
        const digestHash = (imageHash % 999999).toString(16).padStart(6, '0');

        const result: DockerPushResult = {
          digest: `sha256:${digestHash}${'0'.repeat(58)}`, // Deterministic digest
          size: 25000000 + (imageHash % 475000000), // Deterministic size 25MB-500MB
          repository: repository ?? 'unknown',
          tag: tag ?? 'latest',
        };

        return Promise.resolve(Success(result));
      }),

    // Scan image mock
    scan: jest
      .fn<(options: DockerScanOptions) => Promise<Result<DockerScanResult>>>()
      .mockImplementation((options) => {
        if (!options.image) {
          return Promise.resolve(Failure('Image name is required'));
        }

        if (options.image.includes('scan-error')) {
          return Promise.resolve(Failure('Trivy scan failed: unable to analyze image'));
        }

        // Short-circuit for clean-image to return zero vulnerabilities deterministically
        if (options.image.includes('clean-image')) {
          return Promise.resolve(
            Success({
              vulnerabilities: [],
              summary: {
                total: 0,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
              },
            }),
          );
        }

        // Generate deterministic scan results based on image name
        const vulnerabilities = [];
        const imageHash = simpleHash(options.image);
        const numVulns = (imageHash % 20) + 1; // 1-20 vulnerabilities deterministically

        for (let i = 0; i < numVulns; i++) {
          const severities = ['low', 'medium', 'high', 'critical'] as const; // lowercase as per issue #49
          const itemHash = simpleHash(options.image + i.toString());
          const severity = severities[itemHash % severities.length]!;

          const baseVuln = {
            id: `CVE-2023-${String((itemHash % 99999) + 1).padStart(5, '0')}`,
            severity: severity.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
            title: `Sample vulnerability ${i + 1}`,
            description: `This is a sample vulnerability for testing purposes`,
            package: ['openssl', 'curl', 'libssl', 'nginx'][itemHash % 4]!,
            version: '1.0.0',
          };

          const vuln = itemHash % 2 === 0 ? { ...baseVuln, fixedVersion: '1.0.1' } : baseVuln;

          vulnerabilities.push(vuln);
        }

        const summary = vulnerabilities.reduce(
          (acc, vuln) => {
            acc.total++;
            if (vuln.severity) {
              const severityKey = vuln.severity.toLowerCase() as
                | 'low'
                | 'medium'
                | 'high'
                | 'critical';
              if (severityKey in acc) {
                acc[severityKey as keyof typeof acc]++;
              }
            }
            return acc;
          },
          { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        );

        const result: DockerScanResult = {
          vulnerabilities: vulnerabilities
            .filter(
              (vuln) =>
                vuln.severity &&
                vuln.package &&
                ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(vuln.severity),
            )
            .map((vuln) => {
              const mappedVuln: {
                id: string;
                severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
                title: string;
                description: string;
                package: string;
                version: string;
                fixedVersion?: string;
              } = {
                ...vuln,
                severity: vuln.severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
                package: vuln.package,
              };
              if ('fixedVersion' in vuln) {
                const fixedVer = (vuln as { fixedVersion?: string }).fixedVersion;
                if (fixedVer !== undefined) {
                  mappedVuln.fixedVersion = fixedVer;
                }
              }
              return mappedVuln;
            }),
          summary,
        };

        return Promise.resolve(Success(result));
      }),

    // Service availability check
    isAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),

    // Get image info mock
    getImageInfo: jest
      .fn<(image: string) => Promise<Result<unknown>>>()
      .mockImplementation((image) => {
        if (image.includes('non-existent')) {
          return Promise.resolve(Failure('Image not found'));
        }

        const imageHash = simpleHash(image);
        const imageId = (imageHash % 999999).toString(16).padStart(6, '0');

        return Promise.resolve(
          Success({
            id: `sha256:${imageId}${'0'.repeat(58)}`, // Deterministic image ID
            tags: [image],
            size: 50000000 + (imageHash % 950000000), // Deterministic size 50MB-1GB
            created: new Date(2023, 0, (imageHash % 365) + 1).toISOString(), // Deterministic creation date in 2023
          }),
        );
      }),

    // List images mock
    listImages: jest.fn<() => Promise<Result<unknown[]>>>().mockResolvedValue(
      Success([
        {
          id: 'sha256:abc123',
          tags: ['test-image:latest'],
          size: 150000000,
          created: new Date().toISOString(),
        },
        {
          id: 'sha256:def456',
          tags: ['node:16-alpine'],
          size: 50000000,
          created: new Date().toISOString(),
        },
      ]),
    ),

    // Remove image mock
    removeImage: jest
      .fn<(image: string, force?: boolean) => Promise<Result<void>>>()
      .mockImplementation((image, force = false) => {
        if (image.includes('in-use') && !force) {
          return Promise.resolve(Failure('Image is in use by running container'));
        }
        return Promise.resolve(Success(undefined));
      }),
  };
}

/**
 * Mock Docker CLI service (fallback when Docker daemon is not available)
 */
export function createMockDockerCLI(): {
  build: jest.MockedFunction<(args: DockerBuildOptions) => Promise<Result<unknown>>>;
  tag: jest.MockedFunction<(args: DockerTagOptions) => Promise<Result<unknown>>>;
  push: jest.MockedFunction<(args: DockerPushOptions) => Promise<Result<unknown>>>;
  exec: jest.MockedFunction<(args: string) => Promise<Result<unknown>>>;
} {
  return {
    build: jest.fn((args: DockerBuildOptions) => {
      const options = args;
      const command = `docker build ${options.context}`;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: 'Successfully built abc123def456\nSuccessfully tagged test-image:latest',
          stderr: '',
        }),
      );
    }),

    tag: jest.fn((args: DockerTagOptions) => {
      const options = args;
      const command = `docker tag ${options.source} ${options.target}`;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: '',
          stderr: '',
        }),
      );
    }),

    push: jest.fn((args: DockerPushOptions) => {
      const options = args;
      const command = `docker push ${options.image}`;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: `The push refers to repository [${options.image}]\nlatest: digest: sha256:abc123 size: 1234`,
          stderr: '',
        }),
      );
    }),

    exec: jest.fn((args: string) => {
      const command = args;
      return Promise.resolve(
        Success({
          command,
          exitCode: 0,
          stdout: 'Command executed successfully',
          stderr: '',
        }),
      );
    }),
  };
}

/**
 * Helper to create Docker build scenarios for testing
 */
export function createDockerBuildScenarios(): Record<string, unknown> {
  return {
    // Successful build
    success: {
      options: {
        context: './test-app',
        dockerfile: 'Dockerfile',
        tags: ['test-app:latest'],
      },
      expected: {
        imageId: expect.stringMatching(/^sha256:[a-f0-9]+$/) as string,
        tags: ['test-app:latest'],
        size: expect.any(Number) as number,
        buildLog: expect.any(Array) as string[],
      },
    },

    // Build with custom dockerfile
    customDockerfile: {
      options: {
        context: './test-app',
        dockerfile: 'Dockerfile.prod',
        tags: ['test-app:prod'],
        buildArgs: {
          NODE_ENV: 'production',
        },
      },
      expected: {
        tags: ['test-app:prod'],
      },
    },

    // Multi-stage build
    multiStage: {
      options: {
        context: './test-app',
        dockerfile: 'Dockerfile',
        target: 'production',
        tags: ['test-app:prod'],
      },
      expected: {
        tags: ['test-app:prod'],
      },
    },

    // Build failure
    failure: {
      options: {
        context: './test-app',
        tags: ['failing-build'],
      },
      expectError: 'Docker build failed: syntax error in Dockerfile',
    },

    // Missing context
    missingContext: {
      options: {
        context: '',
        tags: ['test-app:latest'],
      },
      expectError: 'Build context is required',
    },
  };
}

/**
 * Helper to create Docker scan scenarios for testing
 */
export function createDockerScanScenarios(): Record<string, unknown> {
  return {
    // Clean image (no vulnerabilities)
    clean: {
      options: {
        image: 'clean-image:latest',
      },
      expected: {
        vulnerabilities: [],
        summary: {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      },
    },

    // Image with vulnerabilities
    withVulnerabilities: {
      options: {
        image: 'vulnerable-image:latest',
      },
      expected: {
        vulnerabilities: expect.any(Array) as unknown[],
        summary: expect.objectContaining({
          total: expect.any(Number) as number,
          critical: expect.any(Number) as number,
          high: expect.any(Number) as number,
          medium: expect.any(Number) as number,
          low: expect.any(Number) as number,
        }) as { total: number; critical: number; high: number; medium: number; low: number },
      },
    },

    // Scan failure
    scanError: {
      options: {
        image: 'scan-error:latest',
      },
      expectError: 'Trivy scan failed: unable to analyze image',
    },

    // Missing image
    missingImage: {
      options: {
        image: '',
      },
      expectError: 'Image name is required',
    },
  };
}
