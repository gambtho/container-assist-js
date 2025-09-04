/**
 * Domain Types Index Tests
 * 
 * Tests the domain types module exports and integration
 */

import * as DomainTypes from '../../../src/domain/types/index';

describe('Domain Types Index', () => {
  describe('Result Types', () => {
    it('should export result monad functions', () => {
      expect(typeof DomainTypes.ok).toBe('function');
      expect(typeof DomainTypes.fail).toBe('function');
      expect(typeof DomainTypes.isOk).toBe('function');
      expect(typeof DomainTypes.isFail).toBe('function');
    });

    it('should export legacy aliases', () => {
      expect(typeof DomainTypes.Success).toBe('function');
      expect(typeof DomainTypes.Failure).toBe('function');
      expect(DomainTypes.Success).toBe(DomainTypes.ok);
      expect(DomainTypes.Failure).toBe(DomainTypes.fail);
    });

    it('should work with result monad pattern', () => {
      const successResult = DomainTypes.ok('test');
      const failResult = DomainTypes.fail('error');

      expect(DomainTypes.isOk(successResult)).toBe(true);
      expect(DomainTypes.isFail(failResult)).toBe(true);

      // Basic result handling
      if (DomainTypes.isOk(successResult)) {
        expect(successResult.value).toBe('test');
      }
      if (DomainTypes.isFail(failResult)) {
        expect(failResult.error).toBe('error');
      }
    });
  });

  describe('Error Types', () => {
    it('should export error handling types', () => {
      expect(DomainTypes.ErrorCode).toBeDefined();
      expect(DomainTypes.DomainError).toBeDefined();
      expect(DomainTypes.InfrastructureError).toBeDefined();
      expect(DomainTypes.ServiceError).toBeDefined();
    });

    it('should work with error codes', () => {
      // ErrorCode should be an object with error code constants
      expect(typeof DomainTypes.ErrorCode).toBe('object');
    });
  });

  describe('Base Image Types', () => {
    it('should export base image schemas', () => {
      expect(DomainTypes.BaseImageRecommendationSchema).toBeDefined();
      expect(DomainTypes.BaseImageResolutionInputSchema).toBeDefined();
    });

    it('should validate base image recommendation', () => {
      const recommendation = {
        primary_recommendation: {
          image: 'node:18-alpine',
          reasoning: 'Lightweight and secure',
          security_notes: 'Minimal attack surface',
          performance_notes: 'Fast startup time',
          tradeoffs: 'Limited package availability',
        },
        alternatives: [
          {
            image: 'node:18-slim',
            use_case: 'When alpine compatibility is an issue',
            pros: ['Better compatibility'],
            cons: ['Larger size'],
          },
        ],
        security_considerations: {
          vulnerability_status: 'Low',
          update_frequency: 'Regular',
          compliance: 'Meets standard requirements',
        },
        optimization_tips: ['Use multi-stage builds', 'Minimize layers'],
        health_check_recommendation: {
          endpoint: '/health',
          command: 'curl -f http://localhost:3000/health',
        },
      };

      const result = DomainTypes.BaseImageRecommendationSchema.safeParse(recommendation);
      expect(result.success).toBe(true);
    });

    it('should validate base image resolution input', () => {
      const input = {
        session_id: 'test-session-123',
        security_level: 'hardened' as const,
        performance_priority: 'speed' as const,
        target_environment: 'cloud' as const,
        architectures: ['amd64', 'arm64'],
        compliance_requirements: 'SOC2 Type II',
      };

      const result = DomainTypes.BaseImageResolutionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Type Integration', () => {
    it('should work with results and errors', () => {
      // Test success case
      const successResult = DomainTypes.ok({ data: 'test' });
      expect(DomainTypes.isOk(successResult)).toBe(true);
      
      if (DomainTypes.isOk(successResult)) {
        expect(successResult.value.data).toBe('test');
      }

      // Test failure case
      const failResult = DomainTypes.fail('Something went wrong');
      expect(DomainTypes.isFail(failResult)).toBe(true);
      
      if (DomainTypes.isFail(failResult)) {
        expect(failResult.error).toBe('Something went wrong');
      }
    });

    it('should handle base image workflows', () => {
      const input = {
        session_id: 'python-workflow-123',
        security_level: 'standard' as const,
        performance_priority: 'size' as const,
        target_environment: 'cloud' as const,
      };

      // Validate input
      const inputValidation = DomainTypes.BaseImageResolutionInputSchema.safeParse(input);
      expect(inputValidation.success).toBe(true);

      // Create recommendation result with proper schema
      const recommendation = {
        primary_recommendation: {
          image: 'python:3.9-slim',
          reasoning: 'Official image with minimal footprint',
          security_notes: 'Regularly updated, minimal packages',
          performance_notes: 'Fast startup, low memory usage',
          tradeoffs: 'Limited debugging tools',
        },
        alternatives: [],
        security_considerations: {
          vulnerability_status: 'Low',
          update_frequency: 'Weekly',
          compliance: 'Standard compliance met',
        },
        optimization_tips: ['Use multi-stage builds'],
        health_check_recommendation: {
          endpoint: '/ping',
          command: 'python -c "import sys; sys.exit(0)"',
        },
      };

      const recValidation = DomainTypes.BaseImageRecommendationSchema.safeParse(recommendation);
      expect(recValidation.success).toBe(true);

      // Wrap in result pattern
      const result = DomainTypes.ok(recommendation);
      expect(DomainTypes.isOk(result)).toBe(true);
    });
  });

  describe('Available Exports Verification', () => {
    it('should export all documented types and functions', () => {
      // Core result functions
      expect(DomainTypes.ok).toBeDefined();
      expect(DomainTypes.fail).toBeDefined();
      expect(DomainTypes.isOk).toBeDefined();
      expect(DomainTypes.isFail).toBeDefined();
      expect(DomainTypes.Success).toBeDefined();
      expect(DomainTypes.Failure).toBeDefined();

      // Error types
      expect(DomainTypes.ErrorCode).toBeDefined();
      expect(DomainTypes.DomainError).toBeDefined();
      expect(DomainTypes.InfrastructureError).toBeDefined();
      expect(DomainTypes.ServiceError).toBeDefined();

      // Base image schemas
      expect(DomainTypes.BaseImageRecommendationSchema).toBeDefined();
      expect(DomainTypes.BaseImageResolutionInputSchema).toBeDefined();
    });
  });
});