import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { E2ETestBase, CompleteWorkflowResult, validateWorkflowOutput } from '../helpers/e2e-test-base';
import { TestRepository } from '../../fixtures/types';
import path from 'path';
import fs from 'fs/promises';

describe('Complete Containerization Workflow E2E Tests', () => {
  let testFramework: E2ETestBase;
  let testContext: any;

  beforeAll(async () => {
    testFramework = new E2ETestBase({
      timeout: 300000,
      useRealInfrastructure: process.env.E2E_REAL_INFRA === 'true',
      enablePersistence: process.env.E2E_PERSIST === 'true'
    });

    const setupResult = await testFramework.setup();
    if (!setupResult.ok) {
      throw new Error(`Failed to setup E2E test framework: ${setupResult.error}`);
    }
    testContext = setupResult.value;
  });

  afterAll(async () => {
    if (testFramework) {
      await testFramework.teardown();
    }
  });

  beforeEach(() => {
    jest.setTimeout(300000); // 5 minutes per test
  });

  describe('Node.js Express Application', () => {
    it('should complete full containerization workflow', async () => {
      const nodeRepo = testContext.testRepositories.find((r: TestRepository) => 
        r.name === 'node-express-basic'
      );
      expect(nodeRepo).toBeDefined();

      // Create a minimal Node.js app structure
      await fs.mkdir(nodeRepo.path, { recursive: true });
      await fs.writeFile(
        path.join(nodeRepo.path, 'package.json'),
        JSON.stringify({
          name: 'test-express-app',
          version: '1.0.0',
          main: 'server.js',
          scripts: {
            start: 'node server.js',
            test: 'echo "Error: no test specified" && exit 1'
          },
          dependencies: {
            express: '^4.18.0'
          }
        }, null, 2)
      );

      await fs.writeFile(
        path.join(nodeRepo.path, 'server.js'),
        `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});
`
      );

      // Run complete workflow
      const workflowResult = await testFramework.runCompleteWorkflow(nodeRepo.path);
      
      expect(workflowResult.ok).toBe(true);
      expect(workflowResult.value).toBeDefined();

      const result = workflowResult.value as CompleteWorkflowResult;
      
      // Validate analysis results
      expect(result.analysis).toBeDefined();
      expect(result.analysis.language).toBe('javascript');
      expect(result.analysis.framework).toBe('express');

      // Validate Dockerfile generation
      expect(result.dockerfile).toBeDefined();
      expect(result.dockerfile.content).toContain('FROM node:');
      expect(result.dockerfile.content).toContain('WORKDIR /app');
      expect(result.dockerfile.content).toContain('COPY package*.json');
      expect(result.dockerfile.content).toContain('npm ci');
      expect(result.dockerfile.content).toContain('EXPOSE 3000');

      // Validate K8s manifests
      expect(result.k8sManifests).toBeDefined();
      expect(result.k8sManifests.deployment).toBeDefined();
      expect(result.k8sManifests.service).toBeDefined();
      expect(result.k8sManifests.deployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(3000);

      // Validate workflow output
      const validationResult = await validateWorkflowOutput(result, testContext);
      expect(validationResult.ok).toBe(true);
    });

    it('should handle workflow with custom configuration', async () => {
      const nodeRepo = testContext.testRepositories.find((r: TestRepository) => 
        r.name === 'node-express-basic'
      );
      
      // Test with custom environment variables and resource limits
      const { mcpClient } = testContext;
      
      const k8sResult = await mcpClient.callTool('generate-k8s-manifests', {
        repositoryPath: nodeRepo.path,
        resourceLimits: { memory: '1Gi', cpu: '1000m' },
        environmentVariables: { NODE_ENV: 'production', DEBUG: 'app:*' },
        replicas: 3,
        environment: 'production'
      });

      expect(k8sResult.ok).toBe(true);
      expect(k8sResult.value.deployment.spec.replicas).toBe(3);
      expect(k8sResult.value.deployment.metadata.labels.environment).toBe('production');
      expect(k8sResult.value.deployment.spec.template.spec.containers[0].env).toBeDefined();
      expect(k8sResult.value.deployment.spec.template.spec.containers[0].resources.limits.memory).toBe('1Gi');
    });
  });

  describe('Python Flask Application', () => {
    it('should complete full containerization workflow', async () => {
      const pythonRepo = testContext.testRepositories.find((r: TestRepository) => 
        r.name === 'python-flask'
      );
      expect(pythonRepo).toBeDefined();

      // Create a minimal Flask app structure
      await fs.mkdir(pythonRepo.path, { recursive: true });
      await fs.writeFile(
        path.join(pythonRepo.path, 'requirements.txt'),
        'Flask==2.3.0\nWerkzeug==2.3.0\n'
      );

      await fs.writeFile(
        path.join(pythonRepo.path, 'app.py'),
        `from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/')
def hello():
    return jsonify({'message': 'Hello World!'})

@app.route('/health')
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
`
      );

      // Run complete workflow
      const workflowResult = await testFramework.runCompleteWorkflow(pythonRepo.path);
      
      expect(workflowResult.ok).toBe(true);
      expect(workflowResult.value).toBeDefined();

      const result = workflowResult.value as CompleteWorkflowResult;
      
      // Validate analysis results
      expect(result.analysis.language).toBe('python');
      expect(result.analysis.framework).toBe('flask');

      // Validate Dockerfile generation
      expect(result.dockerfile.content).toContain('FROM python:');
      expect(result.dockerfile.content).toContain('WORKDIR /app');
      expect(result.dockerfile.content).toContain('requirements.txt');
      expect(result.dockerfile.content).toContain('pip install');
      expect(result.dockerfile.content).toContain('EXPOSE 5000');

      // Validate K8s manifests
      expect(result.k8sManifests.deployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(5000);
    });
  });

  describe('Java Spring Boot Application', () => {
    it('should complete full containerization workflow', async () => {
      const javaRepo = testContext.testRepositories.find((r: TestRepository) => 
        r.name === 'java-springboot'
      );
      expect(javaRepo).toBeDefined();

      // Create a minimal Spring Boot app structure
      await fs.mkdir(javaRepo.path, { recursive: true });
      await fs.mkdir(path.join(javaRepo.path, 'target'), { recursive: true });
      
      await fs.writeFile(
        path.join(javaRepo.path, 'pom.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <packaging>jar</packaging>
    <name>demo</name>
    <description>Demo project for Spring Boot</description>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
            <version>3.1.0</version>
        </dependency>
    </dependencies>
</project>`
      );

      // Create a mock JAR file
      await fs.writeFile(
        path.join(javaRepo.path, 'target', 'demo-0.0.1-SNAPSHOT.jar'),
        'mock jar content'
      );

      // Run complete workflow  
      const workflowResult = await testFramework.runCompleteWorkflow(javaRepo.path);
      
      expect(workflowResult.ok).toBe(true);
      expect(workflowResult.value).toBeDefined();

      const result = workflowResult.value as CompleteWorkflowResult;
      
      // Validate analysis results
      expect(result.analysis.language).toBe('java');
      expect(result.analysis.framework).toBe('spring-boot');

      // Validate Dockerfile generation
      expect(result.dockerfile.content).toContain('FROM openjdk:');
      expect(result.dockerfile.content).toContain('WORKDIR /app');
      expect(result.dockerfile.content).toContain('target/*.jar');
      expect(result.dockerfile.content).toContain('EXPOSE 8080');

      // Validate K8s manifests
      expect(result.k8sManifests.deployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(8080);
    });
  });

  describe('Security Profile Testing', () => {
    it('should generate strict security configuration', async () => {
      const { mcpClient } = testContext;
      
      const dockerfileResult = await mcpClient.callTool('generate-dockerfile', {
        repositoryPath: '/mock/path/java',
        securityProfile: 'strict'
      });

      expect(dockerfileResult.ok).toBe(true);
      expect(dockerfileResult.value.content).toContain('distroless');

      const k8sResult = await mcpClient.callTool('generate-k8s-manifests', {
        repositoryPath: '/mock/path',
        securityProfile: 'strict'
      });

      expect(k8sResult.ok).toBe(true);
      expect(k8sResult.value.deployment.spec.template.spec.securityContext.runAsNonRoot).toBe(true);
      expect(k8sResult.value.deployment.spec.template.spec.containers[0].securityContext.readOnlyRootFilesystem).toBe(true);
    });

    it('should generate relaxed security configuration for development', async () => {
      const { mcpClient } = testContext;
      
      const k8sResult = await mcpClient.callTool('generate-k8s-manifests', {
        repositoryPath: '/mock/path',
        securityProfile: 'relaxed'
      });

      expect(k8sResult.ok).toBe(true);
      expect(k8sResult.value.deployment.spec.template.spec.securityContext.runAsNonRoot).toBe(false);
      expect(k8sResult.value.deployment.spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing repository gracefully', async () => {
      const workflowResult = await testFramework.runCompleteWorkflow('/nonexistent/path');
      
      expect(workflowResult.ok).toBe(false);
      expect(workflowResult.error).toContain('failed');
    });

    it('should handle tool failures gracefully', async () => {
      const { mcpClient } = testContext;
      
      const result = await mcpClient.callTool('nonexistent-tool', {});
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });
});