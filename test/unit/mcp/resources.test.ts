import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ContainerizationResourceManager } from '../../../src/mcp/resources/containerization-resource-manager';
import { McpResourceManager } from '../../../src/mcp/resources/manager';
import type { Logger } from 'pino';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger)
} as any;

describe('MCP Resources', () => {
  let mockBaseResourceManager: jest.Mocked<McpResourceManager>;
  let containerizationResourceManager: ContainerizationResourceManager;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBaseResourceManager = {
      listResources: jest.fn(),
      readResource: jest.fn(),
      writeResource: jest.fn(),
      deleteResource: jest.fn(),
      resourceExists: jest.fn(),
      getResourceMetadata: jest.fn(),
      clearCache: jest.fn(),
      getStats: jest.fn()
    } as any;

    containerizationResourceManager = new ContainerizationResourceManager(mockBaseResourceManager, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ContainerizationResourceManager', () => {
    describe('listResources', () => {
      it('should return containerization-specific resources', async () => {
        const mockResources = [
          {
            uri: 'dockerfile://current',
            name: 'Current Dockerfile',
            description: 'Current Dockerfile content',
            mimeType: 'text/plain'
          },
          {
            uri: 'analysis://latest',
            name: 'Latest Analysis',
            description: 'Repository analysis results',
            mimeType: 'application/json'
          },
          {
            uri: 'build-log://last',
            name: 'Last Build Log',
            description: 'Most recent build log',
            mimeType: 'text/plain'
          }
        ];

        mockBaseResourceManager.listResources.mockResolvedValue(mockResources);

        const result = await containerizationResourceManager.listResources();

        expect(result).toEqual(mockResources);
        expect(mockBaseResourceManager.listResources).toHaveBeenCalled();
      });

      it('should handle empty resource list', async () => {
        mockBaseResourceManager.listResources.mockResolvedValue([]);

        const result = await containerizationResourceManager.listResources();

        expect(result).toEqual([]);
        expect(mockBaseResourceManager.listResources).toHaveBeenCalled();
      });

      it('should handle resource listing errors', async () => {
        const error = new Error('Failed to list resources');
        mockBaseResourceManager.listResources.mockRejectedValue(error);

        await expect(containerizationResourceManager.listResources()).rejects.toThrow('Failed to list resources');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error },
          'Failed to list containerization resources'
        );
      });
    });

    describe('readResource', () => {
      it('should read dockerfile resource', async () => {
        const dockerfileContent = 'FROM node:16\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["npm", "start"]';
        mockBaseResourceManager.readResource.mockResolvedValue({
          uri: 'dockerfile://current',
          contents: [
            {
              type: 'text',
              text: dockerfileContent
            }
          ]
        });

        const result = await containerizationResourceManager.readResource('dockerfile://current');

        expect(result).toEqual({
          uri: 'dockerfile://current',
          contents: [
            {
              type: 'text',
              text: dockerfileContent
            }
          ]
        });
        expect(mockBaseResourceManager.readResource).toHaveBeenCalledWith('dockerfile://current');
      });

      it('should read analysis resource', async () => {
        const analysisData = {
          language: 'nodejs',
          packageManager: 'npm',
          dependencies: ['express', 'react'],
          hasDockerfile: false
        };

        mockBaseResourceManager.readResource.mockResolvedValue({
          uri: 'analysis://latest',
          contents: [
            {
              type: 'text',
              text: JSON.stringify(analysisData, null, 2)
            }
          ]
        });

        const result = await containerizationResourceManager.readResource('analysis://latest');

        expect(result).toEqual({
          uri: 'analysis://latest',
          contents: [
            {
              type: 'text',
              text: JSON.stringify(analysisData, null, 2)
            }
          ]
        });
        expect(mockBaseResourceManager.readResource).toHaveBeenCalledWith('analysis://latest');
      });

      it('should read build log resource', async () => {
        const buildLog = 'Step 1/5 : FROM node:16\n ---> 123abc\nStep 2/5 : WORKDIR /app\n ---> 456def\nBuild completed successfully';

        mockBaseResourceManager.readResource.mockResolvedValue({
          uri: 'build-log://last',
          contents: [
            {
              type: 'text',
              text: buildLog
            }
          ]
        });

        const result = await containerizationResourceManager.readResource('build-log://last');

        expect(result).toEqual({
          uri: 'build-log://last',
          contents: [
            {
              type: 'text',
              text: buildLog
            }
          ]
        });
        expect(mockBaseResourceManager.readResource).toHaveBeenCalledWith('build-log://last');
      });

      it('should handle resource not found', async () => {
        const error = new Error('Resource not found');
        mockBaseResourceManager.readResource.mockRejectedValue(error);

        await expect(containerizationResourceManager.readResource('nonexistent://resource'))
          .rejects.toThrow('Resource not found');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error, uri: 'nonexistent://resource' },
          'Failed to read containerization resource'
        );
      });

      it('should handle binary resource content', async () => {
        const binaryData = Buffer.from('binary content');
        mockBaseResourceManager.readResource.mockResolvedValue({
          uri: 'image://artifact',
          contents: [
            {
              type: 'blob',
              blob: binaryData.toString('base64')
            }
          ]
        });

        const result = await containerizationResourceManager.readResource('image://artifact');

        expect(result).toEqual({
          uri: 'image://artifact',
          contents: [
            {
              type: 'blob',
              blob: binaryData.toString('base64')
            }
          ]
        });
      });
    });

    describe('writeResource', () => {
      it('should write dockerfile resource', async () => {
        const dockerfileContent = 'FROM alpine:latest\nWORKDIR /app\nCOPY . .\nCMD ["./app"]';
        const resourceContent = {
          uri: 'dockerfile://current',
          contents: [
            {
              type: 'text' as const,
              text: dockerfileContent
            }
          ]
        };

        mockBaseResourceManager.writeResource.mockResolvedValue(undefined);

        await containerizationResourceManager.writeResource('dockerfile://current', resourceContent);

        expect(mockBaseResourceManager.writeResource).toHaveBeenCalledWith('dockerfile://current', resourceContent);
      });

      it('should write analysis resource', async () => {
        const analysisData = {
          language: 'python',
          packageManager: 'pip',
          dependencies: ['flask', 'requests'],
          hasDockerfile: true
        };

        const resourceContent = {
          uri: 'analysis://latest',
          contents: [
            {
              type: 'text' as const,
              text: JSON.stringify(analysisData)
            }
          ]
        };

        mockBaseResourceManager.writeResource.mockResolvedValue(undefined);

        await containerizationResourceManager.writeResource('analysis://latest', resourceContent);

        expect(mockBaseResourceManager.writeResource).toHaveBeenCalledWith('analysis://latest', resourceContent);
      });

      it('should handle write failures', async () => {
        const error = new Error('Write permission denied');
        mockBaseResourceManager.writeResource.mockRejectedValue(error);

        const resourceContent = {
          uri: 'dockerfile://current',
          contents: [{ type: 'text' as const, text: 'FROM node:16' }]
        };

        await expect(containerizationResourceManager.writeResource('dockerfile://current', resourceContent))
          .rejects.toThrow('Write permission denied');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error, uri: 'dockerfile://current' },
          'Failed to write containerization resource'
        );
      });
    });

    describe('resourceExists', () => {
      it('should check if dockerfile resource exists', async () => {
        mockBaseResourceManager.resourceExists.mockResolvedValue(true);

        const result = await containerizationResourceManager.resourceExists('dockerfile://current');

        expect(result).toBe(true);
        expect(mockBaseResourceManager.resourceExists).toHaveBeenCalledWith('dockerfile://current');
      });

      it('should check if non-existent resource exists', async () => {
        mockBaseResourceManager.resourceExists.mockResolvedValue(false);

        const result = await containerizationResourceManager.resourceExists('nonexistent://resource');

        expect(result).toBe(false);
        expect(mockBaseResourceManager.resourceExists).toHaveBeenCalledWith('nonexistent://resource');
      });

      it('should handle resource existence check errors', async () => {
        const error = new Error('Connection timeout');
        mockBaseResourceManager.resourceExists.mockRejectedValue(error);

        await expect(containerizationResourceManager.resourceExists('dockerfile://current'))
          .rejects.toThrow('Connection timeout');
      });
    });

    describe('deleteResource', () => {
      it('should delete specified resource', async () => {
        mockBaseResourceManager.deleteResource.mockResolvedValue(undefined);

        await containerizationResourceManager.deleteResource('dockerfile://old');

        expect(mockBaseResourceManager.deleteResource).toHaveBeenCalledWith('dockerfile://old');
      });

      it('should handle delete failures', async () => {
        const error = new Error('Resource is read-only');
        mockBaseResourceManager.deleteResource.mockRejectedValue(error);

        await expect(containerizationResourceManager.deleteResource('dockerfile://protected'))
          .rejects.toThrow('Resource is read-only');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error, uri: 'dockerfile://protected' },
          'Failed to delete containerization resource'
        );
      });
    });

    describe('getResourceMetadata', () => {
      it('should get metadata for dockerfile resource', async () => {
        const metadata = {
          uri: 'dockerfile://current',
          name: 'Current Dockerfile',
          size: 256,
          lastModified: new Date('2023-01-01T00:00:00Z'),
          contentType: 'text/plain',
          tags: ['dockerfile', 'production']
        };

        mockBaseResourceManager.getResourceMetadata.mockResolvedValue(metadata);

        const result = await containerizationResourceManager.getResourceMetadata('dockerfile://current');

        expect(result).toEqual(metadata);
        expect(mockBaseResourceManager.getResourceMetadata).toHaveBeenCalledWith('dockerfile://current');
      });

      it('should handle metadata retrieval errors', async () => {
        const error = new Error('Metadata not available');
        mockBaseResourceManager.getResourceMetadata.mockRejectedValue(error);

        await expect(containerizationResourceManager.getResourceMetadata('dockerfile://current'))
          .rejects.toThrow('Metadata not available');
      });
    });

    describe('clearCache', () => {
      it('should clear resource cache', async () => {
        mockBaseResourceManager.clearCache.mockResolvedValue(undefined);

        await containerizationResourceManager.clearCache();

        expect(mockBaseResourceManager.clearCache).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith('Cleared containerization resource cache');
      });

      it('should handle cache clear failures', async () => {
        const error = new Error('Cache clear failed');
        mockBaseResourceManager.clearCache.mockRejectedValue(error);

        await expect(containerizationResourceManager.clearCache()).rejects.toThrow('Cache clear failed');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { error },
          'Failed to clear containerization resource cache'
        );
      });
    });

    describe('getStats', () => {
      it('should get resource manager statistics', async () => {
        const stats = {
          totalResources: 15,
          cacheHitRate: 0.85,
          totalSizeBytes: 1024000,
          lastUpdated: new Date('2023-01-01T12:00:00Z')
        };

        mockBaseResourceManager.getStats.mockResolvedValue(stats);

        const result = await containerizationResourceManager.getStats();

        expect(result).toEqual(stats);
        expect(mockBaseResourceManager.getStats).toHaveBeenCalled();
      });

      it('should handle stats retrieval errors', async () => {
        const error = new Error('Stats unavailable');
        mockBaseResourceManager.getStats.mockRejectedValue(error);

        await expect(containerizationResourceManager.getStats()).rejects.toThrow('Stats unavailable');
      });
    });
  });

  describe('resource URI handling', () => {
    it('should handle various containerization resource URI schemes', async () => {
      const testCases = [
        'dockerfile://current',
        'analysis://latest',
        'build-log://last',
        'image://artifact',
        'k8s-manifest://deployment',
        'scan-result://security'
      ];

      mockBaseResourceManager.resourceExists.mockResolvedValue(true);

      for (const uri of testCases) {
        const result = await containerizationResourceManager.resourceExists(uri);
        expect(result).toBe(true);
        expect(mockBaseResourceManager.resourceExists).toHaveBeenCalledWith(uri);
      }
    });

    it('should handle invalid URI formats gracefully', async () => {
      const invalidUris = [
        'invalid-uri',
        '://missing-scheme',
        'scheme://',
        ''
      ];

      mockBaseResourceManager.resourceExists.mockResolvedValue(false);

      for (const uri of invalidUris) {
        const result = await containerizationResourceManager.resourceExists(uri);
        expect(result).toBe(false);
      }
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent read operations', async () => {
      const resources = [
        'dockerfile://current',
        'analysis://latest',
        'build-log://last'
      ];

      const mockResponses = resources.map(uri => ({
        uri,
        contents: [{ type: 'text' as const, text: `Content for ${uri}` }]
      }));

      mockBaseResourceManager.readResource
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2]);

      const results = await Promise.all(
        resources.map(uri => containerizationResourceManager.readResource(uri))
      );

      expect(results).toHaveLength(3);
      expect(results[0].uri).toBe('dockerfile://current');
      expect(results[1].uri).toBe('analysis://latest');
      expect(results[2].uri).toBe('build-log://last');
    });

    it('should handle concurrent write operations', async () => {
      const writeOperations = [
        { uri: 'dockerfile://new1', content: 'FROM node:16' },
        { uri: 'dockerfile://new2', content: 'FROM python:3.9' },
        { uri: 'dockerfile://new3', content: 'FROM alpine:latest' }
      ];

      mockBaseResourceManager.writeResource.mockResolvedValue(undefined);

      const results = await Promise.all(
        writeOperations.map(({ uri, content }) =>
          containerizationResourceManager.writeResource(uri, {
            uri,
            contents: [{ type: 'text' as const, text: content }]
          })
        )
      );

      expect(results).toHaveLength(3);
      expect(mockBaseResourceManager.writeResource).toHaveBeenCalledTimes(3);
    });
  });
});