/**
 * ESM-compatible mock for Trivy Scanner
 */

import { jest } from '@jest/globals';

export const mockTrivyScanner = {
  initialize: jest.fn().mockResolvedValue({ ok: true }),
  scan: jest.fn().mockResolvedValue({
    Results: [
      {
        Target: 'mock-image:latest',
        Type: 'container',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2021-12345',
            PkgName: 'openssl',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
            Severity: 'HIGH',
            Description: 'Mock vulnerability',
            References: ['https://cve.example.com/CVE-2021-12345']
          }
        ]
      }
    ],
    SchemaVersion: 2,
    ArtifactName: 'mock-image:latest',
    ArtifactType: 'container_image',
    Metadata: {
      ImageID: 'sha256:mock-image-id',
      DiffIDs: ['sha256:diff1', 'sha256:diff2'],
      ImageConfig: {}
    }
  }),
  isAvailable: jest.fn().mockReturnValue(true),
  scanImage: jest.fn().mockResolvedValue({
    vulnerabilities: [
      {
        id: 'CVE-2021-12345',
        severity: 'HIGH',
        package: 'openssl',
        version: '1.0.0',
        fixedVersion: '1.0.1',
        description: 'Mock vulnerability'
      }
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      unknown: 0
    }
  }),
  getVersion: jest.fn().mockResolvedValue('0.45.0'),
  checkInstallation: jest.fn().mockResolvedValue(true),
  
  // Error scenarios
  simulateNotInstalled: jest.fn(() => {
    mockTrivyScanner.isAvailable.mockReturnValue(false);
    mockTrivyScanner.checkInstallation.mockResolvedValue(false);
    mockTrivyScanner.initialize.mockRejectedValue(
      new Error('Trivy is not installed. Please install Trivy to enable vulnerability scanning.')
    );
  }),
  
  simulateScanError: jest.fn(() => {
    mockTrivyScanner.scan.mockRejectedValue(new Error('Scan failed'));
    mockTrivyScanner.scanImage.mockRejectedValue(new Error('Scan failed'));
  }),
  
  simulateCleanScan: jest.fn(() => {
    mockTrivyScanner.scan.mockResolvedValue({
      Results: [],
      SchemaVersion: 2,
      ArtifactName: 'mock-image:latest',
      ArtifactType: 'container_image'
    });
    mockTrivyScanner.scanImage.mockResolvedValue({
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0
      }
    });
  })
};

// Setup function for tests
export function setupTrivyMocks() {
  // Reset all mocks
  Object.values(mockTrivyScanner).forEach(mock => {
    if (typeof mock === 'function' && typeof mock.mockReset === 'function') {
      mock.mockReset();
    }
  });
  
  // Restore default behaviors
  mockTrivyScanner.initialize.mockResolvedValue({ ok: true });
  mockTrivyScanner.isAvailable.mockReturnValue(true);
  mockTrivyScanner.checkInstallation.mockResolvedValue(true);
  mockTrivyScanner.getVersion.mockResolvedValue('0.45.0');
  
  // Default scan result with one vulnerability
  const defaultScanResult = {
    Results: [
      {
        Target: 'mock-image:latest',
        Type: 'container',
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-2021-12345',
            PkgName: 'openssl',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
            Severity: 'HIGH',
            Description: 'Mock vulnerability',
            References: ['https://cve.example.com/CVE-2021-12345']
          }
        ]
      }
    ],
    SchemaVersion: 2,
    ArtifactName: 'mock-image:latest',
    ArtifactType: 'container_image',
    Metadata: {
      ImageID: 'sha256:mock-image-id',
      DiffIDs: ['sha256:diff1', 'sha256:diff2'],
      ImageConfig: {}
    }
  };
  
  mockTrivyScanner.scan.mockResolvedValue(defaultScanResult);
  
  mockTrivyScanner.scanImage.mockResolvedValue({
    vulnerabilities: [
      {
        id: 'CVE-2021-12345',
        severity: 'HIGH',
        package: 'openssl',
        version: '1.0.0',
        fixedVersion: '1.0.1',
        description: 'Mock vulnerability'
      }
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      unknown: 0
    }
  });
}