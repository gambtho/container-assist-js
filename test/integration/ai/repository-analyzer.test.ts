/**
 * Integration tests for Universal Repository Analyzer
 * Tests AI-powered language detection across multiple tech stacks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, writeFile, rmdir } from 'fs/promises';
import { UniversalRepositoryAnalyzer } from '../../../src/infrastructure/ai/repository-analyzer.js';
import { MockMCPSampler } from '../../../src/infrastructure/ai/mock-sampler.js';
import { createLogger } from '../../utils/logger.js';

describe('UniversalRepositoryAnalyzer Integration', () => {
  let analyzer: UniversalRepositoryAnalyzer;
  let mockSampler: MockMCPSampler;
  let logger: any;
  let testDir: string;

  beforeEach(async () => {
    logger = createLogger();
    mockSampler = new MockMCPSampler(logger, { deterministicMode: true });
    analyzer = new UniversalRepositoryAnalyzer(mockSampler, logger);
    
    // Create temporary test directory
    testDir = join(tmpdir(), `test-repo-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Node.js Application Analysis', () => {
    it('should analyze Express.js application correctly', async () => {
      // Setup Express.js project structure
      await writeFile(join(testDir, 'package.json'), JSON.stringify({
        name: 'test-express-app',
        version: '1.0.0',
        main: 'server.js',
        dependencies: {
          express: '^4.18.2',
          cors: '^2.8.5'
        },
        devDependencies: {
          jest: '^29.0.0',
          nodemon: '^2.0.20'
        },
        scripts: {
          start: 'node server.js',
          dev: 'nodemon server.js',
          test: 'jest'
        }
      }, null, 2));

      await writeFile(join(testDir, 'server.js'), `
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(port, () => {
  console.log('Server running on port', port);
});
      `);

      await writeFile(join(testDir, '.env'), 'PORT=3000\nNODE_ENV=development');

      // Analyze the repository
      const result = await analyzer.analyze(testDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('javascript');
        expect(result.data.framework).toBe('express');
        expect(result.data.buildSystem?.type).toBe('npm');
        expect(result.data.suggestedPorts).toContain(3000);
        expect(result.data.dockerConfig?.baseImage).toMatch(/node/i);
        expect(result.data.dockerConfig?.multistage).toBe(true);
        expect(result.data.dependencies).toContain('express');
        expect(result.data.devDependencies).toContain('jest');
      }
    });

    it('should analyze Next.js application correctly', async () => {
      // Setup Next.js project structure
      await writeFile(join(testDir, 'package.json'), JSON.stringify({
        name: 'test-nextjs-app',
        version: '0.1.0',
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start'
        },
        dependencies: {
          next: '13.5.6',
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        },
        devDependencies: {
          '@types/node': '^20.8.0',
          '@types/react': '^18.2.25',
          typescript: '^5.2.2'
        }
      }, null, 2));

      await writeFile(join(testDir, 'next.config.js'), `
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
      `);

      await mkdir(join(testDir, 'pages'));
      await writeFile(join(testDir, 'pages', 'index.tsx'), `
import React from 'react';

export default function Home() {
  return <div>Hello Next.js!</div>;
}
      `);

      const result = await analyzer.analyze(testDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('typescript');
        expect(result.data.framework).toBe('nextjs');
        expect(result.data.suggestedPorts).toContain(3000);
        expect(result.data.dockerConfig?.multistage).toBe(true);
      }
    });
  });

  describe('Python Application Analysis', () => {
    it('should analyze FastAPI application correctly', async () => {
      // Setup FastAPI project structure
      await writeFile(join(testDir, 'requirements.txt'), `
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
      `.trim());

      await writeFile(join(testDir, 'main.py'), `
from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/health")
def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
      `);

      await writeFile(join(testDir, 'Dockerfile'), `
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "main.py"]
      `);

      const result = await analyzer.analyze(testDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('python');
        expect(result.data.framework).toBe('fastapi');
        expect(result.data.buildSystem?.type).toBe('pip');
        expect(result.data.suggestedPorts).toContain(8000);
        expect(result.data.dockerConfig?.baseImage).toMatch(/python/i);
      }
    });

    it('should analyze Django application correctly', async () => {
      // Setup Django project structure
      await writeFile(join(testDir, 'requirements.txt'), `
Django==4.2.7
djangorestframework==3.14.0
      `.trim());

      await writeFile(join(testDir, 'manage.py'), `
#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
      `);

      await mkdir(join(testDir, 'myproject'));
      await writeFile(join(testDir, 'myproject', '__init__.py'), '');
      await writeFile(join(testDir, 'myproject', 'settings.py'), `
DEBUG = True
ALLOWED_HOSTS = []
INSTALLED_APPS = ['django.contrib.admin']
ROOT_URLCONF = 'myproject.urls'
      `);

      const result = await analyzer.analyze(testDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('python');
        expect(result.data.framework).toBe('django');
        expect(result.data.suggestedPorts).toContain(8000);
      }
    });
  });

  describe('Go Application Analysis', () => {
    it('should analyze Go application correctly', async () => {
      // Setup Go project structure
      await writeFile(join(testDir, 'go.mod'), `
module github.com/example/test-app

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gorilla/mux v1.8.0
)
      `.trim());

      await writeFile(join(testDir, 'main.go'), `
package main

import (
    "github.com/gin-gonic/gin"
    "net/http"
)

func main() {
    r := gin.Default()
    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "healthy"})
    })
    r.Run(":8080")
}
      `);

      const result = await analyzer.analyze(testDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('go');
        expect(result.data.framework).toBe('gin');
        expect(result.data.buildSystem?.type).toBe('go');
        expect(result.data.suggestedPorts).toContain(8080);
        expect(result.data.dockerConfig?.multistage).toBe(true);
        expect(result.data.dockerConfig?.baseImage).toMatch(/golang/i);
      }
    });
  });

  describe('Java Application Analysis', () => {
    it('should analyze Spring Boot application correctly', async () => {
      // Setup Spring Boot project structure
      await writeFile(join(testDir, 'pom.xml'), `
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>test-app</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.1.5</version>
    </parent>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>
      `);

      await mkdir(join(testDir, 'src', 'main', 'java'), { recursive: true });
      await writeFile(join(testDir, 'src', 'main', 'java', 'Application.java'), `
package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
    
    @GetMapping("/health")
    public String health() {
        return "healthy";
    }
}
      `);

      const result = await analyzer.analyze(testDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('java');
        expect(result.data.framework).toBe('spring');
        expect(result.data.buildSystem?.type).toBe('maven');
        expect(result.data.suggestedPorts).toContain(8080);
        expect(result.data.dockerConfig?.multistage).toBe(true);
        expect(result.data.dockerConfig?.baseImage).toMatch(/openjdk|java/i);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent directory gracefully', async () => {
      const result = await analyzer.analyze('/non-existent-path');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('analysis failed');
    });

    it('should handle empty directory gracefully', async () => {
      const emptyDir = join(tmpdir(), `empty-${Date.now()}`);
      await mkdir(emptyDir);
      
      const result = await analyzer.analyze(emptyDir);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('unknown');
      }
      
      await rmdir(emptyDir);
    });
  });

  describe('AI Integration', () => {
    it('should fall back gracefully when AI fails', async () => {
      // Setup a simple Node.js project
      await writeFile(join(testDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: { express: '^4.0.0' }
      }));

      // Configure mock to simulate AI failure
      mockSampler.setErrorRate(1.0); // 100% error rate
      
      const result = await analyzer.analyze(testDir);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('AI analysis failed');
      
      // Reset error rate
      mockSampler.setErrorRate(0);
    });

    it('should enhance basic analysis with AI insights', async () => {
      // Setup project
      await writeFile(join(testDir, 'package.json'), JSON.stringify({
        name: 'complex-app',
        dependencies: { 
          express: '^4.0.0',
          redis: '^4.0.0',
          mongoose: '^7.0.0'
        }
      }));

      // Add custom response for this complex setup
      mockSampler.addResponse('repository-analysis', JSON.stringify({
        language: 'javascript',
        framework: 'express',
        buildSystem: { type: 'npm', buildFile: 'package.json' },
        dependencies: ['express', 'redis', 'mongoose'],
        suggestedPorts: [3000],
        dockerConfig: {
          baseImage: 'node:18-alpine',
          multistage: true,
          nonRootUser: true
        }
      }));

      const result = await analyzer.analyze(testDir);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dependencies).toEqual(
          expect.arrayContaining(['express', 'redis', 'mongoose'])
        );
      }
    });
  });
});