/**
 * Workflow State Types Tests
 * 
 * Tests the workflow state type system and validation
 */

import {
  WorkflowMetadataSchema,
  EnhancedWorkflowStateSchema,
  ServiceResponseSchema,
  DockerServiceResponseSchema,
  KubernetesServiceResponseSchema,
  AIServiceResponseSchema,
  isServiceResponse,
  isDockerServiceResponse,
  isKubernetesServiceResponse,
  isAIServiceResponse,
  isWorkflowMetadata,
  safeGetWorkflowState,
  safeGetMetadataField,
  createMockWorkflowMetadata,
  createMockEnhancedWorkflowState,
  type WorkflowMetadata,
  type EnhancedWorkflowState,
  type ServiceResponse,
  type DockerServiceResponse,
  type KubernetesServiceResponse,
  type AIServiceResponse,
} from '../../../src/domain/types/workflow-state';

describe('Workflow State Types', () => {
  describe('WorkflowMetadataSchema', () => {
    it('should validate minimal metadata', () => {
      const metadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
      };

      const result = WorkflowMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should validate full metadata', () => {
      const metadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
        session_id: 'session-123',
        language: 'typescript',
        framework: 'express',
        build_system: 'npm',
        dependencies: ['express', 'typescript'],
        package_manager: 'npm',
        base_image: 'node:18',
        dockerfile_path: './Dockerfile',
        image_tag: 'myapp:latest',
        image_id: 'sha256:abc123',
        build_context: '.',
        namespace: 'production',
        cluster_context: 'prod-cluster',
        deployment_name: 'myapp-deployment',
        service_port: 3000,
        replicas: 3,
        ports: [3000, 8080],
        env_vars: { NODE_ENV: 'production', PORT: '3000' },
        volumes: ['/app/data', '/app/logs'],
        analysis_result: { score: 95 },
        dockerfile_content: 'FROM node:18\nWORKDIR /app',
        build_logs: 'Building image...',
        scan_results: { vulnerabilities: [] },
        manifest_content: 'apiVersion: v1\nkind: Service',
        deployment_status: 'running',
      };

      const result = WorkflowMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should reject invalid metadata', () => {
      const metadata = {
        created_at: 'invalid-date',
        // missing required fields
      };

      const result = WorkflowMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });

    it('should handle optional fields', () => {
      const metadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
        language: 'javascript',
      };

      const result = WorkflowMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('javascript');
        expect(result.data.framework).toBeUndefined();
      }
    });

    it('should validate array fields correctly', () => {
      const metadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
        dependencies: ['dep1', 'dep2'],
        ports: [80, 443, 8080],
        volumes: ['/data', '/logs'],
      };

      const result = WorkflowMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should reject invalid array types', () => {
      const metadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
        dependencies: 'not-an-array',
        ports: ['not-a-number'],
      };

      const result = WorkflowMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('EnhancedWorkflowStateSchema', () => {
    it('should validate minimal workflow state', () => {
      const state = {
        id: 'workflow-123',
        status: 'active',
        current_step: 'analysis',
        steps: ['analysis', 'build'],
        progress: 0.5,
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
        started_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        repo_path: '/path/to/repo',
      };

      const result = EnhancedWorkflowStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('should validate full workflow state', () => {
      const state = {
        id: 'workflow-123',
        status: 'completed',
        current_step: 'deploy',
        steps: ['analysis', 'dockerfile', 'build', 'deploy'],
        progress: 1.0,
        error: undefined,
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          version: '1.0.0',
          language: 'typescript',
        },
        step_results: {
          analysis: { language: 'typescript' },
          build: { image_id: 'sha256:abc123' },
        },
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T01:00:00Z',
        last_activity: '2024-01-01T01:00:00Z',
        repo_path: '/path/to/repo',
        workspace_id: 'workspace-456',
        user_id: 'user-789',
      };

      const result = EnhancedWorkflowStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('should validate status enum values', () => {
      const validStatuses = ['active', 'completed', 'failed', 'paused'];

      for (const status of validStatuses) {
        const state = {
          id: 'workflow-123',
          status,
          current_step: 'analysis',
          steps: ['analysis'],
          progress: 0.0,
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            version: '1.0.0',
          },
          started_at: '2024-01-01T00:00:00Z',
          last_activity: '2024-01-01T00:00:00Z',
          repo_path: '/path/to/repo',
        };

        const result = EnhancedWorkflowStateSchema.safeParse(state);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status values', () => {
      const state = {
        id: 'workflow-123',
        status: 'invalid-status',
        current_step: 'analysis',
        steps: ['analysis'],
        progress: 0.0,
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
        started_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        repo_path: '/path/to/repo',
      };

      const result = EnhancedWorkflowStateSchema.safeParse(state);
      expect(result.success).toBe(false);
    });

    it('should validate progress bounds', () => {
      const createState = (progress: number) => ({
        id: 'workflow-123',
        status: 'active' as const,
        current_step: 'analysis',
        steps: ['analysis'],
        progress,
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
        started_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        repo_path: '/path/to/repo',
      });

      // Valid progress values
      expect(EnhancedWorkflowStateSchema.safeParse(createState(0.0)).success).toBe(true);
      expect(EnhancedWorkflowStateSchema.safeParse(createState(0.5)).success).toBe(true);
      expect(EnhancedWorkflowStateSchema.safeParse(createState(1.0)).success).toBe(true);

      // Invalid progress values
      expect(EnhancedWorkflowStateSchema.safeParse(createState(-0.1)).success).toBe(false);
      expect(EnhancedWorkflowStateSchema.safeParse(createState(1.1)).success).toBe(false);
    });
  });

  describe('ServiceResponseSchema', () => {
    it('should validate basic service response', () => {
      const response = {
        success: true,
        data: 'some data',
      };

      const result = ServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: 'Something went wrong',
      };

      const result = ServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate response with metadata', () => {
      const response = {
        success: true,
        data: { result: 'processed' },
        metadata: { timestamp: '2024-01-01T00:00:00Z', version: '1.0' },
      };

      const result = ServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should require success field', () => {
      const response = {
        data: 'some data',
      };

      const result = ServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('DockerServiceResponseSchema', () => {
    it('should validate build response', () => {
      const response = {
        success: true,
        data: {
          imageId: 'sha256:abc123',
          imageTag: 'myapp:latest',
          buildTime: 120,
          buildLogs: 'Successfully built image',
        },
      };

      const result = DockerServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate container list response', () => {
      const response = {
        success: true,
        data: {
          containers: [
            { id: 'container1', name: 'app' },
            { id: 'container2', name: 'db' },
          ],
        },
      };

      const result = DockerServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: 'Docker daemon not running',
      };

      const result = DockerServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should handle unknown data structure', () => {
      const response = {
        success: true,
        data: { custom: 'structure' },
      };

      const result = DockerServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('KubernetesServiceResponseSchema', () => {
    it('should validate deployment response', () => {
      const response = {
        success: true,
        data: {
          deploymentId: 'deployment-123',
          namespace: 'production',
          status: 'running',
          podCount: 3,
        },
      };

      const result = KubernetesServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate list response', () => {
      const response = {
        success: true,
        data: [
          { name: 'pod1', namespace: 'default', status: 'Running' },
          { name: 'pod2', namespace: 'default', status: 'Pending' },
        ],
      };

      const result = KubernetesServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: 'Cluster not accessible',
      };

      const result = KubernetesServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('AIServiceResponseSchema', () => {
    it('should validate text response', () => {
      const response = {
        success: true,
        data: 'Generated Dockerfile content',
      };

      const result = AIServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate structured response', () => {
      const response = {
        success: true,
        data: {
          content: 'FROM node:18\nWORKDIR /app',
          metadata: { model: 'gpt-4', tokens: 150 },
          insights: { bestPractices: ['multi-stage build'] },
          optimizations: { size: 'reduced by 50%' },
          security: { vulnerabilities: 0 },
          baseImage: 'node:18-alpine',
          buildStrategy: 'multi-stage',
        },
      };

      const result = AIServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: 'AI service unavailable',
      };

      const result = AIServiceResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('Type Guards', () => {
    it('should identify ServiceResponse', () => {
      const validResponse = { success: true, data: 'test' };
      const invalidResponse = { data: 'test' };

      expect(isServiceResponse(validResponse)).toBe(true);
      expect(isServiceResponse(invalidResponse)).toBe(false);
      expect(isServiceResponse(null)).toBe(false);
      expect(isServiceResponse(undefined)).toBe(false);
    });

    it('should identify DockerServiceResponse', () => {
      const validResponse = { success: true, data: { imageId: 'abc123', imageTag: 'test' } };
      const invalidResponse = { success: true };

      expect(isDockerServiceResponse(validResponse)).toBe(true);
      expect(isDockerServiceResponse(invalidResponse)).toBe(true); // Optional data field
      expect(isDockerServiceResponse({ invalid: true })).toBe(false);
    });

    it('should identify KubernetesServiceResponse', () => {
      const validResponse = { success: true, data: { deploymentId: '123', namespace: 'default', status: 'running' } };

      expect(isKubernetesServiceResponse(validResponse)).toBe(true);
      expect(isKubernetesServiceResponse({ success: false, error: 'failed' })).toBe(true);
      expect(isKubernetesServiceResponse({ invalid: true })).toBe(false);
    });

    it('should identify AIServiceResponse', () => {
      const validResponse = { success: true, data: 'AI response' };

      expect(isAIServiceResponse(validResponse)).toBe(true);
      expect(isAIServiceResponse({ success: false, error: 'AI failed' })).toBe(true);
      expect(isAIServiceResponse({ invalid: true })).toBe(false);
    });

    it('should identify WorkflowMetadata', () => {
      const validMetadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
      };
      const invalidMetadata = { created_at: 'invalid' };

      expect(isWorkflowMetadata(validMetadata)).toBe(true);
      expect(isWorkflowMetadata(invalidMetadata)).toBe(false);
    });
  });

  describe('Safe Getters', () => {
    it('should safely get workflow state', () => {
      const validState = {
        id: 'workflow-123',
        status: 'active',
        current_step: 'analysis',
        steps: ['analysis'],
        progress: 0.5,
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          version: '1.0.0',
        },
        started_at: '2024-01-01T00:00:00Z',
        last_activity: '2024-01-01T00:00:00Z',
        repo_path: '/path/to/repo',
      };

      const result = safeGetWorkflowState(validState);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('workflow-123');

      const invalidResult = safeGetWorkflowState({ invalid: 'data' });
      expect(invalidResult).toBeNull();
    });

    it('should safely get metadata fields', () => {
      const metadata: WorkflowMetadata = {
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        version: '1.0.0',
        language: 'typescript',
      };

      expect(safeGetMetadataField(metadata, 'language', 'unknown')).toBe('typescript');
      expect(safeGetMetadataField(metadata, 'framework', 'unknown')).toBe('unknown');
      expect(safeGetMetadataField({}, 'language', 'default')).toBe('default');
      expect(safeGetMetadataField(null, 'language', 'default')).toBe('default');
    });
  });

  describe('Mock Data Creators', () => {
    it('should create mock workflow metadata', () => {
      const metadata = createMockWorkflowMetadata();

      expect(metadata.created_at).toBeDefined();
      expect(metadata.updated_at).toBeDefined();
      expect(metadata.version).toBe('1.0.0');
      expect(isWorkflowMetadata(metadata)).toBe(true);
    });

    it('should create mock workflow metadata with overrides', () => {
      const metadata = createMockWorkflowMetadata({
        language: 'python',
        framework: 'flask',
        session_id: 'test-session',
      });

      expect(metadata.language).toBe('python');
      expect(metadata.framework).toBe('flask');
      expect(metadata.session_id).toBe('test-session');
      expect(metadata.version).toBe('1.0.0'); // Should preserve defaults
    });

    it('should create mock enhanced workflow state', () => {
      const state = createMockEnhancedWorkflowState();

      expect(state.id).toContain('workflow-');
      expect(state.status).toBe('active');
      expect(state.current_step).toBe('analysis');
      expect(state.steps).toEqual(['analysis', 'dockerfile', 'build', 'deploy']);
      expect(state.progress).toBe(0);
      expect(state.repo_path).toBe('/tmp/test-repo');
      expect(isWorkflowMetadata(state.metadata)).toBe(true);
    });

    it('should create mock enhanced workflow state with overrides', () => {
      const state = createMockEnhancedWorkflowState({
        status: 'completed',
        progress: 1.0,
        current_step: 'deploy',
        repo_path: '/custom/path',
        error: undefined,
      });

      expect(state.status).toBe('completed');
      expect(state.progress).toBe(1.0);
      expect(state.current_step).toBe('deploy');
      expect(state.repo_path).toBe('/custom/path');
      expect(state.error).toBeUndefined();
    });

    it('should generate unique IDs for mock states', () => {
      const state1 = createMockEnhancedWorkflowState();
      const state2 = createMockEnhancedWorkflowState();

      expect(state1.id).not.toBe(state2.id);
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle complete workflow lifecycle', () => {
      // Start workflow
      const initialState = createMockEnhancedWorkflowState({
        status: 'active',
        current_step: 'analysis',
        progress: 0,
      });

      expect(safeGetWorkflowState(initialState)).not.toBeNull();

      // Update progress
      const analysisComplete = {
        ...initialState,
        current_step: 'dockerfile',
        progress: 0.25,
        step_results: {
          analysis: { language: 'typescript', framework: 'express' },
        },
      };

      expect(safeGetWorkflowState(analysisComplete)?.progress).toBe(0.25);

      // Complete workflow
      const completed = {
        ...analysisComplete,
        status: 'completed' as const,
        current_step: 'deploy',
        progress: 1.0,
        completed_at: new Date().toISOString(),
      };

      const finalState = safeGetWorkflowState(completed);
      expect(finalState?.status).toBe('completed');
      expect(finalState?.progress).toBe(1.0);
    });

    it('should handle error scenarios', () => {
      const errorState = createMockEnhancedWorkflowState({
        status: 'failed',
        error: 'Docker build failed',
        current_step: 'build',
        progress: 0.5,
      });

      expect(errorState.status).toBe('failed');
      expect(errorState.error).toBe('Docker build failed');

      const parsedState = safeGetWorkflowState(errorState);
      expect(parsedState?.status).toBe('failed');
    });

    it('should handle service response processing', () => {
      const dockerResponse: DockerServiceResponse = {
        success: true,
        data: {
          imageId: 'sha256:abc123',
          imageTag: 'myapp:1.0',
          buildTime: 120,
        },
      };

      expect(isDockerServiceResponse(dockerResponse)).toBe(true);

      const k8sResponse: KubernetesServiceResponse = {
        success: false,
        error: 'Deployment failed: insufficient resources',
      };

      expect(isKubernetesServiceResponse(k8sResponse)).toBe(true);
      expect(k8sResponse.success).toBe(false);
    });
  });
});