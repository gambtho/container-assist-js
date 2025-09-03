import { TaskType } from '../strategies/sampling-strategy.js';

export interface PromptTemplate {
  system: string;
  user: string;
  maxTokens: number;
  taskType: TaskType;
  description?: string;
  version?: string;
}

export interface FilledPrompt extends PromptTemplate {
  system: string;
  user: string;
}

export class PromptTemplates {
  private static templates = new Map<string, PromptTemplate>();
  private static templateVersions = new Map<string, string>();

  static {
    // Initialize core templates with optimized prompts
    this.registerTemplate('dockerfile_generation', {
      system:
        'Generate optimized Dockerfile. Focus: security, size, build speed. Use multi-stage builds, minimal base images, proper layer caching.',
      user: 'App: {appType}, Lang: {language}, Deps: {dependencies}, Port: {port}',
      maxTokens: 2000,
      taskType: TaskType.CODE_GENERATION,
      description: 'Generates secure, optimized Dockerfiles',
      version: '1.0'
    });

    this.registerTemplate('dockerfile_optimization', {
      system:
        'Optimize existing Dockerfile. Reduce size, improve security, enhance build speed. Suggest specific improvements.',
      user: 'Current Dockerfile:\n{dockerfile}\n\nContext: {context}',
      maxTokens: 1800,
      taskType: TaskType.OPTIMIZATION,
      description: 'Optimizes existing Dockerfiles',
      version: '1.0'
    });

    this.registerTemplate('error_analysis', {
      system: 'Diagnose error. Provide: cause, solution, prevention steps.',
      user: 'Error: {error}\nContext: {context}\nStack: {stack}',
      maxTokens: 1500,
      taskType: TaskType.ERROR_DIAGNOSIS,
      description: 'Diagnoses and provides solutions for errors',
      version: '1.0'
    });

    this.registerTemplate('repository_analysis', {
      system:
        'Analyze repository structure. Identify: architecture, dependencies, containerization opportunities.',
      user: 'Path: {path}\nFiles: {files}\nStructure: {structure}',
      maxTokens: 2500,
      taskType: TaskType.ANALYSIS,
      description: 'Analyzes repository for containerization',
      version: '1.0'
    });

    this.registerTemplate('kubernetes_manifest', {
      system:
        'Generate K8s manifests. Include: deployment, service, configmap. Follow best practices.',
      user: 'Image: {image}\nPorts: {ports}\nEnv: {environment}\nResources: {resources}',
      maxTokens: 3000,
      taskType: TaskType.CODE_GENERATION,
      description: 'Generates Kubernetes deployment manifests',
      version: '1.0'
    });

    this.registerTemplate('security_analysis', {
      system:
        'Security analysis for containers. Check: vulnerabilities, configurations, best practices.',
      user: 'Image: {image}\nScan: {scanResults}\nConfig: {config}',
      maxTokens: 2000,
      taskType: TaskType.ANALYSIS,
      description: 'Analyzes container security',
      version: '1.0'
    });

    this.registerTemplate('dependency_analysis', {
      system:
        'Analyze dependencies. Identify: versions, vulnerabilities, optimization opportunities.',
      user: 'Package file: {packageFile}\nDeps: {dependencies}\nType: {packageManager}',
      maxTokens: 1800,
      taskType: TaskType.ANALYSIS,
      description: 'Analyzes project dependencies',
      version: '1.0'
    });

    this.registerTemplate('base_image_recommendation', {
      system: 'Recommend optimal base image. Consider: size, security, functionality.',
      user: 'App type: {appType}\nLanguage: {language}\nRequirements: {requirements}',
      maxTokens: 1200,
      taskType: TaskType.OPTIMIZATION,
      description: 'Recommends optimal base images',
      version: '1.0'
    });

    this.registerTemplate('docker_compose_generation', {
      system:
        'Generate docker-compose.yml. Include: services, networks, volumes. Production-ready config.',
      user: 'Services: {services}\nEnvironment: {environment}\nRequirements: {requirements}',
      maxTokens: 2500,
      taskType: TaskType.CODE_GENERATION,
      description: 'Generates Docker Compose configurations',
      version: '1.0'
    });

    this.registerTemplate('performance_optimization', {
      system:
        'Optimize container performance. Focus: resource usage, startup time, runtime efficiency.',
      user: 'Current config: {config}\nMetrics: {metrics}\nConstraints: {constraints}',
      maxTokens: 2000,
      taskType: TaskType.OPTIMIZATION,
      description: 'Optimizes container performance',
      version: '1.0'
    });

    this.registerTemplate('ci_cd_integration', {
      system:
        'Generate CI/CD pipeline config. Include: build, test, deploy stages. Security scanning.',
      user: 'Platform: {platform}\nRepo: {repository}\nDeployment: {deployment}',
      maxTokens: 2800,
      taskType: TaskType.CODE_GENERATION,
      description: 'Generates CI/CD pipeline configurations',
      version: '1.0'
    });

    this.registerTemplate('troubleshooting', {
      system:
        'Troubleshoot container issues. Provide: diagnosis steps, solutions, monitoring suggestions.',
      user: 'Issue: {issue}\nLogs: {logs}\nEnvironment: {environment}',
      maxTokens: 1800,
      taskType: TaskType.ERROR_DIAGNOSIS,
      description: 'Troubleshoots container issues',
      version: '1.0'
    });

    this.registerTemplate('migration_plan', {
      system:
        'Create containerization migration plan. Include: phases, risks, timeline, resources.',
      user: 'Current: {currentArchitecture}\nTarget: {targetArchitecture}\nConstraints: {constraints}',
      maxTokens: 3000,
      taskType: TaskType.ANALYSIS,
      description: 'Creates migration plans to containers',
      version: '1.0'
    });

    this.registerTemplate('health_check_generation', {
      system:
        'Generate health checks for containers. Include: readiness, liveness, startup probes.',
      user: 'Service: {service}\nEndpoints: {endpoints}\nType: {applicationType}',
      maxTokens: 1500,
      taskType: TaskType.CODE_GENERATION,
      description: 'Generates container health checks',
      version: '1.0'
    });

    this.registerTemplate('resource_optimization', {
      system: 'Optimize resource allocation. Balance: performance, cost, efficiency.',
      user: 'Current: {currentResources}\nUsage: {usageMetrics}\nTarget: {targetMetrics}',
      maxTokens: 1600,
      taskType: TaskType.OPTIMIZATION,
      description: 'Optimizes container resource allocation',
      version: '1.0'
    });
  }

  static registerTemplate(name: string, template: PromptTemplate): void {
    // Validate template before registration
    if (!template.system.trim() || !template.user.trim()) {
      throw new Error(`Template '${name}' must have non-empty system and user prompts`);
    }

    if (template.maxTokens < 500 ?? template.maxTokens > 8000) {
      throw new Error(`Template '${name}' maxTokens must be between 500 and 8000`);
    }

    this.templates.set(name, template);
    this.templateVersions.set(name, template.version ?? '1.0');
  }

  static get(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  static fill(templateName: string, variables: Record<string, any> = {}): FilledPrompt {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(
        `Template '${templateName}' not found. Available: ${Array.from(this.templates.keys()).join(', ')}`
      );
    }

    return {
      ...template,
      system: this.replaceVariables(template.system, variables),
      user: this.replaceVariables(template.user, variables)
    };
  }

  private static replaceVariables(template: string, vars: Record<string, any>): string {
    let result = template;

    // Replace variables in {variable} format
    Object.entries(vars).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      const replacement = this.formatValue(value);
      result = result.replace(new RegExp(placeholder, 'g'), replacement);
    });

    // Clean up any unfilled placeholders (optional variables)
    result = result.replace(/\{[^}]+\}/g, '[not provided]');

    // Clean up multiple spaces and normalize whitespace
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  private static formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '[not provided]';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[none]';
      return value.slice(0, 10).join(', ') + (value.length > 10 ? '...' : '');
    }

    if (typeof value === 'object') {
      // For objects, provide a compact representation
      const objValue = value as Record<string, unknown>;
      const keys = Object.keys(objValue);
      if (keys.length === 0) return '[empty]';

      if (keys.length <= 5) {
        return JSON.stringify(objValue, null, 0);
      } else {
        const sample: Record<string, any> = {};
        keys.slice(0, 3).forEach((key) => (sample[key] = objValue[key]));
        return JSON.stringify(sample, null, 0).replace('}', `, ...${keys.length - 3} more}`);
      }
    }

    if (typeof value === 'string') {
      // Truncate very long strings
      if (value.length > 500) {
        return `${value.substring(0, 500)}...[truncated]`;
      }
      return value;
    }

    return String(value);
  }

  // Get all available template names
  static getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys()).sort();
  }

  // Get templates by task type
  static getTemplatesByTaskType(taskType: TaskType): string[] {
    return Array.from(this.templates.entries())
      .filter(([_, template]) => template.taskType === taskType)
      .map(([name]) => name);
  }

  // Search templates by keywords
  static searchTemplates(keywords: string[]): string[] {
    const keywordLower = keywords.map((k) => k.toLowerCase());

    return Array.from(this.templates.entries())
      .filter(([name, template]) => {
        const searchText =
          `${name} ${template.description ?? ''} ${template.system} ${template.user}`.toLowerCase();
        return keywordLower.some((keyword) => searchText.includes(keyword));
      })
      .map(([name]) => name);
  }

  // Get template metadata
  static getTemplateInfo(name: string): TemplateInfo | undefined {
    const template = this.templates.get(name);
    if (!template) return undefined;

    return {
      name,
      description: template.description ?? 'No description',
      taskType: template.taskType,
      maxTokens: template.maxTokens,
      version: this.templateVersions.get(name) || '1.0',
      variables: this.extractVariables(template),
      estimatedInputTokens: this.estimateTemplateTokens(template)
    };
  }

  private static extractVariables(template: PromptTemplate): string[] {
    const variables = new Set<string>();
    const regex = /\{([^}]+)\}/g;
    let match;

    // Extract from system prompt
    while ((match = regex.exec(template.system)) !== null) {
      if (match[1]) variables.add(match[1]);
    }

    // Reset regex and extract from user prompt
    regex.lastIndex = 0;
    while ((match = regex.exec(template.user)) !== null) {
      if (match[1]) variables.add(match[1]);
    }

    return Array.from(variables).sort();
  }

  private static estimateTemplateTokens(template: PromptTemplate): number {
    // Rough estimation of tokens for the template itself (without variable values)
    const baseText = `${template.system} ${template.user}`;
    return Math.ceil(baseText.length / 4);
  }

  // Validate template variables
  static validateVariables(templateName: string, variables: Record<string, any>): ValidationResult {
    const template = this.templates.get(templateName);
    if (!template) {
      return {
        valid: false,
        errors: [`Template '${templateName}' not found`],
        warnings: []
      };
    }

    const requiredVars = this.extractVariables(template);
    const providedVars = Object.keys(variables);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for missing variables (warnings, not errors, since we handle unfilled placeholders)
    const missingVars = requiredVars.filter((v) => !(v in variables));
    if (missingVars.length > 0) {
      warnings.push(
        `Missing variables will be filled with '[not provided]': ${missingVars.join(', ')}`
      );
    }

    // Check for extra variables
    const extraVars = providedVars.filter((v) => !requiredVars.includes(v));
    if (extraVars.length > 0) {
      warnings.push(`Extra variables will be ignored: ${extraVars.join(', ')}`);
    }

    // Check for very large variable values
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value === 'string' && value.length > 5000) {
        warnings.push(
          `Variable '${key}' is very large (${value.length} chars), consider truncating`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Update an existing template
  static updateTemplate(name: string, updates: Partial<PromptTemplate>): boolean {
    const existing = this.templates.get(name);
    if (!existing) return false;

    const updated = { ...existing, ...updates };
    this.registerTemplate(name, updated);
    return true;
  }

  // Remove a template
  static removeTemplate(name: string): boolean {
    const removed = this.templates.delete(name);
    if (removed) {
      this.templateVersions.delete(name);
    }
    return removed;
  }

  // Export templates for backup/migration
  static exportTemplates(): Record<string, PromptTemplate> {
    return Object.fromEntries(this.templates);
  }

  // Import templates from backup
  static importTemplates(templates: Record<string, PromptTemplate>): void {
    for (const [name, template] of Object.entries(templates)) {
      this.registerTemplate(name, template);
    }
  }

  // Get template usage statistics (would be populated by the AI service)
  static getTemplateStats(): Map<string, TemplateStats> {
    // This would be populated by the AI service tracking usage
    return new Map();
  }
}

export interface TemplateInfo {
  name: string;
  description: string;
  taskType: TaskType;
  maxTokens: number;
  version: string;
  variables: string[];
  estimatedInputTokens: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TemplateStats {
  usage: number;
  avgTokensUsed: number;
  successRate: number;
  lastUsed: Date;
}
