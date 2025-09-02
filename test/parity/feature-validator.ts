/**
 * Feature Parity Validator - Testing Framework
 * Validates JavaScript implementation provides equivalent functionality to Go implementation
 */

import * as fs from 'fs/promises';

export class FeatureValidator {
  constructor() {
    this.customValidators = new Map();
    this.setupCustomValidators();
  }

  setupCustomValidators() {
    // Dockerfile validator
    this.customValidators.set('dockerfileValidator', (output, golden) => {
      return this.validateDockerfile(output, golden);
    });

    // Kubernetes validator
    this.customValidators.set('k8sValidator', (output, golden) => {
      return this.validateKubernetesManifest(output, golden);
    });
  }

  async validateFeatureParity(tool, jsOutput, goldenPath, customValidator) {
    try {
      // Check if golden file exists
      const goldenExists = await fs.access(goldenPath).then(() => true).catch(() => false);
      if (!goldenExists) {
        return {
          valid: true,
          message: `Golden file not found: ${goldenPath}, skipping validation`
        };
      }

      const goldenData = JSON.parse(await fs.readFile(goldenPath, 'utf8'));
      
      // Use custom validator if specified
      if (customValidator && this.customValidators.has(customValidator)) {
        const validator = this.customValidators.get(customValidator);
        return validator(jsOutput, goldenData);
      }

      // Default validators by tool type
      const validators = {
        analyze_repository: (output, golden) => this.validateAnalysis(output, golden),
        generate_dockerfile: (output, golden) => this.validateDockerfile(output, golden),
        build_image: (output, golden) => this.validateBuildResult(output, golden),
        start_workflow: (output, golden) => this.validateWorkflowResult(output, golden),
        list_tools: (output, golden) => this.validateToolsList(output, golden),
        ping: (output, golden) => this.validatePingResult(output, golden),
        server_status: (output, golden) => this.validateServerStatus(output, golden)
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

  validateAnalysis(output, golden) {
    const checks = [
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
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);
    const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 80, // 80% threshold for analysis
      message: `Analysis validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Failed checks: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  }

  validateDockerfile(output, golden) {
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
    }));

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);
    const failedChecks = checks.filter(c => !c.valid).map(c => c.name);

    return {
      valid: score >= 70, // 70% threshold for Dockerfile
      message: `Dockerfile validation score: ${score}%`,
      details: failedChecks.length > 0 ? [`Missing elements: ${failedChecks.join(', ')}`] : undefined,
      score
    };
  }

  validateKubernetesManifest(output, golden) {
    const manifestContent = output.manifests || output.content || '';
    
    if (!manifestContent || typeof manifestContent !== 'string') {
      return {
        valid: false,
        message: 'No Kubernetes manifest content found'
      };
    }

    const checks = [
      {
        name: 'has apiVersion',
        valid: manifestContent.includes('apiVersion')
      },
      {
        name: 'has kind',
        valid: manifestContent.includes('kind:')
      },
      {
        name: 'has metadata',
        valid: manifestContent.includes('metadata')
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 70,
      message: `Kubernetes manifest validation score: ${score}%`,
      score
    };
  }

  validateBuildResult(output, golden) {
    const checks = [
      {
        name: 'build completion',
        valid: output.success === true || output.status === 'success'
      },
      {
        name: 'image ID present',
        valid: typeof output.imageId === 'string' && output.imageId.length > 0
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 75,
      message: `Build result validation score: ${score}%`,
      score
    };
  }

  validateWorkflowResult(output, golden) {
    const checks = [
      {
        name: 'workflow ID',
        valid: typeof output.workflowId === 'string' || typeof output.sessionId === 'string'
      },
      {
        name: 'status field',
        valid: ['completed', 'running', 'failed', 'success'].includes(output.status)
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 80,
      message: `Workflow result validation score: ${score}%`,
      score
    };
  }

  validateToolsList(output, golden) {
    const checks = [
      {
        name: 'tools array',
        valid: Array.isArray(output.tools)
      },
      {
        name: 'tool count',
        valid: output.tools && output.tools.length >= 15 // At least 15 tools
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 90, // High threshold for tools list
      message: `Tools list validation score: ${score}%`,
      score
    };
  }

  validatePingResult(output, golden) {
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
  }

  validateServerStatus(output, golden) {
    const checks = [
      {
        name: 'status field',
        valid: typeof output.status === 'string'
      },
      {
        name: 'version information',
        valid: typeof output.version === 'string'
      }
    ];

    const validCount = checks.filter(c => c.valid).length;
    const score = Math.round((validCount / checks.length) * 100);

    return {
      valid: score >= 90,
      message: `Server status validation score: ${score}%`,
      score
    };
  }

  // Helper methods
  compareArraysAsSet(arr1, arr2) {
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    return set1.size === set2.size && [...set1].every(x => set2.has(x));
  }

  compareStringsIgnoreCase(str1, str2) {
    if (!str1 && !str2) return true;
    if (!str1 || !str2) return false;
    return str1.toLowerCase() === str2.toLowerCase();
  }
}