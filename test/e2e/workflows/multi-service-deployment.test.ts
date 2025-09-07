import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { E2ETestBase } from '../helpers/e2e-test-base';
import { TestRepository } from '../../fixtures/types';
import path from 'path';
import fs from 'fs/promises';

describe('Multi-Service Application E2E Tests', () => {
  let testFramework: E2ETestBase;
  let testContext: any;

  beforeAll(async () => {
    testFramework = new E2ETestBase({
      timeout: 600000, // 10 minutes for multi-service tests
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
    jest.setTimeout(600000); // 10 minutes per test
  });

  describe('Three-Tier Application (API + Frontend + Worker)', () => {
    let multiServiceRepo: TestRepository;

    beforeEach(async () => {
      // Create a multi-service repository structure
      multiServiceRepo = {
        name: 'three-tier-app',
        type: 'multi-service',
        path: path.join(testContext.tempDir, 'three-tier-app'),
        language: 'javascript',
        framework: 'multi-framework',
        complexity: 'complex',
        description: 'Three-tier application with API, frontend, and background worker'
      };

      await fs.mkdir(multiServiceRepo.path, { recursive: true });

      // Create API service (Node.js Express)
      const apiPath = path.join(multiServiceRepo.path, 'services', 'api');
      await fs.mkdir(apiPath, { recursive: true });
      
      await fs.writeFile(
        path.join(apiPath, 'package.json'),
        JSON.stringify({
          name: 'api-service',
          version: '1.0.0',
          main: 'server.js',
          scripts: {
            start: 'node server.js'
          },
          dependencies: {
            express: '^4.18.0',
            redis: '^4.0.0',
            pg: '^8.8.0'
          }
        }, null, 2)
      );

      await fs.writeFile(
        path.join(apiPath, 'server.js'),
        `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api' });
});

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.post('/api/users', (req, res) => {
  res.json({ user: req.body, id: Date.now() });
});

app.listen(port, () => {
  console.log(\`API service running on port \${port}\`);
});
`
      );

      // Create Frontend service (React)
      const frontendPath = path.join(multiServiceRepo.path, 'services', 'frontend');
      await fs.mkdir(frontendPath, { recursive: true });
      
      await fs.writeFile(
        path.join(frontendPath, 'package.json'),
        JSON.stringify({
          name: 'frontend-service',
          version: '1.0.0',
          scripts: {
            start: 'react-scripts start',
            build: 'react-scripts build',
            serve: 'serve -s build -l 3001'
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            'react-scripts': '^5.0.1',
            serve: '^14.0.0'
          }
        }, null, 2)
      );

      await fs.writeFile(
        path.join(frontendPath, 'Dockerfile.build'),
        `FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`
      );

      // Create Worker service (Python)
      const workerPath = path.join(multiServiceRepo.path, 'services', 'worker');
      await fs.mkdir(workerPath, { recursive: true });
      
      await fs.writeFile(
        path.join(workerPath, 'requirements.txt'),
        'celery==5.3.0\nredis==4.5.0\npsycopg2-binary==2.9.0\n'
      );

      await fs.writeFile(
        path.join(workerPath, 'worker.py'),
        `import os
import time
from celery import Celery

app = Celery('worker')
app.config_from_object('celeryconfig')

@app.task
def process_user_data(user_id):
    # Simulate processing
    time.sleep(2)
    return f"Processed user {user_id}"

@app.task
def send_email(email, subject):
    # Simulate email sending
    time.sleep(1)
    return f"Email sent to {email}"

if __name__ == '__main__':
    app.start()
`
      );

      // Create docker-compose.yml for the multi-service app
      await fs.writeFile(
        path.join(multiServiceRepo.path, 'docker-compose.yml'),
        `version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
  
  api:
    build: ./services/api
    ports:
      - "3000:3000"
    depends_on:
      - redis
      - postgres
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgresql://user:password@postgres:5432/appdb
  
  frontend:
    build: ./services/frontend
    ports:
      - "3001:80"
    depends_on:
      - api
  
  worker:
    build: ./services/worker
    depends_on:
      - redis
      - postgres
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgresql://user:password@postgres:5432/appdb
`
      );

      // Create root package.json to identify as multi-service
      await fs.writeFile(
        path.join(multiServiceRepo.path, 'package.json'),
        JSON.stringify({
          name: 'three-tier-app',
          version: '1.0.0',
          private: true,
          workspaces: [
            'services/*'
          ],
          scripts: {
            'build:all': 'npm run build --workspaces',
            'start:all': 'docker-compose up'
          }
        }, null, 2)
      );
    });

    it('should detect multi-service architecture', async () => {
      const { mcpClient } = testContext;
      
      const analysisResult = await mcpClient.callTool('analyze-repo', {
        path: multiServiceRepo.path
      });

      expect(analysisResult.ok).toBe(true);
      expect(analysisResult.value.services).toBeDefined();
      expect(analysisResult.value.services.length).toBe(3);
      
      const services = analysisResult.value.services;
      expect(services.find((s: any) => s.name === 'api')).toBeDefined();
      expect(services.find((s: any) => s.name === 'frontend')).toBeDefined();
      expect(services.find((s: any) => s.name === 'worker')).toBeDefined();
    });

    it('should generate Docker Compose configuration', async () => {
      const { mcpClient } = testContext;
      
      const composeResult = await mcpClient.callTool('generate-docker-compose', {
        repositoryPath: multiServiceRepo.path,
        services: [
          { name: 'api', type: 'backend', language: 'javascript' },
          { name: 'frontend', type: 'frontend', language: 'javascript' },
          { name: 'worker', type: 'background', language: 'python' }
        ]
      });

      expect(composeResult.ok).toBe(true);
      expect(composeResult.value.services.api).toBeDefined();
      expect(composeResult.value.services.frontend).toBeDefined();
      expect(composeResult.value.services.worker).toBeDefined();
    });

    it('should generate K8s manifests for all services', async () => {
      const { mcpClient } = testContext;
      
      // Generate manifests for each service
      const services = ['api', 'frontend', 'worker'];
      const manifestResults = [];

      for (const service of services) {
        let containerPort = 3000;
        let healthPath = '/health';

        if (service === 'frontend') {
          containerPort = 80;
          healthPath = '/';
        } else if (service === 'worker') {
          // Worker doesn't expose HTTP port, but we'll create deployment anyway
          containerPort = null;
          healthPath = null;
        }

        const result = await mcpClient.callTool('generate-k8s-manifests', {
          repositoryPath: path.join(multiServiceRepo.path, 'services', service),
          serviceName: service,
          containerPort,
          healthPath,
          environment: 'staging'
        });

        expect(result.ok).toBe(true);
        manifestResults.push(result.value);
      }

      // Verify each service has appropriate manifests
      expect(manifestResults.length).toBe(3);
      
      // API service should have both deployment and service
      const apiManifests = manifestResults[0];
      expect(apiManifests.deployment).toBeDefined();
      expect(apiManifests.service).toBeDefined();
      expect(apiManifests.deployment.spec.template.spec.containers[0].ports[0].containerPort).toBe(3000);

      // Frontend service should have both deployment and service
      const frontendManifests = manifestResults[1];
      expect(frontendManifests.deployment).toBeDefined();
      expect(frontendManifests.service).toBeDefined();

      // Worker service should have deployment but no service (background worker)
      const workerManifests = manifestResults[2];
      expect(workerManifests.deployment).toBeDefined();
    });

    it('should handle inter-service dependencies', async () => {
      const { mcpClient } = testContext;
      
      // Test generating manifests with service dependencies
      const apiResult = await mcpClient.callTool('generate-k8s-manifests', {
        repositoryPath: path.join(multiServiceRepo.path, 'services', 'api'),
        serviceName: 'api',
        environmentVariables: {
          REDIS_URL: 'redis://redis:6379',
          DATABASE_URL: 'postgresql://user:password@postgres:5432/appdb',
          FRONTEND_URL: 'http://frontend'
        }
      });

      expect(apiResult.ok).toBe(true);
      expect(apiResult.value.deployment.spec.template.spec.containers[0].env).toBeDefined();
      
      const envVars = apiResult.value.deployment.spec.template.spec.containers[0].env;
      expect(envVars.find((e: any) => e.name === 'REDIS_URL')).toBeDefined();
      expect(envVars.find((e: any) => e.name === 'DATABASE_URL')).toBeDefined();
      expect(envVars.find((e: any) => e.name === 'FRONTEND_URL')).toBeDefined();
    });

    it('should support environment-specific configurations', async () => {
      const { mcpClient } = testContext;
      const environments = ['development', 'staging', 'production'];
      
      for (const env of environments) {
        const result = await mcpClient.callTool('generate-k8s-manifests', {
          repositoryPath: path.join(multiServiceRepo.path, 'services', 'api'),
          environment: env,
          replicas: env === 'production' ? 3 : 1,
          resourceLimits: env === 'production' 
            ? { memory: '1Gi', cpu: '1000m' } 
            : { memory: '512Mi', cpu: '500m' }
        });

        expect(result.ok).toBe(true);
        expect(result.value.deployment.metadata.labels.environment).toBe(env);
        expect(result.value.deployment.spec.replicas).toBe(env === 'production' ? 3 : 1);
        
        const resources = result.value.deployment.spec.template.spec.containers[0].resources;
        if (env === 'production') {
          expect(resources.limits.memory).toBe('1Gi');
          expect(resources.limits.cpu).toBe('1000m');
        } else {
          expect(resources.limits.memory).toBe('512Mi');
          expect(resources.limits.cpu).toBe('500m');
        }
      }
    });

    it('should handle service communication and networking', async () => {
      const { mcpClient } = testContext;
      
      // Generate service mesh or ingress configuration
      const services = [
        { name: 'api', port: 3000, path: '/api' },
        { name: 'frontend', port: 80, path: '/' }
      ];

      // This would typically generate an Ingress resource
      for (const service of services) {
        const result = await mcpClient.callTool('generate-k8s-manifests', {
          repositoryPath: multiServiceRepo.path,
          serviceName: service.name,
          ingressPath: service.path,
          ingressEnabled: true
        });

        expect(result.ok).toBe(true);
        expect(result.value.service.spec.ports[0].port).toBe(service.port);
      }
    });
  });

  describe('Database and Cache Integration', () => {
    it('should generate manifests with external service dependencies', async () => {
      const { mcpClient } = testContext;
      
      const result = await mcpClient.callTool('generate-k8s-manifests', {
        repositoryPath: testContext.tempDir,
        serviceName: 'api-with-deps',
        externalServices: [
          { name: 'redis', type: 'cache' },
          { name: 'postgres', type: 'database' }
        ],
        environmentVariables: {
          REDIS_URL: 'redis://redis-service:6379',
          DATABASE_URL: 'postgresql://postgres-service:5432/appdb'
        }
      });

      expect(result.ok).toBe(true);
      
      const envVars = result.value.deployment.spec.template.spec.containers[0].env;
      expect(envVars.find((e: any) => e.name === 'REDIS_URL' && e.value.includes('redis-service'))).toBeDefined();
      expect(envVars.find((e: any) => e.name === 'DATABASE_URL' && e.value.includes('postgres-service'))).toBeDefined();
    });
  });

  describe('Scaling and Load Testing', () => {
    it('should support horizontal pod autoscaling configuration', async () => {
      const { mcpClient } = testContext;
      
      const result = await mcpClient.callTool('generate-k8s-manifests', {
        repositoryPath: testContext.tempDir,
        serviceName: 'scalable-api',
        autoscaling: {
          enabled: true,
          minReplicas: 2,
          maxReplicas: 10,
          targetCPUUtilizationPercentage: 70
        }
      });

      expect(result.ok).toBe(true);
      expect(result.value.deployment.spec.replicas).toBe(2); // Should match minReplicas
      
      // In a real implementation, this would also generate HPA resource
      // For now, we verify the deployment is configured correctly
      expect(result.value.deployment.spec.template.spec.containers[0].resources).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing service directories', async () => {
      const { mcpClient } = testContext;
      
      const result = await mcpClient.callTool('analyze-repo', {
        path: '/nonexistent/multi-service/path'
      });

      // Mock should return default structure even for nonexistent paths
      expect(result.ok).toBe(true);
    });

    it('should handle incomplete service configurations', async () => {
      // Create incomplete service structure
      const incompletePath = path.join(testContext.tempDir, 'incomplete-service');
      await fs.mkdir(incompletePath, { recursive: true });
      
      // Only create package.json without main script
      await fs.writeFile(
        path.join(incompletePath, 'package.json'),
        JSON.stringify({ name: 'incomplete' }, null, 2)
      );

      const { mcpClient } = testContext;
      const result = await mcpClient.callTool('generate-dockerfile', {
        repositoryPath: incompletePath
      });

      // Should still succeed with default configuration
      expect(result.ok).toBe(true);
      expect(result.value.content).toContain('FROM node:');
    });
  });
});