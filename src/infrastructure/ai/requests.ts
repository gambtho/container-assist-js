import type { AnalysisResult } from '../../domain/types/session';

/**
 * Available request templates
 */
export type RequestTemplate =
  | 'dockerfile-generation'
  | 'repository-analysis'
  | 'dockerfile-fix'
  | 'k8s-generation'
  | 'kustomization-generation'
  | 'error-analysis'
  | 'json-repair';

/**
 * Base AI request structure
 */
export type AIRequest = {
  prompt: string;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  model?: string | undefined;
  context?: Record<string, unknown> | undefined;
};

/**
 * Request options for building AI requests
 */
export type RequestOptions = {
  template: RequestTemplate;
  variables?: Record<string, unknown> | undefined;
  sampling?:
    | {
        temperature?: number | undefined;
        maxTokens?: number | undefined;
      }
    | undefined;
  model?: string | undefined;
};

/**
 * Template-specific variable types
 */
export type DockerfileVariables = {
  language: string;
  languageVersion?: string | undefined;
  framework?: string | undefined;
  buildSystemType: string;
  entryPoint: string;
  port: number;
  optimization?: 'size' | 'build-speed' | 'security' | 'balanced' | undefined;
  multistage?: boolean | undefined;
  securityHardening?: boolean | undefined;
  includeHealthcheck?: boolean | undefined;
  baseImage?: string | undefined;
  customInstructions?: string | undefined;
};

export type AnalysisVariables = {
  fileList: string;
  configFiles: string;
  directoryTree: string;
};

export type K8sVariables = {
  appName: string;
  image: string;
  port: number;
  environment: string;
  namespace: string;
  serviceType: string;
  replicas: number;
  ingressEnabled?: boolean;
  ingressHost?: string;
  autoscaling?: boolean;
  minReplicas?: number;
  maxReplicas?: number;
  targetCPU?: number;
};

/**
 * Main request builder function
 */
export function buildAIRequest(options: RequestOptions): AIRequest {
  const template = TEMPLATES[options.template];
  const variables = options.variables ?? {};

  const prompt = renderTemplate(template.prompt, variables);

  return {
    prompt,
    temperature: options.sampling?.temperature ?? template.defaultTemperature,
    maxTokens: options.sampling?.maxTokens ?? template.defaultMaxTokens,
    model: options.model,
    context: {
      template: options.template,
      ...variables,
    },
  };
}

/**
 * Specialized builder functions for common use cases
 */
export function buildDockerfileRequest(
  variables: DockerfileVariables,
  sampling?: { temperature?: number; maxTokens?: number } | undefined,
): AIRequest {
  return buildAIRequest({
    template: 'dockerfile-generation',
    variables,
    sampling,
  });
}

export function buildAnalysisRequest(
  variables: AnalysisVariables,
  sampling?: { temperature?: number; maxTokens?: number } | undefined,
): AIRequest {
  return buildAIRequest({
    template: 'repository-analysis',
    variables,
    sampling,
  });
}

export function buildK8sRequest(
  variables: K8sVariables,
  sampling?: { temperature?: number; maxTokens?: number } | undefined,
): AIRequest {
  return buildAIRequest({
    template: 'k8s-generation',
    variables,
    sampling,
  });
}

export function buildKustomizationRequest(
  variables: {
    appName: string;
    namespace: string;
    environment: string;
    resources: string[];
    commonLabels?: Record<string, string>;
  },
  sampling?: { temperature?: number; maxTokens?: number } | undefined,
): AIRequest {
  return buildAIRequest({
    template: 'kustomization-generation',
    variables,
    sampling,
  });
}

/**
 * Helper to extract variables from analysis result
 */
export function extractDockerfileVariables(analysis: AnalysisResult): DockerfileVariables {
  return {
    language: analysis.language ?? 'unknown',
    languageVersion: analysis.language_version,
    framework: analysis.framework,
    buildSystemType: analysis.build_system?.type ?? 'unknown',
    entryPoint: 'index', // Default entry point since entry_points doesn't exist in schema
    port: analysis.ports?.[0] ?? analysis.required_ports?.[0] ?? 8080,
    optimization: 'balanced',
  };
}

/**
 * Template definitions with defaults
 */
const TEMPLATES = {
  'dockerfile-generation': {
    defaultTemperature: 0.2,
    defaultMaxTokens: 1500,
    prompt: `Generate a production-ready Dockerfile for {{language}}{{#if languageVersion}} {{languageVersion}}{{/if}}{{#if framework}} using {{framework}}{{/if}}.

Build System: {{buildSystemType}}
Entry Point: {{entryPoint}}  
Port: {{port}}

Requirements:
- {{optimization}} optimization
{{#if multistage}}- Multi-stage build{{/if}}
{{#if securityHardening}}- Security hardening{{/if}}
{{#if includeHealthcheck}}- Health check{{/if}}
{{#if baseImage}}- Base image: {{baseImage}}{{/if}}
{{#if customInstructions}}- {{customInstructions}}{{/if}}

Return only the Dockerfile content.`,
  },

  'repository-analysis': {
    defaultTemperature: 0.2,
    defaultMaxTokens: 800,
    prompt: `Analyze this repository and return JSON only.

Files: {{fileList}}
Config Files: {{configFiles}}
Directory Structure: {{directoryTree}}

Return JSON format: {
  "language": "<primary language>",
  "framework": "<framework if any>", 
  "buildSystem": {
    "type": "<npm|gradle|maven|cargo|poetry>",
    "buildFile": "<package.json|build.gradle|pom.xml|Cargo.toml|pyproject.toml>"
  },
  "dependencies": ["<key dependencies>"],
  "ports": [<port numbers>],
  "entryPoint": "<main file>"
}`,
  },

  'dockerfile-fix': {
    defaultTemperature: 0.3,
    defaultMaxTokens: 1000,
    prompt: `Fix this Dockerfile error:

Current Dockerfile:
{{dockerfile}}

Error Message:
{{error_message}}

Requirements:
- Fix the specific error
- Maintain security best practices
- Keep existing functionality

Return only the corrected Dockerfile.`,
  },

  'k8s-generation': {
    defaultTemperature: 0.2,
    defaultMaxTokens: 2000,
    prompt: `Generate Kubernetes manifests for:

Application: {{appName}}
Image: {{image}}
Port: {{port}}
Environment: {{environment}}
Namespace: {{namespace}}
Service Type: {{serviceType}}
Replicas: {{replicas}}
{{#if ingressEnabled}}Ingress Host: {{ingressHost}}{{/if}}
{{#if autoscaling}}Autoscaling: {{minReplicas}}-{{maxReplicas}} replicas at {{targetCPU}}% CPU{{/if}}

Return complete YAML manifests (Deployment, Service{{#if ingressEnabled}}, Ingress{{/if}}{{#if autoscaling}}, HPA{{/if}}).`,
  },

  'kustomization-generation': {
    defaultTemperature: 0.2,
    defaultMaxTokens: 600,
    prompt: `Generate a Kustomization manifest for:

Application: {{appName}}
Namespace: {{namespace}}
Environment: {{environment}}
Resource Files: {{#each resources}}{{this}}, {{/each}}

{{#if commonLabels}}Common Labels:
{{#each commonLabels}}{{@key}}: {{this}}
{{/each}}{{/if}}

Generate a production-ready kustomization.yaml that:
- Uses proper Kubernetes resource management
- Includes appropriate namespace and labeling
- Follows Kustomize best practices
- Supports the specified environment

Return only the YAML content for kustomization.yaml.`,
  },

  'error-analysis': {
    defaultTemperature: 0.3,
    defaultMaxTokens: 600,
    prompt: `Analyze this build error:

Command: {{command}}
Error Output: {{error_output}}
Context: {{build_context}}

Return JSON: {
  "rootCause": "<what caused the error>",
  "fixSteps": ["<step 1>", "<step 2>"],
  "prevention": ["<how to prevent>"]
}`,
  },

  'json-repair': {
    defaultTemperature: 0.1,
    defaultMaxTokens: 500,
    prompt: `Fix this malformed JSON:

{{malformed_content}}

Error: {{error_message}}

Return only valid JSON.`,
  },
} as const;

type EscapeContext = 'yaml' | 'shell' | 'dockerfile' | 'none';

type EscapeHook = (value: string) => string;

const ESCAPE_HOOKS: Record<EscapeContext, EscapeHook> = {
  yaml: (value: string) => {
    // YAML-safe escaping: quote strings with special chars, escape quotes
    if (typeof value !== 'string') return String(value);
    if (/[\n\r\t"'\\:|>{}[\]@`]/.test(value) || value.trim() !== value) {
      return JSON.stringify(value);
    }
    return value;
  },
  shell: (value: string) => {
    // Shell-safe escaping: single quotes and escape embedded quotes
    if (typeof value !== 'string') return String(value);
    return `'${value.replace(/'/g, "'\\''")}'`;
  },
  dockerfile: (value: string) => {
    // Dockerfile-safe: escape quotes and backslashes
    if (typeof value !== 'string') return String(value);
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  },
  none: (value: string) => String(value),
};

/**
 * Security-enhanced template renderer with context-aware escaping
 * Supports dotted paths (user.name), hyphens (build-arg), and pluggable escaping
 */
function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  context: EscapeContext = 'none',
): string {
  // Security validation: reject templates with triple backticks or non-printable chars
  if (template.includes('```')) {
    throw new Error('Template contains prohibited triple backticks');
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(template)) {
    throw new Error('Template contains non-printable characters');
  }

  let result = template;
  const escapeHook = ESCAPE_HOOKS[context];

  // Helper to resolve dotted/hyphenated paths
  const resolveValue = (path: string): unknown => {
    // First try the full path as a key (for hyphenated keys like 'build-arg')
    if (path in variables) {
      return variables[path];
    }

    // For mixed paths like 'app-config.database.host', we need to be smarter
    // Split only on dots first, then handle hyphens within each segment
    const dotParts = path.split('.');
    let value: unknown = variables;

    for (const part of dotParts) {
      if (value && typeof value === 'object') {
        // Try the part directly first (handles hyphenated keys)
        if (part in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return undefined;
        }
      } else {
        return undefined;
      }
    }

    return value;
  };

  // Handle conditional blocks: {{#if variable.path}}content{{/if}}
  result = result.replace(
    /\{\{#if\s+([\w.-]+)\}\}(.*?)\{\{\/if\}\}/gs,
    (_match, varName: string, content) => {
      const value = resolveValue(varName);
      return value && value !== '' ? (content as string) : '';
    },
  );

  // Handle simple variables: {{variable.path}} or {{build-arg}}
  result = result.replace(/\{\{([\w.-]+)\}\}/g, (_match, varName: string) => {
    const value = resolveValue(varName);
    if (value == null) return '';

    const stringValue = String(value);
    // Additional security: strip non-printable chars from output
    // eslint-disable-next-line no-control-regex
    const sanitized = stringValue.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    return escapeHook(sanitized);
  });

  return result.trim();
}

// Export the enhanced template renderer
export { renderTemplate, type EscapeContext };
