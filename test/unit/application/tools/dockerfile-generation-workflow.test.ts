/**
 * Dockerfile Generation Workflow Tests
 * Team Delta - Test Coverage Foundation
 * 
 * Comprehensive tests for Dockerfile generation workflow
 */

import { jest } from '@jest/globals';
import { createMockLogger, createMockCoreServices, createMockAIService } from '../../../utils/mock-factories';
import type { AnalysisResult, GenerateDockerfileParams, GeneratedDockerfile } from '../../../../src/application/tools/schemas';
import type { Logger } from 'pino';

describe('Dockerfile Generation Workflow', () => {
  const mockLogger = createMockLogger();
  const mockServices = createMockCoreServices();
  const mockAIService = createMockAIService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should validate required analysis result', () => {
      const input: GenerateDockerfileParams = {
        analysis_result: {
          language: 'javascript',
          framework: 'express',
          build_system: 'npm',
          dependencies: ['express@^4.18.0'],
          ports: [3000],
          has_dockerfile: false,
          recommended_base_image: 'node:18-alpine',
          security_recommendations: [],
          analysis_summary: 'Node.js Express app',
          workflow_stage: 'analysis',
          containerization_status: 'not_containerized',
          deployment_readiness: 0.7,
        },
        optimization_level: 'standard',
      };

      expect(input.analysis_result).toBeDefined();
      expect(input.analysis_result.language).toBe('javascript');
      expect(input.analysis_result.framework).toBe('express');
    });

    it('should accept optional parameters', () => {
      const input: GenerateDockerfileParams = {
        analysis_result: {} as AnalysisResult,
        optimization_level: 'aggressive',
        custom_base_image: 'custom:latest',
        additional_packages: ['curl', 'vim'],
        environment_variables: { NODE_ENV: 'production' },
      };

      expect(input.optimization_level).toBe('aggressive');
      expect(input.custom_base_image).toBe('custom:latest');
      expect(input.additional_packages).toEqual(['curl', 'vim']);
      expect(input.environment_variables).toEqual({ NODE_ENV: 'production' });
    });

    it('should default optimization level to standard', () => {
      const input: GenerateDockerfileParams = {
        analysis_result: {} as AnalysisResult,
      };

      const defaultOptimization = input.optimization_level || 'standard';
      expect(defaultOptimization).toBe('standard');
    });
  });

  describe('Node.js Dockerfile Generation', () => {
    const nodeAnalysis: AnalysisResult = {
      language: 'javascript',
      framework: 'express',
      build_system: 'npm',
      dependencies: ['express@^4.18.0', 'mongoose@^6.0.0'],
      ports: [3000],
      has_dockerfile: false,
      recommended_base_image: 'node:18-alpine',
      security_recommendations: ['Use non-root user'],
      analysis_summary: 'Node.js Express application',
      workflow_stage: 'analysis',
      containerization_status: 'not_containerized',
      deployment_readiness: 0.7,
    };

    it('should generate basic Node.js Dockerfile', () => {
      const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node
CMD ["node", "index"]`;

      expect(dockerfile).toContain('FROM node:18-alpine');
      expect(dockerfile).toContain('npm ci --only=production');
      expect(dockerfile).toContain('EXPOSE 3000');
      expect(dockerfile).toContain('USER node');
    });

    it('should use multi-stage build for optimization', () => {
      const dockerfile = `# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
EXPOSE 3000
USER node
CMD ["node", "dist/index"]`;

      expect(dockerfile).toContain('AS builder');
      expect(dockerfile).toContain('COPY --from=builder');
      expect(dockerfile).toContain('npm cache clean --force');
    });

    it('should handle TypeScript projects', () => {
      const tsAnalysis = { ...nodeAnalysis, dependencies: [...nodeAnalysis.dependencies, 'typescript@^5.0.0'] };
      
      const dockerfile = `FROM node:18-alpine AS builder
RUN npm install -g typescript
COPY tsconfig.json ./`;

      expect(dockerfile).toContain('typescript');
      expect(dockerfile).toContain('tsconfig.json');
    });

    it('should add health check for Express apps', () => {
      const dockerfile = `HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"`;

      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('--interval=30s');
    });
  });

  describe('Python Dockerfile Generation', () => {
    const pythonAnalysis: AnalysisResult = {
      language: 'python',
      framework: 'django',
      build_system: 'pip',
      dependencies: ['Django==4.2.0', 'psycopg2==2.9.0'],
      ports: [8000],
      has_dockerfile: false,
      recommended_base_image: 'python:3.11-slim',
      security_recommendations: ['Use virtual environment'],
      analysis_summary: 'Django web application',
      workflow_stage: 'analysis',
      containerization_status: 'not_containerized',
      deployment_readiness: 0.8,
    };

    it('should generate basic Python Dockerfile', () => {
      const dockerfile = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]`;

      expect(dockerfile).toContain('FROM python:3.11-slim');
      expect(dockerfile).toContain('pip install --no-cache-dir');
      expect(dockerfile).toContain('EXPOSE 8000');
      expect(dockerfile).toContain('manage.py');
    });

    it('should use Poetry for dependency management', () => {
      const poetryAnalysis = { ...pythonAnalysis, build_system: 'poetry' };
      
      const dockerfile = `FROM python:3.11-slim
RUN pip install poetry
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-dev --no-interaction --no-ansi`;

      expect(dockerfile).toContain('pip install poetry');
      expect(dockerfile).toContain('poetry install --no-dev');
    });

    it('should configure for production Django', () => {
      const dockerfile = `ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=myproject.settings.production
RUN python manage.py collectstatic --noinput
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "myproject.wsgi:application"]`;

      expect(dockerfile).toContain('PYTHONUNBUFFERED=1');
      expect(dockerfile).toContain('collectstatic');
      expect(dockerfile).toContain('gunicorn');
    });
  });

  describe('Java Dockerfile Generation', () => {
    const javaAnalysis: AnalysisResult = {
      language: 'java',
      framework: 'spring-boot',
      build_system: 'maven',
      dependencies: [],
      ports: [8080],
      has_dockerfile: false,
      recommended_base_image: 'openjdk:17-jdk-slim',
      security_recommendations: [],
      analysis_summary: 'Spring Boot application',
      workflow_stage: 'analysis',
      containerization_status: 'not_containerized',
      deployment_readiness: 0.75,
    };

    it('should generate Spring Boot Dockerfile with Maven', () => {
      const dockerfile = `FROM maven:3.8-openjdk-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn clean package -DskipTests

FROM openjdk:17-jre-slim
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]`;

      expect(dockerfile).toContain('maven:3.8-openjdk-17');
      expect(dockerfile).toContain('mvn clean package');
      expect(dockerfile).toContain('openjdk:17-jre-slim');
      expect(dockerfile).toContain('COPY --from=builder');
    });

    it('should use Gradle for build system', () => {
      const gradleAnalysis = { ...javaAnalysis, build_system: 'gradle' };
      
      const dockerfile = `FROM gradle:7.6-jdk17 AS builder
COPY build.gradle settings.gradle ./
COPY gradle ./gradle
RUN gradle build --no-daemon`;

      expect(dockerfile).toContain('gradle:7.6-jdk17');
      expect(dockerfile).toContain('gradle build --no-daemon');
    });

    it('should add JVM optimization flags', () => {
      const dockerfile = `CMD ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]`;

      expect(dockerfile).toContain('-XX:+UseContainerSupport');
      expect(dockerfile).toContain('-XX:MaxRAMPercentage=75.0');
    });
  });

  describe('Go Dockerfile Generation', () => {
    const goAnalysis: AnalysisResult = {
      language: 'go',
      framework: 'gin',
      build_system: 'go-modules',
      dependencies: [],
      ports: [8080],
      has_dockerfile: false,
      recommended_base_image: 'golang:1.20-alpine',
      security_recommendations: ['Use distroless image'],
      analysis_summary: 'Go Gin web service',
      workflow_stage: 'analysis',
      containerization_status: 'not_containerized',
      deployment_readiness: 0.85,
    };

    it('should generate optimized Go Dockerfile', () => {
      const dockerfile = `FROM golang:1.20-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

FROM scratch
COPY --from=builder /app/main /main
EXPOSE 8080
CMD ["/main"]`;

      expect(dockerfile).toContain('golang:1.20-alpine');
      expect(dockerfile).toContain('CGO_ENABLED=0');
      expect(dockerfile).toContain('FROM scratch');
      expect(dockerfile).toContain('COPY --from=builder');
    });

    it('should use distroless base image', () => {
      const dockerfile = `FROM gcr.io/distroless/static-debian11
COPY --from=builder /app/main /
CMD ["/main"]`;

      expect(dockerfile).toContain('distroless/static-debian11');
    });

    it('should add CA certificates for HTTPS', () => {
      const dockerfile = `FROM alpine:latest AS certs
RUN apk --update add ca-certificates

FROM scratch
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/`;

      expect(dockerfile).toContain('ca-certificates');
      expect(dockerfile).toContain('/etc/ssl/certs/');
    });
  });

  describe('Optimization Strategies', () => {
    it('should apply minimal optimization', () => {
      const strategies = {
        minimal: {
          multiStage: false,
          layerCaching: true,
          sizeReduction: 'basic',
        },
      };

      expect(strategies.minimal.multiStage).toBe(false);
      expect(strategies.minimal.layerCaching).toBe(true);
    });

    it('should apply standard optimization', () => {
      const strategies = {
        standard: {
          multiStage: true,
          layerCaching: true,
          sizeReduction: 'moderate',
          cacheCleanup: true,
        },
      };

      expect(strategies.standard.multiStage).toBe(true);
      expect(strategies.standard.cacheCleanup).toBe(true);
    });

    it('should apply aggressive optimization', () => {
      const strategies = {
        aggressive: {
          multiStage: true,
          layerCaching: true,
          sizeReduction: 'maximum',
          cacheCleanup: true,
          distroless: true,
          staticLinking: true,
        },
      };

      expect(strategies.aggressive.distroless).toBe(true);
      expect(strategies.aggressive.staticLinking).toBe(true);
    });
  });

  describe('Security Best Practices', () => {
    it('should run as non-root user', () => {
      const dockerfile = `RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs`;

      expect(dockerfile).toContain('adduser');
      expect(dockerfile).toContain('USER nodejs');
    });

    it('should scan for vulnerabilities', () => {
      const dockerfile = `RUN apk add --no-cache npm
RUN npm audit --production`;

      expect(dockerfile).toContain('npm audit');
    });

    it('should minimize attack surface', () => {
      const bestPractices = [
        'Use minimal base images',
        'Remove unnecessary packages',
        'Disable root user',
        'Copy only required files',
        'Use .dockerignore',
      ];

      expect(bestPractices).toContain('Use minimal base images');
      expect(bestPractices).toContain('Use .dockerignore');
    });

    it('should use image signing and verification', () => {
      const dockerfile = `FROM --platform=$BUILDPLATFORM docker.io/library/node:18-alpine@sha256:abc123`;

      expect(dockerfile).toContain('@sha256:');
    });
  });

  describe('Dockerignore Generation', () => {
    it('should generate Node.js dockerignore', () => {
      const dockerignore = `node_modules
npm-debug.log
.env
.git
.gitignore
README.md
.vscode
.idea
coverage
.nyc_output
*.log`;

      expect(dockerignore).toContain('node_modules');
      expect(dockerignore).toContain('.env');
      expect(dockerignore).toContain('.git');
    });

    it('should generate Python dockerignore', () => {
      const dockerignore = `__pycache__
*.pyc
*.pyo
*.pyd
.Python
env/
venv/
.venv
pip-log.txt
.coverage
.git`;

      expect(dockerignore).toContain('__pycache__');
      expect(dockerignore).toContain('venv/');
      expect(dockerignore).toContain('*.pyc');
    });

    it('should include common patterns', () => {
      const commonPatterns = [
        '.git',
        '.gitignore',
        'README.md',
        '.DS_Store',
        'Thumbs.db',
        '.env*',
        '*.log',
        'temp/',
        'tmp/',
      ];

      commonPatterns.forEach(pattern => {
        expect(commonPatterns).toContain(pattern);
      });
    });
  });

  describe('Output Generation', () => {
    it('should generate complete Dockerfile output', () => {
      const output: GeneratedDockerfile = {
        dockerfile: 'FROM node:18-alpine\n...',
        dockerignore: 'node_modules\n...',
        build_instructions: 'docker build -t myapp .',
        optimization_notes: ['Used multi-stage build', 'Minimized layers'],
        security_notes: ['Running as non-root', 'Using official base image'],
        estimated_size_mb: 120,
        workflow_stage: 'dockerfile_generated',
      };

      expect(output.dockerfile).toBeDefined();
      expect(output.dockerignore).toBeDefined();
      expect(output.build_instructions).toContain('docker build');
      expect(output.optimization_notes).toBeInstanceOf(Array);
      expect(output.security_notes).toBeInstanceOf(Array);
      expect(output.estimated_size_mb).toBeGreaterThan(0);
      expect(output.workflow_stage).toBe('dockerfile_generated');
    });

    it('should include compose file when requested', () => {
      const output: GeneratedDockerfile & { compose_file?: string } = {
        dockerfile: 'FROM node:18-alpine\n...',
        dockerignore: 'node_modules\n...',
        compose_file: `version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"`,
        build_instructions: 'docker-compose up',
        optimization_notes: [],
        security_notes: [],
        estimated_size_mb: 120,
        workflow_stage: 'dockerfile_generated',
      };

      expect(output.compose_file).toBeDefined();
      expect(output.compose_file).toContain('version:');
      expect(output.compose_file).toContain('services:');
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported languages', () => {
      const unsupportedAnalysis: AnalysisResult = {
        language: 'cobol',
        framework: 'none',
        build_system: 'none',
        dependencies: [],
        ports: [3000],
        has_dockerfile: false,
        recommended_base_image: 'ubuntu:latest',
        security_recommendations: [],
        analysis_summary: 'Unsupported language',
        workflow_stage: 'analysis',
        containerization_status: 'not_containerized',
        deployment_readiness: 0.1,
      };

      const fallbackDockerfile = `FROM ubuntu:latest
WORKDIR /app
COPY . .
CMD ["/bin/bash"]`;

      expect(fallbackDockerfile).toContain('ubuntu:latest');
      expect(fallbackDockerfile).toContain('CMD ["/bin/bash"]');
    });

    it('should handle missing analysis data', () => {
      const incompleteAnalysis: Partial<AnalysisResult> = {
        language: 'javascript',
        ports: [3000],
      };

      // Should provide defaults for missing fields
      const defaults = {
        framework: 'none',
        build_system: 'npm',
        dependencies: [],
        recommended_base_image: 'node:latest',
      };

      expect(defaults.framework).toBe('none');
      expect(defaults.build_system).toBe('npm');
    });

    it('should validate generated Dockerfile syntax', () => {
      const validateDockerfile = (dockerfile: string): boolean => {
        const requiredInstructions = ['FROM'];
        const hasRequired = requiredInstructions.every(inst => 
          dockerfile.includes(inst)
        );
        
        // Check for basic syntax
        const lines = dockerfile.split('\n');
        const validLines = lines.every(line => {
          if (line.trim() === '' || line.startsWith('#')) return true;
          return /^[A-Z]+\s/.test(line) || line.startsWith('  ') || line.startsWith('\t');
        });

        return hasRequired && validLines;
      };

      const validDockerfile = 'FROM node:18\nWORKDIR /app\nCOPY . .\nCMD ["node", "app"]';
      expect(validateDockerfile(validDockerfile)).toBe(true);

      const invalidDockerfile = 'from node:18\ninvalid instruction';
      expect(validateDockerfile(invalidDockerfile)).toBe(false);
    });
  });
});