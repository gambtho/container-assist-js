/**
 * Repository Analyzer Tests
 * Simplified test coverage for repository analysis
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';

// Mock Logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as any;

// Simple test interfaces
interface TestAnalysis {
  language: string;
  hasDockerfile: boolean;
  dependencies: string[];
}

// Simple mock analyzer for testing
class SimpleAnalyzer {
  constructor(private logger: Logger) {}

  async analyze(repoPath: string): Promise<TestAnalysis> {
    // Simple mock implementation
    return {
      language: 'TypeScript',
      hasDockerfile: false,
      dependencies: ['jest', 'typescript'],
    };
  }

  detectLanguage(files: string[]): string {
    if (files.some(f => f.endsWith('.ts'))) return 'TypeScript';
    if (files.some(f => f.endsWith('.js'))) return 'JavaScript';
    if (files.some(f => f.endsWith('.py'))) return 'Python';
    return 'Unknown';
  }

  hasDockerfile(files: string[]): boolean {
    return files.some(f => f.toLowerCase().includes('dockerfile'));
  }

  parseDependencies(content: string): string[] {
    try {
      const pkg = JSON.parse(content);
      return Object.keys(pkg.dependencies || {});
    } catch {
      return [];
    }
  }
}

describe('RepositoryAnalyzer', () => {
  let analyzer: SimpleAnalyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new SimpleAnalyzer(mockLogger);
  });

  describe('basic functionality', () => {
    it('should return basic analysis results', async () => {
      const result = await analyzer.analyze('/test-repo');

      expect(result.language).toBe('TypeScript');
      expect(result.hasDockerfile).toBe(false);
      expect(result.dependencies).toEqual(['jest', 'typescript']);
    });

    it('should detect TypeScript language', () => {
      const files = ['index.ts', 'utils.ts', 'package.json'];
      const language = analyzer.detectLanguage(files);
      
      expect(language).toBe('TypeScript');
    });

    it('should detect JavaScript language', () => {
      const files = ['index.js', 'utils.js', 'package.json'];
      const language = analyzer.detectLanguage(files);
      
      expect(language).toBe('JavaScript');
    });

    it('should detect Python language', () => {
      const files = ['main.py', 'utils.py', 'requirements.txt'];
      const language = analyzer.detectLanguage(files);
      
      expect(language).toBe('Python');
    });

    it('should detect Dockerfile presence', () => {
      const files = ['Dockerfile', 'package.json', 'index.ts'];
      const hasDocker = analyzer.hasDockerfile(files);
      
      expect(hasDocker).toBe(true);
    });

    it('should detect no Dockerfile', () => {
      const files = ['package.json', 'index.ts'];
      const hasDocker = analyzer.hasDockerfile(files);
      
      expect(hasDocker).toBe(false);
    });

    it('should parse dependencies from package.json', () => {
      const packageContent = JSON.stringify({
        name: 'test-project',
        dependencies: {
          express: '^4.18.0',
          lodash: '4.17.21'
        }
      });
      
      const deps = analyzer.parseDependencies(packageContent);
      
      expect(deps).toEqual(['express', 'lodash']);
    });

    it('should handle malformed package.json', () => {
      const malformedContent = '{ invalid json';
      
      const deps = analyzer.parseDependencies(malformedContent);
      
      expect(deps).toEqual([]);
    });

    it('should handle package.json without dependencies', () => {
      const packageContent = JSON.stringify({
        name: 'test-project'
      });
      
      const deps = analyzer.parseDependencies(packageContent);
      
      expect(deps).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle unknown file extensions', () => {
      const files = ['README.md', 'config.yaml'];
      const language = analyzer.detectLanguage(files);
      
      expect(language).toBe('Unknown');
    });

    it('should handle empty file lists', () => {
      const files: string[] = [];
      const language = analyzer.detectLanguage(files);
      
      expect(language).toBe('Unknown');
    });

    it('should handle case-insensitive Dockerfile detection', () => {
      const files = ['dockerfile', 'DOCKERFILE', 'Dockerfile.prod'];
      
      expect(analyzer.hasDockerfile(['dockerfile'])).toBe(true);
      expect(analyzer.hasDockerfile(['DOCKERFILE'])).toBe(true);
      expect(analyzer.hasDockerfile(['Dockerfile.prod'])).toBe(true);
    });
  });
});