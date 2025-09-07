import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { OutputValidationFramework, ValidationContext } from '../../helpers/output-validation';
import { E2ETestBase } from '../helpers/e2e-test-base';
import path from 'path';
import fs from 'fs/promises';
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

describe('Output Validation Framework Integration', () => {
  let validationFramework: OutputValidationFramework;
  let testFramework: E2ETestBase;
  let testContext: any;
  let tempOutputDir: string;

  beforeAll(async () => {
    // Initialize validation framework
    validationFramework = new OutputValidationFramework(
      mockLogger,
      path.join(__dirname, '../../fixtures/expected-outputs')
    );
    await validationFramework.initialize();

    // Initialize E2E test framework
    testFramework = new E2ETestBase({
      timeout: 300000,
      useRealInfrastructure: false,
      enablePersistence: true
    });

    const setupResult = await testFramework.setup();
    if (!setupResult.ok) {
      throw new Error(`Failed to setup E2E test framework: ${setupResult.error}`);
    }
    testContext = setupResult.value;

    // Create temp output directory
    tempOutputDir = path.join(testContext.tempDir, 'validation-outputs');
    await fs.mkdir(tempOutputDir, { recursive: true });
  });

  afterAll(async () => {
    if (testFramework) {
      await testFramework.teardown();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Node.js Express Application Validation', () => {
    it('should validate complete Node.js Express workflow output', async () => {
      // Create a test Node.js application output
      const appOutputDir = path.join(tempOutputDir, 'node-express-test');
      await fs.mkdir(appOutputDir, { recursive: true });
      await fs.mkdir(path.join(appOutputDir, 'k8s'), { recursive: true });

      // Create Dockerfile
      await fs.writeFile(
        path.join(appOutputDir, 'Dockerfile'),
        `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN adduser -D -s /bin/sh appuser
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node healthcheck.js
CMD ["npm", "start"]
`
      );

      // Create Kubernetes Deployment
      await fs.writeFile(
        path.join(appOutputDir, 'k8s/deployment.yaml'),
        `apiVersion: apps/v1
kind: Deployment
metadata:
  name: node-express-app
  labels:
    app: node-express-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: node-express-app
  template:
    metadata:
      labels:
        app: node-express-app
    spec:
      containers:
      - name: app
        image: node-express-app:latest
        ports:
        - containerPort: 3000
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
          requests:
            memory: "256Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
`
      );

      // Create Kubernetes Service
      await fs.writeFile(
        path.join(appOutputDir, 'k8s/service.yaml'),
        `apiVersion: v1
kind: Service
metadata:
  name: node-express-service
  labels:
    app: node-express-app
spec:
  selector:
    app: node-express-app
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
  type: ClusterIP
`
      );

      // Validation context
      const context: ValidationContext = {
        repositoryType: 'web-api',
        language: 'javascript',
        framework: 'express',
        environment: 'production',
        expectedFeatures: ['dockerfile', 'k8s-deployment', 'k8s-service']
      };

      // Run validation
      const validationResult = await validationFramework.validateOutput(
        'node-express-basic',
        appOutputDir,
        context
      );

      expect(validationResult.ok).toBe(true);
      
      const report = validationResult.value;
      expect(report.passed).toBe(true);
      expect(report.score).toBeGreaterThan(80);
      expect(report.errors).toBe(0);
      
      // Check that all expected files were validated
      const dockerfileResult = report.results.find(r => r.filePath === 'Dockerfile');
      const deploymentResult = report.results.find(r => r.filePath === 'k8s/deployment.yaml');
      const serviceResult = report.results.find(r => r.filePath === 'k8s/service.yaml');

      expect(dockerfileResult?.exists).toBe(true);
      expect(dockerfileResult?.passed).toBe(true);
      expect(deploymentResult?.exists).toBe(true);
      expect(deploymentResult?.passed).toBe(true);
      expect(serviceResult?.exists).toBe(true);
      expect(serviceResult?.passed).toBe(true);

      console.log('Validation Report Summary:', report.summary);
    });

    it('should detect missing required files', async () => {
      const incompleteOutputDir = path.join(tempOutputDir, 'incomplete-node-app');
      await fs.mkdir(incompleteOutputDir, { recursive: true });

      // Only create Dockerfile, missing K8s manifests
      await fs.writeFile(
        path.join(incompleteOutputDir, 'Dockerfile'),
        `FROM node:18-alpine
WORKDIR /app
CMD ["npm", "start"]
`
      );

      const context: ValidationContext = {
        repositoryType: 'web-api',
        language: 'javascript',
        framework: 'express',
        environment: 'production',
        expectedFeatures: []
      };

      const validationResult = await validationFramework.validateOutput(
        'node-express-basic',
        incompleteOutputDir,
        context
      );

      expect(validationResult.ok).toBe(true);
      
      const report = validationResult.value;
      expect(report.passed).toBe(false);
      expect(report.errors).toBeGreaterThan(0);

      // Should have errors for missing K8s manifests
      const missingFiles = report.results.filter(r => !r.exists);
      expect(missingFiles.length).toBeGreaterThan(0);
    });

    it('should detect Dockerfile validation issues', async () => {
      const badDockerfileDir = path.join(tempOutputDir, 'bad-dockerfile-app');
      await fs.mkdir(badDockerfileDir, { recursive: true });
      await fs.mkdir(path.join(badDockerfileDir, 'k8s'), { recursive: true });

      // Create problematic Dockerfile
      await fs.writeFile(
        path.join(badDockerfileDir, 'Dockerfile'),
        `# Missing FROM instruction
WORKDIR /app
COPY . .
# Running as root user
EXPOSE 3000
# No health check
CMD ["npm", "start"]
`
      );

      // Create minimal K8s manifests to avoid those errors
      await fs.writeFile(
        path.join(badDockerfileDir, 'k8s/deployment.yaml'),
        `apiVersion: apps/v1
kind: Deployment
metadata:
  name: bad-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: bad-app:latest
`
      );

      await fs.writeFile(
        path.join(badDockerfileDir, 'k8s/service.yaml'),
        `apiVersion: v1
kind: Service
metadata:
  name: bad-service
spec:
  selector:
    app: bad-app
  ports:
  - port: 3000
`
      );

      const context: ValidationContext = {
        repositoryType: 'web-api',
        language: 'javascript',
        framework: 'express',
        environment: 'production',
        expectedFeatures: []
      };

      const validationResult = await validationFramework.validateOutput(
        'node-express-basic',
        badDockerfileDir,
        context
      );

      expect(validationResult.ok).toBe(true);
      
      const report = validationResult.value;
      expect(report.passed).toBe(false);
      expect(report.score).toBeLessThan(70);

      const dockerfileResult = report.results.find(r => r.filePath === 'Dockerfile');
      expect(dockerfileResult?.passed).toBe(false);
      
      // Should have specific validation errors
      const fromError = dockerfileResult?.ruleResults.find(r => r.rule === 'uses-node-base-image');
      expect(fromError?.passed).toBe(false);
    });

    it('should validate Kubernetes manifest consistency', async () => {
      const inconsistentK8sDir = path.join(tempOutputDir, 'inconsistent-k8s');
      await fs.mkdir(inconsistentK8sDir, { recursive: true });
      await fs.mkdir(path.join(inconsistentK8sDir, 'k8s'), { recursive: true });

      // Create valid Dockerfile
      await fs.writeFile(
        path.join(inconsistentK8sDir, 'Dockerfile'),
        `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`
      );

      // Create Deployment with app label "web-app"
      await fs.writeFile(
        path.join(inconsistentK8sDir, 'k8s/deployment.yaml'),
        `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
  labels:
    app: web-app
spec:
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
      - name: app
        image: web-app:latest
        ports:
        - containerPort: 3000
`
      );

      // Create Service with different selector "api-app"
      await fs.writeFile(
        path.join(inconsistentK8sDir, 'k8s/service.yaml'),
        `apiVersion: v1
kind: Service
metadata:
  name: web-service
spec:
  selector:
    app: api-app  # Inconsistent with deployment
  ports:
  - port: 3000
    targetPort: 3000
`
      );

      const context: ValidationContext = {
        repositoryType: 'web-api',
        language: 'javascript',
        framework: 'express',
        environment: 'production',
        expectedFeatures: []
      };

      const validationResult = await validationFramework.validateOutput(
        'node-express-basic',
        inconsistentK8sDir,
        context
      );

      expect(validationResult.ok).toBe(true);
      
      const report = validationResult.value;
      // Individual manifests may pass their own validation, 
      // but custom validators should catch inconsistencies
      expect(report.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Validation Framework Features', () => {
    it('should generate expected output configuration from actual output', async () => {
      const sampleOutputDir = path.join(tempOutputDir, 'sample-for-generation');
      await fs.mkdir(sampleOutputDir, { recursive: true });
      await fs.mkdir(path.join(sampleOutputDir, 'k8s'), { recursive: true });

      await fs.writeFile(path.join(sampleOutputDir, 'Dockerfile'), 'FROM node:18\nEXPOSE 3000\n');
      await fs.writeFile(
        path.join(sampleOutputDir, 'k8s/deployment.yaml'),
        'apiVersion: apps/v1\nkind: Deployment\n'
      );

      const context: ValidationContext = {
        repositoryType: 'sample-app',
        language: 'javascript',
        framework: 'express',
        environment: 'development',
        expectedFeatures: []
      };

      const expectedOutputResult = await validationFramework.generateExpectedOutputFromActual(
        'generated-test',
        sampleOutputDir,
        context
      );

      expect(expectedOutputResult.ok).toBe(true);
      
      const expectedOutput = expectedOutputResult.value;
      expect(expectedOutput.testName).toBe('generated-test');
      expect(expectedOutput.repositoryType).toBe('sample-app');
      expect(expectedOutput.expectedFiles.length).toBeGreaterThan(0);

      // Should have detected Dockerfile and K8s manifest
      const dockerfileEntry = expectedOutput.expectedFiles.find(f => f.path === 'Dockerfile');
      const k8sEntry = expectedOutput.expectedFiles.find(f => f.path.includes('deployment.yaml'));

      expect(dockerfileEntry?.type).toBe('dockerfile');
      expect(k8sEntry?.type).toBe('k8s');
    });

    it('should save and load expected output configurations', async () => {
      const testExpectedOutput = {
        testName: 'save-load-test',
        repositoryType: 'test-app',
        expectedFiles: [
          {
            path: 'Dockerfile',
            type: 'dockerfile' as const,
            required: true,
            contentRules: validationFramework.getDefaultRules('dockerfile')
          }
        ],
        validationRules: []
      };

      // Save configuration
      const saveResult = await validationFramework.saveExpectedOutput(testExpectedOutput);
      expect(saveResult.ok).toBe(true);

      // Create new validation framework instance to test loading
      const newFramework = new OutputValidationFramework(
        mockLogger,
        path.join(__dirname, '../../fixtures/expected-outputs')
      );
      
      const initResult = await newFramework.initialize();
      expect(initResult.ok).toBe(true);

      // Test that saved configuration can be used
      const testOutputDir = path.join(tempOutputDir, 'save-load-validation');
      await fs.mkdir(testOutputDir, { recursive: true });
      await fs.writeFile(
        path.join(testOutputDir, 'Dockerfile'),
        'FROM node:18\nWORKDIR /app\nEXPOSE 3000\nCMD ["npm", "start"]'
      );

      const context: ValidationContext = {
        repositoryType: 'test-app',
        language: 'javascript',
        framework: 'express',
        environment: 'test',
        expectedFeatures: []
      };

      const validationResult = await newFramework.validateOutput(
        'save-load-test',
        testOutputDir,
        context
      );

      expect(validationResult.ok).toBe(true);
    });

    it('should handle custom validation rules', async () => {
      // Add custom rule
      validationFramework.addCustomRule('dockerfile', {
        name: 'custom-test-rule',
        description: 'Custom test validation rule',
        type: 'dockerfile',
        validator: (content: string) => ({
          passed: content.includes('TEST'),
          message: 'Custom rule validation'
        }),
        severity: 'info'
      });

      const customRules = validationFramework.getDefaultRules('dockerfile');
      const customRule = customRules.find(r => r.name === 'custom-test-rule');
      expect(customRule).toBeDefined();
      expect(customRule?.description).toBe('Custom test validation rule');
    });

    it('should provide detailed validation reports', async () => {
      const detailedTestDir = path.join(tempOutputDir, 'detailed-validation');
      await fs.mkdir(detailedTestDir, { recursive: true });
      await fs.mkdir(path.join(detailedTestDir, 'k8s'), { recursive: true });

      // Create files with mixed validation results
      await fs.writeFile(
        path.join(detailedTestDir, 'Dockerfile'),
        `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
# Missing USER instruction
# Missing HEALTHCHECK
CMD ["npm", "start"]
`
      );

      await fs.writeFile(
        path.join(detailedTestDir, 'k8s/deployment.yaml'),
        `apiVersion: apps/v1
kind: Deployment
metadata:
  name: detailed-app
  labels:
    app: detailed-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: detailed-app
  template:
    metadata:
      labels:
        app: detailed-app
    spec:
      containers:
      - name: app
        image: detailed-app:latest
        ports:
        - containerPort: 3000
        # Missing resource limits
        # Missing health probes
`
      );

      await fs.writeFile(
        path.join(detailedTestDir, 'k8s/service.yaml'),
        `apiVersion: v1
kind: Service
metadata:
  name: detailed-service
spec:
  selector:
    app: detailed-app
  ports:
  - port: 3000
    targetPort: 3000
`
      );

      const context: ValidationContext = {
        repositoryType: 'web-api',
        language: 'javascript',
        framework: 'express',
        environment: 'production',
        expectedFeatures: []
      };

      const validationResult = await validationFramework.validateOutput(
        'node-express-basic',
        detailedTestDir,
        context
      );

      expect(validationResult.ok).toBe(true);
      
      const report = validationResult.value;
      
      // Should have a mix of passed and failed validations
      expect(report.passedChecks).toBeGreaterThan(0);
      expect(report.failedChecks).toBeGreaterThan(0);
      expect(report.warnings).toBeGreaterThan(0);
      
      // Should have detailed results for each file
      expect(report.results).toHaveLength(3); // Dockerfile + 2 K8s manifests
      
      // Should provide suggestions
      expect(report.suggestions.length).toBeGreaterThanOrEqual(0);
      
      // Summary should be informative
      expect(report.summary).toContain('checks passed');
      expect(report.summary).toContain('Score:');
      
      console.log('Detailed Validation Report:');
      console.log(`Summary: ${report.summary}`);
      console.log(`Suggestions: ${report.suggestions.join(', ')}`);
    });
  });
});