/**
 * Docker CLI Fallback Mechanism Tests
 * Tests for Docker command-line interface fallback when dockerode fails
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { CommandExecutor, CommandResult } from '../../../src/infrastructure/command-executor';
import { DockerBuildOptions, DockerScanResult } from '../../../src/domain/types/docker';

// Mock CommandExecutor
jest.mock('../../../src/infrastructure/command-executor', () => {
  return {
    CommandExecutor: jest.fn().mockImplementation(() => ({
      isAvailable: jest.fn(),
      getVersion: jest.fn(),
      execute: jest.fn()
    }))
  };
});

const mockCommandExecutor = {
  execute: jest.fn(),
  isAvailable: jest.fn(),
  getVersion: jest.fn()
} as unknown as CommandExecutor;

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as unknown as Logger;

/**
 * Docker CLI Fallback Service
 * This would be the implementation that falls back to CLI when dockerode fails
 */
class DockerCLIFallback {
  private executor: CommandExecutor;
  private logger: Logger;

  constructor(logger: Logger, executor?: CommandExecutor) {
    this.logger = logger.child({ component: 'DockerCLIFallback' });
    this.executor = executor || new CommandExecutor(logger);
  }

  async isDockerAvailable(): Promise<boolean> {
    return this.executor.isAvailable('docker');
  }

  async getDockerVersion(): Promise<string | null> {
    return this.executor.getVersion('docker', '--version');
  }

  async build(contextPath: string, options: DockerBuildOptions): Promise<{ success: boolean; imageId?: string; logs: string[] }> {
    const args = ['build', contextPath];
    
    if (options.dockerfile) {
      args.push('-f', options.dockerfile);
    }
    
    if (options.tags && options.tags.length > 0) {
      options.tags.forEach(tag => {
        args.push('-t', tag);
      });
    } else if (options.tag) {
      args.push('-t', options.tag);
    }

    if (options.buildArgs) {
      Object.entries(options.buildArgs).forEach(([key, value]) => {
        args.push('--build-arg', `${key}=${value}`);
      });
    }

    if (options.target) {
      args.push('--target', options.target);
    }

    if (options.noCache) {
      args.push('--no-cache');
    }

    if (options.platform) {
      args.push('--platform', options.platform);
    }

    if (options.pull) {
      args.push('--pull');
    }

    const result = await this.executor.execute('docker', args, { timeout: 600000 });
    
    if (result.exitCode === 0) {
      // Extract image ID from output (simplified)
      const imageIdMatch = result.stdout.match(/Successfully built ([a-f0-9]+)/);
      const imageId = imageIdMatch ? `sha256:${imageIdMatch[1]}` : undefined;
      
      return {
        success: true,
        imageId,
        logs: result.stdout.split('\n').filter(line => line.trim())
      };
    } else {
      throw new Error(`Docker build failed: ${result.stderr || result.stdout}`);
    }
  }

  async tag(imageId: string, tag: string): Promise<void> {
    const result = await this.executor.execute('docker', ['tag', imageId, tag]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Docker tag failed: ${result.stderr || result.stdout}`);
    }
  }

  async push(tag: string): Promise<{ digest?: string }> {
    const result = await this.executor.execute('docker', ['push', tag], { timeout: 600000 });
    
    if (result.exitCode === 0) {
      // Extract digest from output (simplified)
      const digestMatch = result.stdout.match(/digest: (sha256:[a-f0-9]+)/);
      return {
        digest: digestMatch ? digestMatch[1] : undefined
      };
    } else {
      throw new Error(`Docker push failed: ${result.stderr || result.stdout}`);
    }
  }

  async listImages(): Promise<Array<{ Id: string; RepoTags?: string[]; Size?: number; Created?: number }>> {
    const result = await this.executor.execute('docker', ['images', '--format', 'json']);
    
    if (result.exitCode === 0) {
      return result.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            const parsed = JSON.parse(line);
            return {
              Id: `sha256:${parsed.ID}`,
              RepoTags: parsed.Repository && parsed.Tag ? [`${parsed.Repository}:${parsed.Tag}`] : undefined,
              Size: parsed.Size ? parseInt(parsed.Size) : undefined,
              Created: parsed.CreatedAt ? new Date(parsed.CreatedAt).getTime() / 1000 : undefined
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<{ Id: string; RepoTags?: string[]; Size?: number; Created?: number }>;
    } else {
      throw new Error(`Docker images list failed: ${result.stderr || result.stdout}`);
    }
  }

  async removeImage(imageId: string): Promise<void> {
    const result = await this.executor.execute('docker', ['rmi', imageId]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Docker image removal failed: ${result.stderr || result.stdout}`);
    }
  }

  async imageExists(imageId: string): Promise<boolean> {
    const result = await this.executor.execute('docker', ['inspect', imageId]);
    return result.exitCode === 0;
  }

  async scan(image: string): Promise<DockerScanResult> {
    // For CLI fallback, we'd need to integrate with external scanners like Trivy
    throw new Error('Scanning via CLI fallback not implemented - use Trivy integration');
  }

  async systemInfo(): Promise<Record<string, unknown> | null> {
    const result = await this.executor.execute('docker', ['system', 'info', '--format', 'json']);
    
    if (result.exitCode === 0) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        return null;
      }
    }
    return null;
  }

  async listContainers(all = false): Promise<Array<{ Id: string; Names?: string[]; Image?: string; State?: string; Status?: string }>> {
    const args = ['ps', '--format', 'json'];
    if (all) {
      args.push('-a');
    }

    const result = await this.executor.execute('docker', args);
    
    if (result.exitCode === 0) {
      return result.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            const parsed = JSON.parse(line);
            return {
              Id: parsed.ID,
              Names: parsed.Names ? [parsed.Names] : undefined,
              Image: parsed.Image,
              State: parsed.State,
              Status: parsed.Status
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<{ Id: string; Names?: string[]; Image?: string; State?: string; Status?: string }>;
    } else {
      throw new Error(`Docker containers list failed: ${result.stderr || result.stdout}`);
    }
  }
}

describe('Docker CLI Fallback Mechanism', () => {
  let dockerCLI: DockerCLIFallback;

  beforeEach(() => {
    jest.clearAllMocks();
    
    dockerCLI = new DockerCLIFallback(mockLogger, mockCommandExecutor);
  });

  describe('Availability Check', () => {
    test('should check if Docker CLI is available', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);

      const available = await dockerCLI.isDockerAvailable();

      expect(available).toBe(true);
      expect(mockCommandExecutor.isAvailable).toHaveBeenCalledWith('docker');
    });

    test('should return false when Docker CLI is not available', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(false);

      const available = await dockerCLI.isDockerAvailable();

      expect(available).toBe(false);
    });

    test('should get Docker version via CLI', async () => {
      mockCommandExecutor.getVersion.mockResolvedValue('Docker version 20.10.17, build 100c701');

      const version = await dockerCLI.getDockerVersion();

      expect(version).toBe('Docker version 20.10.17, build 100c701');
      expect(mockCommandExecutor.getVersion).toHaveBeenCalledWith('docker', '--version');
    });
  });

  describe('Build Operations', () => {
    test('should build image via CLI', async () => {
      const buildOptions: DockerBuildOptions = {
        context: '/test/context',
        tags: ['test:latest'],
        dockerfile: 'Dockerfile',
        buildArgs: { NODE_ENV: 'production' },
        target: 'production',
        noCache: true
      };

      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: 'Step 1/5 : FROM node:18\nStep 5/5 : CMD ["node", "app"]\nSuccessfully built abc123def456\nSuccessfully tagged test:latest',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const result = await dockerCLI.build('/test/context', buildOptions);

      expect(result.success).toBe(true);
      expect(result.imageId).toBe('sha256:abc123def456');
      expect(result.logs).toContain('Step 1/5 : FROM node:18');
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          'build', '/test/context',
          '-f', 'Dockerfile',
          '-t', 'test:latest',
          '--build-arg', 'NODE_ENV=production',
          '--target', 'production',
          '--no-cache'
        ]),
        { timeout: 600000 }
      );
    });

    test('should build with minimal options', async () => {
      const buildOptions: DockerBuildOptions = {
        context: '/simple/context',
        tag: 'simple:latest'
      };

      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: 'Successfully built abc123def456\nSuccessfully tagged simple:latest',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const result = await dockerCLI.build('/simple/context', buildOptions);

      expect(result.success).toBe(true);
      expect(result.imageId).toBe('sha256:abc123def456');
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'docker',
        ['build', '/simple/context', '-t', 'simple:latest'],
        { timeout: 600000 }
      );
    });

    test('should handle build failure', async () => {
      const buildOptions: DockerBuildOptions = {
        context: '/failed/context',
        tag: 'failed:latest'
      };

      const mockResult: CommandResult = {
        exitCode: 1,
        stdout: '',
        stderr: 'ERROR: Could not find Dockerfile in context',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await expect(dockerCLI.build('/failed/context', buildOptions)).rejects.toThrow('Docker build failed: ERROR: Could not find Dockerfile in context');
    });
  });

  describe('Tag Operations', () => {
    test('should tag image via CLI', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await dockerCLI.tag('sha256:abc123', 'myrepo:latest');

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith('docker', ['tag', 'sha256:abc123', 'myrepo:latest']);
    });

    test('should handle tag failure', async () => {
      const mockResult: CommandResult = {
        exitCode: 1,
        stdout: '',
        stderr: 'Error: No such image: nonexistent',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await expect(dockerCLI.tag('nonexistent', 'test:latest')).rejects.toThrow('Docker tag failed: Error: No such image: nonexistent');
    });
  });

  describe('Push Operations', () => {
    test('should push image via CLI', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: 'The push refers to repository [docker.io/library/test]\nlatest: digest: sha256:abc123def456789012345678901234567890abcd size: 1234',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const result = await dockerCLI.push('test:latest');

      // CLI returns digest on successful push
      expect(result.digest).toBe('sha256:abc123def456789012345678901234567890abcd');
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith('docker', ['push', 'test:latest'], { timeout: 600000 });
    });

    test('should handle push without digest', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: 'The push refers to repository [docker.io/library/test]',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const result = await dockerCLI.push('test:latest');

      expect(result.digest).toBeUndefined();
    });

    test('should handle push failure', async () => {
      const mockResult: CommandResult = {
        exitCode: 1,
        stdout: '',
        stderr: 'denied: requested access to the resource is denied',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await expect(dockerCLI.push('unauthorized:latest')).rejects.toThrow('Docker push failed: denied: requested access to the resource is denied');
    });
  });

  describe('Image Management Operations', () => {
    test('should list images via CLI', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: '{"ID":"abc123","Repository":"test","Tag":"latest","CreatedAt":"2023-01-01T10:00:00Z","Size":"100MB"}\n{"ID":"def456","Repository":"app","Tag":"v1.0.0","CreatedAt":"2023-01-01T11:00:00Z","Size":"200MB"}',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const images = await dockerCLI.listImages();

      expect(images).toHaveLength(2);
      expect(images[0]).toMatchObject({
        Id: 'sha256:abc123',
        RepoTags: ['test:latest']
      });
      expect(images[1]).toMatchObject({
        Id: 'sha256:def456',
        RepoTags: ['app:v1.0.0']
      });
    });

    test('should handle malformed JSON in image list', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: '{"ID":"abc123","Repository":"test","Tag":"latest"}\ninvalid json line\n{"ID":"def456","Repository":"app","Tag":"v1.0.0"}',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const images = await dockerCLI.listImages();

      expect(images).toHaveLength(2); // Invalid line should be filtered out
      expect(images[0].Id).toBe('sha256:abc123');
      expect(images[1].Id).toBe('sha256:def456');
    });

    test('should remove image via CLI', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: 'Deleted: sha256:abc123',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await dockerCLI.removeImage('sha256:abc123');

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith('docker', ['rmi', 'sha256:abc123']);
    });

    test('should handle image removal failure', async () => {
      const mockResult: CommandResult = {
        exitCode: 1,
        stdout: '',
        stderr: 'Error: No such image: nonexistent',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await expect(dockerCLI.removeImage('nonexistent')).rejects.toThrow('Docker image removal failed: Error: No such image: nonexistent');
    });

    test('should check if image exists', async () => {
      mockCommandExecutor.execute.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '[{"Id":"sha256:abc123"}]',
        stderr: '',
        timedOut: false
      });

      const exists = await dockerCLI.imageExists('sha256:abc123');

      expect(exists).toBe(true);
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith('docker', ['inspect', 'sha256:abc123']);
    });

    test('should return false when image does not exist', async () => {
      mockCommandExecutor.execute.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'Error: No such image: nonexistent',
        timedOut: false
      });

      const exists = await dockerCLI.imageExists('nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('System Operations', () => {
    test('should get system info via CLI', async () => {
      const mockSystemInfo = {
        Containers: 5,
        Images: 10,
        ServerVersion: '20.10.17',
        OperatingSystem: 'Ubuntu 22.04'
      };

      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: JSON.stringify(mockSystemInfo),
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const info = await dockerCLI.systemInfo();

      expect(info).toEqual(mockSystemInfo);
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith('docker', ['system', 'info', '--format', 'json']);
    });

    test('should handle invalid JSON in system info', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: 'invalid json response',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const info = await dockerCLI.systemInfo();

      expect(info).toBeNull();
    });

    test('should list containers via CLI', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: '{"ID":"container123","Names":"test-container","Image":"test:latest","State":"running","Status":"Up 2 hours"}\n{"ID":"container456","Names":"app-container","Image":"app:v1.0.0","State":"exited","Status":"Exited (0) 1 hour ago"}',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const containers = await dockerCLI.listContainers();

      expect(containers).toHaveLength(2);
      expect(containers[0]).toMatchObject({
        Id: 'container123',
        Names: ['test-container'],
        Image: 'test:latest',
        State: 'running'
      });
    });

    test('should list all containers including stopped ones', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: '{"ID":"container123","Names":"test-container","Image":"test:latest","State":"running","Status":"Up 2 hours"}',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      await dockerCLI.listContainers(true);

      expect(mockCommandExecutor.execute).toHaveBeenCalledWith('docker', ['ps', '--format', 'json', '-a']);
    });
  });

  describe('Scan Operations', () => {
    test('should reject scanning via CLI fallback', async () => {
      await expect(dockerCLI.scan('test:latest')).rejects.toThrow('Scanning via CLI fallback not implemented - use Trivy integration');
    });
  });

  describe('Error Handling', () => {
    test('should handle command execution timeout', async () => {
      mockCommandExecutor.execute.mockRejectedValue(new Error('Command timed out'));

      await expect(dockerCLI.build('/timeout/context', { context: '/timeout/context', tag: 'timeout:test' })).rejects.toThrow('Command timed out');
    });

    test('should handle command not found', async () => {
      mockCommandExecutor.execute.mockRejectedValue(new Error('docker: command not found'));

      await expect(dockerCLI.build('/test/context', { context: '/test/context', tag: 'test:latest' })).rejects.toThrow('docker: command not found');
    });

    test('should handle empty command output gracefully', async () => {
      const mockResult: CommandResult = {
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      };

      mockCommandExecutor.execute.mockResolvedValue(mockResult);

      const images = await dockerCLI.listImages();

      expect(images).toHaveLength(0);
    });
  });
});