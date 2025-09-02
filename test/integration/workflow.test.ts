/**
 * Unified Workflow Integration Tests
 * Tests the complete containerization workflow for multiple languages
 */

import { beforeEach, afterEach, describe, it, expect } from '@jest/globals';
import { nanoid } from 'nanoid';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ToolRegistry } from '../../src/service/tools/registry.js';
import { Dependencies } from '../../src/service/dependencies.js';
import { Config } from '../../src/service/config/config.js';
import { createLogger } from '../../src/infrastructure/core/logger.js';

describe('Unified Workflow Integration', () => {
  let dependencies: Dependencies;
  let toolRegistry: ToolRegistry;
  let testRepoDir: string;

  beforeEach(async () => {
    // Create temporary test directory
    testRepoDir = await mkdtemp(join(tmpdir(), 'test-repo-');
    
    // Initialize test configuration
    const config = new Config({ nodeEnv: 'test' });
    const logger = createLogger(config);
    
    // Initialize dependencies with test config
    dependencies = new Dependencies({
      config,
      logger,
      mcpServer: null // Mock MCP server for tests
    });
    await dependencies.initialize();
    
    // Initialize tool registry
    toolRegistry = new ToolRegistry(null, dependencies);
    await toolRegistry.registerAllTools();
  });

  afterEach(async () => {
    await dependencies.cleanup();
    if (testRepoDir) {
      await rm(testRepoDir, { recursive: true, force: true });
    }
  });

  describe('Node.js Application Workflow', () => {
    beforeEach(async () => {
      // Create a mock Node.js application
      await writeFile(join(testRepoDir, 'package.json'), JSON.stringify({
        name: 'test-node-app',
        version: '1.0.0',
        main: 'index.js',
        scripts: {
          start: 'node index.js',
          dev: 'nodemon index.js'
        },
        dependencies: {
          express: '^4.18.0'
        },
        devDependencies: {
          nodemon: '^2.0.0'
        }
      }, null, 2);

      await writeFile(join(testRepoDir, 'index.js'), `
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`);
    });

    it('should complete full containerization workflow for Node.js app', async () => {
      const sessionId = nanoid();
      
      // 1. Analyze repository
      const analysisResult = await toolRegistry.handleToolCall({
        name: 'analyze-repository',
        arguments: { 
          repo_path: testRepoDir,
          session_id: sessionId
        }
      });
      
      expect(analysisResult.content[0].text).toMatch(/javascript|nodejs/i);
      
      // 2. Generate Dockerfile
      const dockerfileResult = await toolRegistry.handleToolCall({
        name: 'generate-dockerfile',
        arguments: { 
          session_id: sessionId,
          repo_path: testRepoDir
        }
      });
      
      expect(dockerfileResult.content[0].text).toContain('FROM node:');
      
      // 3. Build image (will use mock in test environment)
      const buildResult = await toolRegistry.handleToolCall({
        name: 'build-image',
        arguments: { 
          session_id: sessionId,
          context: testRepoDir,
          tag: 'test-node-app'
        }
      });
      
      expect(buildResult.content[0].text).toMatch(/build|success/i);
      
      // 4. Generate Kubernetes manifests
      const k8sResult = await toolRegistry.handleToolCall({
        name: 'generate-k8s-manifests',
        arguments: { 
          session_id: sessionId
        }
      });
      
      expect(k8sResult.content[0].text).toMatch(/deployment|service/i);
    }, 30000); // 30 second timeout for full workflow
  });

  describe('Python Application Workflow', () => {
    beforeEach(async () => {
      // Create a mock Python Flask application
      await writeFile(join(testRepoDir, 'requirements.txt'), `
Flask==2.3.0
gunicorn==20.1.0
`);

      await writeFile(join(testRepoDir, 'app.py'), `
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def hello():
    return jsonify({"message": "Hello World!"})

@app.route('/health')
def health():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
`);
    });

    it('should handle Python Flask applications', async () => {
      const sessionId = nanoid();
      
      // 1. Analyze repository
      const analysisResult = await toolRegistry.handleToolCall({
        name: 'analyze-repository',
        arguments: { 
          repo_path: testRepoDir,
          session_id: sessionId
        }
      });
      
      expect(analysisResult.content[0].text).toMatch(/python|flask/i);
      
      // 2. Generate Dockerfile optimized for Python
      const dockerfileResult = await toolRegistry.handleToolCall({
        name: 'generate-dockerfile',
        arguments: { 
          session_id: sessionId,
          repo_path: testRepoDir
        }
      });
      
      expect(dockerfileResult.content[0].text).toContain('FROM python:');
      expect(dockerfileResult.content[0].text).toMatch(/pip install/i);
    });
  });

  describe('Go Application Workflow', () => {
    beforeEach(async () => {
      // Create a mock Go application
      await writeFile(join(testRepoDir, 'go.mod'), `
module test-go-app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.0
)
`);

      await writeFile(join(testRepoDir, 'main.go'), `
package main

import (
    "github.com/gin-gonic/gin"
    "net/http"
)

func main() {
    r := gin.Default()
    
    r.GET("/", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "message": "Hello World!",
        })
    })
    
    r.Run(":8080")
}
`);
    });

    it('should handle Go applications', async () => {
      const sessionId = nanoid();
      
      // 1. Analyze repository
      const analysisResult = await toolRegistry.handleToolCall({
        name: 'analyze-repository',
        arguments: { 
          repo_path: testRepoDir,
          session_id: sessionId
        }
      });
      
      expect(analysisResult.content[0].text).toMatch(/go|golang/i);
      
      // 2. Generate Dockerfile optimized for Go
      const dockerfileResult = await toolRegistry.handleToolCall({
        name: 'generate-dockerfile',
        arguments: { 
          session_id: sessionId,
          repo_path: testRepoDir
        }
      });
      
      expect(dockerfileResult.content[0].text).toContain('FROM golang:');
      expect(dockerfileResult.content[0].text).toMatch(/go build|go mod/i);
    });
  });

  describe('Error Recovery Testing', () => {
    it('should recover from build failures with helpful suggestions', async () => {
      const sessionId = nanoid();
      
      // Create a repo with an intentionally broken Dockerfile
      await writeFile(join(testRepoDir, 'package.json'), JSON.stringify({
        name: 'broken-app',
        version: '1.0.0'
      });

      await writeFile(join(testRepoDir, 'Dockerfile'), `
FROM node:18-alpine
COPY package.json .
RUN npm install
COPY . .
COPY non-existent-file.txt .
EXPOSE 3000
CMD ["npm", "start"]
`);

      // Attempt build which should fail but provide suggestions
      const buildResult = await toolRegistry.handleToolCall({
        name: 'build-image',
        arguments: { 
          session_id: sessionId,
          context: testRepoDir,
          tag: 'broken-app'
        }
      });
      
      // Should fail but provide helpful error suggestions
      expect(buildResult.content[0].text).toMatch(/suggestion|fix|error/i);
    });
  });

  describe('Complete Automated Workflow', () => {
    beforeEach(async () => {
      // Create a complete TypeScript application
      await writeFile(join(testRepoDir, 'package.json'), JSON.stringify({
        name: 'typescript-api',
        version: '1.0.0',
        scripts: {
          build: 'tsc',
          start: 'node dist/index.js',
          dev: 'ts-node-dev src/index.ts'
        },
        dependencies: {
          express: '^4.18.0',
          '@types/express': '^4.17.0'
        },
        devDependencies: {
          typescript: '^5.0.0',
          'ts-node-dev': '^2.0.0'
        }
      });

      await writeFile(join(testRepoDir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          outDir: './dist',
          rootDir: './src',
          strict: true
        }
      });

      await mkdir(join(testRepoDir, 'src');
      await writeFile(join(testRepoDir, 'src/index.ts'), `
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json();

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`);
    });

    it('should execute complete workflow using start_workflow tool', async () => {
      const workflowResult = await toolRegistry.handleToolCall({
        name: 'start-workflow',
        arguments: { 
          repo_path: testRepoDir,
          automated: true,
          deploy: false, // Skip deployment in tests
          scan: false    // Skip scanning in tests
        }
      });
      
      expect(workflowResult.content[0].text).toMatch(/workflow|started|session/i);
      
      // Extract session ID from workflow result
      const sessionMatch = workflowResult.content[0].text.match(/session[_-]?id[:\s]+([\w-]+)/i);
      expect(sessionMatch).toBeTruthy();
      
      if (sessionMatch) {
        const sessionId = sessionMatch[1];
        
        // Check workflow status
        const statusResult = await toolRegistry.handleToolCall({
          name: 'workflow-status',
          arguments: { session_id: sessionId }
        });
        
        expect(statusResult.content[0].text).toMatch(/status|progress|workflow/i);
      }
    }, 60000); // 60 second timeout for complete workflow
  });

  describe('Multi-language Support Validation', () => {
    it('should correctly identify and handle multiple languages in sequence', async () => {
      const languages = [
        {
          name: 'Node.js',
          files: { 'package.json': '{"name":"test"}', 'index.js': 'console.log("hello");' },
          expectedMatch: /javascript|nodejs/i
        },
        {
          name: 'Python',
          files: { 'requirements.txt': 'flask==2.0.0', 'app.py': 'from flask import Flask' },
          expectedMatch: /python|flask/i
        },
        {
          name: 'Go',
          files: { 'go.mod': 'module test', 'main.go': 'package main\nfunc main() {}' },
          expectedMatch: /go|golang/i
        }
      ];

      for (const lang of languages) {
        const langTestDir = await mkdtemp(join(tmpdir(), `test-${lang.name.toLowerCase()}-`);
        
        try {
          // Create language-specific files
          for (const [filename, content] of Object.entries(lang.files)) {
            await writeFile(join(langTestDir, filename), content);
          }
          
          // Test analysis
          const result = await toolRegistry.handleToolCall({
            name: 'analyze-repository',
            arguments: { 
              repo_path: langTestDir,
              session_id: nanoid()
            }
          });
          
          expect(result.content[0].text).toMatch(lang.expectedMatch);
          
        } finally {
          await rm(langTestDir, { recursive: true, force: true });
        }
      }
    });
  });
});