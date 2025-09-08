/**
 * Sampler Tests - Modern sampling service
 */

import type { Logger } from 'pino';
import { Sampler } from '../../../../../src/mcp/sampling/sampler';
import { MCPClient } from '../../../../../src/mcp/client/mcp-client';
import { createMockLogger } from '../../../../utils/mock-factories';
import { Success, Failure } from '@types';

// Mock the MCPClient module
jest.mock('../../../../../src/mcp/client/mcp-client');

describe('Sampler', () => {
  let service: Sampler;
  let mockLogger: Logger;
  let mockMCPClient: jest.Mocked<MCPClient>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    
    // Reset the mock
    jest.clearAllMocks();
    
    // Create a mock instance
    mockMCPClient = {
      isConnected: jest.fn().mockReturnValue(false),
      initialize: jest.fn().mockResolvedValue(Success(undefined)),
      complete: jest.fn(),
      completeBatch: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    
    // Mock both the constructor AND the static createWithStdio method
    (MCPClient as jest.MockedClass<typeof MCPClient>).mockImplementation(() => mockMCPClient);
    (MCPClient as any).createWithStdio = jest.fn().mockReturnValue(mockMCPClient);
    
    service = new Sampler(mockLogger, {
      preferredTransport: 'completion',
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const result = await service.initialize();
      expect(result.ok).toBe(true);
    });
  });

  describe('sampleDockerfileStrategies', () => {
    const mockConfig = {
      sessionId: 'test-session',
      context: {
        language: 'javascript',
        framework: 'express',
        dependencies: ['express', 'lodash'],
        ports: [3000, 8080],
        buildTools: ['npm', 'webpack'],
        environment: 'production'
      },
      variantCount: 1,
      strategies: ['security', 'performance', 'size', 'balanced'] as any[]
    };

    const createMockDockerfile = (strategy: string): string => {
      return `# Mock Dockerfile for ${strategy} strategy
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
${strategy === 'security' ? 'RUN adduser -D app\nUSER app' : ''}
EXPOSE 3000
CMD ["npm", "start"]`;
    };

    it('should handle initialization failure', async () => {
      mockMCPClient.initialize.mockResolvedValue(Failure('Connection failed'));
      
      const prompt = 'Generate production-ready Dockerfiles';
      const result = await service.sampleDockerfileStrategies(prompt, mockConfig);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('No strategy variants generated');
    });

    it('should generate variants when available', async () => {
      // Set up mock - after initialization, isConnected returns true
      let initialized = false;
      mockMCPClient.isConnected.mockImplementation(() => initialized);
      mockMCPClient.initialize.mockImplementation(async () => {
        initialized = true;
        return Success(undefined);
      });
      
      // Mock successful completeBatch for strategies
      mockMCPClient.completeBatch.mockImplementation(async (prompt, samples, params) => {
        const results = Array(samples).fill(createMockDockerfile('balanced'));
        return Success(results);
      });
      
      // Also mock complete for fallback
      mockMCPClient.complete.mockImplementation(async (prompt, options) => {
        return Success(createMockDockerfile('balanced'));
      });
      
      // Initialize the service first
      await service.initialize();
      
      const prompt = 'Generate production-ready Dockerfiles';
      const result = await service.sampleDockerfileStrategies(prompt, mockConfig);
      
      if (!result.ok) {
        console.error('Test failed with error:', result.error);
      }
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.variants).toHaveLength(4); // 4 strategies x 1 variant each
        
        // Check variant structure
        const variant = result.value.variants[0];
        expect(variant).toHaveProperty('id');
        expect(variant).toHaveProperty('content');
        expect(variant).toHaveProperty('strategy');
        expect(variant).toHaveProperty('metadata');
        expect(variant).toHaveProperty('generated');
        
        // Check metadata
        expect(variant.metadata.aiEnhanced).toBe(true);
      }
    });

    it('should handle all strategies failing', async () => {
      mockMCPClient.isConnected.mockReturnValue(true);
      mockMCPClient.completeBatch.mockResolvedValue(Failure('All completions failed'));
      
      const prompt = 'Generate production-ready Dockerfiles';
      const result = await service.sampleDockerfileStrategies(prompt, mockConfig);
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('No strategy variants generated');
    });

    it.skip('should generate different variants for different strategies', async () => {
      mockMCPClient.isConnected.mockReturnValue(true);
      
      mockMCPClient.completeBatch.mockImplementation(async (prompt, samples, params) => {
        const strategy = (params as any)?.strategy || 'balanced';
        const results = Array(samples).fill(createMockDockerfile(strategy));
        return Success(results);
      });
      
      // Initialize the service first
      await service.initialize();
      
      const prompt = 'Generate production-ready Dockerfiles';
      const result = await service.sampleDockerfileStrategies(prompt, mockConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const strategies = new Set(result.value.variants.map(v => v.strategy));
        expect(strategies.size).toBe(4);
        
        // Should have variants for each strategy
        expect([...strategies]).toEqual(
          expect.arrayContaining([
            'unified-security',
            'unified-performance', 
            'unified-size',
            'unified-balanced'
          ])
        );
      }
    });

    it.skip('should generate valid Dockerfiles', async () => {
      mockMCPClient.isConnected.mockReturnValue(true);
      
      mockMCPClient.completeBatch.mockImplementation(async (prompt, samples, params) => {
        const strategy = (params as any)?.strategy || 'balanced';
        const results = Array(samples).fill(createMockDockerfile(strategy));
        return Success(results);
      });
      
      // Initialize the service first
      await service.initialize();
      
      const prompt = 'Generate production-ready Dockerfiles';
      const result = await service.sampleDockerfileStrategies(prompt, mockConfig);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const variant = result.value.variants[0];
        
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
  });

  describe('availability', () => {
    it('should check availability correctly', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await service.cleanup();
      expect(mockMCPClient.disconnect).toHaveBeenCalled();
    });
  });
});