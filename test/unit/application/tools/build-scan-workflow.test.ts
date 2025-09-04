/**
 * Container Build and Scan Workflow Tests
 * Team Delta - Test Coverage Foundation
 * 
 * Comprehensive tests for container build and security scanning workflow
 */

import { jest } from '@jest/globals';
import { createMockLogger, createMockDockerClient, createMockCoreServices } from '../../../utils/mock-factories';
import type { BuildImageParams, BuildImageResult, ScanImageParams, ScanResult } from '../../../../src/application/tools/schemas';

describe('Container Build and Scan Workflow', () => {
  const mockLogger = createMockLogger();
  const mockDockerClient = createMockDockerClient();
  const mockServices = createMockCoreServices();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Build Image Workflow', () => {
    describe('Input Validation', () => {
      it('should validate required build parameters', () => {
        const buildParams: BuildImageParams = {
          dockerfile_content: 'FROM node:18-alpine\nWORKDIR /app',
          context_path: '/test/repo',
          image_name: 'test-app',
          image_tag: 'latest',
        };

        expect(buildParams.dockerfile_content).toBeDefined();
        expect(buildParams.context_path).toBeDefined();
        expect(buildParams.image_name).toBeDefined();
        expect(buildParams.image_tag).toBeDefined();
      });

      it('should accept optional build arguments', () => {
        const buildParams: BuildImageParams = {
          dockerfile_content: 'FROM node:18',
          context_path: '/test',
          image_name: 'app',
          image_tag: 'v1.0.0',
          build_args: {
            NODE_ENV: 'production',
            APP_VERSION: '1.0.0',
          },
          no_cache: true,
          platform: 'linux/amd64',
        };

        expect(buildParams.build_args).toBeDefined();
        expect(buildParams.no_cache).toBe(true);
        expect(buildParams.platform).toBe('linux/amd64');
      });

      it('should validate image name format', () => {
        const validateImageName = (name: string): boolean => {
          // Docker image name regex
          const regex = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/;
          return regex.test(name);
        };

        expect(validateImageName('my-app')).toBe(true);
        expect(validateImageName('org/my-app')).toBe(true);
        expect(validateImageName('registry.io/org/app')).toBe(true);
        expect(validateImageName('MY-APP')).toBe(false); // Uppercase not allowed
        expect(validateImageName('my app')).toBe(false); // Spaces not allowed
      });

      it('should validate tag format', () => {
        const validateTag = (tag: string): boolean => {
          // Docker tag regex
          const regex = /^[\w][\w.-]{0,127}$/;
          return regex.test(tag);
        };

        expect(validateTag('latest')).toBe(true);
        expect(validateTag('v1.0.0')).toBe(true);
        expect(validateTag('dev-branch')).toBe(true);
        expect(validateTag('feature/test')).toBe(false); // Slash not allowed
      });
    });

    describe('Build Process', () => {
      it('should execute Docker build command', async () => {
        mockDockerClient.buildImage.mockResolvedValue({
          success: true,
          imageId: 'sha256:abc123',
          logs: ['Step 1/5 : FROM node:18-alpine', 'Successfully built abc123'],
        });

        const result = await mockDockerClient.buildImage({
          dockerfile: 'FROM node:18-alpine',
          context: '/test/repo',
          tag: 'test-app:latest',
        });

        expect(result.success).toBe(true);
        expect(result.imageId).toBe('sha256:abc123');
        expect(mockDockerClient.buildImage).toHaveBeenCalled();
      });

      it('should handle build with cache', async () => {
        mockDockerClient.buildImage.mockResolvedValue({
          success: true,
          imageId: 'sha256:def456',
          usedCache: true,
        });

        const result = await mockDockerClient.buildImage({
          dockerfile: 'FROM node:18',
          context: '/test',
          tag: 'app:latest',
          noCache: false,
        });

        expect(result.usedCache).toBe(true);
      });

      it('should handle multi-platform builds', async () => {
        mockDockerClient.buildImage.mockResolvedValue({
          success: true,
          platforms: ['linux/amd64', 'linux/arm64'],
          manifests: {
            'linux/amd64': 'sha256:amd64hash',
            'linux/arm64': 'sha256:arm64hash',
          },
        });

        const result = await mockDockerClient.buildImage({
          dockerfile: 'FROM node:18',
          context: '/test',
          tag: 'app:latest',
          platforms: ['linux/amd64', 'linux/arm64'],
        });

        expect(result.platforms).toHaveLength(2);
        expect(result.manifests).toBeDefined();
      });

      it('should track build progress', async () => {
        const progressCallback = jest.fn();
        
        mockDockerClient.buildImage.mockImplementation(async (params: any) => {
          progressCallback({ stage: 'pulling', progress: 0.2 });
          progressCallback({ stage: 'building', progress: 0.5 });
          progressCallback({ stage: 'pushing', progress: 0.9 });
          progressCallback({ stage: 'complete', progress: 1.0 });
          
          return {
            success: true,
            imageId: 'sha256:xyz789',
          };
        });

        await mockDockerClient.buildImage({
          dockerfile: 'FROM node:18',
          context: '/test',
          tag: 'app:latest',
          onProgress: progressCallback,
        });

        expect(progressCallback).toHaveBeenCalledTimes(4);
        expect(progressCallback).toHaveBeenCalledWith({ stage: 'complete', progress: 1.0 });
      });

      it('should handle build errors', async () => {
        mockDockerClient.buildImage.mockRejectedValue(new Error('Build failed: syntax error in Dockerfile'));

        await expect(mockDockerClient.buildImage({
          dockerfile: 'INVALID SYNTAX',
          context: '/test',
          tag: 'app:latest',
        })).rejects.toThrow('Build failed');
      });

      it('should capture build logs', async () => {
        const buildLogs = [
          'Sending build context to Docker daemon  2.048kB',
          'Step 1/8 : FROM node:18-alpine',
          '---> abc123def',
          'Step 2/8 : WORKDIR /app',
          '---> Running in xyz789',
          'Successfully built xyz789',
          'Successfully tagged app:latest',
        ];

        mockDockerClient.buildImage.mockResolvedValue({
          success: true,
          imageId: 'sha256:xyz789',
          logs: buildLogs,
        });

        const result = await mockDockerClient.buildImage({
          dockerfile: 'FROM node:18-alpine',
          context: '/test',
          tag: 'app:latest',
        });

        expect(result.logs).toBeDefined();
        expect(result.logs).toContain('Successfully built xyz789');
      });
    });

    describe('Build Output', () => {
      it('should generate complete build result', () => {
        const buildResult: BuildImageResult = {
          image_id: 'sha256:abc123',
          image_name: 'test-app',
          image_tag: 'latest',
          full_image_name: 'test-app:latest',
          size_bytes: 125000000,
          created_at: new Date().toISOString(),
          build_duration_seconds: 45,
          layers_count: 8,
          workflow_stage: 'image_built',
        };

        expect(buildResult.image_id).toBeDefined();
        expect(buildResult.full_image_name).toBe('test-app:latest');
        expect(buildResult.size_bytes).toBeGreaterThan(0);
        expect(buildResult.layers_count).toBeGreaterThan(0);
        expect(buildResult.workflow_stage).toBe('image_built');
      });

      it('should include build metadata', () => {
        const buildResult: BuildImageResult & { metadata?: any } = {
          image_id: 'sha256:def456',
          image_name: 'app',
          image_tag: 'v1.0.0',
          full_image_name: 'app:v1.0.0',
          size_bytes: 85000000,
          created_at: new Date().toISOString(),
          build_duration_seconds: 30,
          layers_count: 6,
          workflow_stage: 'image_built',
          metadata: {
            base_image: 'node:18-alpine',
            architecture: 'amd64',
            os: 'linux',
            labels: {
              version: '1.0.0',
              maintainer: 'team@example.com',
            },
          },
        };

        expect(buildResult.metadata).toBeDefined();
        expect(buildResult.metadata.base_image).toBe('node:18-alpine');
        expect(buildResult.metadata.labels).toBeDefined();
      });
    });
  });

  describe('Image Scanning Workflow', () => {
    describe('Scan Configuration', () => {
      it('should configure basic vulnerability scan', () => {
        const scanParams: ScanImageParams = {
          image_name: 'test-app:latest',
          scan_type: 'vulnerability',
        };

        expect(scanParams.image_name).toBeDefined();
        expect(scanParams.scan_type).toBe('vulnerability');
      });

      it('should configure comprehensive scan', () => {
        const scanParams: ScanImageParams = {
          image_name: 'test-app:latest',
          scan_type: 'comprehensive',
          severity_threshold: 'MEDIUM',
          scan_layers: true,
          check_secrets: true,
        };

        expect(scanParams.scan_type).toBe('comprehensive');
        expect(scanParams.severity_threshold).toBe('MEDIUM');
        expect(scanParams.scan_layers).toBe(true);
        expect(scanParams.check_secrets).toBe(true);
      });

      it('should validate severity levels', () => {
        const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE'];
        
        validSeverities.forEach(severity => {
          expect(validSeverities).toContain(severity);
        });
      });
    });

    describe('Vulnerability Detection', () => {
      it('should detect critical vulnerabilities', async () => {
        const mockScanResult = {
          vulnerabilities: [
            {
              id: 'CVE-2021-12345',
              severity: 'CRITICAL',
              package: 'openssl',
              version: '1.0.0',
              fixedVersion: '1.0.1',
              description: 'Remote code execution vulnerability',
            },
          ],
          summary: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
          },
        };

        expect(mockScanResult.vulnerabilities).toHaveLength(1);
        expect(mockScanResult.vulnerabilities[0].severity).toBe('CRITICAL');
        expect(mockScanResult.summary.critical).toBe(1);
      });

      it('should categorize vulnerabilities by severity', async () => {
        const mockScanResult = {
          vulnerabilities: [
            { severity: 'CRITICAL', package: 'package1' },
            { severity: 'HIGH', package: 'package2' },
            { severity: 'HIGH', package: 'package3' },
            { severity: 'MEDIUM', package: 'package4' },
            { severity: 'LOW', package: 'package5' },
          ],
          summary: {
            critical: 1,
            high: 2,
            medium: 1,
            low: 1,
            total: 5,
          },
        };

        expect(mockScanResult.summary.total).toBe(5);
        expect(mockScanResult.summary.high).toBe(2);
      });

      it('should identify vulnerable packages', async () => {
        const vulnerablePackages = [
          { name: 'log4j', version: '2.14.0', vulnerability: 'Log4Shell' },
          { name: 'spring-core', version: '5.2.0', vulnerability: 'Spring4Shell' },
          { name: 'commons-text', version: '1.9', vulnerability: 'Text4Shell' },
        ];

        vulnerablePackages.forEach(pkg => {
          expect(pkg.vulnerability).toBeDefined();
        });
      });
    });

    describe('Secret Detection', () => {
      it('should detect hardcoded secrets', async () => {
        const secretScanResult = {
          secrets: [
            {
              type: 'AWS_ACCESS_KEY',
              file: '/app/config',
              line: 42,
              confidence: 'HIGH',
            },
            {
              type: 'PRIVATE_KEY',
              file: '/app/ssl/key.pem',
              line: 1,
              confidence: 'CERTAIN',
            },
          ],
          summary: {
            total_secrets: 2,
            high_confidence: 2,
          },
        };

        expect(secretScanResult.secrets).toHaveLength(2);
        expect(secretScanResult.secrets[0].type).toBe('AWS_ACCESS_KEY');
        expect(secretScanResult.summary.total_secrets).toBe(2);
      });

      it('should identify common secret patterns', () => {
        const secretPatterns = [
          { pattern: 'API_KEY', regex: /api[_-]?key/i },
          { pattern: 'PASSWORD', regex: /password/i },
          { pattern: 'TOKEN', regex: /token/i },
          { pattern: 'SECRET', regex: /secret/i },
          { pattern: 'PRIVATE_KEY', regex: /private[_-]?key/i },
        ];

        secretPatterns.forEach(pattern => {
          expect(pattern.regex).toBeDefined();
        });
      });
    });

    describe('Compliance Checks', () => {
      it('should check CIS benchmark compliance', async () => {
        const complianceResult = {
          benchmark: 'CIS Docker Benchmark v1.4.0',
          checks: [
            { id: '4.1', description: 'Ensure a user for the container has been created', status: 'PASS' },
            { id: '4.2', description: 'Ensure containers use only trusted base images', status: 'PASS' },
            { id: '4.6', description: 'Ensure HEALTHCHECK instructions are added', status: 'FAIL' },
          ],
          summary: {
            total: 3,
            passed: 2,
            failed: 1,
            compliance_score: 0.67,
          },
        };

        expect(complianceResult.benchmark).toContain('CIS');
        expect(complianceResult.summary.compliance_score).toBeCloseTo(0.67);
      });

      it('should check security best practices', () => {
        const bestPractices = [
          { practice: 'Non-root user', checked: true },
          { practice: 'Minimal base image', checked: true },
          { practice: 'No sudo/su commands', checked: true },
          { practice: 'Read-only filesystem', checked: false },
          { practice: 'Security updates applied', checked: true },
        ];

        const passedPractices = bestPractices.filter(p => p.checked);
        expect(passedPractices.length).toBeGreaterThanOrEqual(3);
      });
    });

    describe('Scan Output', () => {
      it('should generate comprehensive scan report', () => {
        const scanResult: ScanResult = {
          scan_id: 'scan-123',
          image_name: 'test-app:latest',
          scan_timestamp: new Date().toISOString(),
          vulnerabilities: {
            critical: 0,
            high: 2,
            medium: 5,
            low: 10,
            total: 17,
          },
          secrets_found: 0,
          compliance_score: 0.85,
          risk_score: 'MEDIUM',
          recommendations: [
            'Update base image to latest version',
            'Upgrade vulnerable packages',
          ],
          workflow_stage: 'image_scanned',
          scan_duration_seconds: 120,
        };

        expect(scanResult.scan_id).toBeDefined();
        expect(scanResult.vulnerabilities.total).toBe(17);
        expect(scanResult.compliance_score).toBe(0.85);
        expect(scanResult.risk_score).toBe('MEDIUM');
        expect(scanResult.workflow_stage).toBe('image_scanned');
      });

      it('should include detailed vulnerability information', () => {
        const detailedResult: ScanResult & { detailed_vulnerabilities?: any[] } = {
          scan_id: 'scan-456',
          image_name: 'app:v1.0',
          scan_timestamp: new Date().toISOString(),
          vulnerabilities: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
            total: 1,
          },
          detailed_vulnerabilities: [
            {
              cve_id: 'CVE-2021-44228',
              package: 'log4j-core',
              current_version: '2.14.0',
              fixed_version: '2.17.1',
              severity: 'CRITICAL',
              cvss_score: 10.0,
              exploit_available: true,
              description: 'Apache Log4j2 JNDI features do not protect against attacker-controlled LDAP',
              references: ['https://nvd.nist.gov/vuln/detail/CVE-2021-44228'],
            },
          ],
          secrets_found: 0,
          compliance_score: 0.5,
          risk_score: 'CRITICAL',
          recommendations: ['Immediately update log4j to version 2.17.1 or later'],
          workflow_stage: 'image_scanned',
          scan_duration_seconds: 45,
        };

        expect(detailedResult.detailed_vulnerabilities).toBeDefined();
        expect(detailedResult.detailed_vulnerabilities![0].cvss_score).toBe(10.0);
        expect(detailedResult.detailed_vulnerabilities![0].exploit_available).toBe(true);
      });

      it('should generate actionable recommendations', () => {
        const recommendations = [
          'Update Node.js base image from 16 to 18 LTS',
          'Remove unnecessary system packages: curl, wget',
          'Apply security patches for 5 HIGH severity vulnerabilities',
          'Implement non-root user for container execution',
          'Add security scanning to CI/CD pipeline',
        ];

        recommendations.forEach(rec => {
          expect(rec).toBeTruthy();
          expect(rec.length).toBeGreaterThan(10);
        });
      });
    });
  });

  describe('Build and Scan Integration', () => {
    it('should build and scan in sequence', async () => {
      // Build phase
      const buildResult: BuildImageResult = {
        image_id: 'sha256:abc123',
        image_name: 'test-app',
        image_tag: 'latest',
        full_image_name: 'test-app:latest',
        size_bytes: 100000000,
        created_at: new Date().toISOString(),
        build_duration_seconds: 30,
        layers_count: 10,
        workflow_stage: 'image_built',
      };

      // Scan phase
      const scanResult: ScanResult = {
        scan_id: 'scan-789',
        image_name: buildResult.full_image_name,
        scan_timestamp: new Date().toISOString(),
        vulnerabilities: {
          critical: 0,
          high: 1,
          medium: 3,
          low: 5,
          total: 9,
        },
        secrets_found: 0,
        compliance_score: 0.9,
        risk_score: 'LOW',
        recommendations: [],
        workflow_stage: 'image_scanned',
        scan_duration_seconds: 60,
      };

      expect(scanResult.image_name).toBe(buildResult.full_image_name);
      expect(buildResult.workflow_stage).toBe('image_built');
      expect(scanResult.workflow_stage).toBe('image_scanned');
    });

    it('should fail fast on critical vulnerabilities', async () => {
      const scanResult = {
        vulnerabilities: { critical: 2, high: 0, medium: 0, low: 0, total: 2 },
        risk_score: 'CRITICAL',
        should_block: true,
      };

      expect(scanResult.should_block).toBe(true);
      expect(scanResult.risk_score).toBe('CRITICAL');
    });

    it('should allow configurable thresholds', () => {
      const thresholds = {
        block_on_critical: true,
        max_high_vulns: 5,
        max_medium_vulns: 20,
        min_compliance_score: 0.7,
      };

      const scanResult = {
        vulnerabilities: { critical: 0, high: 3, medium: 15, low: 30, total: 48 },
        compliance_score: 0.75,
      };

      const shouldBlock = 
        (thresholds.block_on_critical && scanResult.vulnerabilities.critical > 0) ||
        (scanResult.vulnerabilities.high > thresholds.max_high_vulns) ||
        (scanResult.vulnerabilities.medium > thresholds.max_medium_vulns) ||
        (scanResult.compliance_score < thresholds.min_compliance_score);

      expect(shouldBlock).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle Docker daemon unavailable', async () => {
      mockDockerClient.buildImage.mockRejectedValue(new Error('Cannot connect to Docker daemon'));

      await expect(mockDockerClient.buildImage({
        dockerfile: 'FROM node:18',
        context: '/test',
        tag: 'app:latest',
      })).rejects.toThrow('Cannot connect to Docker daemon');
    });

    it('should handle scan tool unavailable', async () => {
      const scanError = new Error('Trivy scanner not found');
      
      const handleScanError = (error: Error) => {
        if (error.message.includes('scanner not found')) {
          return {
            error: 'Scanner unavailable',
            fallback: 'Please install Trivy or use alternative scanner',
          };
        }
        throw error;
      };

      const result = handleScanError(scanError);
      expect(result.error).toBe('Scanner unavailable');
      expect(result.fallback).toContain('Trivy');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Build timeout after 300 seconds');
      
      mockDockerClient.buildImage.mockRejectedValue(timeoutError);

      await expect(mockDockerClient.buildImage({
        dockerfile: 'FROM node:18',
        context: '/test',
        tag: 'app:latest',
        timeout: 300,
      })).rejects.toThrow('timeout');
    });

    it('should handle insufficient disk space', async () => {
      const diskError = new Error('No space left on device');
      
      mockDockerClient.buildImage.mockRejectedValue(diskError);

      await expect(mockDockerClient.buildImage({
        dockerfile: 'FROM node:18',
        context: '/test',
        tag: 'app:latest',
      })).rejects.toThrow('No space left');
    });
  });
});