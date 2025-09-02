/**
 * Integration tests for AI Error Recovery System
 * Tests retry logic, error suggestions, and recovery mechanisms
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  withRetry, 
  executeWithRetry, 
  executeWithRecovery,
  getBuildErrorSuggestions,
  getRecoverySuggestions 
} from '../../../src/infrastructure/ai/error-recovery.js';
import { ok, fail } from '../../../src/domain/types/result.js';

describe('Error Recovery System Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Retry Mechanisms', () => {
    it('should retry failed operations with exponential backoff', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const startTime = Date.now();
      const result = await withRetry(operation, {
        maxAttempts: 3,
        delayMs: 100,
        backoff: 'exponential'
      });

      const duration = Date.now() - startTime;
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
      // Should have delays: 0 + 100*1 + 100*2 = 300ms minimum
      expect(duration).toBeGreaterThan(250);
    });

    it('should retry failed operations with linear backoff', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const startTime = Date.now();
      const result = await withRetry(operation, {
        maxAttempts: 3,
        delayMs: 100,
        backoff: 'linear'
      });

      const duration = Date.now() - startTime;
      
      expect(result).toBe('success');
      expect(attempts).toBe(3);
      // Should have delays: 0 + 100 + 100 = 200ms minimum
      expect(duration).toBeGreaterThan(150);
    });

    it('should throw error after max attempts exceeded', async () => {
      const operation = jest.fn().mockImplementation(() => {
        throw new Error('Persistent failure');
      });

      await expect(withRetry(operation, { maxAttempts: 2 })).rejects.toThrow('Persistent failure');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should succeed on first attempt if operation succeeds', async () => {
      const operation = jest.fn().mockReturnValue('immediate success');

      const result = await withRetry(operation);
      
      expect(result).toBe('immediate success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Result-based Error Recovery', () => {
    it('should retry operations returning Result objects', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.resolve(fail(`Attempt ${attempts} failed`));
        }
        return Promise.resolve(ok('success'));
      });

      const result = await executeWithRetry(operation, 'test operation');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('success');
      }
      expect(attempts).toBe(2);
    });

    it('should handle persistent failures gracefully', async () => {
      const operation = jest.fn().mockResolvedValue(fail('Persistent error'));

      const result = await executeWithRetry(operation, 'failing operation');
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('failing operation failed after retries');
      expect(result.error?.message).toContain('Persistent error');
    });
  });

  describe('Operation-Specific Recovery', () => {
    it('should provide build-specific error suggestions', async () => {
      const operation = jest.fn().mockImplementation(() => {
        throw new Error('no such file or directory: ./package.json');
      });

      const result = await executeWithRecovery(
        () => Promise.resolve(ok('should not reach')),
        'npm build',
        'build',
        'javascript'
      );

      // Mock the error by calling executeWithRetry with failing operation
      const failingResult = await executeWithRecovery(
        () => Promise.resolve(operation()),
        'npm build',
        'build', 
        'javascript'
      );
      
      expect(failingResult.success).toBe(false);
      if (!failingResult.success) {
        expect(failingResult.error?.message).toContain('Suggestions:');
        expect(failingResult.error?.message).toContain('Verify all COPY/ADD paths exist');
        expect(failingResult.error?.message).toContain('npm cache clean --force');
      }
    });

    it('should provide push-specific error suggestions', async () => {
      const operation = jest.fn().mockImplementation(() => {
        throw new Error('authentication required');
      });

      const result = await executeWithRecovery(
        () => Promise.resolve(operation()),
        'docker push',
        'push'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.message).toContain('Verify registry credentials');
        expect(result.error?.message).toContain('Check if logged in to correct registry');
      }
    });

    it('should provide scan-specific error suggestions', async () => {
      const operation = jest.fn().mockImplementation(() => {
        throw new Error('trivy: command not found');
      });

      const result = await executeWithRecovery(
        () => Promise.resolve(operation()),
        'vulnerability scan',
        'scan'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.message).toContain('Verify scanner installation');
        expect(result.error?.message).toContain('Update vulnerability database');
      }
    });
  });

  describe('Error Suggestion Generation', () => {
    it('should generate file-related suggestions', () => {
      const error = new Error('ENOENT: no such file or directory');
      const suggestions = getBuildErrorSuggestions(error, 'nodejs');

      expect(suggestions).toContain('- Verify all COPY/ADD paths exist in build context');
      expect(suggestions).toContain('- Check .dockerignore for excluded files');
    });

    it('should generate network-related suggestions', () => {
      const error = new Error('network timeout during npm install');
      const suggestions = getBuildErrorSuggestions(error, 'nodejs');

      expect(suggestions).toContain('- Check network connectivity');
      expect(suggestions).toContain('- Try using different package manager mirrors');
    });

    it('should generate permission-related suggestions', () => {
      const error = new Error('permission denied: /app/dist');
      const suggestions = getBuildErrorSuggestions(error, 'nodejs');

      expect(suggestions).toContain('- Ensure files have correct permissions (chmod)');
      expect(suggestions).toContain('- Consider using non-root user in Dockerfile');
    });

    it('should generate language-specific dependency suggestions', () => {
      // Node.js - needs "dependency" or "package" keywords
      const nodeError = new Error('dependency package not found');
      const nodeSuggestions = getBuildErrorSuggestions(nodeError, 'javascript');
      
      expect(nodeSuggestions).toContain('- Run npm cache clean --force');
      expect(nodeSuggestions).toContain('- Use npm ci instead of npm install');

      // Python - needs "dependency" keyword
      const pythonError = new Error('dependency installation failed');
      const pythonSuggestions = getBuildErrorSuggestions(pythonError, 'python');
      
      expect(pythonSuggestions).toContain('- Update pip: pip install --upgrade pip');
      expect(pythonSuggestions).toContain('- Use requirements.txt for consistent dependencies');

      // Java - needs "maven" keyword to trigger Maven-specific suggestions
      const javaError = new Error('maven dependency resolution failed');
      const javaSuggestions = getBuildErrorSuggestions(javaError, 'java');
      
      expect(javaSuggestions).toContain('- Run mvn dependency:resolve to check dependencies');
      expect(javaSuggestions).toContain('- Use mvn dependency:go-offline for offline builds');

      // Go - needs "dependency" or "module" keyword
      const goError = new Error('dependency module not found');
      const goSuggestions = getBuildErrorSuggestions(goError, 'go');
      
      expect(goSuggestions).toContain('- Run go mod tidy to clean dependencies');
      expect(goSuggestions).toContain('- Check go.mod for correct module versions');
    });

    it('should provide generic suggestions when no specific match', () => {
      const error = new Error('unknown build failure');
      const suggestions = getBuildErrorSuggestions(error);

      expect(suggestions).toContain('- Review Dockerfile and build context');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Recovery Suggestions by Operation Type', () => {
    it('should provide appropriate build recovery suggestions', () => {
      const error = new Error('npm build failed: file not found');
      const suggestions = getRecoverySuggestions('build', error, 'nodejs');

      expect(suggestions.some(s => s.includes('npm cache clean'))).toBe(true);
      expect(suggestions.some(s => s.includes('build context'))).toBe(true);
    });

    it('should provide appropriate push recovery suggestions', () => {
      const error = new Error('push failed: unauthorized');
      const suggestions = getRecoverySuggestions('push', error);

      expect(suggestions.some(s => s.includes('registry credentials'))).toBe(true);
      expect(suggestions.some(s => s.includes('push permissions'))).toBe(true);
    });

    it('should provide appropriate scan recovery suggestions', () => {
      const error = new Error('trivy scanner not available');
      const suggestions = getRecoverySuggestions('scan', error);

      expect(suggestions.some(s => s.includes('scanner installation'))).toBe(true);
      expect(suggestions.some(s => s.includes('vulnerability database') || s.includes('database updates'))).toBe(true);
    });

    it('should provide appropriate deploy recovery suggestions', () => {
      const error = new Error('kubernetes deployment failed: connection refused');
      const suggestions = getRecoverySuggestions('deploy', error);

      expect(suggestions.some(s => s.includes('Kubernetes cluster'))).toBe(true);
      expect(suggestions.some(s => s.includes('kubectl configuration'))).toBe(true);
    });

    it('should provide generic suggestions for unknown operation types', () => {
      const error = new Error('unknown operation failed');
      const suggestions = getRecoverySuggestions('general', error);

      expect(suggestions.some(s => s.includes('error message'))).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Real-world Error Scenarios', () => {
    it('should handle Docker build context errors', async () => {
      const dockerError = new Error('failed to solve with frontend dockerfile.v0: failed to read dockerfile: no such file or directory');
      
      const result = await executeWithRecovery(
        () => { throw dockerError; },
        'Docker build',
        'build'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.message).toContain('Verify all COPY/ADD paths exist');
      }
    });

    it('should handle npm network errors', async () => {
      const npmError = new Error('npm ERR! network request failed: connection timeout');
      
      const result = await executeWithRecovery(
        () => { throw npmError; },
        'npm install',
        'build',
        'nodejs'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.message).toContain('Check network connectivity');
        expect(result.error?.message).toContain('different package manager mirrors');
      }
    });

    it('should handle Kubernetes deployment errors', async () => {
      const k8sError = new Error('kubernetes deployment failed: insufficient cluster resources');
      
      const result = await executeWithRecovery(
        () => { throw k8sError; },
        'kubectl apply',
        'deploy'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.message).toContain('cluster resources');
        expect(result.error?.message).toContain('configuration');
      }
    });
  });

  describe('Performance and Timing', () => {
    it('should respect timeout constraints', async () => {
      const slowOperation = () => new Promise(resolve => 
        setTimeout(() => resolve('delayed success'), 50)
      );

      const startTime = Date.now();
      const result = await withRetry(slowOperation, {
        maxAttempts: 1,
        delayMs: 0
      });
      const duration = Date.now() - startTime;

      expect(result).toBe('delayed success');
      expect(duration).toBeGreaterThan(40);
    });

    it('should not exceed reasonable retry timeouts', async () => {
      const failingOperation = () => {
        throw new Error('Always fails');
      };

      const startTime = Date.now();
      
      await expect(withRetry(failingOperation, {
        maxAttempts: 3,
        delayMs: 100,
        backoff: 'exponential'
      })).rejects.toThrow();

      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time: 0 + 100 + 200 + overhead < 500ms
      expect(duration).toBeLessThan(500);
    });
  });
});