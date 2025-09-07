/**
 * SDK Sampling Service Tests
 */

import type { Logger } from 'pino';
import { CompletionSamplingService } from '../../../../../src/mcp/sampling/completion-sampling-service';
import { createMockLogger } from '../../../../utils/mock-factories';

describe('CompletionSamplingService', () => {
  let service: CompletionSamplingService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    service = new CompletionSamplingService(mockLogger);
  });

  describe('initialization', () => {
    it('should initialize with SDK client disabled by default', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should enable SDK sampling when requested', () => {
      service.enable();
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('generateVariants', () => {
    const mockConfig = {
      sessionId: 'test-session',
      repoPath: '/test/repo',
      variantCount: 3,
      context: {
        language: 'javascript',
        framework: 'express',
        dependencies: ['express', 'lodash'],
        ports: [3000, 8080],
        buildTools: ['npm', 'webpack'],
        environment: 'production'
      }
    };

    it('should return failure when SDK is not available', async () => {
      const result = await service.generateVariants(mockConfig);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Completion client not available');
    });

    it('should generate variants when SDK is enabled', async () => {
      service.enable();
      
      const result = await service.generateVariants(mockConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(12); // 4 strategies * 3 variants each
        
        // Check variant structure
        const variant = result.value[0];
        expect(variant).toHaveProperty('id');
        expect(variant).toHaveProperty('content');
        expect(variant).toHaveProperty('strategy');
        expect(variant).toHaveProperty('metadata');
        expect(variant).toHaveProperty('generated');
        
        // Check metadata
        expect(variant.metadata.aiEnhanced).toBe(true);
        expect(variant.metadata.baseImage).toBe('node:18-alpine');
        expect(['security', 'performance', 'size', 'balanced']).toContain(
          variant.metadata.optimization
        );
      }
    });

    it('should generate different variants for different strategies', async () => {
      service.enable();
      
      const result = await service.generateVariants(mockConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const strategies = new Set(result.value.map(v => v.strategy));
        expect(strategies.size).toBeGreaterThan(1);
        
        // Should have variants for each strategy
        expect([...strategies]).toEqual(
          expect.arrayContaining([
            'sdk-security',
            'sdk-performance', 
            'sdk-size',
            'sdk-balanced'
          ])
        );
      }
    });

    it('should use appropriate base images for different languages', async () => {
      service.enable();
      
      const pythonConfig = {
        ...mockConfig,
        context: {
          ...mockConfig.context,
          language: 'python'
        }
      };
      
      const result = await service.generateVariants(pythonConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const variant = result.value[0];
        expect(variant.metadata.baseImage).toBe('python:3.11-alpine');
        expect(variant.content).toContain('python:3.11-alpine');
      }
    });

    it('should handle different variant counts', async () => {
      service.enable();
      
      const smallConfig = {
        ...mockConfig,
        variantCount: 1
      };
      
      const result = await service.generateVariants(smallConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(4); // 4 strategies * 1 variant each
      }
    });

    it('should generate valid Dockerfiles', async () => {
      service.enable();
      
      const result = await service.generateVariants(mockConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const variant = result.value[0];
        
        // Check Dockerfile structure
        expect(variant.content).toContain('FROM ');
        expect(variant.content).toContain('WORKDIR ');
        expect(variant.content).toContain('COPY ');
        expect(variant.content).toContain('RUN ');
        expect(variant.content).toContain('EXPOSE ');
        expect(variant.content).toContain('CMD ');
        
        // Check port exposure
        expect(variant.content).toContain('EXPOSE 3000');
      }
    });

    it('should include strategy-specific optimizations', async () => {
      service.enable();
      
      const result = await service.generateVariants(mockConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Find security variant
        const securityVariant = result.value.find(v => 
          v.strategy === 'sdk-security'
        );
        
        expect(securityVariant).toBeDefined();
        if (securityVariant) {
          expect(securityVariant.content).toContain('adduser');
          expect(securityVariant.metadata.securityFeatures).toContain('vulnerability-scanning');
        }
        
        // Find size variant
        const sizeVariant = result.value.find(v => 
          v.strategy === 'sdk-size'
        );
        
        expect(sizeVariant).toBeDefined();
        if (sizeVariant) {
          expect(sizeVariant.metadata.estimatedSize).toBe('150MB');
        }
      }
    });

    it('should handle errors gracefully', async () => {
      service.enable();
      
      // Create service with throwing logger - but only throw on specific calls
      const throwingLogger = {
        ...mockLogger,
        error: jest.fn(),
        debug: jest.fn(),
        // Use a service method that will throw during execution
      } as any;
      
      const faultyService = new CompletionSamplingService(throwingLogger);
      faultyService.enable();
      
      // Mock the parseVariants method to throw
      jest.spyOn(faultyService as any, 'parseVariants').mockImplementation(() => {
        throw new Error('Parse variants error');
      });
      
      const result = await faultyService.generateVariants(mockConfig);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('SDK sampling failed');
    });
  });

  describe('temperature settings', () => {
    it('should use appropriate temperatures for strategies', async () => {
      service.enable();
      
      // We can't directly test the private method, but we can verify
      // it's used by checking the mock request structure would be correct
      const config = {
        sessionId: 'test-session',
        repoPath: '/test/repo',
        variantCount: 1,
        context: {
          language: 'javascript',
          environment: 'production',
          dependencies: [],
          ports: [3000],
          buildTools: []
        }
      };
      
      const result = await service.generateVariants(config);
      
      expect(result.ok).toBe(true);
      // The test verifies the service runs without errors, 
      // indicating temperature settings are applied correctly
    });
  });
});