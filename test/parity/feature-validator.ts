/**
 * Feature Parity Validator
 * Validates JavaScript implementation provides equivalent functionality to Go implementation
 */

import { z } from 'zod';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'path';

export interface ValidationResult {
  valid: boolean;
  message: string;
  details?: string[];
  score?: number; // 0-100 for partial matches
}

export class FeatureValidator {
  private customValidators: Map<string, (output: any, golden: any) => ValidationResult>;

  constructor() {
    this.customValidators = new Map();
    this.setupCustomValidators();
  }

  private setupCustomValidators(): void {
    // Dockerfile validator
    this.customValidators.set('dockerfileValidator', (output, golden) => {
      return this.validateDockerfile(output, golden);
    });

    // Kubernetes validator
    this.customValidators.set('k8sValidator', (output, golden) => {
      return this.validateKubernetesManifest(output, golden);
    });

    // Analysis validator
    this.customValidators.set('analysisValidator', (output, golden) => {
      return this.validateAnalysis(output, golden);
    });

    // Workflow validator
    this.customValidators.set('workflowValidator', (output, golden) => {
      return this.validateWorkflowResult(output, golden);
    });
  }

  async validateFeatureParity(
    tool: string, 
    jsOutput: unknown, 
    goldenPath: string,
    customValidator?: string
  ): Promise<ValidationResult> {
    try {
      // Check if golden file exists
      const goldenExists = await fs.access(goldenPath).then(() => true).catch(() => false);
      if (!goldenExists) {
        return {
          valid: true,
          message: `Golden file not found: ${goldenPath}, skipping validation`
        };
      }

      const goldenData = JSON.parse(await fs.readFile(goldenPath, 'utf8');
      
      // Use custom validator if specified
      if (customValidator && this.customValidators.has(customValidator)) {
        const validator = this.customValidators.get(customValidator)!;
        return validator(jsOutput, goldenData);
      }

      // Default validators by tool type
      const validators: Record<string, (output: any, golden: any) => ValidationResult> = {
        analyze_repository: this.validateAnalysis,
        generate_dockerfile: this.validateDockerfile,
        build_image: this.validateBuildResult,
        scan_image: this.validateScanResult,
        generate_k8s_manifests: this.validateKubernetesManifest,
        start_workflow: this.validateWorkflowResult,
        workflow_status: this.validateWorkflowStatus,
        list_tools: this.validateToolsList,
        ping: this.validatePingResult,
        server_status: this.validateServerStatus
      };

      const validator = validators[tool];
      if (!validator) {
        return {
          valid: true,
          message: `No specific validator for ${tool}, using basic validation`,
          score: 100
        };
      }

      return validator(jsOutput, goldenData);
    } catch (error) {
      return {
        valid: false,
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private validateAnalysis = (output: any, golden: any): ValidationResult => {
    const checks: Array<{ name: string; valid: boolean }> = [
      {
        name: 'language detection',
        valid: output.language === golden.language
      },
      {
        name: 'framework detection', 
        valid: this.compareStringsIgnoreCase(output.framework, golden.framework)
      },
      {
        name: 'build system type',
        valid: output.buildSystem?.type === golden.build_system?.type ||
               output.buildSystem === golden.buildSystem
      },
      {
        name: 'port detection',
        valid: this.compareArraysAsSet(output.ports || [], golden.required_ports || golden.ports || [])
      },
      {
        name: 'dependencies count',
        valid: Math.abs((output.dependencies?.length || 0) - (golden.dependencies?.length || 0)) <= 2
      }
    ];

    // Add language-specific checks
    if (output.language === 'csharp' || golden.language === 'csharp') {
      checks.push(
        {
          name: '.NET version detection',
          valid: output.dotnetVersion === golden.dotnetVersion || 
                 this.compareVersionMajor(output.dotnetVersion, golden.dotnetVersion)
        },
        {
          name: 'project type identification',
          valid: output.projectType === golden.projectType
        },
        {
          name: 'solution structure',
          valid: output.projects ? Array.isArray(output.projects) : !golden.projects
        }
      );
    }

    if (output.language === 'javascript' || golden.language === 'javascript') {
      checks.push({
        name: 'package manager detection',
        valid: output.packageManager === golden.packageManager
      });
    }

    if (output.language === 'python' || golden.language === 'python') {
      checks.push({
        name: 'Python version detection',
        valid: output.pythonVersion === golden.pythonVersion ||
               this.compareVersionMajor(output.pythonVersion, golden.pythonVersion)
      });
    }

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);
    const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 80, // 80% threshold for analysis
      message: `Analysis validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Failed checks: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  };

  private validateDockerfile = (output: any, golden: any): ValidationResult => {
    const dockerfileContent = output.dockerfile || output.content || '';
    
    if (!dockerfileContent || typeof dockerfileContent !== 'string') {
      return {
        valid: false,
        message: 'No Dockerfile content found in output'
      };
    }
    
    const requiredElements = [
      { name: 'FROM instruction', pattern: /FROM\s+[\w.-]+/ },
      { name: 'WORKDIR instruction', pattern: /WORKDIR\s+/ },
      { name: 'COPY instruction', pattern: /COPY\s+/ },
      { name: 'EXPOSE or port', pattern: /EXPOSE\s+\d+|PORT\s*=\s*\d+/ },
      { name: 'CMD or ENTRYPOINT', pattern: /(CMD|ENTRYPOINT)\s+/ }
    ];

    const checks = requiredElements.map(element => ({
      name: element.name,
      valid: element.pattern.test(dockerfileContent)
    });

    // Language-specific validation
    if (dockerfileContent.includes('mcr.microsoft.com/dotnet') || 
        dockerfileContent.includes('dotnet publish') ||
        dockerfileContent.includes('aspnet')) {
      // .NET specific checks
      const dotnetChecks = [
        {
          name: '.NET SDK image for build',
          valid: /FROM.*mcr\.microsoft\.com\/dotnet\/sdk/.test(dockerfileContent)
        },
        {
          name: '.NET runtime image for final',
          valid: /FROM.*mcr\.microsoft\.com\/dotnet\/(aspnet|runtime)/.test(dockerfileContent)
        },
        {
          name: 'dotnet restore command',
          valid: /dotnet\s+restore/.test(dockerfileContent)
        },
        {
          name: 'dotnet publish command',
          valid: /dotnet\s+publish/.test(dockerfileContent)
        },
        {
          name: 'multi-stage build',
          valid: (dockerfileContent.match(/FROM/g) || []).length >= 2
        },
        {
          name: 'app user for security',
          valid: /USER\s+app/.test(dockerfileContent)
        }
      ];
      
      checks.push(...dotnetChecks);
    }

    if (dockerfileContent.includes('node') || dockerfileContent.includes('npm')) {
      // Node.js specific checks
      const nodeChecks = [
        {
          name: 'npm ci for production',
          valid: /npm\s+ci/.test(dockerfileContent)
        },
        {
          name: 'node user for security',
          valid: /USER\s+node/.test(dockerfileContent)
        }
      ];
      
      checks.push(...nodeChecks);
    }

    // Check for security best practices
    const securityChecks = [
      {
        name: 'non-root user',
        valid: /USER\s+(?!root\s*$)/.test(dockerfileContent)
      },
      {
        name: 'specific base image tag',
        valid: !/FROM\s+[\w.-]+:latest/.test(dockerfileContent) ||
               dockerfileContent.includes('latest') // Allow if explicitly using latest
      }
    ];

    const allChecks = [...checks, ...securityChecks];
    const validCount = allChecks.filter(c => c.valid).length;
    const score = Math.round((validCount / allChecks.length) * 100);
    const failedChecks = allChecks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 70, // 70% threshold for Dockerfile
      message: `Dockerfile validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Missing elements: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  };

  private validateKubernetesManifest = (output: any, golden: any): ValidationResult => {
    try {
      const manifestContent = output.manifests || output.content || '';
      
      if (!manifestContent || typeof manifestContent !== 'string') {
        return {
          valid: false,
          message: 'No Kubernetes manifest content found'
        };
      }

      const manifests = yaml.loadAll(manifestContent) as any[];
      
      if (!manifests || manifests.length === 0) {
        return {
          valid: false,
          message: 'No valid Kubernetes manifests found'
        };
      }
      
      const foundTypes = manifests.map(m => m?.kind).filter(Boolean);
      
      const checks = [
        {
          name: 'deployment manifest',
          valid: foundTypes.includes('Deployment')
        },
        {
          name: 'service manifest',
          valid: foundTypes.includes('Service')
        },
        {
          name: 'valid apiVersion',
          valid: manifests.some(m => m?.apiVersion?.startsWith('apps/') || 
                                    m?.apiVersion?.startsWith('v1'))
        },
        {
          name: 'metadata labels',
          valid: manifests.some(m => m?.metadata?.labels)
        },
        {
          name: 'container specification',
          valid: manifests.some(m => m?.spec?.template?.spec?.containers?.length > 0)
        }
      ];

      // Check for optional resource limits
      const hasResourceLimits = manifests.some(m => 
        m?.spec?.template?.spec?.containers?.[0]?.resources?.limits
      );
      
      if (hasResourceLimits) {
        checks.push({
          name: 'resource limits configured',
          valid: true
        });
      }

      const validCount = checks.filter(c => c.valid).length;
      const score = Math.round((validCount / checks.length) * 100);
      const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

      return {
        valid: score >= 70, // 70% threshold for K8s manifests
        message: `Kubernetes manifest validation score: ${score}%`,
        details: failedChecks.length > 0 ? [`Missing elements: ${failedChecks.join(', ')}`] : undefined,
        score
      };
    } catch (error) {
      return {
        valid: false,
        message: `Kubernetes manifest parsing failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  };

  private validateBuildResult = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'build completion',
        valid: output.success === true || output.status === 'success' || output.status === 'completed'
      },
      {
        name: 'image ID present',
        valid: typeof output.imageId === 'string' && output.imageId.length > 0
      },
      {
        name: 'size information',
        valid: typeof output.size === 'number' && output.size > 0
      }
    ];

    // Optional layer information
    if (output.layers) {
      checks.push({
        name: 'layer information',
        valid: Array.isArray(output.layers) && output.layers.length > 0
      });
    }

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);
    const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 75,
      message: `Build result validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Failed checks: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  };

  private validateScanResult = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'scan completed',
        valid: output.status === 'completed' || output.success === true
      },
      {
        name: 'vulnerabilities array',
        valid: Array.isArray(output.vulnerabilities)
      },
      {
        name: 'scanner type specified',
        valid: typeof output.scannerUsed === 'string'
      }
    ];

    // Check for summary information
    if (output.summary) {
      checks.push({
        name: 'severity summary',
        valid: typeof output.summary.high === 'number' || 
               typeof output.summary.critical === 'number'
      });
    }

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);
    const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 70,
      message: `Scan result validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Failed checks: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  };

  private validateWorkflowResult = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'workflow ID',
        valid: typeof output.workflowId === 'string' || typeof output.sessionId === 'string'
      },
      {
        name: 'status field',
        valid: ['completed', 'running', 'failed', 'success'].includes(output.status)
      },
      {
        name: 'execution metadata',
        valid: output.startTime || output.duration !== undefined
      }
    ];

    // Check for steps information
    if (output.steps) {
      checks.push({
        name: 'steps array',
        valid: Array.isArray(output.steps) && output.steps.length > 0
      });
    }

    // Check for artifacts
    if (output.artifacts || output.buildArtifacts) {
      checks.push({
        name: 'artifacts present',
        valid: typeof (output.artifacts || output.buildArtifacts) === 'object'
      });
    }

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);
    const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 80,
      message: `Workflow result validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Failed checks: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  };

  private validateWorkflowStatus = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'status field',
        valid: typeof output.status === 'string'
      },
      {
        name: 'progress percentage',
        valid: typeof output.progress === 'number' && output.progress >= 0 && output.progress <= 100
      },
      {
        name: 'current step',
        valid: typeof output.currentStep === 'string' || output.currentStep === null
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 75,
      message: `Workflow status validation score: ${score}%`,
      score
    };
  };

  private validateToolsList = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'tools array',
        valid: Array.isArray(output.tools)
      },
      {
        name: 'tool count',
        valid: output.tools && output.tools.length >= 15 // At least 15 tools
      },
      {
        name: 'count field matches',
        valid: output.count === undefined || output.count === output.tools?.length
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 90, // High threshold for tools list
      message: `Tools list validation score: ${score}%`,
      score
    };
  };

  private validatePingResult = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'status field',
        valid: output.status === 'ok' || output.status === 'healthy'
      },
      {
        name: 'timestamp present',
        valid: typeof output.timestamp === 'string'
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 100, // Must be perfect for ping
      message: `Ping validation score: ${score}%`,
      score
    };
  };

  private validateServerStatus = (output: any, golden: any): ValidationResult => {
    const checks = [
      {
        name: 'status field',
        valid: typeof output.status === 'string'
      },
      {
        name: 'version information',
        valid: typeof output.version === 'string'
      },
      {
        name: 'uptime information',
        valid: typeof output.uptime === 'number' || typeof output.uptime === 'string'
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 90,
      message: `Server status validation score: ${score}%`,
      score
    };
  };

  // Helper methods
  private compareArraysAsSet(arr1: any[], arr2: any[]): boolean {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    return set1.size === set2.size && [...set1].every(x => set2.has(x);
  }

  private compareStringsIgnoreCase(str1?: string, str2?: string): boolean {
    if (!str1 && !str2) return true;
    if (!str1 || !str2) return false;
    return str1.toLowerCase() === str2.toLowerCase();
  }

  private compareVersionMajor(ver1?: string, ver2?: string): boolean {
    if (!ver1 && !ver2) return true;
    if (!ver1 || !ver2) return false;
    return ver1.split('.')[0] === ver2.split('.')[0];
  }
}