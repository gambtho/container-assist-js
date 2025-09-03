/**
 * Integration tests for Trivy Scanner
 * Tests real vulnerability scanning with Trivy integration
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { TrivyScanner } from '../../../src/infrastructure/scanners/trivy-scanner.js';
import { CommandExecutor } from '../../../src/infrastructure/command-executor.js';
import { DockerClient } from '../../../src/infrastructure/docker-client.js';
import { isOk, isFail } from '../../../src/domain/types/result.js';
import pino from 'pino';

const logger = pino({ level: 'silent' }); // Silent logger for tests

describe('TrivyScanner Integration Tests', () => {
  let scanner: TrivyScanner;
  let executor: CommandExecutor;
  let isTrivyAvailable: boolean;

  beforeAll(async () => {
    executor = new CommandExecutor(logger);
    
    // Check if Trivy is actually available
    isTrivyAvailable = await executor.isAvailable('trivy');
    
    if (isTrivyAvailable) {
      scanner = new TrivyScanner(logger, {
        skipUpdate: true, // Skip DB update in tests for speed
        timeout: 60000
      });
    }
  });

  describe('Trivy Availability', () => {
    it('should detect if Trivy is installed', async () => {
      if (!isTrivyAvailable) {
        console.warn('Trivy not installed, skipping integration tests');
        expect(isTrivyAvailable).toBe(false);
        return;
      }

      const result = await scanner.initialize();
      expect(result.kind).toBe('ok');
      expect(await scanner.isAvailable()).toBe(true);
    });

    it('should get Trivy version', async () => {
      if (!isTrivyAvailable) return;

      await scanner.initialize();
      const info = scanner.getInfo();
      expect(info.available).toBe(true);
      expect(info.version).toBeTruthy();
      expect(typeof info.version).toBe('string');
    });
  });

  describe('Image Scanning', () => {
    const testImage = 'alpine:3.18'; // Known safe image for testing

    it('should scan a real Docker image', async () => {
      if (!isTrivyAvailable) return;

      await scanner.initialize();
      const result = await scanner.scan(testImage);
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const scanResult = result.value;
        expect(scanResult).toHaveProperty('vulnerabilities');
        expect(scanResult).toHaveProperty('summary');
        expect(scanResult).toHaveProperty('scanTime');
        expect(scanResult).toHaveProperty('metadata');
        
        expect(Array.isArray(scanResult.vulnerabilities)).toBe(true);
        expect(scanResult.summary).toMatchObject({
          critical: expect.any(Number),
          high: expect.any(Number),
          medium: expect.any(Number),
          low: expect.any(Number),
          total: expect.any(Number)
        });
      }
    }, 120000); // 2 minute timeout for scan

    it('should filter vulnerabilities by severity', async () => {
      if (!isTrivyAvailable) return;

      await scanner.initialize();
      const result = await scanner.scan(testImage, {
        severity: 'critical'
      });
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const scanResult = result.value;
        // Only critical vulnerabilities should be included
        const nonCritical = scanResult.vulnerabilities.filter(v => v.severity !== 'critical');
        expect(nonCritical.length).toBe(0);
      }
    }, 60000);

    it('should handle ignore unfixed option', async () => {
      if (!isTrivyAvailable) return;

      await scanner.initialize();
      const result = await scanner.scan(testImage, {
        ignoreUnfixed: true
      });
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const scanResult = result.value;
        // All vulnerabilities should have fixed versions
        const unfixed = scanResult.vulnerabilities.filter(v => !v.fixedVersion);
        expect(unfixed.length).toBe(0);
      }
    }, 60000);

    it('should fail gracefully for non-existent image', async () => {
      if (!isTrivyAvailable) return;

      await scanner.initialize();
      const result = await scanner.scan('non-existent-image:fake-tag');
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.error).toContain('scan failed');
        expect(result.code).toBeTruthy();
      }
    }, 30000);

    it('should handle timeout properly', async () => {
      if (!isTrivyAvailable) return;

      const quickScanner = new TrivyScanner(logger, {
        skipUpdate: true,
        timeout: 1 // 1ms timeout to force timeout
      });
      
      await quickScanner.initialize();
      const result = await quickScanner.scan(testImage);
      
      expect(isFail(result)).toBe(true);
      if (isFail(result)) {
        expect(result.code).toBe('SCAN_TIMEOUT');
      }
    });
  });

  describe('Vulnerability Data Parsing', () => {
    it('should properly parse vulnerability details', async () => {
      if (!isTrivyAvailable) return;

      await scanner.initialize();
      const result = await scanner.scan('nginx:1.21'); // Older version likely to have some vulns
      
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const scanResult = result.value;
        
        // Check vulnerability structure if any found
        if (scanResult.vulnerabilities.length > 0) {
          const vuln = scanResult.vulnerabilities[0];
          expect(vuln).toHaveProperty('severity');
          expect(vuln).toHaveProperty('cve');
          expect(vuln).toHaveProperty('package');
          expect(vuln).toHaveProperty('version');
          expect(['critical', 'high', 'medium', 'low']).toContain(vuln.severity);
        }
        
        // Check metadata
        expect(scanResult.metadata).toHaveProperty('image');
        expect(scanResult.metadata.image).toBe('nginx:1.21');
        expect(scanResult.metadata.scanner).toBe('trivy');
      }
    }, 120000);
  });
});

describe('DockerClient with Trivy Integration', () => {
  let dockerClient: DockerClient;
  let isTrivyAvailable: boolean;

  beforeAll(async () => {
    const executor = new CommandExecutor(logger);
    isTrivyAvailable = await executor.isAvailable('trivy');
    
    dockerClient = new DockerClient(
      {
        socketPath: '/var/run/docker.sock',
        trivy: {
          skipUpdate: true,
          timeout: 60000
        }
      },
      logger
    );
    
    try {
      await dockerClient.initialize();
    } catch (error) {
      console.warn('Docker not available, skipping Docker integration tests');
    }
  });

  afterAll(async () => {
    await dockerClient.close();
  });

  it('should perform security scan through Docker client', async () => {
    if (!isTrivyAvailable) {
      console.warn('Trivy not available, skipping Docker scan test');
      return;
    }

    try {
      const scanResult = await dockerClient.scan('alpine:latest');
      
      expect(scanResult).toHaveProperty('vulnerabilities');
      expect(scanResult).toHaveProperty('summary');
      expect(Array.isArray(scanResult.vulnerabilities)).toBe(true);
      
      // If Trivy is available, should have real scanner metadata
      if (scanResult.metadata?.scannerStatus !== 'disabled') {
        expect(scanResult.metadata?.scanner).toBe('trivy');
      }
    } catch (error) {
      // Docker might not be available in CI
      console.warn('Docker scan failed:', error);
    }
  }, 120000);

  it('should handle scan when Trivy is not available', async () => {
    const clientWithoutTrivy = new DockerClient(
      {
        socketPath: '/var/run/docker.sock',
        trivy: false // Explicitly disable Trivy
      },
      logger
    );
    
    await clientWithoutTrivy.initialize();
    
    const scanResult = await clientWithoutTrivy.scan('alpine:latest');
    
    expect(scanResult).toHaveProperty('vulnerabilities');
    expect(scanResult.vulnerabilities).toEqual([]);
    expect(scanResult.metadata?.scannerStatus).toBe('disabled');
    expect(scanResult.metadata?.reason).toContain('not available');
    
    await clientWithoutTrivy.close();
  });
});

describe('Command Executor', () => {
  let executor: CommandExecutor;

  beforeAll(() => {
    executor = new CommandExecutor(logger);
  });

  it('should execute simple commands', async () => {
    const result = await executor.execute('echo', ['hello']);
    
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.timedOut).toBe(false);
  });

  it('should handle command errors', async () => {
    const result = await executor.execute('ls', ['/non-existent-directory-xyz']);
    
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  it('should detect available commands', async () => {
    const isLsAvailable = await executor.isAvailable('ls');
    const isFakeAvailable = await executor.isAvailable('fake-command-xyz');
    
    expect(isLsAvailable).toBe(true);
    expect(isFakeAvailable).toBe(false);
  });

  it('should get command version', async () => {
    const version = await executor.getVersion('node', '--version');
    
    expect(version).toBeTruthy();
    expect(version).toMatch(/^v\d+\.\d+\.\d+/); // Node version format
  });

  it('should handle command timeout', async () => {
    const result = await executor.execute('sleep', ['10'], { timeout: 100 });
    
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  });
});