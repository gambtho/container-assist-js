/**
 * Trivy Scanner Unit Tests
 * Comprehensive test coverage for Trivy security scanner integration
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { TrivyScanner, TrivyConfig } from '../../../../src/infrastructure/scanners/trivy-scanner';
import { DockerScanResult, ScanOptions } from '../../../../src/domain/types/docker';
import { CommandExecutor } from '../../../../src/infrastructure/command-executor';

// Mock CommandExecutor
// jest.mock('../../../../src/infrastructure/command-executor');

const mockCommandExecutor = {
  isAvailable: jest.fn(),
  getVersion: jest.fn(),
  execute: jest.fn()
} as unknown as CommandExecutor;

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as unknown as Logger;

describe('TrivyScanner', () => {
  let trivyScanner: TrivyScanner;
  let config: TrivyConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      scannerPath: 'trivy',
      cacheDir: '/tmp/trivy-cache',
      timeout: 300000,
      severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      ignoreUnfixed: false,
      skipUpdate: false
    };

    // Use the mock executor directly
    trivyScanner = new TrivyScanner(mockLogger, config, mockCommandExecutor);
  });

  describe('constructor', () => {
    test('should initialize with default configuration', () => {
      const scanner = new TrivyScanner(mockLogger);
      expect(scanner).toBeInstanceOf(TrivyScanner);
    });

    test('should initialize with custom configuration', () => {
      const customConfig: TrivyConfig = {
        scannerPath: '/usr/local/bin/trivy',
        cacheDir: '/custom/cache',
        timeout: 600000,
        severity: ['CRITICAL', 'HIGH'],
        ignoreUnfixed: true,
        skipUpdate: true
      };

      const scanner = new TrivyScanner(mockLogger, customConfig);
      expect(scanner).toBeInstanceOf(TrivyScanner);
    });
  });

  describe('initialize', () => {
    test('should initialize successfully', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'DB updated successfully',
        stderr: '',
        timedOut: false
      });

      const result = await trivyScanner.initialize();

      expect(result.ok).toBe(true);
      expect(mockCommandExecutor.isAvailable).toHaveBeenCalledWith('trivy');
      expect(mockCommandExecutor.getVersion).toHaveBeenCalledWith('trivy', 'version');
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'trivy',
        ['image', '--download-db-only'],
        { timeout: 120000 }
      );
      expect(mockLogger.info).toHaveBeenCalledWith({ version: '0.45.0' }, 'Trivy scanner initialized');
    });

    test('should fail when Trivy is not available', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(false);

      const result = await trivyScanner.initialize();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Trivy is not installed');
    });

    test('should handle version check failure', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockRejectedValue(new Error('Version check failed'));

      const result = await trivyScanner.initialize();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to initialize Trivy scanner');
    });

    test('should handle database update failure gracefully', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Failed to download DB',
        timedOut: false
      });

      const result = await trivyScanner.initialize();

      expect(result.ok).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { stderr: 'Failed to download DB' },
        'Failed to update Trivy database, continuing with existing database'
      );
    });

    test('should skip database update when configured', async () => {
      const configSkipUpdate: TrivyConfig = { ...config, skipUpdate: true };
      const scanner = new TrivyScanner(mockLogger, configSkipUpdate, mockCommandExecutor);

      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');

      const result = await scanner.initialize();

      expect(result.ok).toBe(true);
      expect(mockCommandExecutor.execute).not.toHaveBeenCalledWith(
        'trivy',
        ['image', '--download-db-only'],
        expect.any(Object)
      );
    });
  });

  describe('isAvailable', () => {
    test('should return true when initialized', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      });

      // Initialize first
      await trivyScanner.initialize();
      
      const available = await trivyScanner.isAvailable();
      expect(available).toBe(true);
    });

    test('should return false when initialization fails', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(false);

      const available = await trivyScanner.isAvailable();
      expect(available).toBe(false);
    });

    test('should attempt initialization if not already initialized', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      });

      const available = await trivyScanner.isAvailable();
      
      expect(available).toBe(true);
      expect(mockCommandExecutor.isAvailable).toHaveBeenCalled();
    });
  });

  describe('scan', () => {
    const image = 'nginx:latest';

    beforeEach(async () => {
      // Initialize scanner before each scan test
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      });
      await trivyScanner.initialize();
    });

    test('should scan image successfully', async () => {
      const mockTrivyOutput = {
        SchemaVersion: 2,
        ArtifactName: 'nginx:latest',
        ArtifactType: 'container_image',
        Metadata: {
          ImageConfig: {
            architecture: 'amd64',
            os: 'linux'
          },
          Size: 142000000
        },
        Results: [{
          Target: 'nginx:latest (debian 11.6)',
          Type: 'debian',
          Vulnerabilities: [{
            VulnerabilityID: 'CVE-2022-1234',
            PkgName: 'openssl',
            InstalledVersion: '1.1.1n',
            FixedVersion: '1.1.1o',
            Severity: 'HIGH',
            Description: 'Test vulnerability description',
            PrimaryURL: 'https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2022-1234',
            CVSS: {
              nvd: {
                V3Score: 7.5
              }
            }
          }]
        }]
      };

      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify(mockTrivyOutput),
        stderr: '',
        timedOut: false
      });

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(true);
      const scanResult = result.value;
      expect(scanResult.vulnerabilities).toHaveLength(1);
      expect(scanResult.vulnerabilities[0]).toMatchObject({
        id: 'CVE-2022-1234',
        severity: 'high',
        package: 'openssl',
        version: '1.1.1n',
        fixedVersion: '1.1.1o',
        score: 7.5
      });
      expect(scanResult.summary.high).toBe(1);
      expect(scanResult.summary.total).toBe(1);
    });

    test('should scan with custom options', async () => {
      const scanOptions: ScanOptions = {
        severity: ['CRITICAL', 'HIGH'],
        ignoreUnfixed: true
      };

      const mockTrivyOutput = {
        SchemaVersion: 2,
        ArtifactName: 'nginx:latest',
        ArtifactType: 'container_image',
        Results: []
      };

      // Reset the mock and set it up properly for this test
      mockCommandExecutor.execute.mockReset();
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify(mockTrivyOutput),
        stderr: '',
        timedOut: false
      });

      const result = await trivyScanner.scan(image, scanOptions);

      expect(result.ok).toBe(true);
      expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
        'trivy',
        expect.arrayContaining([
          'image',
          '--format', 'json',
          '--quiet',
          '--cache-dir', '/tmp/trivy-cache',
          '--severity', 'CRITICAL,HIGH',
          '--ignore-unfixed',
          'nginx:latest'
        ]),
        { timeout: 300000 }
      );
    });

    test('should handle scan timeout', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 124,
        stdout: '',
        stderr: 'Timeout',
        timedOut: true
      });

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Trivy scan timed out');
    });

    test('should handle scan failure', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'Image not found',
        timedOut: false
      });

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Trivy scan failed: Image not found');
    });

    test('should handle scan execution error', async () => {
      mockCommandExecutor.execute.mockRejectedValue(new Error('Execution failed'));

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Image scan failed: Execution failed');
    });

    test('should handle malformed Trivy output', async () => {
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: 'invalid json',
        stderr: '',
        timedOut: false
      });

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(true);
      const scanResult = result.value;
      expect(scanResult.vulnerabilities).toHaveLength(0);
      expect(scanResult.summary.total).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should initialize before scan if not initialized', async () => {
      // Create new scanner that's not initialized
      const newScanner = new TrivyScanner(mockLogger, config, mockCommandExecutor);
      
      // Setup mocks for initialization and scan
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute
        .mockResolvedValueOnce({ // For DB update during initialization
          exitCode: 0,
          stdout: 'DB updated successfully',
          stderr: '',
          timedOut: false
        })
        .mockResolvedValueOnce({ // For scan
          exitCode: 0,
          stdout: JSON.stringify({ Results: [] }),
          stderr: '',
          timedOut: false
        });

      const result = await newScanner.scan(image);

      expect(result.ok).toBe(true);
      expect(mockCommandExecutor.isAvailable).toHaveBeenCalled();
    });

    test('should fail scan if initialization fails', async () => {
      // Create new scanner that will fail initialization
      const newScanner = new TrivyScanner(mockLogger, config);
      
      mockCommandExecutor.isAvailable.mockResolvedValue(false);

      const result = await newScanner.scan(image);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Trivy is not installed');
    });

    test('should handle vulnerabilities with missing fields gracefully', async () => {
      const mockTrivyOutput = {
        Results: [{
          Vulnerabilities: [{
            VulnerabilityID: 'CVE-2022-5678',
            PkgName: 'test-package',
            InstalledVersion: '1.0.0',
            Severity: 'MEDIUM'
            // Missing optional fields: FixedVersion, Description, PrimaryURL, CVSS
          }]
        }]
      };

      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify(mockTrivyOutput),
        stderr: '',
        timedOut: false
      });

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(true);
      const scanResult = result.value;
      expect(scanResult.vulnerabilities).toHaveLength(1);
      expect(scanResult.vulnerabilities[0]).toMatchObject({
        id: 'CVE-2022-5678',
        severity: 'medium',
        package: 'test-package',
        version: '1.0.0'
      });
      expect(scanResult.vulnerabilities[0].fixedVersion).toBeUndefined();
      expect(scanResult.vulnerabilities[0].score).toBeUndefined();
    });

    test('should handle unknown severity levels', async () => {
      const mockTrivyOutput = {
        Results: [{
          Vulnerabilities: [{
            VulnerabilityID: 'CVE-2022-9999',
            PkgName: 'unknown-package',
            InstalledVersion: '1.0.0',
            Severity: 'UNKNOWN'
          }]
        }]
      };

      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify(mockTrivyOutput),
        stderr: '',
        timedOut: false
      });

      const result = await trivyScanner.scan(image);

      expect(result.ok).toBe(true);
      const scanResult = result.value;
      expect(scanResult.summary.unknown).toBe(1);
      expect(scanResult.summary.total).toBe(1);
    });
  });

  describe('getInfo', () => {
    test('should return scanner info when initialized', async () => {
      mockCommandExecutor.isAvailable.mockResolvedValue(true);
      mockCommandExecutor.getVersion.mockResolvedValue('0.45.0');
      mockCommandExecutor.execute.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false
      });

      await trivyScanner.initialize();
      const info = trivyScanner.getInfo();

      expect(info.available).toBe(true);
      expect(info.version).toBe('0.45.0');
    });

    test('should return unavailable info when not initialized', () => {
      const info = trivyScanner.getInfo();

      expect(info.available).toBe(false);
      expect(info.version).toBeNull();
    });
  });
});